// app/components/UltimateRecommendationsPanel.tsx
"use client";

import React from "react";

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
    | "graph"
    | "hybrid";

type AlgorithmInfo = {
    id: Algorithm;
    name: string;
    emoji: string;
    description: string;
    category: "basic" | "advanced" | "ai";
    endpoint: string;
};

const algorithms: AlgorithmInfo[] = [
    // Basic
    {
        id: "collaborative",
        name: "協調フィルタリング",
        emoji: "👥",
        description: "似たユーザーの好みから推薦",
        category: "basic",
        endpoint: "/api/recommendations/collaborative",
    },
    {
        id: "tag-rules",
        name: "タグ共起分析",
        emoji: "🔗",
        description: `"denimを好む人はmilitaryも好む" を発見`,
        category: "basic",
        endpoint: "/api/recommendations/tag-rules",
    },
    {
        id: "vector",
        name: "ベクトル類似度",
        emoji: "🎯",
        description: "コサイン距離で精密推薦（Pure JS）",
        category: "basic",
        endpoint: "/api/recommendations/vector-similarity",
    },

    // Advanced
    {
        id: "timeslot",
        name: "時間帯別",
        emoji: "⏰",
        description: "朝/昼/夜で好みが変わることを学習",
        category: "advanced",
        endpoint: "/api/recommendations/timeslot",
    },
    {
        id: "sequence",
        name: "連続パターン",
        emoji: "🔄",
        description: `"3枚連続dislike後はlikeしやすい" を学習`,
        category: "advanced",
        endpoint: "/api/recommendations/sequence-pattern",
    },
    {
        id: "diversity",
        name: "多様性スコア",
        emoji: "🎨",
        description: "偏りを検出してランダム要素を調整",
        category: "advanced",
        endpoint: "/api/recommendations/diversity",
    },
    {
        id: "seasonal",
        name: "季節性検出",
        emoji: "🌸",
        description: "春/夏/秋/冬ごとの好みを学習",
        category: "advanced",
        endpoint: "/api/recommendations/seasonal",
    },

    // AI
    {
        id: "speed",
        name: "スピード学習",
        emoji: "⚡",
        description: "即likeは強い興味、長考後likeは弱い興味",
        category: "ai",
        endpoint: "/api/recommendations/speed-learning",
    },
    {
        id: "bandit",
        name: "バンディット",
        emoji: "🎰",
        description: "Epsilon-Greedy（探索と活用のバランス）",
        category: "ai",
        endpoint: "/api/recommendations/bandit?epsilon=0.1&limit=20",
    },
    {
        id: "graph",
        name: "グラフベース",
        emoji: "🕸️",
        description: "2-hopで類似カード発見",
        category: "ai",
        endpoint: "/api/recommendations/graph",
    },
    {
        id: "hybrid",
        name: "ハイブリッド",
        emoji: "🤖",
        description: "5つのアルゴリズムを統合",
        category: "ai",
        endpoint: "/api/recommendations/hybrid?limit=20",
    },
];

function cx(...v: Array<string | false | null | undefined>) {
    return v.filter(Boolean).join(" ");
}

/**
 * JSON.stringify が BigInt / circular で落ちないようにする安全版
 */
function safeStringify(input: unknown, space = 2) {
    const seen = new WeakSet<object>();

    return JSON.stringify(
        input,
        (_k, v) => {
            if (typeof v === "bigint") return v.toString();
            if (typeof v === "object" && v !== null) {
                const obj = v as object;
                if (seen.has(obj)) return "[Circular]";
                seen.add(obj);
            }
            return v;
        },
        space
    );
}

async function callApi(endpoint: string) {
    const res = await fetch(endpoint, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
    });

    const text = await res.text();
    let json: any = null;

    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = { ok: false, error: "Non-JSON response", raw: text };
    }

    if (!res.ok) {
        const message = (json && (json.error || json.message)) || `HTTP ${res.status}`;
        const err = new Error(message);
        (err as any).status = res.status;
        (err as any).payload = json;
        throw err;
    }

    return json;
}

