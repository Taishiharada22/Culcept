"use client";

import Link from "next/link";
import { PRESENCE_SCREENSHOT } from "../_lib/presenceDefaults";
import { GRID_2 } from "../_lib/presenceConstants";
import { L } from "../_lib/presenceI18n";
import type { RelationsResponse, SelfResponse } from "../_lib/presenceTypes";
import {
    FadeSection,
    PresenceCard,
    SectionHeading,
    TonePanel,
    EvidenceAccordion,
} from "../_components/Primitives";
import OthersViewTab from "../_components/OthersViewTab";
import StateMirror from "../_components/StateMirror";
import OrbiterPatterns from "../_components/OrbiterPatterns";
import RelationalPrism from "../_components/RelationalPrism";

type RelationsTabProps = {
    relationsData: RelationsResponse | null;
    selfData: SelfResponse | null;
};

export function RelationsTab({ relationsData, selfData }: RelationsTabProps) {
    const content = PRESENCE_SCREENSHOT;

    return (
        <div className="space-y-6" data-testid="relations-tab">
            {/* ── Primary: 相手から見た私 ── */}
            <OthersViewTab />

            {/* ── Primary: 価値観で見る関係性 ── */}
            <FadeSection>
                <PresenceCard padding="md">
                    <SectionHeading title={L.relations.valuesTitle} subtitle={L.relations.valuesSub} gradient />
                    <div className={GRID_2}>
                        <TonePanel title={L.relations.attractedTitle} body={content.iseek.dynamics.attracted} tone="indigo" />
                        <TonePanel title={L.relations.deepenTitle} body={content.iseek.dynamics.deepen} tone="emerald" />
                    </div>
                </PresenceCard>
            </FadeSection>

            {/* ── Conditional: 状態ミラー ── */}
            {selfData?.selfGap && (
                <FadeSection>
                    <StateMirror selfGap={selfData.selfGap} />
                </FadeSection>
            )}

            {/* ── Conditional: Orbiter横断パターン ── */}
            {relationsData?.hasOrbiterData && (
                <FadeSection>
                    <OrbiterPatterns
                        attractionLayers={relationsData.attractionLayers}
                        eras={relationsData.eras}
                        currentEra={relationsData.currentEra}
                        frictionTriggers={relationsData.frictionTriggers}
                        existentialEssence={relationsData.existentialEssence}
                        existentialSections={relationsData.existentialSections}
                    />
                </FadeSection>
            )}

            {/* ── Secondary: 関係プリズム (collapsed) ── */}
            <FadeSection>
                <PresenceCard padding="md">
                    <EvidenceAccordion title={L.relations.prismAccordion}>
                        <RelationalPrism data={relationsData?.relationalPrism ?? null} />
                    </EvidenceAccordion>
                </PresenceCard>
            </FadeSection>

            {/* ── Secondary: 注意したい関係性 (collapsed) ── */}
            <FadeSection>
                <PresenceCard padding="md">
                    <EvidenceAccordion title={L.relations.cautionAccordion}>
                        <div className="space-y-4">
                            <TonePanel title={L.relations.cautionInitial} body={content.iseek.caution.initial} tone="amber" />
                            <TonePanel title={L.relations.cautionClash} body={content.iseek.caution.clash} tone="rose" />
                        </div>
                    </EvidenceAccordion>
                </PresenceCard>
            </FadeSection>

            {/* ── CTA ── */}
            <FadeSection>
                <Link href={content.iseek.cta.href} className="block no-underline">
                    <PresenceCard padding="md" className="transition hover:-translate-y-0.5">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(192,132,252,0.18),transparent_35%),radial-gradient(circle_at_right,rgba(125,211,252,0.18),transparent_35%)] dark:opacity-30" />
                        <div className="relative flex items-center justify-between gap-4">
                            <div>
                                <div className="text-xl font-bold tracking-[-0.03em] text-slate-950 dark:text-white">
                                    {content.iseek.cta.title}
                                </div>
                                <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-400">
                                    {content.iseek.cta.description}
                                </p>
                            </div>
                            <div className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-bold text-white shadow-[0_14px_30px_rgba(139,92,246,0.22)]">
                                →
                            </div>
                        </div>
                    </PresenceCard>
                </Link>
            </FadeSection>
        </div>
    );
}
