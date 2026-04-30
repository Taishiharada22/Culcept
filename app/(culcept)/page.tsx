import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import AneurasyncHome from "../AneurasyncHome";
import { resolveVisualFlowFlagSource } from "@/lib/alter-morning/dialog/flags";
import { emitVisualFlowFlagEvaluated } from "@/lib/alter-morning/visualFlow/analyticsServer";

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

        return <AneurasyncHome visualFlowEnabled={visualFlowEnabled} />;
    } catch (e: any) {
        if (e?.digest?.includes("NEXT_REDIRECT")) throw e;
        // auth errors は非致命的 — fallback として Home を表示
        return <AneurasyncHome />;
    }
}
