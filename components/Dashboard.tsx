
"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type Entry = {
  name: string;
  type: "dir" | "file";
};

export default function Dashboard() {
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  );

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("terminal");

  const [command, setCommand] = useState("pwd");
  const [output, setOutput] = useState(
    "BARA TERMINAL v4.0\nLIVE CONSOLE READY\n"
  );

  const [path, setPath] = useState(".");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [file, setFile] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState("");
  const [users, setUsers] = useState<any[]>([]);

  const isAdmin =
    user?.email?.toLowerCase() ===
    process.env.NEXT_PUBLIC_ADMIN_EMAIL?.toLowerCase();

  async function api(url: string, options?: RequestInit) {
    const response = await fetch(url, options);
    const raw = await response.text();

    let data: any = {};

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error("Server mengirim respons tidak valid.");
    }

    if (!response.ok) {
      throw new Error(data.error || "Request gagal.");
    }

    return data;
  }

  useEffect(() => {
    let active = true;

    async function init() {
      const { data } = await supabase.auth.getUser();
      if (active) setUser(data.user);
      if (active) setLoading(false);
    }

    init();

    const { data: listener } =
      supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user || null);
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function sendCode() {
    setBusy(true);
    setMessage("");

    try {
      const data = await api("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send-code",
          email,
          password
        })
      });

      setCodeSent(true);
      setMessage(data.message);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setBusy(true);
    setMessage("");

    try {
      await api("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify-code",
          email,
          code
        })
      });

      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setMessage("Email berhasil diverifikasi.");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    setBusy(true);
    setMessage("");

    try {
      await api("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          email,
          password
        })
      });

      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setMessage("Login berhasil.");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function run(cmd = command) {
    const selected = cmd.trim();
    if (!selected || busy) return;

    setBusy(true);

    // Menghapus output sebelumnya setiap kali command baru dijalankan.
    setOutput("$ " + selected + "\nMenjalankan...\n");

    try {
      const data = await api("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: selected })
      });

      setOutput(
        "$ " + selected + "\n" +
        (data.stdout || "") +
        (data.stderr || "") +
        "\n[exit " + data.exitCode + "]\n"
      );
    } catch (e: any) {
      setOutput("$ " + selected + "\nERROR: " + e.message + "\n");
    } finally {
      setBusy(false);
    }
  }

  async function refresh(p = path) {
    setBusy(true);

    try {
      const data = await api(
        "/api/files?path=" + encodeURIComponent(p)
      );

      setEntries(data.entries || []);
      setPath(p);
      setMessage("Folder diperbarui.");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function openFile(name: string) {
    const full = path === "." ? name : path + "/" + name;

    setBusy(true);

    try {
      const data = await api("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "read",
          path: full
        })
      });

      if (data.exitCode !== 0) {
        throw new Error(data.stderr || "File tidak bisa dibuka.");
      }

      setFile(full);
      setContent(data.content || "");
      setPreview("");
      setTab("editor");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveFile() {
    if (!file) return;

    setBusy(true);

    try {
      await api("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "write",
          path: file,
          content
        })
      });

      setMessage("File berhasil disimpan.");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function createItem(type: "file" | "folder") {
    const name = prompt("Nama " + type + ":");
    if (!name?.trim()) return;

    const target = path === "." ? name : path + "/" + name;

    setBusy(true);

    try {
      if (type === "folder") {
        await api("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mkdir", path: target })
        });
      } else {
        await api("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "write",
            path: target,
            content: ""
          })
        });
      }

      await refresh(path);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteFile(name: string) {
    const target = path === "." ? name : path + "/" + name;
    if (!confirm("Hapus " + name + "?")) return;

    setBusy(true);

    try {
      await api("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          path: target
        })
      });

      setMessage("File berhasil dihapus.");
      await refresh(path);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadFile(name: string) {
    const target = path === "." ? name : path + "/" + name;

    try {
      const response = await fetch(
        "/api/files?action=download&path=" +
        encodeURIComponent(target)
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Download gagal.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = name;
      a.click();

      URL.revokeObjectURL(url);
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function previewFile(name: string) {
    const target = path === "." ? name : path + "/" + name;

    try {
      const data = await api(
        "/api/files?action=preview&path=" +
        encodeURIComponent(target)
      );

      setPreview(data.content);
      setMessage("Preview: " + data.name);
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function loadUsers() {
    setBusy(true);

    try {
      const data = await api("/api/admin/users");
      setUsers(data.users || []);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function moderate(id: string, action: string) {
    const reason = prompt("Alasan tindakan admin:");
    if (reason === null) return;

    setBusy(true);

    try {
      await api("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, reason })
      });

      setMessage("Aksi " + action + " berhasil.");
      await loadUsers();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    setTab("terminal");
    setOutput("BARA TERMINAL\nSession ended.\n");
  }

  if (loading) {
    return <main className="auth"><h1>BARA LOADING...</h1></main>;
  }

  if (!user) {
    return (
      <main className="auth">
        <section className="authCard">
          <small>BARA ACCOUNT SYSTEM</small>
          <h1>BARA TERMINAL</h1>

          <div className="actions">
            <button onClick={() => {
              setMode("login");
              setCodeSent(false);
              setMessage("");
            }}>
              LOGIN
            </button>
            <button onClick={() => {
              setMode("signup");
              setCodeSent(false);
              setMessage("");
            }}>
              REGISTER
            </button>
          </div>

          <input
            type="email"
            placeholder="nama@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password minimal 8 karakter"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {mode === "login" ? (
            <button className="lime" disabled={busy} onClick={login}>
              {busy ? "LOADING..." : "LOGIN"}
            </button>
          ) : (
            <>
              {!codeSent ? (
                <button className="lime" disabled={busy} onClick={sendCode}>
                  {busy ? "SENDING..." : "SEND VERIFICATION CODE"}
                </button>
              ) : (
                <>
                  <input
                    placeholder="6 digit verification code"
                    value={code}
                    maxLength={6}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                  <button className="lime" disabled={busy} onClick={verifyCode}>
                    VERIFY EMAIL
                  </button>
                </>
              )}
            </>
          )}

          {message && <p className="notice">{message}</p>}
          <p>Registrasi hanya menerima Gmail.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header>
        <div>
          <small>LIVE CONSOLE / AUTHENTICATED</small>
          <h1>BARA TERMINAL <span className="pill">SAFE MODE</span></h1>
          <p>{user.email}</p>
        </div>
        <button onClick={logout}>LOGOUT</button>
      </header>

      <nav>
        <button className={tab === "terminal" ? "active" : ""}
          onClick={() => setTab("terminal")}>TERMINAL</button>
        <button className={tab === "files" ? "active" : ""}
          onClick={() => { setTab("files"); refresh("."); }}>FILES</button>
        <button className={tab === "editor" ? "active" : ""}
          onClick={() => setTab("editor")}>EDITOR</button>
        {isAdmin && (
          <button className={tab === "admin" ? "active" : ""}
            onClick={() => { setTab("admin"); loadUsers(); }}>ADMIN</button>
        )}
      </nav>

      {message && (
        <div className="notice">
          {message}
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}

      {tab === "terminal" && (
        <section className="panel">
          <div className="panelTitle">
            <small>WORKSPACE / SHELL</small>
            <span className="pill">LINUX</span>
          </div>

          <pre className="console">{output}</pre>

          <div className="command">
            <b>$</b>
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="python3 bot.py, ls -la, npm install..."
            />
            <button className="amber" disabled={busy} onClick={() => run()}>
              {busy ? "RUNNING..." : "RUN"}
            </button>
          </div>

          <div className="actions">
            <button onClick={() => run("pwd")}>PWD</button>
            <button onClick={() => run("ls -la")}>LIST FILES</button>
            <button className="red" onClick={() => setOutput("")}>CLEAR</button>
          </div>
        </section>
      )}

      {tab === "files" && (
        <section className="panel">
          <small>WORKSPACE STORAGE</small>
          <h2>FILE MANAGER</h2>

          <div className="command">
            <input value={path} onChange={(e) => setPath(e.target.value)} />
            <button className="amber" onClick={() => refresh()}>OPEN</button>
          </div>

          <div className="actions">
            <button onClick={() => refresh()}>REFRESH</button>
            <button onClick={() => createItem("folder")}>+ FOLDER</button>
            <button onClick={() => createItem("file")}>+ FILE</button>
          </div>

          <div className="fileList">
            {entries.map((entry) => (
              <div className="fileRow" key={entry.name}>
                <button className="fileName" onClick={() => {
                  if (entry.type === "dir") {
                    refresh(path === "." ? entry.name : path + "/" + entry.name);
                  } else {
                    openFile(entry.name);
                  }
                }}>
                  {entry.type === "dir" ? "📁" : "📄"} {entry.name}
                </button>

                {entry.type === "file" && (
                  <div className="actions">
                    <button title="Edit" onClick={() => openFile(entry.name)}>✏️</button>
                    <button title="Preview" onClick={() => previewFile(entry.name)}>👁</button>
                    <button title="Download" onClick={() => downloadFile(entry.name)}>⬇</button>
                    <button title="Delete" className="red" onClick={() => deleteFile(entry.name)}>🗑</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {preview && (
            <section>
              <h3>PREVIEW</h3>
              <pre className="console">{preview}</pre>
              <button onClick={() => setPreview("")}>CLOSE PREVIEW</button>
            </section>
          )}
        </section>
      )}

      {tab === "editor" && (
        <section className="panel">
          <small>CODE EDITOR / SAVE ENABLED</small>
          <h2>{file || "Pilih file dari Files"}</h2>

          <textarea
            className="editor"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
          />

          <div className="actions">
            <button className="lime" disabled={!file || busy} onClick={saveFile}>
              {busy ? "SAVING..." : "SAVE FILE"}
            </button>
            <button onClick={() => setTab("files")}>BACK TO FILES</button>
          </div>
        </section>
      )}

      {tab === "admin" && isAdmin && (
        <section className="panel">
          <small>ADMIN CONTROL CENTER</small>
          <h2>USER MODERATION</h2>
          <button className="amber" onClick={loadUsers}>REFRESH USERS</button>

          {users.map((u) => (
            <div className="userRow" key={u.id}>
              <b>{u.email}</b>
              <small>
                Status: {u.moderation?.status || "active"}
                {" · "}
                Joined: {u.created_at?.slice(0, 10)}
              </small>

              <div className="actions">
                <button disabled={busy} onClick={() => moderate(u.id, "ban")}>
                  BAN 24H
                </button>
                <button className="red" disabled={busy}
                  onClick={() => moderate(u.id, "permanent")}>
                  PERMANENT BAN
                </button>
                <button disabled={busy} onClick={() => moderate(u.id, "jail")}>
                  JAIL 10M
                </button>
                <button className="amber" disabled={busy}
                  onClick={() => moderate(u.id, "kick")}>
                  KICK
                </button>
                <button className="lime" disabled={busy}
                  onClick={() => moderate(u.id, "unban")}>
                  UNBAN
                </button>
                <button className="lime" disabled={busy}
                  onClick={() => moderate(u.id, "unjail")}>
                  UNJAIL
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <footer>BARA TERMINAL v4.0 · LINUX WORKSPACE · SUPABASE AUTH</footer>
    </main>
  );
  }
  
