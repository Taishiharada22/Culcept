"use client";

import { type ReactNode, type SetStateAction } from "react";
import {
    STYLE_LANE_OPTIONS,
    getStyleLaneMeta,
} from "../_lib/catalog";
import type {
    SavedState,
    StyleDepthBucket,
    StyleLaneCode,
} from "../_lib/types";

/* ─────────────────────── utils ─────────────────────── */

function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(" ");
}

function reorderByKey<T>(list: T[], sourceKey: string, targetKey: string, getKey: (item: T) => string) {
    const sourceIndex = list.findIndex((item) => getKey(item) === sourceKey);
    const targetIndex = list.findIndex((item) => getKey(item) === targetKey);
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return list;
    const next = [...list];
    const [source] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, source);
    return next;
}

type UnexpectedStyleLane = { laneCode: StyleLaneCode; priority: number; note?: string; createdAt: string };

/* ─────────────────────── constants ─────────────────────── */

const CORE_LIMITS: Record<StyleDepthBucket, number> = { core: 3, rare: 2, secret: 2 };
const UNEXPECTED_LANE_LIMIT = 3;

const BUCKET_META: Record<StyleDepthBucket | "unexpected", {
    title: string; heading: string; limit: number; isHero: boolean;
    shell: string; chip: string; accent: string; badge: "ink" | "sky" | "amber";
}> = {
    core: { title: "いつもの軸", heading: "いつも自分に戻る場所は？", limit: 3, isHero: true, shell: "border-slate-200/60 bg-white/80", chip: "border-slate-900 bg-slate-900 text-white", accent: "text-slate-500", badge: "ink" },
    rare: { title: "少し広げたい", heading: "少し広げたい", limit: 2, isHero: false, shell: "border-sky-200/60 bg-sky-50/50", chip: "border-sky-200 bg-sky-100 text-sky-800", accent: "text-sky-600", badge: "sky" },
    secret: { title: "気になっている", heading: "気になっている", limit: 2, isHero: false, shell: "border-amber-200/60 bg-amber-50/50", chip: "border-amber-200 bg-amber-100 text-amber-800", accent: "text-amber-600", badge: "amber" },
    unexpected: { title: "主軸外だけど気になる", heading: "主軸外だけど気になる", limit: 3, isHero: false, shell: "border-rose-200/60 bg-rose-50/50", chip: "border-rose-200 bg-rose-100 text-rose-800", accent: "text-rose-600", badge: "amber" },
};

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

