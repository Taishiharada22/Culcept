// app/components/UltimateRecommendationsPanel.tsx
"use client";

import { useState } from "react";

type Algorithm =
    | "collaborative"
    | "tag-rules"
    | "vector"
    | "timeslot"
    | "sequence"
    | "diversity"
    | "seasonal"
    | "speed"
    | "bandit"
    | "graph";

type AlgorithmInfo = {
    id: Algorithm;
    name: string;
    emoji: string;
    description: string;
    category: "basic" | "advanced" | "ai";
};

const algorithms: AlgorithmInfo[] = [
    {
        id: "collaborative",
        name: "協調フィルタリング",
        emoji: "👥",
        description: "似たユーザーの好みから推薦",
        category: "basic",
    },
    {
        id: "tag-rules",
        name: "タグ共起分析",
        emoji: "🔗",
        description: "タグの相関ルールを発見",
        category: "basic",
    },
    {
        id: "vector",
        name: "ベクトル類似度",
        emoji: "🎯",
        description: "コサイン距離で精密推薦",
        category: "basic",
    },
    {
        id: "timeslot",
        name: "時間帯別",
        emoji: "⏰",
        description: "朝/昼/夜で最適化",
        category: "advanced",
    },
    {
        id: "sequence",
        name: "連続パターン",
        emoji: "🔄",
        description: "評価の流れを学習",
        category: "advanced",
    },
    {
        id: "diversity",
        name: "多様性スコア",
        emoji: "🎨",
        description: "偏りを検出・調整",
        category: "advanced",
    },
    {
        id: "seasonal",
        name: "季節性検出",
        emoji: "🌸",
        description: "季節ごとの好みを学習",
        category: "advanced",
    },
    {
        id: "speed",
        name: "スピード学習",
        emoji: "⚡",
        description: "即likeは強い興味",
        category: "ai",
    },
    {
        id: "bandit",
        name: "バンディット",
        emoji: "🎰",
        description: "探索と活用のバランス",
        category: "ai",
    },
    {
        id: "graph",
        name: "グラフベース",
        emoji: "🕸️",
        description: "2-hopで発見",
        category: "ai",
    },
];

