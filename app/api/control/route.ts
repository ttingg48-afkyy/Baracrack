
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase";
import {
  createPanelToken,
  hasPanelSession,
  setAccountControl,
  verifyPin,
} from "@/lib/control";

export const runtime = "nodejs";

const COOKIE_NAME = "bara_panel_session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "unlock") {
      if (!verifyPin(String(body.pin || ""))) {
        return NextResponse.json(
          { error: "PIN salah." },
          { status: 401 }
        );
      }

      const response = NextResponse.json({ ok: true });

      response.cookies.set(COOKIE_NAME, createPanelToken(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });

      return response;
    }

    if (!(await hasPanelSession())) {
      return NextResponse.json(
        { error: "Panel terkunci. Masukkan PIN." },
        { status: 401 }
      );
    }

    if (action === "lock") {
      const response = NextResponse.json({ ok: true });
      response.cookies.set(COOKIE_NAME, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 0,
      });
      return response;
    }

    if (action === "ban" || action === "jail") {
      const result = await setAccountControl(
        String(body.email || ""),
        action,
        String(body.duration || "")
      );

      return NextResponse.json({ ok: true, result });
    }

    if (
      action === "unban" ||
      action === "unjail" ||
      action === "mute" ||
      action === "unmute"
    ) {
      const result = await setAccountControl(
        String(body.email || ""),
        action
      );

      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json(
      { error: "Aksi tidak dikenal." },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("[BARA CONTROL API]", error);

    return NextResponse.json(
      { error: error.message || "Control API error." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    if (!(await hasPanelSession())) {
      return NextResponse.json(
        { error: "Panel terkunci." },
        { status: 401 }
      );
    }

    const admin = adminClient();

    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (error) throw error;

    const { data: controls, error: controlError } = await admin
      .from("bara_account_controls")
      .select("email, status, expires_at, muted, updated_at");

    if (controlError) throw controlError;

    const map = new Map(
      (controls || []).map((item) => [
        item.email.toLowerCase(),
        item,
      ])
    );

    const users = data.users.map((user) => {
      const email = (user.email || "").toLowerCase();
      const control = map.get(email);

      return {
        email: user.email,
        last_login: user.last_sign_in_at,
        status: control?.status || "active",
        expires_at: control?.expires_at || null,
        muted: control?.muted || false,
      };
    });

    return NextResponse.json({
      users,
      json: users,
    });
  } catch (error: any) {
    console.error("[BARA CONTROL GET]", error);

    return NextResponse.json(
      { error: error.message || "Gagal memuat daftar akun." },
      { status: 500 }
    );
  }
}
