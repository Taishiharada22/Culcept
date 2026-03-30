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

const SHELF_TONES = {
    core: { shell: "border-slate-200/60 bg-white/80", chip: "border-slate-900 bg-slate-900 text-white", accent: "text-slate-500", badge: "ink" as const },
    rare: { shell: "border-sky-200/60 bg-sky-50/50", chip: "border-sky-200 bg-sky-100 text-sky-800", accent: "text-sky-600", badge: "sky" as const },
    secret: { shell: "border-amber-200/60 bg-amber-50/50", chip: "border-amber-200 bg-amber-100 text-amber-800", accent: "text-amber-600", badge: "amber" as const },
    unexpected: { shell: "border-rose-200/60 bg-rose-50/50", chip: "border-rose-200 bg-rose-100 text-rose-800", accent: "text-rose-600", badge: "amber" as const },
} as const;

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

/* ─────────────────────── StyleLaneCandidateCard ─────────────────────── */

function StyleLaneCandidateCard({ laneId, onAdd }: { laneId: StyleLaneCode; onAdd: (laneId: StyleLaneCode, target: StyleDepthBucket | "unexpected") => void }) {
    const meta = getStyleLaneMeta(laneId);
    return (
        <div className="group rounded-xl border border-slate-200/60 bg-white/70 p-1.5 transition hover:border-slate-300 hover:shadow-md">
            <ImageSurface image={meta?.images[0]} label={meta?.label ?? laneId} hint={meta?.description?.split("、")[0]} gradient={meta?.gradient ?? "from-slate-700 to-slate-900"} ratio="aspect-square" />
            <div className="mt-1.5 px-0.5">
                <div className="text-[12px] font-bold text-slate-800">{meta?.label ?? laneId}</div>
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{meta?.description}</p>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1">
                <button type="button" onClick={() => onAdd(laneId, "core")} className="rounded-md bg-slate-900 py-1 text-[9px] font-bold text-white">軸</button>
                <button type="button" onClick={() => onAdd(laneId, "rare")} className="rounded-md bg-sky-50 py-1 text-[9px] font-bold text-sky-700">広げる</button>
                <button type="button" onClick={() => onAdd(laneId, "secret")} className="rounded-md bg-amber-50 py-1 text-[9px] font-bold text-amber-700">気になる</button>
                <button type="button" onClick={() => onAdd(laneId, "unexpected")} className="rounded-md bg-rose-50 py-1 text-[9px] font-bold text-rose-700">違和感</button>
            </div>
        </div>
    );
}

/* ─────────────────────── StyleBucketShelf ─────────────────────── */

function StyleBucketShelf({ title, description, items, limit, onReorder, onRemove, tone }: {
    title: string; description: string; items: Array<{ laneCode: StyleLaneCode }>; limit: number;
    onReorder: (src: string, tgt: string) => void; onRemove: (laneCode: StyleLaneCode) => void; tone: keyof typeof SHELF_TONES;
}) {
    const palette = SHELF_TONES[tone];
    return (
        <div className={cx("rounded-xl border border-b-2 border-b-stone-300/40 p-4", palette.shell)}>
            <div className="flex items-center justify-between gap-2">
                <div>
                    <span className="text-[13px] font-bold text-slate-800">{title}</span>
                    <span className="ml-2 text-[11px] text-slate-400">{description}</span>
                </div>
                <Badge tone={palette.badge}>{items.length}/{limit}</Badge>
            </div>
            {items.length === 0 ? (
                <p className={cx("mt-3 text-[12px]", palette.accent)}>下の候補から追加してください</p>
            ) : (
                <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
                    {items.map((entry) => {
                        const meta = getStyleLaneMeta(entry.laneCode);
                        return (
                            <div key={entry.laneCode} draggable
                                onDragStart={(e) => e.dataTransfer.setData("text/plain", entry.laneCode)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => { e.preventDefault(); onReorder(e.dataTransfer.getData("text/plain"), entry.laneCode); }}
                                className="w-28 shrink-0 rounded-xl border border-white/80 bg-white/90 p-2 shadow-sm"
                            >
                                <ImageSurface image={meta?.images[0]} label={meta?.label ?? entry.laneCode} gradient={meta?.gradient ?? "from-slate-700 to-slate-900"} ratio="aspect-square" />
                                <div className="mt-1.5 flex items-center gap-1.5">
                                    <span className={cx("grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold", palette.chip)}>{items.indexOf(entry) + 1}</span>
                                    <span className="truncate text-[12px] font-bold text-slate-800">{meta?.label ?? entry.laneCode}</span>
                                </div>
                                <button type="button" onClick={() => onRemove(entry.laneCode)} className="mt-1.5 text-[10px] text-slate-400 hover:text-red-400">削除</button>
                            </div>
                        );
                    })}
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
        <div className="space-y-5">
            {/* Shelves */}
            <section className="rounded-2xl border border-teal-200/40 bg-gradient-to-br from-teal-50/40 to-white/90 p-5 shadow-sm">
                <SectionHeading title="スタイルの整理" sub="惹かれ方を、分かりやすい役割で並べ替える" badge={<Badge tone="sky">{selectedLaneCodes.size} 選択中</Badge>} />
                <div className="mt-4 space-y-3">
                    <StyleBucketShelf title="いつもの軸" description="普段の印象の中心" items={coreLanes} limit={CORE_LIMITS.core} onReorder={(s, t) => reorderBucket("core", s, t)} onRemove={removeLane} tone="core" />
                    <StyleBucketShelf title="少し広げたい" description="たまに前に出したい方向" items={rareLanes} limit={CORE_LIMITS.rare} onReorder={(s, t) => reorderBucket("rare", s, t)} onRemove={removeLane} tone="rare" />
                    <StyleBucketShelf title="気になっている" description="まだ試し切れていない惹かれ" items={secretLanes} limit={CORE_LIMITS.secret} onReorder={(s, t) => reorderBucket("secret", s, t)} onRemove={removeLane} tone="secret" />
                    <StyleBucketShelf title="主軸外だけど気になる" description="系統は違うのに惹かれる" items={state.unexpectedStyleLanes} limit={UNEXPECTED_LANE_LIMIT}
                        onReorder={(s, t) => setState((p) => ({ ...p, unexpectedStyleLanes: reorderByKey(p.unexpectedStyleLanes, s, t, (i) => i.laneCode).map((e, i) => ({ ...e, priority: i })) }))} onRemove={removeLane} tone="unexpected" />
                </div>
            </section>

            {/* Candidate grid */}
            <section className="rounded-2xl border border-teal-200/40 bg-white/90 p-5 shadow-sm backdrop-blur">
                <SectionHeading title="スタイル候補" sub="気になるスタイルを小さく見比べながら振り分ける" />
                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {candidates.map((lane) => <StyleLaneCandidateCard key={lane.id} laneId={lane.id} onAdd={updateBucket} />)}
                </div>
            </section>
        </div>
    );
}
