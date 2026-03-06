// app/wardrobe/page.tsx
"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
    LightBackground,
    GlassNavbar,
    GlassCard,
    GlassButton,
    GlassBadge,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";

interface WardrobeItem {
    id: string;
    image: string;
    category: string;
    color: string;
    style: string[];
    addedAt: Date;
}

interface AnalysisResult {
    items: WardrobeItem[];
    missing: string[];
    suggestions: {
        card_id: string;
        image_url: string;
        reason: string;
        priority: "high" | "medium" | "low";
    }[];
    styleProfile: {
        dominant: string;
        colors: string[];
        score: number;
    };
}

const CATEGORIES = [
    { id: "tops", label: "トップス", icon: "👕" },
    { id: "bottoms", label: "ボトムス", icon: "👖" },
    { id: "outerwear", label: "アウター", icon: "🧥" },
    { id: "shoes", label: "シューズ", icon: "👟" },
    { id: "accessories", label: "アクセサリー", icon: "⌚" },
];

export default function WardrobePage() {
    const [items, setItems] = useState<WardrobeItem[]>([]);
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || !uploadingCategory) return;

        for (const file of Array.from(files)) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const imageData = event.target?.result as string;

                // 画像分析API呼び出し
                try {
                    const res = await fetch("/api/wardrobe/analyze-item", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            image: imageData,
                            category: uploadingCategory,
                        }),
                    });

                    const data = await res.json();

                    const newItem: WardrobeItem = {
                        id: Date.now().toString() + Math.random(),
                        image: imageData,
                        category: uploadingCategory,
                        color: data.color || "unknown",
                        style: data.style || [],
                        addedAt: new Date(),
                    };

                    setItems((prev) => [...prev, newItem]);
                } catch (error) {
                    // エラー時はデフォルト値で追加
                    const newItem: WardrobeItem = {
                        id: Date.now().toString() + Math.random(),
                        image: imageData,
                        category: uploadingCategory,
                        color: "unknown",
                        style: [],
                        addedAt: new Date(),
                    };
                    setItems((prev) => [...prev, newItem]);
                }
            };
            reader.readAsDataURL(file);
        }

        setUploadingCategory(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleAnalyze = async () => {
        if (items.length === 0) return;

        setAnalyzing(true);

        try {
            const res = await fetch("/api/wardrobe/diagnose", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items }),
            });

            const data = await res.json();
            setResult(data);
        } catch (error) {
            console.error("Analysis failed:", error);
        } finally {
            setAnalyzing(false);
        }
    };

    const removeItem = (id: string) => {
        setItems((prev) => prev.filter((item) => item.id !== id));
        setResult(null);
    };

    const getCategoryCount = (categoryId: string) => {
        return items.filter((item) => item.category === categoryId).length;
    };

    return (
        <LightBackground>
            <GlassNavbar>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 transition-all shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-gray-800">AIワードローブ診断</h1>
                            <p className="text-xs text-gray-400">手持ち服から不足アイテムを提案</p>
                        </div>
                    </div>
                    <GlassBadge variant="gradient" size="sm">WARDROBE</GlassBadge>
                </div>
            </GlassNavbar>

            <div className="h-24" />

            <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-32">
                <FadeInView>
                    <GlassCard className="mb-8 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-400/15 via-transparent to-purple-400/15" />
                        <div className="relative p-8 text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-4">
                                <span className="text-3xl">👔</span>
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">
                                AIワードローブ診断
                            </h2>
                            <p className="text-gray-500 mt-2">
                                手持ちの服を登録して、足りないアイテムをAIが提案
                            </p>
                        </div>
                    </GlassCard>
                </FadeInView>

                {/* 隠しファイル入力 */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*"
                    multiple
                    className="hidden"
                />

                {/* カテゴリ選択 */}
                <FadeInView delay={0.05}>
                    <GlassCard className="mb-6">
                        <h2 className="font-bold text-lg mb-4 text-gray-800">服を追加</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                            {CATEGORIES.map((cat) => (
                                <button
                                    key={cat.id}
                                    onClick={() => {
                                        setUploadingCategory(cat.id);
                                        fileInputRef.current?.click();
                                    }}
                                    className="flex flex-col items-center p-4 rounded-2xl border border-white/80 bg-white/70 hover:bg-white transition-all shadow-sm"
                                >
                                    <span className="text-3xl mb-2">{cat.icon}</span>
                                    <span className="text-sm font-medium text-gray-700">{cat.label}</span>
                                    <span className="text-xs text-gray-400 mt-1">
                                        {getCategoryCount(cat.id)}点
                                    </span>
                                </button>
                            ))}
                        </div>
                    </GlassCard>
                </FadeInView>

                {/* 登録済みアイテム */}
                {items.length > 0 && (
                    <FadeInView delay={0.1}>
                        <GlassCard className="mb-6">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                                <h2 className="font-bold text-lg text-gray-800">
                                    登録済み ({items.length}点)
                                </h2>
                                <div className="flex flex-wrap gap-2">
                                    {CATEGORIES.map((cat) => (
                                        <GlassButton
                                            key={cat.id}
                                            size="xs"
                                            variant={selectedCategory === cat.id ? "gradient" : "secondary"}
                                            onClick={() =>
                                                setSelectedCategory(
                                                    selectedCategory === cat.id ? null : cat.id
                                                )
                                            }
                                        >
                                            {cat.icon} {getCategoryCount(cat.id)}
                                        </GlassButton>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                                {items
                                    .filter(
                                        (item) =>
                                            !selectedCategory || item.category === selectedCategory
                                    )
                                    .map((item) => (
                                        <div key={item.id} className="relative group">
                                            <img
                                                src={item.image}
                                                alt={item.category}
                                                className="w-full aspect-square object-cover rounded-xl border border-white/70"
                                            />
                                            <button
                                                onClick={() => removeItem(item.id)}
                                                className="absolute top-1 right-1 w-6 h-6 bg-rose-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                            >
                                                ✕
                                            </button>
                                            <div className="absolute bottom-1 left-1 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full">
                                                {item.color}
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </GlassCard>
                    </FadeInView>
                )}

                {/* 診断ボタン */}
                <div className="flex justify-center">
                    <GlassButton
                        onClick={handleAnalyze}
                        disabled={items.length < 3 || analyzing}
                        loading={analyzing}
                        variant="gradient"
                        size="lg"
                        fullWidth
                    >
                        {items.length < 3 ? "3点以上登録してください" : "🔮 ワードローブを診断する"}
                    </GlassButton>
                </div>

                {/* 診断結果 */}
                {result && (
                    <div className="mt-8 space-y-6">
                        {/* スタイルプロファイル */}
                        <GlassCard className="overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20" />
                            <div className="relative p-6">
                                <h3 className="font-bold text-lg mb-4 text-gray-800">📊 あなたのスタイルプロファイル</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                                    <div className="bg-white/70 rounded-2xl p-4 border border-white/80">
                                        <div className="text-3xl font-bold text-indigo-600">{result.styleProfile.score}</div>
                                        <div className="text-sm text-gray-500">スタイルスコア</div>
                                    </div>
                                    <div className="bg-white/70 rounded-2xl p-4 border border-white/80">
                                        <div className="text-2xl font-bold text-gray-700">{result.styleProfile.dominant}</div>
                                        <div className="text-sm text-gray-500">メインスタイル</div>
                                    </div>
                                    <div className="bg-white/70 rounded-2xl p-4 border border-white/80">
                                        <div className="flex justify-center gap-1">
                                            {result.styleProfile.colors.map((color, i) => (
                                                <div
                                                    key={i}
                                                    className="w-6 h-6 rounded-full border-2 border-white"
                                                    style={{ backgroundColor: color }}
                                                />
                                            ))}
                                        </div>
                                        <div className="text-sm text-gray-500 mt-1">カラーパレット</div>
                                    </div>
                                </div>
                            </div>
                        </GlassCard>

                        {/* 足りないアイテム */}
                        {result.missing.length > 0 && (
                            <GlassCard className="border border-amber-200/60 bg-amber-50/70">
                                <h3 className="font-bold text-lg text-amber-800 mb-3">
                                    ⚠️ 足りないカテゴリ
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {result.missing.map((item, i) => (
                                        <span
                                            key={i}
                                            className="px-4 py-2 bg-amber-100 text-amber-800 rounded-full text-sm font-medium"
                                        >
                                            {item}
                                        </span>
                                    ))}
                                </div>
                            </GlassCard>
                        )}

                        {/* おすすめアイテム */}
                        {result.suggestions.length > 0 && (
                            <GlassCard className="p-6">
                                <h3 className="font-bold text-lg mb-4 text-gray-800">✨ おすすめアイテム</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    {result.suggestions.map((suggestion, i) => (
                                        <Link
                                            key={i}
                                            href={`/drops/${suggestion.card_id}`}
                                            className="group"
                                        >
                                            <div className="relative rounded-xl overflow-hidden border border-white/70 bg-white/70">
                                                <img
                                                    src={suggestion.image_url}
                                                    alt="Suggestion"
                                                    className="w-full aspect-square object-cover group-hover:scale-105 transition-transform"
                                                />
                                                <div
                                                    className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-bold ${
                                                        suggestion.priority === "high"
                                                            ? "bg-red-500 text-white"
                                                            : suggestion.priority === "medium"
                                                            ? "bg-amber-500 text-white"
                                                            : "bg-slate-500 text-white"
                                                    }`}
                                                >
                                                    {suggestion.priority === "high"
                                                        ? "必須"
                                                        : suggestion.priority === "medium"
                                                        ? "推奨"
                                                        : "あると◎"}
                                                </div>
                                            </div>
                                            <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                                                {suggestion.reason}
                                            </p>
                                        </Link>
                                    ))}
                                </div>
                            </GlassCard>
                        )}
                    </div>
                )}

                {/* ヒント */}
                {items.length === 0 && (
                    <GlassCard className="mt-8">
                        <h3 className="font-bold text-lg mb-3 text-gray-800">💡 使い方</h3>
                        <ol className="space-y-2 text-gray-600">
                            <li className="flex gap-2">
                                <span className="font-bold text-indigo-600">1.</span>
                                カテゴリを選んで服の写真を撮影・アップロード
                            </li>
                            <li className="flex gap-2">
                                <span className="font-bold text-indigo-600">2.</span>
                                3点以上登録したら「診断する」ボタンをタップ
                            </li>
                            <li className="flex gap-2">
                                <span className="font-bold text-indigo-600">3.</span>
                                AIがあなたの手持ち服を分析し、足りないアイテムを提案
                            </li>
                        </ol>
                    </GlassCard>
                )}
            </main>

            <FloatingNavLight
                items={[
                    { href: "/", label: "ホーム", icon: "🏠" },
                    { href: "/wardrobe", label: "ワードローブ", icon: "👔" },
                    { href: "/sns/profile", label: "Presence", icon: "🪞" },
                    { href: "/battle", label: "バトル", icon: "⚔️" },
                    { href: "/my", label: "マイページ", icon: "👤" },
                ]}
                activeHref="/wardrobe"
            />
            <div className="h-24" />
        </LightBackground>
    );
}
