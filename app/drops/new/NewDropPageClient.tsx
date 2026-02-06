// app/drops/new/NewDropPageClient.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassNavbar,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";
import TagInput from "@/app/components/TagInput";
import type { DropActionState } from "./actions";

const MAX_IMAGES = 10;
const MAX_MB = 20;

const NAV_ITEMS = [
    { href: "/", label: "ホーム", icon: "🏠" },
    { href: "/products", label: "商品", icon: "👕" },
    { href: "/shops/me", label: "マイショップ", icon: "🏪" },
    { href: "/drops/new", label: "出品", icon: "✨" },
];

function addQuery(url: string, params: Record<string, string | null | undefined>) {
    const qs = Object.entries(params)
        .filter(([, v]) => v != null && String(v).trim() !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
    if (!qs) return url;
    return url + (url.includes("?") ? "&" : "?") + qs;
}

interface Props {
    imp: string | null;
    action: (prev: DropActionState, formData: FormData) => Promise<DropActionState>;
}

// セクションアイコン
const SectionIcon = ({ children, gradient }: { children: React.ReactNode; gradient: string }) => (
    <motion.div
        whileHover={{ scale: 1.1, rotate: 5 }}
        className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-lg shrink-0 shadow-lg`}
    >
        {children}
    </motion.div>
);

// アニメーション付きインプットフィールド
const AnimatedInput = ({
    label,
    required,
    error,
    children,
}: {
    label: string;
    required?: boolean;
    error?: string;
    children: React.ReactNode;
}) => (
    <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-500">
            {label} {required && <span className="text-violet-500">*</span>}
        </label>
        <div className="relative group">
            {children}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-500/0 via-violet-500/0 to-violet-500/0 group-focus-within:from-violet-500/5 group-focus-within:via-transparent group-focus-within:to-cyan-500/5 pointer-events-none transition-all duration-500" />
        </div>
        <AnimatePresence>
            {error && (
                <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    role="alert"
                    className="text-sm text-red-500"
                >
                    {error}
                </motion.p>
            )}
        </AnimatePresence>
    </div>
);

export default function NewDropPageClient({ imp, action }: Props) {
    const initialState: DropActionState = { ok: false, error: null, fieldErrors: {} };

    const [state, formAction, isPending] = (React as any).useActionState(action as any, initialState) as [
        DropActionState,
        (fd: FormData) => void,
        boolean
    ];

    const [previews, setPreviews] = React.useState<string[]>([]);
    const previewsRef = React.useRef<string[]>([]);
    previewsRef.current = previews;

    const [dragOver, setDragOver] = React.useState(false);

    React.useEffect(() => {
        return () => {
            for (const u of previewsRef.current) URL.revokeObjectURL(u);
        };
    }, []);

    const handleFiles = (files: FileList | null) => {
        if (!files) return;
        const arr = Array.from(files);
        for (const u of previewsRef.current) URL.revokeObjectURL(u);
        const next = arr.map((f) => URL.createObjectURL(f));
        setPreviews(next);
    };

    const inputClasses = "w-full rounded-xl bg-white/60 backdrop-blur-sm border border-white/80 px-5 py-4 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:bg-white/80 transition-all duration-300 shadow-sm";

    return (
        <LightBackground>
            {/* ヘッダー */}
            <GlassNavbar>
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <Link
                                href={addQuery("/shops/me", { imp })}
                                className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 hover:text-gray-800 transition-all duration-300 shadow-sm"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </Link>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-gray-800">新規出品</h1>
                                <p className="text-xs text-gray-400">商品を登録する</p>
                            </div>
                        </div>
                        <motion.div
                            animate={{
                                boxShadow: [
                                    "0 0 20px rgba(139,92,246,0.2)",
                                    "0 0 40px rgba(139,92,246,0.3)",
                                    "0 0 20px rgba(139,92,246,0.2)",
                                ],
                            }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg"
                        >
                            <span className="text-lg">✨</span>
                        </motion.div>
                    </div>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            {/* フォーム */}
            <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-40">
                <form action={formAction} aria-busy={isPending}>
                    <fieldset disabled={isPending} className="space-y-6">
                        {/* 基本情報 */}
                        <FadeInView>
                            <GlassCard className="overflow-hidden">
                                <div className="p-6 sm:p-8">
                                    <div className="flex items-center gap-3 mb-6">
                                        <SectionIcon gradient="from-violet-500 to-indigo-500">📝</SectionIcon>
                                        <div>
                                            <h2 className="font-semibold text-gray-800">基本情報</h2>
                                            <p className="text-xs text-gray-400">商品の基本的な情報を入力</p>
                                        </div>
                                    </div>

                                    <div className="space-y-5">
                                        {/* タイトル */}
                                        <AnimatedInput label="タイトル" required error={state.fieldErrors?.title}>
                                            <input
                                                name="title"
                                                required
                                                placeholder="商品名を入力"
                                                className={inputClasses}
                                            />
                                        </AnimatedInput>

                                        {/* ブランド & サイズ */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <AnimatedInput label="ブランド">
                                                <input
                                                    name="brand"
                                                    placeholder="例: LEVI'S"
                                                    className={inputClasses}
                                                />
                                            </AnimatedInput>
                                            <AnimatedInput label="サイズ">
                                                <input
                                                    name="size"
                                                    placeholder="例: M, L, XL"
                                                    className={inputClasses}
                                                />
                                            </AnimatedInput>
                                        </div>

                                        {/* コンディション & 価格 */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <AnimatedInput label="コンディション">
                                                <select
                                                    name="condition"
                                                    className={`${inputClasses} appearance-none cursor-pointer`}
                                                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
                                                >
                                                    <option value="" className="bg-white">選択してください</option>
                                                    <option value="new" className="bg-white">新品・未使用</option>
                                                    <option value="like_new" className="bg-white">未使用に近い</option>
                                                    <option value="good" className="bg-white">目立った傷や汚れなし</option>
                                                    <option value="fair" className="bg-white">やや傷や汚れあり</option>
                                                    <option value="poor" className="bg-white">傷や汚れあり</option>
                                                </select>
                                            </AnimatedInput>
                                            <AnimatedInput label="価格" error={state.fieldErrors?.price}>
                                                <div className="relative">
                                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 font-medium">¥</span>
                                                    <input
                                                        name="price"
                                                        type="number"
                                                        min={0}
                                                        step="1"
                                                        placeholder="0"
                                                        className={`${inputClasses} pl-10`}
                                                    />
                                                </div>
                                            </AnimatedInput>
                                        </div>
                                    </div>
                                </div>
                            </GlassCard>
                        </FadeInView>

                        {/* タグ */}
                        <FadeInView delay={0.1}>
                            <GlassCard className="overflow-hidden">
                                <div className="p-6 sm:p-8">
                                    <div className="flex items-center gap-3 mb-6">
                                        <SectionIcon gradient="from-pink-500 to-rose-500">🏷️</SectionIcon>
                                        <div>
                                            <h2 className="font-semibold text-gray-800">タグ</h2>
                                            <p className="text-xs text-gray-400">検索性を高めるタグを追加</p>
                                        </div>
                                    </div>
                                    <TagInput name="tags" />
                                    <p className="mt-3 text-xs text-gray-400">
                                        カンマまたはEnterで区切って入力
                                    </p>
                                </div>
                            </GlassCard>
                        </FadeInView>

                        {/* リンク */}
                        <FadeInView delay={0.15}>
                            <GlassCard className="overflow-hidden">
                                <div className="p-6 sm:p-8">
                                    <div className="flex items-center gap-3 mb-6">
                                        <SectionIcon gradient="from-cyan-500 to-teal-500">🔗</SectionIcon>
                                        <div>
                                            <h2 className="font-semibold text-gray-800">リンク</h2>
                                            <p className="text-xs text-gray-400">商品ページへのリンクを設定</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                        <AnimatedInput label="商品ページURL" error={state.fieldErrors?.url}>
                                            <input
                                                name="url"
                                                type="url"
                                                placeholder="https://..."
                                                className={inputClasses}
                                            />
                                        </AnimatedInput>
                                        <AnimatedInput label="購入ページURL" error={state.fieldErrors?.purchase_url}>
                                            <input
                                                name="purchase_url"
                                                type="url"
                                                placeholder="https://..."
                                                className={inputClasses}
                                            />
                                        </AnimatedInput>
                                    </div>
                                </div>
                            </GlassCard>
                        </FadeInView>

                        {/* 画像 */}
                        <FadeInView delay={0.2}>
                            <GlassCard className="overflow-hidden">
                                <div className="p-6 sm:p-8">
                                    <div className="flex items-center gap-3 mb-6">
                                        <SectionIcon gradient="from-amber-500 to-orange-500">📸</SectionIcon>
                                        <div>
                                            <h2 className="font-semibold text-gray-800">画像</h2>
                                            <p className="text-xs text-gray-400">最大{MAX_IMAGES}枚、各{MAX_MB}MB以下</p>
                                        </div>
                                    </div>

                                    <div className="relative">
                                        <input
                                            name="images"
                                            type="file"
                                            multiple
                                            accept="image/jpeg,image/png,image/webp"
                                            onChange={(e) => handleFiles(e.currentTarget.files)}
                                            className="hidden"
                                            id="images-input"
                                        />
                                        <motion.label
                                            htmlFor="images-input"
                                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                            onDragLeave={() => setDragOver(false)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                setDragOver(false);
                                                handleFiles(e.dataTransfer.files);
                                            }}
                                            animate={{
                                                borderColor: dragOver ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.8)",
                                                backgroundColor: dragOver ? "rgba(139,92,246,0.05)" : "rgba(255,255,255,0.5)",
                                            }}
                                            className="flex flex-col items-center justify-center h-40 rounded-2xl border-2 border-dashed cursor-pointer transition-all backdrop-blur-sm"
                                            whileHover={{ scale: 1.01 }}
                                            whileTap={{ scale: 0.99 }}
                                        >
                                            <motion.div
                                                animate={{ y: [0, -5, 0] }}
                                                transition={{ duration: 2, repeat: Infinity }}
                                                className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 flex items-center justify-center mb-3"
                                            >
                                                <svg className="w-7 h-7 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                            </motion.div>
                                            <span className="text-sm text-gray-600 font-medium">
                                                クリックまたはドラッグ&ドロップ
                                            </span>
                                            <span className="text-xs text-gray-400 mt-1">
                                                JPEG, PNG, WebP
                                            </span>
                                        </motion.label>
                                    </div>

                                    <AnimatePresence>
                                        {state.fieldErrors?.images && (
                                            <motion.p
                                                initial={{ opacity: 0, y: -5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -5 }}
                                                role="alert"
                                                className="mt-3 text-sm text-red-500"
                                            >
                                                {state.fieldErrors.images}
                                            </motion.p>
                                        )}
                                    </AnimatePresence>

                                    <AnimatePresence>
                                        {previews.length > 0 && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-5 grid grid-cols-4 sm:grid-cols-5 gap-3"
                                            >
                                                {previews.map((src, i) => (
                                                    <motion.div
                                                        key={src}
                                                        initial={{ opacity: 0, scale: 0.8 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        transition={{ delay: i * 0.05 }}
                                                        className="relative group"
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={src}
                                                            alt={`preview ${i + 1}`}
                                                            className="w-full aspect-square object-cover rounded-xl border border-white/80 group-hover:border-violet-400/50 transition-all shadow-sm"
                                                        />
                                                        {i === 0 && (
                                                            <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] font-bold bg-violet-500 text-white rounded-md shadow-sm">
                                                                メイン
                                                            </span>
                                                        )}
                                                    </motion.div>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </GlassCard>
                        </FadeInView>

                        {/* 説明 */}
                        <FadeInView delay={0.25}>
                            <GlassCard className="overflow-hidden">
                                <div className="p-6 sm:p-8">
                                    <div className="flex items-center gap-3 mb-6">
                                        <SectionIcon gradient="from-emerald-500 to-green-500">📄</SectionIcon>
                                        <div>
                                            <h2 className="font-semibold text-gray-800">商品説明</h2>
                                            <p className="text-xs text-gray-400">詳細・状態・特徴を記載</p>
                                        </div>
                                    </div>
                                    <div className="relative group">
                                        <textarea
                                            name="description"
                                            rows={6}
                                            placeholder="商品の詳細、状態、特徴などを記載..."
                                            className={`${inputClasses} resize-none`}
                                        />
                                        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-500/0 via-violet-500/0 to-violet-500/0 group-focus-within:from-emerald-500/5 group-focus-within:via-transparent group-focus-within:to-cyan-500/5 pointer-events-none transition-all duration-500" />
                                    </div>
                                </div>
                            </GlassCard>
                        </FadeInView>

                        {/* エラーメッセージ */}
                        <AnimatePresence>
                            {state.error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                    className="rounded-xl bg-red-50 border border-red-200 p-5"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl">⚠️</span>
                                        <p className="text-sm text-red-600">{state.error}</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* 送信ボタン */}
                        <FadeInView delay={0.3}>
                            <motion.button
                                type="submit"
                                disabled={isPending}
                                className="w-full py-5 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold text-lg hover:from-violet-600 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40"
                                whileHover={{ scale: isPending ? 1 : 1.02 }}
                                whileTap={{ scale: isPending ? 1 : 0.98 }}
                            >
                                {isPending ? (
                                    <span className="flex items-center justify-center gap-3">
                                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        登録中...
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-3">
                                        <span>商品を登録する</span>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                        </svg>
                                    </span>
                                )}
                            </motion.button>
                        </FadeInView>
                    </fieldset>
                </form>
            </main>

            {/* フローティングナビ */}
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
            >
                <FloatingNavLight items={NAV_ITEMS} activeHref="/drops/new" />
            </motion.div>
        </LightBackground>
    );
}
