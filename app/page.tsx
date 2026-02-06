// app/page.tsx
// 新デザイン - ライトモード + グラスモーフィズム
import { supabaseServer } from "@/lib/supabase/server";
import HomePageClientNew from "./HomePageClientNew";

export const dynamic = "force-dynamic";

export default async function HomePage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const isLoggedIn = !!auth?.user;
    const userName = auth?.user?.user_metadata?.name || null;

    return <HomePageClientNew isLoggedIn={isLoggedIn} userName={userName} />;
}
