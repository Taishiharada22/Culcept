// app/(culcept)/welcome/page.tsx
// ウェルカムページ — 新規ユーザーと既存ユーザーの振り分け
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import WelcomeScreen from "./WelcomeScreen";

export default async function WelcomePage() {
    // 既にログイン済みならホームへ
    try {
        const supabase = await supabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (user && !user.is_anonymous) redirect("/");
    } catch (e: any) {
        if (e?.digest?.includes("NEXT_REDIRECT")) throw e;
        // auth error — 続行してウェルカム画面を表示
    }

    return <WelcomeScreen />;
}
