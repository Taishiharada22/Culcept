// components/RecoProfilePanel.tsx
"use client";

import { useEffect, useState } from "react";

type TagScore = { tag: string; score: number };
type WeeklyTrend = { week: string; topTag: string; score: number };
type CategoryScore = { category: string; score: number; tags: string[] };

type Profile = {
    topTags: TagScore[];
    weeklyTrends: WeeklyTrend[];
    categoryScores: CategoryScore[];
    confidence: number;
    totalRatings: number;
    likeCount: number;
    dislikeCount: number;
};

export default function RecoProfilePanel() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/recommendations/profile", {
            credentials: "include",
            cache: "no-store",
        })
            .then((r) => r.json())
            .then((data) => {
                if (data.ok) {
                    setProfile(data.profile);
                } else {
                    setError(data.error || "Failed to load profile");
                }
            })
            .catch((err) => {
                setError(String(err?.message ?? err));
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="text-center py-8">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
                <div className="mt-2 text-sm text-gray-600">プロフィール読み込み中...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
            </div>
        );
    }

    if (!profile || profile.totalRatings === 0) {
        return (
            <div className="text-center py-8">
                <div className="text-4xl mb-3 opacity-30">📊</div>
                <div className="text-lg font-bold text-gray-900 mb-2">
                    まだデータがありません
                </div>
                <div className="text-sm text-gray-600">
                    カードを評価すると、あなたのスタイル傾向が表示されます
                </div>
            </div>
        );
    }

    const { topTags, weeklyTrends, categoryScores, confidence, totalRatings, likeCount, dislikeCount } = profile;

    // 信頼度の色
    const confidenceColor =
        confidence >= 80
            ? "text-green-600 bg-green-50"
            : confidence >= 50
                ? "text-orange-600 bg-orange-50"
                : "text-red-600 bg-red-50";

    return (
        <div className="space-y-6 animate-fade-in">
            {/* ヘッダー */}
            <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black text-gray-900">
                    🎨 あなたのスタイル傾向
                </h3>

                {/* 信頼度バッジ */}
                <div className={`rounded-full px-4 py-2 text-sm font-black ${confidenceColor}`}>
                    信頼度: {confidence}%
                </div>
            </div>

            {/* 統計サマリー */}
            <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-white p-4 text-center">
                    <div className="text-3xl font-black text-purple-600">{totalRatings}</div>
                    <div className="text-xs font-bold text-gray-600 mt-1">評価数</div>
                </div>
                <div className="rounded-xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-white p-4 text-center">
                    <div className="text-3xl font-black text-green-600">{likeCount}</div>
                    <div className="text-xs font-bold text-gray-600 mt-1">👍 Like</div>
                </div>
                <div className="rounded-xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-white p-4 text-center">
                    <div className="text-3xl font-black text-red-600">{dislikeCount}</div>
                    <div className="text-xs font-bold text-gray-600 mt-1">👎 Dislike</div>
                </div>
            </div>

            {confidence < 50 && (
                <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-4 text-sm">
                    <div className="font-bold text-orange-900 mb-1">📈 精度向上のヒント</div>
                    <div className="text-orange-800">
                        あと <strong>{50 - totalRatings}枚</strong> 評価すると、より正確な傾向が分かります！
                    </div>
                </div>
            )}

            {/* Top 10 タグ */}
            {topTags.length > 0 && (
                <div className="space-y-3">
                    <h4 className="text-lg font-black text-gray-900">🏷️ トップタグ</h4>
                    <div className="space-y-2">
                        {topTags.map(({ tag, score }, idx) => {
                            const maxScore = Math.max(...topTags.map((t) => Math.abs(t.score)));
                            const normalizedScore = maxScore > 0 ? (score / maxScore) * 100 : 0;
                            const percentage = Math.max(0, Math.min(100, normalizedScore));

                            const barColor =
                                score > 0
                                    ? "bg-gradient-to-r from-purple-500 to-purple-600"
                                    : "bg-gradient-to-r from-red-400 to-red-500";

                            return (
                                <div key={tag} className="flex items-center gap-3">
                                    <div className="w-8 text-sm font-bold text-gray-500 text-right">
                                        #{idx + 1}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-bold text-gray-900">{tag}</span>
                                            <span className="text-xs font-bold text-gray-600">
                                                {score > 0 ? "+" : ""}{score}
                                            </span>
                                        </div>
                                        <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden">
                                            <div
                                                className={`h-full ${barColor} transition-all duration-500 ease-out`}
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* カテゴリ分類 */}
            {categoryScores.length > 0 && (
                <div className="space-y-3">
                    <h4 className="text-lg font-black text-gray-900">📦 カテゴリ別スコア</h4>
                    <div className="grid grid-cols-2 gap-3">
                        {categoryScores.map(({ category, score, tags }) => {
                            const maxCategoryScore = Math.max(...categoryScores.map((c) => Math.abs(c.score)));
                            const percentage =
                                maxCategoryScore > 0
                                    ? Math.round((Math.abs(score) / maxCategoryScore) * 100)
                                    : 0;

                            const isPositive = score > 0;

                            return (
                                <div
                                    key={category}
                                    className={`rounded-xl border-2 p-4 transition-all hover:shadow-lg ${isPositive
                                            ? "border-purple-200 bg-gradient-to-br from-purple-50 to-white"
                                            : "border-gray-200 bg-gradient-to-br from-gray-50 to-white"
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-black text-gray-900">
                                            {category}
                                        </span>
                                        <span
                                            className={`text-xs font-black ${isPositive ? "text-purple-600" : "text-gray-500"
                                                }`}
                                        >
                                            {score > 0 ? "+" : ""}{score}
                                        </span>
                                    </div>

                                    {/* プログレスバー */}
                                    <div className="h-2 rounded-full bg-gray-200 overflow-hidden mb-2">
                                        <div
                                            className={`h-full transition-all duration-500 ${isPositive
                                                    ? "bg-gradient-to-r from-purple-500 to-purple-600"
                                                    : "bg-gray-400"
                                                }`}
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>

                                    {/* タグ一覧 */}
                                    {tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {tags.slice(0, 4).map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="text-xs px-2 py-0.5 rounded-full bg-white border border-gray-300 text-gray-700"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                            {tags.length > 4 && (
                                                <span className="text-xs px-2 py-0.5 text-gray-500">
                                                    +{tags.length - 4}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 週次推移 */}
            {weeklyTrends.length > 0 && (
                <div className="space-y-3">
                    <h4 className="text-lg font-black text-gray-900">📈 スタイル推移（週次）</h4>
                    <div className="space-y-2">
                        {weeklyTrends.map(({ week, topTag, score }) => (
                            <div
                                key={week}
                                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
                            >
                                <div className="w-20 text-xs font-bold text-gray-600">{week}</div>
                                <div className="flex-1 flex items-center gap-2">
                                    <span className="text-sm font-bold text-gray-900">{topTag}</span>
                                    <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-teal-500 to-teal-600"
                                            style={{
                                                width: `${Math.min(100, Math.abs(score) * 10)}%`,
                                            }}
                                        />
                                    </div>
                                    <span className="text-xs font-bold text-gray-600">
                                        {score > 0 ? "+" : ""}{score}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
