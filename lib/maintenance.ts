import { adminClient } from "@/lib/supabase";

export type MaintenanceState = {
  enabled: boolean;
  message: string;
  duration_label: string | null;
  expires_at: string | null;
};

export async function getMaintenanceState(): Promise<MaintenanceState> {
  const { data, error } = await adminClient()
    .from("bara_site_maintenance")
    .select("enabled, message, duration_label, expires_at")
    .eq("id", "main")
    .maybeSingle();

  if (error) {
    console.error("[BARA MAINTENANCE READ]", error);
    throw new Error("MAINTENANCE_DATABASE_ERROR");
  }

  if (!data) {
    return {
      enabled: false,
      message: "",
      duration_label: null,
      expires_at: null,
    };
  }

  if (data.enabled && data.expires_at) {
    const expiry = new Date(data.expires_at).getTime();

    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      await adminClient()
        .from("bara_site_maintenance")
        .update({
          enabled: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", "main");

      return {
        enabled: false,
        message: data.message,
        duration_label: data.duration_label,
        expires_at: data.expires_at,
      };
    }
  }

  return data;
}

export async function enableMaintenance(
  message: string,
  duration: string
) {
  const match = duration.match(/^([1-9]\d*)([hd])$/);

  if (!match) {
    throw new Error(
      "Durasi tidak valid. Gunakan angka diikuti h atau d. Contoh: 1h atau 2d."
    );
  }

  const amount = Number(match[1]);
  const unit = match[2];

  const multiplier =
    unit === "h"
      ? 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

  const milliseconds = amount * multiplier;

  if (
    !Number.isSafeInteger(amount) ||
    !Number.isSafeInteger(milliseconds) ||
    milliseconds > 365 * 24 * 60 * 60 * 1000
  ) {
    throw new Error("Durasi maksimal maintenance adalah 365 hari.");
  }

  const expiresAt = new Date(
    Date.now() + milliseconds
  ).toISOString();

  const { error } = await adminClient()
    .from("bara_site_maintenance")
    .upsert(
      {
        id: "main",
        enabled: true,
        message: message.trim(),
        duration_label: duration,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (error) {
    console.error("[BARA MAINTENANCE ENABLE]", error);
    throw new Error("Gagal mengaktifkan maintenance di database.");
  }

  return {
    message: message.trim(),
    duration,
    expiresAt,
  };
}

export async function disableMaintenance() {
  const { error } = await adminClient()
    .from("bara_site_maintenance")
    .upsert(
      {
        id: "main",
        enabled: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (error) {
    console.error("[BARA MAINTENANCE DISABLE]", error);
    throw new Error("Gagal menonaktifkan maintenance.");
  }
        }
