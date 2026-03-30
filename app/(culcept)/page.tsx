import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import AneurasyncHome from "../AneurasyncHome";
import HeroSection from "@/components/home/HeroSection";

export default async function HomePage() {
    let isLoggedIn = false;

    // 未オンボーディングユーザーをオンボーディングへリダイレクト
    try {
        const supabase = await supabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            isLoggedIn = true;
            const { data: profile } = await supabase
                .from("profiles")
                .select("onboarded_at, created_at")
                .eq("id", user.id)
                .maybeSingle();

            // onboarded_at が未設定 → オンボーディングへ
            // profileが存在しない、または onboarded_at が null/undefined
            if (!profile?.onboarded_at) {
                redirect("/onboarding");
            }
        }
    } catch (e: any) {
        // redirect() throws NEXT_REDIRECT — rethrow it
        if (e?.digest?.includes("NEXT_REDIRECT")) throw e;
        // auth errors are non-fatal; show home page anyway
    }

    // 未ログイン → ヒーローセクション（ランディングページ）
    if (!isLoggedIn) {
        return (
            <div data-theme="dark">
                <HeroSection />
            </div>
        );
    }

    return <AneurasyncHome />;
}
