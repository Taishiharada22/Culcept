import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import AneurasyncHome from "../AneurasyncHome";

export default async function HomePage() {
    let isLoggedIn = false;
    let isAnonymous = true;
    let baselineCompleted = false;

    try {
        const supabase = await supabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            isLoggedIn = true;
            isAnonymous = user.is_anonymous ?? true;

            // 登録済みユーザーのベースライン完了チェック
            if (!isAnonymous) {
                const { data: profile } = await supabase
                    .from("profiles")
                    .select("baseline_completed_at")
                    .eq("id", user.id)
                    .maybeSingle();
                baselineCompleted = !!profile?.baseline_completed_at;
            }
        }
    } catch (e: any) {
        // redirect() throws NEXT_REDIRECT — rethrow it
        if (e?.digest?.includes("NEXT_REDIRECT")) throw e;
        // auth errors are non-fatal; show home page anyway
    }

    // 未ログイン → Stargazer V5 オンボーディングへ直接遷移
    if (!isLoggedIn) {
        redirect("/stargazer");
    }

    // ④-A: 登録済みだがベースライン未完了 → ベースライン収集ページへ
    if (!isAnonymous && !baselineCompleted) {
        redirect("/baseline");
    }

    return <AneurasyncHome />;
}
