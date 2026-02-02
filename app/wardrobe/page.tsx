// app/wardrobe/page.tsx
"use client";

import { useState, useRef } from "react";
import Link from "next/link";

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
        <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
            <div className="max-w-4xl mx-auto px-4 py-8">
                {/* ヘッダー */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-4">
                        <span className="text-3xl">👔</span>
                    </div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                        AIワードローブ診断
                    </h1>
                    <p className="text-slate-600 mt-2">
                        手持ちの服を登録して、足りないアイテムをAIが提案
                    </p>
                </div>

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
                <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
                    <h2 className="font-bold text-lg mb-4">服を追加</h2>
                    <div className="grid grid-cols-5 gap-3">
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => {
                                    setUploadingCategory(cat.id);
                                    fileInputRef.current?.click();
                                }}
                                className="flex flex-col items-center p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all"
                            >
                                <span className="text-3xl mb-2">{cat.icon}</span>
                                <span className="text-sm font-medium">{cat.label}</span>
                                <span className="text-xs text-slate-500 mt-1">
                                    {getCategoryCount(cat.id)}点
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 登録済みアイテム */}
                {items.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-bold text-lg">
                                登録済み ({items.length}点)
                            </h2>
                            <div className="flex gap-2">
                                {CATEGORIES.map((cat) => (
                                    <button
                                        key={cat.id}
                                        onClick={() =>
                                            setSelectedCategory(
                                                selectedCategory === cat.id ? null : cat.id
                                            )
                                        }
                                        className={`px-3 py-1 rounded-full text-sm transition-colors ${
                                            selectedCategory === cat.id
                                                ? "bg-indigo-600 text-white"
                                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                        }`}
                                    >
                                        {cat.icon} {getCategoryCount(cat.id)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
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
                                            className="w-full aspect-square object-cover rounded-xl"
                                        />
                                        <button
                                            onClick={() => removeItem(item.id)}
                                            className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                        >
                                            ✕
                                        </button>
                                        <div className="absolute bottom-1 left-1 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full">
                                            {item.color}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

                {/* 診断ボタン */}
                <button
                    onClick={handleAnalyze}
                    disabled={items.length < 3 || analyzing}
                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-bold text-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                >
                    {analyzing ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="animate-spin">🔄</span>
                            AIが診断中...
                        </span>
                    ) : items.length < 3 ? (
                        "3点以上登録してください"
                    ) : (
                        "🔮 ワードローブを診断する"
                    )}
                </button>

                {/* 診断結果 */}
                {result && (
                    <div className="mt-8 space-y-6">
                        {/* スタイルプロファイル */}
                        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white">
                            <h3 className="font-bold text-lg mb-4">📊 あなたのスタイルプロファイル</h3>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="text-center">
                                    <div className="text-3xl font-bold">{result.styleProfile.score}</div>
                                    <div className="text-sm opacity-80">スタイルスコア</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold">{result.styleProfile.dominant}</div>
                                    <div className="text-sm opacity-80">メインスタイル</div>
                                </div>
                                <div className="text-center">
                                    <div className="flex justify-center gap-1">
                                        {result.styleProfile.colors.map((color, i) => (
                                            <div
                                                key={i}
                                                className="w-6 h-6 rounded-full border-2 border-white"
                                                style={{ backgroundColor: color }}
                                            />
                                        ))}
                                    </div>
                                    <div className="text-sm opacity-80 mt-1">カラーパレット</div>
                                </div>
                            </div>
                        </div>

                        {/* 足りないアイテム */}
                        {result.missing.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
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
                            </div>
                        )}

                        {/* おすすめアイテム */}
                        {result.suggestions.length > 0 && (
                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="font-bold text-lg mb-4">✨ おすすめアイテム</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    {result.suggestions.map((suggestion, i) => (
                                        <Link
                                            key={i}
                                            href={`/drops/${suggestion.card_id}`}
                                            className="group"
                                        >
                                            <div className="relative">
                                                <img
                                                    src={suggestion.image_url}
                                                    alt="Suggestion"
                                                    className="w-full aspect-square object-cover rounded-xl group-hover:scale-105 transition-transform"
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
                                            <p className="mt-2 text-sm text-slate-600 line-clamp-2">
                                                {suggestion.reason}
                                            </p>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ヒント */}
                {items.length === 0 && (
                    <div className="mt-8 bg-slate-50 rounded-2xl p-6">
                        <h3 className="font-bold text-lg mb-3">💡 使い方</h3>
                        <ol className="space-y-2 text-slate-600">
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
                    </div>
                )}
            </div>
        </div>
    );
}
