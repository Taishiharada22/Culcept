// app/style-profile/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    LightBackground,
    GlassNavbar,
    GlassCard,
    GlassButton,
    GlassTabs,
} from "@/components/ui/glassmorphism-design";
import AneurasyncStyleHub from "./_components/AneurasyncStyleHub";

interface StyleProfile {
    userId: string;
    dominantStyles: { style: string; score: number }[];
    colorPreferences: { color: string; name: string; count: number }[];
    priceRange: { min: number; max: number; avg: number };
    brandAffinity: { brand: string; score: number }[];
    seasonalTrends: { season: string; styles: string[] }[];
    fashionAge: number;
    styleEvolution: { date: string; style: string }[];
    recommendations: { text: string; confidence: number; type?: string }[];
    personalColor?: {
        season: string;
        description: string;
        recommendedColors: string[];
        confidence?: number;
    };
    bodyType?: {
        type: string;
        silhouette: string;
        advice: string;
        name?: string;
        description?: string;
        strengths?: string[];
        recommendedItems?: string[];
        avoidItems?: string[];
        materials?: string[];
        confidence?: number;
    };
    wardrobeAnalysis?: {
        distribution: { category: string; count: number; percentage: number }[];
        gaps: string[];
        totalItems: number;
    };
    deepInsights?: { title: string; text: string; confidence: number; evidence?: string }[];
    diagnosisScore?: number;
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
    romantic: "💕",
    edgy: "🔥",
};

const STYLE_COLORS: Record<string, string> = {
    casual: "from-blue-500 to-cyan-500",
    formal: "from-slate-600 to-slate-800",
    street: "from-orange-500 to-red-500",
    minimal: "from-gray-400 to-gray-600",
    vintage: "from-amber-600 to-yellow-600",
    sporty: "from-green-500 to-emerald-500",
    smart: "from-indigo-500 to-purple-500",
    romantic: "from-pink-400 to-rose-500",
    edgy: "from-gray-800 to-black",
};

const PERSONAL_COLOR_ICONS: Record<string, string> = {
    spring: "🌸",
    summer: "🌊",
    autumn: "🍂",
    winter: "❄️",
};

const PERSONAL_COLOR_COLORS: Record<string, string> = {
    spring: "from-yellow-400 to-orange-400",
    summer: "from-blue-300 to-purple-300",
    autumn: "from-orange-500 to-amber-600",
    winter: "from-blue-600 to-indigo-700",
};

const BODY_TYPE_ICONS: Record<string, string> = {
    straight: "📐",
    wave: "🌊",
    natural: "🌿",
};

const BODY_TYPE_GUIDE: Record<string, { name: string; summary: string; items: string[] }> = {
    straight: {
        name: "ストレート",
        summary: "Iライン・上質素材が映える",
        items: ["テーラード", "Vネック", "センタープレス"],
    },
    wave: {
        name: "ウェーブ",
        summary: "軽い素材・曲線が得意",
        items: ["ブラウス", "フレア", "ショート丈"],
    },
    natural: {
        name: "ナチュラル",
        summary: "ラフな素材・ゆったりが似合う",
        items: ["オーバーシャツ", "ワイドパンツ", "ざっくりニット"],
    },
};

const CATEGORY_ICONS: Record<string, string> = {
    tops: "👕",
    bottoms: "👖",
    outerwear: "🧥",
    shoes: "👟",
    accessories: "👜",
};

const STYLE_PROFILE_TABS = ["overview", "analysis", "evolution", "insights"] as const;

type StyleProfileTab = typeof STYLE_PROFILE_TABS[number];

