// app/style-profile/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface StyleProfile {
    userId: string;
    dominantStyles: { style: string; score: number }[];
    colorPreferences: { color: string; count: number }[];
    priceRange: { min: number; max: number; avg: number };
    brandAffinity: { brand: string; score: number }[];
    seasonalTrends: { season: string; styles: string[] }[];
    fashionAge: number;
    styleEvolution: { date: string; style: string }[];
    recommendations: { text: string; confidence: number }[];
}

interface SwipeHistory {
    total: number;
    likes: number;
    dislikes: number;
    likeRate: number;
}

const STYLE_ICONS: Record<string, string> = {
    casual: "👕",
    formal: "👔",
    street: "🧢",
    minimal: "⬜",
    vintage: "🎸",
    sporty: "🏃",
    smart: "👞",
    bohemian: "🌻",
    preppy: "🎓",
    gothic: "🖤",
};

const STYLE_COLORS: Record<string, string> = {
    casual: "from-blue-500 to-cyan-500",
    formal: "from-slate-600 to-slate-800",
    street: "from-orange-500 to-red-500",
    minimal: "from-gray-400 to-gray-600",
    vintage: "from-amber-600 to-yellow-600",
    sporty: "from-green-500 to-emerald-500",
    smart: "from-indigo-500 to-purple-500",
};

