"use client";

import { useMemo, type ReactNode } from "react";
import { getStyleLaneLabel } from "../_lib/catalog";
import { deriveMyStyleSignals } from "../_lib/state";
import type { SavedState } from "../_lib/types";
import type { SwipeLearningState } from "../_lib/swipeLearningAxes";
import { type TabId, type SyncStatus, cx } from "../_lib/pageUtils";

/* ─────────────────────── MyStyleHero (compact) ─────────────────────── */

export default function MyStyleHero({
    state,
    tab,
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
    const coreLabel = derived.coreLanes[0] ? getStyleLaneLabel(derived.coreLanes[0]) : null;
    const rareLabel = derived.rareLanes[0] ? getStyleLaneLabel(derived.rareLanes[0]) : null;

    // Compact identity line
    const identityLine = coreLabel && rareLabel
        ? `${coreLabel}を軸に、${rareLabel}で揺らす`
        : coreLabel
            ? `${coreLabel}を中心に輪郭が見えてきた`
            : derived.currentContourText || "スタイルの輪郭を育成中";

    return (
        <div className="space-y-3">
            {/* Identity + stats in one compact block */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold leading-snug text-slate-900">{identityLine}</p>
                    {derived.dominantImpressions[0] && (
                        <p className="mt-0.5 text-[11px] text-slate-400">{derived.dominantImpressions[0]}の印象</p>
                    )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <div className="text-center">
                        <div className="text-[16px] font-black text-slate-900">{state.wardrobe.length}</div>
                        <div className="text-[9px] text-slate-400">着</div>
                    </div>
                    <div className="text-center">
                        <div className="text-[16px] font-black text-slate-900">{state.setups.length}</div>
                        <div className="text-[9px] text-slate-400">組</div>
                    </div>
                    {(derived.discoveries.length + derived.timelineTrend.length) > 0 && (
                        <div className="text-center">
                            <div className="text-[16px] font-black text-slate-900">{derived.discoveries.length + derived.timelineTrend.length}</div>
                            <div className="text-[9px] text-slate-400">発見</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Lane chips */}
            {(coreLabel || rareLabel) && (
                <div className="flex gap-1.5">
                    {coreLabel && <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">{coreLabel}</span>}
                    {rareLabel && <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">{rareLabel}</span>}
                    {derived.secretLanes[0] && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                            {getStyleLaneLabel(derived.secretLanes[0])}
                        </span>
                    )}
                </div>
            )}

            {secondaryPanel}
        </div>
    );
}
