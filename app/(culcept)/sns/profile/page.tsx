"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useIsAnonymous } from "@/hooks/useIsAnonymous";
import { useRequireBaseline } from "@/hooks/useRequireBaseline";
import AnonymousRegistrationPage from "@/components/auth/AnonymousRegistrationPage";
import {
    LightBackground,
    GlassNavbar,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";
import { TABS, TAB_KEYS, NAV_ITEMS, EASE_OUT_EXPO, cx } from "./_lib/presenceConstants";
import { L } from "./_lib/presenceI18n";
import type { Tab } from "./_lib/presenceTypes";
import { usePresenceData } from "./_hooks/usePresenceData";
import PresenceHero from "./_components/PresenceHero";
import PresenceShareButton from "./_components/PresenceShareButton";
import PresenceWelcome from "./_components/PresenceWelcome";
import ErrorBoundary from "./_components/ErrorBoundary";
import { PresenceCard, TabSkeleton } from "./_components/Primitives";
import SwipeableTabContainer from "@/app/origin/_components/SwipeableTabContainer";
import FeatureIntroduction from "@/components/ui/FeatureIntroduction";
import { PRESENCE_INTRO } from "@/lib/ui/featureIntroConfigs";

/* ── Lazy-loaded tab components ── */

const MirrorTab = dynamic(
    () => import("./_tabs/MirrorTab").then((m) => ({ default: m.MirrorTab })),
    { ssr: false, loading: () => <TabSkeleton /> }
);
const DepthTab = dynamic(
    () => import("./_tabs/DepthTab").then((m) => ({ default: m.DepthTab })),
    { ssr: false, loading: () => <TabSkeleton /> }
);
const ChangeTab = dynamic(
    () => import("./_tabs/ChangeTab").then((m) => ({ default: m.ChangeTab })),
    { ssr: false, loading: () => <TabSkeleton /> }
);
const RelationsTab = dynamic(
    () => import("./_tabs/RelationsTab").then((m) => ({ default: m.RelationsTab })),
    { ssr: false, loading: () => <TabSkeleton /> }
);
const SelfTab = dynamic(
    () => import("./_tabs/SelfTab").then((m) => ({ default: m.SelfTab })),
    { ssr: false, loading: () => <TabSkeleton /> }
);

/* ── Nav items ── */
const navItems = NAV_ITEMS;

/* ════════════════════════════════════════════════════════
   Main Page Component — Orchestrator Shell
   ════════════════════════════════════════════════════════ */

export default function SNSProfilePage() {
    const isAnonymous = useIsAnonymous();
    const baselineStatus = useRequireBaseline();
    const searchParams = useSearchParams();
    const isDemo = searchParams.get("demo") === "1";

    if (isAnonymous === true) {
        return <AnonymousRegistrationPage featureName="Presence" />;
    }
    if (baselineStatus === "loading" || baselineStatus === "redirecting") {
        return null;
    }
    const [tab, setTab] = useState<Tab>("mirror");
    const [retrying, setRetrying] = useState(false);
    const prefersReducedMotion = useReducedMotion();
    const tabContentRef = useRef<HTMLDivElement>(null);
    const tabBarRef = useRef<HTMLDivElement>(null);

    const data = usePresenceData(isDemo);

    const handleTabChange = useCallback((key: Tab | string) => {
        const tabKey = key as Tab;
        setTab(tabKey);
        data.loadTabData(tabKey);
        // Scroll to tab content on change
        tabContentRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? "instant" : "smooth", block: "nearest" });
    }, [data, prefersReducedMotion]);

    const handleRetry = useCallback(async () => {
        setRetrying(true);
        await data.reload();
        setRetrying(false);
    }, [data]);

    /* ── Keyboard navigation for tabs ── */
    const handleTabKeyDown = useCallback((e: React.KeyboardEvent) => {
        const idx = TAB_KEYS.indexOf(tab);
        if (e.key === "ArrowRight" && idx < TAB_KEYS.length - 1) {
            e.preventDefault();
            handleTabChange(TAB_KEYS[idx + 1]);
        } else if (e.key === "ArrowLeft" && idx > 0) {
            e.preventDefault();
            handleTabChange(TAB_KEYS[idx - 1]);
        }
    }, [tab, handleTabChange]);

    const animDuration = prefersReducedMotion ? 0 : 0.2;

    return (
        <LightBackground>
            {/* ── FTUE Welcome ── */}
            <PresenceWelcome />

            {/* ── Navbar ── */}
            <GlassNavbar>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/my-page"
                            aria-label="戻る"
                            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70 bg-white/75 text-base font-bold text-slate-500 no-underline shadow-sm transition hover:bg-white dark:border-slate-700 dark:bg-slate-800/75 dark:text-slate-400"
                        >
                            ←
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold tracking-[-0.03em] text-slate-950 dark:text-white">
                                Presence
                            </h1>
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                他者から見た、あなたの人物像
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <PresenceShareButton />
                        <Link
                            href="/my-style"
                            aria-label="プロフィールを編集"
                            className="rounded-full border border-slate-200 bg-slate-100/90 px-4 py-2 text-xs font-bold text-slate-600 no-underline transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                        >
                            編集
                        </Link>
                    </div>
                </div>
            </GlassNavbar>

            <main className="mx-auto max-w-[920px] px-4 pb-28 pt-24 sm:px-6" data-testid="presence-page">
                {/* ── Loading state ── */}
                {data.loading ? (
                    <div className="flex flex-col items-center gap-3 py-24" role="status" aria-label="読み込み中" data-testid="loading-state">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="h-8 w-8 rounded-full border-2 border-violet-200 border-t-violet-600"
                        />
                        <p className="text-sm font-medium text-slate-500">Presenceを読み込み中...</p>
                    </div>
                ) : data.error ? (
                    /* ── Error state ── */
                    <PresenceCard padding="lg" className="mx-auto max-w-[520px] text-center" data-testid="error-state">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-2xl dark:bg-rose-950">!</div>
                        <p className="mt-4 text-xl font-bold text-slate-950 dark:text-white">
                            プロフィールの取得に失敗しました
                        </p>
                        <button
                            type="button"
                            onClick={() => void handleRetry()}
                            disabled={retrying}
                            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2 text-sm font-bold text-white shadow-[0_14px_30px_rgba(139,92,246,0.25)] disabled:opacity-60"
                        >
                            {retrying ? (
                                <>
                                    <motion.span
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                                        className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
                                    />
                                    読み込み中...
                                </>
                            ) : "再試行"}
                        </button>
                    </PresenceCard>
                ) : (
                    /* ── Content ── */
                    <div className="space-y-6">
                        {/* Offline banner */}
                        {data.isOffline && (
                            <div className="rounded-2xl border border-amber-200/60 bg-amber-50/80 px-4 py-3 text-center dark:border-amber-700/40 dark:bg-amber-950/40">
                                <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                                    {L.offline.banner}
                                    {data.lastUpdateTime && ` — ${L.offline.lastUpdate(data.lastUpdateTime)}`}
                                </p>
                            </div>
                        )}

                        {/* Hero */}
                        <PresenceHero styleDna={(data.resolvedPayload?.style_dna ?? null) as Parameters<typeof PresenceHero>[0]["styleDna"]} />

                        {/* Tab Switcher — ARIA tablist */}
                        <div
                            role="tablist"
                            aria-label="Presence タブ"
                            className="rounded-2xl border border-white/70 bg-white/80 p-1.5 shadow-sm backdrop-blur-xl dark:border-slate-700 dark:bg-slate-800/80"
                            data-testid="presence-tabs"
                            onKeyDown={handleTabKeyDown}
                        >
                            <div ref={tabBarRef} className="grid grid-cols-5 gap-1">
                                {TABS.map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        role="tab"
                                        id={`tab-${item.key}`}
                                        aria-selected={tab === item.key}
                                        aria-controls={`tabpanel-${item.key}`}
                                        tabIndex={tab === item.key ? 0 : -1}
                                        onClick={() => handleTabChange(item.key)}
                                        className={cx(
                                            "relative rounded-xl px-2 py-3 text-sm font-bold transition sm:px-4",
                                            tab === item.key
                                                ? "text-white"
                                                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                                        )}
                                        data-testid={`tab-${item.key}`}
                                    >
                                        {tab === item.key ? (
                                            <motion.span
                                                layoutId="presence-tab"
                                                className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 shadow-[0_16px_30px_rgba(139,92,246,0.24)]"
                                                transition={{ type: "spring", stiffness: 360, damping: 30 }}
                                            />
                                        ) : null}
                                        <span className="relative z-10 flex items-center justify-center gap-1">
                                            <span className="hidden text-xs sm:inline">{item.icon}</span>
                                            {item.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Tab Content — ARIA tabpanel + swipe support */}
                        <div
                            ref={tabContentRef}
                            role="tabpanel"
                            id={`tabpanel-${tab}`}
                            aria-labelledby={`tab-${tab}`}
                            aria-live="polite"
                        >
                            {/* Desktop: AnimatePresence */}
                            <div className="hidden lg:block">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={tab}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: animDuration, ease: EASE_OUT_EXPO }}
                                    >
                                        <ErrorBoundary fallbackMessage="このタブの読み込みに失敗しました">
                                            {renderTab(tab, data, handleTabChange)}
                                        </ErrorBoundary>
                                    </motion.div>
                                </AnimatePresence>
                            </div>

                            {/* Mobile: Swipeable */}
                            <div className="lg:hidden">
                                <SwipeableTabContainer
                                    tabs={TAB_KEYS}
                                    activeTab={tab}
                                    onTabChange={handleTabChange}
                                >
                                    <ErrorBoundary fallbackMessage="このタブの読み込みに失敗しました">
                                        {renderTab(tab, data, handleTabChange)}
                                    </ErrorBoundary>
                                </SwipeableTabContainer>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <FloatingNavLight items={navItems} />

            <FeatureIntroduction
                {...PRESENCE_INTRO}
                tabBarRef={tabBarRef}
                onComplete={(selectedTab) => {
                    if (selectedTab) handleTabChange(selectedTab as Tab);
                }}
            />
        </LightBackground>
    );
}

/* ── Tab renderer (extracted to avoid duplication) ── */

function renderTab(
    tab: Tab,
    data: ReturnType<typeof usePresenceData>,
    onTabChange: (key: string) => void,
) {
    switch (tab) {
        case "mirror":
            return <MirrorTab pulseData={data.pulseData} momentData={data.momentData} selfData={data.selfData} onTabChange={onTabChange} />;
        case "depth":
            return <DepthTab depthData={data.depthData} onTabChange={onTabChange} />;
        case "change":
            return <ChangeTab metaData={data.metaData} onTabChange={onTabChange} />;
        case "relations":
            return <RelationsTab relationsData={data.relationsData} selfData={data.selfData} />;
        case "self":
            return <SelfTab selfData={data.selfData} pulseData={data.pulseData} evidence={data.evidence} />;
        default:
            return null;
    }
}
