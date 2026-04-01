import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkOnboardingCompleted } from "@/lib/rendezvous/onboardingState";
import RomanceSwipeClient from "@/components/rendezvous/RomanceSwipeClient";
import IdentityGate from "@/components/rendezvous/IdentityGate";
import AppearancePreferencesGate from "@/components/rendezvous/AppearancePreferencesGate";

/**
 * 恋愛枠 — スワイプ式マッチング
 * L2以上の身元確認が必須。写真主体のUI。
 */

export const metadata = {
  title: "恋愛 | Rendezvous",
};

export default async function RomancePage() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) {
    redirect("/login");
  }

  const onboarding = await checkOnboardingCompleted(supabase, auth.user.id);
  if (!onboarding.completed) {
    redirect("/rendezvous/onboarding");
  }

  // 身元確認ゲート: romantic は L2以上が必要
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("rendezvous_profiles")
    .select("verification_status, review_status, verification_level, enabled_categories, verification_reviewer_note, verification_submitted_at, frozen_at, frozen_reason")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (profileErr) {
    console.error("[romance/page] profile query error:", profileErr);
  }
  const verificationStatus = (profile?.verification_status as "unverified" | "pending" | "verified" | "rejected" | "expired") ?? "unverified";
  const reviewStatus = (profile?.review_status as "not_submitted" | "pending" | "approved" | "rejected") ?? "not_submitted";
  const verificationLevel: number = profile?.verification_level ?? 0;
  const rejectionNote: string | null = profile?.verification_reviewer_note ?? null;
  const submittedAt: string | null = profile?.verification_submitted_at ?? null;
  const isFrozen = !!profile?.frozen_at;
  const frozenReason: string | null = profile?.frozen_reason ?? null;

  // romantic カテゴリとして IdentityGate に通す
  return (
    <AppearancePreferencesGate>
      <IdentityGate
        verificationStatus={verificationStatus}
        reviewStatus={reviewStatus}
        verificationLevel={verificationLevel}
        categories={["romantic"]}
        rejectionNote={rejectionNote}
        submittedAt={submittedAt}
        isFrozen={isFrozen}
        frozenReason={frozenReason}
      >
        <RomanceSwipeClient />
      </IdentityGate>
    </AppearancePreferencesGate>
  );
}
