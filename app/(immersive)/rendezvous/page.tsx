import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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

  return <RendezvousHub verificationStatus={verificationStatus} isFrozen={isFrozen} />;
}
