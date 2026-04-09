import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import PartnerOnboardingHub from "@/components/rendezvous/partner/PartnerOnboardingHub";
import CounselorDashboard from "@/components/rendezvous/counselor/CounselorDashboard";
import { checkPhaseGate } from "@/lib/rendezvous/phaseGate";
import PhaseGateMessage from "@/components/rendezvous/counselor/PhaseGateMessage";

export const metadata = {
  title: "パートナー | Rendezvous",
};

/**
 * Partner ページ
 *
 * 設計原則（2026-04-09 CEO承認）:
 * - Partner契約者が開いた瞬間、Counselorが迎える（候補一覧ではない）
 * - CounselorDashboardを最上位に配置し、その下にPartnerOnboardingHubを継続
 * - hasPartnerTier: MVP段階では rendezvous_profiles.primary_category = 'partner' で判定
 *   （サブスクリプション実装後は subscription tier で判定に移行する）
 */
export default async function PartnerPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Partner プロフィールの存在チェック（MVP: category=partnerで判定）
  const { data: partnerProfile } = await supabase
    .from("rendezvous_profiles")
    .select("primary_category, is_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  const hasPartnerTier =
    partnerProfile?.primary_category === "partner" &&
    partnerProfile?.is_enabled === true;

  // Phase Gate チェック（Stargazer 深層観測の進行度による機能ゲート）
  const phaseGate = await checkPhaseGate(user.id);

  return (
    <div className="space-y-6 pb-8">
      {/* ── Phase Gate: Phase 2 未満は Counselor 機能を制限 ── */}
      {phaseGate.accessLevel === "none" && (
        <section>
          <PhaseGateMessage
            currentPhase={phaseGate.currentPhase}
            requiredPhase={2}
            featureName="Counselor"
          />
        </section>
      )}

      {/* ── Counselorダッシュボード（最上位） ── */}
      <section>
        <CounselorDashboard
          hasPartnerTier={hasPartnerTier}
          accessLevel={phaseGate.accessLevel}
        />
      </section>

      {/* ── Partner準備・候補一覧（その下に継続） ── */}
      {hasPartnerTier && (
        <section>
          <div className="px-1 mb-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Partner準備 / 候補
            </p>
          </div>
          <PartnerOnboardingHub />
        </section>
      )}

      {!hasPartnerTier && (
        <section>
          <PartnerOnboardingHub />
        </section>
      )}
    </div>
  );
}
