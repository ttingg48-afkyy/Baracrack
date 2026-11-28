
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

function validRelativePath(value: string) {
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

  return parts.join("/");
}

async function ensureDirectory(sbx: any, directory: string) {
  const parts = directory.split("/").filter(Boolean);
  let current = "";

  for (const part of parts) {
    current += "/" + part;

    try {
      await sbx.mkDir(current);
    } catch (error: any) {
      // Abaikan hanya jika folder memang sudah tersedia.
      const check = await sbx.runCommand({
        cmd: "test",
        args: ["-d", current],
      });

      if (check.exitCode !== 0) {
        throw new Error(
          `Gagal membuat folder ${current}: ${
            error?.message || "Folder tidak tersedia."
          }`
        );
      }
    }
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    await assertAccountAccess(user.email || "");

    const form = await req.formData();

    const uploaded = form.get("file");
    const folder = String(form.get("folder") || "").trim();

    const relativePath = validRelativePath(
      String(form.get("relativePath") || "")
    );

    if (!(uploaded instanceof File)) {
      return NextResponse.json(
        { error: "File tidak ditemukan." },
        { status: 400 }
      );
    }

    if (
      !/^[a-zA-Z0-9._-]+$/.test(folder) ||
      folder === "." ||
      folder === ".."
    ) {
      return NextResponse.json(
        { error: "Nama folder tujuan tidak valid." },
        { status: 400 }
      );
    }

    if (uploaded.size > 4 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Ukuran file maksimal 4 MB." },
        { status: 413 }
      );
    }

    const destination =
      `/home/barateriminal/${folder}/${relativePath}`;

    const parent = destination.substring(
      0,
      destination.lastIndexOf("/")
    );

    const sbx = await userSandbox(user.id);

    // Buat direktori secara bertahap agar parent tidak hilang.
    await ensureDirectory(sbx, parent);

    // Simpan isi file tanpa mengubah bytes.
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
      { error: error.message || "Upload gagal." },
      { status: errorStatus(error) }
    );
  }
}
