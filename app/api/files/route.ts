
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase";
import { userSandbox, safePath } from "@/lib/sandbox";

export const runtime = "nodejs";
export const maxDuration = 60;

function quote(value: string) {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list";
    const target = safePath(url.searchParams.get("path") || ".");
    const sbx = await userSandbox(user.id);

    if (action === "download" || action === "preview") {
      const result = await sbx.runCommand({
        cmd: "bash",
        args: [
          "-lc",
          "test -f " + quote(target) +
          " && base64 -w0 " + quote(target)
        ],
        timeoutMs: 20000
      });

      if (result.exitCode !== 0) {
        return NextResponse.json(
          { error: "File tidak ditemukan." },
          { status: 404 }
        );
      }

      const buffer = Buffer.from(
        (await result.stdout()).trim(),
        "base64"
      );

      const name = target.split("/").pop() || "file";

      if (action === "preview") {
        return NextResponse.json({
          name,
          content: buffer.toString("utf8"),
          size: buffer.length
        });
      }

      return new Response(buffer, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition":
            'attachment; filename="' +
            name.replace(/[^a-zA-Z0-9._-]/g, "_") +
            '"',
          "Cache-Control": "no-store"
        }
      });
    }

    const result = await sbx.runCommand({
      cmd: "bash",
      args: [
        "-lc",
        "find " + quote(target) +
        " -maxdepth 1 -mindepth 1 -printf '%y\\t%f\\n' | sort"
      ],
      timeoutMs: 20000
    });

    const entries = (await result.stdout())
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [type, ...name] = line.split("\t");

        return {
          type: type === "d" ? "dir" : "file",
          name: name.join("\t")
        };
      });

    return NextResponse.json({ path: target, entries });
  } catch (e: any) {
    const status = e.message === "UNAUTHORIZED" ? 401 :
      e.message === "ACCOUNT_BANNED" || e.message === "ACCOUNT_JAILED" ? 403 :
      500;

    return NextResponse.json(
      { error: e.message || "File error" },
      { status }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const action = String(body.action || "");
    const target = safePath(String(body.path || ""));
    const sbx = await userSandbox(user.id);

    if (action === "mkdir") {
      const r = await sbx.runCommand({
        cmd: "mkdir",
        args: ["-p", target]
      });

      return NextResponse.json({ ok: r.exitCode === 0 });
    }

    if (action === "delete") {
      if (target === "/vercel/sandbox") {
        return NextResponse.json(
          { error: "Tidak boleh menghapus root workspace." },
          { status: 400 }
        );
      }

      const r = await sbx.runCommand({
        cmd: "rm",
        args: ["-rf", "--", target]
      });

      return NextResponse.json({
        ok: r.exitCode === 0,
        exitCode: r.exitCode
      });
    }

    if (action === "read") {
      const r = await sbx.runCommand({
        cmd: "cat",
        args: [target]
      });

      return NextResponse.json({
        content: await r.stdout(),
        stderr: await r.stderr(),
        exitCode: r.exitCode
      });
    }

    if (action === "write") {
      const encoded = Buffer.from(
        String(body.content ?? ""),
        "utf8"
      ).toString("base64");

      const parent = target.substring(
        0,
        target.lastIndexOf("/")
      );

      const command =
        "mkdir -p " + quote(parent) +
        " && printf '%s' " + quote(encoded) +
        " | base64 -d > " + quote(target);

      const r = await sbx.runCommand({
        cmd: "bash",
        args: ["-lc", command],
        timeoutMs: 20000
      });

      return NextResponse.json(
        {
          ok: r.exitCode === 0,
          stderr: await r.stderr()
        },
        { status: r.exitCode === 0 ? 200 : 500 }
      );
    }

    return NextResponse.json(
      { error: "Action tidak dikenal." },
      { status: 400 }
    );
  } catch (e: any) {
    const status = e.message === "UNAUTHORIZED" ? 401 :
      e.message === "ACCOUNT_BANNED" || e.message === "ACCOUNT_JAILED" ? 403 :
      500;

    return NextResponse.json(
      { error: e.message || "File error" },
      { status }
    );
  }
  }
