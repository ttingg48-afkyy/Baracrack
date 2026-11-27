
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("SUPABASE_PUBLIC_CONFIG_MISSING");
  }

  return { url, anonKey };
}

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },

      setAll(
        items: {
          name: string;
          value: string;
          options?: any;
        }[]
      ) {
        try {
          for (const { name, value, options } of items) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Cookie tidak dapat ditulis dari Server Component.
        }
      },
    },
  });
}

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_CONFIG_MISSING");
  }

  return createAdminClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("UNAUTHORIZED");
  }

  if (!user.email?.toLowerCase().endsWith("@gmail.com")) {
    throw new Error("GMAIL_REQUIRED");
  }

  let admin;

  try {
    admin = adminClient();
  } catch (error) {
    console.error("[BARA ADMIN CLIENT ERROR]", error);
    throw new Error("SUPABASE_SERVICE_ROLE_CONFIG_MISSING");
  }

  const {
    data: moderation,
    error: moderationError,
  } = await admin
    .from("account_moderation")
    .select("status, reason, expires_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (moderationError) {
    console.error("[BARA MODERATION ERROR]", {
      code: moderationError.code,
      message: moderationError.message,
      details: moderationError.details,
      hint: moderationError.hint,
    });

    throw new Error("MODERATION_CHECK_FAILED");
  }

  if (
    moderation?.status === "banned" ||
    moderation?.status === "jailed"
  ) {
    const expiresAt = moderation.expires_at
      ? new Date(moderation.expires_at).getTime()
      : null;

    const isActive =
      expiresAt === null ||
      !Number.isFinite(expiresAt) ||
      expiresAt > Date.now();

    if (isActive) {
      throw new Error(
        moderation.status === "banned"
          ? "ACCOUNT_BANNED"
          : "ACCOUNT_JAILED"
      );
    }

    // Status sudah kedaluwarsa, otomatis dianggap aktif.
    await admin
      .from("account_moderation")
      .update({
        status: "active",
        reason: null,
        expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
  }

  return user;
}

export function isAdminEmail(email?: string | null) {
  const adminEmail = process.env.BARA_ADMIN_EMAIL;

  return Boolean(
    email &&
    adminEmail &&
    email.trim().toLowerCase() === adminEmail.trim().toLowerCase()
  );
}
