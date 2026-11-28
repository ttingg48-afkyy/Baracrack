
import { NextResponse } from "next/server";
import { getMaintenanceState } from "@/lib/maintenance";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const maintenance = await getMaintenanceState();

    return NextResponse.json(maintenance, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Gagal membaca status maintenance." },
      { status: 500 }
    );
  }
}
