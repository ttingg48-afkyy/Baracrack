
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase";
import { userSandbox } from "@/lib/sandbox";
import {
  assertAccountAccess,
  assertNotMuted,
} from "@/lib/control";

export const runtime = "nodejs";
export const maxDuration = 30;

const WEB_PORTS = [
  3000, 3001, 4000, 4173, 5000,
  5173, 8000, 8080, 8081, 8888,
  9000, 10000,
];

export async function GET() {
  try {
    const user = await requireUser();

    await assertAccountAccess(user.id);
    await assertNotMuted(user.id);

    const sbx = await userSandbox(user.id);

    const result = await sbx.runCommand({
      cmd: "bash",
      args: ["-lc", "ss -ltnH"],
      timeoutMs: 10000,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        (await result.stderr()) || "Gagal mendeteksi port."
      );
    }

    const output = await result.stdout();

    const detected = new Set<number>();

    for (const line of output.split("\n")) {
      const columns = line.trim().split(/\s+/);
      const address = columns[3] || "";
      const port = Number(
        address.slice(address.lastIndexOf(":") + 1)
      );

      if (WEB_PORTS.includes(port)) {
        detected.add(port);
      }
    }

    const ports = [...detected].slice(0, 15);

    if (ports.length > 0) {
      await sbx.update({ ports });
    }

    const preview = ports.map((port) => ({
      port,
      url: sbx.domain(port),
    }));

    return NextResponse.json(
      { ports: preview },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    const message = error?.message || "Preview error.";

    const status =
      message.includes("UNAUTHORIZED") ? 401 :
      message.includes("ACCOUNT_BANNED") ||
      message.includes("ACCOUNT_JAILED") ||
      message.includes("Akses ditolak") ? 403 : 500;

    return NextResponse.json(
      { error: message, ports: [] },
      {
        status,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
