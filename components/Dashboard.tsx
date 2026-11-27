
"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type Entry = {
  name: string;
  type: "dir" | "file";
};

type AdminUser = {
  id: string;
  email: string;
  created_at?: string;
  moderation?: {
    status?: string;
    reason?: string;
  };
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

  // Authentication
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  // Dashboard
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<
    "terminal" | "files" | "editor" | "admin"
  >("terminal");

  // Terminal
  const [command, setCommand] = useState("pwd");
  const [output, setOutput] = useState(
    "BARA TERMINAL v4.0\nLIVE CONSOLE READY\n"
  );

  // Files
  const [path, setPath] = useState(".");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [file, setFile] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState("");

  // Admin
  const [users, setUsers] = useState<AdminUser[]>([]);

  const isAdmin =
    user?.email?.toLowerCase() ===
    process.env.NEXT_PUBLIC_ADMIN_EMAIL?.toLowerCase();

  const api = useCallback(
    async (url: string, options?: RequestInit) => {
      const response = await fetch(url, {
        ...options,
        credentials: "same-origin",
      });

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
    },
    []
  );

  // Check session
  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (error) throw error;
        if (active) setUser(data.user);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Authentication helpers
  function switchMode(next: "login" | "signup") {
    setMode(next);
    setCodeSent(false);
    setCode("");
    setMessage("");
  }

  async function sendCode() {
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (!normalizedEmail.endsWith("@gmail.com")) {
        throw new Error("Registrasi hanya menerima Gmail.");
      }

      if (password.length < 8) {
        throw new Error("Password minimal 8 karakter.");
      }

      const data = await api("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send-code",
          email: normalizedEmail,
          password,
        }),
      });

      setEmail(normalizedEmail);
      setCodeSent(true);
      setMessage(data.message || "Kode OTP berhasil dikirim.");
    } catch (error: any) {
      setMessage(error.message || "Gagal mengirim OTP.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      if (!/^\d{6}$/.test(code)) {
        throw new Error("Masukkan kode OTP 6 angka.");
      }

      const data = await api("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify-code",
          email: email.trim().toLowerCase(),
          code,
          password,
        }),
      });

      const { data: sessionData, error } =
        await supabase.auth.getSession();

      if (error) throw error;

      if (!sessionData.session) {
        throw new Error(
          data.message ||
            "OTP diterima, tetapi session belum terbentuk. Coba login."
        );
      }

      setUser(sessionData.session.user);
      setMessage("Email berhasil diverifikasi.");
      setCode("");
    } catch (error: any) {
      setMessage(error.message || "Verifikasi gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (!normalizedEmail.endsWith("@gmail.com")) {
        throw new Error("Gunakan alamat Gmail.");
      }

      if (!password) {
        throw new Error("Password wajib diisi.");
      }

      await api("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          email: normalizedEmail,
          password,
        }),
      });

      const { data, error } = await supabase.auth.getUser();

      if (error) throw error;

      if (!data.user) {
        throw new Error("Session login belum terbentuk. Coba lagi.");
      }

      setUser(data.user);
      setMessage("Login berhasil.");
    } catch (error: any) {
      setMessage(error.message || "Login gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);

    try {
      await supabase.auth.signOut();
    } finally {
      setUser(null);
      setTab("terminal");
      setOutput("BARA TERMINAL\nSession ended.\n");
      setFile("");
      setContent("");
      setBusy(false);
    }
  }

  // Terminal
  async function run(cmd = command) {
    const selected = cmd.trim();

    if (!selected || busy) return;

    setBusy(true);
    setOutput("$ " + selected + "\nMenjalankan...\n");

    try {
      const data = await api("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: selected }),
      });

      setOutput(
        "$ " +
          selected +
          "\n" +
          (data.stdout || "") +
          (data.stderr || "") +
          "\n[exit " +
          data.exitCode +
          "]\n"
      );
    } catch (error: any) {
      setOutput(
        "$ " + selected + "\nERROR: " + error.message + "\n"
      );
    } finally {
      setBusy(false);
    }
  }

  function clearTerminal() {
    setOutput("");
  }

  function copyOutput() {
    navigator.clipboard
      .writeText(output)
      .then(() => setMessage("Log berhasil disalin."))
      .catch(() => setMessage("Gagal menyalin log."));
  }

  function exportOutput() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            application: "BARA TERMINAL",
            exportedAt: new Date().toISOString(),
            output,
          },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "bara-terminal-log.json";
    a.click();

    URL.revokeObjectURL(url);
  }

  // File manager
  async function refresh(folder = path) {
    if (busy) return;

    setBusy(true);

    try {
      const data = await api(
        "/api/files?path=" + encodeURIComponent(folder)
      );

      setEntries(data.entries || []);
      setPath(folder);
      setMessage("Folder berhasil diperbarui.");
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function fullPath(name: string) {
    return path === "." ? name : path + "/" + name;
  }

  async function openFile(name: string) {
    const target = fullPath(name);

    setBusy(true);

    try {
      const data = await api("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "read",
          path: target,
        }),
      });

      if (data.exitCode !== undefined && data.exitCode !== 0) {
        throw new Error(data.stderr || "File tidak bisa dibuka.");
      }

      setFile(target);
      setContent(data.content || "");
      setPreview("");
      setTab("editor");
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveFile() {
    if (!file || busy) return;

    setBusy(true);

    try {
      await api("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "write",
          path: file,
          content,
        }),
      });

      setMessage("File berhasil disimpan.");
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function createItem(type: "file" | "folder") {
    const name = window.prompt("Nama " + type + ":");

    if (!name?.trim()) return;

    const target = fullPath(name.trim());

    setBusy(true);

    try {
      await api("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          type === "folder"
            ? { action: "mkdir", path: target }
            : { action: "write", path: target, content: "" }
        ),
      });

      setMessage(type === "folder" ? "Folder dibuat." : "File dibuat.");
      await refresh(path);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteFile(name: string) {
    if (!window.confirm("Hapus " + name + "?")) return;

    const target = fullPath(name);

    setBusy(true);

    try {
      await api("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          path: target,
        }),
      });

      setMessage("Item berhasil dihapus.");
      await refresh(path);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadFile(name: string) {
    try {
      const response = await fetch(
        "/api/files?action=download&path=" +
          encodeURIComponent(fullPath(name))
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
    } catch (error: any) {
      setMessage(error.message);
    }
  }

  async function previewFile(name: string) {
    try {
      const data = await api(
        "/api/files?action=preview&path=" +
          encodeURIComponent(fullPath(name))
      );

      setPreview(data.content || "");
      setMessage("Preview: " + name);
    } catch (error: any) {
      setMessage(error.message);
    }
  }

  // Admin
  async function loadUsers() {
    if (busy) return;

    setBusy(true);

    try {
      const data = await api("/api/admin/users");
      setUsers(data.users || []);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function moderate(id: string, action: string) {
    const reason = window.prompt("Alasan tindakan admin:");

    if (reason === null) return;

    setBusy(true);

    try {
      await api("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action,
          reason,
        }),
      });

      setMessage("Aksi " + action + " berhasil.");

      const data = await api("/api/admin/users");
      setUsers(data.users || []);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  // Loading
  if (loading) {
    return (
      <main className="auth">
        <section className="authCard">
          <small>BARA SYSTEM</small>
          <h1>LOADING...</h1>
          <p>Memeriksa session akun.</p>
        </section>
      </main>
    );
  }

  // Login / Register screen
  if (!user) {
    return (
      <main className="auth">
        <section className="authCard">
          <small>BARA ACCOUNT SYSTEM / V4.0</small>

          <span className="pill">SECURE ACCESS</span>

          <h1>BARA TERMINAL</h1>

          <p>
            Workspace Linux pribadi dengan sistem autentikasi Gmail.
          </p>

          <div className="actions">
            <button
              className={mode === "login" ? "lime" : ""}
              onClick={() => switchMode("login")}
              disabled={busy}
            >
              LOGIN
            </button>

            <button
              className={mode === "signup" ? "lime" : ""}
              onClick={() => switchMode("signup")}
              disabled={busy}
            >
              REGISTER
            </button>
          </div>

          {!codeSent && (
            <>
              <label>EMAIL ADDRESS</label>

              <input
                type="email"
                placeholder="nama@gmail.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />

              <label>PASSWORD</label>

              <input
                type="password"
                placeholder="Minimal 8 karakter"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </>
          )}

          {mode === "login" && (
            <button
              className="lime"
              block
              disabled={busy}
              onClick={login}
            >
              {busy ? "SIGNING IN..." : "LOGIN TO WORKSPACE →"}
            </button>
          )}

          {mode === "signup" && !codeSent && (
            <button
              className="lime"
              block
              disabled={busy}
              onClick={sendCode}
            >
              {busy ? "SENDING CODE..." : "SEND VERIFICATION CODE →"}
            </button>
          )}

          {mode === "signup" && codeSent && (
            <>
              <div className="otpHeading">
                <small>EMAIL VERIFICATION</small>
                <h2>CHECK YOUR GMAIL</h2>
                <p>
                  Kode verifikasi dikirim ke:
                  <br />
                  <b>{email}</b>
                </p>
              </div>

              <label>6-DIGIT OTP CODE</label>

              <input
                className="otpInput"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                disabled={busy}
              />

              <button
                className="lime"
                block
                disabled={busy || code.length !== 6}
                onClick={verifyCode}
              >
                {busy ? "VERIFYING..." : "VERIFY & CONTINUE →"}
              </button>

              <button
                className="plain"
                disabled={busy}
                onClick={() => {
                  setCodeSent(false);
                  setCode("");
                  setMessage("");
                }}
              >
                CHANGE EMAIL / BACK
              </button>
            </>
          )}

          {message && <div className="notice">{message}</div>}

          <p>
            {mode === "signup"
              ? "Registrasi hanya menerima alamat Gmail."
              : "Masuk menggunakan akun Gmail yang sudah terverifikasi."}
          </p>

          <footer>BARA TERMINAL · ACCOUNT SYSTEM</footer>
        </section>
      </main>
    );
  }

  // Main dashboard
  return (
    <main className="shell">
      <header>
        <div>
          <small>LIVE CONSOLE / AUTHENTICATED</small>
          <h1>
            BARA TERMINAL <span className="pill">SAFE MODE</span>
          </h1>
          <p>{user.email}</p>
        </div>

        <button className="red" onClick={logout} disabled={busy}>
          LOGOUT
        </button>
      </header>

      <nav>
        <button
          className={tab === "terminal" ? "active" : ""}
          onClick={() => setTab("terminal")}
        >
          TERMINAL
        </button>

        <button
          className={tab === "files" ? "active" : ""}
          onClick={() => {
            setTab("files");
            refresh(".");
          }}
        >
          FILES
        </button>

        <button
          className={tab === "editor" ? "active" : ""}
          onClick={() => setTab("editor")}
        >
          EDITOR
        </button>

        {isAdmin && (
          <button
            className={tab === "admin" ? "active" : ""}
            onClick={() => {
              setTab("admin");
              loadUsers();
            }}
          >
            ADMIN
          </button>
        )}
      </nav>

      {message && (
        <div className="notice">
          <span>{message}</span>
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}

      {/* TERMINAL */}
      {tab === "terminal" && (
        <section className="panel">
          <div className="panelTitle">
            <small>WORKSPACE / SHELL</small>
            <span className="pill">LINUX</span>
          </div>

          <h2>LIVE CONSOLE</h2>

          <pre className="console">{output}</pre>

          <div className="command">
            <b>$</b>

            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") run();
              }}
              placeholder="Masukkan command Linux..."
              disabled={busy}
            />

            <button
              className="amber"
              disabled={busy}
              onClick={() => run()}
            >
              {busy ? "RUNNING..." : "RUN"}
            </button>
          </div>

          <div className="actions">
            <button onClick={() => run("pwd")} disabled={busy}>
              PWD
            </button>

            <button onClick={() => run("ls -la")} disabled={busy}>
              LIST FILES
            </button>

            <button onClick={copyOutput}>COPY LOG</button>

            <button onClick={exportOutput}>EXPORT JSON</button>

            <button className="red" onClick={clearTerminal}>
              CLEAR
            </button>
          </div>

          <p>
            <small>COMMAND EXECUTION / WORKSPACE ENVIRONMENT</small>
          </p>
        </section>
      )}

      {/* FILE MANAGER */}
      {tab === "files" && (
        <section className="panel">
          <small>WORKSPACE STORAGE</small>
          <h2>FILE MANAGER</h2>

          <div className="command">
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="Workspace path"
            />

            <button
              className="amber"
              disabled={busy}
              onClick={() => refresh()}
            >
              OPEN
            </button>
          </div>

          <div className="actions">
            <button disabled={busy} onClick={() => refresh()}>
              REFRESH
            </button>

            <button disabled={busy} onClick={() => createItem("folder")}>
              + FOLDER
            </button>

            <button disabled={busy} onClick={() => createItem("file")}>
              + FILE
            </button>

            <button
              disabled={busy}
              onClick={() => {
                const parent = path.split("/").slice(0, -1).join("/");
                refresh(parent || ".");
              }}
            >
              ↑ PARENT
            </button>
          </div>

          <div className="fileList">
            {entries.length === 0 ? (
              <div className="fileRow">
                <span>Folder kosong atau belum dimuat.</span>
              </div>
            ) : (
              entries.map((entry) => (
                <div className="fileRow" key={entry.name}>
                  <button
                    className="fileName"
                    disabled={busy}
                    onClick={() => {
                      if (entry.type === "dir") {
                        refresh(fullPath(entry.name));
                      } else {
                        openFile(entry.name);
                      }
                    }}
                  >
                    {entry.type === "dir" ? "📁" : "📄"} {entry.name}
                  </button>

                  {entry.type === "file" && (
                    <div className="actions">
                      <button
                        title="Edit"
                        disabled={busy}
                        onClick={() => openFile(entry.name)}
                      >
                        EDIT
                      </button>

                      <button
                        title="Preview"
                        disabled={busy}
                        onClick={() => previewFile(entry.name)}
                      >
                        VIEW
                      </button>

                      <button
                        title="Download"
                        onClick={() => downloadFile(entry.name)}
                      >
                        DOWNLOAD
                      </button>

                      <button
                        className="red"
                        disabled={busy}
                        onClick={() => deleteFile(entry.name)}
                      >
                        DELETE
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {preview !== "" && (
            <section>
              <h3>FILE PREVIEW</h3>
              <pre className="console">{preview}</pre>
              <button onClick={() => setPreview("")}>
                CLOSE PREVIEW
              </button>
            </section>
          )}
        </section>
      )}

      {/* EDITOR */}
      {tab === "editor" && (
        <section className="panel">
          <small>CODE EDITOR / SAVE ENABLED</small>

          <h2>{file || "SELECT A FILE"}</h2>

          {!file && (
            <div className="notice">
              Pilih file melalui menu FILES untuk mulai mengedit.
            </div>
          )}

          <textarea
            className="editor"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            placeholder="File content..."
          />

          <div className="actions">
            <button
              className="lime"
              disabled={!file || busy}
              onClick={saveFile}
            >
              {busy ? "SAVING..." : "SAVE FILE"}
            </button>

            <button onClick={() => setTab("files")}>
              BACK TO FILES
            </button>
          </div>
        </section>
      )}

      {/* ADMIN */}
      {tab === "admin" && isAdmin && (
        <section className="panel">
          <small>ADMIN CONTROL CENTER</small>
          <h2>USER MODERATION</h2>

          <div className="actions">
            <button
              className="amber"
              disabled={busy}
              onClick={loadUsers}
            >
              REFRESH USERS
            </button>
          </div>

          {users.length === 0 ? (
            <p>Belum ada data user atau daftar belum dimuat.</p>
          ) : (
            users.map((u) => (
              <div className="userRow" key={u.id}>
                <b>{u.email}</b>

                <small>
                  Status: {u.moderation?.status || "active"}
                  {" · "}
                  Joined: {u.created_at?.slice(0, 10) || "-"}
                </small>

                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={() => moderate(u.id, "ban")}
                  >
                    BAN 24H
                  </button>

                  <button
                    className="red"
                    disabled={busy}
                    onClick={() => moderate(u.id, "permanent")}
                  >
                    PERMANENT BAN
                  </button>

                  <button
                    disabled={busy}
                    onClick={() => moderate(u.id, "jail")}
                  >
                    JAIL 10M
                  </button>

                  <button
                    className="amber"
                    disabled={busy}
                    onClick={() => moderate(u.id, "kick")}
                  >
                    KICK
                  </button>

                  <button
                    className="lime"
                    disabled={busy}
                    onClick={() => moderate(u.id, "unban")}
                  >
                    UNBAN
                  </button>

                  <button
                    className="lime"
                    disabled={busy}
                    onClick={() => moderate(u.id, "unjail")}
                  >
                    UNJAIL
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      <footer>
        BARA TERMINAL V4.0 · LINUX WORKSPACE · SUPABASE AUTH
      </footer>
    </main>
  );
}
