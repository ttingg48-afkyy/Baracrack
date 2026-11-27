
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const ADMIN_EMAIL = "baraknowgaming@gmail.com";

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("SUPABASE_PUBLIC_CONFIG_MISSING");
  }

  return { url, anonKey };
}

// Supabase client dengan session cookie
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items) {
        try {
          items.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Cookie tidak dapat ditulis dari Server Component.
        }
      },
    },
  });
}

// Supabase service role client
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_CONFIG_MISSING");
  }

  return createAdminClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Deteksi admin tanpa bergantung pada environment variable tambahan
export function isAdminEmail(email?: string | null) {
  return (
    typeof email === "string" &&
    email.trim().toLowerCase() === ADMIN_EMAIL
  );
}

// Validasi session dan status ban
export async function requireUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("UNAUTHORIZED");
  }

  const email = user.email?.trim().toLowerCase();

  if (!email || !email.endsWith("@gmail.com")) {
    throw new Error("GMAIL_REQUIRED");
  }

  // ADMIN LANGSUNG MASUK.
  // Tidak perlu pemeriksaan moderation untuk admin.
  if (isAdminEmail(email)) {
    return user;
  }

  // USER BARU LANGSUNG AKTIF.
  // Tidak ada pemeriksaan approval atau verifikasi moderator.
  // Tabel ini hanya digunakan untuk memeriksa status ban/jail.
  const admin = adminClient();

  const { data: moderation, error } = await admin
    .from("account_moderation")
    .select("status, reason, expires_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[BARA BAN DATABASE ERROR]", error);
    throw new Error("BAN_DATABASE_ERROR");
  }

  // Tidak ada catatan ban berarti akun aktif.
  if (!moderation) {
    return user;
  }

  const status = String(moderation.status || "active");

  if (status !== "banned" && status !== "jailed") {
    return user;
  }

  // expires_at NULL berarti hukuman permanen.
  const expiresAt = moderation.expires_at
    ? new Date(moderation.expires_at).getTime()
    : null;

  const isPermanent =
    expiresAt === null || !Number.isFinite(expiresAt);

  const isStillActive =
    isPermanent || expiresAt > Date.now();

  if (isStillActive) {
    throw new Error(
      status === "banned"
        ? "ACCOUNT_BANNED"
        : "ACCOUNT_JAILED"
    );
  }

  // Hukuman sudah kedaluwarsa: aktifkan kembali akun.
  const { error: updateError } = await admin
    .from("account_moderation")
    .update({
      status: "active",
      reason: null,
      expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (updateError) {
    console.error("[BARA BAN RESET ERROR]", updateError);
  }

  return user;
}
