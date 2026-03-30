"use client";

import { useState, type ReactNode } from "react";
import { cx, reorderByKey, SHELF_TONES } from "../_lib/pageUtils";
import type { CandidateChoice } from "../_lib/pageUtils";
import type { SelectedPreferenceTag } from "../_lib/types";

/* ─────────────────────── Badge ─────────────────────── */

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "ink" | "sky" | "emerald" | "amber" }) {
    const tones = {
        slate: "border-slate-200 bg-slate-50 text-slate-600",
        ink: "border-slate-800 bg-slate-900 text-white",
        sky: "border-sky-200 bg-sky-50 text-sky-700",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
        amber: "border-amber-200 bg-amber-50 text-amber-700",
    };
    return <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide", tones[tone])}>{children}</span>;
}

/* ─────────────────────── Card ─────────────────────── */

export function Card({ id, className, children, gradient }: { id?: string; className?: string; children: ReactNode; gradient?: boolean }) {
    return (
        <section
            id={id}
            className={cx(
                "rounded-2xl border p-5",
                gradient
                    ? "border-white/50 bg-gradient-to-br from-white/95 to-white/80 shadow-lg shadow-slate-900/[0.04] backdrop-blur-xl"
                    : "border-slate-200/70 bg-white/90 shadow-sm backdrop-blur",
                className
            )}
        >
            {children}
        </section>
    );
}

/* ─────────────────────── EmptyState ─────────────────────── */

export function EmptyState({ icon, text, action }: { icon: string; text: string; action?: { label: string; onClick: () => void } }) {
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

/* ─────────────────────── SectionHeading ─────────────────────── */

export function SectionHeading({ title, sub, badge, children }: { title: string; sub?: string; badge?: ReactNode; children?: ReactNode }) {
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

/* ─────────────────────── Chip ─────────────────────── */

export function Chip({
    label,
    active,
    onClick,
    tone = "default",
}: {
    label: string;
    active?: boolean;
    onClick: () => void;
    tone?: "default" | "sky" | "amber" | "rose";
}) {
    const styles = {
        default: active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
        sky: active ? "border-sky-600 bg-sky-600 text-white" : "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300",
        amber: active ? "border-amber-600 bg-amber-600 text-white" : "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300",
        rose: active ? "border-rose-600 bg-rose-600 text-white" : "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300",
    };
    return (
        <button type="button" onClick={onClick} className={cx("rounded-full border px-3 py-1.5 text-xs font-bold transition-all", styles[tone])}>
            {label}
        </button>
    );
}

/* ─────────────────────── ImageSurface ─────────────────────── */

export function ImageSurface({ image, label, gradient, ratio = "aspect-[4/5]", hint }: { image?: string; label: string; gradient: string; ratio?: string; hint?: string }) {
    return (
        <div className={cx("overflow-hidden rounded-xl", ratio)}>
            {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt={label} loading="lazy" decoding="async" className="h-full w-full object-cover" />
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

/* ─────────────────────── SelectionPill ─────────────────────── */

export function SelectionPill({ label, onRemove, priority, tone = "core" }: { label: string; onRemove: () => void; priority?: number; tone?: keyof typeof SHELF_TONES }) {
    const palette = SHELF_TONES[tone];
    return (
        <div className={cx("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition hover:-translate-y-0.5", palette.chip)}>
            {typeof priority === "number" ? <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[10px]">{priority + 1}</span> : null}
            <span>{label}</span>
            <button type="button" onClick={onRemove} className="text-current/50 hover:text-current">×</button>
        </div>
    );
}

/* ─────────────────────── AccumulatingSelectionSection ─────────────────────── */

type AccumulatingSelectionProps = {
    title: string;
    description?: string;
    selected: SelectedPreferenceTag[];
    candidates: CandidateChoice[];
    max?: number;
    emptyMessage?: string;
    tone?: keyof typeof SHELF_TONES;
    getKey: (item: SelectedPreferenceTag) => string;
    onSelect: (item: CandidateChoice) => void;
    onRemove: (item: SelectedPreferenceTag) => void;
    onReorder?: (items: SelectedPreferenceTag[]) => void;
    renderSelected: (item: SelectedPreferenceTag) => ReactNode;
    renderCandidate: (item: CandidateChoice) => ReactNode;
};

export function AccumulatingSelectionSection({
    title, description, selected, candidates, max, emptyMessage = "下の候補から選ぶと、ここに積み上がります。",
    tone = "core", getKey, onSelect, onRemove, onReorder, renderSelected, renderCandidate,
}: AccumulatingSelectionProps) {
    const palette = SHELF_TONES[tone];
    const [expanded, setExpanded] = useState(false);
    const visibleCandidates = expanded ? candidates : candidates.slice(0, 12);

    return (
        <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h4 className="text-[15px] font-bold text-slate-900">{title}</h4>
                    {description ? <p className="mt-0.5 text-[13px] text-slate-500">{description}</p> : null}
                </div>
                {max ? <Badge tone={palette.badge}>{selected.length}/{max}</Badge> : null}
            </div>

            <div className={cx("mt-3 rounded-xl border p-3", palette.shell)}>
                {selected.length === 0 ? (
                    <p className="px-2 py-2 text-[13px] text-slate-400">{emptyMessage}</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {selected.map((item) => {
                            const key = getKey(item);
                            return (
                                <div
                                    key={key}
                                    draggable
                                    onDragStart={(event) => event.dataTransfer.setData("text/plain", key)}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={(event) => {
                                        if (!onReorder) return;
                                        event.preventDefault();
                                        onReorder(reorderByKey(selected, event.dataTransfer.getData("text/plain"), key, getKey));
                                    }}
                                >
                                    {renderSelected(item)}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
                {visibleCandidates.map((item) => (
                    <button
                        key={item.code}
                        type="button"
                        onClick={() => onSelect(item)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                        {renderCandidate(item)}
                    </button>
                ))}
                {candidates.length > 12 && !expanded ? (
                    <button type="button" onClick={() => setExpanded(true)} className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-slate-400 hover:text-slate-600">
                        +{candidates.length - 12} もっと見る
                    </button>
                ) : null}
            </div>
        </Card>
    );
}
