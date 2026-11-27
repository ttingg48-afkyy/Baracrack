
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { adminClient } from "@/lib/supabase";

const COOKIE_NAME = "bara_panel_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;

function sessionSecret() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SESSION_SECRET_MISSING");
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret())
    .update(value)
    .digest("hex");
}

export function verifyPin(pin: string) {
  const expected = process.env.BARA_PANEL_PIN;

  if (!expected || !pin) return false;

  const a = Buffer.from(pin);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

export function createPanelToken() {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const value = String(expires);
  return `${value}.${sign(value)}`;
}

export function verifyPanelToken(token: string) {
  const [expires, signature] = token.split(".");
  if (!expires || !signature) return false;

  const expiry = Number(expires);
  if (!Number.isFinite(expiry) || expiry <= Date.now() / 1000) {
    return false;
  }

  const expected = Buffer.from(sign(expires));
  const actual = Buffer.from(signature);

  return (
    expected.length === actual.length &&
    timingSafeEqual(expected, actual)
  );
}

export async function hasPanelSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value || "";
  return verifyPanelToken(token);
}

export async function assertAccountAccess(email: string) {
  const admin = adminClient();

  const { data, error } = await admin
    .from("bara_account_controls")
    .select("status, expires_at")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error("[BARA CONTROL CHECK]", error);
    throw new Error("CONTROL_DATABASE_ERROR");
  }

  if (!data) return;

  const status = data.status;

  if (status !== "banned" && status !== "jailed") {
    return;
  }

  const expiry = data.expires_at
    ? new Date(data.expires_at).getTime()
    : null;

  const permanent =
    expiry === null || !Number.isFinite(expiry);

  if (permanent || expiry > Date.now()) {
    throw new Error(
      status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_JAILED"
    );
  }

  await admin
    .from("bara_account_controls")
    .update({
      status: "active",
      expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("email", email.toLowerCase());
}

export function parseDuration(input: string) {
  const value = input.trim().toLowerCase();

  const match = value.match(
    /^(\d+)(seconds?|secs?|detik|s|minutes?|mins?|menit|m|hours?|hrs?|jam|h|days?|day|hari|d)$/
  );

  if (!match) {
    throw new Error(
      "Durasi tidak valid. Contoh: 30seconds, 2hours, 77day."
    );
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new Error("Durasi harus lebih dari 0.");
  }

  let multiplier = 1000;

  if (/^(minutes?|mins?|menit|m)$/.test(unit)) {
    multiplier = 60 * 1000;
  } else if (/^(hours?|hrs?|jam|h)$/.test(unit)) {
    multiplier = 60 * 60 * 1000;
  } else if (/^(days?|day|hari|d)$/.test(unit)) {
    multiplier = 24 * 60 * 60 * 1000;
  }

  const milliseconds = amount * multiplier;

  if (!Number.isSafeInteger(milliseconds)) {
    throw new Error("Durasi terlalu besar.");
  }

  return new Date(Date.now() + milliseconds).toISOString();
}

export async function setAccountControl(
  email: string,
  action: string,
  duration?: string
) {
  const normalized = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Format email tidak valid.");
  }

  const admin = adminClient();
  const now = new Date().toISOString();

  let status = "active";
  let expiresAt: string | null = null;
  let muted: boolean | undefined;

  if (action === "ban" || action === "jail") {
    if (!duration) {
      throw new Error("Durasi wajib diisi.");
    }

    status = action === "ban" ? "banned" : "jailed";

    if (duration.toLowerCase() !== "permanent") {
      expiresAt = parseDuration(duration);
    }
  } else if (action === "unban" || action === "unjail") {
    status = "active";
  } else if (action === "mute") {
    muted = true;
  } else if (action === "unmute") {
    muted = false;
  } else {
    throw new Error("Aksi tidak dikenal.");
  }

  const { data: existing, error: readError } = await admin
    .from("bara_account_controls")
    .select("muted")
    .eq("email", normalized)
    .maybeSingle();

  if (readError) throw readError;

  const record: Record<string, any> = {
    email: normalized,
    status,
    expires_at: expiresAt,
    updated_at: now,
  };

  if (muted !== undefined) {
    record.muted = muted;
  } else {
    record.muted = existing?.muted ?? false;
  }

  const { error } = await admin
    .from("bara_account_controls")
    .upsert(record, { onConflict: "email" });

  if (error) throw error;

  return {
    email: normalized,
    status,
    expires_at: expiresAt,
    muted: record.muted,
  };
}

export async function assertNotMuted(email: string) {
  const { data, error } = await adminClient()
    .from("bara_account_controls")
    .select("muted")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) throw new Error("CONTROL_DATABASE_ERROR");

  if (data?.muted) {
    throw new Error("ACCOUNT_MUTED");
  }
}
