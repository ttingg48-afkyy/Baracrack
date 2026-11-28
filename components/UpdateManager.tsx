
"use client";

import { useRef, useState } from "react";

type UploadMode = "file" | "folder";

export default function UpdateManager() {
  const fileInput = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<UploadMode>("file");
  const [files, setFiles] = useState<File[]>([]);
  const [folderName, setFolderName] = useState("my-project");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const formatSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  };

  function chooseMode(next: UploadMode) {
    if (busy) return;
    setMode(next);
    setFiles([]);
    setMessage("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function onFilesSelected(list: FileList | null) {
    if (!list) return;

    const selected = Array.from(list);

    if (!selected.length) {
      setMessage("Tidak ada file yang dipilih.");
      return;
    }

    if (selected.length > 500) {
      setMessage("Maksimal 500 file dalam satu proses.");
      return;
    }

    const tooLarge = selected.find((file) => file.size > 4 * 1024 * 1024);

    if (tooLarge) {
      setMessage(
        `File ${tooLarge.name} lebih dari 4 MB. Pilih file yang lebih kecil.`
      );
      return;
    }

    const total = selected.reduce((sum, file) => sum + file.size, 0);

    if (total > 40 * 1024 * 1024) {
      setMessage("Total upload maksimal 40 MB per proses.");
      return;
    }

    setFiles(selected);
    setProgress(0);
    setMessage(`${selected.length} file siap diperiksa.`);
  }

  function relativeName(file: File) {
    if (mode === "folder" && file.webkitRelativePath) {
      const parts = file.webkitRelativePath.split("/");
      return parts.slice(1).join("/") || file.name;
    }

    return file.name;
  }

  function safeFolderName(value: string) {
    return /^[a-zA-Z0-9._-]+$/.test(value) &&
      value !== "." &&
      value !== "..";
  }

  async function continueUpload() {
    if (busy || files.length === 0) return;

    const folder = folderName.trim();

    if (!safeFolderName(folder)) {
      setMessage(
        "Nama folder hanya boleh berisi huruf, angka, titik, garis, dan underscore."
      );
      return;
    }

    const duplicateCheck = new Set<string>();

    for (const file of files) {
      const relative = relativeName(file);

      if (
        !relative ||
        relative.startsWith("/") ||
        relative.split("/").some((part) =>
          !part || part === "." || part === ".."
        )
      ) {
        setMessage("Struktur folder tidak valid.");
        return;
      }

      if (duplicateCheck.has(relative)) {
        setMessage(`File duplikat: ${relative}`);
        return;
      }

      duplicateCheck.add(relative);
    }

    const confirmed = window.confirm(
      `Upload ${files.length} file ke /home/barateriminal/${folder}/ ?`
    );

    if (!confirmed) return;

    setBusy(true);
    setProgress(0);
    setMessage("Memulai upload...");

    let completed = 0;

    try {
      for (const file of files) {
        const form = new FormData();

        form.append("file", file, file.name);
        form.append("folder", folder);
        form.append("relativePath", relativeName(file));

        const response = await fetch("/api/update", {
          method: "POST",
          credentials: "same-origin",
          body: form,
          cache: "no-store",
        });

        const raw = await response.text();
        let data: any = {};

        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error("Respons server tidak valid.");
        }

        if (!response.ok) {
          throw new Error(
            data.error || `Upload gagal: ${relativeName(file)}`
          );
        }

        completed++;
        setProgress(Math.round((completed / files.length) * 100));
        setMessage(`Uploading ${completed}/${files.length}`);
      }

      setMessage(
        `UPDATE BERHASIL! ${completed} file tersimpan di /home/barateriminal/${folder}/`
      );
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
    } catch (error: any) {
      setMessage(
        `${error.message || "Upload gagal."} Berhasil diunggah: ${completed}/${files.length}. File yang sudah berhasil tetap tersimpan.`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <small>BARA TERMINAL / PROJECT IMPORT</small>
      <h2>UPDATE MANAGER</h2>
      <p>Pilih satu file atau satu folder untuk dimasukkan ke workspace.</p>

      <div className="actions">
        <button
          className={mode === "file" ? "lime" : ""}
          disabled={busy}
          onClick={() => chooseMode("file")}
        >
          UPDATE 1 FILE
        </button>

        <button
          className={mode === "folder" ? "lime" : ""}
          disabled={busy}
          onClick={() => chooseMode("folder")}
        >
          UPDATE 1 FOLDER
        </button>
      </div>

      <label>NAMA FOLDER TUJUAN</label>
      <input
        value={folderName}
        onChange={(event) => setFolderName(event.target.value)}
        placeholder="my-project"
        disabled={busy}
      />

      <div className="notice">
        <b>DESTINATION</b>
        <br />
        /home/barateriminal/{folderName || "<nama-folder>"}/
      </div>

      <input
        ref={fileInput}
        type="file"
        hidden
        multiple={mode === "folder"}
        {...(mode === "folder"
          ? ({ webkitdirectory: "", directory: "" } as any)
          : {})}
        onChange={(event) => onFilesSelected(event.target.files)}
      />

      <button
        className="amber"
        style={{ width: "100%", marginTop: 12 }}
        disabled={busy}
        onClick={() => fileInput.current?.click()}
      >
        {mode === "file" ? "SELECT FILE" : "SELECT FOLDER"}
      </button>

      <div className="panel">
        <small>PREVIEW / BELUM DIUPLOAD</small>
        <h3>SELECTED CONTENT</h3>

        {files.length === 0 ? (
          <p>Belum ada file dipilih.</p>
        ) : (
          <>
            <div className="notice">
              {files.length} file · {formatSize(totalSize)}
            </div>

            <div className="fileList">
              {files.map((file, index) => (
                <div className="fileRow" key={`${file.name}-${index}`}>
                  <span style={{ overflowWrap: "anywhere" }}>
                    📄 {relativeName(file)}
                  </span>
                  <small>{formatSize(file.size)}</small>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {busy && (
        <div className="notice">
          <b>UPLOAD PROGRESS: {progress}%</b>
          <div
            style={{
              height: 8,
              background: "var(--border)",
              borderRadius: 20,
              overflow: "hidden",
              marginTop: 10,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: "var(--lime)",
                transition: "width .2s",
              }}
            />
          </div>
        </div>
      )}

      {message && <div className="notice">{message}</div>}

      <button
        className="lime"
        style={{ width: "100%", marginTop: 12 }}
        disabled={busy || files.length === 0}
        onClick={() => void continueUpload()}
      >
        {busy ? "UPLOADING..." : "CONTINUE — UPLOAD TO BARA"}
      </button>

      <p>
        <small>
          Maksimal 500 file dan 40 MB per proses. Maksimal 4 MB per file.
          File yang sudah berhasil diunggah tidak otomatis dihapus jika
          upload berikutnya gagal.
        </small>
      </p>
    </section>
  );
      }
        
