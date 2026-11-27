
import { NextResponse } from "next/server";
import { adminClient, requireUser, isAdminEmail } from "@/lib/supabase";

export const runtime = "nodejs";

async function checkAdmin() {
  const user = await requireUser();

  if (!isAdminEmail(user.email)) {
    throw new Error("FORBIDDEN");
  }

  return user;
}

export async function GET() {
  try {
    await checkAdmin();

    const admin = adminClient();

    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 100
    });

    if (error) throw error;

    const { data: moderation } = await admin
      .from("account_moderation")
      .select("*");

    const map = new Map(
      (moderation || []).map((item) => [item.user_id, item])
    );

    return NextResponse.json({
      users: data.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        moderation: map.get(u.id) || {
          status: "active",
          reason: null,
          expires_at: null
        }
      }))
    });
  } catch (e: any) {
    const status = e.message === "FORBIDDEN" ? 403 :
      e.message === "UNAUTHORIZED" ? 401 : 500;

    return NextResponse.json(
      { error: e.message || "Admin error" },
      { status }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await checkAdmin();
    const body = await req.json();

    const id = String(body.id || "");
    const action = String(body.action || "");
    const reason = String(body.reason || "Tidak ada alasan");

    if (!id) {
      return NextResponse.json(
        { error: "User ID wajib diisi." },
        { status: 400 }
      );
    }

    const admin = adminClient();

    const { data: target, error: targetError } =
      await admin.auth.admin.getUserById(id);

    if (targetError || !target.user) {
      return NextResponse.json(
        { error: "User tidak ditemukan." },
        { status: 404 }
      );
    }

    if (target.user.email?.toLowerCase() === actor.email?.toLowerCase()) {
      return NextResponse.json(
        { error: "Admin tidak bisa memoderasi akun sendiri." },
        { status: 400 }
      );
    }

    let status = "active";
    let expiresAt: string | null = null;

    if (action === "ban") {
      status = "banned";
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else if (action === "permanent") {
      status = "banned";
      expiresAt = null;
    } else if (action === "jail") {
      status = "jailed";
      expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    } else if (action === "unban" || action === "unjail" || action === "kick") {
      status = "active";
      expiresAt = null;
    } else {
      return NextResponse.json(
        { error: "Aksi tidak valid." },
        { status: 400 }
      );
    }

    const { error: saveError } = await admin
      .from("account_moderation")
      .upsert({
        user_id: id,
        status,
        reason,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
        updated_by: actor.email
      });

    if (saveError) throw saveError;

    if (action === "kick") {
      await admin.auth.admin.signOut(id, "global");
    }

    const { error: auditError } = await admin
      .from("admin_audit")
      .insert({
        actor_email: actor.email || "unknown",
        target_user_id: id,
        target_email: target.user.email || null,
        action,
        reason
      });

    if (auditError) throw auditError;

    return NextResponse.json({
      ok: true,
      action,
      status,
      expiresAt
    });
  } catch (e: any) {
    const status = e.message === "FORBIDDEN" ? 403 :
      e.message === "UNAUTHORIZED" ? 401 : 500;

    return NextResponse.json(
      { error: e.message || "Admin action failed." },
      { status }
    );
  }
}