export default function UltimateRecommendationsPanel() {
    const [activeAlgo, setActiveAlgo] = React.useState<Algorithm>("hybrid");
    const [loading, setLoading] = React.useState(false);
    const [data, setData] = React.useState<any>(null);
    const [error, setError] = React.useState<string | null>(null);

    const currentAlgo = React.useMemo(
        () => algorithms.find((a) => a.id === activeAlgo)!,
        [activeAlgo]
    );

    const basicAlgos = React.useMemo(
        () => algorithms.filter((a) => a.category === "basic"),
        []
    );
    const advancedAlgos = React.useMemo(
        () => algorithms.filter((a) => a.category === "advanced"),
        []
    );
    const aiAlgos = React.useMemo(
        () => algorithms.filter((a) => a.category === "ai"),
        []
    );

    const prettyDebug = React.useMemo(() => {
        if (data == null && error == null) return "";
        try {
            return safeStringify(data ?? { ok: false, error }, 2);
        } catch {
            try {
                return String(data ?? error);
            } catch {
                return "[unprintable]";
            }
        }
    }, [data, error]);

    const loadRecommendations = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        setData(null);

        try {
            const json = await callApi(currentAlgo.endpoint);

            // ok:true だけが成功とは限らないので、無ければそのまま出す
            if (json && (json.ok === true || json.recommendations || json.items)) {
                setData(json);
            } else {
                setError(json?.error || json?.message || "Failed to load");
                setData(json);
            }
        } catch (e: any) {
            const msg =
                e?.message ||
                e?.payload?.error ||
                e?.payload?.message ||
                "Request failed";
            setError(msg);
            setData(e?.payload ?? null);
        } finally {
            setLoading(false);
        }
    }, [currentAlgo.endpoint]);

    const AlgoButton = ({
        algo,
        activeClass,
        idleClass,
    }: {
        algo: AlgorithmInfo;
        activeClass: string;
        idleClass: string;
    }) => {
        const isActive = activeAlgo === algo.id;
        return (
            <button
                key={algo.id}
                type="button"
                onClick={() => {
                    setActiveAlgo(algo.id);
                    setData(null);
                    setError(null);
                }}
                className={cx(
                    "rounded-xl border-2 text-sm font-bold transition-all",
                    isActive ? activeClass : idleClass
                )}
                aria-pressed={isActive}
            >
                <div className="px-4 py-3">
                    <div className="text-2xl mb-1">{algo.emoji}</div>
                    <div className="text-xs">{algo.name}</div>
                </div>
            </button>
        );
    };

    const recommendations: any[] =
        (data?.recommendations as any[]) ??
        (data?.items as any[]) ??
        (data?.cards as any[]) ??
        [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 via-white to-purple-50 p-6 shadow-lg">
                <div className="flex items-center gap-4 mb-4">
                    <div className="text-5xl">{currentAlgo.emoji}</div>
                    <div className="flex-1">
                        <h3 className="text-2xl font-black text-gray-900 mb-1">
                            {currentAlgo.name}
                        </h3>
                        <p className="text-sm text-gray-600">{currentAlgo.description}</p>
                        <div className="mt-2 text-xs font-mono text-gray-500">
                            {currentAlgo.endpoint}
                        </div>
                    </div>
                </div>
            </div>

            {/* Category Tabs */}
            <div className="space-y-4">
                {/* Basic */}
                <div>
                    <div className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                        📚 Basic Algorithms
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {basicAlgos.map((algo) => (
                            <AlgoButton
                                key={algo.id}
                                algo={algo}
                                activeClass="border-purple-500 bg-purple-500 text-white shadow-lg scale-105"
                                idleClass="border-gray-200 bg-white text-gray-700 hover:border-purple-300 hover:shadow-md"
                            />
                        ))}
                    </div>
                </div>

                {/* Advanced */}
                <div>
                    <div className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                        🚀 Advanced Algorithms
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        {advancedAlgos.map((algo) => (
                            <AlgoButton
                                key={algo.id}
                                algo={algo}
                                activeClass="border-orange-500 bg-orange-500 text-white shadow-lg scale-105"
                                idleClass="border-gray-200 bg-white text-gray-700 hover:border-orange-300 hover:shadow-md"
                            />
                        ))}
                    </div>
                </div>

                {/* AI */}
                <div>
                    <div className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                        🤖 AI Algorithms
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        {aiAlgos.map((algo) => (
                            <AlgoButton
                                key={algo.id}
                                algo={algo}
                                activeClass="border-teal-500 bg-teal-500 text-white shadow-lg scale-105"
                                idleClass="border-gray-200 bg-white text-gray-700 hover:border-teal-300 hover:shadow-md"
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Execute Button */}
            {!data && !loading && !error && (
                <button
                    onClick={loadRecommendations}
                    className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-teal-600 px-6 py-4 text-lg font-black text-white shadow-lg transition-all hover:shadow-2xl hover:scale-105"
                >
                    🚀 {currentAlgo.name}を実行
                </button>
            )}

            {/* Loading */}
            {loading && (
                <div className="rounded-2xl border-2 border-gray-200 bg-white p-12 text-center">
                    <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
                    <div className="mt-4 text-base font-bold text-gray-700">
                        {currentAlgo.name}分析中...
                    </div>
                </div>
            )}

            {/* Error */}
            {error && !loading && (
                <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
                    <div className="font-bold text-red-900 mb-1">❌ エラー</div>
                    <div className="text-sm text-red-700">{error}</div>

                    {/* Debug payload */}
                    {data && (
                        <pre className="mt-3 max-h-[260px] overflow-auto rounded-xl border border-red-200 bg-white p-3 text-xs text-gray-800">
                            {prettyDebug}
                        </pre>
                    )}
                </div>
            )}

            {/* Results */}
            {data && !loading && (
                <div className="space-y-4">
                    {/* Summary */}
                    <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
                        <div className="text-sm font-black text-blue-900 mb-2">
                            📊 結果サマリー
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="text-blue-800">
                                <span className="font-bold">推薦数:</span> {recommendations.length}件
                            </div>
                            {data.total_ratings !== undefined && (
                                <div className="text-blue-800">
                                    <span className="font-bold">評価数:</span> {data.total_ratings}件
                                </div>
                            )}
                            {data.message && (
                                <div className="col-span-2 text-blue-800">
                                    <span className="font-bold">Message:</span> {String(data.message)}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Recommendations Grid */}
                    {recommendations.length > 0 && (
                        <div>
                            <div className="text-lg font-black text-gray-900 mb-3">
                                🎯 推薦結果
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {recommendations.slice(0, 8).map((rec: any, idx: number) => (
                                    <div
                                        key={rec.card_id || rec.id || idx}
                                        className="rounded-xl border-2 border-gray-200 bg-white p-4 shadow-sm hover:shadow-lg transition-all"
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500 text-sm font-black text-white">
                                                #{idx + 1}
                                            </div>
                                            <div className="flex-1 text-sm font-bold text-gray-800 truncate">
                                                {rec.card_id || rec.id || rec.tag || "Item"}
                                            </div>
                                        </div>

                                        {rec.score !== undefined && (
                                            <div className="text-xs text-gray-600 mb-2">
                                                スコア:{" "}
                                                <span className="font-bold">{String(rec.score)}</span>
                                            </div>
                                        )}

                                        {rec.similarity !== undefined && (
                                            <div className="text-xs text-gray-600 mb-2">
                                                類似度:{" "}
                                                <span className="font-bold">
                                                    {Math.round(Number(rec.similarity) * 100)}%
                                                </span>
                                            </div>
                                        )}

                                        {Array.isArray(rec.tags) && rec.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {rec.tags.slice(0, 3).map((tag: string, i: number) => (
                                                    <span
                                                        key={i}
                                                        className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700"
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
                    )}

                    {/* No Results */}
                    {recommendations.length === 0 && (
                        <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-12 text-center">
                            <div className="text-4xl mb-3 opacity-30">🤷</div>
                            <div className="text-lg font-bold text-gray-900 mb-2">
                                推薦結果がありません
                            </div>
                            <div className="text-sm text-gray-600">
                                {data.message || "カードを評価してください"}
                            </div>
                        </div>
                    )}

                    {/* Debug (always available when data exists) */}
                    <details className="rounded-xl border border-slate-200 bg-white p-3">
                        <summary className="cursor-pointer text-sm font-bold text-slate-700">
                            🔎 デバッグJSONを表示
                        </summary>
                        <pre className="mt-3 max-h-[420px] overflow-auto rounded-2xl border-2 border-slate-200 bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
                            {safeStringify(data, 2)}
                        </pre>
                    </details>

                    {/* Reload */}
                    <button
                        onClick={loadRecommendations}
                        className="w-full rounded-xl border-2 border-gray-300 bg-white px-6 py-3 text-sm font-bold text-gray-700 transition-all hover:bg-gray-50 hover:shadow-md"
                    >
                        🔄 再実行
                    </button>
                </div>
            )}
        </div>
    );
}
