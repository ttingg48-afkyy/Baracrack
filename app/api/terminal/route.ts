
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

function parseControlCommand(command: string): ControlCommand | null {
  const parts = command.trim().split(/\s+/);

  const match = parts[0]?.match(
    /^\/(ban|unban|jail|unjail|mute|unmute)$/i
  );

  if (!match) return null;

  const action = match[1].toLowerCase() as ControlAction;

  if (parts.length < 2 || parts.length > 3) {
    throw new Error(
      `Format: /${action} email@gmail.com${action === "ban" || action === "jail" ? " 77h atau permanent" : ""}`
    );
  }

  const email = parts[1].trim().toLowerCase();
  const duration = parts[2];

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Format email tidak valid.");
  }

  if (
    (action === "ban" || action === "jail") &&
    !duration
  ) {
    throw new Error(
      `Format: /${action} email@gmail.com 77h atau permanent`
    );
  }

  if (
    !["ban", "jail"].includes(action) &&
    duration
  ) {
    throw new Error(`Format: /${action} email@gmail.com`);
  }

  return { action, email, duration };
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

    const control = parseControlCommand(command);

    if (control) {
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

    await assertAccountAccess(user.email || "");
    await assertNotMuted(user.email || "");

    const sbx = await userSandbox(user.id);

    const result = await sbx.runCommand({
      cmd: "bash",
      args: [
        "-lc",
        `cd /home/barateriminal && ${command}`,
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

    if (error?.message === "UNAUTHORIZED") status = 401;

    if (
      ["ACCOUNT_BANNED", "ACCOUNT_JAILED", "ACCOUNT_MUTED"].includes(
        error?.message
      )
    ) {
      status = 403;
    }

    if (error?.message === "PANEL_PIN_REQUIRED") status = 401;

    return NextResponse.json({ error: message }, { status });
  }
}
