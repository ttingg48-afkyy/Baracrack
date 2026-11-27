
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
  const action = parts[0]?.toLowerCase();

  const allowed: ControlAction[] = [
    "ban",
    "unban",
    "jail",
    "unjail",
    "mute",
    "unmute",
  ];

  // Hanya perintah kontrol yang dikenal.
  // Path Linux seperti /usr/bin/python3 bukan perintah kontrol.
  if (!allowed.includes(action as ControlAction)) {
    return null;
  }

  if (parts.length < 2) {
    throw new Error(
      `Format: /${action} email@gmail.com`
    );
  }

  if (parts.length > 3) {
    throw new Error("Format perintah tidak valid.");
  }

  const controlAction = action as ControlAction;
  const email = parts[1];
  const duration = parts[2];

  if (
    controlAction === "ban" ||
    controlAction === "jail"
  ) {
    if (!duration) {
      throw new Error(
        `Format: /${controlAction} email@gmail.com 77day atau permanent`
      );
    }
  } else if (duration) {
    throw new Error(
      `Format: /${controlAction} email@gmail.com`
    );
  }

  return {
    action: controlAction,
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

    // Periksa apakah command merupakan perintah kontrol.
    const control = parseControlCommand(command);

    if (control !== null) {
      // Panel JSON harus sudah dibuka menggunakan PIN.
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

    // Pemeriksaan akun biasa.
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
  } catch (e: any) {
    console.error("[BARA TERMINAL]", e);

    const messages: Record<string, string> = {
      UNAUTHORIZED: "Silakan login dulu.",
      ACCOUNT_BANNED: "Akun terkena ban.",
      ACCOUNT_JAILED: "Akun sedang di-jail.",
      ACCOUNT_MUTED:
        "Akun sedang di-mute. Command dinonaktifkan.",
      PANEL_PIN_REQUIRED:
        "Masukkan PIN melalui tombol JSON dahulu.",
    };

    const message =
      messages[e.message] ||
      e.message ||
      "Terminal error.";

    const status =
      e.message === "UNAUTHORIZED"
        ? 401
        : e.message === "ACCOUNT_BANNED" ||
            e.message === "ACCOUNT_JAILED" ||
            e.message === "ACCOUNT_MUTED"
          ? 403
          : e.message === "PANEL_PIN_REQUIRED"
            ? 401
            : 500;

    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
