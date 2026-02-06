// app/try-on/TryOnPageClient.tsx
"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassNavbar,
    GlassButton,
    GlassBadge,
    FadeInView,
    FloatingNavLight,
    GlassModal,
    ProgressRing,
} from "@/components/ui/glassmorphism-design";

type TryOnItem = {
    id: string;
    title: string;
    brand?: string;
    imageUrl: string;
    category: string;
};

type TryOnResult = {
    id: string;
    originalPhoto: string;
    resultImage: string;
    item: TryOnItem;
    createdAt: Date;
};

export default function TryOnPageClient() {
    const [userPhoto, setUserPhoto] = useState<string | null>(null);
    const [selectedItem, setSelectedItem] = useState<TryOnItem | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState<TryOnResult[]>([]);
    const [showResultModal, setShowResultModal] = useState(false);
    const [currentResult, setCurrentResult] = useState<TryOnResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // サンプルアイテム
    const sampleItems: TryOnItem[] = [
        { id: "1", title: "オーバーサイズブレザー", brand: "ZARA", imageUrl: "/cards/blazer.jpg", category: "アウター" },
        { id: "2", title: "ニットセーター", brand: "UNIQLO", imageUrl: "/cards/sweater.jpg", category: "トップス" },
        { id: "3", title: "デニムジャケット", brand: "Levi's", imageUrl: "/cards/denim.jpg", category: "アウター" },
        { id: "4", title: "ロングコート", brand: "COS", imageUrl: "/cards/coat.jpg", category: "アウター" },
        { id: "5", title: "パーカー", brand: "Champion", imageUrl: "/cards/hoodie.jpg", category: "トップス" },
        { id: "6", title: "レザージャケット", brand: "AllSaints", imageUrl: "/cards/leather.jpg", category: "アウター" },
    ];

    const handlePhotoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setUserPhoto(ev.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    }, []);

    const handleTryOn = useCallback(async () => {
        if (!userPhoto || !selectedItem) return;

        setIsProcessing(true);
        setProgress(0);

        // シミュレーション: プログレス更新
        const progressInterval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 95) {
                    clearInterval(progressInterval);
                    return prev;
                }
                return prev + Math.random() * 15;
            });
        }, 500);

        // 実際のAPI呼び出し（モック）
        try {
            // TODO: 実際のAI試着APIを呼び出す
            await new Promise(resolve => setTimeout(resolve, 3000));

            const result: TryOnResult = {
                id: `result-${Date.now()}`,
                originalPhoto: userPhoto,
                resultImage: userPhoto, // 実際にはAI生成画像
                item: selectedItem,
                createdAt: new Date(),
            };

            setResults(prev => [result, ...prev]);
            setCurrentResult(result);
            setShowResultModal(true);
            setProgress(100);
        } catch (error) {
            console.error("Try-on error:", error);
        } finally {
            clearInterval(progressInterval);
            setIsProcessing(false);
            setProgress(0);
        }
    }, [userPhoto, selectedItem]);

    return (
        <LightBackground>
            {/* ヘッダー */}
            <GlassNavbar>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">AI Virtual Try-On</h1>
                            <p className="text-sm text-slate-500">バーチャル試着で購入前にチェック</p>
                        </div>
                    </div>
                    <GlassBadge variant="gradient">Beta</GlassBadge>
                </div>
            </GlassNavbar>

            <main className="pt-28 pb-32 px-4 sm:px-6 max-w-7xl mx-auto">
                <div className="grid lg:grid-cols-2 gap-8">
                    {/* 左: 写真アップロード & プレビュー */}
                    <FadeInView>
                        <GlassCard variant="elevated" padding="lg">
                            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <span className="w-8 h-8 rounded-lg bg-pink-100 flex items-center justify-center text-pink-600">
                                    📸
                                </span>
                                あなたの写真
                            </h2>

                            {!userPhoto ? (
                                <motion.div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="relative aspect-[3/4] rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 flex flex-col items-center justify-center cursor-pointer hover:border-purple-400 hover:bg-purple-50/30 transition-all duration-300"
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.99 }}
                                >
                                    <motion.div
                                        animate={{ y: [0, -5, 0] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white text-2xl mb-4"
                                    >
                                        👤
                                    </motion.div>
                                    <p className="text-lg font-semibold text-slate-700">写真をアップロード</p>
                                    <p className="text-sm text-slate-500 mt-1">または、ドラッグ＆ドロップ</p>
                                    <p className="text-xs text-slate-400 mt-4">推奨: 全身写真、明るい背景</p>
                                </motion.div>
                            ) : (
                                <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-slate-100">
                                    <img
                                        src={userPhoto}
                                        alt="Your photo"
                                        className="w-full h-full object-cover"
                                    />
                                    <button
                                        onClick={() => {
                                            setUserPhoto(null);
                                            setSelectedItem(null);
                                        }}
                                        className="absolute top-3 right-3 w-10 h-10 rounded-xl bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center text-slate-600 hover:bg-white transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>

                                    {selectedItem && (
                                        <div className="absolute bottom-3 left-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl p-3 shadow-lg">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 rounded-lg bg-slate-200 overflow-hidden">
                                                    <img
                                                        src={selectedItem.imageUrl}
                                                        alt={selectedItem.title}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold text-slate-900 truncate">{selectedItem.title}</p>
                                                    <p className="text-xs text-slate-500">{selectedItem.brand}</p>
                                                </div>
                                                <GlassBadge variant="success" size="sm">選択中</GlassBadge>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoUpload}
                                className="hidden"
                            />

                            {/* 試着ボタン */}
                            {userPhoto && selectedItem && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-6"
                                >
                                    <GlassButton
                                        variant="gradient"
                                        size="lg"
                                        fullWidth
                                        onClick={handleTryOn}
                                        disabled={isProcessing}
                                        loading={isProcessing}
                                    >
                                        {isProcessing ? `生成中... ${Math.round(progress)}%` : "✨ AIで試着する"}
                                    </GlassButton>
                                </motion.div>
                            )}
                        </GlassCard>
                    </FadeInView>

                    {/* 右: アイテム選択 */}
                    <FadeInView delay={0.1}>
                        <GlassCard variant="elevated" padding="lg">
                            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <span className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600">
                                    👕
                                </span>
                                試着するアイテム
                            </h2>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {sampleItems.map((item) => (
                                    <motion.button
                                        key={item.id}
                                        onClick={() => setSelectedItem(item)}
                                        className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all duration-300 ${
                                            selectedItem?.id === item.id
                                                ? "border-purple-500 ring-4 ring-purple-500/20"
                                                : "border-transparent hover:border-slate-300"
                                        }`}
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                    >
                                        <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                                            <span className="text-4xl">👕</span>
                                        </div>
                                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                            <p className="text-xs font-medium text-white truncate">{item.title}</p>
                                            <p className="text-[10px] text-white/70">{item.brand}</p>
                                        </div>
                                        {selectedItem?.id === item.id && (
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center"
                                            >
                                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </motion.div>
                                        )}
                                    </motion.button>
                                ))}
                            </div>

                            <div className="mt-6 pt-6 border-t border-slate-200">
                                <Link href="/products" className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1">
                                    商品一覧からもっと見る
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </Link>
                            </div>
                        </GlassCard>

                        {/* 履歴 */}
                        {results.length > 0 && (
                            <GlassCard variant="default" padding="md" className="mt-6">
                                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                                    <span>🕐</span> 最近の試着
                                </h3>
                                <div className="flex gap-3 overflow-x-auto pb-2">
                                    {results.slice(0, 5).map((result) => (
                                        <button
                                            key={result.id}
                                            onClick={() => {
                                                setCurrentResult(result);
                                                setShowResultModal(true);
                                            }}
                                            className="flex-shrink-0 w-20 aspect-[3/4] rounded-lg overflow-hidden bg-slate-200 hover:ring-2 hover:ring-purple-400 transition-all"
                                        >
                                            <img
                                                src={result.resultImage}
                                                alt="Result"
                                                className="w-full h-full object-cover"
                                            />
                                        </button>
                                    ))}
                                </div>
                            </GlassCard>
                        )}
                    </FadeInView>
                </div>

                {/* 使い方 */}
                <FadeInView delay={0.2} className="mt-12">
                    <GlassCard variant="gradient" padding="lg">
                        <h2 className="text-xl font-bold text-slate-900 mb-6 text-center">使い方</h2>
                        <div className="grid md:grid-cols-3 gap-6">
                            {[
                                { step: 1, icon: "📸", title: "写真をアップロード", desc: "全身が写った写真を選択" },
                                { step: 2, icon: "👕", title: "アイテムを選ぶ", desc: "試着したい商品をタップ" },
                                { step: 3, icon: "✨", title: "AIが合成", desc: "数秒で試着イメージ完成" },
                            ].map((item) => (
                                <div key={item.step} className="text-center">
                                    <div className="w-16 h-16 mx-auto rounded-2xl bg-white shadow-lg flex items-center justify-center text-3xl mb-4">
                                        {item.icon}
                                    </div>
                                    <GlassBadge variant="info" className="mb-2">Step {item.step}</GlassBadge>
                                    <h3 className="font-semibold text-slate-900">{item.title}</h3>
                                    <p className="text-sm text-slate-500 mt-1">{item.desc}</p>
                                </div>
                            ))}
                        </div>
                    </GlassCard>
                </FadeInView>
            </main>

            {/* 結果モーダル */}
            <GlassModal
                isOpen={showResultModal}
                onClose={() => setShowResultModal(false)}
                title="試着結果"
                size="lg"
            >
                {currentResult && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm font-medium text-slate-500 mb-2">Before</p>
                                <div className="aspect-[3/4] rounded-xl overflow-hidden bg-slate-100">
                                    <img
                                        src={currentResult.originalPhoto}
                                        alt="Original"
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-500 mb-2">After</p>
                                <div className="aspect-[3/4] rounded-xl overflow-hidden bg-slate-100 relative">
                                    <img
                                        src={currentResult.resultImage}
                                        alt="Result"
                                        className="w-full h-full object-cover"
                                    />
                                    <GlassBadge
                                        variant="gradient"
                                        className="absolute top-2 right-2"
                                    >
                                        AI Generated
                                    </GlassBadge>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-50 flex items-center gap-4">
                            <div className="w-16 h-16 rounded-lg bg-slate-200 flex-shrink-0">
                                <img
                                    src={currentResult.item.imageUrl}
                                    alt={currentResult.item.title}
                                    className="w-full h-full object-cover rounded-lg"
                                />
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold text-slate-900">{currentResult.item.title}</p>
                                <p className="text-sm text-slate-500">{currentResult.item.brand}</p>
                            </div>
                            <GlassButton variant="primary" size="sm">
                                商品を見る
                            </GlassButton>
                        </div>

                        <div className="flex gap-3">
                            <GlassButton variant="secondary" fullWidth onClick={() => setShowResultModal(false)}>
                                閉じる
                            </GlassButton>
                            <GlassButton variant="gradient" fullWidth>
                                📤 シェア
                            </GlassButton>
                        </div>
                    </div>
                )}
            </GlassModal>

            {/* プログレスオーバーレイ */}
            <AnimatePresence>
                {isProcessing && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-white/80 backdrop-blur-xl flex items-center justify-center"
                    >
                        <div className="text-center">
                            <ProgressRing progress={progress} size={140}>
                                <div className="text-center">
                                    <span className="text-3xl font-bold text-slate-900">{Math.round(progress)}%</span>
                                </div>
                            </ProgressRing>
                            <motion.p
                                className="mt-6 text-lg font-semibold text-slate-700"
                                animate={{ opacity: [0.5, 1, 0.5] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                            >
                                AIが試着イメージを生成中...
                            </motion.p>
                            <p className="text-sm text-slate-500 mt-2">
                                {progress < 30 ? "写真を分析しています" :
                                 progress < 60 ? "アイテムを合成しています" :
                                 progress < 90 ? "仕上げ処理中です" :
                                 "もうすぐ完成！"}
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* フローティングナビ */}
            <FloatingNavLight
                items={[
                    { href: "/", label: "ホーム", icon: <span>🏠</span> },
                    { href: "/products", label: "商品", icon: <span>👕</span> },
                    { href: "/try-on", label: "試着", icon: <span>✨</span>, active: true },
                    { href: "/my", label: "マイページ", icon: <span>👤</span> },
                ]}
            />
        </LightBackground>
    );
}
