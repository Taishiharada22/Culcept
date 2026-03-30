import { requireAdmin } from "@/lib/auth/requireAdmin";
import VerificationDashboard from "./VerificationDashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function VerificationPage() {
  await requireAdmin("/admin/verification");

  return <VerificationDashboard />;
}
