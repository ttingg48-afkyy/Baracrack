
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const jar = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return jar.getAll();
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
              jar.set(name, value, options);
            });
          } catch {
            // Cookie writes may fail in Server Components.
          }
        }
      }
    }
  );
}

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase admin environment belum lengkap.");
  }

  return createAdminClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export async function requireUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("UNAUTHORIZED");
  }

  if (!user.email?.toLowerCase().endsWith("@gmail.com")) {
    throw new Error("GMAIL_REQUIRED");
  }

  const admin = adminClient();

  const { data: moderation, error: moderationError } = await admin
    .from("account_moderation")
    .select("status,reason,expires_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (moderationError) {
    throw new Error("MODERATION_CHECK_FAILED");
  }

  if (moderation?.status === "banned") {
    const expires = moderation.expires_at
      ? new Date(moderation.expires_at).getTime()
      : null;

    if (!expires || expires > Date.now()) {
      throw new Error("ACCOUNT_BANNED");
    }
  }

  if (moderation?.status === "jailed") {
    const expires = moderation.expires_at
      ? new Date(moderation.expires_at).getTime()
      : null;

    if (!expires || expires > Date.now()) {
      throw new Error("ACCOUNT_JAILED");
    }
  }

  return user;
}

export function isAdminEmail(email?: string | null) {
  return Boolean(
    email &&
    process.env.BARA_ADMIN_EMAIL &&
    email.toLowerCase() ===
      process.env.BARA_ADMIN_EMAIL.toLowerCase()
  );
}