export default function UltimateRecommendationsPanel() {
    const [activeAlgo, setActiveAlgo] = useState<Algorithm>("collaborative");
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const endpoints: Record<Algorithm, string> = {
        collaborative: "/api/recommendations/collaborative",
        "tag-rules": "/api/recommendations/tag-rules",
        vector: "/api/recommendations/vector-similarity",
        timeslot: "/api/recommendations/timeslot",
        sequence: "/api/recommendations/sequence-pattern",
        diversity: "/api/recommendations/diversity",
        seasonal: "/api/recommendations/seasonal",
        speed: "/api/recommendations/speed-learning",
        bandit: "/api/recommendations/bandit?epsilon=0.1&limit=20",
        graph: "/api/recommendations/graph",
    };

    async function loadRecommendations(algo: Algorithm) {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(endpoints[algo], {
                credentials: "include",
                cache: "no-store",
            });
            const json = await res.json();

            if (json.ok) {
                setData(json);
            } else {
                setError(json.error || json.message || "Failed to load");
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    const currentAlgo = algorithms.find((a) => a.id === activeAlgo)!;

    return (
        <div className="space-y-6">
            {/* Category Tabs */}
            <div className="space-y-3">
                <div className="text-sm font-black text-gray-700 uppercase tracking-wide">
                    📚 Basic Algorithms
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {algorithms
                        .filter((a) => a.category === "basic")
                        .map((algo) => (
                            <button
                                key={algo.id}
                                onClick={() => {
                                    setActiveAlgo(algo.id);
                                    setData(null);
                                    setError(null);
                                }}
                                className={`rounded-xl border-2 px-3 py-2 text-xs font-bold transition-all ${activeAlgo === algo.id
                                    ? "border-purple-500 bg-purple-500 text-white shadow-lg"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-purple-300"
                                    }`}
                            >
                                <div className="text-lg mb-1">{algo.emoji}</div>
                                <div>{algo.name}</div>
                            </button>
                        ))}
                </div>

                <div className="text-sm font-black text-gray-700 uppercase tracking-wide mt-6">
                    🚀 Advanced Algorithms
                </div>
                <div className="grid grid-cols-4 gap-2">
                    {algorithms
                        .filter((a) => a.category === "advanced")
                        .map((algo) => (
                            <button
                                key={algo.id}
                                onClick={() => {
                                    setActiveAlgo(algo.id);
                                    setData(null);
                                    setError(null);
                                }}
                                className={`rounded-xl border-2 px-3 py-2 text-xs font-bold transition-all ${activeAlgo === algo.id
                                    ? "border-orange-500 bg-orange-500 text-white shadow-lg"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-orange-300"
                                    }`}
                            >
                                <div className="text-lg mb-1">{algo.emoji}</div>
                                <div>{algo.name}</div>
                            </button>
                        ))}
                </div>

                <div className="text-sm font-black text-gray-700 uppercase tracking-wide mt-6">
                    🤖 AI Algorithms
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {algorithms
                        .filter((a) => a.category === "ai")
                        .map((algo) => (
                            <button
                                key={algo.id}
                                onClick={() => {
                                    setActiveAlgo(algo.id);
                                    setData(null);
                                    setError(null);
                                }}
                                className={`rounded-xl border-2 px-3 py-2 text-xs font-bold transition-all ${activeAlgo === algo.id
                                    ? "border-teal-500 bg-teal-500 text-white shadow-lg"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-teal-300"
                                    }`}
                            >
                                <div className="text-lg mb-1">{algo.emoji}</div>
                                <div>{algo.name}</div>
                            </button>
                        ))}
                </div>
            </div>

            {/* Algorithm Info */}
            <div className="rounded-xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                <div className="flex items-center gap-3">
                    <span className="text-3xl">{currentAlgo.emoji}</span>
                    <div className="flex-1">
                        <div className="text-lg font-black text-slate-900">
                            {currentAlgo.name}
                        </div>
                        <div className="text-sm text-slate-600">{currentAlgo.description}</div>
                    </div>
                </div>
            </div>

            {/* Load Button */}
            {!data && !loading && !error && (
                <button
                    onClick={() => loadRecommendations(activeAlgo)}
                    className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4 text-base font-black text-white transition-all hover:shadow-lg"
                >
                    🚀 {currentAlgo.name}を実行
                </button>
            )}

            {/* Loading */}
            {loading && (
                <div className="text-center py-16">
                    <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
                    <div className="mt-4 text-base font-bold text-gray-700">
                        {currentAlgo.name}分析中...
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                    {error}
                </div>
            )}

            {/* Results - Generic Display */}
            {data && !loading && (
                <div className="space-y-4">
                    {/* Stats */}
                    <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-4">
                        <div className="text-sm font-black text-purple-900 mb-3">
                            📊 分析結果
                        </div>
                        <div className="text-xs text-purple-800 whitespace-pre-wrap font-mono">
                            {JSON.stringify(
                                {
                                    ...data,
                                    recommendations: `${data.recommendations?.length || 0
                                        } items`,
                                },
                                null,
                                2
                            ).substring(0, 500)}
                            ...
                        </div>
                    </div>

                    {/* Recommendations */}
                    {data.recommendations?.length > 0 && (
                        <div>
                            <div className="text-sm font-black text-gray-900 mb-3">
                                推薦結果（{data.recommendations.length}件）
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {data.recommendations.slice(0, 8).map((rec: any, idx: number) => (
                                    <div
                                        key={rec.card_id || idx}
                                        className="rounded-lg border-2 border-slate-200 bg-white p-3"
                                    >
                                        <div className="text-xs font-bold text-slate-700 mb-2">
                                            #{idx + 1} {rec.card_id || rec.tag || ""}
                                        </div>
                                        {rec.score !== undefined && (
                                            <div className="text-xs text-slate-600">
                                                Score: {rec.score}
                                            </div>
                                        )}
                                        {rec.similarity !== undefined && (
                                            <div className="text-xs text-slate-600">
                                                類似度: {Math.round(rec.similarity * 100)}%
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Reload Button */}
                    <button
                        onClick={() => loadRecommendations(activeAlgo)}
                        className="w-full rounded-xl border-2 border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50"
                    >
                        🔄 再実行
                    </button>
                </div>
            )}
        </div>
    );
}
