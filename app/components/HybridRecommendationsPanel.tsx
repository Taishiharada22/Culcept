// app/components/HybridRecommendationsPanel.tsx
"use client";

import React from "react";

type HybridRecommendation = {
    card_id: string;
    rank: number;
    total_score: number;
    scores: Record<string, number>;
    algorithm_count: number;
    algorithms_used: string[];
    image_url?: string;
    tags?: string[];
};

type Stats = {
    algorithms_status: Array<{
        algorithm: string;
        status: string; // "success" | "error" etc.
        count: number;
        weight: number; // 0-1
    }>;
    total_candidates: number;
    top_algorithms: Record<string, number>;
};

type HybridApiResponse = {
    ok: boolean;
    recommendations: HybridRecommendation[];
    stats: Stats;
    weights?: Record<string, number>;
    error?: string;
    message?: string;
};

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

/**
 * text → json 変換 + 非JSON保険 + 非2xxでthrow の堅牢fetch
 */
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

export default function HybridRecommendationsPanel() {
    const [loading, setLoading] = React.useState(false);
    const [data, setData] = React.useState<HybridApiResponse | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    const endpoint = "/api/recommendations/hybrid?limit=20";

    const algorithmEmojis: Record<string, string> = {
        collaborative: "👥",
        vector: "🎯",
        bandit: "🎰",
        timeslot: "⏰",
        graph: "🕸️",
    };

    const algorithmNames: Record<string, string> = {
        collaborative: "協調",
        vector: "ベクトル",
        bandit: "バンディット",
        timeslot: "時間帯",
        graph: "グラフ",
    };

    const loadHybridRecommendations = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        setData(null);

        try {
            const json = (await callApi(endpoint)) as HybridApiResponse;

            if (json?.ok) {
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
    }, [endpoint]);

    const recommendations = data?.recommendations ?? [];

    const debugJson = React.useMemo(() => {
        if (!data && !error) return "";
        try {
            return safeStringify(data ?? { ok: false, error }, 2);
        } catch {
            return "[unprintable]";
        }
    }, [data, error]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 via-white to-teal-50 p-6 shadow-lg">
                <div className="flex items-center gap-4">
                    <div className="text-5xl">🤖</div>
                    <div className="flex-1">
                        <h3 className="text-2xl font-black text-gray-900 mb-1">
                            ハイブリッドレコメンダー
                        </h3>
                        <p className="text-sm text-gray-600">
                            5つのアルゴリズムを統合して最高精度の推薦を実現
                        </p>
                        <div className="mt-2 text-xs font-mono text-gray-500">{endpoint}</div>
                    </div>
                </div>
            </div>

            {/* Execute Button */}
            {!data && !loading && !error && (
                <button
                    onClick={loadHybridRecommendations}
                    className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-teal-600 px-6 py-4 text-lg font-black text-white shadow-lg transition-all hover:shadow-2xl hover:scale-105"
                >
                    🚀 ハイブリッド推薦を実行
                </button>
            )}

            {/* Loading */}
            {loading && (
                <div className="rounded-2xl border-2 border-gray-200 bg-white p-16 text-center">
                    <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
                    <div className="mt-4 text-base font-bold text-gray-700">
                        5つのアルゴリズムを統合中...
                    </div>
                </div>
            )}

            {/* Error */}
            {error && !loading && (
                <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
                    <div className="font-bold text-red-900 mb-1">❌ エラー</div>
                    <div className="text-sm text-red-700">{error}</div>

                    {(data as any) && (
                        <details className="mt-3 rounded-xl border border-red-200 bg-white p-3">
                            <summary className="cursor-pointer text-sm font-bold text-gray-700">
                                🔎 デバッグJSONを表示
                            </summary>
                            <pre className="mt-3 max-h-[320px] overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
                                {debugJson}
                            </pre>
                        </details>
                    )}
                </div>
            )}

            {/* Results */}
            {data && !loading && (
                <div className="space-y-6">
                    {/* Algorithm Status */}
                    {data.stats && Array.isArray(data.stats.algorithms_status) && (
                        <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
                            <div className="text-sm font-black text-blue-900 mb-3">
                                📊 アルゴリズム統合状況
                            </div>

                            <div className="grid grid-cols-5 gap-2 mb-4">
                                {data.stats.algorithms_status.map((algo) => (
                                    <div
                                        key={algo.algorithm}
                                        className={cx(
                                            "rounded-lg border-2 p-3 text-center transition-all",
                                            algo.status === "success"
                                                ? "border-green-300 bg-green-50"
                                                : "border-red-300 bg-red-50"
                                        )}
                                    >
                                        <div className="text-2xl mb-1">
                                            {algorithmEmojis[algo.algorithm] || "🔮"}
                                        </div>
                                        <div className="text-xs font-bold text-gray-700">
                                            {algorithmNames[algo.algorithm] || algo.algorithm}
                                        </div>
                                        <div className="text-xs text-gray-600 mt-1">
                                            {algo.count}件 / {Math.round(algo.weight * 100)}%
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                    <span className="text-blue-700">候補カード:</span>
                                    <span className="ml-2 font-black">{data.stats.total_candidates}</span>
                                </div>
                                <div>
                                    <span className="text-blue-700">推薦数:</span>
                                    <span className="ml-2 font-black">{recommendations.length}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Recommendations */}
                    {recommendations.length > 0 ? (
                        <div>
                            <div className="text-xl font-black text-gray-900 mb-4">
                                🏆 推薦結果（Top {recommendations.length}）
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {recommendations.slice(0, 10).map((rec) => (
                                    <div
                                        key={rec.card_id}
                                        className="rounded-xl border-2 border-gray-200 bg-white p-4 shadow-sm hover:shadow-lg transition-all"
                                    >
                                        {/* Rank & Score */}
                                        <div className="flex items-start gap-3 mb-3">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-teal-500 text-lg font-black text-white shadow-md">
                                                #{rec.rank}
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-sm font-mono text-gray-700 break-all mb-1">
                                                    {rec.card_id}
                                                </div>
                                                <div className="text-2xl font-black text-purple-600">
                                                    {Math.round(rec.total_score * 100)}点
                                                </div>
                                            </div>
                                        </div>

                                        {/* Image Preview */}
                                        {rec.image_url && (
                                            <div className="mb-3 rounded-lg overflow-hidden bg-gray-100">
                                                <img
                                                    src={rec.image_url}
                                                    alt={rec.card_id}
                                                    className="w-full h-48 object-cover"
                                                    onError={(e) => {
                                                        e.currentTarget.style.display = "none";
                                                    }}
                                                />
                                            </div>
                                        )}

                                        {/* Algorithm Breakdown */}
                                        <div className="mb-3">
                                            <div className="text-xs font-bold text-gray-700 mb-2">
                                                アルゴリズム内訳:
                                            </div>
                                            <div className="space-y-1">
                                                {Object.entries(rec.scores ?? {})
                                                    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                                                    .map(([algo, score]) => {
                                                        const s = Number(score ?? 0);
                                                        return (
                                                            <div key={algo} className="flex items-center gap-2">
                                                                <span className="text-sm">
                                                                    {algorithmEmojis[algo] || "🔮"}
                                                                </span>
                                                                <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-gradient-to-r from-purple-500 to-teal-500 transition-all"
                                                                        style={{
                                                                            width: `${Math.min(100, s * 200)}%`,
                                                                        }}
                                                                    />
                                                                </div>
                                                                <span className="text-xs font-bold text-gray-600 w-12 text-right">
                                                                    {Math.round(s * 100)}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>

                                        {/* Tags */}
                                        {Array.isArray(rec.tags) && rec.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {rec.tags.slice(0, 5).map((tag, idx) => (
                                                    <span
                                                        key={idx}
                                                        className="rounded-full bg-purple-100 border border-purple-300 px-2 py-0.5 text-xs font-bold text-purple-700"
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
                        <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-12 text-center">
                            <div className="text-4xl mb-3 opacity-30">🤷</div>
                            <div className="text-lg font-bold text-gray-900 mb-2">
                                推薦結果がありません
                            </div>
                            <div className="text-sm text-gray-600">カードを評価してください</div>
                        </div>
                    )}

                    {/* Debug (always available when data exists) */}
                    <details className="rounded-xl border border-slate-200 bg-white p-3">
                        <summary className="cursor-pointer text-sm font-bold text-slate-700">
                            🔎 デバッグJSONを表示
                        </summary>
                        <pre className="mt-3 max-h-[420px] overflow-auto rounded-2xl border-2 border-slate-200 bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
                            {debugJson}
                        </pre>
                    </details>

                    {/* Reload */}
                    <button
                        onClick={loadHybridRecommendations}
                        className="w-full rounded-xl border-2 border-gray-300 bg-white px-6 py-3 text-sm font-bold text-gray-700 transition-all hover:bg-gray-50 hover:shadow-md"
                    >
                        🔄 再計算
                    </button>
                </div>
            )}
        </div>
    );
}
