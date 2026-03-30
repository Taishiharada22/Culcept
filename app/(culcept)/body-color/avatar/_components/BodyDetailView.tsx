"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Script from "next/script";
import { GlassCard, GlassButton, GlassBadge } from "@/components/ui/glassmorphism-design";
import BodyProfileWizard from "@/components/body/BodyProfileWizard";
import MeasurementHistoryTimeline from "@/components/body/MeasurementHistoryTimeline";
import { formatShoeWidthCode } from "@/lib/shoeWidth";
import type { ViewId } from "./shared/types";
import { ScrollReveal } from "./shared/visuals";

interface BodyDetailViewProps {
    measurements: Record<string, string>;
    cfv: Record<string, string>;
    derivedWidthSize: string;
    avatarAssets: Record<string, string>;
    error: string | null;
    message: string | null;
    saving: boolean;
    onBodyWizardSaved: (payload: {
        bodyProfile?: {
            cfv?: Record<string, number>;
            display_labels?: Record<string, unknown>;
        } | null;
        measurement?: Record<string, number> | null;
    }) => void;
    onSave: () => void;
    onNavigateBack: () => void;
}

export default function BodyDetailView({
    measurements,
    cfv,
    derivedWidthSize,
    avatarAssets,
    error,
    message,
    saving,
    onBodyWizardSaved,
    onSave,
    onNavigateBack,
}: BodyDetailViewProps) {
    const measuredCount = Object.keys(measurements).filter((k) => measurements[k]).length;

    return (
        <motion.div
            key="body-detail"
            className="max-w-6xl mx-auto px-4 sm:px-6 py-4 pb-32 space-y-6"
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
            {/* Back button */}
            <button
                type="button"
                onClick={onNavigateBack}
                className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
                ダッシュボードに戻る
            </button>

            {/* Visual header */}
            <ScrollReveal>
                <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-50 via-teal-50 to-white p-6 border border-emerald-100/50">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-emerald-200/30 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
                    <div className="relative flex items-center gap-4">
                        <motion.div
                            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-2xl shadow-lg shadow-emerald-500/20"
                            animate={{ rotate: [0, -5, 5, 0] }}
                            transition={{ duration: 4, repeat: Infinity }}
                        >📏</motion.div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500">Body Phenotype</div>
                            <div className="text-lg font-black text-slate-900">体型・計測データ</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                                {measuredCount > 0
                                    ? `${measuredCount}項目入力済み`
                                    : "ISO 8559-1準拠の計測データで、フィッティング精度を最大化"}
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 flex gap-1 flex-wrap">
                        {["stature", "chest_circ", "waist_circ", "hip_circ", "shoulder_breadth", "inseam"].map((key) => (
                            <span key={key} className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${measurements[key] ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                                {key.replace(/_/g, " ")}
                            </span>
                        ))}
                    </div>
                </div>
            </ScrollReveal>

            {error === "ログインが必要です" && (
                <GlassCard className="p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-lg font-bold text-slate-900">ログインが必要です</div>
                            <div className="text-sm text-slate-500">アバター入力はログイン後に利用できます。</div>
                        </div>
                        <GlassButton href="/login?next=/body-color/avatar?view=body" variant="gradient">ログイン</GlassButton>
                    </div>
                </GlassCard>
            )}

            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-6">
                    <BodyProfileWizard embedded onSaved={onBodyWizardSaved} />
                </div>
                <div className="space-y-4">
                    {/* 3D Preview */}
                    {avatarAssets.mesh_glb_url && (
                        <>
                            <Script
                                type="module"
                                src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"
                            />
                            <GlassCard className="p-6">
                                <h2 className="text-sm font-black text-slate-900 mb-3">3Dプレビュー</h2>
                                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                                    {/* @ts-expect-error model-viewer is a web component */}
                                    <model-viewer
                                        src={avatarAssets.mesh_glb_url}
                                        alt="avatar 3d"
                                        auto-rotate camera-controls shadow-intensity="0.3" exposure="0.9" environment-image="neutral"
                                        style={{ width: "100%", height: "360px", background: "linear-gradient(180deg,#f8fafc,#eef2ff)" }}
                                    />
                                </div>
                            </GlassCard>
                        </>
                    )}

                    {/* Save + Next */}
                    <GlassCard className="p-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-black text-slate-900">体型プロフィールを保存</div>
                                {message && <div className="mt-2 text-sm text-emerald-600">{message}</div>}
                                {error && error !== "ログインが必要です" && <div className="mt-2 text-sm text-rose-600">{error}</div>}
                            </div>
                            <GlassButton onClick={onSave} loading={saving} variant="gradient" size="sm">保存する</GlassButton>
                        </div>
                    </GlassCard>

                    <MeasurementHistoryTimeline />

                    <GlassCard className="p-6">
                        <div className="text-sm font-black text-slate-900 mb-3">次のステップ</div>
                        <div className="flex flex-col gap-2">
                            <Link href="/my-style/body/photo" className="text-sm text-violet-600 font-semibold hover:text-violet-800 transition-colors">全身撮影ガイドで撮り直す →</Link>
                            <Link href="/my-style/diagnosis" className="text-sm text-violet-600 font-semibold hover:text-violet-800 transition-colors">総合診断で似合う服とNGを見る →</Link>
                        </div>
                    </GlassCard>
                </div>
            </div>
        </motion.div>
    );
}
