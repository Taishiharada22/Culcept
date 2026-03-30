"use client";

import Link from "next/link";
import React, { Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type SetStateAction } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useFootprintTracker } from "@/hooks/useFootprintTracker";
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
import SparkleEffect, { useSparkle } from "./_components/SparkleEffect";
import type { CrossFeatureData } from "./_components/CrossFeaturePanel";
import MyStyleHero from "./_components/MyStyleHero";
import ShowcaseRail from "./_components/ShowcaseRail";
import WorkspaceBand from "./_components/WorkspaceBand";
import StyleDNA from "./_components/StyleDNAPanel";
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
const OnboardingWizard = dynamic(() => import("./_components/OnboardingWizard"), {
    ssr: false,
    loading: () => <LoadingSkeleton height="h-64" />,
});
const OutfitIntelligencePanel = dynamic(() => import("./_components/OutfitIntelligencePanel"), {
    ssr: false,
    loading: () => <LoadingSkeleton height="h-48" />,
});
const MaterialLiteracyPanel = dynamic(() => import("./_components/MaterialLiteracyPanel"), {
    ssr: false,
    loading: () => <LoadingSkeleton height="h-48" />,
});
const FlatLayComposer = dynamic(() => import("./_components/FlatLayComposer"), {
    ssr: false,
    loading: () => <LoadingSkeleton height="h-48" />,
});
const CrossFeaturePanel = dynamic(() => import("./_components/CrossFeaturePanel"), {
    ssr: false,
    loading: () => <LoadingSkeleton height="h-40" />,
});
import StyleLogicPanel from "./_components/StyleLogicPanel";
import AIInsightPanel from "./_components/AIInsightPanel";
const StyleJourneyMap = dynamic(() => import("./_components/StyleJourneyMap"), {
    ssr: false,
    loading: () => <LoadingSkeleton height="h-56" />,
});
const ResonanceFeed = dynamic(() => import("./_components/ResonanceFeed"), {
    ssr: false,
    loading: () => <LoadingSkeleton height="h-48" />,
});
const EcosystemInsightsPanel = dynamic(() => import("./_components/EcosystemInsightsPanel"), {
    ssr: false,
    loading: () => <LoadingSkeleton height="h-48" />,
});
const EngagementHub = dynamic(() => import("./_components/EngagementHub"), {
    ssr: false,
    loading: () => <LoadingSkeleton height="h-64" label="Daily Briefing" />,
});
const ObservationLogButton = dynamic(() => import("./_components/ObservationLogButton"), {
    ssr: false,
});
const CostPerWearDashboard = dynamic(() => import("./_components/CostPerWearDashboard"), {
    ssr: false,
    loading: () => <LoadingSkeleton height="h-48" />,
});

/* ── Lib imports ── */
import { isOnline, enqueueSync, processSyncQueue, cleanStaleSyncItems } from "./_lib/offlineManager";
import { cacheState } from "./_lib/stateCache";
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

/* ─────────────────────── Wardrobe Overview Tab ─────────────────────── */

