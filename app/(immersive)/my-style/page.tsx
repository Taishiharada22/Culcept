"use client";

import Link from "next/link";
import React, { Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type SetStateAction } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useFootprintTracker } from "@/hooks/useFootprintTracker";
import { useCeoCheck } from "@/hooks/useCeoCheck";
import QuickAccessBar from "@/components/home/QuickAccessBar";
import { HOME_MORE_NAV } from "@/lib/navigation";
import FeatureIntroduction from "@/components/ui/FeatureIntroduction";
import { MY_STYLE_INTRO } from "@/lib/ui/featureIntroConfigs";

/* ── Loading skeleton (shared fallback) ── */
function LoadingSkeleton({ height = "h-40", label }: { height?: string; label?: string }) {
    return (
        <div className={`${height} animate-pulse rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200/40`} role="status" aria-label={label ?? "読み込み中"}>
            <div className="flex h-full items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            </div>
        </div>
    );
}

/* ── Static imports (always visible / above the fold) ── */
import WardrobeTab from "./_components/WardrobeTab";
import { WardrobeEmptyState, SetupsEmptyState, StylesEmptyState, IdentityEmptyState, InsightsEmptyState } from "./_components/EmptyStateCards";
import MyStyleHero from "./_components/MyStyleHero";
import ShowcaseRail from "./_components/ShowcaseRail";
import WorkspaceBand from "./_components/WorkspaceBand";
/* StyleDNA panel removed — integrated into nav chips */
import SetupsTab from "./_components/SetupsTab";
import StylesTab from "./_components/StylesTab";
import IdentityTab from "./_components/IdentityTab";
import InsightsTab from "./_components/InsightsTab";
import NetworkStatusBar from "./_components/NetworkStatusBar";
import FloatingActions from "./_components/FloatingActions";
import ErrorBoundary from "./_components/ErrorBoundary";
import { Badge, SectionHeading, ImageSurface } from "./_components/Primitives";

/* ── Dynamic imports (lazy-loaded, client-only) ── */
const PhotoAddWizard = dynamic(() => import("./_components/PhotoAddWizard"), {
    ssr: false,
    loading: () => <LoadingSkeleton height="h-96" />,
});
const QuickAddWizard = dynamic(() => import("./_components/QuickAddWizard"), {
    ssr: false,
    loading: () => <LoadingSkeleton height="h-96" />,
});
const PhotoOnboarding = dynamic(() => import("./_components/PhotoOnboarding"), {
    ssr: false,
    loading: () => <LoadingSkeleton height="h-64" />,
});
/* OutfitIntelligencePanel — moved out of Closet tab in P5 */
/* MaterialLiteracyPanel — moved out of Closet tab in P5 */
const FlatLayComposer = dynamic(() => import("./_components/FlatLayComposer"), {
    ssr: false,
    loading: () => <LoadingSkeleton height="h-48" />,
});
import SmartEmptyState from "./_components/SmartEmptyState";
import StyleLogicPanel from "./_components/StyleLogicPanel";
import AIInsightPanel from "./_components/AIInsightPanel";
import TodayHero from "./_components/TodayHero";
import TodaysMirror from "./_components/TodaysMirror";
import WeatherOutfitPanel from "./_components/WeatherOutfitPanel";
const AssertionInsightCard = dynamic(() => import("./_components/AssertionInsightCard"), {
    ssr: false,
    loading: () => <LoadingSkeleton height="h-32" />,
});
const ContradictionDialogue = dynamic(() => import("./_components/ContradictionDialogue"), {
    ssr: false,
    loading: () => <LoadingSkeleton height="h-32" />,
});
/* ObservationLogButton — merged into FloatingActions */
/* CostPerWearDashboard — replaced by wear-data sections in P5 */

/* ── Shared domain imports ── */
import { loadAllWearEvents, buildWearSummaries } from "@/lib/shared/wearEvents";

/* ── Lib imports ── */
import { isOnline, enqueueSync, processSyncQueue, cleanStaleSyncItems } from "./_lib/offlineManager";
import { cacheState, loadCachedState } from "./_lib/stateCache";
import { ensureStorageSpace } from "@/lib/stargazer/localStorageHelper";
import { toastVariants } from "./_lib/animations";
import { vibrateLight, vibrateSuccess } from "./_lib/haptics";
import { isEmptyState } from "./_lib/demoData";
import { loadLearningState } from "./_lib/swipeLearningEngine";
import type { SwipeLearningState } from "./_lib/swipeLearningAxes";
import { getStyleLaneLabel } from "./_lib/catalog";
import {
    BACKUP_STORAGE_KEY,
    STORAGE_KEY,
    createPortableStateSnapshot,
    deriveMyStyleSignals,
    finalizeSavedState,
    hasMeaningfulState,
    loadStateBundle,
    normalizeSavedState,
} from "./_lib/state";
import type { SavedState, WardrobeItem } from "./_lib/types";
import {
    type TabId,
    type IdentityMode,
    type SyncStatus,
    type BridgePayload,
    type CrossFeatureData,
    type ItemInsight,
    VALID_TABS,
    CATEGORY_LABELS,
    TAB_CONFIG,
    SHELF_TONES,
    cx,
    uniqueList,
    normalizeTabId,
    getSyncLabel,
    collectSetupTitlesForItem,
    buildWardrobeReasonLine,
} from "./_lib/pageUtils";

/* ── Today tab engines ── */
import { computeStyleDna } from "./_lib/styleDna";
import { detectContradictions } from "./_lib/contradictionDetector";
import { generateAssertions, type AssertionInsight } from "./_lib/assertionEngine";
import { buildAllPersonaProfiles, findCrossPersonaCommon } from "./_lib/personaEngine";

/* ── Analytics helper (fire-and-forget, shared across page) ── */
function trackMyStyle(event: string, metadata?: Record<string, unknown>) {
    try {
        const payload = JSON.stringify({ event, feature: "my-style", metadata: { ...metadata, ts: Date.now() } });
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
            navigator.sendBeacon("/api/stargazer/analytics", new Blob([payload], { type: "application/json" }));
        }
    } catch { /* ignore */ }
}

