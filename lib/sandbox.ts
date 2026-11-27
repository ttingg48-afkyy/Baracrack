
import { Sandbox } from "@vercel/sandbox";

export async function userSandbox(userId: string) {
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);

  const sbx = await Sandbox.getOrCreate({
    name: `bara-${safeId}`,
    image: "vercel/sandbox/node:24",
    timeout: 5 * 60 * 1000,
    ports: [3000, 8000, 8080]
  });

  await sbx.runCommand({
    cmd: "mkdir",
    args: ["-p", "/vercel/sandbox"]
  });

  return sbx;
}

export function safePath(input: string) {
  const p = (input || ".").replace(/\\/g, "/").trim();

  if (
    p.includes("\0") ||
    p.startsWith("/") ||
    p.split("/").some(part => part === "..")
  ) {
    throw new Error("Path tidak valid. Gunakan path relatif di workspace.");
  }

  return `/vercel/sandbox/${p}`;
}
