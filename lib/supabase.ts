import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return jar.getAll(); },
        setAll(items) {
          try { items.forEach(({ name, value, options }) => jar.set(name, value, options)); }
          catch {}
        }
      }
    }
  );
}

export async function requireUser() {
  const supabase = await supabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("UNAUTHORIZED");
  if (user.banned_until && new Date(user.banned_until) > new Date()) throw new Error("ACCOUNT_BANNED");
  return user;
}