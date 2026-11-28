
import { Sandbox } from "@vercel/sandbox";

const WORKSPACE = "/home/barateriminal";

export async function userSandbox(userId: string) {
  const safeId = userId
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 48);

  const sbx = await Sandbox.getOrCreate({
    name: `bara-${safeId}`,
    image: "vercel/sandbox/node:24",
    timeout: 5 * 60 * 1000,
    ports: [3000, 8000, 8080],
  });

  const setup = await sbx.runCommand({
    cmd: "mkdir",
    args: ["-p", WORKSPACE],
    timeoutMs: 15000,
  });

  if (setup.exitCode !== 0) {
    throw new Error(
      `Gagal menyiapkan workspace: ${await setup.stderr()}`
    );
  }

  return sbx;
}

export function safePath(input: string) {
  const value = (input || ".").replace(/\\/g, "/").trim();

  if (value.includes("\0")) {
    throw new Error("Path tidak valid.");
  }

  let relative: string;

  if (value.startsWith("/")) {
    if (
      value !== WORKSPACE &&
      !value.startsWith(WORKSPACE + "/")
    ) {
      throw new Error("Path di luar workspace tidak diizinkan.");
    }

    relative = value.slice(WORKSPACE.length);
  } else {
    relative = value;
  }

  if (
    relative.split("/").some((part) => part === "..")
  ) {
    throw new Error("Path tidak valid.");
  }

  return relative
    ? `${WORKSPACE}/${relative.replace(/^\/+/, "")}`
    : WORKSPACE;
}
