import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import PartnerOnboardingHub from "@/components/rendezvous/partner/PartnerOnboardingHub";
import AppearancePreferencesGate from "@/components/rendezvous/AppearancePreferencesGate";

export const metadata = {
  title: "パートナー準備 | Rendezvous",
};

export default async function PartnerPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppearancePreferencesGate>
      <PartnerOnboardingHub />
    </AppearancePreferencesGate>
  );
}
