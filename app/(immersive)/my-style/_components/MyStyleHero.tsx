"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import StyleDnaVisualization from "./StyleDnaVisualization";
import { getSetupMoodLabel, getStyleLaneLabel } from "../_lib/catalog";
import { deriveMyStyleSignals } from "../_lib/state";
import { computeStyleDna, type StyleDnaVector } from "../_lib/styleDna";
import { heroReveal, badgePop, springGentle, staggerContainer } from "../_lib/animations";
import type { SavedState } from "../_lib/types";
import type { SwipeLearningState } from "../_lib/swipeLearningAxes";
import { TAB_CONFIG, type TabId, type SyncStatus, cx, getSyncLabel } from "../_lib/pageUtils";

/* ─────────────────────── local primitives ─────────────────────── */

function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "ink" | "sky" | "emerald" | "amber" }) {
    const tones = {
        slate: "border-slate-200 bg-slate-50 text-slate-600",
        ink: "border-slate-800 bg-slate-900 text-white",
        sky: "border-sky-200 bg-sky-50 text-sky-700",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
        amber: "border-amber-200 bg-amber-50 text-amber-700",
    };
    return <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide", tones[tone])}>{children}</span>;
}

function cleanHeroPhrase(value: string | null | undefined) {
    return String(value ?? "").replace(/[。]/g, "").replace(/^少し/, "").trim();
}

function getDnaAxisValue(dna: StyleDnaVector, label: string) {
    return dna.points.find((point) => point.label === label)?.value ?? 0;
}

function pickHeroAccent(dna: StyleDnaVector, rareLabel: string | null, secretLabel: string | null, worldview: string | null) {
    const trendValue = getDnaAxisValue(dna, "定番派↔流行派") || getDnaAxisValue(dna, "定番↔トレンド");
    const modeValue = getDnaAxisValue(dna, "カジュアル↔モード");
    const minimalValue = getDnaAxisValue(dna, "シンプル↔華やか") || getDnaAxisValue(dna, "ミニマル↔マキシマル");
    const sharpValue = getDnaAxisValue(dna, "フェミニン↔シャープ");

    if (trendValue > 0.28) return "トレンド";
    if (modeValue > 0.24) return "モード";
    if (minimalValue < -0.24) return "余白";
    if (minimalValue > 0.24) return "存在感";
    if (sharpValue > 0.24) return "シャープさ";
    if (sharpValue < -0.24) return "フェミニンさ";
    return cleanHeroPhrase(rareLabel) || cleanHeroPhrase(secretLabel) || cleanHeroPhrase(worldview);
}

function buildHeroIdentityTitle({
    primaryLabel,
    rareLabel,
    secretLabel,
    worldview,
    dna,
}: {
    primaryLabel: string;
    rareLabel: string | null;
    secretLabel: string | null;
    worldview: string | null;
    dna: StyleDnaVector;
}) {
    const primary = primaryLabel === "まだ未定義" ? "" : cleanHeroPhrase(primaryLabel);
    const worldviewText = cleanHeroPhrase(worldview);
    const accent = pickHeroAccent(dna, rareLabel, secretLabel, worldview);

    if (primary && accent && accent !== primary) {
        if (["トレンド", "モード", "余白", "存在感", "シャープさ", "フェミニンさ"].includes(accent)) {
            return `${primary}に${accent}を差し込む体現者`;
        }
        return `${primary}と${accent}を編む体現者`;
    }

    if (worldviewText) return `${worldviewText}の体現者`;
    if (primary) return `${primary}スタイルの体現者`;
    return dna.catchphrase;
}

