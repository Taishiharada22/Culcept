// app/ranking/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

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
        <div className="min-h-screen bg-gray-50 px-4 py-8">
            <div className="max-w-6xl mx-auto">
                {/* ヘッダー */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold">🏆 週間ランキング</h1>
                    <p className="text-gray-600 mt-2">今週最も人気のアイテム</p>
                </div>

                {/* タブ切り替え */}
                <div className="flex gap-4 mb-6">
                    <button className="px-4 py-2 bg-black text-white rounded-full text-sm font-medium">
                        🔥 人気アイテム
                    </button>
                    <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-300">
                        📈 急上昇
                    </button>
                    <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-300">
                        🏪 ショップ
                    </button>
                </div>

                {/* アイテムランキング */}
                <div className="bg-white rounded-2xl p-6 mb-8">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <span>🔥</span> 人気アイテム TOP20
                    </h2>

                    {rankedCards.length > 0 ? (
                        <div className="space-y-3">
                            {rankedCards.map((item, index) => (
                                <RankingCard
                                    key={item.card_id}
                                    item={item}
                                    rank={index + 1}
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-500 text-center py-8">
                            今週のデータはまだありません
                        </p>
                    )}
                </div>

                {/* ショップランキング */}
                {rankedShops.length > 0 && (
                    <div className="bg-white rounded-2xl p-6">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <span>🏪</span> 人気ショップ
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {rankedShops.map((shop, index) => (
                                <ShopRankCard
                                    key={shop.shop_id}
                                    shop={shop}
                                    rank={index + 1}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function RankingCard({ item, rank }: { item: RankedItem; rank: number }) {
    const medalColors: Record<number, string> = {
        1: "bg-yellow-400 text-yellow-900",
        2: "bg-gray-300 text-gray-700",
        3: "bg-orange-300 text-orange-800",
    };

    return (
        <div className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors">
            {/* ランク */}
            <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                    medalColors[rank] || "bg-gray-100 text-gray-600"
                }`}
            >
                {rank}
            </div>

            {/* 画像 */}
            <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                <img
                    src={item.image_url}
                    alt={item.card_id}
                    className="w-full h-full object-cover"
                />
            </div>

            {/* 情報 */}
            <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate">
                    {item.card_id.replace(/_/g, " ")}
                </h3>
                <div className="flex flex-wrap gap-1 mt-1">
                    {item.tags.slice(0, 3).map((tag, i) => (
                        <span
                            key={i}
                            className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            </div>

            {/* スタッツ */}
            <div className="text-right flex-shrink-0">
                <div className="text-lg font-bold text-red-500">
                    ❤️ {item.likes}
                </div>
                <div className="text-xs text-gray-500">
                    {item.ctr.toFixed(1)}% CTR
                </div>
            </div>
        </div>
    );
}

function ShopRankCard({ shop, rank }: { shop: RankedShop; rank: number }) {
    return (
        <Link
            href={`/shops/${shop.shop_id}`}
            className="bg-gray-50 rounded-xl p-4 text-center hover:bg-gray-100 transition-colors"
        >
            <div className="relative inline-block">
                <img
                    src={shop.avatar_url || "/default-avatar.png"}
                    alt={shop.shop_name}
                    className="w-16 h-16 rounded-full mx-auto object-cover"
                />
                <span
                    className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        rank <= 3 ? "bg-yellow-400" : "bg-gray-300"
                    }`}
                >
                    {rank}
                </span>
            </div>
            <h3 className="font-medium text-sm mt-2 truncate">{shop.shop_name}</h3>
            <p className="text-xs text-gray-500 mt-1">❤️ {shop.likes}</p>
        </Link>
    );
}
