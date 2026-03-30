"use client";

import type { DepthResponse } from "../_lib/presenceTypes";
import { L } from "../_lib/presenceI18n";
import { FadeSection, PresenceCard, EmptyStateCard } from "../_components/Primitives";
import ContradictionTheater from "../_components/ContradictionTheater";
import EntropySig from "../_components/EntropySig";
import DarkMatter from "../_components/DarkMatter";

type DepthTabProps = {
    depthData: DepthResponse | null;
    onTabChange?: (tab: string) => void;
};

export function DepthTab({ depthData, onTabChange }: DepthTabProps) {
    if (!depthData?.hasData) {
        return (
            <div data-testid="depth-tab">
                <EmptyStateCard
                    emoji="🔮"
                    title={L.depth.emptyTitle}
                    description={L.depth.emptySub}
                    ctaHref="/stargazer"
                    ctaLabel={L.depth.emptyCta}
                    ctaColor="violet"
                />
            </div>
        );
    }

    return (
        <div className="space-y-6" data-testid="depth-tab">
            <PresenceCard padding="md">
                <ContradictionTheater
                    contradictions={depthData.contradictions}
                    summary={depthData.contradictionSummary}
                    primaryTheme={depthData.primaryTheme}
                    totalContradictions={depthData.totalContradictions}
                    alignedAxes={depthData.alignedAxes}
                />
            </PresenceCard>

            <FadeSection>
                <PresenceCard padding="md">
                    <EntropySig entropy={depthData.entropy} />
                </PresenceCard>
            </FadeSection>

            <FadeSection>
                <PresenceCard padding="md">
                    <DarkMatter items={depthData.darkMatter} />
                </PresenceCard>
            </FadeSection>

            {/* Tab transition CTA */}
            <FadeSection>
                <button
                    type="button"
                    onClick={() => onTabChange?.("change")}
                    className="flex w-full items-center justify-between rounded-2xl border border-emerald-200/60 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md dark:border-emerald-700/40 dark:from-emerald-950/30 dark:to-teal-950/20"
                >
                    <div>
                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{L.depth.nextTab}</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{L.depth.nextTabSub}</p>
                    </div>
                    <span className="text-base text-emerald-500">→</span>
                </button>
            </FadeSection>
        </div>
    );
}
