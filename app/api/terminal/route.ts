
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase";
import { userSandbox } from "@/lib/sandbox";
import {
  assertAccountAccess,
  assertNotMuted,
  hasPanelSession,
  setAccountControl,
} from "@/lib/control";
import {
  enableMaintenance,
  disableMaintenance,
} from "@/lib/maintenance";

export const runtime = "nodejs";
export const maxDuration = 60;

type ControlAction =
  | "ban"
  | "unban"
  | "jail"
  | "unjail"
  | "mute"
  | "unmute";

type ControlCommand = {
  action: ControlAction;
  email: string;
  duration?: string;
};

function parseControlCommand(
  command: string
): ControlCommand | null {
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

  const needsDuration =
    action === "ban" || action === "jail";

  if (needsDuration && parts.length !== 3) {
    throw new Error(
      `Durasi wajib diisi. Contoh: /${action} ${email} 1h`
    );
  }

  if (!needsDuration && parts.length !== 2) {
    throw new Error(
      `Command /${action} tidak membutuhkan durasi.`
    );
  }

  const duration = parts[2];

  if (
    duration &&
    !/^([1-9]\d*)([hd])$/i.test(duration)
  ) {
    throw new Error(
      "Format durasi harus menggunakan h atau d. Contoh: 1h atau 7d."
    );
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

  if (!message) {
    throw new Error("Pesan maintenance tidak boleh kosong.");
  }

  if (message.length > 500) {
    throw new Error("Pesan maksimal 500 karakter.");
  }

  const durationMatch = duration.match(/^([1-9]\d*)([hd])$/i);

  if (!durationMatch) {
    throw new Error("Durasi tidak valid.");
  }

  const amount = Number(durationMatch[1]);
  const unit = durationMatch[2].toLowerCase();

  const hours = unit === "h" ? amount : amount * 24;

  if (hours > 365 * 24) {
    throw new Error("Durasi maksimal 365 hari.");
  }

  return { message, duration };
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const body = await req.json();
    const command = String(body.command || "").trim();

    if (!command) {
      return NextResponse.json(
        {
          stdout: "",
          stderr: "Command tidak boleh kosong.",
          exitCode: 1,
        },
        { status: 400 }
      );
    }

    if (command.length > 4000) {
      return NextResponse.json(
        {
          stdout: "",
          stderr: "Command terlalu panjang. Maksimal 4000 karakter.",
          exitCode: 1,
        },
        { status: 400 }
      );
    }

    // =====================================
    // GLOBAL MAINTENANCE ON
    // =====================================
    if (/^\/maintance(?:\s|$)/i.test(command)) {
      const allowed = await hasPanelSession();

      if (!allowed) {
        return NextResponse.json(
          {
            stdout: "",
            stderr: "Akses ditolak. Admin panel session diperlukan.",
            exitCode: 1,
          },
          { status: 403 }
        );
      }

      const { message, duration } =
        parseMaintenanceCommand(command);

      await enableMaintenance(message, duration);

      return NextResponse.json({
        stdout:
          "GLOBAL MAINTENANCE BERHASIL DIAKTIFKAN\n" +
          `Pesan: ${message}\n` +
          `Durasi: ${duration}\n` +
          "Website sekarang menampilkan halaman maintenance.",
        stderr: "",
        exitCode: 0,
      });
    }

    // =====================================
    // GLOBAL MAINTENANCE OFF
    // =====================================
    if (/^\/unmaintance$/i.test(command)) {
      const allowed = await hasPanelSession();

      if (!allowed) {
        return NextResponse.json(
          {
            stdout: "",
            stderr: "Akses ditolak. Admin panel session diperlukan.",
            exitCode: 1,
          },
          { status: 403 }
        );
      }

      await disableMaintenance();

      return NextResponse.json({
        stdout:
          "GLOBAL MAINTENANCE BERHASIL DINONAKTIFKAN\n" +
          "Website kembali normal.",
        stderr: "",
        exitCode: 0,
      });
    }

    // =====================================
    // ACCOUNT MODERATION COMMANDS
    // =====================================
    const control = parseControlCommand(command);

    if (control !== null) {
      const allowed = await hasPanelSession();

      if (!allowed) {
        return NextResponse.json(
          {
            stdout: "",
            stderr: "Akses ditolak. Admin panel session diperlukan.",
            exitCode: 1,
          },
          { status: 403 }
        );
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
          `Expires: ${result.expires_at || "Never"}`,
        stderr: "",
        exitCode: 0,
      });
    }

    // =====================================
    // NORMAL LINUX TERMINAL
    // =====================================
    await assertAccountAccess(user.id);
    await assertNotMuted(user.id);

    const sbx = await userSandbox(user.id);

    const result = await sbx.runCommand({
      cmd: "bash",
      args: [
        "-lc",
        "cd /vercel/sandbox && " + command,
      ],
      timeoutMs: 50_000,
    });

    return NextResponse.json({
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      exitCode: result.exitCode ?? 0,
    });
  } catch (error: any) {
    const message =
      error?.message || "Terjadi kesalahan pada terminal.";

    const status =
      message.includes("UNAUTHORIZED") ||
      message.toLowerCase().includes("login")
        ? 401
        : message.includes("ACCOUNT_BANNED")
          ? 403
          : 500;

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
  
