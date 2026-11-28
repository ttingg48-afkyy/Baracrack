
"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import JsonPanel from "@/components/JsonPanel";
import UpdateManager from "@/components/UpdateManager";

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

  // MAINTENANCE LIVE STATE
  const [maintenanceState, setMaintenanceState] =
    useState<MaintenanceState>(maintenance);

  // TERMINAL CURRENT DIRECTORY
  const [cwd, setCwd] = useState("/home/barateriminal");

  // API HELPER
  const api = useCallback(
    async (url: string, options?: RequestInit) => {
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
          data.error ||
            data.stderr ||
            `Request gagal (${response.status}).`
        );
      }

      return data;
    },
    []
  );

  // =====================================
  // AUTH SESSION
  // =====================================

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
      if (active) {
        setUser(session?.user || null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // =====================================
  // LIVE MAINTENANCE CHECK
  // =====================================

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

        if (
          active &&
          typeof data.enabled === "boolean"
        ) {
          setMaintenanceState(data);
        }
      } catch {
        // Akan mencoba kembali pada interval berikutnya.
      }
    }

    void checkMaintenance();

    const timer = window.setInterval(
      checkMaintenance,
      2000
    );

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  // =====================================
  // AUTH MODE
  // =====================================

  function switchMode(next: "login" | "signup") {
    setMode(next);
    setCodeSent(false);
    setCode("");
    setMessage("");
  }

  // =====================================
  // REGISTER / SEND OTP
  // =====================================

  async function sendCode() {
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (!/^[a-z0-9._%+-]+@gmail\.com$/i.test(normalizedEmail)) {
        throw new Error(
          "Registrasi hanya menerima alamat Gmail."
        );
      }

      if (password.length < 8) {
        throw new Error("Password minimal 8 karakter.");
      }

      const data = await api("/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "send-code",
          email: normalizedEmail,
          password,
        }),
      });

      setEmail(normalizedEmail);
      setCodeSent(true);

      setMessage(
        data.message ||
          "Kode OTP berhasil dikirim melalui Gmail."
      );
    } catch (error: any) {
      setMessage(error.message || "Gagal mengirim OTP.");
    } finally {
      setBusy(false);
    }
  }

  // =====================================
  // VERIFY OTP
  // =====================================

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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "verify-code",
          email: normalizedEmail,
          code,
        }),
      });

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (error) throw error;

      if (!data.user) {
        throw new Error(
          "Verifikasi berhasil, tetapi login gagal."
        );
      }

      setUser(data.user);
      setCode("");
      setMessage("Email terverifikasi. Selamat datang!");
    } catch (error: any) {
      setMessage(error.message || "Verifikasi gagal.");
    } finally {
      setBusy(false);
    }
  }

  // =====================================
  // LOGIN
  // =====================================

  async function login() {
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (!/^[a-z0-9._%+-]+@gmail\.com$/i.test(normalizedEmail)) {
        throw new Error("Gunakan alamat Gmail.");
      }

      if (!password) {
        throw new Error("Password wajib diisi.");
      }

      await api("/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "login",
          email: normalizedEmail,
          password,
        }),
      });

      const { data, error } = await supabase.auth.getUser();

      if (error) throw error;

      if (!data.user) {
        throw new Error(
          "Session belum terbentuk. Coba login lagi."
        );
      }

      setUser(data.user);
      setMessage("Login berhasil.");
    } catch (error: any) {
      setMessage(error.message || "Login gagal.");
    } finally {
      setBusy(false);
    }
  }

  // =====================================
  // LOGOUT
  // =====================================

  async function logout() {
    if (busy) return;

    setBusy(true);

    try {
      try {
        await fetch("/api/control", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "lock",
          }),
        });
      } catch {
        // Tetap lanjut logout.
      }

      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      setUser(null);
      setShowJsonPanel(false);
      setTab("terminal");
      setCommand("");
      setOutput(
        "BARA TERMINAL V4.0\nSession ended.\n"
      );
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

  // =====================================
  // TERMINAL
  // =====================================

  async function run(cmd = command) {
    const selected = cmd.trim();

    if (!selected || busy) return;

    setCommand("");
    setBusy(true);

    setOutput((previous) => {
      const separator =
        previous && !previous.endsWith("\n")
          ? "\n"
          : "";

      return previous + separator + `$ ${selected}\n`;
    });

    try {
      const data = await api("/api/terminal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          command: selected,
          cwd,
        }),
      });

      if (data.cwd) {
        setCwd(data.cwd);
      }

      if (data.maintenance) {
        setMaintenanceState(data.maintenance);
      }

      const stdout = data.stdout || "";
      const stderr = data.stderr || "";

      const result =
        (stdout ? stdout : "") +
        (stderr ? stderr : "") +
        `\n[exit ${data.exitCode ?? "unknown"}]\n`;

      setOutput((previous) => previous + result);
    } catch (error: any) {
      setOutput(
        (previous) =>
          previous +
          `ERROR: ${error.message || "Command gagal."}\n`
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
      {
        type: "application/json",
      }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "bara-terminal-log.json";
    a.click();

    URL.revokeObjectURL(url);
  }

  // =====================================
  // OPEN EDITOR
  // =====================================

  async function openFileFromPath(target: string) {
    if (busy) return;

    setBusy(true);

    try {
      const data = await api("/api/files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "read",
          path: target,
        }),
      });

      if (
        data.exitCode !== undefined &&
        data.exitCode !== 0
      ) {
        throw new Error(
          data.stderr || "File tidak bisa dibuka."
        );
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

  // =====================================
  // SAVE EDITOR
  // =====================================

  async function saveFile() {
    if (!file || busy) return;

    setBusy(true);

    try {
      await api("/api/files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

  // =====================================
  // GLOBAL MAINTENANCE SCREEN
  // =====================================

  if (maintenanceState.enabled) {
    const expiryText = maintenanceState.expires_at
      ? new Date(
          maintenanceState.expires_at
        ).toLocaleString("id-ID", {
          dateStyle: "long",
          timeStyle: "medium",
          timeZone: "Asia/Jakarta",
        })
      : "Tidak ditentukan";

    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#080b10",
          color: "#f3f4f6",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <section
          style={{
            width: "100%",
            maxWidth: 560,
            padding: "38px 26px",
            border: "1px solid #303946",
            borderRadius: 18,
            background: "#111820",
            textAlign: "center",
            boxShadow: "0 20px 70px #0008",
          }}
        >
          <div
            style={{
              width: 68,
              height: 68,
              margin: "0 auto 22px",
              display: "grid",
              placeItems: "center",
              borderRadius: "50%",
              background: "#302719",
              color: "#ffbd55",
              fontSize: 30,
            }}
          >
            ⚙
          </div>

          <small
            style={{
              color: "#a3adba",
              letterSpacing: 3,
              fontSize: 11,
            }}
          >
            BARA TERMINAL / SYSTEM NOTICE
          </small>

          <h1
            style={{
              margin: "18px 0",
              fontSize: 30,
              letterSpacing: 1,
            }}
          >
            WEBSITE MAINTENANCE
          </h1>

          <p
            style={{
              color: "#c7d0da",
              fontSize: 16,
              lineHeight: 1.8,
              overflowWrap: "anywhere",
            }}
          >
            {maintenanceState.message}
          </p>

          <div
            style={{
              marginTop: 28,
              padding: 20,
              borderRadius: 12,
              background: "#1a2430",
              border: "1px solid #354252",
            }}
          >
            <small style={{ color: "#9daaba" }}>
              ESTIMATED MAINTENANCE DURATION
            </small>

            <div
              style={{
                marginTop: 8,
                color: "#ffbd55",
                fontSize: 34,
                fontWeight: 800,
              }}
            >
              {maintenanceState.duration_label || "ACTIVE"}
            </div>
          </div>

          <p
            style={{
              marginTop: 22,
              color: "#9daaba",
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            Website sedang dalam pemeliharaan.
            <br />
            Silakan kembali setelah waktu maintenance berakhir.
          </p>

          <div
            style={{
              marginTop: 22,
              paddingTop: 18,
              borderTop: "1px solid #303946",
              color: "#7f8b99",
              fontSize: 12,
            }}
          >
            ESTIMATED END
            <br />
            <b style={{ color: "#c7d0da" }}>
              {expiryText}
            </b>
          </div>

          <div
            style={{
              marginTop: 26,
              color: "#657383",
              fontSize: 11,
              letterSpacing: 2,
            }}
          >
            BARA TERMINAL · SYSTEM MAINTENANCE
          </div>
        </section>
      </main>
    );
  }

  // =====================================
  // LOADING
  // =====================================

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

  // =====================================
  // AUTH SCREEN
  // =====================================

  if (!user) {
    return (
      <main className="auth">
        <section className="authCard">
          <small>BARA ACCOUNT SYSTEM / V4.0</small>

          <span className="pill">
            SECURE ACCESS
          </span>

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
                  mode === "login"
                    ? "current-password"
                    : "new-password"
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
              style={{
                display: "block",
                width: "100%",
              }}
              disabled={busy}
              onClick={login}
            >
              {busy
                ? "SIGNING IN..."
                : "LOGIN TO WORKSPACE →"}
            </button>
          )}

          {mode === "signup" && !codeSent && (
            <button
              className="lime"
              style={{
                display: "block",
                width: "100%",
              }}
              disabled={busy}
              onClick={sendCode}
            >
              {busy
                ? "SENDING CODE..."
                : "SEND VERIFICATION CODE →"}
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
                  setCode(
                    e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 6)
                  )
                }
                disabled={busy}
              />

              <button
                className="lime"
                style={{
                  display: "block",
                  width: "100%",
                }}
                disabled={busy || code.length !== 6}
                onClick={verifyCode}
              >
                {busy
                  ? "VERIFYING..."
                  : "VERIFY & CONTINUE →"}
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

          {message && (
            <div className="notice">{message}</div>
          )}

          <p>
            {mode === "signup"
              ? "Registrasi hanya menerima alamat Gmail."
              : "Masuk menggunakan Gmail dan password akun."}
          </p>

          <footer>
            BARA TERMINAL · ACCOUNT SYSTEM
          </footer>
        </section>
      </main>
    );
  }

  // =====================================
  // DASHBOARD
  // =====================================

  return (
    <main className="shell">
      <header>
        <div>
          <small>LIVE CONSOLE / AUTHENTICATED</small>

          <h1>
            BARA TERMINAL{" "}
            <span className="pill">SAFE MODE</span>
          </h1>

          <p>{user.email}</p>
        </div>

        <div className="headerActions">
          <button
            className="amber"
            onClick={() => setShowJsonPanel(true)}
          >
            JSON ↗
          </button>

          <button
            className="red"
            onClick={logout}
            disabled={busy}
          >
            LOGOUT
          </button>
        </div>
      </header>

      {showJsonPanel && (
        <JsonPanel
          onClose={() => setShowJsonPanel(false)}
        />
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

          <button onClick={() => setMessage("")}>
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
                if (e.key === "Enter") {
                  void run();
                }
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
            <button
              onClick={() => void run("pwd")}
              disabled={busy}
            >
              PWD
            </button>

            <button
              onClick={() => void run("ls -la")}
              disabled={busy}
            >
              LIST FILES
            </button>

            <button onClick={copyOutput}>
              COPY LOG
            </button>

            <button onClick={exportOutput}>
              EXPORT JSON
            </button>

            <button
              className="red"
              onClick={clearTerminal}
            >
              CLEAR
            </button>
          </div>

          <p>
            <small>
              COMMAND EXECUTION / WORKSPACE ENVIRONMENT
            </small>
          </p>
        </section>
      )}

      {/* UPDATE MANAGER - KEEP MOUNTED */}
      <div
        style={{
          display: tab === "files" ? "block" : "none",
        }}
      >
        <UpdateManager
          onContinue={() => setTab("terminal")}
        />
      </div>

      {/* EDITOR */}
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

            <button
              onClick={() => setTab("files")}
            >
              BACK TO FILES
            </button>
          </div>
        </section>
      )}

      <footer>
        BARA TERMINAL V4.0 · LINUX WORKSPACE · SUPABASE AUTH
      </footer>
    </main>
  );
}
