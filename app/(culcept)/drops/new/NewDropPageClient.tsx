"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    GlassCard,
    GlassNavbar,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";
import { AuctionModePageShell, type AuctionSaleMode } from "@/app/drops/_components/AuctionModePageShell";
import TagInput from "@/app/components/TagInput";
import type { DropActionState } from "@/app/_actions/drops";
import StyleCategorySection from "@/components/drops/StyleCategorySection";
import FitProfileEditor from "@/components/drops/FitProfileEditor";
import FitHiddenInputs from "@/components/drops/FitHiddenInputs";
import { buildInitialFitValues, type UserFootReference } from "@/lib/drops/fitProfile";
import { MAIN_NAV } from "@/lib/navigation";

const MAX_IMAGES = 10;
const MAX_MB = 20;

const STEP_ITEMS = [
    { key: "basic", label: "基本情報", icon: "📝" },
    { key: "style", label: "スタイル", icon: "🧭" },
    { key: "fit", label: "体型フィット", icon: "📏" },
    { key: "media", label: "画像・説明", icon: "📸" },
] as const;

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
    userFootReference?: UserFootReference | null;
}

const SectionIcon = ({ children, gradient }: { children: React.ReactNode; gradient: string }) => (
    <motion.div
        whileHover={{ scale: 1.08, rotate: 4 }}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-lg shadow-lg`}
    >
        {children}
    </motion.div>
);

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
            {label} {required ? <span className="text-violet-500">*</span> : null}
        </label>
        <div className="group relative">
            {children}
            <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-violet-500/0 via-violet-500/0 to-violet-500/0 transition-all duration-500 group-focus-within:from-violet-500/5 group-focus-within:via-transparent group-focus-within:to-cyan-500/5" />
        </div>
        <AnimatePresence>
            {error ? (
                <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    role="alert"
                    className="text-sm text-red-500"
                >
                    {error}
                </motion.p>
            ) : null}
        </AnimatePresence>
    </div>
);

function StepHeader({
    step,
    setStep,
}: {
    step: number;
    setStep: (next: number) => void;
}) {
    return (
        <div className="mb-6 rounded-3xl border border-white/80 bg-white/65 p-4 backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold text-slate-700">ステップ入力</div>
                    <div className="text-xs text-slate-400">
                        {step + 1} / {STEP_ITEMS.length}
                    </div>
                </div>
                <div className="text-xs font-semibold text-slate-500">
                    {STEP_ITEMS[step]?.label}
                </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
                {STEP_ITEMS.map((item, index) => {
                    const active = index === step;
                    const complete = index < step;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => setStep(index)}
                            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                                active
                                    ? "border-violet-400 bg-violet-50"
                                    : complete
                                        ? "border-emerald-200 bg-emerald-50"
                                        : "border-white/80 bg-white/80"
                            }`}
                        >
                            <span className="text-lg">{item.icon}</span>
                            <div>
                                <div className="text-sm font-semibold text-slate-800">{item.label}</div>
                                <div className="text-[11px] text-slate-400">{index + 1}</div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default function NewDropPageClient({ imp, action, userFootReference }: Props) {
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
    const [step, setStep] = React.useState(0);
    const [categoryMain, setCategoryMain] = React.useState("");
    const [subcategoryId, setSubcategoryId] = React.useState("");
    const [fitValues, setFitValues] = React.useState(() => buildInitialFitValues(null));
    const [saleMode, setSaleMode] = React.useState<AuctionSaleMode>("fixed");
    const [fixedPriceValue, setFixedPriceValue] = React.useState("");
    const [buyNowPriceValue, setBuyNowPriceValue] = React.useState("");
    const [auctionFloorPriceValue, setAuctionFloorPriceValue] = React.useState("");
    const [auctionEndAtValue, setAuctionEndAtValue] = React.useState("");
    const [auctionAllowBuyNow, setAuctionAllowBuyNow] = React.useState(true);

    React.useEffect(() => {
        return () => {
            for (const u of previewsRef.current) URL.revokeObjectURL(u);
        };
    }, []);

    React.useEffect(() => {
        const hasMediaErrors =
            Boolean(state.fieldErrors?.url) ||
            Boolean(state.fieldErrors?.purchase_url) ||
            Boolean(state.fieldErrors?.images);
        if (hasMediaErrors) setStep(3);
        else if (
            state.fieldErrors?.title ||
            state.fieldErrors?.price ||
            state.fieldErrors?.buy_now_price ||
            state.fieldErrors?.auction_floor_price ||
            state.fieldErrors?.auction_end_at
        ) {
            setStep(0);
        }
    }, [state.fieldErrors]);

    const handleFiles = (files: FileList | null) => {
        if (!files) return;
        const arr = Array.from(files);
        for (const u of previewsRef.current) URL.revokeObjectURL(u);
        setPreviews(arr.map((file) => URL.createObjectURL(file)));
    };

    const setFitValue = React.useCallback((key: string, value: string) => {
        setFitValues((prev) => ({ ...prev, [key]: value }));
    }, []);

    const inputClasses =
        "w-full rounded-xl border border-white/80 bg-white/60 px-5 py-4 text-gray-800 placeholder-gray-400 shadow-sm transition-all duration-300 focus:border-violet-400 focus:bg-white/80 focus:outline-none";

    return (
        <AuctionModePageShell saleMode={saleMode}>
            <GlassNavbar>
                <div className="mx-auto max-w-4xl">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <Link
                                href={addQuery("/shops/me", { imp })}
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/60 bg-white/50 text-gray-500 shadow-sm transition-all duration-300 hover:bg-white/80 hover:text-gray-800"
                            >
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </Link>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-gray-800">新規出品</h1>
                                <p className="text-xs text-gray-400">ウィザード形式で登録します</p>
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
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 shadow-lg"
                        >
                            <span className="text-lg">✨</span>
                        </motion.div>
                    </div>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <main className="mx-auto max-w-4xl px-4 py-8 pb-40 sm:px-6">
                <StepHeader step={step} setStep={setStep} />

                <form action={formAction} aria-busy={isPending}>
                    <FitHiddenInputs categoryMain={categoryMain} subcategoryId={subcategoryId} values={fitValues} />

                    <fieldset disabled={isPending} className="space-y-6">
                        <div hidden={step !== 0}>
                            <FadeInView>
                                <GlassCard className="overflow-hidden">
                                    <div className="p-6 sm:p-8">
                                        <div className="mb-6 flex items-center gap-3">
                                            <SectionIcon gradient="from-violet-500 to-indigo-500">📝</SectionIcon>
                                            <div>
                                                <h2 className="font-semibold text-gray-800">基本情報</h2>
                                                <p className="text-xs text-gray-400">タイトル、価格、タグを先に固めます。</p>
                                            </div>
                                        </div>

                                        <div className="space-y-5">
                                            <AnimatedInput label="タイトル" required error={state.fieldErrors?.title}>
                                                <input name="title" required placeholder="商品名を入力" className={inputClasses} />
                                            </AnimatedInput>

                                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                                <AnimatedInput label="ブランド">
                                                    <input name="brand" placeholder="例: LEVI'S" className={inputClasses} />
                                                </AnimatedInput>
                                                <AnimatedInput label="サイズ">
                                                    <input name="size" placeholder="例: 27cm / M" className={inputClasses} />
                                                </AnimatedInput>
                                            </div>

                                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                                <AnimatedInput label="コンディション">
                                                    <select
                                                        name="condition"
                                                        className={`${inputClasses} appearance-none cursor-pointer`}
                                                        style={{
                                                            backgroundImage:
                                                                "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
                                                            backgroundPosition: "right 0.75rem center",
                                                            backgroundRepeat: "no-repeat",
                                                            backgroundSize: "1.5em 1.5em",
                                                        }}
                                                    >
                                                        <option value="">選択してください</option>
                                                        <option value="new">新品・未使用</option>
                                                        <option value="like_new">未使用に近い</option>
                                                        <option value="good">目立った傷や汚れなし</option>
                                                        <option value="fair">やや傷や汚れあり</option>
                                                        <option value="poor">傷や汚れあり</option>
                                                    </select>
                                                </AnimatedInput>
                                                <AnimatedInput label="販売方式">
                                                    <select
                                                        name="sale_mode"
                                                        value={saleMode}
                                                        onChange={(e) => setSaleMode(e.currentTarget.value === "auction" ? "auction" : "fixed")}
                                                        className={`${inputClasses} appearance-none cursor-pointer`}
                                                        style={{
                                                            backgroundImage:
                                                                "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
                                                            backgroundPosition: "right 0.75rem center",
                                                            backgroundRepeat: "no-repeat",
                                                            backgroundSize: "1.5em 1.5em",
                                                        }}
                                                    >
                                                        <option value="fixed">通常販売</option>
                                                        <option value="auction">オークション</option>
                                                    </select>
                                                </AnimatedInput>
                                            </div>

                                            <div
                                                className={`rounded-3xl border p-4 transition-all sm:p-5 ${
                                                    saleMode === "auction"
                                                        ? "border-violet-300 bg-violet-50/75 shadow-[0_24px_70px_-32px_rgba(109,40,217,0.55)]"
                                                        : "border-white/80 bg-white/55"
                                                }`}
                                            >
                                                <div className="mb-3">
                                                    <div className="text-sm font-semibold text-slate-800">
                                                        {saleMode === "auction" ? "オークション価格設定" : "通常販売価格"}
                                                    </div>
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        {saleMode === "auction"
                                                            ? "ページ全体がオークションモードになり、floor / 締切 / 即決を設定できます。"
                                                            : "通常販売では固定価格でそのまま購入されます。"}
                                                    </p>
                                                </div>

                                                {saleMode === "fixed" ? (
                                                    <AnimatedInput label="価格" error={state.fieldErrors?.price}>
                                                        <div className="relative">
                                                            <span className="absolute left-5 top-1/2 -translate-y-1/2 font-medium text-gray-400">¥</span>
                                                            <input
                                                                name="price"
                                                                type="number"
                                                                min={0}
                                                                step="1"
                                                                placeholder="0"
                                                                value={fixedPriceValue}
                                                                onChange={(e) => setFixedPriceValue(e.currentTarget.value)}
                                                                className={`${inputClasses} pl-10`}
                                                            />
                                                        </div>
                                                    </AnimatedInput>
                                                ) : (
                                                    <div className="space-y-4">
                                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                                            <AnimatedInput label="オークション初値" error={state.fieldErrors?.auction_floor_price}>
                                                                <div className="relative">
                                                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-medium text-gray-400">¥</span>
                                                                    <input
                                                                        name="auction_floor_price"
                                                                        type="number"
                                                                        min={0}
                                                                        step="1"
                                                                        placeholder="5000"
                                                                        value={auctionFloorPriceValue}
                                                                        onChange={(e) => setAuctionFloorPriceValue(e.currentTarget.value)}
                                                                        className={`${inputClasses} pl-10`}
                                                                    />
                                                                </div>
                                                            </AnimatedInput>
                                                            <AnimatedInput label="終了時間（JST）" error={state.fieldErrors?.auction_end_at}>
                                                                <input
                                                                    name="auction_end_at"
                                                                    type="datetime-local"
                                                                    value={auctionEndAtValue}
                                                                    onChange={(e) => setAuctionEndAtValue(e.currentTarget.value)}
                                                                    className={inputClasses}
                                                                />
                                                            </AnimatedInput>
                                                        </div>

                                                        <label className="flex items-center gap-2 rounded-2xl border border-violet-200 bg-white/80 px-3 py-3 text-sm font-semibold text-slate-700">
                                                            <input
                                                                name="auction_allow_buy_now"
                                                                type="checkbox"
                                                                checked={auctionAllowBuyNow}
                                                                onChange={(e) => setAuctionAllowBuyNow(e.currentTarget.checked)}
                                                                className="h-4 w-4"
                                                            />
                                                            オークション中に即決購入を許可する
                                                        </label>

                                                        {auctionAllowBuyNow ? (
                                                            <AnimatedInput label="即決価格" error={state.fieldErrors?.buy_now_price}>
                                                                <div className="relative">
                                                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-medium text-gray-400">¥</span>
                                                                    <input
                                                                        name="buy_now_price"
                                                                        type="number"
                                                                        min={0}
                                                                        step="1"
                                                                        placeholder="12000"
                                                                        value={buyNowPriceValue}
                                                                        onChange={(e) => setBuyNowPriceValue(e.currentTarget.value)}
                                                                        className={`${inputClasses} pl-10`}
                                                                    />
                                                                </div>
                                                            </AnimatedInput>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </div>

                                            <div>
                                                <div className="mb-3 text-sm font-medium text-gray-500">タグ</div>
                                                <TagInput name="tags" />
                                                <p className="mt-3 text-xs text-gray-400">カンマまたはEnterで区切って入力</p>
                                            </div>
                                        </div>
                                    </div>
                                </GlassCard>
                            </FadeInView>
                        </div>

                        <div hidden={step !== 1}>
                            <FadeInView>
                                <GlassCard className="overflow-hidden">
                                    <div className="p-6 sm:p-8">
                                        <div className="mb-6 flex items-center gap-3">
                                            <SectionIcon gradient="from-cyan-500 to-teal-500">🧭</SectionIcon>
                                            <div>
                                                <h2 className="font-semibold text-gray-800">スタイル</h2>
                                                <p className="text-xs text-gray-400">アイテムカテゴリに応じて後続の計測UIを切り替えます。</p>
                                            </div>
                                        </div>
                                        <StyleCategorySection
                                            categoryMain={categoryMain}
                                            subcategoryId={subcategoryId}
                                            onCategoryMainChange={setCategoryMain}
                                            onSubcategoryIdChange={setSubcategoryId}
                                        />
                                    </div>
                                </GlassCard>
                            </FadeInView>
                        </div>

                        <div hidden={step !== 2}>
                            <FadeInView>
                                <GlassCard className="overflow-hidden">
                                    <div className="p-6 sm:p-8">
                                        <div className="mb-6 flex items-center gap-3">
                                            <SectionIcon gradient="from-amber-500 to-orange-500">📏</SectionIcon>
                                            <div>
                                                <h2 className="font-semibold text-gray-800">体型フィット入力</h2>
                                                <p className="text-xs text-gray-400">カテゴリごとの評価項目と計測ガイドを使います。</p>
                                            </div>
                                        </div>
                                        <FitProfileEditor
                                            categoryMain={categoryMain}
                                            subcategoryId={subcategoryId}
                                            values={fitValues}
                                            onChange={setFitValue}
                                            userFootReference={userFootReference}
                                            layout="wizard"
                                        />
                                    </div>
                                </GlassCard>
                            </FadeInView>
                        </div>

                        <div hidden={step !== 3}>
                            <div className="space-y-6">
                                <FadeInView>
                                    <GlassCard className="overflow-hidden">
                                        <div className="p-6 sm:p-8">
                                            <div className="mb-6 flex items-center gap-3">
                                                <SectionIcon gradient="from-cyan-500 to-teal-500">🔗</SectionIcon>
                                                <div>
                                                    <h2 className="font-semibold text-gray-800">リンク</h2>
                                                    <p className="text-xs text-gray-400">商品ページへのリンクを設定</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                                                <AnimatedInput label="商品ページURL" error={state.fieldErrors?.url}>
                                                    <input name="url" type="url" placeholder="https://..." className={inputClasses} />
                                                </AnimatedInput>
                                                <AnimatedInput label="購入ページURL" error={state.fieldErrors?.purchase_url}>
                                                    <input name="purchase_url" type="url" placeholder="https://..." className={inputClasses} />
                                                </AnimatedInput>
                                            </div>
                                        </div>
                                    </GlassCard>
                                </FadeInView>

                                <FadeInView delay={0.1}>
                                    <GlassCard className="overflow-hidden">
                                        <div className="p-6 sm:p-8">
                                            <div className="mb-6 flex items-center gap-3">
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
                                                    onDragOver={(e) => {
                                                        e.preventDefault();
                                                        setDragOver(true);
                                                    }}
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
                                                    className="flex h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed backdrop-blur-sm transition-all"
                                                    whileHover={{ scale: 1.01 }}
                                                    whileTap={{ scale: 0.99 }}
                                                >
                                                    <motion.div
                                                        animate={{ y: [0, -5, 0] }}
                                                        transition={{ duration: 2, repeat: Infinity }}
                                                        className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20"
                                                    >
                                                        <svg className="h-7 w-7 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                    </motion.div>
                                                    <span className="text-sm font-medium text-gray-600">クリックまたはドラッグ&ドロップ</span>
                                                    <span className="mt-1 text-xs text-gray-400">JPEG, PNG, WebP</span>
                                                </motion.label>
                                            </div>

                                            {state.fieldErrors?.images ? (
                                                <p role="alert" className="mt-3 text-sm text-red-500">
                                                    {state.fieldErrors.images}
                                                </p>
                                            ) : null}

                                            {previews.length > 0 ? (
                                                <div className="mt-5 grid grid-cols-4 gap-3 sm:grid-cols-5">
                                                    {previews.map((src, index) => (
                                                        <div key={src} className="relative group">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={src}
                                                                alt={`preview ${index + 1}`}
                                                                className="aspect-square w-full rounded-xl border border-white/80 object-cover shadow-sm transition-all group-hover:border-violet-400/50"
                                                            />
                                                            {index === 0 ? (
                                                                <span className="absolute left-1 top-1 rounded-md bg-violet-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                                                                    メイン
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    </GlassCard>
                                </FadeInView>

                                <FadeInView delay={0.15}>
                                    <GlassCard className="overflow-hidden">
                                        <div className="p-6 sm:p-8">
                                            <div className="mb-6 flex items-center gap-3">
                                                <SectionIcon gradient="from-emerald-500 to-green-500">📄</SectionIcon>
                                                <div>
                                                    <h2 className="font-semibold text-gray-800">商品説明</h2>
                                                    <p className="text-xs text-gray-400">詳細・状態・特徴を記載</p>
                                                </div>
                                            </div>
                                            <div className="group relative">
                                                <textarea
                                                    name="description"
                                                    rows={6}
                                                    placeholder="商品の詳細、状態、特徴などを記載..."
                                                    className={`${inputClasses} resize-none`}
                                                />
                                                <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-violet-500/0 via-violet-500/0 to-violet-500/0 transition-all duration-500 group-focus-within:from-emerald-500/5 group-focus-within:via-transparent group-focus-within:to-cyan-500/5" />
                                            </div>
                                        </div>
                                    </GlassCard>
                                </FadeInView>
                            </div>
                        </div>

                        {state.error ? (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-5">
                                <div className="flex items-center gap-3">
                                    <span className="text-xl">⚠️</span>
                                    <p className="text-sm text-red-600">{state.error}</p>
                                </div>
                            </div>
                        ) : null}

                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/70 bg-white/65 px-5 py-4 backdrop-blur-sm">
                            <button
                                type="button"
                                onClick={() => setStep((current) => Math.max(0, current - 1))}
                                disabled={step === 0}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                前へ
                            </button>

                            {step < STEP_ITEMS.length - 1 ? (
                                <button
                                    type="button"
                                    onClick={() => setStep((current) => Math.min(STEP_ITEMS.length - 1, current + 1))}
                                    className="rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-500/25 transition hover:from-violet-600 hover:to-indigo-600"
                                >
                                    次へ
                                </button>
                            ) : (
                                <motion.button
                                    type="submit"
                                    disabled={isPending}
                                    className="rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-4 text-base font-bold text-white shadow-lg shadow-violet-500/25 transition hover:from-violet-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                                    whileHover={{ scale: isPending ? 1 : 1.02 }}
                                    whileTap={{ scale: isPending ? 1 : 0.98 }}
                                >
                                    {isPending ? "登録中..." : "商品を登録する"}
                                </motion.button>
                            )}
                        </div>
                    </fieldset>
                </form>
            </main>

            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
            >
                <FloatingNavLight items={MAIN_NAV} activeHref="/drops/new" />
            </motion.div>
        </AuctionModePageShell>
    );
}
