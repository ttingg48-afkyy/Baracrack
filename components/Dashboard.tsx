
"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import JsonPanel from "@/components/JsonPanel";
import UpdateManager from "@/components/UpdateManager";
import BaraMascot from "@/components/BaraMascot";

type Tab = "terminal" | "files" | "editor";

type MaintenanceState = {
  enabled: boolean;
  message: string;
  duration_label: string | null;
  expires_at: string | null;
};

type DashboardProps = {
  maintenance: MaintenanceState;
};

export default function Dashboard({ maintenance }: DashboardProps) {
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
  const [tab, setTab] = useState<Tab>("terminal");
  const [showJsonPanel, setShowJsonPanel] = useState(false);

  const [command, setCommand] = useState("");
  const [output, setOutput] = useState(
    "BARA TERMINAL V4.0\nLIVE CONSOLE READY\n"
  );

  const [file, setFile] = useState("");
  const [content, setContent] = useState("");
  const [maintenanceState, setMaintenanceState] =
    useState<MaintenanceState>(maintenance);
  const [cwd, setCwd] = useState("/home/barateriminal");

  const [showPortNotice, setShowPortNotice] = useState(false);
  const [hidePortNotice, setHidePortNotice] = useState(false);

  const api = useCallback(async (url: string, options?: RequestInit) => {
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
      throw new Error("Server mengirim respons tidak valid.");
    }

    if (!response.ok) {
      throw new Error(
        data.error || data.stderr || `Request gagal (${response.status}).`
      );
    }

    return data;
  }, []);

  // AUTH SESSION
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

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user || null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // NOTIFIKASI SETELAH LOGIN
  useEffect(() => {
    if (!user) {
      setShowPortNotice(false);
      return;
    }

    const hidden =
      sessionStorage.getItem("bara-hide-port-notice") === "1";

    setShowPortNotice(!hidden);
  }, [user]);

  // MAINTENANCE CHECK
  useEffect(() => {
    let active = true;

    async function checkMaintenance() {
      try {
        const response = await fetch("/api/maintenance", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        });

        if (!response.ok) return;

        const data = await response.json();

        if (active && typeof data.enabled === "boolean") {
          setMaintenanceState(data);
        }
      } catch {
        // Akan dicoba kembali.
      }
    }

    void checkMaintenance();
    const timer = window.setInterval(checkMaintenance, 2000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  function closePortNotice() {
    setShowPortNotice(false);

    if (hidePortNotice) {
      sessionStorage.setItem("bara-hide-port-notice", "1");
    }
  }

  function switchMode(next: "login" | "signup") {
    setMode(next);
    setCodeSent(false);
    setCode("");
    setMessage("");
  }

  // REGISTER OTP
  async function sendCode() {
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (!/^[a-z0-9._%+-]+@gmail\.com$/i.test(normalizedEmail)) {
        throw new Error("Registrasi hanya menerima alamat Gmail.");
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
      setMessage(data.message || "Kode OTP berhasil dikirim melalui Gmail.");
    } catch (error: any) {
      setMessage(error.message || "Gagal mengirim OTP.");
    } finally {
      setBusy(false);
    }
  }

  // VERIFY OTP
  async function verifyCode() {
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      if (!/^\d{6}$/.test(code)) {
        throw new Error("Masukkan kode OTP enam angka.");
      }

      const normalizedEmail = email.trim().toLowerCase();

      await api("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify-code",
          email: normalizedEmail,
          code,
        }),
      });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error("Login gagal.");

      setUser(data.user);
      setCode("");
      setMessage("Email terverifikasi. Selamat datang!");
    } catch (error: any) {
      setMessage(error.message || "Verifikasi gagal.");
    } finally {
      setBusy(false);
    }
  }

  // LOGIN
  async function login() {
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (!/^[a-z0-9._%+-]+@gmail\.com$/i.test(normalizedEmail)) {
        throw new Error("Gunakan alamat Gmail.");
      }

      if (!password) throw new Error("Password wajib diisi.");

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
      if (!data.user) throw new Error("Session belum terbentuk.");

      setUser(data.user);
      setMessage("Login berhasil.");
    } catch (error: any) {
      setMessage(error.message || "Login gagal.");
    } finally {
      setBusy(false);
    }
  }

  // LOGOUT
  async function logout() {
    if (busy) return;

    setBusy(true);

    try {
      try {
        await fetch("/api/control", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "lock" }),
        });
      } catch {}

      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setUser(null);
      setShowJsonPanel(false);
      setShowPortNotice(false);
      setTab("terminal");
      setCommand("");
      setOutput("BARA TERMINAL V4.0\nSession ended.\n");
      setFile("");
      setContent("");
      setMessage("");
      setCwd("/home/barateriminal");
    } catch (error: any) {
      setMessage(error.message || "Logout gagal.");
    } finally {
      setBusy(false);
    }
  }

  // TERMINAL
  async function run(cmd = command) {
    const selected = cmd.trim();
    if (!selected || busy) return;

    setCommand("");
    setBusy(true);

    setOutput((previous) => {
      const separator = previous && !previous.endsWith("\n") ? "\n" : "";
      return previous + separator + `$ ${selected}\n`;
    });

    try {
      const data = await api("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: selected, cwd }),
      });

      if (data.cwd) setCwd(data.cwd);
      if (data.maintenance) setMaintenanceState(data.maintenance);

      setOutput((previous) =>
        previous +
        (data.stdout || "") +
        (data.stderr || "") +
        `\n[exit ${data.exitCode ?? "unknown"}]\n`
      );
    } catch (error: any) {
      setOutput((previous) =>
        previous + `ERROR: ${error.message || "Command gagal."}\n`
      );
    } finally {
      setBusy(false);
    }
  }

  function clearTerminal() {
    setOutput("");
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(output);
      setMessage("Log berhasil disalin.");
    } catch {
      setMessage("Gagal menyalin log.");
    }
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

  // EDITOR: OPEN FILE
  async function openFileFromPath(target: string) {
    if (busy) return;

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
      setTab("editor");
    } catch (error: any) {
      setMessage(error.message || "Gagal membuka file.");
    } finally {
      setBusy(false);
    }
  }

  // EDITOR: SAVE FILE
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
      setMessage(error.message || "Gagal menyimpan file.");
    } finally {
      setBusy(false);
    }
  }

  // MAINTENANCE
  if (maintenanceState.enabled) {
    const expiryText = maintenanceState.expires_at
      ? new Date(maintenanceState.expires_at).toLocaleString("id-ID", {
          dateStyle: "long",
          timeStyle: "medium",
          timeZone: "Asia/Jakarta",
        })
      : "Tidak ditentukan";

    return (
      <main className="auth">
        <section className="authCard">
          <div style={{ fontSize: 36 }}>⚙</div>
          <small>BARA TERMINAL / SYSTEM NOTICE</small>
          <h1>WEBSITE MAINTENANCE</h1>
          <p>{maintenanceState.message}</p>
          <h2>{maintenanceState.duration_label || "ACTIVE"}</h2>
          <p>Silakan kembali setelah maintenance selesai.</p>
          <small>ESTIMATED END: {expiryText}</small>
        </section>
      </main>
    );
  }

  // LOADING
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

  // LOGIN / REGISTER
  if (!user) {
    return (
      <main className="auth">
        <section className="authCard">
          <small>BARA ACCOUNT SYSTEM / V4.0</small>
          <span className="pill">SECURE ACCESS</span>
          <h1>BARA TERMINAL</h1>
          <p>Workspace Linux pribadi dengan sistem autentikasi Gmail.</p>

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
              style={{ display: "block", width: "100%" }}
              disabled={busy}
              onClick={login}
            >
              {busy ? "SIGNING IN..." : "LOGIN TO WORKSPACE →"}
            </button>
          )}

          {mode === "signup" && !codeSent && (
            <button
              className="lime"
              style={{ display: "block", width: "100%" }}
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
                style={{ display: "block", width: "100%" }}
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
              : "Masuk menggunakan Gmail dan password akun."}
          </p>

          <footer>BARA TERMINAL · ACCOUNT SYSTEM</footer>
        </section>
      </main>
    );
  }

  // DASHBOARD
  return (
    <main className="shell">
      <style jsx global>{`
        .portNoticeBackdrop {
          position: fixed;
          inset: 0;
          z-index: 9998;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 18px;
          pointer-events: none;
        }

        .portNotice {
          pointer-events: auto;
          position: relative;
          width: min(440px, 100%);
          margin-top: 8px;
          padding: 17px;
          border: 1px solid #43505e;
          border-radius: 16px;
          background: #111b25;
          color: #edf4fb;
          box-shadow: 0 18px 65px #000b;
          animation: baraNoticeIn .45s cubic-bezier(.2,.8,.2,1);
        }

        @keyframes baraNoticeIn {
          from { opacity: 0; transform: translateY(-22px) scale(.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .portNoticeClose {
          position: absolute;
          top: 9px;
          right: 10px;
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 9px;
          background: #263442;
          color: white;
          font-size: 21px;
          cursor: pointer;
        }

        .portNoticeCheck {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 14px;
          color: #aebdca;
          font-size: 12px;
        }

        .portNoticeCheck input {
          accent-color: #b9ef77;
        }
      `}</style>

      {showPortNotice && (
        <div className="portNoticeBackdrop">
          <section className="portNotice">
            <button
              className="portNoticeClose"
              onClick={closePortNotice}
              aria-label="Tutup notifikasi"
            >
              ×
            </button>

            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <BaraMascot />

              <div style={{ paddingRight: 20 }}>
                <small style={{ color: "#b9ef77", letterSpacing: 1.5 }}>
                  ✦ BARA SYSTEM NOTICE
                </small>
                <h3 style={{ margin: "7px 0", fontSize: 15 }}>
                  WEB PREVIEW TIDAK TERSEDIA
                </h3>
                <p
                  style={{
                    margin: 0,
                    color: "#aebdca",
                    fontSize: 12,
                    lineHeight: 1.6,
                  }}
                >
                  HTTP port tidak tersedia untuk preview pada versi ini.
                  Terminal dan workspace tetap bisa digunakan.
                </p>
              </div>
            </div>

            <label className="portNoticeCheck">
              <input
                type="checkbox"
                checked={hidePortNotice}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setHidePortNotice(checked);

                  if (checked) {
                    sessionStorage.setItem("bara-hide-port-notice", "1");
                  } else {
                    sessionStorage.removeItem("bara-hide-port-notice");
                  }
                }}
              />
              Tidak ditampilkan lagi selama buka website
            </label>
          </section>
        </div>
      )}

      <header>
        <div>
          <small>LIVE CONSOLE / AUTHENTICATED</small>
          <h1>
            BARA TERMINAL <span className="pill">SAFE MODE</span>
          </h1>
          <p>{user.email}</p>
        </div>

        <div className="headerActions">
          <button className="amber" onClick={() => setShowJsonPanel(true)}>
            JSON ↗
          </button>
          <button className="red" onClick={logout} disabled={busy}>
            LOGOUT
          </button>
        </div>
      </header>

      {showJsonPanel && (
        <JsonPanel onClose={() => setShowJsonPanel(false)} />
      )}

      <nav>
        <button
          className={tab === "terminal" ? "active" : ""}
          onClick={() => setTab("terminal")}
        >
          TERMINAL
        </button>
        <button
          className={tab === "files" ? "active" : ""}
          onClick={() => setTab("files")}
        >
          UPDATE / IMPORT
        </button>
        <button
          className={tab === "editor" ? "active" : ""}
          onClick={() => setTab("editor")}
        >
          EDITOR
        </button>
      </nav>

      {message && (
        <div className="notice">
          <span>{message}</span>
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}

      {tab === "terminal" && (
        <section className="panel">
          <div className="panelTitle">
            <small>WORKSPACE / SHELL</small>
            <span className="pill">LINUX</span>
          </div>

          <h2>LIVE CONSOLE</h2>

          <small
            style={{
              display: "block",
              color: "#9daaba",
              marginBottom: 10,
              overflowWrap: "anywhere",
            }}
          >
            {cwd}
          </small>

          <pre className="console">{output}</pre>

          <div className="command">
            <b>$</b>
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void run();
              }}
              placeholder="Masukkan command Linux..."
              disabled={busy}
            />
            <button
              className="amber"
              disabled={busy || !command.trim()}
              onClick={() => void run()}
            >
              {busy ? "RUNNING..." : "RUN"}
            </button>
          </div>

          <div className="actions">
            <button onClick={() => void run("pwd")} disabled={busy}>PWD</button>
            <button onClick={() => void run("ls -la")} disabled={busy}>LIST FILES</button>
            <button onClick={copyOutput}>COPY LOG</button>
            <button onClick={exportOutput}>EXPORT JSON</button>
            <button className="red" onClick={clearTerminal}>CLEAR</button>
          </div>

          <p>
            <small>COMMAND EXECUTION / WORKSPACE ENVIRONMENT</small>
          </p>
        </section>
      )}

      <div style={{ display: tab === "files" ? "block" : "none" }}>
        <UpdateManager
          onContinue={() => setTab("terminal")}
          onEditFile={(path) => void openFileFromPath(path)}
        />
      </div>

      {tab === "editor" && (
        <section className="panel">
          <small>CODE EDITOR / SAVE ENABLED</small>
          <h2>{file || "SELECT A FILE"}</h2>

          {!file && (
            <div className="notice">
              Pilih file melalui workspace untuk mulai mengedit.
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
              onClick={() => void saveFile()}
            >
              {busy ? "SAVING..." : "SAVE FILE"}
            </button>
            <button onClick={() => setTab("files")}>BACK TO FILES</button>
          </div>
        </section>
      )}

      <footer>
        BARA TERMINAL V4.0 · LINUX WORKSPACE
      </footer>
    </main>
  );
}