const WardrobeOverviewTab = React.memo(function WardrobeOverviewTab({
    state,
    setState,
    band,
    onAddToSetup,
    onSelectItem,
    pushNotice,
}: {
    state: SavedState;
    setState: (updater: SetStateAction<SavedState>) => void;
    band?: ReactNode;
    onAddToSetup: (itemId: string) => void;
    onSelectItem: (itemId: string) => void;
    pushNotice: (text: string) => void;
}) {
    const derived = useMemo(() => deriveMyStyleSignals(state), [state]);
    const [showIntelligence, setShowIntelligence] = useState(false);
    const [showMaterials, setShowMaterials] = useState(false);

    return (
        <div className="space-y-5">
            {band ? <div>{band}</div> : null}

            {/* Self-forming highlight */}
            {derived.selfFormingItems.length > 0 ? (
                <section className="rounded-2xl border border-amber-200/40 bg-gradient-to-br from-amber-50/60 to-white/90 p-5 shadow-sm">
                    <SectionHeading title="Self-forming Items" sub="あなたの輪郭づくりに最も効いている服" />
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {derived.selfFormingItems.slice(0, 3).map((entry) => {
                            const item = state.wardrobe.find((w) => w.id === entry.itemId);
                            if (!item) return null;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => onSelectItem(item.id)}
                                    className="group flex gap-3 rounded-xl border border-slate-200/60 bg-white/70 p-3 text-left transition hover:border-slate-300 hover:shadow-md"
                                >
                                    <div className="w-16 shrink-0">
                                        <ImageSurface image={item.imageUrl} label={item.name} gradient="from-slate-700 to-slate-900" ratio="aspect-[3/4]" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[13px] font-bold text-slate-900">{item.name}</div>
                                        <div className="mt-0.5 text-[11px] text-slate-500">{CATEGORY_LABELS[item.category]}</div>
                                        <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{buildWardrobeReasonLine(entry, derived)}</p>
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {entry.impressionLabels.slice(0, 2).map((label) => <Badge key={label} tone="sky">{label}</Badge>)}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>
            ) : null}

            {/* Outfit Intelligence & Material toggle */}
            <div className="flex items-center gap-2 mb-2">
                <button
                    type="button"
                    onClick={() => { setShowIntelligence(!showIntelligence); if (!showIntelligence) setShowMaterials(false); }}
                    className={cx(
                        "flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all",
                        showIntelligence
                            ? "bg-orange-500 text-white shadow-md"
                            : "bg-white/80 text-slate-600 border border-slate-200 hover:bg-orange-50 hover:text-orange-600"
                    )}
                >
                    <span>🧠</span>
                    <span>着回し分析</span>
                </button>
                <button
                    type="button"
                    onClick={() => { setShowMaterials(!showMaterials); if (!showMaterials) setShowIntelligence(false); }}
                    className={cx(
                        "flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all",
                        showMaterials
                            ? "bg-teal-500 text-white shadow-md"
                            : "bg-white/80 text-slate-600 border border-slate-200 hover:bg-teal-50 hover:text-teal-600"
                    )}
                >
                    <span>🧵</span>
                    <span>素材図鑑</span>
                </button>
            </div>
            {showIntelligence && (
                <section className="rounded-2xl border border-orange-200/40 bg-gradient-to-br from-orange-50/60 to-white/90 p-4 shadow-sm">
                    <OutfitIntelligencePanel state={state} setState={setState} pushNotice={pushNotice} />
                </section>
            )}
            {showMaterials && (
                <section className="rounded-2xl border border-teal-200/40 bg-gradient-to-br from-teal-50/40 to-white/90 p-4 shadow-sm">
                    <MaterialLiteracyPanel items={state.wardrobe} />
                </section>
            )}

            {/* Wardrobe management (add/edit) */}
            <WardrobeTab state={state} setState={setState} onAddToSetup={onAddToSetup} />

            {/* Cost-per-wear dashboard */}
            {state.wardrobe.length >= 1 && (
                <CostPerWearDashboard wardrobeItems={state.wardrobe} />
            )}
        </div>
    );
});

/* ─────────────────────── Main Page ─────────────────────── */

export default function MyStylePage() {
    useFootprintTracker({ feature: "my-style" });
    const searchParams = useSearchParams();
    const [initialBundle] = useState(() => (typeof window === "undefined" ? { state: normalizeSavedState({}), recoveryMessage: null } : loadStateBundle()));
    const [state, rawSetState] = useState<SavedState>(initialBundle.state);
    const [tab, setTab] = useState<TabId>("today");
    const [identityMode, setIdentityMode] = useState<IdentityMode>("iam");
    const [notice, setNotice] = useState<string | null>(initialBundle.recoveryMessage);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
    const [syncedAt, setSyncedAt] = useState<string | null>(null);
    const [setupComposerItemIds, setSetupComposerItemIds] = useState<string[]>([]);
    const [setupComposerOpen, setSetupComposerOpen] = useState(false);
    const [swipeLearningState] = useState(() => typeof window === "undefined" ? null : loadLearningState());
    const [showOnboarding, setShowOnboarding] = useState(() => typeof window === "undefined" ? false : isEmptyState(initialBundle.state));
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
        setTab("setups");
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
    };

    // Persist to localStorage + IndexedDB cache
    useEffect(() => {
        const snapshot = createPortableStateSnapshot(state);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
            if (hasMeaningfulState(state)) localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(snapshot));
        } catch { /* ignore */ }
        // Also cache to IndexedDB for large wardrobes
        void cacheState("my-style-state", snapshot);
    }, [state]);

    // Clean stale sync items on mount
    useEffect(() => { cleanStaleSyncItems(); }, []);

    // Tab from URL
    useEffect(() => { const t = normalizeTabId(searchParams.get("tab")); if (t) setTab(t); }, [searchParams]);
    useEffect(() => { const url = new URL(window.location.href); url.searchParams.set("tab", tab); window.history.replaceState({}, "", `${url.pathname}${url.search}`); }, [tab]);

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
    useEffect(() => {
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
    }, [state]);

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
    const [showDna, setShowDna] = useState(false);
    const { sparkling, sparkle, onComplete: onSparkleComplete } = useSparkle();
    const closeActiveItem = () => setActiveItemId(null);

    useEffect(() => {
        if (tab !== "wardrobe") setActiveItemId(null);
    }, [tab]);

    return (
        <div className="min-h-screen text-slate-900">
            {/* Background orbs */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ contain: "paint" }}>
                <div className="absolute left-[-8%] top-[-5%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,_rgba(250,204,21,0.06),_transparent_70%)]" />
                <div className="absolute right-[-10%] top-[10%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.05),_transparent_70%)]" />
                <div className="absolute bottom-[-15%] left-[30%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,_rgba(16,185,129,0.05),_transparent_70%)]" />
            </div>

            {/* ── Sticky Top Nav ── */}
            <nav className="sticky top-0 z-40 border-b border-white/30 bg-white/80 backdrop-blur-2xl">
                <div className="mx-auto max-w-5xl px-4 sm:px-6">
                    <div className="flex items-center justify-between py-2.5">
                        <div className="flex items-center gap-2.5">
                            <Link href="/my-page" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200/60 bg-white/80 text-slate-400 no-underline transition hover:bg-white">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </Link>
                            <div>
                                <h1 className="text-[15px] font-bold tracking-tight text-slate-900">My Style</h1>
                                <p className="text-[11px] text-slate-400">{activeTabConfig.label} を編集中</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setShowDna((v) => !v)} className="flex items-center gap-1.5 rounded-full border border-slate-200/60 bg-white/60 px-2.5 py-1 text-[11px] font-bold text-slate-500 transition hover:bg-white/90">
                                {derived.coreLanes.length > 0
                                    ? derived.coreLanes.map((l) => <span key={l} className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">{getStyleLaneLabel(l)}</span>)
                                    : <span className="text-slate-400">Style DNA</span>}
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={cx("transition", showDna && "rotate-180")}><path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Expandable DNA detail */}
                {showDna ? (
                    <div className="border-t border-slate-200/40 bg-white/90 backdrop-blur-xl">
                        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
                            <StyleDNA state={state} syncStatus={syncStatus} syncedAt={syncedAt} />
                        </div>
                    </div>
                ) : null}
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
                            <SparkleEffect trigger={!!notice} />
                            <div className="flex items-center gap-2 rounded-xl border border-emerald-200/60 bg-emerald-50/80 px-4 py-2.5 text-[13px] font-medium text-emerald-700 backdrop-blur">
                                <span>✓</span> {notice}
                            </div>
                        </motion.div>
                    ) : null}
                </AnimatePresence>

                <main className="relative mx-auto max-w-5xl px-4 pb-16 pt-5 sm:px-6">
                    {tab !== "today" && (
                        <MyStyleHero
                            state={state}
                            tab={tab}
                            syncStatus={syncStatus}
                            syncedAt={syncedAt}
                            swipeState={swipeLearningState}
                            secondaryPanel={
                                tab === "wardrobe" ? (
                                    <ShowcaseRail state={state} activeItemId={activeItemId} onSelectItem={setActiveItemId} />
                                ) : undefined
                            }
                        />
                    )}

                    <div className="mb-4 mt-5 flex items-start justify-between gap-3">
                        <div className="border-l-2 pl-4" style={{ borderColor: `${activeTabConfig.accentColor}66` }}>
                            <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: activeTabConfig.accentColor }}>{activeTabConfig.personality}</div>
                            <h2 className="mt-1 text-lg font-black tracking-[-0.03em] text-slate-900">{activeTabConfig.label}</h2>
                            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-slate-500">{activeTabConfig.sub}</p>
                        </div>
                        <div className="hidden rounded-xl border border-white/60 bg-white/65 px-3 py-2.5 text-right shadow-sm backdrop-blur lg:block">
                            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Current pull</div>
                            <div className="mt-1 text-[13px] font-bold text-slate-800">{derived.dominantWorldviews[0] ?? derived.dominantImpressions[0] ?? "輪郭を育成中"}</div>
                        </div>
                    </div>

                    {tab !== "wardrobe" && tab !== "today" ? (
                        <div className="mb-5">
                            <WorkspaceBand tab={tab} setTab={setTab} tabBarRef={tabBarRef} />
                        </div>
                    ) : null}

                    <ErrorBoundary>
                      <AnimatePresence mode="popLayout">
                        <motion.div
                            key={tab}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        >
                            {tab === "today" && (
                                <div className="space-y-5">
                                    <WorkspaceBand tab={tab} setTab={setTab} tabBarRef={tabBarRef} />
                                    {state.wardrobe.length >= 1 ? (
                                        <EngagementHub state={state} swipeState={swipeLearningState} />
                                    ) : (
                                        <WardrobeEmptyState onAction={() => setShowQuickAdd(true)} onDemo={triggerDemo} />
                                    )}
                                </div>
                            )}
                            {tab === "wardrobe" && (
                                <WardrobeOverviewTab
                                    state={state}
                                    setState={setState}
                                    band={<WorkspaceBand tab={tab} setTab={setTab} tabBarRef={tabBarRef} />}
                                    onAddToSetup={addItemToSetup}
                                    onSelectItem={setActiveItemId}
                                    pushNotice={pushNotice}
                                />
                            )}
                            {tab === "setups" && (state.wardrobe.length < 2 ? <SetupsEmptyState onAction={() => setShowQuickAdd(true)} onDemo={triggerDemo} /> : <SetupsTab state={state} setState={setState} pushNotice={pushNotice} selectedItemIds={setupComposerItemIds} setSelectedItemIds={setSetupComposerItemIds} showBuilder={setupComposerOpen} setShowBuilder={setSetupComposerOpen} />)}
                            {tab === "styles" && <StylesTab state={state} setState={setState} pushNotice={pushNotice} />}
                            {tab === "identity" && (state.wardrobe.length < 5 && !swipeLearningState ? <IdentityEmptyState onAction={() => setShowQuickAdd(true)} onDemo={triggerDemo} /> : <IdentityTab state={state} setState={setState} mode={identityMode} setMode={setIdentityMode} pushNotice={pushNotice} crossFeature={crossFeature} bridgePulse={bridgePulse} />)}
                            {tab === "insights" && (state.wardrobe.length < 3 ? <InsightsEmptyState onAction={() => setShowQuickAdd(true)} onDemo={triggerDemo} /> : (
                                <div className="space-y-6">
                                    <InsightsTab state={state} swipeState={swipeLearningState} />
                                    <StyleLogicPanel state={state} />
                                    <AIInsightPanel
                                        state={state}
                                        pcSeason={bridgePulse?.pcSeason}
                                        bodyType={bridgePulse?.bodyType}
                                        archetypeCode={null}
                                    />
                                </div>
                            ))}
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

            {/* Floating action buttons */}
            {!showOnboarding && (
                <>
                    <FloatingActions
                        showPhotoAdd={showPhotoAdd}
                        showQuickAdd={showQuickAdd}
                        wardrobeCount={state.wardrobe.length}
                        onPhotoAdd={() => setShowPhotoAdd(true)}
                        onQuickAdd={() => setShowQuickAdd(true)}
                    />
                    {state.wardrobe.length >= 1 && (
                        <ObservationLogButton wardrobeItems={state.wardrobe} />
                    )}
                </>
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
                    <OnboardingWizard
                        onStartAdding={() => { setShowOnboarding(false); setShowQuickAdd(true); }}
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
        </div>
    );
}
