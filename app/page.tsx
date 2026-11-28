import Dashboard from "@/components/Dashboard";
import { getMaintenanceState } from "@/lib/maintenance";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const maintenance = await getMaintenanceState();

  return <Dashboard maintenance={maintenance} />;
}
