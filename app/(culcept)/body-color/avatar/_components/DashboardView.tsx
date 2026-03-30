"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { GlassCard, GlassButton, GlassBadge } from "@/components/ui/glassmorphism-design";
import { formatShoeWidthCode } from "@/lib/shoeWidth";
import type {
    ViewId,
    SeasonChoice,
    UndertoneChoice,
    FusedColorResult,
    AvatarProfileRecord,
} from "./shared/types";
import { SEASON_VISUAL } from "./shared/constants";
import { seasonLabelJa, undertoneLabelJa, formatPercent } from "./shared/colorUtils";
import HairInlineSection from "./HairInlineSection";

interface DashboardViewProps {
    profileOverviewImage: string | null;
    activeSeason: SeasonChoice | null;
    activeUndertone: UndertoneChoice | null;
    phenotypeProgress: number;
    colorSeasonLabel: string;
    eyeTypeLabel: string;
    faceCompletedCategories: string[];
    measurementCount: number;
    derivedWidthSize: string;
    fusionPreview: FusedColorResult | null;
    phenotypeSections: Array<{ key: string; ready: boolean }>;
    avatarProfile: AvatarProfileRecord | null;
    onNavigate: (view: ViewId) => void;
    onHairSaved?: () => void;
}

const CATEGORY_CONFIG = [
    {
        key: "color",
        view: "color" as ViewId,
        icon: "🎨",
        label: "パーソナルカラー",
        gradient: "from-violet-100 to-violet-50",
        activeGradient: "from-violet-500 to-fuchsia-500",
    },
    {
        key: "face",
        view: "face" as ViewId,
        icon: "🧑",
        label: "顔の特徴",
        gradient: "from-fuchsia-100 to-fuchsia-50",
        activeGradient: "from-fuchsia-500 to-violet-500",
    },
    {
        key: "body",
        view: "body" as ViewId,
        icon: "📏",
        label: "体型・計測",
        gradient: "from-emerald-100 to-emerald-50",
        activeGradient: "from-emerald-500 to-teal-500",
    },
];

