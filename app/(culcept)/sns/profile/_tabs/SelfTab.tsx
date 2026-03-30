"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { PRESENCE_SCREENSHOT } from "../_lib/presenceDefaults";
import { cx, GRID_2, GRID_3 } from "../_lib/presenceConstants";
import { L } from "../_lib/presenceI18n";
import type { SelfResponse, PulseResponse, EvidenceShape } from "../_lib/presenceTypes";
import {
    FadeSection,
    PresenceCard,
    SectionHeading,
    TonePanel,
    EvidenceAccordion,
    TagList,
} from "../_components/Primitives";
import CompanionLevel from "../_components/CompanionLevel";
import StateMirror from "../_components/StateMirror";

type SelfTabProps = {
    selfData: SelfResponse | null;
    pulseData: PulseResponse | null;
    evidence: EvidenceShape;
};

export function SelfTab({ selfData, pulseData, evidence }: SelfTabProps) {
    const content = PRESENCE_SCREENSHOT;

    return (
        <div className="space-y-6" data-testid="self-tab">
            {/* ── Primary: Companion Level ── */}
            <PresenceCard padding="md" data-testid="companion-level">
                <CompanionLevel
                    observationCount={selfData?.observationCount ?? pulseData?.observationCount ?? 0}
                    dataQuality={selfData?.dataQuality ?? pulseData?.dataQuality ?? "low"}
                    quality={selfData?.companionQuality ?? null}
                />
            </PresenceCard>

            {/* ── Primary: Companion Voice ── */}
            <PresenceCard padding="md">
                <SectionHeading title={L.self.companionVoice} subtitle={L.self.companionVoiceSub} gradient />

                {/* Typewriter-style title reveal */}
                <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-pink-50 p-4 dark:border-violet-700 dark:from-violet-950/40 dark:to-pink-950/30">
                    <div className="text-xl font-bold leading-[1.55] tracking-[-0.02em] text-slate-950 dark:text-white">
                        {content.companion.title.split("").map((char, i) => (
                            <motion.span
                                key={i}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.03 * i, duration: 0.1 }}
                            >
                                {char}
                            </motion.span>
                        ))}
                    </div>
                </div>

                {/* Existential essence (dynamic) */}
                {selfData?.existentialEssence && (
                    <div className="mt-4 rounded-2xl border border-violet-200/60 bg-violet-50/50 p-4 dark:border-violet-700/40 dark:bg-violet-950/30">
                        <p className="text-center text-sm font-bold italic leading-relaxed text-violet-700 dark:text-violet-400">
                            &ldquo;{selfData.existentialEssence}&rdquo;
                        </p>
                    </div>
                )}

                <div className="mt-4 space-y-4">
                    {content.companion.cards.map((card) => (
                        <FadeSection key={card.title}>
                            <TonePanel title={card.title} body={card.body} tone={card.tone} />
                        </FadeSection>
                    ))}
                </div>

                {/* Dynamic companion insights */}
                {selfData && selfData.companionInsights.length > 0 && (
                    <div className="mt-4">
                        <p className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-violet-500">{L.self.latestObservations}</p>
                        <div className="space-y-2">
                            {selfData.companionInsights.slice(0, 3).map((insight, i) => (
                                <div key={`dyn-${i}`} className="rounded-2xl border border-violet-100/60 bg-violet-50/30 p-3 dark:border-violet-700/30 dark:bg-violet-950/20">
                                    <div className="flex items-center gap-2">
                                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-600 dark:bg-violet-900 dark:text-violet-400">
                                            {L.level.insight[insight.level] ?? insight.level}
                                        </span>
                                        <span className="text-xs text-slate-400">{L.level.confidence(Math.round(insight.confidence * 100))}</span>
                                    </div>
                                    <p className="mt-1 text-sm leading-7 text-slate-700 dark:text-slate-300">{insight.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Enhanced closing quote */}
                <FadeSection delay={0.3}>
                    <div className="mt-8 rounded-2xl border border-violet-200/60 bg-gradient-to-br from-violet-50/80 to-pink-50/60 p-6 text-center dark:border-violet-700/40 dark:from-violet-950/30 dark:to-pink-950/20">
                        <p className="text-xl font-bold leading-relaxed tracking-[-0.01em] text-violet-700 dark:text-violet-400">
                            &ldquo;{content.companion.quote}&rdquo;
                        </p>
                    </div>
                </FadeSection>
            </PresenceCard>

            {/* ── Action CTAs: 次の一歩 ── */}
            <FadeSection>
                <PresenceCard padding="md">
                    <SectionHeading title={L.self.nextAction} subtitle={L.self.nextActionSub} />
                    <div className={GRID_2}>
                        <Link
                            href="/stargazer"
                            className="flex items-center gap-3 rounded-2xl border border-violet-200/60 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-4 no-underline transition hover:-translate-y-0.5 hover:shadow-md dark:border-violet-700/40 dark:from-violet-950/30 dark:to-fuchsia-950/20"
                        >
                            <span className="text-2xl">🔭</span>
                            <div>
                                <p className="text-sm font-bold text-violet-700 dark:text-violet-400">{L.self.observeMore}</p>
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{L.self.observeMoreSub}</p>
                            </div>
                        </Link>
                        <Link
                            href="/match"
                            className="flex items-center gap-3 rounded-2xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50 to-violet-50 p-4 no-underline transition hover:-translate-y-0.5 hover:shadow-md dark:border-indigo-700/40 dark:from-indigo-950/30 dark:to-violet-950/20"
                        >
                            <span className="text-2xl">💫</span>
                            <div>
                                <p className="text-sm font-bold text-indigo-700 dark:text-indigo-400">{L.self.matchCta}</p>
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{L.self.matchCtaSub}</p>
                            </div>
                        </Link>
                    </div>
                </PresenceCard>
            </FadeSection>

            {/* ── Primary: 他者視点 + 魅力と誤解 (merged 2x2 grid) ── */}
            <FadeSection>
                <PresenceCard padding="md">
                    <SectionHeading title={L.self.othersView} />
                    <div className={GRID_2}>
                        <TonePanel title={L.self.firstImpression} body={content.iam.firstImpression} tone="indigo" />
                        <TonePanel title={L.self.deeperTruth} body={content.iam.deeperTruth} tone="violet" />
                        <TonePanel title={L.self.charm} body={content.iam.charm} tone="emerald" />
                        <TonePanel title={L.self.misperception} body={content.iam.misperception} tone="amber" />
                    </div>
                </PresenceCard>
            </FadeSection>

            {/* ── Secondary: コンパニオンの観察 (collapsed) ── */}
            {selfData && selfData.companionInsights.length > 0 && (
                <FadeSection>
                    <PresenceCard padding="md">
                        <EvidenceAccordion title={L.self.insightsAccordion}>
                            <div className="space-y-3">
                                {selfData.companionInsights.map((insight, i) => (
                                    <motion.div
                                        key={`${insight.level}-${i}`}
                                        initial={{ opacity: 0, x: -12 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.06 * i, duration: 0.4 }}
                                        className={cx(
                                            "rounded-2xl border p-4",
                                            insight.level === "prediction"
                                                ? "border-violet-200/80 bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:border-violet-700/50 dark:from-violet-950/40 dark:to-fuchsia-950/30"
                                                : insight.level === "pattern"
                                                  ? "border-indigo-200/80 bg-gradient-to-br from-indigo-50 to-violet-50 dark:border-indigo-700/50 dark:from-indigo-950/40 dark:to-violet-950/30"
                                                  : "border-slate-200/90 bg-gradient-to-br from-slate-50 to-white dark:border-slate-700 dark:from-slate-800 dark:to-slate-900"
                                        )}
                                    >
                                        <div className="mb-1.5 flex items-center gap-2">
                                            <span className={cx(
                                                "rounded-full px-2 py-0.5 text-xs font-bold",
                                                insight.level === "prediction" ? "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-400"
                                                    : insight.level === "pattern" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-400"
                                                    : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
                                            )}>
                                                {L.level.insight[insight.level] ?? insight.level}
                                            </span>
                                            <span className="text-xs text-slate-400">{L.level.confidence(Math.round(insight.confidence * 100))}</span>
                                        </div>
                                        <p className="text-sm leading-7 text-slate-700 dark:text-slate-300">{insight.text}</p>
                                    </motion.div>
                                ))}
                            </div>
                        </EvidenceAccordion>
                    </PresenceCard>
                </FadeSection>
            )}

            {/* ── Secondary: 状態ミラー (collapsed) ── */}
            {selfData?.selfGap && (
                <FadeSection>
                    <PresenceCard padding="md">
                        <EvidenceAccordion title={L.self.stateAccordion}>
                            <StateMirror selfGap={selfData.selfGap} />
                        </EvidenceAccordion>
                    </PresenceCard>
                </FadeSection>
            )}

            {/* ── Secondary: 存在の要約 (collapsed) ── */}
            {selfData?.existentialEssence && (
                <FadeSection>
                    <PresenceCard padding="md">
                        <EvidenceAccordion title={L.self.essenceAccordion}>
                            <div className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/60 to-fuchsia-50/60 p-4 dark:border-violet-700 dark:from-violet-950/40 dark:to-fuchsia-950/30">
                                <p className="text-center text-base font-bold leading-relaxed text-slate-800 dark:text-slate-200">
                                    &ldquo;{selfData.existentialEssence}&rdquo;
                                </p>
                            </div>
                            {selfData.existentialSections.length > 0 && (
                                <div className={`mt-4 ${GRID_2}`}>
                                    {selfData.existentialSections.slice(0, 4).map((s) => (
                                        <div key={s.title} className="rounded-2xl border border-white/60 bg-white/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                                            <p className="mb-1 text-xs font-bold text-slate-500 dark:text-slate-400">{s.title}</p>
                                            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{s.content}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </EvidenceAccordion>
                    </PresenceCard>
                </FadeSection>
            )}

            {/* ── Secondary: 成長ベクトル (collapsed) ── */}
            <FadeSection>
                <PresenceCard padding="md">
                    <EvidenceAccordion title={L.self.growthAccordion}>
                        <div className={GRID_3}>
                            <TonePanel title={L.self.currentStrength} body={content.iam.growth.current} tone="emerald" />
                            <TonePanel title={L.self.blindSpot} body={content.iam.growth.blindSpot} tone="amber" />
                            <TonePanel title={L.self.nextStep} body={content.iam.growth.next} tone="blue" />
                        </div>
                    </EvidenceAccordion>
                </PresenceCard>
            </FadeSection>

            {/* ── On-demand: 根拠データ ── */}
            <FadeSection>
                <PresenceCard padding="md">
                    <SectionHeading title={L.self.evidenceTitle} />
                    <div className="space-y-4">
                        <EvidenceAccordion title={`スタイルレーン (${evidence.lanes.length})`} defaultOpen>
                            <TagList items={evidence.lanes} />
                        </EvidenceAccordion>
                        <EvidenceAccordion title="好き・苦手">
                            <div className="space-y-4">
                                <div>
                                    <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">好き</div>
                                    <TagList items={evidence.likes} />
                                </div>
                                <div>
                                    <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">苦手</div>
                                    <TagList items={evidence.avoid} />
                                </div>
                            </div>
                        </EvidenceAccordion>
                        <EvidenceAccordion title={`全タグ (${evidence.tags.length})`}>
                            <TagList items={evidence.tags} />
                        </EvidenceAccordion>
                    </div>
                </PresenceCard>
            </FadeSection>

            {/* ── Notification settings ── */}
            <FadeSection>
                <PresenceCard padding="md">
                    <SectionHeading title={L.self.notificationSettings} />
                    <NotificationToggles />
                </PresenceCard>
            </FadeSection>
        </div>
    );
}

/* ── Notification Toggles (inline) ── */

const NOTIF_STORAGE_KEY = "presence_notification_prefs";

function NotificationToggles() {
    const [prefs, setPrefs] = useState<{ daily: boolean; insight: boolean }>(() => {
        if (typeof window === "undefined") return { daily: false, insight: false };
        try {
            const stored = localStorage.getItem(NOTIF_STORAGE_KEY);
            if (stored) return JSON.parse(stored);
        } catch { /* ignore */ }
        return { daily: false, insight: false };
    });

    const toggle = useCallback((key: "daily" | "insight") => {
        setPrefs((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            try { localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }

            // Request push permission if enabling
            if (!prev[key] && typeof Notification !== "undefined" && Notification.permission === "default") {
                void Notification.requestPermission();
            }
            return next;
        });
    }, []);

    return (
        <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/60 p-4 dark:border-slate-700">
                <span className="text-sm text-slate-700 dark:text-slate-300">{L.self.notifyDaily}</span>
                <button
                    type="button"
                    role="switch"
                    aria-checked={prefs.daily}
                    onClick={() => toggle("daily")}
                    className={cx(
                        "relative h-6 w-11 rounded-full transition-colors",
                        prefs.daily ? "bg-violet-500" : "bg-slate-300 dark:bg-slate-600"
                    )}
                >
                    <span className={cx(
                        "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                        prefs.daily && "translate-x-5"
                    )} />
                </button>
            </label>
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/60 p-4 dark:border-slate-700">
                <span className="text-sm text-slate-700 dark:text-slate-300">{L.self.notifyInsight}</span>
                <button
                    type="button"
                    role="switch"
                    aria-checked={prefs.insight}
                    onClick={() => toggle("insight")}
                    className={cx(
                        "relative h-6 w-11 rounded-full transition-colors",
                        prefs.insight ? "bg-violet-500" : "bg-slate-300 dark:bg-slate-600"
                    )}
                >
                    <span className={cx(
                        "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                        prefs.insight && "translate-x-5"
                    )} />
                </button>
            </label>
        </div>
    );
}
