"use client";

import Link from "next/link";
import { PRESENCE_SCREENSHOT } from "../_lib/presenceDefaults";
import { GRID_2, GRID_3 } from "../_lib/presenceConstants";
import type { PulseResponse, MomentResponse, SelfResponse } from "../_lib/presenceTypes";
import { L } from "../_lib/presenceI18n";
import {
    FadeSection,
    PresenceCard,
    SectionHeading,
    TonePanel,
    StrengthRow,
    RadarChart,
    EvidenceAccordion,
} from "../_components/Primitives";
import PresenceGapCard from "../_components/PresenceGapCard";
import PresencePulse from "../_components/PresencePulse";
import MicroMoment from "../_components/MicroMoment";

type MirrorTabProps = {
    pulseData: PulseResponse | null;
    momentData: MomentResponse | null;
    selfData?: SelfResponse | null;
    onTabChange?: (tab: string) => void;
};

export function MirrorTab({ pulseData, momentData, selfData, onTabChange }: MirrorTabProps) {
    const content = PRESENCE_SCREENSHOT;

    // Daily change detection
    const dailyChange = (() => {
        const h = pulseData?.history7d;
        if (!h || h.length < 2) return null;
        const today = h[h.length - 1];
        const yesterday = h[h.length - 2];
        const axes = [
            { key: "selfAlignment", label: "自己整合" },
            { key: "interpersonalEnergy", label: "対人エネルギー" },
            { key: "emotionalTemp", label: "感情温度" },
            { key: "boundarySense", label: "境界感覚" },
        ];
        for (const a of axes) {
            const diff = (today as unknown as Record<string, number>)[a.key] - (yesterday as unknown as Record<string, number>)[a.key];
            if (Math.abs(diff) > 0.2) {
                return diff > 0 ? L.mirror.dailyChange.up(a.label) : L.mirror.dailyChange.down(a.label);
            }
        }
        return null;
    })();

    return (
        <div className="space-y-6" data-testid="mirror-tab">
            {/* ── Daily change banner ── */}
            {dailyChange && (
                <div className="rounded-2xl border border-violet-200/60 bg-gradient-to-r from-violet-50/80 to-fuchsia-50/60 px-4 py-3 text-center dark:border-violet-700/40 dark:from-violet-950/20 dark:to-fuchsia-950/20">
                    <p className="text-xs font-bold text-violet-600 dark:text-violet-400">{dailyChange}</p>
                </div>
            )}

            {/* ── 1. 人物像 → 即座に自己共鳴 ── */}
            <PresenceCard padding="md">
                <div className="flex items-start justify-between">
                    <SectionHeading
                        title={L.mirror.personaTitle}
                        subtitle={L.mirror.personaSub}
                    />
                    <Link href="/my-style?tab=identity" className="mt-1 text-sm text-slate-400 no-underline hover:text-violet-500" aria-label="人物像を編集">✏️</Link>
                </div>
                <div className={GRID_3}>
                    {content.personaCards.map((card) => (
                        <TonePanel
                            key={card.title}
                            title={card.title}
                            body={card.body}
                            tone={card.tone}
                        />
                    ))}
                </div>
            </PresenceCard>

            {/* ── 2. MicroMoment → 今日だけの好奇心トリガー ── */}
            <MicroMoment moment={momentData?.moment ?? null} />

            {/* ── 3. GapCard → 内vs外の "aha moment" ── */}
            <FadeSection>
                <PresenceGapCard selfGap={selfData?.selfGap as Parameters<typeof PresenceGapCard>[0]["selfGap"]} />
            </FadeSection>

            {/* ── 4. Presence Pulse → 文脈を得た上で今日の状態 ── */}
            <FadeSection>
                <PresenceCard padding="md">
                    <PresencePulse
                        current={pulseData?.current ?? null}
                        history7d={pulseData?.history7d ?? []}
                        observationCount={pulseData?.observationCount ?? 0}
                        dataQuality={pulseData?.dataQuality ?? "low"}
                    />
                </PresenceCard>
            </FadeSection>

            {/* ── 折りたたみ: 強み・弱み ── */}
            <FadeSection>
                <PresenceCard padding="md">
                    <EvidenceAccordion title={L.mirror.strengthsAccordion}>
                        <div className="space-y-4">
                            {content.strengths.items.map((item, index) => (
                                <StrengthRow key={item.label} item={item} index={index} />
                            ))}
                        </div>
                        <div className={`mt-6 ${GRID_2}`}>
                            <TonePanel title={L.mirror.weaponTitle} body={content.strengths.weapon} tone="emerald" />
                            <TonePanel title={L.mirror.growthTitle} body={content.strengths.growth} tone="amber" />
                        </div>
                    </EvidenceAccordion>
                </PresenceCard>
            </FadeSection>

            {/* ── 折りたたみ: ポテンシャルマップ ── */}
            <FadeSection>
                <PresenceCard padding="md">
                    <EvidenceAccordion title={L.mirror.potentialAccordion}>
                        <div className="space-y-4">
                            {content.potential.items.map((item) => (
                                <div key={item.title} className="rounded-2xl border border-slate-200 bg-white/92 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
                                    <div className="mb-3 flex items-center justify-between gap-4">
                                        <div className="text-base font-bold text-slate-900 dark:text-slate-100">{item.title}</div>
                                        <div className="text-sm font-bold text-violet-600">{item.percent}</div>
                                    </div>
                                    <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-400" style={{ width: item.percent }} />
                                    </div>
                                    <p className="text-sm leading-7 text-slate-600 dark:text-slate-400">{item.description}</p>
                                </div>
                            ))}
                        </div>
                    </EvidenceAccordion>
                </PresenceCard>
            </FadeSection>

            {/* ── 折りたたみ: レーダー根拠 ── */}
            <FadeSection>
                <PresenceCard padding="md">
                    <EvidenceAccordion title={L.mirror.radarAccordion}>
                        <div className="space-y-6">
                            <div>
                                <p className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-slate-400">{L.mirror.radarLabel}</p>
                                <RadarChart items={content.radar.axes} />
                            </div>
                            <div className="rounded-2xl border border-violet-200 bg-violet-50/80 p-4 text-sm leading-8 text-violet-800 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                                {content.radar.summary}
                            </div>
                        </div>
                    </EvidenceAccordion>
                </PresenceCard>
            </FadeSection>

            {/* ── タブ遷移CTA ── */}
            <FadeSection>
                <button
                    type="button"
                    onClick={() => onTabChange?.("depth")}
                    className="flex w-full items-center justify-between rounded-2xl border border-violet-200/60 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md dark:border-violet-700/40 dark:from-violet-950/30 dark:to-fuchsia-950/20"
                >
                    <div>
                        <p className="text-sm font-bold text-violet-700 dark:text-violet-400">{L.mirror.nextTab}</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{L.mirror.nextTabSub}</p>
                    </div>
                    <span className="text-base text-violet-500">→</span>
                </button>
            </FadeSection>
        </div>
    );
}