export default function DashboardView({
    profileOverviewImage,
    activeSeason,
    activeUndertone,
    phenotypeProgress,
    colorSeasonLabel,
    eyeTypeLabel,
    faceCompletedCategories,
    measurementCount,
    derivedWidthSize,
    fusionPreview,
    phenotypeSections,
    avatarProfile,
    onNavigate,
    onHairSaved,
}: DashboardViewProps) {
    const seasonVisual = activeSeason ? SEASON_VISUAL[activeSeason] : null;

    const nextAction = useMemo(() => {
        const incompleteKeys = new Set(
            phenotypeSections.filter((s) => !s.ready).map((s) => s.key),
        );
        if (incompleteKeys.size === 0) return null;
        // カラー診断を最優先（写真→顔AI自動診断に活用できるため）
        const ordered: Array<{ key: string; label: string; cta: string; view: ViewId }> = [
            { key: "color", label: "パーソナルカラーを診断しましょう", cta: "カラー診断へ", view: "color" },
            { key: "face", label: "顔の特徴を入力しましょう", cta: "顔の入力へ", view: "face" },
            { key: "body", label: "体型を計測しましょう", cta: "計測をはじめる", view: "body" },
            { key: "hair", label: "髪質を設定しましょう", cta: "髪質を設定", view: "dashboard" },
            { key: "sns", label: "アバター写真を設定しましょう", cta: "写真を設定", view: "color" },
        ];
        return ordered.find((a) => incompleteKeys.has(a.key)) ?? null;
    }, [phenotypeSections]);

    const getCategoryStatus = (key: string) => {
        const section = phenotypeSections.find((s) => s.key === key);
        return section?.ready ?? false;
    };

    const getCategorySummary = (key: string) => {
        switch (key) {
            case "face":
                return faceCompletedCategories.length > 0
                    ? `${faceCompletedCategories.length}/5 カテゴリ完了`
                    : "5カテゴリの入力が必要";
            case "body":
                return measurementCount > 0
                    ? `${measurementCount}項目入力${derivedWidthSize ? ` / ${formatShoeWidthCode(derivedWidthSize as any)}` : ""}`
                    : "計測データ未入力";
            case "color":
                return colorSeasonLabel !== "未判定"
                    ? `${colorSeasonLabel}${fusionPreview ? ` / ${formatPercent(fusionPreview.confidence)}` : ""}`
                    : "未診断";
            default:
                return "";
        }
    };

    return (
        <motion.div
            key="dashboard"
            className="max-w-2xl mx-auto px-4 sm:px-6 py-4 pb-32 space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
            {/* Compact Hero */}
            <GlassCard className="p-5">
                <div className="flex items-center gap-4">
                    {/* Avatar with progress ring */}
                    <div className="relative flex-shrink-0">
                        <svg width="72" height="72" className="-rotate-90 absolute -inset-[4px] pointer-events-none" viewBox="0 0 80 80">
                            <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="3" />
                            <motion.circle
                                cx="40" cy="40" r="36" fill="none" stroke="url(#dashProgress)" strokeWidth="3"
                                strokeLinecap="round"
                                strokeDasharray={36 * 2 * Math.PI}
                                initial={{ strokeDashoffset: 36 * 2 * Math.PI }}
                                animate={{ strokeDashoffset: 36 * 2 * Math.PI * (1 - phenotypeProgress / 100) }}
                                transition={{ duration: 1.2, ease: "easeOut" }}
                            />
                            <defs>
                                <linearGradient id="dashProgress" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#8b5cf6" />
                                    <stop offset="100%" stopColor="#ec4899" />
                                </linearGradient>
                            </defs>
                        </svg>
                        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-lg">
                            {profileOverviewImage ? (
                                <img src={profileOverviewImage} alt="avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-violet-100 to-fuchsia-50 flex items-center justify-center text-2xl">
                                    🧬
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-black text-slate-900">{phenotypeProgress}%</span>
                            <span className="text-xs font-bold text-slate-400">完成</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                            {seasonVisual && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-white/90 border border-slate-100 px-2.5 py-0.5 text-xs font-black text-slate-700 shadow-sm">
                                    {seasonVisual.emoji} {seasonVisual.label}
                                </span>
                            )}
                            {activeUndertone && (
                                <span className="rounded-full bg-white/90 border border-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500 shadow-sm">
                                    {undertoneLabelJa(activeUndertone)}
                                </span>
                            )}
                            {eyeTypeLabel !== "未入力" && (
                                <span className="rounded-full bg-white/90 border border-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500 shadow-sm">
                                    {eyeTypeLabel}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </GlassCard>

            {/* Category Cards */}
            {CATEGORY_CONFIG.map((cat, i) => {
                const ready = getCategoryStatus(cat.key);
                const summary = getCategorySummary(cat.key);
                const isNextTarget = nextAction?.key === cat.key;
                return (
                    <motion.div
                        key={cat.key}
                        className="relative"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }}
                    >
                        {/* Highlight glow for next-action target */}
                        {isNextTarget && (
                            <motion.div
                                className="absolute -inset-[2px] rounded-[1.25rem] pointer-events-none z-0"
                                style={{
                                    background: "linear-gradient(135deg, #8b5cf6, #ec4899, #8b5cf6)",
                                    backgroundSize: "200% 200%",
                                }}
                                animate={{
                                    backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                                    opacity: [0.5, 0.8, 0.5],
                                }}
                                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                            />
                        )}
                        <button
                            type="button"
                            onClick={() => onNavigate(cat.view)}
                            className="relative w-full text-left z-10"
                        >
                            <GlassCard className={`p-4 hover:shadow-lg transition-shadow ${isNextTarget ? "!border-violet-200 !bg-white" : ""}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${
                                        isNextTarget
                                            ? `bg-gradient-to-br ${cat.activeGradient} text-white shadow-lg`
                                            : `bg-gradient-to-br ${cat.gradient}`
                                    }`}>
                                        {cat.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-sm font-black ${isNextTarget ? "text-violet-900" : "text-slate-900"}`}>{cat.label}</div>
                                        <div className="text-xs text-slate-500 truncate">{summary}</div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {ready ? (
                                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                完了
                                            </span>
                                        ) : isNextTarget ? (
                                            <motion.span
                                                className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-0.5 text-[10px] font-black text-white shadow-md"
                                                animate={{ scale: [1, 1.05, 1] }}
                                                transition={{ duration: 2, repeat: Infinity }}
                                            >
                                                おすすめ
                                            </motion.span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500">
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />
                                                未完了
                                            </span>
                                        )}
                                        <svg className={`w-4 h-4 ${isNextTarget ? "text-violet-400" : "text-slate-300"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </div>
                            </GlassCard>
                        </button>
                    </motion.div>
                );
            })}

            {/* Hair Inline Section */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            >
                <HairInlineSection avatarProfile={avatarProfile} onHairSaved={onHairSaved} />
            </motion.div>

            {/* Next Action CTA */}
            {nextAction && (
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                    <div className="relative overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-violet-600 via-fuchsia-600 to-violet-700 p-5 shadow-xl shadow-violet-500/20">
                        {/* Ambient glow */}
                        <motion.div
                            className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 blur-2xl"
                            animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.5, 0.3] }}
                            transition={{ duration: 4, repeat: Infinity }}
                        />
                        <div className="relative">
                            <div className="flex items-center gap-2 mb-2">
                                <motion.span
                                    className="text-lg"
                                    animate={{ scale: [1, 1.15, 1] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                >
                                    🎯
                                </motion.span>
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">次にやること</span>
                            </div>
                            <div className="text-base font-black text-white">{nextAction.label}</div>
                            <div className="mt-3">
                                <motion.button
                                    type="button"
                                    onClick={() => onNavigate(nextAction.view)}
                                    className="rounded-xl bg-white px-5 py-2.5 text-sm font-black text-violet-700 shadow-lg hover:shadow-xl transition-shadow"
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                >
                                    {nextAction.cta} →
                                </motion.button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
}
