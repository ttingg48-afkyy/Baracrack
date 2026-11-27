
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

export const runtime = "nodejs";

function validGmail(email: string) {
  return /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(email);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body.action || "");
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const supabase = await createClient();

    if (!validGmail(email)) {
      return NextResponse.json(
        { error: "Gunakan alamat Gmail (@gmail.com)." },
        { status: 400 }
      );
    }

    if (action === "send-code") {
      if (password.length < 8) {
        return NextResponse.json(
          { error: "Password minimal 8 karakter." },
          { status: 400 }
        );
      }

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: {
            registration_source: "bara-terminal"
          }
        }
      });

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        message: "Kode OTP sudah dikirim ke Gmail."
      });
    }

    if (action === "verify-code") {
      const token = String(body.code || "").trim();

      if (!/^\d{6}$/.test(token)) {
        return NextResponse.json(
          { error: "Masukkan kode OTP 6 angka." },
          { status: 400 }
        );
      }

      if (password.length < 8) {
        return NextResponse.json(
          { error: "Password minimal 8 karakter." },
          { status: 400 }
        );
      }

      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "email"
      });

      if (error) throw error;
      if (!data.user) throw new Error("Verifikasi gagal.");

      const { error: passwordError } =
        await supabase.auth.updateUser({ password });

      if (passwordError) throw passwordError;

      return NextResponse.json({
        ok: true,
        message: "Email terverifikasi dan password berhasil disimpan."
      });
    }

    if (action === "login") {
      if (!password) {
        return NextResponse.json(
          { error: "Password wajib diisi." },
          { status: 400 }
        );
      }

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        user: {
          id: data.user.id,
          email: data.user.email
        }
      });
    }

    return NextResponse.json(
      { error: "Action tidak dikenal." },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Authentication error." },
      { status: 400 }
    );
  }
}
