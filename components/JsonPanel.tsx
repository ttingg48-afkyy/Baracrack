
"use client";

import { useEffect, useState } from "react";

type Account = {
  email: string | null;
  last_login: string | null;
  status: string;
  expires_at: string | null;
  muted: boolean;
};

export default function JsonPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [users, setUsers] = useState<Account[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(
    method: string,
    body?: Record<string, string>
  ) {
    const response = await fetch("/api/control", {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request gagal.");
    }

    return data;
  }

  async function loadUsers() {
    const data = await request("GET");
    setUsers(data.users || []);
  }

  useEffect(() => {
    void loadUsers()
      .then(() => setUnlocked(true))
      .catch(() => setUnlocked(false));
  }, []);

  async function unlock() {
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      await request("POST", { action: "unlock", pin });
      setPin("");
      await loadUsers();
      setUnlocked(true);
      setMessage("Panel berhasil dibuka.");
    } catch (error: any) {
      setMessage(error.message || "PIN salah.");
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    try {
      await request("POST", { action: "lock" });
    } catch {
      // Panel tetap ditutup di tampilan.
    }

    setUnlocked(false);
    setUsers([]);
    setPin("");
  }

  async function refresh() {
    setBusy(true);

    try {
      await loadUsers();
      setMessage("Data berhasil diperbarui.");
    } catch (error: any) {
      setMessage(error.message);
      setUnlocked(false);
    } finally {
      setBusy(false);
    }
  }

  async function act(
    action: string,
    email: string,
    duration?: string
  ) {
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      await request("POST", {
        action,
        email,
        duration: duration || "",
      });

      await loadUsers();
      setMessage(`${action.toUpperCase()} berhasil: ${email}`);
    } catch (error: any) {
      setMessage(error.message || "Aksi gagal.");
    } finally {
      setBusy(false);
    }
  }

  function askDuration(action: "ban" | "jail", email: string) {
    const duration = window.prompt(
      `Durasi ${action} untuk ${email}.\nContoh: 77day, 2hours, 30seconds, permanent`
    );

    if (!duration) return;

    void act(action, email, duration);
  }

  const jsonText = JSON.stringify(
    users.map((user) => ({
      email: user.email,
      last_login: user.last_login,
      status: user.status,
      expires_at: user.expires_at,
      muted: user.muted,
    })),
    null,
    2
  );

  return (
    <div className="jsonOverlay">
      <section className="jsonPanel">
        <div className="jsonHeader">
          <div>
            <small>BARA CONTROL SYSTEM</small>
            <h2>JSON DATABASE</h2>
          </div>
          <button className="red" onClick={onClose}>CLOSE</button>
        </div>

        {!unlocked ? (
          <div className="jsonUnlock">
            <h3>PANEL LOCKED</h3>
            <p>Masukkan PIN untuk membuka pengelolaan akun.</p>
            <input
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void unlock();
              }}
              placeholder="PANEL PIN"
              autoComplete="current-password"
            />
            <button
              className="lime"
              disabled={busy || !pin}
              onClick={() => void unlock()}
            >
              {busy ? "CHECKING..." : "UNLOCK PANEL"}
            </button>
          </div>
        ) : (
          <>
            <div className="actions">
              <button
                className="amber"
                disabled={busy}
                onClick={() => void refresh()}
              >
                REFRESH DATA
              </button>
              <button className="red" onClick={() => void lock()}>
                LOCK PANEL
              </button>
            </div>

            <div className="jsonCount">
              TOTAL ACCOUNT: {users.length}
            </div>

            <pre className="jsonOutput">{jsonText}</pre>

            <h3>ACCOUNT ACTIONS</h3>

            <div className="jsonAccounts">
              {users.map((user) => (
                <article className="jsonAccount" key={user.email}>
                  <b>{user.email || "NO EMAIL"}</b>
                  <small>
                    LOGIN: {user.last_login
                      ? new Date(user.last_login).toLocaleString()
                      : "NEVER"}
                  </small>
                  <small>
                    STATUS: {user.status} · MUTE: {user.muted ? "YES" : "NO"}
                  </small>

                  <div className="actions">
                    <button
                      disabled={busy}
                      onClick={() => askDuration("ban", user.email || "")}
                    >
                      BAN
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void act("unban", user.email || "")}
                    >
                      UNBAN
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => askDuration("jail", user.email || "")}
                    >
                      JAIL
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void act("unjail", user.email || "")}
                    >
                      UNJAIL
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void act("mute", user.email || "")}
                    >
                      MUTE
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void act("unmute", user.email || "")}
                    >
                      UNMUTE
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {message && <div className="notice">{message}</div>}
      </section>
    </div>
  );
}
