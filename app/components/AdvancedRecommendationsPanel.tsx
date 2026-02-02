// app/components/AdvancedRecommendationsPanel.tsx
"use client";

import { useState } from "react";

type Tab = "collaborative" | "tag-rules" | "vector";

export default function AdvancedRecommendationsPanel() {
    const [activeTab, setActiveTab] = useState<Tab>("collaborative");
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const tabs = [
        { id: "collaborative" as Tab, label: "👥 類似ユーザー", emoji: "👥" },
        { id: "tag-rules" as Tab, label: "🔗 タグ共起", emoji: "🔗" },
        { id: "vector" as Tab, label: "🎯 ベクトル類似", emoji: "🎯" },
    ];

    async function loadRecommendations(tab: Tab) {
        setLoading(true);
        setError(null);

        const endpoints = {
            collaborative: "/api/recommendations/collaborative",
            "tag-rules": "/api/recommendations/tag-rules",
            vector: "/api/recommendations/vector-similarity",
        };

        try {
            const res = await fetch(endpoints[tab], {
                credentials: "include",
                cache: "no-store",
            });
            const json = await res.json();

            if (json.ok) {
                setData(json);
            } else {
                setError(json.error || "Failed to load");
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    function handleTabChange(tab: Tab) {
        setActiveTab(tab);
        setData(null);
        setError(null);
    }

    return (
        <div className="space-y-4">
            {/* Tab Headers */}
            <div className="flex gap-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={`flex-1 rounded-xl border-2 px-4 py-3 text-sm font-black transition-all ${activeTab === tab.id
                                ? "border-purple-500 bg-purple-500 text-white shadow-lg"
                                : "border-slate-200 bg-white text-slate-700 hover:border-purple-300"
                            }`}
                    >
                        <span className="mr-2">{tab.emoji}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Load Button */}
            {!data && !loading && !error && (
                <button
                    onClick={() => loadRecommendations(activeTab)}
                    className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4 text-base font-black text-white transition-all hover:shadow-lg"
                >
                    {activeTab === "collaborative" && "類似ユーザーの好みを見る"}
                    {activeTab === "tag-rules" && "タグの相関を分析"}
                    {activeTab === "vector" && "ベクトル類似度で推薦"}
                </button>
            )}

            {/* Loading */}
            {loading && (
                <div className="text-center py-12">
                    <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
                    <div className="mt-3 text-sm text-gray-600">分析中...</div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Collaborative Results */}
            {activeTab === "collaborative" && data && !loading && (
                <div className="space-y-4">
                    <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-4">
                        <div className="text-sm font-bold text-purple-900 mb-2">📊 分析結果</div>
                        <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                                <span className="text-purple-700">類似ユーザー:</span>
                                <span className="ml-2 font-black">{data.similar_user_count}人</span>
                            </div>
                            <div>
                                <span className="text-purple-700">あなたのLike:</span>
                                <span className="ml-2 font-black">{data.my_likes_count}件</span>
                            </div>
                        </div>
                    </div>

                    {data.recommendations?.length > 0 ? (
                        <div className="space-y-3">
                            <div className="text-sm font-black text-gray-900">
                                推薦カード（{data.recommendations.length}件）
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {data.recommendations.slice(0, 8).map((rec: any, idx: number) => (
                                    <div
                                        key={rec.card_id}
                                        className="rounded-lg border-2 border-purple-200 bg-white p-3"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-purple-600">
                                                #{idx + 1}
                                            </span>
                                            <span className="text-xs font-bold text-purple-600">
                                                {rec.score}人がLike
                                            </span>
                                        </div>
                                        {rec.payload?.image_url && (
                                            <img
                                                src={rec.payload.image_url}
                                                alt=""
                                                className="w-full h-32 object-cover rounded-md mb-2"
                                            />
                                        )}
                                        <div className="text-xs font-semibold text-gray-700">
                                            {rec.card_id}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-sm text-gray-600">
                            {data.message || "推薦カードがありません"}
                        </div>
                    )}
                </div>
            )}

            {/* Tag Rules Results */}
            {activeTab === "tag-rules" && data && !loading && (
                <div className="space-y-4">
                    <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-4">
                        <div className="text-sm font-bold text-orange-900 mb-2">🏷️ あなたの好きなタグ</div>
                        <div className="flex flex-wrap gap-2">
                            {data.my_tags?.slice(0, 10).map((tag: string) => (
                                <span
                                    key={tag}
                                    className="rounded-full bg-orange-600 px-3 py-1 text-xs font-bold text-white"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>

                    {data.rules?.length > 0 ? (
                        <div className="space-y-2">
                            <div className="text-sm font-black text-gray-900">
                                タグの相関ルール（{data.rules.length}件）
                            </div>
                            {data.rules.slice(0, 10).map((rule: any, idx: number) => (
                                <div
                                    key={idx}
                                    className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">
                                            {rule.from_tag}
                                        </span>
                                        <span className="text-gray-400">→</span>
                                        <span className="rounded-full bg-teal-500 px-2 py-0.5 text-xs font-bold text-white">
                                            {rule.to_tag}
                                        </span>
                                    </div>
                                    <div className="flex gap-4 text-xs text-gray-600">
                                        <span>
                                            信頼度: <strong>{Math.round(rule.confidence * 100)}%</strong>
                                        </span>
                                        <span>
                                            件数: <strong>{rule.support}</strong>
                                        </span>
                                        <span>
                                            Lift: <strong>{rule.lift.toFixed(2)}</strong>
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-sm text-gray-600">
                            {data.message || "ルールが見つかりませんでした"}
                        </div>
                    )}
                </div>
            )}

            {/* Vector Results */}
            {activeTab === "vector" && data && !loading && (
                <div className="space-y-4">
                    <div className="rounded-xl border-2 border-teal-200 bg-teal-50 p-4">
                        <div className="text-sm font-bold text-teal-900 mb-2">📊 分析結果</div>
                        <div className="grid grid-cols-3 gap-4 text-xs">
                            <div>
                                <span className="text-teal-700">全カード:</span>
                                <span className="ml-2 font-black">{data.total_cards}</span>
                            </div>
                            <div>
                                <span className="text-teal-700">既見:</span>
                                <span className="ml-2 font-black">{data.seen_count}</span>
                            </div>
                            <div>
                                <span className="text-teal-700">タグ数:</span>
                                <span className="ml-2 font-black">
                                    {Object.keys(data.user_vector || {}).length}
                                </span>
                            </div>
                        </div>
                    </div>

                    {data.recommendations?.length > 0 ? (
                        <div className="space-y-3">
                            <div className="text-sm font-black text-gray-900">
                                類似カード（{data.recommendations.length}件）
                            </div>
                            <div className="space-y-2">
                                {data.recommendations.slice(0, 10).map((rec: any, idx: number) => (
                                    <div
                                        key={rec.card_id}
                                        className="rounded-lg border-2 border-teal-200 bg-white p-3"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-gray-700">
                                                {rec.card_id}
                                            </span>
                                            <span className="rounded-full bg-teal-500 px-2 py-1 text-xs font-black text-white">
                                                {Math.round(rec.similarity * 100)}% 類似
                                            </span>
                                        </div>
                                        {rec.matched_tags?.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {rec.matched_tags.map((tag: string) => (
                                                    <span
                                                        key={tag}
                                                        className="rounded-full bg-teal-100 border border-teal-300 px-2 py-0.5 text-xs font-bold text-teal-700"
                                                    >
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-sm text-gray-600">
                            {data.message || "類似カードがありません"}
                        </div>
                    )}
                </div>
            )}

            {/* Reload Button */}
            {data && !loading && (
                <button
                    onClick={() => loadRecommendations(activeTab)}
                    className="w-full rounded-xl border-2 border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50"
                >
                    🔄 再分析
                </button>
            )}
        </div>
    );
}
