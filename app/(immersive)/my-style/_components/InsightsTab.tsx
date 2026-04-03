"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { getStyleLaneLabel } from "../_lib/catalog";
import { buildMyStyleProfile, deriveMyStyleSignals } from "../_lib/state";
import type { SavedState } from "../_lib/types";
import type { SwipeLearningState } from "../_lib/swipeLearningAxes";

/* ─────────────────────── utils ─────────────────────── */

function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(" ");
}

function joinLabels(values: string[], fallback = "まだ十分な変化はありません") {
    return values.length > 0 ? values.join(" / ") : fallback;
}

function differenceList(current: string[], previous: string[]) {
    return current.filter((value) => value && !previous.includes(value));
}

function monthLabel(periodKey: string) {
    const [year, month] = periodKey.split("-");
    if (!year || !month) return periodKey;
    return `${year}.${month}`;
}

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

function EmptyState({ icon, text, action }: { icon: string; text: string; action?: { label: string; onClick: () => void } }) {
    return (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
            <span className="text-3xl">{icon}</span>
            <p className="max-w-xs text-sm leading-relaxed text-slate-500">{text}</p>
            {action ? (
                <button type="button" onClick={action.onClick} className="mt-1 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white">
                    {action.label}
                </button>
            ) : null}
        </div>
    );
}

function SectionHeading({ title, sub, badge, children }: { title: string; sub?: string; badge?: ReactNode; children?: ReactNode }) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                {sub ? <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{sub}</p> : null}
            </div>
            <div className="flex items-center gap-2">
                {badge}
                {children}
            </div>
        </div>
    );
}

/* ─────────────────────── InsightsTab ─────────────────────── */