export default function StyleProfilePage() {
    const [profile, setProfile] = useState<StyleProfile | null>(null);
    const [history, setHistory] = useState<SwipeHistory | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"overview" | "evolution" | "insights">("overview");

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await fetch("/api/style-profile");
                const data = await res.json();
                setProfile(data.profile);
                setHistory(data.history);
            } catch (error) {
                console.error("Failed to fetch profile:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-purple-50 to-white">
                <div className="text-center">
                    <div className="animate-spin text-5xl mb-4">🎨</div>
                    <p className="text-slate-600">スタイルを分析中...</p>
                </div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-purple-50 to-white p-8">
                <div className="text-6xl mb-6">🎯</div>
                <h1 className="text-2xl font-bold mb-4">スタイルを学習中</h1>
                <p className="text-slate-600 text-center mb-8">
                    もっとスワイプすると、AIがあなたの<br />
                    好みをより正確に理解できます
                </p>
                <Link
                    href="/"
                    className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-2xl font-bold"
                >
                    スワイプを続ける
                </Link>
            </div>
        );
    }

    const topStyle = profile.dominantStyles[0];

    return (
        <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
            <div className="max-w-2xl mx-auto px-4 py-8">
                {/* ヘッダー */}
                <div className="flex items-center gap-4 mb-6">
                    <Link
                        href="/my"
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">AIスタイル分析</h1>
                        <p className="text-sm text-slate-600">あなたの好みを深層学習</p>
                    </div>
                </div>

                {/* メインスタイルカード */}
                <div className={`bg-gradient-to-r ${STYLE_COLORS[topStyle?.style] || "from-purple-500 to-pink-500"} rounded-3xl p-6 text-white mb-6 shadow-xl`}>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="text-5xl">{STYLE_ICONS[topStyle?.style] || "✨"}</div>
                        <div>
                            <div className="text-sm opacity-80">あなたのメインスタイル</div>
                            <div className="text-3xl font-bold capitalize">{topStyle?.style || "Unique"}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-white/30 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-white rounded-full"
                                style={{ width: `${topStyle?.score || 0}%` }}
                            />
                        </div>
                        <span className="text-sm font-bold">{topStyle?.score || 0}%</span>
                    </div>
                </div>

                {/* タブ */}
                <div className="flex gap-2 mb-6">
                    {(["overview", "evolution", "insights"] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                                activeTab === tab
                                    ? "bg-purple-600 text-white"
                                    : "bg-white text-slate-600"
                            }`}
                        >
                            {tab === "overview" ? "概要" : tab === "evolution" ? "進化" : "洞察"}
                        </button>
                    ))}
                </div>

                {/* 概要タブ */}
                {activeTab === "overview" && (
                    <div className="space-y-6">
                        {/* スタイル分布 */}
                        <div className="bg-white rounded-2xl shadow-sm border p-6">
                            <h3 className="font-bold text-lg mb-4">🎨 スタイル分布</h3>
                            <div className="space-y-3">
                                {profile.dominantStyles.map((style, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <span className="text-2xl w-10">{STYLE_ICONS[style.style] || "•"}</span>
                                        <div className="flex-1">
                                            <div className="flex justify-between mb-1">
                                                <span className="font-medium capitalize">{style.style}</span>
                                                <span className="text-slate-500">{style.score}%</span>
                                            </div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full bg-gradient-to-r ${STYLE_COLORS[style.style] || "from-purple-500 to-pink-500"} rounded-full`}
                                                    style={{ width: `${style.score}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* カラーパレット */}
                        <div className="bg-white rounded-2xl shadow-sm border p-6">
                            <h3 className="font-bold text-lg mb-4">🎨 好みのカラー</h3>
                            <div className="flex flex-wrap gap-3">
                                {profile.colorPreferences.map((color, i) => (
                                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl">
                                        <div
                                            className="w-6 h-6 rounded-full border-2 border-white shadow"
                                            style={{ backgroundColor: color.color }}
                                        />
                                        <span className="text-sm font-medium">{color.count}点</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 価格帯 */}
                        <div className="bg-white rounded-2xl shadow-sm border p-6">
                            <h3 className="font-bold text-lg mb-4">💰 好みの価格帯</h3>
                            <div className="flex items-center justify-between">
                                <div className="text-center">
                                    <div className="text-sm text-slate-500">最小</div>
                                    <div className="text-lg font-bold">¥{profile.priceRange.min.toLocaleString()}</div>
                                </div>
                                <div className="flex-1 mx-4 h-2 bg-gradient-to-r from-green-200 via-yellow-200 to-red-200 rounded-full relative">
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-purple-600 rounded-full border-2 border-white shadow"
                                        style={{
                                            left: `${Math.min(100, (profile.priceRange.avg / profile.priceRange.max) * 100)}%`,
                                        }}
                                    />
                                </div>
                                <div className="text-center">
                                    <div className="text-sm text-slate-500">最大</div>
                                    <div className="text-lg font-bold">¥{profile.priceRange.max.toLocaleString()}</div>
                                </div>
                            </div>
                            <div className="text-center mt-4">
                                <span className="text-slate-500">平均: </span>
                                <span className="font-bold text-purple-600">¥{profile.priceRange.avg.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* スワイプ統計 */}
                        {history && (
                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="font-bold text-lg mb-4">📊 スワイプ統計</h3>
                                <div className="grid grid-cols-4 gap-4 text-center">
                                    <div>
                                        <div className="text-2xl font-bold text-slate-800">{history.total}</div>
                                        <div className="text-xs text-slate-500">合計</div>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-green-600">{history.likes}</div>
                                        <div className="text-xs text-slate-500">いいね</div>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-red-500">{history.dislikes}</div>
                                        <div className="text-xs text-slate-500">スキップ</div>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold text-purple-600">{history.likeRate}%</div>
                                        <div className="text-xs text-slate-500">いいね率</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 進化タブ */}
                {activeTab === "evolution" && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl shadow-sm border p-6">
                            <h3 className="font-bold text-lg mb-4">📈 スタイルの進化</h3>
                            <div className="relative">
                                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />
                                <div className="space-y-6">
                                    {profile.styleEvolution.map((point, i) => (
                                        <div key={i} className="flex items-center gap-4 relative">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${
                                                i === 0 ? "bg-purple-600 text-white" : "bg-slate-200"
                                            }`}>
                                                {STYLE_ICONS[point.style] || "•"}
                                            </div>
                                            <div className="flex-1 bg-slate-50 rounded-xl p-3">
                                                <div className="font-medium capitalize">{point.style}</div>
                                                <div className="text-sm text-slate-500">{point.date}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6">
                            <h3 className="font-bold text-lg mb-2">🏆 ファッション年齢</h3>
                            <div className="text-5xl font-bold text-amber-600 mb-2">
                                {profile.fashionAge}歳
                            </div>
                            <p className="text-amber-800 text-sm">
                                好みの傾向から算出したスタイル年齢です
                            </p>
                        </div>
                    </div>
                )}

                {/* 洞察タブ */}
                {activeTab === "insights" && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl shadow-sm border p-6">
                            <h3 className="font-bold text-lg mb-4">💡 AIからの洞察</h3>
                            <div className="space-y-4">
                                {profile.recommendations.map((rec, i) => (
                                    <div key={i} className="flex items-start gap-3 p-4 bg-purple-50 rounded-xl">
                                        <div className="text-2xl">
                                            {rec.confidence > 0.8 ? "🎯" : rec.confidence > 0.6 ? "💭" : "🤔"}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-slate-800">{rec.text}</p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <div className="text-xs text-slate-500">確信度</div>
                                                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-purple-500 rounded-full"
                                                        style={{ width: `${rec.confidence * 100}%` }}
                                                    />
                                                </div>
                                                <div className="text-xs font-medium text-purple-600">
                                                    {Math.round(rec.confidence * 100)}%
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 季節傾向 */}
                        <div className="bg-white rounded-2xl shadow-sm border p-6">
                            <h3 className="font-bold text-lg mb-4">🌸 季節別の好み</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {profile.seasonalTrends.map((season, i) => (
                                    <div key={i} className="p-4 bg-slate-50 rounded-xl">
                                        <div className="font-medium mb-2">
                                            {season.season === "spring" ? "🌸 春" :
                                             season.season === "summer" ? "☀️ 夏" :
                                             season.season === "autumn" ? "🍂 秋" : "❄️ 冬"}
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {season.styles.map((s, j) => (
                                                <span key={j} className="px-2 py-1 bg-white rounded text-xs">
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
