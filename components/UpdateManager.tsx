
"use client";

import { useRef, useState } from "react";

type Mode = "file" | "folder";

type ImportedItem = {
  name: string;
  path: string;
  size: number;
};

export default function UpdateManager({
  onContinue,
}: {
  onContinue?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("folder");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ImportedItem[] | null>(null);
  const [destination, setDestination] = useState("");

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  function formatSize(size: number) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  }

  function getRelativePath(file: File) {
    return mode === "folder" ? file.webkitRelativePath : file.name;
  }

  function selectFiles(list: FileList | null) {
    if (!list) return;

    const selected = Array.from(list);

    if (!selected.length) {
      setMessage("Tidak ada file dipilih.");
      return;
    }

    if (selected.length > 500) {
      setMessage("Maksimal 500 file.");
      return;
    }

    const tooLarge = selected.find(file => file.size > 4 * 1024 * 1024);

    if (tooLarge) {
      setMessage(`${tooLarge.name} melebihi batas 4 MB.`);
      return;
    }

    const total = selected.reduce((sum, file) => sum + file.size, 0);

    if (total > 40 * 1024 * 1024) {
      setMessage("Total ukuran maksimal 40 MB.");
      return;
    }

    if (mode === "folder") {
      const roots = new Set(
        selected.map(file => file.webkitRelativePath.split("/")[0])
      );

      if (roots.size !== 1 || ![...roots][0]) {
        setMessage("Pilih tepat satu folder project.");
        return;
      }
    }

    setFiles(selected);
    setProgress(0);
    setMessage(`${selected.length} file siap dilanjutkan.`);
    setResult(null);
  }

  function changeMode(next: Mode) {
    if (busy) return;
    setMode(next);
    setFiles([]);
    setResult(null);
    setMessage("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function continueUpload() {
    if (busy || !files.length) return;

    const firstPath = getRelativePath(files[0]);
    const rootName = mode === "folder" ? firstPath.split("/")[0] : "";

    const target = mode === "folder"
      ? `/home/barateriminal/${rootName}/`
      : "/home/barateriminal/";

    setBusy(true);
    setProgress(0);
    setMessage("Mengunggah project...");

    const imported: ImportedItem[] = [];

    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const form = new FormData();

        form.append("file", file, file.name);
        form.append("mode", mode);
        form.append("relativePath", getRelativePath(file));

        const response = await fetch("/api/update", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          body: form,
        });

        const raw = await response.text();
        let data: any;

        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error("Respons server tidak valid.");
        }

        if (!response.ok) {
          throw new Error(data.error || `Gagal upload ${file.name}`);
        }

        imported.push({
          name: data.name,
          path: data.path,
          size: data.size,
        });

        setProgress(Math.round(((index + 1) / files.length) * 100));
        setMessage(`Mengunggah ${index + 1}/${files.length}`);
      }

      setDestination(target);
      setResult(imported);
      setFiles([]);
      setMessage("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (error: any) {
      setMessage(
        `${error.message || "Upload gagal."} Berhasil: ${imported.length}/${files.length}.`
      );
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <section className="panel">
        <small>BARA TERMINAL / UPLOAD COMPLETE</small>
        <h2>PROJECT READY</h2>

        <div className="notice">
          <b>DESTINATION</b>
          <br />
          {destination}
          <br />
          <b>{result.length} FILE BERHASIL DIUPLOAD</b>
        </div>

        <h3>UPLOADED CONTENT</h3>

        <div className="fileList">
          {result.map((item, index) => (
            <div className="fileRow" key={`${item.path}-${index}`}>
              <span style={{ overflowWrap: "anywhere" }}>
                📄 {item.path.replace(destination, "") || item.name}
              </span>
              <small>{formatSize(item.size)}</small>
            </div>
          ))}
        </div>

        <button
          className="lime"
          style={{ width: "100%", marginTop: 14 }}
          onClick={onContinue}
        >
          CONTINUE TO TERMINAL →
        </button>
      </section>
    );
  }

  return (
    <section className="panel">
      <small>BARA TERMINAL / PROJECT UPLOAD</small>
      <h2>UPDATE / IMPORT</h2>

      <p>
        Upload satu file atau satu folder project langsung ke workspace.
      </p>

      <div className="actions">
        <button
          className={mode === "file" ? "lime" : ""}
          disabled={busy}
          onClick={() => changeMode("file")}
        >
          SINGLE FILE
        </button>

        <button
          className={mode === "folder" ? "lime" : ""}
          disabled={busy}
          onClick={() => changeMode("folder")}
        >
          PROJECT FOLDER
        </button>
      </div>

      <div className="notice">
        <b>AUTOMATIC DESTINATION</b>
        <br />
        {mode === "file"
          ? "/home/barateriminal/"
          : "/home/barateriminal/<project-name>/"}
      </div>

      <input
        ref={inputRef}
        type="file"
        hidden
        multiple={mode === "folder"}
        {...(mode === "folder"
          ? ({ webkitdirectory: "", directory: "" } as any)
          : {})}
        onChange={event => selectFiles(event.target.files)}
      />

      <button
        className="amber"
        style={{ width: "100%", marginTop: 12 }}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {mode === "file" ? "SELECT FILE" : "SELECT PROJECT FOLDER"}
      </button>

      {files.length > 0 && (
        <>
          <div className="notice">
            {files.length} files · {formatSize(totalSize)}
          </div>

          <div className="fileList">
            {files.map((file, index) => (
              <div className="fileRow" key={`${file.name}-${index}`}>
                <span style={{ overflowWrap: "anywhere" }}>
                  📄 {getRelativePath(file)}
                </span>
                <small>{formatSize(file.size)}</small>
              </div>
            ))}
          </div>
        </>
      )}

      {busy && (
        <div className="notice">
          UPLOAD PROGRESS: {progress}%
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
        {busy ? "UPLOADING..." : "CONTINUE →"}
      </button>

      <p>
        <small>
          Maksimal 500 file, 40 MB total, 4 MB per file.
        </small>
      </p>
    </section>
  );
}
