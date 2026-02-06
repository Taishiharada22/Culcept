// app/ranking/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import RankingPageClient from "./RankingPageClient";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "週間ランキング",
    description: "今週人気のアイテム・ショップランキング",
};

interface RankedItem {
    card_id: string;
    image_url: string;
    tags: string[];
    likes: number;
    impressions: number;
    ctr: number;
}

interface RankedShop {
    shop_id: string;
    shop_name: string;
    avatar_url: string;
    followers: number;
    likes: number;
}

export default async function RankingPage() {
    const supabase = await supabaseServer();

    // 過去7日間の日付
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // カードの人気ランキングを計算
    const { data: cardActions } = await supabase
        .from("recommendation_actions")
        .select("impression_id, action")
        .gte("created_at", oneWeekAgo);

    const { data: cardImpressions } = await supabase
        .from("recommendation_impressions")
        .select("id, target_id, target_type, payload")
        .eq("target_type", "card")
        .gte("created_at", oneWeekAgo);

    // インプレッションごとの集計
    const cardStats = new Map<string, { likes: number; impressions: number; payload: any }>();

    cardImpressions?.forEach((imp) => {
        const cardId = imp.target_id;
        if (!cardStats.has(cardId)) {
            cardStats.set(cardId, { likes: 0, impressions: 0, payload: imp.payload });
        }
        cardStats.get(cardId)!.impressions++;
    });

    const impressionToCard = new Map(cardImpressions?.map((i) => [i.id, i.target_id]) || []);

    cardActions?.forEach((act) => {
        const cardId = impressionToCard.get(act.impression_id);
        if (cardId && act.action === "save") {
            if (cardStats.has(cardId)) {
                cardStats.get(cardId)!.likes++;
            }
        }
    });

    // ランキング作成
    const rankedCards: RankedItem[] = [...cardStats.entries()]
        .map(([cardId, stats]) => ({
            card_id: cardId,
            image_url: stats.payload?.image_url || `/cards/${cardId}.png`,
            tags: stats.payload?.tags || [],
            likes: stats.likes,
            impressions: stats.impressions,
            ctr: stats.impressions > 0 ? (stats.likes / stats.impressions) * 100 : 0,
        }))
        .filter((c) => c.impressions >= 3) // 最低3インプレッション
        .sort((a, b) => b.likes - a.likes)
        .slice(0, 20);

    // ショップランキング（dropsベース）
    const { data: shopLikes } = await supabase
        .from("recommendation_actions")
        .select(`
            action,
            recommendation_impressions!inner(
                target_type,
                payload
            )
        `)
        .eq("action", "save")
        .eq("recommendation_impressions.target_type", "drop")
        .gte("created_at", oneWeekAgo)
        .limit(500);

    const shopStats = new Map<string, { name: string; avatar: string; likes: number }>();

    shopLikes?.forEach((act: any) => {
        const payload = act.recommendation_impressions?.payload;
        const shopId = payload?.shop_id;
        const shopName = payload?.shop_name || payload?.shop_name_ja;
        const avatar = payload?.shop_avatar_url;

        if (shopId && shopName) {
            if (!shopStats.has(shopId)) {
                shopStats.set(shopId, { name: shopName, avatar: avatar || "", likes: 0 });
            }
            shopStats.get(shopId)!.likes++;
        }
    });

    const rankedShops = [...shopStats.entries()]
        .map(([id, stats]) => ({
            shop_id: id,
            shop_name: stats.name,
            avatar_url: stats.avatar,
            likes: stats.likes,
            followers: 0,
        }))
        .sort((a, b) => b.likes - a.likes)
        .slice(0, 10);

    return (
        <RankingPageClient rankedCards={rankedCards} rankedShops={rankedShops} />
    );
}
