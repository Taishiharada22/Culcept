// app/luxury/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import LuxuryPageClient from "./LuxuryPageClient";

export const dynamic = "force-dynamic";
const MIN_SWIPES = 20;

export default async function LuxuryPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    // Lane一覧を取得
    const { data: lanes } = await supabase
        .from("luxury_lanes")
        .select("*")
        .order("display_order", { ascending: true });

    // ユーザーの進捗状況を取得
    let userProgress = null;
    if (auth?.user) {
        const { data: impressions } = await supabase
            .from("luxury_impressions")
            .select("card_id")
            .eq("user_id", auth.user.id)
            .in("action", ["like", "dislike"]);

        const { data: scores } = await supabase
            .from("luxury_lane_scores")
            .select("lane_id, score")
            .eq("user_id", auth.user.id)
            .order("score", { ascending: false })
            .limit(1);

        userProgress = {
            totalSwipes: impressions?.length ?? 0,
            topLane: scores?.[0] ?? null,
            canSeeResult: (impressions?.length ?? 0) >= MIN_SWIPES,
        };
    }

    return (
        <LuxuryPageClient
            lanes={lanes ?? []}
            userProgress={userProgress}
            isLoggedIn={!!auth?.user}
        />
    );
}
