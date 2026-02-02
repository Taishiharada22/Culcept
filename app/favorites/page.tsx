// app/favorites/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

// シンプルな相対時間フォーマット
function formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "たった今";
    if (diffMins < 60) return `${diffMins}分前`;
    if (diffHours < 24) return `${diffHours}時間前`;
    if (diffDays < 7) return `${diffDays}日前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}週間前`;
    return `${Math.floor(diffDays / 30)}ヶ月前`;
}

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
        return (
            <div className="min-h-screen bg-gray-50 px-4 py-12">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-2xl font-bold mb-6">❤️ お気に入り</h1>
                    <div className="bg-white rounded-xl p-12 text-center">
                        <div className="text-6xl mb-4">💔</div>
                        <p className="text-gray-500 mb-4">まだお気に入りがありません</p>
                        <Link
                            href="/start"
                            className="inline-block bg-black text-white px-6 py-3 rounded-full hover:bg-gray-800 transition-colors"
                        >
                            スワイプを始める
                        </Link>
                    </div>
                </div>
            </div>
        );
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

    return (
        <div className="min-h-screen bg-gray-50 px-4 py-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold">❤️ お気に入り</h1>
                    <span className="text-sm text-gray-500">{savedItems.length}件</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {savedItems.map((item) => (
                        <FavoriteCard key={item.id} item={item} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function FavoriteCard({ item }: { item: SavedItem }) {
    const imageUrl = item.payload.image_url || item.payload.cover_image_url || "/placeholder.png";
    const title = item.payload.title || item.payload.card_id || "アイテム";
    const tags = item.payload.tags || [];

    const timeAgo = formatTimeAgo(new Date(item.created_at));

    const href = item.target_type === "drop"
        ? `/drops/${item.target_id}`
        : item.target_type === "card"
        ? `/start`
        : "#";

    return (
        <Link
            href={href}
            className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all"
        >
            <div className="aspect-square relative overflow-hidden">
                <img
                    src={imageUrl}
                    alt={title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-2 right-2">
                    <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                        ❤️
                    </span>
                </div>
            </div>
            <div className="p-3">
                <h3 className="font-medium text-sm truncate">{title}</h3>
                {item.payload.brand && (
                    <p className="text-xs text-gray-500 truncate">{item.payload.brand}</p>
                )}
                {item.payload.price && (
                    <p className="text-sm font-bold mt-1">
                        ¥{item.payload.price.toLocaleString()}
                    </p>
                )}
                {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {tags.slice(0, 3).map((tag, i) => (
                            <span
                                key={i}
                                className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
                <p className="text-xs text-gray-400 mt-2">{timeAgo}</p>
            </div>
        </Link>
    );
}
