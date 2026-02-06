// app/favorites/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import FavoritesClient from "./FavoritesClient";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "お気に入り",
    description: "いいねしたアイテム一覧",
};

interface SavedItem {
    id: string;
    created_at: string;
    impression_id: string;
    target_type: string;
    target_id: string;
    payload: {
        card_id?: string;
        image_url?: string;
        cover_image_url?: string;
        title?: string;
        brand?: string;
        price?: number;
        tags?: string[];
    };
    explain?: string;
}

export default async function FavoritesPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        redirect("/login?next=/favorites");
    }

    // いいね(save)したアクションを取得
    const { data: actions } = await supabase
        .from("recommendation_actions")
        .select("id, created_at, impression_id, action")
        .eq("user_id", auth.user.id)
        .eq("action", "save")
        .order("created_at", { ascending: false })
        .limit(100);

    if (!actions || actions.length === 0) {
        return <FavoritesClient items={[]} />;
    }

    // インプレッション情報を取得
    const impressionIds = actions.map(a => a.impression_id);
    const { data: impressions } = await supabase
        .from("recommendation_impressions")
        .select("id, target_type, target_id, payload, explain")
        .in("id", impressionIds);

    const impressionMap = new Map(impressions?.map(i => [i.id, i]) || []);

    // アクションとインプレッションを結合
    const savedItems: SavedItem[] = actions
        .map(a => {
            const imp = impressionMap.get(a.impression_id);
            if (!imp) return null;
            return {
                id: a.id,
                created_at: a.created_at,
                impression_id: a.impression_id,
                target_type: imp.target_type,
                target_id: imp.target_id,
                payload: imp.payload || {},
                explain: imp.explain,
            };
        })
        .filter(Boolean) as SavedItem[];

    return <FavoritesClient items={savedItems} />;
}
