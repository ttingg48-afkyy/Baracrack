import { NextRequest, NextResponse } from "next/server";
import { adminClient, requireUser } from "@/lib/supabase";
import {
  createPanelToken,
  hasPanelSession,
  setAccountControl,
  verifyPin,
} from "@/lib/control";

export const runtime = "nodejs";

const COOKIE_NAME = "bara_panel_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

function panelCookie(response: NextResponse, value: string, maxAge: number) {
  response.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge,
  });

  return response;
}

export async function POST(req: NextRequest) {
  try {
    // Semua aksi panel wajib berasal dari user yang sudah login.
    await requireUser();

    const body = await req.json();
    const action = String(body.action || "").toLowerCase();

    // UNLOCK PANEL
    if (action === "unlock") {
      const pin = String(body.pin || "");

      if (!verifyPin(pin)) {
        return NextResponse.json(
          { error: "PIN salah." },
          { status: 401 }
        );
      }

      const response = NextResponse.json({
        ok: true,
        message: "Panel berhasil dibuka.",
      });

      return panelCookie(
        response,
        createPanelToken(),
        SESSION_MAX_AGE
      );
    }

    // Aksi berikutnya wajib memiliki sesi panel.
    if (!(await hasPanelSession())) {
      return NextResponse.json(
        { error: "Panel terkunci. Masukkan PIN." },
        { status: 401 }
      );
    }

    // LOCK PANEL
    if (action === "lock") {
      const response = NextResponse.json({
        ok: true,
        message: "Panel berhasil dikunci.",
      });

      return panelCookie(response, "", 0);
    }

    const email = String(body.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "Email akun wajib diisi." },
        { status: 400 }
      );
    }

    // BAN / JAIL
    if (action === "ban" || action === "jail") {
      const duration = String(body.duration || "").trim();

      if (!duration) {
        return NextResponse.json(
          { error: "Durasi wajib diisi." },
          { status: 400 }
        );
      }

      const result = await setAccountControl(
        email,
        action,
        duration
      );

      return NextResponse.json({
        ok: true,
        result,
      });
    }

    // UNBAN / UNJAIL / MUTE / UNMUTE
    if (
      action === "unban" ||
      action === "unjail" ||
      action === "mute" ||
      action === "unmute"
    ) {
      const result = await setAccountControl(email, action);

      return NextResponse.json({
        ok: true,
        result,
      });
    }

    return NextResponse.json(
      { error: "Aksi tidak dikenal." },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("[BARA CONTROL POST]", error);

    const status =
      error.message === "UNAUTHORIZED"
        ? 401
        : error.message === "PANEL_PIN_REQUIRED"
          ? 401
          : 500;

    return NextResponse.json(
      { error: error.message || "Control API error." },
      { status }
    );
  }
}

export async function GET() {
  try {
    // User harus login terlebih dahulu.
    await requireUser();

    // Lalu wajib membuka panel dengan PIN.
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

    const controlMap = new Map(
      (controls || []).map((item) => [
        item.email.toLowerCase(),
        item,
      ])
    );

    const users = data.users.map((user) => {
      const email = (user.email || "").toLowerCase();
      const control = controlMap.get(email);

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

    const status =
      error.message === "UNAUTHORIZED"
        ? 401
        : error.message === "PANEL_PIN_REQUIRED"
          ? 401
          : 500;

    return NextResponse.json(
      { error: error.message || "Gagal memuat daftar akun." },
      { status }
    );
  }
}
