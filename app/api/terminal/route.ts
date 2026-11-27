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
    if (!command) return NextResponse.json({error:"Command kosong"}, {status:400});
    if (command.length > 4000) return NextResponse.json({error:"Command terlalu panjang"}, {status:413});
    const sbx = await userSandbox(user.id);
    const result = await sbx.runCommand({
      cmd: "bash",
      args: ["-lc", `cd /vercel/sandbox && ${command}`],
      timeoutMs: 50_000
    });
    return NextResponse.json({
      stdout: await result.stdout(),
      stderr: await result.stderr(),
      exitCode: result.exitCode
    });
  } catch (e:any) {
    const msg = e?.message === "UNAUTHORIZED" ? "Silakan login dulu" :
      e?.message === "ACCOUNT_BANNED" ? "Akun sedang dibatasi" :
      (e?.message || "Terminal error");
    return NextResponse.json({error:msg}, {status: msg.includes("login") ? 401 : 500});
  }
}