/* ─────────────────────── Self View Section ─────────────────────── */

const FORMALITY_SCALE: Record<string, number> = { casual: 0.33, smart: 0.66, dress: 1.0 };
const FORMALITY_LABEL: Record<string, string> = { casual: "カジュアル", smart: "きれいめ", dress: "フォーマル" };

const SelfViewSection = React.memo(function SelfViewSection({
    state,
    onToggleDetails,
    detailsOpen,
}: {
    state: SavedState;
    onToggleDetails?: () => void;
    detailsOpen?: boolean;
}) {
    const wearEvents = useMemo(() => loadAllWearEvents(), []);
    const wearMap = useMemo(() => buildWearSummaries(wearEvents), [wearEvents]);
    const eventCount = wearEvents.length;

    /* ── 主軸 (>= 7) ── */
    const axis = useMemo(() => {
        if (eventCount < 7) return null;

        // カテゴリ分布
        const catCount: Record<string, number> = {};
        for (const [, s] of wearMap) {
            const item = state.wardrobe.find(w => w.id === s.itemId);
            if (item) catCount[item.category] = (catCount[item.category] ?? 0) + s.count;
        }
        const topCat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0];

        // フォーマリティ平均
        const formalityVals: number[] = [];
        for (const ev of wearEvents) {
            for (const id of ev.itemIds) {
                const item = state.wardrobe.find(w => w.id === id);
                if (item?.formality && FORMALITY_SCALE[item.formality]) {
                    formalityVals.push(FORMALITY_SCALE[item.formality]);
                }
            }
        }
        const avgFormality = formalityVals.length > 0
            ? formalityVals.reduce((a, b) => a + b, 0) / formalityVals.length
            : null;
        const formalityLabel = avgFormality !== null
            ? avgFormality >= 0.8 ? "フォーマル寄り"
            : avgFormality >= 0.55 ? "きれいめ中心"
            : avgFormality >= 0.4 ? "カジュアルときれいめの間"
            : "カジュアル中心"
            : null;

        // よく着る色
        const colorCount: Record<string, number> = {};
        for (const [, s] of wearMap) {
            const item = state.wardrobe.find(w => w.id === s.itemId);
            if (item?.colorName) colorCount[item.colorName] = (colorCount[item.colorName] ?? 0) + s.count;
        }
        const topColors = Object.entries(colorCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name);

        return { topCat, formalityLabel, topColors };
    }, [eventCount, wearEvents, wearMap, state.wardrobe]);

    /* ── 変化検出 (>= 14, diff >= 0.15) ── */
    const change = useMemo(() => {
        if (eventCount < 14) return null;
        const half = Math.floor(eventCount / 2);
        // events are sorted newest-first, so second half (older) = events.slice(half)
        const recentEvents = wearEvents.slice(0, half);
        const olderEvents = wearEvents.slice(half);

        function avgFormality(events: typeof wearEvents) {
            const vals: number[] = [];
            for (const ev of events) {
                for (const id of ev.itemIds) {
                    const item = state.wardrobe.find(w => w.id === id);
                    if (item?.formality && FORMALITY_SCALE[item.formality]) {
                        vals.push(FORMALITY_SCALE[item.formality]);
                    }
                }
            }
            return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        }

        const recentAvg = avgFormality(recentEvents);
        const olderAvg = avgFormality(olderEvents);
        if (recentAvg === null || olderAvg === null) return null;
        const diff = recentAvg - olderAvg;
        if (Math.abs(diff) < 0.15) return null;

        const direction = diff > 0 ? "きれいめ方向" : "カジュアル方向";
        return { diff, direction };
    }, [eventCount, wearEvents, state.wardrobe]);

    /* ── 広げたい方向 ── */
    const expandDirections = useMemo(() => {
        return state.styleSelections
            .filter(s => s.bucket === "rare" || s.bucket === "secret")
            .slice(0, 4)
            .map(s => ({ code: s.laneCode, label: getStyleLaneLabel(s.laneCode), bucket: s.bucket }));
    }, [state.styleSelections]);

    /* ── 気づき ── */
    const insights = useMemo(() => {
        const list: { icon: string; text: string }[] = [];
        if (eventCount < 7) return list;

        // 着るカテゴリの偏り
        const catSet = new Set<string>();
        for (const [, s] of wearMap) {
            const item = state.wardrobe.find(w => w.id === s.itemId);
            if (item) catSet.add(item.category);
        }
        if (catSet.size <= 2 && state.wardrobe.length >= 5) {
            list.push({ icon: "💡", text: "着ているカテゴリが少なめ。持っている服を広く使うと新しい発見があるかも" });
        }

        // 満足度の傾向
        const rated = wearEvents.filter(e => e.satisfaction != null);
        if (rated.length >= 5) {
            const avg = rated.reduce((s, e) => s + (e.satisfaction ?? 0), 0) / rated.length;
            if (avg >= 4) {
                list.push({ icon: "✨", text: "満足度が高め。今の着こなしが自分に合っている証拠です" });
            } else if (avg <= 2.5) {
                list.push({ icon: "🔍", text: "満足度がやや低め。組み合わせや気分に合った服を試してみて" });
            }
        }

        // 眠っている服が多い
        const sleepCount = state.wardrobe.filter(item => {
            const s = wearMap.get(item.id);
            if (!s) return true;
            const days = (Date.now() - new Date(s.lastWornAt).getTime()) / 86400000;
            return days > 30;
        }).length;
        if (sleepCount >= 3) {
            list.push({ icon: "💤", text: `${sleepCount}着が30日以上着ていない状態。クローゼットを見直す機会かも` });
        }

        return list.slice(0, 3);
    }, [eventCount, wearEvents, wearMap, state.wardrobe]);

    /* ── Quiet state (< 7) ── */
    // Gate: need enough data for meaningful axis display
    const hasAxisData = eventCount >= 7 && state.wardrobe.length >= 5 && (axis?.formalityLabel || (axis?.topColors && axis.topColors.length > 0));

    if (eventCount < 7 || !hasAxisData) {
        return (
            <div className="space-y-4">
                <div className="rounded-xl border border-slate-200/40 bg-white/70 p-5">
                    <p className="text-[13px] font-bold text-slate-800">あなたの輪郭</p>
                    <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                        着用記録が増えると、あなたのスタイル傾向がここに浮かび上がります
                    </p>
                    <div className="mt-3">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                            <span>{eventCount} / 7 回</span>
                            <span>あと{7 - eventCount}回</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-all duration-500"
                                style={{ width: `${Math.round((eventCount / 7) * 100)}%` }}
                            />
                        </div>
                    </div>
                </div>
                {expandDirections.length > 0 && (
                    <div className="rounded-xl border border-slate-200/40 bg-white/70 p-4">
                        <p className="text-[11px] font-bold text-slate-500 mb-2">広げたい方向</p>
                        <div className="flex flex-wrap gap-1.5">
                            {expandDirections.map(d => (
                                <span key={d.code} className={cx(
                                    "rounded-full px-2.5 py-1 text-[11px] font-medium border",
                                    d.bucket === "rare"
                                        ? "border-sky-200 bg-sky-50 text-sky-700"
                                        : "border-amber-200 bg-amber-50 text-amber-700"
                                )}>
                                    {d.label}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    /* ── Main view (>= 7) ── */
    return (
        <div className="space-y-4">
            {/* 着こなし傾向 */}
            <div className="rounded-xl border border-slate-200/40 bg-white/70 p-5">
                <p className="text-[13px] font-bold text-slate-800">着こなし傾向</p>
                <div className="mt-3 space-y-2">
                    {axis?.formalityLabel && (
                        <div className="flex items-center gap-2">
                            <span className="shrink-0 text-[10px] font-bold text-slate-400 w-16">テイスト</span>
                            <span className="text-[12px] text-slate-700">{axis.formalityLabel}</span>
                        </div>
                    )}
                    {axis?.topCat && (
                        <div className="flex items-center gap-2">
                            <span className="shrink-0 text-[10px] font-bold text-slate-400 w-16">よく着る</span>
                            <span className="text-[12px] text-slate-700">{CATEGORY_LABELS[axis.topCat[0] as keyof typeof CATEGORY_LABELS] ?? axis.topCat[0]}</span>
                        </div>
                    )}
                    {axis?.topColors && axis.topColors.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="shrink-0 text-[10px] font-bold text-slate-400 w-16">色</span>
                            <span className="text-[12px] text-slate-700">{axis.topColors.join("・")}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* 変化 (>= 14 + diff >= 0.15) */}
            {change && (
                <div className="rounded-xl border border-teal-200/50 bg-teal-50/40 p-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm">↗</span>
                        <p className="text-[12px] font-bold text-teal-800">変化の兆し</p>
                    </div>
                    <p className="mt-1 text-[11px] text-teal-700 leading-relaxed">
                        最近の着用は<span className="font-bold">{change.direction}</span>にシフトしています
                    </p>
                </div>
            )}

            {/* 広げたい方向 */}
            {expandDirections.length > 0 && (
                <div className="rounded-xl border border-slate-200/40 bg-white/70 p-4">
                    <p className="text-[11px] font-bold text-slate-500 mb-2">広げたい方向</p>
                    <div className="flex flex-wrap gap-1.5">
                        {expandDirections.map(d => (
                            <span key={d.code} className={cx(
                                "rounded-full px-2.5 py-1 text-[11px] font-medium border",
                                d.bucket === "rare"
                                    ? "border-sky-200 bg-sky-50 text-sky-700"
                                    : "border-amber-200 bg-amber-50 text-amber-700"
                            )}>
                                {d.label}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* 気づき */}
            {insights.length > 0 && (
                <div className="space-y-2">
                    <p className="text-[11px] font-bold text-slate-500">気づき</p>
                    {insights.map((ins, i) => (
                        <div key={i} className="rounded-xl border border-slate-200/40 bg-white/70 p-3 flex items-start gap-2">
                            <span className="text-sm shrink-0">{ins.icon}</span>
                            <p className="text-[11px] text-slate-600 leading-relaxed">{ins.text}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* つながる導線 */}
            <div className="grid grid-cols-2 gap-2">
                <Link href="/rendezvous" onClick={() => trackMyStyle("mystyle_rendezvous_bridge")} className="group rounded-xl border border-slate-200/40 bg-white/70 p-3 transition hover:bg-white/90 hover:shadow-sm">
                    <div className="flex items-center gap-2">
                        <span className="text-base">🤝</span>
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-slate-700">合う人を探す</p>
                            <p className="text-[9px] text-slate-400 truncate">スタイルで出会う</p>
                        </div>
                    </div>
                </Link>
                <Link href="/genome-card" className="group rounded-xl border border-slate-200/40 bg-white/70 p-3 transition hover:bg-white/90 hover:shadow-sm">
                    <div className="flex items-center gap-2">
                        <span className="text-base">🧬</span>
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-slate-700">カードに反映</p>
                            <p className="text-[9px] text-slate-400 truncate">Genome Card</p>
                        </div>
                    </div>
                </Link>
            </div>

            {/* 詳細 (折りたたみ) */}
            {onToggleDetails && (
                <button
                    type="button"
                    onClick={onToggleDetails}
                    className="w-full rounded-xl border border-slate-200/40 bg-white/60 px-4 py-2.5 text-left text-[11px] font-medium text-slate-500 transition hover:bg-white/80 flex items-center justify-between"
                >
                    <span>詳細な分析を見る</span>
                    <motion.svg
                        width="12" height="12" viewBox="0 0 12 12" fill="none"
                        animate={{ rotate: detailsOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </motion.svg>
                </button>
            )}
        </div>
    );
});

/* ─────────────────────── Me Tab Content ─────────────────────── */

const MeTabContent = React.memo(function MeTabContent({
    state,
    setState,
    pushNotice,
    identityMode,
    setIdentityMode,
    crossFeature,
    bridgePulse,
    swipeLearningState,
    onQuickAdd,
    onDemo,
}: {
    state: SavedState;
    setState: (updater: SetStateAction<SavedState>) => void;
    pushNotice: (text: string) => void;
    identityMode: IdentityMode;
    setIdentityMode: (m: IdentityMode) => void;
    crossFeature: CrossFeatureData | null;
    bridgePulse: BridgePayload["pulse"] | null;
    swipeLearningState: SwipeLearningState | null;
    onQuickAdd: () => void;
    onDemo: () => void;
}) {
    const [detailsOpen, setDetailsOpen] = useState(false);

    return (
        <div className="space-y-6">
            {/* Primary: Self View */}
            <SelfViewSection
                state={state}
                onToggleDetails={() => setDetailsOpen(v => !v)}
                detailsOpen={detailsOpen}
            />

            {/* Collapsible detail panels */}
            <AnimatePresence>
                {detailsOpen && (
                    <motion.div
                        key="me-details"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="space-y-6 pt-2">
                            <StylesTab state={state} setState={setState} pushNotice={pushNotice} />

                            <div className="border-t border-slate-200/40 pt-6">
                                {state.wardrobe.length < 5 && !swipeLearningState
                                    ? <IdentityEmptyState onAction={onQuickAdd} onDemo={onDemo} />
                                    : <IdentityTab state={state} setState={setState} pushNotice={pushNotice} crossFeature={crossFeature} bridgePulse={bridgePulse} />
                                }
                            </div>

                            {state.wardrobe.length >= 3 && (
                                <div className="border-t border-slate-200/40 pt-6 space-y-6">
                                    <InsightsTab state={state} swipeState={swipeLearningState} />
                                    <StyleLogicPanel state={state} />
                                    <AIInsightPanel
                                        state={state}
                                        pcSeason={bridgePulse?.pcSeason}
                                        bodyType={bridgePulse?.bodyType}
                                        archetypeCode={null}
                                    />
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});

/* ─────────────────────── Wardrobe Overview Tab ─────────────────────── */

const WardrobeOverviewTab = React.memo(function WardrobeOverviewTab({
    state,
    setState,
    onAddToSetup,
    onSelectItem,
    pushNotice,
}: {
    state: SavedState;
    setState: (updater: SetStateAction<SavedState>) => void;
    onAddToSetup: (itemId: string) => void;
    onSelectItem: (itemId: string) => void;
    pushNotice: (text: string) => void;
}) {
    /* ── Wear data ── */
    const wearEvents = useMemo(() => loadAllWearEvents(), []);
    const wearMap = useMemo(() => buildWearSummaries(wearEvents), [wearEvents]);

    const mostWorn = useMemo(() => {
        return state.wardrobe
            .map(item => ({ item, count: wearMap.get(item.id)?.count ?? 0 }))
            .filter(x => x.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    }, [state.wardrobe, wearMap]);

    const sleeping = useMemo(() => {
        const now = Date.now();
        return state.wardrobe
            .map(item => {
                const summary = wearMap.get(item.id);
                const daysSince = summary?.lastWornAt
                    ? Math.floor((now - new Date(summary.lastWornAt).getTime()) / 86400000)
                    : Infinity;
                return { item, daysSince };
            })
            .filter(x => x.daysSince > 30)
            .sort((a, b) => b.daysSince - a.daysSince)
            .slice(0, 5);
    }, [state.wardrobe, wearMap]);

    /* ── Missing piece ── */
    const missingPiece = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const item of state.wardrobe) counts[item.category] = (counts[item.category] ?? 0) + 1;
        const essentials: { cat: string; label: string; why: string }[] = [
            { cat: "outerwear", label: "アウター", why: "気温変化に対応しやすくなる" },
            { cat: "tops", label: "トップス", why: "着回しの幅が広がる" },
            { cat: "bottoms", label: "ボトムス", why: "コーデの土台が安定する" },
            { cat: "shoes", label: "靴", why: "足元が変わると印象が変わる" },
        ];
        const weakest = essentials
            .map(e => ({ ...e, count: counts[e.cat] ?? 0 }))
            .sort((a, b) => a.count - b.count)[0];
        if (!weakest || weakest.count >= 3) return null;
        return weakest;
    }, [state.wardrobe]);

    // Track gap-shown event
    useEffect(() => {
        if (missingPiece) trackMyStyle("mystyle_gap_shown", { gap_category: missingPiece.cat });
    }, [missingPiece]);

    const totalWears = wearEvents.length;
    const categoryCount = new Set(state.wardrobe.map(i => i.category)).size;

    return (
        <div className="space-y-4">
            {/* ── Summary Bar ── */}
            <div className="flex items-center gap-4 rounded-xl bg-white/70 border border-slate-200/40 px-4 py-2.5">
                <span className="text-[13px] font-bold text-slate-800">{state.wardrobe.length}<span className="text-slate-400 font-normal text-[11px] ml-0.5">着</span></span>
                <span className="text-[13px] font-bold text-slate-800">{totalWears}<span className="text-slate-400 font-normal text-[11px] ml-0.5">回着用</span></span>
                <span className="text-[13px] font-bold text-slate-800">{categoryCount}<span className="text-slate-400 font-normal text-[11px] ml-0.5">カテゴリ</span></span>
            </div>

            {/* ── よく着る服 ── */}
            {mostWorn.length > 0 && (
                <section>
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">よく着る服</p>
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                        {mostWorn.map(({ item, count }) => (
                            <button key={item.id} type="button" onClick={() => onSelectItem(item.id)} className="shrink-0 w-16 text-center group">
                                <div className="relative overflow-hidden rounded-lg border border-slate-200/50 transition group-hover:border-slate-300 group-hover:shadow-md">
                                    {item.imageUrl ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img src={item.imageUrl} alt={item.name} className="w-full aspect-square object-cover" />
                                    ) : (
                                        <div className="w-full aspect-square flex items-center justify-center" style={{ backgroundColor: item.colorHex ?? "#e2e8f0" }}>
                                            <span className="text-white/80 text-[10px]">{CATEGORY_LABELS[item.category]}</span>
                                        </div>
                                    )}
                                    <span className="absolute top-0.5 right-0.5 rounded-full bg-slate-900/70 px-1.5 py-0.5 text-[9px] font-bold text-white">{count}</span>
                                </div>
                                <p className="mt-0.5 truncate text-[9px] text-slate-500">{item.name}</p>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {/* ── 最近着てない服 ── */}
            {sleeping.length > 0 && (
                <section>
                    <p className="text-[11px] font-bold text-amber-600 uppercase tracking-widest mb-2">最近着てない服</p>
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                        {sleeping.map(({ item, daysSince }) => (
                            <button key={item.id} type="button" onClick={() => onSelectItem(item.id)} className="shrink-0 w-16 text-center group">
                                <div className="relative overflow-hidden rounded-lg border border-slate-200/50 opacity-60 transition group-hover:opacity-100 group-hover:shadow-md">
                                    {item.imageUrl ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img src={item.imageUrl} alt={item.name} className="w-full aspect-square object-cover" />
                                    ) : (
                                        <div className="w-full aspect-square flex items-center justify-center" style={{ backgroundColor: item.colorHex ?? "#e2e8f0" }}>
                                            <span className="text-white/80 text-[10px]">{CATEGORY_LABELS[item.category]}</span>
                                        </div>
                                    )}
                                    <span className="absolute top-0.5 right-0.5 rounded-full bg-amber-500/80 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                        {daysSince === Infinity ? "未" : `${daysSince}日`}
                                    </span>
                                </div>
                                <p className="mt-0.5 truncate text-[9px] text-slate-500">{item.name}</p>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {/* ── カテゴリ別 (WardrobeTab) ── */}
            <WardrobeTab state={state} setState={setState} onAddToSetup={onAddToSetup} />

            {/* ── 足りない1点 ── */}
            {missingPiece && (
                <div className="rounded-xl border border-indigo-200/40 bg-indigo-50/40 p-3">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-indigo-700">足りない1点</span>
                        <span className="text-[10px] text-slate-400">|</span>
                        <p className="text-[12px] text-slate-600">
                            <span className="font-bold">{missingPiece.label}</span>
                            {missingPiece.count === 0 ? "がまだありません" : `は${missingPiece.count}着のみ`}
                            — {missingPiece.why}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
});

/* ─────────────────────── Today Tab Content ─────────────────────── */

const TodayTabContent = React.memo(function TodayTabContent({
    state,
    swipeState,
    onFirstAction,
}: {
    state: SavedState;
    swipeState: SwipeLearningState | null;
    onFirstAction?: () => void;
}) {
    const [showContradictionDialogue, setShowContradictionDialogue] = useState(false);

    const styleDna = useMemo(() => computeStyleDna(state, swipeState), [state, swipeState]);
    const contradictions = useMemo(() => detectContradictions(swipeState, state), [state, swipeState]);
    const personas = useMemo(() => buildAllPersonaProfiles(state), [state]);
    const crossPersona = useMemo(() => findCrossPersonaCommon(personas), [personas]);

    const assertions: AssertionInsight[] = useMemo(() => {
        try {
            return generateAssertions({ state, swipeState, styleDna, contradictions, personas, crossPersonaAnalysis: crossPersona });
        } catch { return []; }
    }, [state, swipeState, styleDna, contradictions, personas, crossPersona]);

    return (
        <div className="space-y-3">
            <TodayHero state={state} swipeState={swipeState} onFirstAction={onFirstAction} />

            <WeatherOutfitPanel wardrobeItems={state.wardrobe} />

            <TodaysMirror wardrobeItems={state.wardrobe} styleSelections={state.styleSelections} />

            {assertions.length > 0 && (
                <Suspense fallback={<LoadingSkeleton height="h-32" />}>
                    <AssertionInsightCard insights={assertions} />
                </Suspense>
            )}

            {contradictions.length > 0 && (
                <button
                    type="button"
                    className="w-full rounded-xl border border-amber-200/50 bg-amber-50/50 p-3 text-left"
                    onClick={() => setShowContradictionDialogue(true)}
                >
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">{contradictions.length}個の矛盾</span>
                        <p className="text-[11px] text-amber-700 flex-1">あなたの中にある矛盾が発見されています</p>
                        <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                </button>
            )}

            <AnimatePresence>
                {showContradictionDialogue && contradictions.length > 0 && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                        onClick={() => setShowContradictionDialogue(false)}
                    >
                        <div
                            className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-2xl bg-white shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between p-4 border-b border-slate-100">
                                <h3 className="text-lg font-bold text-slate-900">矛盾の探究</h3>
                                <button onClick={() => setShowContradictionDialogue(false)} className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                                </button>
                            </div>
                            <Suspense fallback={<LoadingSkeleton height="h-32" />}>
                                <div className="p-4">
                                    <ContradictionDialogue contradictions={contradictions} />
                                </div>
                            </Suspense>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
});

/* ─────────────────────── Main Page ─────────────────────── */

export default function MyStylePage() {
    useFootprintTracker({ feature: "my-style" });
    const searchParams = useSearchParams();
    // ── 初期化: SSR/CSR で同じ値を返し hydration mismatch を防ぐ ──
    // localStorage/IndexedDB の読み取りは mount 後の useEffect で行う
    const [initialBundle] = useState(() => {
        if (typeof window === "undefined") return { state: normalizeSavedState({}), recoveryMessage: null };
        return loadStateBundle();
    });
    const [state, rawSetState] = useState<SavedState>(initialBundle.state);
    const [tab, setTab] = useState<TabId>("today");
    const [identityMode, setIdentityMode] = useState<IdentityMode>("iam");
    const [notice, setNotice] = useState<string | null>(null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
    const [syncedAt, setSyncedAt] = useState<string | null>(null);
    const [setupComposerItemIds, setSetupComposerItemIds] = useState<string[]>([]);
    const [setupComposerOpen, setSetupComposerOpen] = useState(false);
    const [swipeLearningState] = useState(() => typeof window === "undefined" ? null : loadLearningState());
    // hydration 安全: SSR では常に false（mount 後に useEffect で更新）
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [hydrated, setHydrated] = useState(false);
    // 復元完了フラグ: true になるまで Bridge POST を禁止
    const [restorationResolved, setRestorationResolved] = useState(false);
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [showPhotoAdd, setShowPhotoAdd] = useState(false);
    const [isDemo, setIsDemo] = useState(false);
    const [crossFeature, setCrossFeature] = useState<CrossFeatureData | null>(null);
    const [bridgePulse, setBridgePulse] = useState<BridgePayload["pulse"]>(null);
    const [activeItemId, setActiveItemId] = useState<string | null>(null);
    const syncTimerRef = useRef<number | null>(null);
    const tabBarRef = useRef<HTMLDivElement>(null);

    const setState = (updater: SetStateAction<SavedState>) => {
        rawSetState((prev) => finalizeSavedState(typeof updater === "function" ? (updater as (current: SavedState) => SavedState)(prev) : updater));
    };
    const pushNotice = (text: string) => { vibrateSuccess(); setNotice(text); };
    const addItemToSetup = (itemId: string) => {
        setSetupComposerItemIds((current) => uniqueList([...current, itemId]));
        setSetupComposerOpen(true);
        setTab("closet");
        pushNotice("セットアップ編集中に追加しました");
    };

    const handleLoadDemo = (demoState: Partial<SavedState>) => {
        setState((prev) => ({ ...prev, ...demoState } as SavedState));
        setIsDemo(true);
        setShowOnboarding(false);
        pushNotice("サンプルデータを読み込みました — いつでもリセットできます");
    };
    const handleResetDemo = () => {
        setState(normalizeSavedState({}));
        setIsDemo(false);
        pushNotice("データをリセットしました");
    };
    const triggerDemo = () => { import("./_lib/demoData").then((m) => handleLoadDemo(m.createDemoState())); };
    const handleItemSave = (item: WardrobeItem) => {
        setState((prev) => ({ ...prev, wardrobe: [...prev.wardrobe, item] }));
        if (isDemo) { setIsDemo(false); }
        trackMyStyle("mystyle_item_added", { category: item.category, has_image: !!item.imageUrl });
    };

    // Persist to localStorage + IndexedDB cache
    // 復元完了前は書き込み禁止（空 state で上書きしない）
    useEffect(() => {
        if (!restorationResolved) return;
        const snapshot = createPortableStateSnapshot(state);
        const json = JSON.stringify(snapshot);
        // Always cache to IndexedDB first (no size limit)
        void cacheState("my-style-state", snapshot);
        // localStorage: try but don't block if quota exceeded — IndexedDB is the primary store
        try {
            localStorage.setItem(STORAGE_KEY, json);
        } catch {
            ensureStorageSpace();
            try {
                localStorage.setItem(STORAGE_KEY, json);
            } catch {
                // Quota still exceeded — rely on IndexedDB as primary store
                // Remove stale localStorage entry to prevent reading outdated data on next load
                try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
                console.warn("[my-style] localStorage quota exceeded — using IndexedDB as primary store");
            }
        }
        // Backup is expendable — write only if quota allows
        if (hasMeaningfulState(state)) {
            try { localStorage.setItem(BACKUP_STORAGE_KEY, json); } catch { /* expendable */ }
        }
    }, [state, restorationResolved]);

    // Clean stale sync items on mount
    useEffect(() => { cleanStaleSyncItems(); }, []);

    // ── Hydration 完了後の初期化 ──
    // SSR と一致させるため、mount 後に localStorage/IndexedDB の状態を反映
    useEffect(() => {
        setHydrated(true);
        // initialBundle のリカバリーメッセージを反映
        if (initialBundle.recoveryMessage) {
            setNotice(initialBundle.recoveryMessage);
        }

        // localStorage から読み込んだ state が空の場合、IndexedDB フォールバック
        if (isEmptyState(initialBundle.state)) {
            void (async () => {
                try {
                    const cached = await loadCachedState<SavedState>("my-style-state");
                    if (cached && !isEmptyState(normalizeSavedState(cached))) {
                        setState(normalizeSavedState(cached));
                        setShowOnboarding(false);
                        pushNotice("IndexedDB からデータを復元しました");
                        setRestorationResolved(true);
                        return;
                    }
                } catch { /* IndexedDB unavailable */ }
                // どちらも空 → onboarding 表示
                setShowOnboarding(isEmptyState(initialBundle.state));
                setRestorationResolved(true);
            })();
        } else {
            // localStorage にデータあり → そのまま
            setShowOnboarding(false);
            setRestorationResolved(true);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Tab from URL
    useEffect(() => { const t = normalizeTabId(searchParams.get("tab")); if (t) setTab(t); }, [searchParams]);
    useEffect(() => { const url = new URL(window.location.href); url.searchParams.set("tab", tab); window.history.replaceState({}, "", `${url.pathname}${url.search}`); }, [tab]);

    // Tab view tracking
    useEffect(() => {
        const eventMap: Record<TabId, string> = { today: "mystyle_today_view", closet: "mystyle_closet_view", me: "mystyle_self_view" };
        const ev = eventMap[tab];
        if (ev) trackMyStyle(ev, { wardrobe_count: state.wardrobe.length });
    }, [tab, state.wardrobe.length]);

    // Notice auto-dismiss
    useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(null), 2800); return () => window.clearTimeout(t); }, [notice]);

    // Remote sync (load)
    useEffect(() => {
        let active = true;
        async function loadRemote() {
            const res = await fetch("/api/my-style/bridge", { cache: "no-store" }).catch(() => null);
            if (!active || !res) return;
            if (res.status === 401) { setSyncStatus("unauthorized"); return; }
            if (!res.ok) return;
            const json = (await res.json().catch(() => null)) as BridgePayload | null;
            if (!active) return;
            setSyncedAt(json?.syncedAt ?? null);
            setSyncStatus(json?.syncedAt ? "synced" : "idle");
            if (json?.crossFeature) setCrossFeature(json.crossFeature);
            if (json?.pulse) setBridgePulse(json.pulse);
            if (!hasMeaningfulState(initialBundle.state) && json?.remoteState && hasMeaningfulState(json.remoteState)) {
                rawSetState(finalizeSavedState(json.remoteState)); setNotice("保存データを読み込みました");
            }
        }
        void loadRemote();
        return () => { active = false; };
    }, [initialBundle.state]);

    // Remote sync (save) — with offline queue fallback
    // 復元完了前は POST を禁止（空 state でサーバーを上書きしない）
    useEffect(() => {
        if (!restorationResolved) return;
        if (!hasMeaningfulState(state)) return;
        if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = window.setTimeout(async () => {
            const payload = { source: "my-style-self-forming-v3", state: createPortableStateSnapshot(state) };
            // If offline, queue for later
            if (!isOnline()) {
                enqueueSync("/api/my-style/bridge", "POST", payload);
                setSyncStatus("error");
                return;
            }
            try {
                setSyncStatus("syncing");
                // Also process any queued items from previous offline period
                void processSyncQueue();
                const res = await fetch("/api/my-style/bridge", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (res.status === 401) { setSyncStatus("unauthorized"); return; }
                if (!res.ok) throw new Error("sync failed");
                const json = (await res.json().catch(() => null)) as BridgePayload | null;
                setSyncedAt(json?.syncedAt ?? new Date().toISOString()); setSyncStatus("synced");
            } catch {
                // Network error — queue for retry
                enqueueSync("/api/my-style/bridge", "POST", payload);
                setSyncStatus("error");
            }
        }, 1500);
        return () => { if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current); };
    }, [state, restorationResolved]);

    const derived = useMemo(() => deriveMyStyleSignals(state), [state]);
    const activeItem = useMemo<ItemInsight | null>(() => {
        if (!activeItemId) return null;
        const item = state.wardrobe.find((entry) => entry.id === activeItemId);
        const signal = derived.selfFormingItems.find((entry) => entry.itemId === activeItemId);
        if (!item || !signal) return null;
        return {
            item,
            setupTitles: collectSetupTitlesForItem(state.setups, item.id),
            reasons: signal.reasons,
            timelinePeriods: signal.timelinePeriods,
            impressionLabels: signal.impressionLabels,
            coreContribution: signal.coreContribution,
            rareContribution: signal.rareContribution,
            secretContribution: signal.secretContribution,
        };
    }, [activeItemId, derived.selfFormingItems, state.setups, state.wardrobe]);
    const activeTabConfig = TAB_CONFIG.find((t) => t.id === tab) ?? TAB_CONFIG[0];
    /* showDna removed — Style DNA expandable removed */
    const closeActiveItem = () => setActiveItemId(null);

    useEffect(() => {
        if (tab !== "closet") setActiveItemId(null);
    }, [tab]);

    return (
        <div className="min-h-screen text-slate-900">
            {/* Background orbs */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ contain: "paint" }}>
                <div className="absolute left-[-8%] top-[-5%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,_rgba(250,204,21,0.06),_transparent_70%)]" />
                <div className="absolute right-[-10%] top-[10%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.05),_transparent_70%)]" />
                <div className="absolute bottom-[-15%] left-[30%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,_rgba(16,185,129,0.05),_transparent_70%)]" />
            </div>

            {/* ── Sticky Top Nav with integrated tabs ── */}
            <nav className="sticky top-0 z-40 border-b border-slate-200/30 bg-white/85 backdrop-blur-2xl">
                <div className="mx-auto max-w-5xl px-3 sm:px-5">
                    <div className="flex items-center gap-3 py-2">
                        <Link href="/calendar" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-400 no-underline transition hover:text-slate-600">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </Link>
                        <h1 className="text-[14px] font-bold text-slate-900 shrink-0">My Style</h1>
                        <div className="flex-1" />
                        <WorkspaceBand tab={tab} setTab={setTab} tabBarRef={tabBarRef} />
                    </div>
                </div>
            </nav>

            {/* ── Network status ── */}
            <NetworkStatusBar />

            {/* ── Tab-specific background + content ── */}
            <div className={cx("relative min-h-[calc(100vh-100px)] transition-colors duration-500", activeTabConfig.bgClass)}>
                {/* Notice toast */}
                <AnimatePresence>
                    {notice ? (
                        <motion.div
                            className="relative mx-auto max-w-5xl px-4 pt-4 sm:px-6"
                            initial={toastVariants.initial}
                            animate={toastVariants.animate}
                            exit={toastVariants.exit}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <div className="flex items-center gap-2 rounded-xl border border-emerald-200/60 bg-emerald-50/80 px-4 py-2.5 text-[13px] font-medium text-emerald-700 backdrop-blur">
                                <span>✓</span> {notice}
                            </div>
                        </motion.div>
                    ) : null}
                </AnimatePresence>

                <main className="relative mx-auto max-w-5xl px-3 pb-16 pt-3 sm:px-5">
                    {tab !== "today" && (
                        <MyStyleHero
                            state={state}
                            tab={tab}
                            syncStatus={syncStatus}
                            syncedAt={syncedAt}
                            swipeState={swipeLearningState}
                            secondaryPanel={
                                tab === "closet" ? (
                                    <ShowcaseRail state={state} activeItemId={activeItemId} onSelectItem={setActiveItemId} />
                                ) : undefined
                            }
                        />
                    )}

                    {/* Section header removed — tab bar is sufficient */}

                    {/* Tab bar is now in sticky nav */}

                    <ErrorBoundary>
                      <AnimatePresence mode="popLayout">
                        <motion.div
                            key={tab}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        >
                            {/* ── Today tab ── */}
                            {tab === "today" && (
                                <div className="space-y-3">
                                    {state.wardrobe.length >= 1 ? (
                                        <TodayTabContent state={state} swipeState={swipeLearningState} onFirstAction={() => setShowQuickAdd(true)} />
                                    ) : (
                                        <SmartEmptyState onAddPhoto={() => setShowPhotoAdd(true)} onQuickAdd={() => setShowQuickAdd(true)} onDemo={triggerDemo} />
                                    )}
                                </div>
                            )}

                            {/* ── Closet tab (wardrobe + setups + cost-per-wear) ── */}
                            {tab === "closet" && (
                                <div className="space-y-6">
                                    <WardrobeOverviewTab
                                        state={state}
                                        setState={setState}
                                        onAddToSetup={addItemToSetup}
                                        onSelectItem={setActiveItemId}
                                        pushNotice={pushNotice}
                                    />
                                    {state.wardrobe.length >= 2 && (
                                        <>
                                            <div className="border-t border-slate-200/40 pt-6">
                                                <h3 className="mb-4 text-[15px] font-black text-slate-900">どう組み合わせる？</h3>
                                                <SetupsTab state={state} setState={setState} pushNotice={pushNotice} selectedItemIds={setupComposerItemIds} setSelectedItemIds={setSetupComposerItemIds} showBuilder={setupComposerOpen} setShowBuilder={setSetupComposerOpen} />
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* ── Me tab (self view + details) ── */}
                            {tab === "me" && (
                                <MeTabContent
                                    state={state}
                                    setState={setState}
                                    pushNotice={pushNotice}
                                    identityMode={identityMode}
                                    setIdentityMode={setIdentityMode}
                                    crossFeature={crossFeature}
                                    bridgePulse={bridgePulse}
                                    swipeLearningState={swipeLearningState}
                                    onQuickAdd={() => setShowQuickAdd(true)}
                                    onDemo={triggerDemo}
                                />
                            )}
                        </motion.div>
                      </AnimatePresence>
                    </ErrorBoundary>
                </main>
            </div>

            {activeItem ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={closeActiveItem}>
                    <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl border border-white/60 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">{activeItem.item.name}</h3>
                                <p className="mt-1 text-[13px] text-slate-500">{CATEGORY_LABELS[activeItem.item.category]} / {activeItem.item.colorName ?? activeItem.item.color}</p>
                            </div>
                            <button type="button" onClick={closeActiveItem} className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                            </button>
                        </div>

                        <div className="mt-4 grid gap-4 sm:grid-cols-[140px_1fr]">
                            <ImageSurface image={activeItem.item.imageUrl} label={activeItem.item.name} gradient="from-slate-700 to-slate-900" />
                            <div className="space-y-3">
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            closeActiveItem();
                                            addItemToSetup(activeItem.item.id);
                                        }}
                                        className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-600 transition hover:bg-indigo-100"
                                    >
                                        セットアップに追加
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {activeItem.coreContribution > 0 ? <Badge tone="emerald">Core {activeItem.coreContribution.toFixed(1)}</Badge> : null}
                                    {activeItem.rareContribution > 0 ? <Badge tone="sky">Rare {activeItem.rareContribution.toFixed(1)}</Badge> : null}
                                    {activeItem.secretContribution > 0 ? <Badge tone="amber">Secret {activeItem.secretContribution.toFixed(1)}</Badge> : null}
                                </div>
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">印象</div>
                                    <div className="mt-1 flex flex-wrap gap-1">{activeItem.impressionLabels.map((label) => <Badge key={label} tone="sky">{label}</Badge>)}</div>
                                </div>
                                {activeItem.setupTitles.length > 0 ? (
                                    <div>
                                        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">セットアップ</div>
                                        <div className="mt-1 text-[13px] text-slate-600">{activeItem.setupTitles.join("、")}</div>
                                    </div>
                                ) : null}
                                <div className="rounded-xl bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-600">
                                    {activeItem.reasons.map((reason) => <div key={reason}>{reason}</div>)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Floating action buttons — unified FAB */}
            {!showOnboarding && (
                <FloatingActions
                    showPhotoAdd={showPhotoAdd}
                    showQuickAdd={showQuickAdd}
                    wardrobeCount={state.wardrobe.length}
                    onPhotoAdd={() => setShowPhotoAdd(true)}
                    onQuickAdd={() => setShowQuickAdd(true)}
                    activeTab={tab}
                />
            )}

            {/* Demo mode banner */}
            {isDemo ? (
                <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2">
                    <div className="flex items-center gap-3 rounded-full border border-amber-300/60 bg-amber-50/95 px-4 py-2 text-sm font-medium text-amber-800 shadow-lg backdrop-blur">
                        <span>🧪 デモモード</span>
                        <button onClick={handleResetDemo} className="rounded-full bg-amber-200/60 px-3 py-0.5 text-xs font-bold text-amber-900 transition hover:bg-amber-300/80">リセット</button>
                    </div>
                </div>
            ) : null}

            {/* Onboarding wizard */}
            {showOnboarding ? (
                <ErrorBoundary fallbackMessage="オンボーディングの表示中にエラーが発生しました">
                    <PhotoOnboarding
                        onSave={handleItemSave}
                        onLoadDemo={handleLoadDemo}
                        onDismiss={() => setShowOnboarding(false)}
                    />
                </ErrorBoundary>
            ) : null}

            {/* Quick-add wizard */}
            {showQuickAdd ? (
                <ErrorBoundary fallbackMessage="アイテム追加の表示中にエラーが発生しました">
                    <QuickAddWizard
                        onSave={handleItemSave}
                        onClose={() => setShowQuickAdd(false)}
                        itemCount={state.wardrobe.length}
                    />
                </ErrorBoundary>
            ) : null}

            {/* Photo-add wizard */}
            {showPhotoAdd ? (
                <ErrorBoundary fallbackMessage="写真追加の表示中にエラーが発生しました">
                    <PhotoAddWizard
                        onSave={handleItemSave}
                        onClose={() => setShowPhotoAdd(false)}
                        itemCount={state.wardrobe.length}
                    />
                </ErrorBoundary>
            ) : null}

            <FeatureIntroduction
                {...MY_STYLE_INTRO}
                tabBarRef={tabBarRef}
                onComplete={(tab) => {
                    if (tab) setTab(tab as TabId);
                }}
            />

            {/* QuickAccess（My Style用 — コーデ/スタイルを入れ替え） */}
            <div className="fixed bottom-0 left-0 right-0 z-40">
                <MyStyleQuickAccess />
            </div>
        </div>
    );
}

/** My Style 用 QuickAccess（スタイル→ホームに置換） */
function MyStyleQuickAccess() {
    const isCeo = useCeoCheck();
    const moreItems = isCeo
        ? [...HOME_MORE_NAV, { href: "/ceo", label: "CEO", icon: "⚙" }]
        : HOME_MORE_NAV;
    const items = [
        { href: "/calendar", label: "コーデ" },
        { href: "/stargazer", label: "観測" },
        { href: "/", label: "ホーム" },
        { href: "/origin", label: "日記" },
        { href: "/rendezvous", label: "出会う" },
    ];
    return <QuickAccessBar items={items} moreItems={moreItems} />;
}