export default function InsightsTab({ state, swipeState }: { state: SavedState; swipeState: SwipeLearningState | null }) {
    const derived = useMemo(() => deriveMyStyleSignals(state), [state]);
    const profile = useMemo(() => buildMyStyleProfile(state), [state]);

    useEffect(() => {
        try {
            navigator.sendBeacon("/api/stargazer/analytics", JSON.stringify({
                event: "mystyle_weekly_insight_shown",
                feature: "my-style",
                metadata: { snapshot_count: derived.timelineSnapshots.length, discovery_count: derived.discoveries.length },
            }));
        } catch { /* ignore */ }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const latestSnapshot = derived.timelineSnapshots[0] ?? null;
    const previousSnapshot = derived.timelineSnapshots[1] ?? null;
    const primaryShift = latestSnapshot && previousSnapshot && latestSnapshot.primaryLanes[0] !== previousSnapshot.primaryLanes[0]
        ? `${joinLabels(previousSnapshot.primaryLanes.map(getStyleLaneLabel), "前回なし")} から ${joinLabels(latestSnapshot.primaryLanes.map(getStyleLaneLabel), "今回なし")} に主軸が動いています`
        : latestSnapshot?.rareLanes[0]
            ? `${getStyleLaneLabel(latestSnapshot.rareLanes[0])} が主軸の横で強くなり始めています`
            : "主軸はまだ大きくは動いていません";
    const newImpressions = latestSnapshot ? differenceList(latestSnapshot.topImpressions, previousSnapshot?.topImpressions ?? []) : [];
    const newUnexpected = latestSnapshot ? differenceList(latestSnapshot.topUnexpectedPulls, previousSnapshot?.topUnexpectedPulls ?? []) : [];
    const newBecome = latestSnapshot ? differenceList(latestSnapshot.topBecomeResults, previousSnapshot?.topBecomeResults ?? []) : [];
    const emergingSignal = newImpressions[0]
        ? `新しく前に出た印象は ${newImpressions.join(" / ")} です`
        : newUnexpected[0]
            ? `前回にはなかった違和感として ${newUnexpected.join(" / ")} が見え始めました`
            : newBecome[0]
                ? `変化の癖として ${newBecome.join(" / ")} が新しく反復しています`
                : derived.discoveries[0] ?? "まだ明確な新規シグナルは少ないですが、観測は続いています";
    const evidenceLine = profile.self.timelineSignals[0]
        ?? profile.self.outfitSignals[0]
        ?? profile.self.wardrobeSignals[0]
        ?? "記録が増えるほど、ここに変化の根拠が蓄積されます";

    return (
        <div className="relative space-y-5 pl-8">
            {/* Timeline vertical line */}
            <div className="pointer-events-none absolute bottom-0 left-3 top-0 w-px bg-gradient-to-b from-blue-300/50 via-blue-200/30 to-transparent" />

            {/* Current contour */}
            <section className="relative rounded-2xl border border-blue-200/30 bg-gradient-to-br from-blue-50/40 to-white/90 p-5 shadow-sm">
                {/* Timeline dot */}
                <div className="absolute -left-[29px] top-6 h-3 w-3 animate-pulse rounded-full border-2 border-blue-500 bg-blue-500" />
                <SectionHeading title="いまの輪郭" />
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-xl bg-white/60 p-4">
                        <p className="text-[13px] leading-relaxed text-slate-700">{derived.currentContourText}</p>
                    </div>
                    <div className="rounded-xl bg-white/60 p-4">
                        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">構成</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {derived.coreLanes.map((l) => <Badge key={l} tone="ink">{getStyleLaneLabel(l)}</Badge>)}
                            {derived.rareLanes.map((l) => <Badge key={l} tone="sky">{getStyleLaneLabel(l)}</Badge>)}
                            {derived.secretLanes.map((l) => <Badge key={l} tone="amber">{getStyleLaneLabel(l)}</Badge>)}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {derived.dominantImpressions.map((l) => <Badge key={l} tone="sky">{l}</Badge>)}
                            {derived.dominantWorldviews.map((l) => <Badge key={l}>{l}</Badge>)}
                            {derived.repeatedBecomeResults.map((l) => <Badge key={l} tone="emerald">{l}</Badge>)}
                        </div>
                    </div>
                </div>
            </section>

            <div className="grid gap-3 lg:grid-cols-3">
                <section className="relative rounded-2xl border border-blue-200/30 bg-white/92 p-5 shadow-sm backdrop-blur">
                    <div className="absolute -left-[29px] top-6 h-3 w-3 rounded-full border-2 border-blue-400 bg-white" />
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-blue-400">軸の変化</div>
                    <div className="mt-2 text-[16px] font-black tracking-[-0.03em] text-slate-900">何が変わったか</div>
                    <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{primaryShift}</p>
                </section>
                <section className="relative rounded-2xl border border-blue-200/30 bg-white/92 p-5 shadow-sm backdrop-blur">
                    <div className="absolute -left-[29px] top-6 h-3 w-3 rounded-full border-2 border-blue-400 bg-white" />
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-blue-400">兆し</div>
                    <div className="mt-2 text-[16px] font-black tracking-[-0.03em] text-slate-900">何が見え始めたか</div>
                    <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{emergingSignal}</p>
                </section>
                <section className="relative rounded-2xl border border-blue-200/30 bg-white/92 p-5 shadow-sm backdrop-blur">
                    <div className="absolute -left-[29px] top-6 h-3 w-3 rounded-full border-2 border-blue-400 bg-white" />
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-blue-400">根拠</div>
                    <div className="mt-2 text-[16px] font-black tracking-[-0.03em] text-slate-900">変化の根拠</div>
                    <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{evidenceLine}</p>
                </section>
            </div>

            {/* Discoveries */}
            <section className="relative rounded-2xl border border-blue-200/30 bg-white/90 p-5 shadow-sm backdrop-blur">
                <div className="absolute -left-[29px] top-6 h-3 w-3 rounded-full border-2 border-blue-400 bg-white" />
                <SectionHeading title="新しく見つかったこと" sub="発見だけで終わらず、いま読むべき意味まで並べる" />
                <div className="mt-3 space-y-2.5">
                    {(derived.discoveries.length === 0 ? [derived.currentContourText] : derived.discoveries).map((entry, index) => (
                        <div key={`${entry}-${index}`} className="rounded-xl border border-blue-100/70 bg-blue-50/40 p-3">
                            <div className="text-[13px] font-bold leading-relaxed text-slate-800">{entry}</div>
                            <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500">
                                {index === 0
                                    ? primaryShift
                                    : index === 1
                                        ? emergingSignal
                                        : evidenceLine}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Style Timeline */}
            <section className="relative rounded-2xl border border-blue-200/30 bg-white/90 p-5 shadow-sm backdrop-blur">
                <div className="absolute -left-[29px] top-6 h-3 w-3 rounded-full border-2 border-blue-400 bg-white" />
                <SectionHeading title="変化の読み取り" sub="時系列で、何が増え、何が前に出たかを見る" />
                {derived.timelineSnapshots.length === 0 ? (
                    <div className="mt-3"><EmptyState icon="📈" text={`まだ履歴は浅いですが、${state.colorPrefs.dominant?.slice(0, 3).map((e) => e.value).join(" / ") || "整い"} に寄る兆しがあります`} /></div>
                ) : (
                    <div className="mt-3 space-y-2.5">
                        {derived.timelineSnapshots.map((s, index) => {
                            const previous = derived.timelineSnapshots[index + 1] ?? null;
                            const snapshotPrimaryShift = previous && s.primaryLanes[0] !== previous.primaryLanes[0]
                                ? `主軸 ${joinLabels(previous.primaryLanes.map(getStyleLaneLabel), "前回なし")} → ${joinLabels(s.primaryLanes.map(getStyleLaneLabel), "今回なし")}`
                                : null;
                            const snapshotNewUnexpected = differenceList(s.topUnexpectedPulls, previous?.topUnexpectedPulls ?? []);
                            const snapshotNewBecome = differenceList(s.topBecomeResults, previous?.topBecomeResults ?? []);
                            const snapshotEvidence = [
                                snapshotPrimaryShift,
                                snapshotNewUnexpected[0] ? `新しく出た違和感: ${snapshotNewUnexpected.join(" / ")}` : null,
                                snapshotNewBecome[0] ? `新しく反復した変化: ${snapshotNewBecome.join(" / ")}` : null,
                            ].filter(Boolean);
                            return (
                                <div key={s.id} className="rounded-xl border border-blue-200/40 bg-blue-50/30 p-3.5">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-[13px] font-bold text-slate-800">{monthLabel(s.periodKey)}</span>
                                        <Badge tone="sky">{s.primaryLanes.map(getStyleLaneLabel).join(" / ") || "—"}</Badge>
                                    </div>
                                    <p className="mt-2 text-[12px] leading-relaxed text-slate-600">{s.summary}</p>
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {s.topImpressions.slice(0, 2).map((l) => <Badge key={l}>{l}</Badge>)}
                                        {s.topBecomeResults.slice(0, 2).map((l) => <Badge key={l} tone="emerald">{l}</Badge>)}
                                        {s.topUnexpectedPulls.slice(0, 1).map((l) => <Badge key={l} tone="amber">{l}</Badge>)}
                                    </div>
                                    {snapshotEvidence.length > 0 ? (
                                        <div className="mt-3 rounded-lg border border-white/70 bg-white/70 p-3">
                                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-400">読み取り</div>
                                            <div className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-slate-600">
                                                {snapshotEvidence.map((line) => <p key={line}>{line}</p>)}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Self-forming narrative */}
            <div className="grid gap-3 lg:grid-cols-2">
                <section className="relative rounded-2xl border border-blue-200/30 bg-white/90 p-5 shadow-sm backdrop-blur">
                    <div className="absolute -left-[29px] top-6 h-3 w-3 rounded-full border-2 border-blue-400 bg-white" />
                    <SectionHeading title="自分を形作っているもの" />
                    <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-slate-600">
                        {derived.selfFormingItems[0] ? (
                            <p>{state.wardrobe.find((i) => i.id === derived.selfFormingItems[0].itemId)?.name ?? "主力アイテム"} が「{derived.dominantImpressions[0] ?? "整い"}」と「{derived.dominantWorldviews[0] ?? "自然体"}」を支えている</p>
                        ) : <p>自分を形作るアイテムがまだ十分ではありません</p>}
                        {derived.repeatedBecomeResults[0] ? <p>「{derived.repeatedBecomeResults[0]}」への変化が繰り返されている</p> : null}
                        {profile.self.wardrobeSignals.map((l) => <p key={l}>{l}</p>)}
                    </div>
                </section>
                <section className="relative rounded-2xl border border-blue-200/30 bg-white/90 p-5 shadow-sm backdrop-blur">
                    <SectionHeading title="次の一歩" />
                    <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-slate-600">
                        {derived.nextActions.length === 0 ? <p>主要な入力は揃っています。時間差の変化を残すと精度が上がります</p> : derived.nextActions.map((e) => <p key={e}>{e}</p>)}
                    </div>
                </section>
            </div>

        </div>
    );
}
