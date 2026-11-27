
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase";
import { userSandbox } from "@/lib/sandbox";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const sbx = await userSandbox(user.id);

    const result = await sbx.runCommand({
      cmd: "bash",
      args: [
        "-lc",
        "cd /vercel/sandbox && " + command
      ],
      timeoutMs: 50000
    });

    return NextResponse.json({
      stdout: await result.stdout(),
      stderr: await result.stderr(),
      exitCode: result.exitCode
    });
  } catch (e: any) {
    const messages: Record<string, string> = {
      UNAUTHORIZED: "Silakan login dulu.",
      ACCOUNT_BANNED: "Akun lu terkena permanent ban.",
      ACCOUNT_JAILED: "Akun lu sedang di-jail.",
      GMAIL_REQUIRED: "Gunakan akun Gmail.",
      MODERATION_CHECK_FAILED: "Gagal memeriksa status akun."
    };

    const message = messages[e.message] || e.message || "Terminal error.";

    const status = e.message === "UNAUTHORIZED" ? 401 :
      e.message === "ACCOUNT_BANNED" || e.message === "ACCOUNT_JAILED" ? 403 :
      500;

    return NextResponse.json({ error: message }, { status });
  }
}
