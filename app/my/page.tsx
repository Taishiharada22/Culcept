// app/my/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import MyPageClient from "./MyPageClient";

export const dynamic = "force-dynamic";

export default async function MyPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const meta = auth?.user?.user_metadata ?? {};

    return (
        <MyPageClient
            isLoggedIn={!!auth?.user}
            userName={meta?.display_name || meta?.name || meta?.full_name || null}
            userAvatar={meta?.avatar_url || null}
        />
    );
}
