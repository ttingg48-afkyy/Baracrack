
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL atau Anon Key belum diatur.");
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
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
            items.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Cookie tidak bisa ditulis dari Server Component.
            // Middleware dapat menangani refresh session.
          }
        },
      },
    }
  );
}

export function adminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Service Role Key belum diatur."
    );
  }

  return createAdminClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export async function requireUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("UNAUTHORIZED");
  }

  if (!user.email?.toLowerCase().endsWith("@gmail.com")) {
    throw new Error("GMAIL_REQUIRED");
  }

  const admin = adminClient();

  const { data: moderation, error: moderationError } =
    await admin
      .from("account_moderation")
      .select("status, reason, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

  if (moderationError) {
    throw new Error("MODERATION_CHECK_FAILED");
  }

  if (
    moderation?.status === "banned" ||
    moderation?.status === "jailed"
  ) {
    const expires = moderation.expires_at
      ? new Date(moderation.expires_at).getTime()
      : null;

    if (!expires || expires > Date.now()) {
      throw new Error(
        moderation.status === "banned"
          ? "ACCOUNT_BANNED"
          : "ACCOUNT_JAILED"
      );
    }
  }

  return user;
}

export function isAdminEmail(email?: string | null) {
  const adminEmail = process.env.BARA_ADMIN_EMAIL;

  return Boolean(
    email &&
    adminEmail &&
    email.toLowerCase() === adminEmail.toLowerCase()
  );
}