function buildHeroIdentityLead({
    dominantImpression,
    worldview,
    becomeResult,
    fallback,
}: {
    dominantImpression: string | null;
    worldview: string | null;
    becomeResult: string | null;
    fallback: string;
}) {
    const impression = cleanHeroPhrase(dominantImpression);
    const worldviewText = cleanHeroPhrase(worldview);
    const become = cleanHeroPhrase(becomeResult);

    if (impression && worldviewText) {
        return `${impression}を残しながら、${worldviewText}へ重心を寄せるロジックが見えています。`;
    }
    if (worldviewText && become) {
        return `${worldviewText}に惹かれ、変化としては「${become}」が繰り返し現れています。`;
    }
    if (impression) {
        return `${impression}を軸にした選び方が、少しずつ輪郭になってきました。`;
    }
    return fallback;
}

/* ─────────────────────── MyStyleHero ─────────────────────── */

export default function MyStyleHero({
    state,
    tab,
    syncStatus,
    syncedAt,
    swipeState,
    secondaryPanel,
}: {
    state: SavedState;
    tab: TabId;
    syncStatus: SyncStatus;
    syncedAt: string | null;
    swipeState: SwipeLearningState | null;
    secondaryPanel?: ReactNode;
}) {
    const derived = useMemo(() => deriveMyStyleSignals(state), [state]);
    const dna = useMemo(() => computeStyleDna(state, swipeState), [state, swipeState]);
    const activeTab = TAB_CONFIG.find((entry) => entry.id === tab) ?? TAB_CONFIG[0];
    const syncLabel = getSyncLabel(syncStatus, syncedAt);
    const nextMove = derived.nextActions[0] ?? "まずはワードローブかセットアップを 1 つ増やして、輪郭の材料を作る";
    const discovery = derived.discoveries[0] ?? "入力が増えると、いまの輪郭に潜んでいる揺れや惹かれがここに現れます。";
    const topMood = derived.dominantSetupMoods[0] ? getSetupMoodLabel(derived.dominantSetupMoods[0]) : null;
    const topRare = derived.rareLanes[0] ? getStyleLaneLabel(derived.rareLanes[0]) : null;
    const topSecret = derived.secretLanes[0] ? getStyleLaneLabel(derived.secretLanes[0]) : null;
    const primaryLabel = derived.coreLanes[0] ? getStyleLaneLabel(derived.coreLanes[0]) : "まだ未定義";
    const heroIdentityTitle = useMemo(
        () =>
            buildHeroIdentityTitle({
                primaryLabel,
                rareLabel: topRare,
                secretLabel: topSecret,
                worldview: derived.dominantWorldviews[0] ?? null,
                dna,
            }),
        [derived.dominantWorldviews, dna, primaryLabel, topRare, topSecret],
    );
    const heroIdentityLead = useMemo(
        () =>
            buildHeroIdentityLead({
                dominantImpression: derived.dominantImpressions[0] ?? null,
                worldview: derived.dominantWorldviews[0] ?? null,
                becomeResult: derived.repeatedBecomeResults[0] ?? null,
                fallback: derived.currentContourText || "記録と選択が増えるほど、この場所は自分のスタイルを読むコントロールルームになります。",
            }),
        [derived.currentContourText, derived.dominantImpressions, derived.dominantWorldviews, derived.repeatedBecomeResults],
    );

    const sectionRef = useRef<HTMLElement>(null);
    const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start end", "end start"] });
    const bgY = useTransform(scrollYProgress, [0, 1], ["-15%", "15%"]);

    return (
        <section
            ref={sectionRef}
            className="relative mx-auto min-h-[120px] max-w-[980px] overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,250,245,0.86)_45%,rgba(248,250,252,0.9))] p-4 shadow-[0_20px_68px_rgba(15,23,42,0.08)] sm:p-5"
            style={{ animation: "hero-border-glow 4s ease-in-out infinite" }}
        >
            {/* Breathing glow keyframes */}
            <style>{`
                @keyframes hero-border-glow {
                    0%, 100% { box-shadow: 0 24px 80px rgba(15,23,42,0.08), 0 0 0 0 rgba(99,102,241,0); }
                    50% { box-shadow: 0 24px 80px rgba(15,23,42,0.08), 0 0 20px 2px rgba(99,102,241,0.08); }
                }
            `}</style>
            <motion.div className="pointer-events-none absolute inset-0" style={{ y: bgY }}>
                <div className="absolute -left-12 top-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(201,109,74,0.16),_transparent_68%)]" />
                <div className="absolute right-0 top-12 h-52 w-52 rounded-full bg-[radial-gradient(circle,_rgba(99,102,241,0.14),_transparent_72%)]" />
                <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(13,148,136,0.12),_transparent_70%)]" />
                <div
                    className="absolute inset-0 opacity-[0.16]"
                    style={{
                        backgroundImage: "linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px)",
                        backgroundSize: "28px 28px",
                        maskImage: "linear-gradient(180deg, rgba(0,0,0,0.65), transparent 82%)",
                    }}
                />
            </motion.div>

            <div className="relative">
                <motion.div className="flex flex-wrap items-center gap-2" variants={staggerContainer} initial="initial" animate="animate">
                    <motion.span variants={badgePop} initial="initial" animate="animate" transition={badgePop.transition}><Badge tone="ink">My Style Atelier</Badge></motion.span>
                    <motion.span variants={badgePop} initial="initial" animate="animate" transition={{ ...badgePop.transition, delay: 0.08 }}><Badge tone="sky">{activeTab.label}</Badge></motion.span>
                    {syncLabel ? <motion.span variants={badgePop} initial="initial" animate="animate" transition={{ ...badgePop.transition, delay: 0.16 }}><Badge tone="slate">{syncLabel}</Badge></motion.span> : null}
                </motion.div>

                <div className="mt-4">
                    <motion.div
                        className="inline-flex items-center rounded-full border border-slate-200/70 bg-white/78 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-slate-500 shadow-sm"
                        variants={heroReveal}
                        initial="initial"
                        animate="animate"
                        transition={{ ...springGentle, delay: 0.08 }}
                    >
                        Learned Style Logic
                    </motion.div>
                    <motion.h2
                        className="mt-3.5 max-w-4xl text-[28px] font-black leading-[0.98] tracking-[-0.05em] text-slate-950 sm:text-[38px]"
                        variants={heroReveal}
                        initial="initial"
                        animate="animate"
                        transition={{ ...springGentle, delay: 0.15 }}
                    >
                        {heroIdentityTitle}
                    </motion.h2>
                    <motion.p
                        className="mt-3 max-w-3xl text-[13px] leading-6 text-slate-600 sm:text-[14px]"
                        variants={heroReveal}
                        initial="initial"
                        animate="animate"
                        transition={{ ...springGentle, delay: 0.25 }}
                    >
                        {heroIdentityLead}
                    </motion.p>
                    <motion.p
                        className="mt-2 max-w-3xl text-[12px] font-medium leading-relaxed text-slate-500"
                        variants={heroReveal}
                        initial="initial"
                        animate="animate"
                        transition={{ ...springGentle, delay: 0.32 }}
                    >
                        仮説ラベル: {dna.catchphrase}
                    </motion.p>

                    <motion.div className="mt-4 flex flex-wrap gap-1.5" variants={staggerContainer} initial="initial" animate="animate">
                        <motion.span variants={badgePop} initial="initial" animate="animate" transition={{ ...badgePop.transition, delay: 0.3 }}><Badge tone="ink">Core {primaryLabel}</Badge></motion.span>
                        {topRare ? <motion.span variants={badgePop} initial="initial" animate="animate" transition={{ ...badgePop.transition, delay: 0.36 }}><Badge tone="sky">Rare {topRare}</Badge></motion.span> : null}
                        {topSecret ? <motion.span variants={badgePop} initial="initial" animate="animate" transition={{ ...badgePop.transition, delay: 0.42 }}><Badge tone="amber">Secret {topSecret}</Badge></motion.span> : null}
                        {derived.repeatedBecomeResults[0] ? <motion.span variants={badgePop} initial="initial" animate="animate" transition={{ ...badgePop.transition, delay: 0.48 }}><Badge tone="emerald">Become {derived.repeatedBecomeResults[0]}</Badge></motion.span> : null}
                        {topMood ? <motion.span variants={badgePop} initial="initial" animate="animate" transition={{ ...badgePop.transition, delay: 0.54 }}><Badge tone="sky">Mood {topMood}</Badge></motion.span> : null}
                    </motion.div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(292px,0.88fr)]">
                    <div className="rounded-[22px] border border-white/80 bg-white/68 p-3.5 shadow-lg shadow-slate-900/[0.03] backdrop-blur-xl">
                        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Current contour</div>
                        <div className="mt-1.5 text-[16px] font-bold leading-relaxed text-slate-900">
                            {derived.dominantImpressions[0] ?? "静かな整い"} を残しながら、
                            {derived.dominantWorldviews[0] ?? activeTab.sub} に向かう流れ
                        </div>
                        <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
                            <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-2.5">
                                <div className="text-[11px] font-bold uppercase tracking-widest text-amber-500">Wardrobe</div>
                                <div className="mt-1 text-lg font-black text-slate-900">{state.wardrobe.length}</div>
                                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">自分を形作る材料</p>
                            </div>
                            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/80 p-2.5">
                                <div className="text-[11px] font-bold uppercase tracking-widest text-indigo-500">Setups</div>
                                <div className="mt-1 text-lg font-black text-slate-900">{state.setups.length}</div>
                                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">見せ方の実験</p>
                            </div>
                            <div className="rounded-2xl border border-teal-100 bg-teal-50/80 p-2.5">
                                <div className="text-[11px] font-bold uppercase tracking-widest text-teal-500">Signals</div>
                                <div className="mt-1 text-lg font-black text-slate-900">{derived.discoveries.length + derived.timelineTrend.length}</div>
                                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">見えてきた傾向</p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[24px] border border-violet-200/60 bg-[linear-gradient(180deg,rgba(244,242,255,0.96),rgba(255,255,255,0.92))] p-3.5 shadow-lg shadow-violet-500/[0.07] backdrop-blur-xl">
                        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-violet-500">Style DNA</div>
                        <StyleDnaVisualization state={state} swipeState={swipeState} />
                    </div>
                    <div className="rounded-[22px] border border-indigo-200/50 bg-[linear-gradient(180deg,rgba(238,242,255,0.88),rgba(255,255,255,0.84))] p-3.5 shadow-lg shadow-indigo-500/[0.05] backdrop-blur-xl">
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-400">Next move</div>
                        <div className="mt-1.5 text-[16px] font-black tracking-[-0.03em] text-slate-900">次に足すべきのは、情報ではなく重心</div>
                        <p className="mt-2 text-[13px] leading-6 text-slate-600">{nextMove}</p>
                        <div className="mt-3 rounded-2xl border border-white/70 bg-white/70 p-2.5">
                            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Why now</div>
                            <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">
                                {derived.timelineTrend[0] ?? "まだログが浅いので、いま入力する 1 つがページ全体の解像度を大きく押し上げます。"}
                            </p>
                        </div>
                    </div>

                    <div className="rounded-[22px] border border-amber-200/50 bg-[linear-gradient(180deg,rgba(255,251,235,0.9),rgba(255,255,255,0.82))] p-3.5 shadow-lg shadow-amber-500/[0.05] backdrop-blur-xl">
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-500">Fresh signal</div>
                        <div className="mt-1.5 text-[16px] font-black tracking-[-0.03em] text-slate-900">最近見え始めた変化</div>
                        <p className="mt-2 text-[13px] leading-6 text-slate-600">{discovery}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {derived.timelineTrend.slice(0, 3).map((entry) => <Badge key={entry} tone="amber">{entry}</Badge>)}
                            {derived.timelineTrend.length === 0 ? <Badge tone="slate">変化の観測を待っています</Badge> : null}
                        </div>
                    </div>
                </div>

                {secondaryPanel ? <div className="mt-3">{secondaryPanel}</div> : null}
            </div>
        </section>
    );
}
