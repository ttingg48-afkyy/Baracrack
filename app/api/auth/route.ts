
import { NextResponse } from "next/server";
import { createHmac, randomInt, timingSafeEqual } from "crypto";
import nodemailer from "nodemailer";
import { adminClient, createClient } from "@/lib/supabase";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function validGmail(email: string) {
  return /^[a-z0-9._%+-]+@gmail\.com$/i.test(email);
}

function hashCode(email: string, code: string) {
  const secret = process.env.OTP_SECRET;

  if (!secret) throw new Error("OTP_SECRET belum diatur.");

  return createHmac("sha256", secret)
    .update(`${email}:${code}`)
    .digest("hex");
}

function mailer() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error("Konfigurasi Gmail SMTP belum lengkap.");
  }

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}

async function findAuthUser(email: string) {
  const admin = adminClient();

  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) throw error;

  return data.users.find(
    (item) => item.email?.toLowerCase() === email
  ) || null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const action = String(body.action || "");
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!validGmail(email)) {
      return jsonError("Gunakan alamat Gmail (@gmail.com).");
    }

    const admin = adminClient();

    // KIRIM OTP DARI GMAIL
    if (action === "send-code") {
      if (password.length < 8) {
        return jsonError("Password minimal 8 karakter.");
      }

      const existing = await findAuthUser(email);
      let userId: string;

      if (existing) {
        if (existing.email_confirmed_at) {
          return jsonError(
            "Email sudah terdaftar. Silakan login."
          );
        }

        // Akun belum dikonfirmasi: gunakan kembali akun tersebut.
        const { data, error } =
          await admin.auth.admin.updateUserById(existing.id, {
            password,
          });

        if (error) throw error;
        userId = data.user.id;
      } else {
        const { data, error } =
          await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: false,
            user_metadata: {
              registration_source: "bara-terminal",
            },
          });

        if (error) throw error;
        userId = data.user.id;
      }

      const code = String(randomInt(0, 1000000)).padStart(6, "0");
      const otpHash = hashCode(email, code);
      const expiresAt = new Date(
        Date.now() + 10 * 60 * 1000
      ).toISOString();

      const { error: saveError } = await admin
        .from("bara_email_otps")
        .upsert(
          {
            email,
            user_id: userId,
            otp_hash: otpHash,
            expires_at: expiresAt,
            attempts: 0,
            created_at: new Date().toISOString(),
          },
          { onConflict: "email" }
        );

      if (saveError) throw saveError;

      try {
        const transporter = mailer();

        await transporter.sendMail({
          from: `"BARA TERMINAL" <${process.env.GMAIL_USER}>`,
          to: email,
          subject: "Kode verifikasi BARA TERMINAL",
          text: [
            "Halo!",
            "",
            `Kode OTP BARA TERMINAL kamu: ${code}`,
            "",
            "Kode berlaku selama 10 menit.",
            "Jangan bagikan kode ini kepada siapa pun.",
            "",
            "Jika kamu tidak meminta kode ini, abaikan email ini.",
          ].join("\n"),
          html: `
            <div style="font-family:Arial,sans-serif;background:#f5eedc;padding:28px">
              <div style="max-width:480px;margin:auto;background:#fffdf5;border:3px solid #171717;padding:28px;box-shadow:6px 6px 0 #171717">
                <h1 style="margin-top:0">BARA TERMINAL</h1>
                <p>Kode verifikasi email kamu:</p>
                <div style="font-size:36px;font-weight:bold;letter-spacing:9px;padding:18px;background:#c7f36b;border:3px solid #171717;text-align:center">
                  ${code}
                </div>
                <p>Kode berlaku selama <b>10 menit</b>.</p>
                <p>Jangan bagikan kode ini kepada siapa pun.</p>
              </div>
            </div>
          `,
        });
      } catch (mailError) {
        console.error("[BARA GMAIL SEND ERROR]", mailError);

        await admin
          .from("bara_email_otps")
          .delete()
          .eq("email", email);

        throw new Error(
          "Gagal mengirim email Gmail. Periksa GMAIL_USER dan GMAIL_APP_PASSWORD."
        );
      }

      return NextResponse.json({
        ok: true,
        message: "Kode OTP berhasil dikirim melalui Gmail.",
      });
    }

    // VERIFIKASI OTP GMAIL
    if (action === "verify-code") {
      const code = String(body.code || "").trim();

      if (!/^\d{6}$/.test(code)) {
        return jsonError("Masukkan OTP enam angka.");
      }

      const { data: record, error: readError } = await admin
        .from("bara_email_otps")
        .select("user_id, otp_hash, expires_at, attempts")
        .eq("email", email)
        .maybeSingle();

      if (readError) throw readError;

      if (!record) {
        return jsonError(
          "Kode OTP tidak ditemukan. Kirim kode baru."
        );
      }

      if (record.attempts >= 5) {
        await admin
          .from("bara_email_otps")
          .delete()
          .eq("email", email);

        return jsonError(
          "Terlalu banyak percobaan. Kirim kode OTP baru."
        );
      }

      if (new Date(record.expires_at).getTime() < Date.now()) {
        await admin
          .from("bara_email_otps")
          .delete()
          .eq("email", email);

        return jsonError("Kode OTP kedaluwarsa. Kirim kode baru.");
      }

      const submittedHash = hashCode(email, code);
      const expected = Buffer.from(record.otp_hash, "hex");
      const submitted = Buffer.from(submittedHash, "hex");

      const valid =
        expected.length === submitted.length &&
        timingSafeEqual(expected, submitted);

      if (!valid) {
        await admin
          .from("bara_email_otps")
          .update({ attempts: record.attempts + 1 })
          .eq("email", email);

        return jsonError("Kode OTP salah.");
      }

      const { error: confirmError } =
        await admin.auth.admin.updateUserById(record.user_id, {
          email_confirm: true,
        });

      if (confirmError) throw confirmError;

      await admin
        .from("bara_email_otps")
        .delete()
        .eq("email", email);

      return NextResponse.json({
        ok: true,
        message: "Email berhasil diverifikasi. Silakan masuk.",
      });
    }

    // LOGIN PASSWORD BIASA
    if (action === "login") {
      if (!password) {
        return jsonError("Password wajib diisi.");
      }

      const supabase = await createClient();

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      });
    }

    return jsonError("Action tidak dikenal.");
  } catch (error: any) {
    console.error("[BARA AUTH ERROR]", error);

    return jsonError(
      error.message || "Authentication error.",
      500
    );
  }
        }
          
