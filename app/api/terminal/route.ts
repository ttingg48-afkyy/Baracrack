
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

function parseControlCommand(command: string) {
  const parts = command.trim().split(/\s+/);

  if (!parts[0]?.startsWith("/")) return null;

  const action = parts[0].slice(1).toLowerCase();

  const allowed = [
    "ban", "unban", "jail", "unjail", "mute", "unmute",
  ];

  if (!allowed.includes(action)) {
    throw new Error("Perintah kontrol tidak dikenal.");
  }

  if (parts.length < 2) {
    throw new Error(`Format: /${action} email@gmail.com`);
  }

  if (parts.length > 3) {
    throw new Error("Format perintah tidak valid.");
  }

  if ((action === "ban" || action === "jail") && !parts[2]) {
    throw new Error(
      `Format: /${action} email@gmail.com 77day atau permanent`
    );
  }

  if (
    action !== "ban" &&
    action !== "jail" &&
    parts[2]
  ) {
    throw new Error(`Format: /${action} email@gmail.com`);
  }

  return {
    action,
    email: parts[1],
    duration: parts[2],
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

    // Perintah kontrol akun
    if (command.startsWith("/")) {
      const control = parseControlCommand(command);

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

    // Pemeriksaan akun biasa
    await assertAccountAccess(user.email || "");
    await assertNotMuted(user.email || "");

    const sbx = await userSandbox(user.id);

    const result = await sbx.runCommand({
      cmd: "bash",
      args: ["-lc", "cd /vercel/sandbox && " + command],
      timeoutMs: 50000,
    });

    return NextResponse.json({
      stdout: await result.stdout(),
      stderr: await result.stderr(),
      exitCode: result.exitCode,
    });
  } catch (e: any) {
    const messages: Record<string, string> = {
      UNAUTHORIZED: "Silakan login dulu.",
      ACCOUNT_BANNED: "Akun terkena ban.",
      ACCOUNT_JAILED: "Akun sedang di-jail.",
      ACCOUNT_MUTED: "Akun sedang di-mute. Command dinonaktifkan.",
      PANEL_PIN_REQUIRED: "Masukkan PIN melalui tombol JSON dahulu.",
    };

    const message = messages[e.message] || e.message || "Terminal error.";

    const status =
      e.message === "UNAUTHORIZED" ? 401 :
      e.message === "ACCOUNT_BANNED" ||
      e.message === "ACCOUNT_JAILED" ||
      e.message === "ACCOUNT_MUTED" ? 403 :
      e.message === "PANEL_PIN_REQUIRED" ? 401 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
