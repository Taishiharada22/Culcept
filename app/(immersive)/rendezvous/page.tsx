import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { checkOnboardingCompleted } from "@/lib/rendezvous/onboardingState";
import RendezvousHub from "@/components/rendezvous/RendezvousHub";

/**
 * Rendezvous top page — 3枠選択ハブ
 * 恋愛 / つながり / パートナー を選択するエントリポイント。
 */

export const metadata = {
  title: "Rendezvous | Aneurasync",
};

export default async function RendezvousPage() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) {
    redirect("/login");
  }

  const onboarding = await checkOnboardingCompleted(supabase, auth.user.id);
  if (!onboarding.completed) {
    redirect("/rendezvous/onboarding");
  }

  return <RendezvousHub />;
}
