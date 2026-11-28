
"use client";

import { useRef, useState } from "react";

type Mode = "file" | "folder";
type Item = { name: string; path: string; size: number };

export default function UpdateManager({
  onContinue,
  onEditFile,
}: {
  onContinue?: () => void;
  onEditFile?: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("folder");
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Item | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null);

  const formatSize = (n: number) =>
    n < 1024 ? `${n} B` :
    n < 1048576 ? `${(n / 1024).toFixed(1)} KB` :
    `${(n / 1048576).toFixed(2)} MB`;

  function relative(file: File) {
    return mode === "folder" ? file.webkitRelativePath : file.name;
  }

  function selectFiles(list: FileList | null) {
    if (!list) return;
    const selected = Array.from(list);

    if (!selected.length) return;
    if (selected.length > 500) {
      setMessage("Maksimal 500 file.");
      return;
    }
    if (selected.some(f => f.size > 4 * 1024 * 1024)) {
      setMessage("Ukuran maksimal setiap file 4 MB.");
      return;
    }
    if (selected.reduce((a, f) => a + f.size, 0) > 40 * 1024 * 1024) {
      setMessage("Total ukuran maksimal 40 MB.");
      return;
    }

    if (mode === "folder") {
      const roots = new Set(selected.map(f => relative(f).split("/")[0]));
      if (roots.size !== 1 || ![...roots][0]) {
        setMessage("Pilih tepat satu folder project.");
        return;
      }
    }

    setFiles(selected);
    setMessage(`${selected.length} file siap diupload. File bernama sama akan ditimpa.`);
  }

  async function request(url: string, options?: RequestInit) {
    const response = await fetch(url, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
    });

    const raw = await response.text();
    let data: any = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error("Respons server tidak valid.");
    }

    if (!response.ok) throw new Error(data.error || "Permintaan gagal.");
    return data;
  }

  async function upload() {
    if (busy || !files.length) return;
    setBusy(true);
    setProgress(0);
    setMessage("Memulai upload...");

    const uploaded: Item[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const form = new FormData();
        form.append("file", f);
        form.append("mode", mode);
        form.append("relativePath", relative(f));

        const data = await request("/api/update", {
          method: "POST",
          body: form,
        });

        uploaded.push({
          name: data.name,
          path: data.path,
          size: data.size,
        });

        setProgress(Math.round(((i + 1) / files.length) * 100));
      }

      setItems(old => {
        const map = new Map(old.map(x => [x.path, x]));
        uploaded.forEach(x => map.set(x.path, x));
        return [...map.values()];
      });

      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      setMessage(`${uploaded.length} file berhasil diupload. File lama yang namanya sama sudah ditimpa.`);
    } catch (e: any) {
      setMessage(e.message || "Upload gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function loadItems() {
    try {
      const data = await request("/api/files?path=.");
      setItems(data.entries
        .filter((x: any) => x.type === "file")
        .map((x: any) => ({
          name: x.name,
          path: `/home/barateriminal/${x.name}`,
          size: 0,
        })));
    } catch (e: any) {
      setMessage(e.message || "Gagal memuat file.");
    }
  }

  async function removeItem(item: Item) {
    setBusy(true);
    try {
      await request("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", path: item.path }),
      });
      setItems(old => old.filter(x => x.path !== item.path));
      setConfirmDelete(null);
      setMessage(`${item.name} berhasil dihapus.`);
    } catch (e: any) {
      setMessage(e.message || "Gagal menghapus file.");
    } finally {
      setBusy(false);
    }
  }

  async function showPreview(item: Item) {
    setBusy(true);
    try {
      const data = await request(
        `/api/files?action=preview&path=${encodeURIComponent(item.path)}`
      );
      setPreview(item);
      setPreviewContent(data.content || "");
    } catch (e: any) {
      setMessage(e.message || "Preview gagal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <small>BARA TERMINAL / FILE MANAGER</small>
      <h2>UPDATE / IMPORT</h2>

      <style>{`
        .bara-action{transition:transform .18s,opacity .18s;animation:baraIn .25s ease both}
        .bara-action:active{transform:scale(.94)}
        .bara-item{padding:12px;margin-top:9px;border:1px solid var(--border);border-radius:10px;animation:baraIn .25s ease both}
        .bara-modal-bg{position:fixed;inset:0;background:#000b;z-index:1000;display:grid;place-items:center;padding:18px}
        .bara-modal{width:100%;max-width:650px;max-height:80vh;overflow:auto;background:#111820;border:1px solid #39495a;border-radius:16px;padding:18px;animation:baraIn .22s ease}
        @keyframes baraIn{from{opacity:0;transform:translateY(9px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
      `}</style>

      <div className="actions">
        <button className={mode === "file" ? "lime" : ""} onClick={() => {setMode("file");setFiles([]);}}>
          SINGLE FILE
        </button>
        <button className={mode === "folder" ? "lime" : ""} onClick={() => {setMode("folder");setFiles([]);}}>
          PROJECT FOLDER
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        hidden
        multiple={mode === "folder"}
        {...(mode === "folder" ? ({ webkitdirectory: "", directory: "" } as any) : {})}
        onChange={e => selectFiles(e.target.files)}
      />

      <button className="amber bara-action" style={{width:"100%",marginTop:12}} onClick={() => inputRef.current?.click()}>
        SELECT {mode === "file" ? "FILE" : "PROJECT FOLDER"}
      </button>

      {files.length > 0 && (
        <div className="notice">
          {files.length} file · {formatSize(files.reduce((a,f)=>a+f.size,0))}
          {files.map((f,i)=><div key={i}>{relative(f)}</div>)}
        </div>
      )}

      {busy && <div className="notice">PROCESSING {progress}%</div>}

      <button className="lime bara-action" style={{width:"100%",marginTop:10}} disabled={busy || !files.length} onClick={() => void upload()}>
        {busy ? "UPLOADING..." : "UPLOAD / OVERWRITE"}
      </button>

      <div className="actions" style={{marginTop:14}}>
        <button onClick={() => void loadItems()}>REFRESH FILES</button>
        <button onClick={onContinue}>BACK TO TERMINAL</button>
      </div>

      {message && <div className="notice bara-action">{message}</div>}

      <h3>FILE MANAGER</h3>

      {items.map(item => (
        <div className="bara-item" key={item.path}>
          <div style={{overflowWrap:"anywhere",fontWeight:700}}>📄 {item.name}</div>
          <div className="actions">
            <button className="lime bara-action" onClick={() => onEditFile?.(item.path)}>EDIT</button>
            <button className="amber bara-action" onClick={() => void showPreview(item)}>PREVIEW</button>
            <button className="red bara-action" onClick={() => setConfirmDelete(item)}>DELETE</button>
          </div>
        </div>
      ))}

      {confirmDelete && (
        <div className="bara-modal-bg">
          <div className="bara-modal">
            <h3>HAPUS FILE?</h3>
            <p>{confirmDelete.path}</p>
            <p>File akan benar-benar dihapus dari workspace.</p>
            <div className="actions">
              <button className="red" disabled={busy} onClick={() => void removeItem(confirmDelete)}>YA, HAPUS</button>
              <button onClick={() => setConfirmDelete(null)}>BATAL</button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="bara-modal-bg">
          <div className="bara-modal">
            <h3>PREVIEW: {preview.name}</h3>
            {/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(preview.name) ? (
              <img src={`data:image/${preview.name.split(".").pop()};base64,${btoa(unescape(encodeURIComponent(previewContent)))}`} alt={preview.name} style={{maxWidth:"100%"}} />
            ) : (
              <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:400,overflow:"auto"}}>{previewContent}</pre>
            )}
            <button className="lime" onClick={() => setPreview(null)}>CLOSE</button>
          </div>
        </div>
      )}
    </section>
  );
}
