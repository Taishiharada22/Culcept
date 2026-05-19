import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import AneurasyncHome from "../AneurasyncHome";
import { resolveVisualFlowFlagSource } from "@/lib/alter-morning/dialog/flags";
import { emitVisualFlowFlagEvaluated } from "@/lib/alter-morning/visualFlow/analyticsServer";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import HomeSwipeContainer from "@/components/home/HomeSwipeContainer";
import PlanClient from "./plan/PlanClient";

/**
 * / の役割を1つに固定:
 *   "ログイン済み & baseline済み & stargazer初回観測済み" のユーザーのみ表示
 *
 * それ以外は全て以下の単一ルールで分岐:
 *   未ログイン + 登録済みcookie → /login（登録済みユーザーを静かにログインへ）
 *   未ログイン + cookie なし   → /stargazer（新規ユーザーをオンボーディングへ）
 *   匿名ユーザー               → /stargazer（初回観測完了まで）
 *   baseline 未完了            → /baseline
 *   stargazer 初回観測未完了   → /stargazer（QuestionFlowまたは最初から）
 */
export default async function HomePage() {
    try {
        const supabase = await supabaseServer();
        const { data: { user } } = await supabase.auth.getUser();

        // ── 未ログイン ──
        if (!user) {
            const cookieStore = await cookies();
            const isRegistered = cookieStore.get("aneurasync_registered")?.value === "1";
            // 登録済みユーザー → ログイン画面へ（素直に）
            if (isRegistered) redirect("/login");
            // 新規 or クッキー消失 → ウェルカム画面で振り分け
            redirect("/welcome");
        }

        // ── 匿名ユーザー（Stargazer初回観測未完了） ──
        if (user.is_anonymous) redirect("/stargazer");

        // ── Stargazer 初回観測完了チェック（DB一本化） ──
        // stargazer_star_maps にレコードがあれば初回観測完了とみなす
        const { data: starMapRow } = await supabase
            .from("stargazer_star_maps")
            .select("user_id")
            .eq("user_id", user.id)
            .maybeSingle();

        // ── baseline チェック ──
        // star_maps が存在する = Stargazer オンボーディング完了 = baseline も完了済み
        // baseline_completed_at が null の既存ユーザーも star_maps で救済
        const { data: profile } = await supabase
            .from("profiles")
            .select("baseline_completed_at")
            .eq("id", user.id)
            .maybeSingle();

        if (!profile?.baseline_completed_at && !starMapRow) redirect("/baseline");

        if (!starMapRow) redirect("/stargazer");

        // ── W3-PR-13 M3+M4: visualFlow flag eval + analytics（server-side 単一評価ポイント） ──
        //
        // M3: 評価結果の boolean を AneurasyncHome に drill down。flag OFF default のため
        //     未設定ユーザーは必ず false。MorningMapView の dynamic import 自体が fire しない。
        //
        // M4: flag_source (allowlist / global) を取得し、flag ON の時のみ
        //     visual_flow_flag_evaluated イベントを emit（CEO decision #3）。
        //     resolveVisualFlowFlagSource は visualFlow() と同じ判定ロジック。
        //     戻り値 null = flag OFF → 何も emit しない（dead-code 維持）。
        const visualFlowSource = resolveVisualFlowFlagSource(user.id);
        const visualFlowEnabled = visualFlowSource !== null;
        if (visualFlowSource !== null) {
            emitVisualFlowFlagEvaluated({
                userId: user.id,
                metadata: { flag_source: visualFlowSource },
            });
        }

        // ── W1-Home-Swipe Phase 1: feature flag に基づいて Home swipe wrapper を適用 ──
        //
        // 設計書: docs/alter-plan-home-swipe-full-plan-pane-mini-design.md
        //
        // CEO 補正 (2026-05-20、PR #218 採択方針):
        //   - flag=true (Preview で env 投入時): AneurasyncHome を pane 0、
        //     **PlanClient (displayMode=pane)** を pane 1 として swipe wrapper で統合
        //     ← 旧 HomePlanPane (summary view) を Phase 1 で廃止、full Plan 本体に置換
        //   - flag=false (production default): 従来通り単独 AneurasyncHome
        //   - /plan 直 URL は本 wrapper の影響を受けず、PlanClient (displayMode=route)
        //     単独で render (app/(culcept)/plan/page.tsx 側、本 file 不変)
        //   - AneurasyncHome 内部は不変 (Alter 体験完全保持)
        //
        // W1-Z 未適用問題 (重要、CEO 補正 #3):
        //   - 本統合は UI / chrome 統合まで。Production Supabase に Plan tables 未 migrate
        //     な状態では /api/plan/anchors GET が 500 を返し、PlanClient ErrorState 表示
        //   - 本 PR で migration 適用は行わない (W1-Z 判断は別 wave)
        //   - Production 完全稼働には W1-Z production migration apply が必要
        const homeElement = <AneurasyncHome visualFlowEnabled={visualFlowEnabled} />;
        if (PLAN_FLAGS.homeSwipeEnabled) {
            return (
                <HomeSwipeContainer
                    homePane={homeElement}
                    planPane={<PlanClient displayMode="pane" />}
                />
            );
        }
        return homeElement;
    } catch (e: any) {
        if (e?.digest?.includes("NEXT_REDIRECT")) throw e;
        // auth errors は非致命的 — fallback として Home を表示 (swipe wrapper なし、最小経路)
        return <AneurasyncHome />;
    }
}