function ImageSurface({ image, label, gradient, ratio = "aspect-[4/5]", hint }: { image?: string; label: string; gradient: string; ratio?: string; hint?: string }) {
    return (
        <div className={cx("overflow-hidden rounded-xl", ratio)}>
            {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt={label} className="h-full w-full object-cover" />
            ) : (
                <div className={cx("relative flex h-full w-full items-end overflow-hidden bg-gradient-to-br p-3 text-white", gradient)}>
                    <div className="absolute -right-4 top-2 h-16 w-16 rounded-full bg-white/10 blur-2xl" />
                    <div className="relative">
                        {hint ? <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">{hint}</div> : null}
                        <div className="mt-1 text-[13px] font-bold leading-tight">{label}</div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─────────────────────── LaneChip (selected lane) ─────────────────────── */

function LaneChip({ laneCode, isCore, onRemove, onDragStart, onDragOver, onDrop }: {
    laneCode: StyleLaneCode; isCore: boolean; onRemove: () => void;
    onDragStart: (e: React.DragEvent) => void; onDragOver: (e: React.DragEvent) => void; onDrop: (e: React.DragEvent) => void;
}) {
    const meta = getStyleLaneMeta(laneCode);
    if (isCore) {
        // Hero card with image
        return (
            <div draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
                className="w-24 shrink-0 rounded-xl overflow-hidden border border-white/80 bg-white shadow-sm cursor-grab active:cursor-grabbing">
                <div className="relative">
                    <ImageSurface image={meta?.images[0]} label={meta?.label ?? laneCode} gradient={meta?.gradient ?? "from-slate-700 to-slate-900"} ratio="aspect-[4/5]" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                        <span className="text-[11px] font-bold text-white">{meta?.label ?? laneCode}</span>
                    </div>
                </div>
                <button type="button" onClick={onRemove} className="w-full py-1 text-[10px] text-slate-400 hover:text-red-400">削除</button>
            </div>
        );
    }
    // Compact chip for rare/secret/unexpected
    return (
        <div draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
            className="shrink-0 rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5 shadow-sm cursor-grab active:cursor-grabbing flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-800">{meta?.label ?? laneCode}</span>
            <button type="button" onClick={onRemove} className="text-[10px] text-slate-400 hover:text-red-400">×</button>
        </div>
    );
}

/* ─────────────────────── CandidateChip (compact grid) ─────────────────────── */

function CandidateChip({ laneId, onAdd }: { laneId: StyleLaneCode; onAdd: (laneId: StyleLaneCode, target: StyleDepthBucket | "unexpected") => void }) {
    const meta = getStyleLaneMeta(laneId);
    return (
        <div className="group relative rounded-lg overflow-hidden border border-slate-200/60 bg-white transition hover:border-slate-300 hover:shadow-sm">
            <ImageSurface image={meta?.images[0]} label={meta?.label ?? laneId} gradient={meta?.gradient ?? "from-slate-700 to-slate-900"} ratio="aspect-square" />
            {/* Hover overlay with actions */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                <button type="button" onClick={() => onAdd(laneId, "core")} className="rounded bg-white/90 px-2 py-0.5 text-[9px] font-bold text-slate-900">軸</button>
                <button type="button" onClick={() => onAdd(laneId, "rare")} className="rounded bg-sky-100/90 px-2 py-0.5 text-[9px] font-bold text-sky-700">広げる</button>
                <button type="button" onClick={() => onAdd(laneId, "secret")} className="rounded bg-amber-100/90 px-2 py-0.5 text-[9px] font-bold text-amber-700">気になる</button>
                <button type="button" onClick={() => onAdd(laneId, "unexpected")} className="rounded bg-rose-100/90 px-2 py-0.5 text-[9px] font-bold text-rose-700">違和感</button>
            </div>
            <div className="px-1 py-0.5">
                <div className="truncate text-[10px] font-bold text-slate-800">{meta?.label ?? laneId}</div>
            </div>
        </div>
    );
}

/* ─────────────────────── StyleBucketShelf ─────────────────────── */

function StyleBucketShelf({ bucketKey, items, onReorder, onRemove }: {
    bucketKey: StyleDepthBucket | "unexpected";
    items: Array<{ laneCode: StyleLaneCode }>;
    onReorder: (src: string, tgt: string) => void;
    onRemove: (laneCode: StyleLaneCode) => void;
}) {
    const meta = BUCKET_META[bucketKey];
    return (
        <div className={cx("rounded-xl border border-b-2 border-b-stone-300/40 p-3", meta.shell)}>
            <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-slate-800">{meta.heading}</span>
                <Badge tone={meta.badge}>{items.length}/{meta.limit}</Badge>
            </div>
            {items.length === 0 ? (
                <p className={cx("mt-2 text-[11px]", meta.accent)}>下の候補から追加してください</p>
            ) : (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {items.map((entry) => (
                        <LaneChip
                            key={entry.laneCode}
                            laneCode={entry.laneCode}
                            isCore={meta.isHero}
                            onRemove={() => onRemove(entry.laneCode)}
                            onDragStart={(e) => e.dataTransfer.setData("text/plain", entry.laneCode)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => { e.preventDefault(); onReorder(e.dataTransfer.getData("text/plain"), entry.laneCode); }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/* ─────────────────────── StylesTab ─────────────────────── */

function createUnexpectedLane(laneCode: StyleLaneCode, priority: number): UnexpectedStyleLane {
    return { laneCode, priority, createdAt: new Date().toISOString() };
}

export default function StylesTab({ state, setState, pushNotice }: { state: SavedState; setState: (updater: SetStateAction<SavedState>) => void; pushNotice: (text: string) => void }) {
    const coreLanes = state.styleSelections.filter((e) => e.bucket === "core").sort((a, b) => a.priority - b.priority);
    const rareLanes = state.styleSelections.filter((e) => e.bucket === "rare").sort((a, b) => a.priority - b.priority);
    const secretLanes = state.styleSelections.filter((e) => e.bucket === "secret").sort((a, b) => a.priority - b.priority);
    const selectedLaneCodes = new Set([
        ...coreLanes.map((e) => e.laneCode), ...rareLanes.map((e) => e.laneCode), ...secretLanes.map((e) => e.laneCode),
        ...state.unexpectedStyleLanes.map((e) => e.laneCode),
    ]);
    const candidates = STYLE_LANE_OPTIONS.filter((lane) => !selectedLaneCodes.has(lane.id));

    const updateBucket = (laneId: StyleLaneCode, target: StyleDepthBucket | "unexpected") => {
        if (target === "unexpected") {
            if (state.unexpectedStyleLanes.length >= UNEXPECTED_LANE_LIMIT && !state.unexpectedStyleLanes.some((e) => e.laneCode === laneId)) {
                pushNotice("惹かれる違和感は 3 つまでです"); return;
            }
            setState((prev) => ({
                ...prev,
                styleSelections: prev.styleSelections.filter((e) => e.laneCode !== laneId),
                unexpectedStyleLanes: prev.unexpectedStyleLanes.some((e) => e.laneCode === laneId)
                    ? prev.unexpectedStyleLanes.filter((e) => e.laneCode !== laneId).map((e, i) => ({ ...e, priority: i }))
                    : [...prev.unexpectedStyleLanes.filter((e) => e.laneCode !== laneId), createUnexpectedLane(laneId, prev.unexpectedStyleLanes.length)],
            }));
            return;
        }
        const bucketCount = state.styleSelections.filter((e) => e.bucket === target).length;
        if (bucketCount >= CORE_LIMITS[target] && !state.styleSelections.some((e) => e.laneCode === laneId && e.bucket === target)) {
            pushNotice(`${target} は ${CORE_LIMITS[target]} つまでです`); return;
        }
        setState((prev) => {
            const remaining = prev.styleSelections.filter((e) => e.laneCode !== laneId);
            const nextBucket = remaining.filter((e) => e.bucket === target).length;
            return {
                ...prev,
                styleSelections: [...remaining, { laneCode: laneId, bucket: target, priority: nextBucket, createdAt: new Date().toISOString() }],
                unexpectedStyleLanes: prev.unexpectedStyleLanes.filter((e) => e.laneCode !== laneId).map((e, i) => ({ ...e, priority: i })),
            };
        });
    };

    const reorderBucket = (bucket: StyleDepthBucket, src: string, tgt: string) => {
        setState((prev) => {
            const bucketItems = prev.styleSelections.filter((e) => e.bucket === bucket).sort((a, b) => a.priority - b.priority);
            const reordered = reorderByKey(bucketItems, src, tgt, (i) => i.laneCode).map((e, i) => ({ ...e, priority: i }));
            return { ...prev, styleSelections: [...prev.styleSelections.filter((e) => e.bucket !== bucket), ...reordered] };
        });
    };

    const removeLane = (laneCode: StyleLaneCode) => {
        setState((prev) => ({
            ...prev,
            styleSelections: prev.styleSelections.filter((e) => e.laneCode !== laneCode),
            unexpectedStyleLanes: prev.unexpectedStyleLanes.filter((e) => e.laneCode !== laneCode).map((e, i) => ({ ...e, priority: i })),
        }));
    };

    return (
        <div className="space-y-4">
            {/* Shelves */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-[15px] font-black text-slate-900">スタイルの整理</h3>
                    <Badge tone="sky">{selectedLaneCodes.size} 選択中</Badge>
                </div>
                <StyleBucketShelf bucketKey="core" items={coreLanes} onReorder={(s, t) => reorderBucket("core", s, t)} onRemove={removeLane} />
                <StyleBucketShelf bucketKey="rare" items={rareLanes} onReorder={(s, t) => reorderBucket("rare", s, t)} onRemove={removeLane} />
                <StyleBucketShelf bucketKey="secret" items={secretLanes} onReorder={(s, t) => reorderBucket("secret", s, t)} onRemove={removeLane} />
                <StyleBucketShelf bucketKey="unexpected" items={state.unexpectedStyleLanes}
                    onReorder={(s, t) => setState((p) => ({ ...p, unexpectedStyleLanes: reorderByKey(p.unexpectedStyleLanes, s, t, (i) => i.laneCode).map((e, i) => ({ ...e, priority: i })) }))}
                    onRemove={removeLane} />
            </section>

            {/* Candidate grid — compact 4-7 columns */}
            <section>
                <h3 className="text-[13px] font-bold text-slate-700 mb-2">スタイル候補</h3>
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                    {candidates.map((lane) => <CandidateChip key={lane.id} laneId={lane.id} onAdd={updateBucket} />)}
                </div>
            </section>
        </div>
    );
}
