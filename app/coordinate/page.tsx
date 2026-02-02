// app/coordinate/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "コーディネート提案",
    description: "お気に入りアイテムに合うアイテムを自動提案",
};

// アイテムカテゴリの相性マップ
const COORDINATE_RULES: Record<string, { matches: string[]; reason: string }> = {
    jacket: {
        matches: ["shirt", "tshirt", "pants", "jeans", "sneakers", "boots"],
        reason: "アウターに合わせやすいインナーとボトムス",
    },
    blazer: {
        matches: ["shirt", "chinos", "dress_pants", "loafers", "oxford"],
        reason: "きれいめスタイルにぴったり",
    },
    hoodie: {
        matches: ["tshirt", "jeans", "joggers", "sneakers", "cap"],
        reason: "カジュアルでリラックスしたスタイル",
    },
    shirt: {
        matches: ["jacket", "blazer", "chinos", "jeans", "loafers"],
        reason: "シャツに合わせやすいアイテム",
    },
    jeans: {
        matches: ["jacket", "hoodie", "shirt", "tshirt", "sneakers", "boots"],
        reason: "デニムに合う万能アイテム",
    },
    sneakers: {
        matches: ["jeans", "joggers", "shorts", "hoodie", "tshirt"],
        reason: "スニーカーに合うカジュアルアイテム",
    },
    boots: {
        matches: ["jeans", "jacket", "coat", "chinos"],
        reason: "ブーツに合うしっかりめアイテム",
    },
};

interface LikedCard {
    card_id: string;
    image_url: string;
    tags: string[];
}

interface CoordinateSuggestion {
    base_card: LikedCard;
    suggestions: {
        card_id: string;
        image_url: string;
        tags: string[];
        reason: string;
    }[];
}

export default async function CoordinatePage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        redirect("/login?next=/coordinate");
    }

    // ユーザーのいいねしたカードを取得
    const { data: actions } = await supabase
        .from("recommendation_actions")
        .select("impression_id")
        .eq("user_id", auth.user.id)
        .eq("action", "save")
        .order("created_at", { ascending: false })
        .limit(20);

    if (!actions || actions.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 px-4 py-12">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-2xl font-bold mb-6">👗 コーディネート提案</h1>
                    <div className="bg-white rounded-xl p-12 text-center">
                        <div className="text-6xl mb-4">👔</div>
                        <p className="text-gray-500 mb-4">
                            まずアイテムをいくつかいいねしてください
                        </p>
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
    const impressionIds = actions.map((a) => a.impression_id);
    const { data: impressions } = await supabase
        .from("recommendation_impressions")
        .select("target_id, payload")
        .in("id", impressionIds);

    const likedCards: LikedCard[] =
        impressions?.map((imp) => ({
            card_id: imp.target_id,
            image_url: imp.payload?.image_url || `/cards/${imp.target_id}.png`,
            tags: imp.payload?.tags || [],
        })) || [];

    // 全カードを取得
    const { data: allCards } = await supabase
        .from("curated_cards")
        .select("card_id, image_url, tags")
        .eq("is_active", true);

    const likedCardIds = new Set(likedCards.map((c) => c.card_id));

    // コーディネート提案を生成
    const coordinateSuggestions: CoordinateSuggestion[] = [];

    for (const baseCard of likedCards.slice(0, 5)) {
        // 基準カードのカテゴリを特定
        let baseCategory: string | null = null;
        for (const tag of baseCard.tags) {
            if (COORDINATE_RULES[tag]) {
                baseCategory = tag;
                break;
            }
        }

        if (!baseCategory) continue;

        const rule = COORDINATE_RULES[baseCategory];
        const matchingTags = rule.matches;

        // マッチするカードを検索
        const matchingCards =
            allCards
                ?.filter((card) => {
                    if (likedCardIds.has(card.card_id)) return false;
                    return card.tags?.some((t: string) => matchingTags.includes(t));
                })
                .slice(0, 4)
                .map((card) => ({
                    ...card,
                    reason: rule.reason,
                })) || [];

        if (matchingCards.length > 0) {
            coordinateSuggestions.push({
                base_card: baseCard,
                suggestions: matchingCards,
            });
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white px-4 py-8">
            <div className="max-w-6xl mx-auto">
                {/* ヘッダー */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                        👗 コーディネート提案
                    </h1>
                    <p className="text-gray-600 mt-2">
                        いいねしたアイテムに合うアイテムを自動でセレクト
                    </p>
                </div>

                {coordinateSuggestions.length > 0 ? (
                    <div className="space-y-8">
                        {coordinateSuggestions.map((coord, index) => (
                            <div
                                key={coord.base_card.card_id}
                                className="bg-white rounded-2xl p-6 shadow-sm"
                            >
                                <div className="flex flex-col md:flex-row gap-6">
                                    {/* 基準アイテム */}
                                    <div className="md:w-1/4">
                                        <p className="text-sm text-gray-500 mb-2">
                                            いいねしたアイテム
                                        </p>
                                        <div className="relative">
                                            <img
                                                src={coord.base_card.image_url}
                                                alt={coord.base_card.card_id}
                                                className="w-full aspect-square object-cover rounded-xl"
                                            />
                                            <div className="absolute top-2 right-2">
                                                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                                                    ❤️
                                                </span>
                                            </div>
                                        </div>
                                        <h3 className="font-medium mt-2 text-sm truncate">
                                            {coord.base_card.card_id.replace(/_/g, " ")}
                                        </h3>
                                    </div>

                                    {/* 矢印 */}
                                    <div className="hidden md:flex items-center text-4xl text-gray-300">
                                        →
                                    </div>

                                    {/* 提案アイテム */}
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-500 mb-2">
                                            💡 {coord.suggestions[0]?.reason}
                                        </p>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            {coord.suggestions.map((suggestion) => (
                                                <div
                                                    key={suggestion.card_id}
                                                    className="group bg-gray-50 rounded-xl overflow-hidden hover:shadow-md transition-shadow"
                                                >
                                                    <div className="aspect-square relative">
                                                        <img
                                                            src={suggestion.image_url}
                                                            alt={suggestion.card_id}
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                        />
                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                                    </div>
                                                    <div className="p-2">
                                                        <h4 className="text-xs font-medium truncate">
                                                            {suggestion.card_id.replace(/_/g, " ")}
                                                        </h4>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white rounded-xl p-12 text-center">
                        <div className="text-6xl mb-4">🤔</div>
                        <p className="text-gray-500 mb-4">
                            コーディネートを生成できませんでした
                        </p>
                        <Link
                            href="/start"
                            className="inline-block bg-black text-white px-6 py-3 rounded-full hover:bg-gray-800 transition-colors"
                        >
                            もっとスワイプする
                        </Link>
                    </div>
                )}

                {/* ヒント */}
                <div className="mt-8 bg-gray-50 rounded-xl p-6">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <span>💡</span> コーデのコツ
                    </h3>
                    <ul className="text-sm text-gray-600 space-y-1">
                        <li>• 色は3色以内にまとめるとまとまりが出ます</li>
                        <li>• トップスとボトムスのシルエットでメリハリを</li>
                        <li>• 小物（靴・バッグ）で全体の印象が変わります</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
