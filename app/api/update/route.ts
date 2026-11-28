
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase";
import { userSandbox } from "@/lib/sandbox";
import { assertAccountAccess } from "@/lib/control";

export const runtime = "nodejs";
export const maxDuration = 60;

function errorStatus(error: any) {
  if (error?.message === "UNAUTHORIZED") return 401;

  if (
    error?.message === "ACCOUNT_BANNED" ||
    error?.message === "ACCOUNT_JAILED"
  ) {
    return 403;
  }

  return 500;
}

function safeParts(value: string) {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/");

  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        !/^[a-zA-Z0-9._ @()+-]+$/.test(part)
    )
  ) {
    throw new Error("Nama atau lokasi file tidak valid.");
  }

  return parts;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    await assertAccountAccess(user.email || "");

    const form = await req.formData();

    const uploaded = form.get("file");
    const mode = String(form.get("mode") || "");
    const relativePath = String(form.get("relativePath") || "");

    if (!(uploaded instanceof File)) {
      return NextResponse.json(
        { error: "File tidak ditemukan." },
        { status: 400 }
      );
    }

    if (mode !== "file" && mode !== "folder") {
      return NextResponse.json(
        { error: "Mode import tidak valid." },
        { status: 400 }
      );
    }

    if (uploaded.size > 4 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Ukuran maksimal satu file adalah 4 MB." },
        { status: 413 }
      );
    }

    const parts = safeParts(relativePath);

    let destination: string;

    if (mode === "file") {
      if (parts.length !== 1) {
        throw new Error("Import satu file hanya menerima satu file.");
      }

      destination = `/home/barateriminal/${parts[0]}`;
    } else {
      if (parts.length < 2) {
        throw new Error("Struktur folder project tidak valid.");
      }

      const projectName = parts[0];
      const insideProject = parts.slice(1).join("/");

      destination =
        `/home/barateriminal/${projectName}/${insideProject}`;
    }

    const parent = destination.slice(
      0,
      destination.lastIndexOf("/")
    );

    const sbx = await userSandbox(user.id);

    const mkdir = await sbx.runCommand({
      cmd: "mkdir",
      args: ["-p", parent],
      timeoutMs: 15000,
    });

    if (mkdir.exitCode !== 0) {
      throw new Error(
        `Gagal membuat direktori ${parent}: ${await mkdir.stderr()}`
      );
    }

    await sbx.writeFiles([
      {
        path: destination,
        content: Buffer.from(await uploaded.arrayBuffer()),
      },
    ]);

    return NextResponse.json({
      ok: true,
      name: uploaded.name,
      size: uploaded.size,
      path: destination,
    });
  } catch (error: any) {
    console.error("[BARA UPDATE]", error);

    return NextResponse.json(
      { error: error.message || "Import gagal." },
      { status: errorStatus(error) }
    );
  }
}
