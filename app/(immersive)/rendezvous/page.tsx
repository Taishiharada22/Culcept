import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkOnboardingCompleted } from "@/lib/rendezvous/onboardingState";
import RendezvousEntryRouter from "@/components/rendezvous/RendezvousEntryRouter";
import AnonymousRegistrationPage from "@/components/auth/AnonymousRegistrationPage";

/**
 * Rendezvous top page — last-used tab redirect / first-time selection
 *
 * Returning users: client-side redirect to their last-used tab via localStorage.
 * First-time users: 3-card selection screen (connection / romance / partner).
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

  if (auth.user.is_anonymous) {
    return <AnonymousRegistrationPage featureName="Rendezvous" />;
  }

  const onboarding = await checkOnboardingCompleted(supabase, auth.user.id);
  if (!onboarding.completed) {
    redirect("/rendezvous/onboarding");
  }

  // 恋愛カードの状態バッジ用に verification_status + frozen_at を取得
  const { data: profile } = await supabaseAdmin
    .from("rendezvous_profiles")
    .select("verification_status, frozen_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const verificationStatus = (profile?.verification_status as
    | "unverified" | "pending" | "verified" | "rejected" | "expired"
    | null) ?? null;
  const isFrozen = !!profile?.frozen_at;

  return <RendezvousEntryRouter verificationStatus={verificationStatus} isFrozen={isFrozen} />;
}
