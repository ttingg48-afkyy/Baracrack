
"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type Entry = {
  name: string;
  type: "dir" | "file";
};

type ApiResponse = {
  stdout?: string;
  stderr?: string;
  error?: string;
  exitCode?: number;
  content?: string;
  entries?: Entry[];
  users?: any[];
  ok?: boolean;
};

export default function Dashboard() {
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  );

  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("terminal");

  const [command, setCommand] = useState("pwd");
  const [output, setOutput] = useState(
    "BARA TERMINAL v3.0\n" +
    "Vercel Sandbox Edition\n" +
    "Ketik command Linux lalu tekan RUN.\n\n"
  );

  const [path, setPath] = useState(".");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [file, setFile] = useState("");
  const [content, setContent] = useState("");
  const [users, setUsers] = useState<any[]>([]);

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  // Membaca respons API dengan aman
  async function api<T = ApiResponse>(
    url: string,
    options?: RequestInit
  ): Promise<T> {
    const response = await fetch(url, options);
    const raw = await response.text();

    let data: any;

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(
        `Server mengirim respons bukan JSON (HTTP ${response.status}). ` +
        `Periksa API atau konfigurasi deployment Vercel.`
      );
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        data.message ||
        `Request gagal (HTTP ${response.status})`
      );
    }

    return data as T;
  }

  // Periksa sesi login
  useEffect(() => {
    let active = true;

    async function checkUser() {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (error) throw error;

        if (active) {
          setUser(data.user);
        }
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setAuthLoading(false);
      }
    }

    checkUser();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Login dan daftar
  async function auth() {
    if (!email.trim() || !password) {
      setMessage("Email dan password wajib diisi.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password
        });

        if (error) throw error;

        if (data.session) {
          setUser(data.user);
          setMessage("Pendaftaran berhasil.");
        } else {
          setMessage(
            "Pendaftaran berhasil. Periksa email untuk konfirmasi akun."
          );
        }
      } else {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password
          });

        if (error) throw error;

        setUser(data.user);
        setMessage("Login berhasil.");
      }
    } catch (e: any) {
      setMessage(e.message || "Autentikasi gagal.");
    } finally {
      setBusy(false);
    }
  }

  // Jalankan command terminal
  async function run(cmd?: string) {
    const selectedCommand = (cmd ?? command).trim();

    if (!selectedCommand || busy) return;

    setBusy(true);
    setOutput((old) => old + `$ ${selectedCommand}\n`);

    try {
      const data = await api<ApiResponse>("/api/terminal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          command: selectedCommand
        })
      });

      setOutput((old) =>
        old +
        (data.stdout || "") +
        (data.stderr || "") +
        `\n[exit ${data.exitCode ?? "—"}]\n\n`
      );
    } catch (e: any) {
      setOutput((old) =>
        old + `ERROR: ${e.message || "Terminal error"}\n\n`
      );
    } finally {
      setBusy(false);
    }
  }

  // Refresh file manager
  async function refresh(p = path) {
    setBusy(true);
    setMessage("");

    try {
      const data = await api<ApiResponse>(
        `/api/files?path=${encodeURIComponent(p)}`
      );

      setEntries(data.entries || []);
      setPath(p);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Buka file
  async function openFile(name: string) {
    const full = path === "." ? name : `${path}/${name}`;

    setBusy(true);
    setMessage("");

    try {
      const data = await api<ApiResponse>("/api/files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "read",
          path: full
        })
      });

      if (data.exitCode !== 0) {
        throw new Error(data.stderr || "Tidak bisa membuka file.");
      }

      setFile(full);
      setContent(data.content || "");
      setTab("editor");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Simpan file
  async function saveFile() {
    if (!file) return;

    setBusy(true);
    setMessage("");

    try {
      const data = await api<ApiResponse>("/api/files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "write",
          path: file,
          content
        })
      });

      setMessage(
        data.ok
          ? "File berhasil disimpan."
          : data.stderr || "Gagal menyimpan file."
      );
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Buat file atau folder
  async function createItem(type: "file" | "folder") {
    const name = prompt(
      type === "folder" ? "Nama folder?" : "Nama file?"
    );

    if (!name?.trim()) return;

    const target =
      path === "." ? name.trim() : `${path}/${name.trim()}`;

    setBusy(true);

    try {
      if (type === "folder") {
        await api("/api/files", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: "mkdir",
            path: target
          })
        });
      } else {
        await api("/api/files", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: "write",
            path: target,
            content: ""
          })
        });
      }

      setMessage(
        type === "folder"
          ? "Folder berhasil dibuat."
          : "File berhasil dibuat."
      );

      await refresh(path);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Admin: ambil daftar user
  async function adminLoad() {
    setBusy(true);

    try {
      const data = await api<ApiResponse>("/api/admin/users");
      setUsers(data.users || []);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Admin: aksi akun
  async function adminAction(id: string, action: string) {
    const labels: Record<string, string> = {
      ban: "BAN 24 JAM",
      permanent: "PERMANENT BAN",
      unban: "UNBAN"
    };

    if (!confirm(`Yakin melakukan ${labels[action] || action}?`)) {
      return;
    }

    setBusy(true);

    try {
      const data = await api<ApiResponse>("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id,
          action
        })
      });

      setMessage(
        data.ok ? "Aksi admin berhasil." : "Aksi admin gagal."
      );

      await adminLoad();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Logout
  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    setTab("terminal");
    setMessage("Berhasil logout.");
  }

  if (authLoading) {
    return (
      <main className="auth">
        <section className="authCard">
          <small>LIVE CONSOLE</small>
          <h1>BARA TERMINAL</h1>
          <p>Memeriksa sesi akun...</p>
        </section>
      </main>
    );
  }

  // Halaman login
  if (!user) {
    return (
      <main className="auth">
        <section className="authCard">
          <small>LIVE CONSOLE / ACCOUNT</small>

          <h1>BARA TERMINAL</h1>
          <p>Workspace Linux personal lo.</p>

          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
          />

          <input
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            onKeyDown={(e) => e.key === "Enter" && auth()}
          />

          <button
            className="lime"
            disabled={busy}
            onClick={auth}
          >
            {busy
              ? "TUNGGU..."
              : mode === "login"
                ? "LOGIN"
                : "DAFTAR"}
          </button>

          <button
            className="plain"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setMessage("");
            }}
          >
            {mode === "login"
              ? "Belum punya akun? Daftar"
              : "Sudah punya akun? Login"}
          </button>

          {message && <p className="notice">{message}</p>}
        </section>
      </main>
    );
  }

  const isAdmin =
    user.email?.toLowerCase() === adminEmail?.toLowerCase();

  return (
    <main className="shell">
      <header>
        <div>
          <small>LIVE CONSOLE</small>
          <h1>
            BARA TERMINAL <span className="pill">SAFE MODE</span>
          </h1>
          <p>{user.email}</p>
        </div>

        <button className="plain" onClick={logout}>
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
              adminLoad();
            }}
          >
            ADMIN
          </button>
        )}
      </nav>

      {message && (
        <div className="notice">
          {message}
          <button
            className="plain"
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </div>
      )}

      {/* TERMINAL */}
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
              onKeyDown={(e) => {
                if (e.key === "Enter") run();
              }}
              placeholder="npm install, python app.py, ls -la ..."
            />

            <button
              className="amber"
              onClick={() => run()}
              disabled={busy}
            >
              {busy ? "RUNNING..." : "RUN ↗"}
            </button>
          </div>

          <div className="actions">
            <button
              className="lime"
              disabled={busy}
              onClick={() => {
                setCommand("pwd");
                run("pwd");
              }}
            >
              START / PWD
            </button>

            <button
              className="amber"
              disabled={busy}
              onClick={() =>
                run("pkill -f 'python|node' || true")
              }
            >
              STOP PROCESSES
            </button>

            <button
              className="red"
              onClick={() => setOutput("")}
            >
              CLEAR LOG
            </button>
          </div>
        </section>
      )}

      {/* FILE MANAGER */}
      {tab === "files" && (
        <section className="panel">
          <small>YOUR STORAGE</small>
          <h2>File manager</h2>

          <div className="command">
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="folder/subfolder"
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
            <button
              disabled={busy}
              onClick={() => refresh()}
            >
              REFRESH
            </button>

            <button
              className="amber"
              disabled={busy}
              onClick={() => createItem("folder")}
            >
              + FOLDER
            </button>

            <button
              disabled={busy}
              onClick={() => createItem("file")}
            >
              + FILE
            </button>
          </div>

          <div className="fileList">
            {entries.length === 0 ? (
              <p>Folder kosong atau belum dimuat.</p>
            ) : (
              entries.map((entry) => (
                <div className="fileRow" key={entry.name}>
                  <button
                    className="fileName"
                    onClick={() => {
                      if (entry.type === "dir") {
                        refresh(
                          path === "."
                            ? entry.name
                            : `${path}/${entry.name}`
                        );
                      } else {
                        openFile(entry.name);
                      }
                    }}
                  >
                    {entry.type === "dir" ? "📁" : "▤"}{" "}
                    {entry.name}
                  </button>

                  <span>{entry.type}</span>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* EDITOR */}
      {tab === "editor" && (
        <section className="panel">
          <small>CODE EDITOR</small>
          <h2>{file || "Pilih file dari File Manager"}</h2>

          <textarea
            className="editor"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            placeholder="Isi file akan tampil di sini..."
          />

          <div className="actions">
            <button
              className="amber"
              onClick={saveFile}
              disabled={!file || busy}
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
          <small>ADMIN CONTROL</small>
          <h2>Account history</h2>

          <button
            className="amber"
            onClick={adminLoad}
            disabled={busy}
          >
            REFRESH USERS
          </button>

          {users.map((u) => (
            <div className="userRow" key={u.id}>
              <b>{u.email}</b>

              <small>
                Joined: {u.created_at?.slice(0, 10)}
                {" · "}
                Last login:{" "}
                {u.last_sign_in_at?.slice(0, 10) || "—"}
              </small>

              <div className="actions">
                <button
                  disabled={busy}
                  onClick={() => adminAction(u.id, "ban")}
                >
                  BAN 24H
                </button>

                <button
                  className="red"
                  disabled={busy}
                  onClick={() => adminAction(u.id, "permanent")}
                >
                  PERMA BAN
                </button>

                <button
                  className="lime"
                  disabled={busy}
                  onClick={() => adminAction(u.id, "unban")}
                >
                  UNBAN
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <footer>
        BARA TERMINAL v3.0 · NEO BRUTALISM · VERCEL SANDBOX
      </footer>
    </main>
  );
}
