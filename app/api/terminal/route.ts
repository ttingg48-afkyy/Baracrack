
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase";
import { userSandbox } from "@/lib/sandbox";
import {
  assertAccountAccess,
  assertNotMuted,
  hasPanelSession,
  setAccountControl,
} from "@/lib/control";

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

  // Perintah harus diawali slash, misalnya /ban.
  const match = parts[0]?.match(
    /^\/(ban|unban|jail|unjail|mute|unmute)$/i
  );

  // Perintah Linux biasa diteruskan ke Bash.
  if (!match) return null;

  const action = match[1].toLowerCase() as ControlAction;

  if (parts.length < 2) {
    throw new Error(
      `Format: /${action} email@gmail.com`
    );
  }

  if (parts.length > 3) {
    throw new Error("Format perintah tidak valid.");
  }

  const email = parts[1].trim().toLowerCase();
  const duration = parts[2];

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Format email tidak valid.");
  }

  if (action === "ban" || action === "jail") {
    if (!duration) {
      throw new Error(
        `Format: /${action} email@gmail.com 77h atau permanent`
      );
    }
  } else if (duration) {
    throw new Error(
      `Format: /${action} email@gmail.com`
    );
  }

  return {
    action,
    email,
    duration,
  };
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();

    const command = String(body.command || "").trim();

    if (!command) {
      return NextResponse.json(
        { error: "Command kosong." },
        { status: 400 }
      );
    }

    if (command.length > 4000) {
      return NextResponse.json(
        { error: "Command terlalu panjang." },
        { status: 413 }
      );
    }

    // Periksa perintah admin sebelum menjalankan Bash.
    const control = parseControlCommand(command);

    if (control !== null) {
      if (!(await hasPanelSession())) {
        throw new Error("PANEL_PIN_REQUIRED");
      }

      const result = await setAccountControl(
        control.email,
        control.action,
        control.duration
      );

      return NextResponse.json({
        stdout:
          `${control.action.toUpperCase()} berhasil: ${result.email}\n` +
          `Status: ${result.status}\n` +
          `Muted: ${result.muted}\n` +
          `Expires: ${result.expires_at || "PERMANENT / NONE"}\n`,
        stderr: "",
        exitCode: 0,
      });
    }

    // Pemeriksaan akun pengguna biasa.
    await assertAccountAccess(user.email || "");
    await assertNotMuted(user.email || "");

    const sbx = await userSandbox(user.id);

    const result = await sbx.runCommand({
      cmd: "bash",
      args: [
        "-lc",
        "cd /vercel/sandbox && " + command,
      ],
      timeoutMs: 50000,
    });

    return NextResponse.json({
      stdout: await result.stdout(),
      stderr: await result.stderr(),
      exitCode: result.exitCode,
    });
  } catch (error: any) {
    console.error("[BARA TERMINAL]", error);

    const messages: Record<string, string> = {
      UNAUTHORIZED: "Silakan login terlebih dahulu.",
      ACCOUNT_BANNED: "Akun ini terkena ban.",
      ACCOUNT_JAILED: "Akun ini sedang di-jail.",
      ACCOUNT_MUTED: "Akun ini sedang di-mute.",
      PANEL_PIN_REQUIRED:
        "Buka panel JSON dan masukkan PIN terlebih dahulu.",
    };

    const message =
      messages[error?.message] ||
      error?.message ||
      "Terjadi kesalahan pada terminal.";

    let status = 500;

    if (error?.message === "UNAUTHORIZED") {
      status = 401;
    } else if (
      error?.message === "ACCOUNT_BANNED" ||
      error?.message === "ACCOUNT_JAILED" ||
      error?.message === "ACCOUNT_MUTED"
    ) {
      status = 403;
    } else if (error?.message === "PANEL_PIN_REQUIRED") {
      status = 401;
    }

    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
