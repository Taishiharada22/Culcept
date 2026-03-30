"use client";

import type { MetamorphosisResponse } from "../_lib/presenceTypes";
import { L } from "../_lib/presenceI18n";
import { FadeSection, PresenceCard, EmptyStateCard } from "../_components/Primitives";
import TemporalStrata from "../_components/TemporalStrata";
import MetamorphosisChronicle from "../_components/MetamorphosisChronicle";
import PredictiveSelf from "../_components/PredictiveSelf";

type ChangeTabProps = {
    metaData: MetamorphosisResponse | null;
    onTabChange?: (tab: string) => void;
};

export function ChangeTab({ metaData, onTabChange }: ChangeTabProps) {
    if (!metaData?.hasData) {
        return (
            <div data-testid="change-tab">
                <EmptyStateCard
                    emoji="🦋"
                    title={L.change.emptyTitle}
                    description={L.change.emptySub}
                    ctaHref="/stargazer"
                    ctaLabel={L.change.emptyCta}
                    ctaColor="emerald"
                />
            </div>
        );
    }

    return (
        <div className="space-y-6" data-testid="change-tab">
            <PresenceCard padding="md">
                <TemporalStrata trajectories={metaData.trajectories} trajectoryTriggerLinks={metaData.trajectoryTriggerLinks} />
            </PresenceCard>

            <FadeSection>
                <PresenceCard padding="md">
                    <MetamorphosisChronicle
                        cyclicalPatterns={metaData.cyclicalPatterns}
                        triggerPatterns={metaData.triggerPatterns}
                        resilience={metaData.resilience}
                        transformationVectors={metaData.transformationVectors}
                    />
                </PresenceCard>
            </FadeSection>

            <FadeSection>
                <PresenceCard padding="md">
                    <PredictiveSelf
                        predictions={metaData.predictions}
                        cloneAccuracy={metaData.cloneAccuracy}
                        cloneSummary={metaData.cloneSummary}
                    />
                </PresenceCard>
            </FadeSection>

            {/* Tab transition CTA */}
            <FadeSection>
                <button
                    type="button"
                    onClick={() => onTabChange?.("relations")}
                    className="flex w-full items-center justify-between rounded-2xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50 to-violet-50 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md dark:border-indigo-700/40 dark:from-indigo-950/30 dark:to-violet-950/20"
                >
                    <div>
                        <p className="text-sm font-bold text-indigo-700 dark:text-indigo-400">{L.change.nextTab}</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{L.change.nextTabSub}</p>
                    </div>
                    <span className="text-base text-indigo-500">→</span>
                </button>
            </FadeSection>
        </div>
    );
}
