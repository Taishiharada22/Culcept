// app/for-you/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getHybridRecommendations } from "@/lib/recommendations/hybrid";
import { buildUserProfile } from "@/lib/recommendations/content-based";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "あなたへのおすすめ",
    description: "あなたの好みに合わせたパーソナライズドフィード",
};

export default async function ForYouPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        redirect("/login?next=/for-you");
    }

    // ユーザープロファイルを構築
    const profile = await buildUserProfile(auth.user.id);

    // ハイブリッド推薦を取得
    const recommendations = await getHybridRecommendations(auth.user.id, 30);

    // ユーザーの好みタグを分析
    const topTags = [...profile.tagPreferences.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag]) => tag);

    const hasProfile = profile.likedCards.length > 0;

    return (
        <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white px-4 py-8">
            <div className="max-w-6xl mx-auto">
                {/* ヘッダー */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                        ✨ あなたへのおすすめ
                    </h1>
                    <p className="text-gray-600 mt-2">
                        あなたの好みを分析してパーソナライズされたアイテムをお届け
                    </p>
                </div>

                {/* ユーザープロファイルサマリー */}
                {hasProfile && (
                    <div className="bg-white rounded-2xl p-6 shadow-sm mb-8">
                        <h2 className="font-semibold mb-3 flex items-center gap-2">
                            <span className="text-xl">🎯</span>
                            あなたの好み
                        </h2>
                        <div className="flex flex-wrap gap-2">
                            {topTags.map((tag, i) => (
                                <span
                                    key={tag}
                                    className={`px-3 py-1 rounded-full text-sm ${
                                        i < 3
                                            ? "bg-purple-100 text-purple-700 font-medium"
                                            : "bg-gray-100 text-gray-600"
                                    }`}
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                        <p className="text-sm text-gray-500 mt-3">
                            {profile.likedCards.length}件のいいねを分析しました
                        </p>
                    </div>
                )}

                {/* 新規ユーザー向けオンボーディング */}
                {!hasProfile && (
                    <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-8 text-white mb-8">
                        <h2 className="text-2xl font-bold mb-2">まずはスワイプしてみよう！</h2>
                        <p className="text-purple-100 mb-4">
                            いくつかのアイテムをいいね/スキップすると、あなたの好みを学習して
                            パーソナライズされたおすすめが表示されます。
                        </p>
                        <Link
                            href="/start"
                            className="inline-block bg-white text-purple-600 px-6 py-3 rounded-full font-medium hover:bg-purple-50 transition-colors"
                        >
                            スワイプを始める →
                        </Link>
                    </div>
                )}

                {/* おすすめセクション */}
                {recommendations.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {recommendations.map((item, index) => (
                            <RecommendationCard
                                key={item.card_id}
                                item={item}
                                rank={index + 1}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="bg-white rounded-xl p-12 text-center">
                        <div className="text-6xl mb-4">🔮</div>
                        <p className="text-gray-500 mb-4">
                            まだおすすめを生成できません
                        </p>
                        <Link
                            href="/start"
                            className="inline-block bg-black text-white px-6 py-3 rounded-full hover:bg-gray-800 transition-colors"
                        >
                            スワイプを始める
                        </Link>
                    </div>
                )}

                {/* 推薦理由の説明 */}
                {hasProfile && recommendations.length > 0 && (
                    <div className="mt-8 bg-gray-50 rounded-xl p-6">
                        <h3 className="font-semibold mb-2 flex items-center gap-2">
                            <span>🤖</span> AIがおすすめを選んだ理由
                        </h3>
                        <ul className="text-sm text-gray-600 space-y-1">
                            <li>• あなたの過去のいいねパターンを分析</li>
                            <li>• 似た好みを持つユーザーの行動を参考に</li>
                            <li>• 新しい発見のため20%はランダム要素を追加</li>
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}

interface ScoredCard {
    card_id: string;
    image_url: string;
    tags: string[];
    score: number;
    sources: string[];
}

function RecommendationCard({ item, rank }: { item: ScoredCard; rank: number }) {
    // 推薦理由をラベル化
    const reasonLabels: Record<string, string> = {
        collaborative: "👥 似た人も好き",
        content: "🎯 好みにマッチ",
        popularity: "🔥 人気",
        diversity: "✨ 新しい発見",
    };

    const mainReason = item.sources[0];

    return (
        <div className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all">
            <div className="aspect-square relative overflow-hidden">
                <img
                    src={item.image_url}
                    alt={item.card_id}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* ランキングバッジ */}
                {rank <= 3 && (
                    <div className="absolute top-2 left-2">
                        <span
                            className={`text-white text-xs font-bold px-2 py-1 rounded-full ${
                                rank === 1
                                    ? "bg-yellow-500"
                                    : rank === 2
                                    ? "bg-gray-400"
                                    : "bg-orange-400"
                            }`}
                        >
                            #{rank}
                        </span>
                    </div>
                )}

                {/* 推薦理由バッジ */}
                {mainReason && reasonLabels[mainReason] && (
                    <div className="absolute top-2 right-2">
                        <span className="bg-black/70 text-white text-xs px-2 py-1 rounded-full">
                            {reasonLabels[mainReason]}
                        </span>
                    </div>
                )}

                {/* マッチスコア */}
                <div className="absolute bottom-2 right-2">
                    <span className="bg-purple-500 text-white text-xs px-2 py-1 rounded-full">
                        {Math.round(item.score * 100)}%
                    </span>
                </div>
            </div>

            <div className="p-3">
                <h3 className="font-medium text-sm truncate">
                    {item.card_id.replace(/_/g, " ")}
                </h3>
                {item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {item.tags.slice(0, 3).map((tag, i) => (
                            <span
                                key={i}
                                className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
