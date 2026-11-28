
import { NextResponse } from "next/server";
import path from "node:path";
import { requireUser } from "@/lib/supabase";
import { userSandbox, safePath } from "@/lib/sandbox";
import {
  assertAccountAccess,
  assertNotMuted,
  hasPanelSession,
  setAccountControl,
} from "@/lib/control";
import {
  enableMaintenance,
  disableMaintenance,
  getMaintenanceState,
} from "@/lib/maintenance";

export const runtime = "nodejs";
export const maxDuration = 60;

const WORKSPACE = "/home/barateriminal";

type ControlAction =
  | "ban"
  | "unban"
  | "jail"
  | "unjail"
  | "mute"
  | "unmute";

function parseControlCommand(command: string) {
  const parts = command.trim().split(/\s+/);
  const match = parts[0]?.match(
    /^\/(ban|unban|jail|unjail|mute|unmute)$/i
  );

  if (!match) return null;

  const action = match[1].toLowerCase() as ControlAction;

  if (parts.length < 2 || parts.length > 3) {
    throw new Error(
      "Format: /ban email@gmail.com 1h atau /unban email@gmail.com"
    );
  }

  const email = parts[1].toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Format email tidak valid.");
  }

  const needsDuration = action === "ban" || action === "jail";

  if (needsDuration && parts.length !== 3) {
    throw new Error(`Durasi wajib diisi. Contoh: /${action} ${email} 1h`);
  }

  if (!needsDuration && parts.length !== 2) {
    throw new Error(`Command /${action} tidak membutuhkan durasi.`);
  }

  const duration = parts[2];

  if (duration && !/^([1-9]\d*)([hd])$/i.test(duration)) {
    throw new Error("Durasi harus menggunakan h atau d.");
  }

  return { action, email, duration };
}

function parseMaintenanceCommand(command: string) {
  const match = command.match(
    /^\/maintance\s+(.+?)\s+([1-9]\d*[hd])$/i
  );

  if (!match) {
    throw new Error(
      "Format: /maintance PESAN 1h atau /maintance PESAN 2d"
    );
  }

  const message = match[1].trim();
  const duration = match[2].toLowerCase();

  if (!message || message.length > 500) {
    throw new Error("Pesan maintenance harus 1–500 karakter.");
  }

  const amount = Number(duration.slice(0, -1));
  const unit = duration.slice(-1);
  const hours = unit === "h" ? amount : amount * 24;

  if (!Number.isSafeInteger(amount) || hours > 365 * 24) {
    throw new Error("Durasi maksimal maintenance adalah 365 hari.");
  }

  return { message, duration };
}

function resolveCwd(current: string, requested: string) {
  const base = safePath(current || WORKSPACE);

  const destination =
    requested === "~" || requested === ""
      ? WORKSPACE
      : path.posix.resolve(base, requested);

  const safe = safePath(destination);

  return safe;
}

function shellQuote(value: string) {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();

    const command = String(body.command || "").trim();
    const cwd = safePath(String(body.cwd || WORKSPACE));

    if (!command) {
      return NextResponse.json({
        stdout: "",
        stderr: "Command tidak boleh kosong.",
        exitCode: 1,
        cwd,
      });
    }

    if (command.length > 4000) {
      throw new Error("Command maksimal 4000 karakter.");
    }

    // MAINTENANCE ON
    if (/^\/maintance(?:\s|$)/i.test(command)) {
      if (!(await hasPanelSession())) {
        throw new Error("Akses ditolak. Admin panel session diperlukan.");
      }

      const { message, duration } = parseMaintenanceCommand(command);

      await enableMaintenance(message, duration);

      const maintenance = await getMaintenanceState();

      return NextResponse.json({
        stdout:
          "GLOBAL MAINTENANCE BERHASIL DIAKTIFKAN\n" +
          `Pesan: ${message}\nDurasi: ${duration}\n`,
        stderr: "",
        exitCode: 0,
        cwd,
        maintenance,
      });
    }

    // MAINTENANCE OFF
    if (/^\/unmaintance$/i.test(command)) {
      if (!(await hasPanelSession())) {
        throw new Error("Akses ditolak. Admin panel session diperlukan.");
      }

      await disableMaintenance();

      const maintenance = await getMaintenanceState();

      return NextResponse.json({
        stdout: "GLOBAL MAINTENANCE DINONAKTIFKAN\n",
        stderr: "",
        exitCode: 0,
        cwd,
        maintenance,
      });
    }

    // ACCOUNT MODERATION
    const control = parseControlCommand(command);

    if (control) {
      if (!(await hasPanelSession())) {
        throw new Error("Akses ditolak. Admin panel session diperlukan.");
      }

      const result = await setAccountControl(
        control.email,
        control.action,
        control.duration
      );

      return NextResponse.json({
        stdout:
          `ACCOUNT CONTROL SUCCESS\n` +
          `Email: ${result.email}\n` +
          `Action: ${control.action}\n` +
          `Status: ${result.status}\n` +
          `Muted: ${result.muted}\n` +
          `Expires: ${result.expires_at || "Never"}\n`,
        stderr: "",
        exitCode: 0,
        cwd,
      });
    }

    // LINUX
    await assertAccountAccess(user.id);
    await assertNotMuted(user.id);

    const sbx = await userSandbox(user.id);

    // CD: simpan direktori kerja untuk request berikutnya.
    const cdMatch = command.match(/^cd(?:\s+(.+))?$/);

    if (cdMatch) {
      let requested = (cdMatch[1] || "~").trim();

      if (
        (requested.startsWith('"') && requested.endsWith('"')) ||
        (requested.startsWith("'") && requested.endsWith("'"))
      ) {
        requested = requested.slice(1, -1);
      }

      const nextCwd = resolveCwd(cwd, requested);

      const check = await sbx.runCommand({
        cmd: "test",
        args: ["-d", nextCwd],
        timeoutMs: 10000,
      });

      if (check.exitCode !== 0) {
        return NextResponse.json({
          stdout: "",
          stderr: `cd: ${requested}: No such directory`,
          exitCode: 1,
          cwd,
        });
      }

      return NextResponse.json({
        stdout: "",
        stderr: "",
        exitCode: 0,
        cwd: nextCwd,
      });
    }

    // Semua command dijalankan dari cwd terakhir.
    const result = await sbx.runCommand({
      cmd: "bash",
      args: [
        "-lc",
        `cd ${shellQuote(cwd)} && ${command}`,
      ],
      timeoutMs: 50000,
    });

    return NextResponse.json({
      stdout: await result.stdout(),
      stderr: await result.stderr(),
      exitCode: result.exitCode ?? 0,
      cwd,
    });
  } catch (error: any) {
    const message = error?.message || "Terminal error.";

    const status =
      message.includes("UNAUTHORIZED") ? 401 :
      message.includes("ACCOUNT_BANNED") ||
      message.includes("ACCOUNT_JAILED") ? 403 :
      message.includes("Akses ditolak") ? 403 : 500;

    return NextResponse.json(
      {
        stdout: "",
        stderr: message,
        exitCode: 1,
      },
      { status }
    );
  }
}
