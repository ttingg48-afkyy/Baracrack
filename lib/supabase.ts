import { createServerClient } from "@supabase/ssr";
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
          } catch {}
        },
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

  const bannedUntil = (
    user as unknown as { banned_until?: string | null }
  ).banned_until;

  if (bannedUntil && new Date(bannedUntil).getTime() > Date.now()) {
    throw new Error("ACCOUNT_BANNED");
  }

  return user;
}