export default function StyleProfilePage() {
    const searchParams = useSearchParams();
    const [profile, setProfile] = useState<StyleProfile | null>(null);
    const [history, setHistory] = useState<SwipeHistory | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<StyleProfileTab>("overview");
    const isAneurasyncHub = searchParams.get("source") === "aneurasync" && searchParams.get("mode") === "sync";

    useEffect(() => {
        const requestedTab = searchParams.get("tab");
        if (requestedTab && STYLE_PROFILE_TABS.includes(requestedTab as StyleProfileTab)) {
            setActiveTab(requestedTab as StyleProfileTab);
        }
    }, [searchParams]);

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
            <LightBackground>
                <div className="min-h-screen flex items-center justify-center px-4">
                    <GlassCard className="p-10 text-center">
                        <div className="animate-spin text-5xl mb-4">🎨</div>
                        <p className="text-slate-600">スタイルを分析中...</p>
                    </GlassCard>
                </div>
            </LightBackground>
        );
    }

    if (!profile) {
        return (
            <LightBackground>
                <div className="min-h-screen px-4 py-12">
                    <div className="max-w-3xl mx-auto">
                        <AneurasyncStyleHub active={isAneurasyncHub} />
                        <GlassCard className="max-w-md w-full mx-auto text-center p-10">
                            <div className="text-6xl mb-6">🎯</div>
                            <h1 className="text-2xl font-bold mb-4 text-slate-900">スタイルを学習中</h1>
                            <p className="text-slate-600 text-center mb-8">
                                もっとスワイプすると、AIがあなたの
                                <br />
                                好みをより正確に理解できます
                            </p>
                            <GlassButton href="/" variant="gradient" size="lg" className="w-full justify-center">
                                スワイプを続ける
                            </GlassButton>
                        </GlassCard>
                    </div>
                </div>
            </LightBackground>
        );
    }

    const topStyle = profile.dominantStyles[0];

    return (
        <LightBackground>
            <GlassNavbar>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/my-page"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-slate-500 hover:bg-white/80 hover:text-slate-800 transition-all duration-300 shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-slate-900">AIスタイル分析</h1>
                            <p className="text-xs text-slate-400">あなたの好みを深層学習</p>
                        </div>
                    </div>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <main className="max-w-3xl mx-auto px-4 py-8 pb-24">
                <AneurasyncStyleHub
                    active={isAneurasyncHub}
                    defaultBodyType={profile.bodyType?.name || profile.bodyType?.silhouette || profile.bodyType?.type}
                    defaultSeason={profile.personalColor?.season ?? null}
                    defaultDiagnosisScore={profile.diagnosisScore}
                    defaultDiagnosisInsight={profile.bodyType?.description || profile.bodyType?.advice || profile.personalColor?.description}
                />

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
                <div className="mb-6">
                    <GlassTabs
                        tabs={[
                            { id: "overview", label: "概要" },
                            { id: "analysis", label: "診断" },
                            { id: "evolution", label: "進化" },
                            { id: "insights", label: "洞察" },
                        ]}
                        activeTab={activeTab}
                        onChange={(id) => setActiveTab(id as typeof activeTab)}
                    />
                </div>

                {/* 概要タブ */}
                {activeTab === "overview" && (
                    <div className="space-y-6">
                        {/* スタイル分布 */}
                        <div className="rounded-2xl bg-white/70 backdrop-blur-lg border border-white/60 shadow-lg p-6">
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
                        <div className="rounded-2xl bg-white/70 backdrop-blur-lg border border-white/60 shadow-lg p-6">
                            <h3 className="font-bold text-lg mb-4">🎨 好みのカラー</h3>
                            <div className="flex flex-wrap gap-3">
                                {profile.colorPreferences.map((color, i) => (
                                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl">
                                        <div
                                            className="w-6 h-6 rounded-full border-2 border-white shadow"
                                            style={{ backgroundColor: color.color }}
                                        />
                                        <span className="text-sm font-medium capitalize">{color.name}</span>
                                        <span className="text-xs text-slate-500">({color.count})</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 価格帯 */}
                        <div className="rounded-2xl bg-white/70 backdrop-blur-lg border border-white/60 shadow-lg p-6">
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
                            <div className="rounded-2xl bg-white/70 backdrop-blur-lg border border-white/60 shadow-lg p-6">
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

                {/* 診断タブ（新規追加） */}
                {activeTab === "analysis" && (
                    <div className="space-y-6">
                        {/* パーソナルカラー診断 */}
                        {profile.personalColor && (
                            <div className={`bg-gradient-to-r ${PERSONAL_COLOR_COLORS[profile.personalColor.season] || "from-purple-500 to-pink-500"} rounded-2xl p-6 text-white shadow-xl`}>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="text-4xl">{PERSONAL_COLOR_ICONS[profile.personalColor.season] || "🎨"}</div>
                                    <div>
                                        <div className="text-sm opacity-80">パーソナルカラー診断</div>
                                        <div className="text-2xl font-bold capitalize">{profile.personalColor.season}</div>
                                    </div>
                                </div>
                                <p className="text-sm opacity-90 mb-4">{profile.personalColor.description}</p>
                                {typeof profile.personalColor.confidence === "number" && (
                                    <div className="mb-4">
                                        <div className="text-xs opacity-90 mb-1">診断の確度</div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 h-2 bg-white/30 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-white rounded-full"
                                                    style={{ width: `${profile.personalColor.confidence}%` }}
                                                />
                                            </div>
                                            <span className="text-sm font-bold">{profile.personalColor.confidence}%</span>
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <div className="text-sm font-medium mb-2">おすすめカラー:</div>
                                    <div className="flex flex-wrap gap-2">
                                        {profile.personalColor.recommendedColors.map((color, i) => (
                                            <span key={i} className="px-3 py-1 bg-white/20 rounded-full text-sm">
                                                {color}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 骨格タイプ診断 */}
                        {profile.bodyType && (
                            <div className="rounded-2xl bg-white/70 backdrop-blur-lg border border-white/60 shadow-lg p-6">
                                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="text-4xl">{BODY_TYPE_ICONS[profile.bodyType.type] || "👤"}</div>
                                        <div>
                                            <h3 className="font-bold text-lg">骨格タイプ診断</h3>
                                            <p className="text-sm text-purple-600 font-medium">
                                                {profile.bodyType.name || profile.bodyType.silhouette}
                                            </p>
                                        </div>
                                    </div>
                                    {typeof profile.bodyType.confidence === "number" && (
                                        <div className="min-w-[160px]">
                                            <div className="text-xs text-slate-500 mb-1">診断の確度</div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-purple-500 rounded-full"
                                                        style={{ width: `${profile.bodyType.confidence}%` }}
                                                    />
                                                </div>
                                                <div className="text-xs font-semibold text-purple-600">
                                                    {profile.bodyType.confidence}%
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="bg-purple-50 rounded-xl p-4">
                                    <p className="text-sm text-slate-700">
                                        {profile.bodyType.description || profile.bodyType.advice}
                                    </p>
                                </div>
                                <div className="grid md:grid-cols-3 gap-4 mt-5">
                                    <div className="rounded-xl bg-white/70 border border-white/60 p-4">
                                        <h4 className="font-semibold mb-2">得意ポイント</h4>
                                        <div className="flex flex-wrap gap-2 text-xs">
                                            {(profile.bodyType.strengths || []).map((item, i) => (
                                                <span key={i} className="px-2 py-1 bg-slate-50 rounded-full">
                                                    {item}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="rounded-xl bg-white/70 border border-white/60 p-4">
                                        <h4 className="font-semibold mb-2">似合う服</h4>
                                        <div className="flex flex-wrap gap-2 text-xs">
                                            {(profile.bodyType.recommendedItems || []).map((item, i) => (
                                                <span key={i} className="px-2 py-1 bg-emerald-50 rounded-full">
                                                    {item}
                                                </span>
                                            ))}
                                        </div>
                                        {(profile.bodyType.materials || []).length > 0 && (
                                            <div className="mt-2 text-xs text-slate-500">
                                                素材: {(profile.bodyType.materials || []).join("・")}
                                            </div>
                                        )}
                                    </div>
                                    <div className="rounded-xl bg-white/70 border border-white/60 p-4">
                                        <h4 className="font-semibold mb-2">避けたい傾向</h4>
                                        <div className="flex flex-wrap gap-2 text-xs">
                                            {(profile.bodyType.avoidItems || []).map((item, i) => (
                                                <span key={i} className="px-2 py-1 bg-rose-50 rounded-full">
                                                    {item}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 骨格タイプ一覧 */}
                        <div className="rounded-2xl bg-white/70 backdrop-blur-lg border border-white/60 shadow-lg p-6">
                            <h3 className="font-bold text-lg mb-4">📚 骨格タイプ一覧</h3>
                            <div className="grid md:grid-cols-3 gap-4">
                                {Object.entries(BODY_TYPE_GUIDE).map(([key, info]) => (
                                    <div key={key} className="rounded-xl bg-white/70 border border-white/60 p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-2xl">{BODY_TYPE_ICONS[key] || "👤"}</span>
                                            <div className="font-semibold">{info.name}</div>
                                        </div>
                                        <div className="text-xs text-slate-500 mb-2">{info.summary}</div>
                                        <div className="flex flex-wrap gap-2 text-xs">
                                            {info.items.map((item, i) => (
                                                <span key={i} className="px-2 py-1 bg-slate-50 rounded-full">
                                                    {item}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 総合評価 */}
                        {typeof profile.diagnosisScore === "number" && (
                            <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 shadow-lg">
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div>
                                        <div className="text-sm opacity-90">骨格 × パーソナルカラー 総合評価</div>
                                        <div className="text-3xl font-bold">{profile.diagnosisScore} / 100</div>
                                    </div>
                                    <div className="text-sm opacity-90">
                                        骨格とカラーの両面からバランスを算出しています。
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ワードローブ分析 */}
                        {profile.wardrobeAnalysis && (
                            <div className="rounded-2xl bg-white/70 backdrop-blur-lg border border-white/60 shadow-lg p-6">
                                <h3 className="font-bold text-lg mb-4">👗 ワードローブ分析</h3>
                                <p className="text-sm text-slate-500 mb-4">いいねした {profile.wardrobeAnalysis.totalItems} アイテムを分析</p>

                                <div className="space-y-3 mb-6">
                                    {profile.wardrobeAnalysis.distribution.map((item, i) => (
                                        <div key={i} className="flex items-center gap-3">
                                            <span className="text-xl w-8">{CATEGORY_ICONS[item.category] || "📦"}</span>
                                            <div className="flex-1">
                                                <div className="flex justify-between mb-1">
                                                    <span className="text-sm font-medium capitalize">{item.category}</span>
                                                    <span className="text-xs text-slate-500">{item.percentage}% ({item.count}点)</span>
                                                </div>
                                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                                                        style={{ width: `${item.percentage}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {profile.wardrobeAnalysis.gaps.length > 0 && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span>💡</span>
                                            <span className="font-medium text-amber-800">バランス改善のヒント</span>
                                        </div>
                                        <p className="text-sm text-amber-700">
                                            {profile.wardrobeAnalysis.gaps.join("・")}が少なめです。バランスよく揃えると着回しの幅が広がります。
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ファッション年齢 */}
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

                {/* 進化タブ */}
                {activeTab === "evolution" && (
                    <div className="space-y-6">
                        <div className="rounded-2xl bg-white/70 backdrop-blur-lg border border-white/60 shadow-lg p-6">
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

                        {/* 季節傾向 */}
                        <div className="rounded-2xl bg-white/70 backdrop-blur-lg border border-white/60 shadow-lg p-6">
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
                                                <span key={j} className="px-2 py-1 bg-white rounded text-xs capitalize">
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

                {/* 洞察タブ */}
                {activeTab === "insights" && (
                    <div className="space-y-6">
                        {profile.deepInsights && profile.deepInsights.length > 0 && (
                            <div className="rounded-2xl bg-white/70 backdrop-blur-lg border border-white/60 shadow-lg p-6">
                                <h3 className="font-bold text-lg mb-4">🧭 ディープ観察（仮説）</h3>
                                <p className="text-xs text-slate-500 mb-4">
                                    スワイプ履歴・タグ傾向から推定した“あなたが気づいていない好み”です。
                                </p>
                                <div className="space-y-3">
                                    {profile.deepInsights.map((insight, i) => (
                                        <div key={i} className="p-4 rounded-xl bg-slate-50">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="font-semibold text-slate-900">{insight.title}</div>
                                                <div className="text-xs text-purple-600 font-semibold">
                                                    {Math.round(insight.confidence * 100)}%
                                                </div>
                                            </div>
                                            <p className="text-sm text-slate-700 mt-2">{insight.text}</p>
                                            {insight.evidence && (
                                                <div className="text-xs text-slate-500 mt-2">
                                                    根拠: {insight.evidence}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="rounded-2xl bg-white/70 backdrop-blur-lg border border-white/60 shadow-lg p-6">
                            <h3 className="font-bold text-lg mb-4">💡 AIからの洞察</h3>
                            <div className="space-y-4">
                                {profile.recommendations.map((rec, i) => (
                                    <div key={i} className="flex items-start gap-3 p-4 bg-purple-50 rounded-xl">
                                        <div className="text-2xl">
                                            {rec.type === "personal_color" ? "🎨" :
                                             rec.type === "body_type" ? "👤" :
                                             rec.type === "wardrobe_balance" ? "👗" :
                                             rec.type === "color_advice" ? "🌈" :
                                             rec.type === "style_upgrade" ? "⬆️" :
                                             rec.type === "style_refinement" ? "✨" :
                                             rec.type === "quality_focus" ? "💎" :
                                             rec.confidence > 0.8 ? "🎯" : rec.confidence > 0.6 ? "💭" : "🤔"}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-slate-800 text-sm">{rec.text}</p>
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
                    </div>
                )}
            </main>
        </LightBackground>
    );
}
