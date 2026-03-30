"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { deriveMyStyleSignals } from "../_lib/state";
import { CATEGORY_LABELS, cx, getWardrobeRoleMeta } from "../_lib/pageUtils";
import type { SavedState } from "../_lib/types";
import { Badge, EmptyState, ImageSurface, SectionHeading } from "./Primitives";

type Props = {
    state: SavedState;
    activeItemId?: string | null;
    onSelectItem: (itemId: string) => void;
    className?: string;
};

export default function ShowcaseRail({ state, activeItemId = null, onSelectItem, className }: Props) {
    const derived = useMemo(() => deriveMyStyleSignals(state), [state]);
    const [viewMode, setViewMode] = useState<"grid" | "roles">("grid");
    const [isInteracting, setIsInteracting] = useState(false);
    const railScrollerRef = useRef<HTMLDivElement | null>(null);
    const resumeTimerRef = useRef<number | null>(null);

    const railEntries = useMemo(() => {
        if (viewMode === "grid") {
            return state.wardrobe.map((item) => ({
                key: item.id,
                item,
                badge: CATEGORY_LABELS[item.category],
                badgeTone: "slate" as const,
                summary: item.colorName ?? item.color,
            }));
        }
        return derived.selfFormingItems
            .map((signal) => {
                const item = state.wardrobe.find((entry) => entry.id === signal.itemId);
                if (!item) return null;
                const role = getWardrobeRoleMeta(signal);
                return {
                    key: `${item.id}-${role.label}`,
                    item,
                    badge: role.label,
                    badgeTone: role.tone,
                    summary: role.description,
                };
            })
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    }, [derived.selfFormingItems, state.wardrobe, viewMode]);

    const railLoop = railEntries.length > 0 ? [...railEntries, ...railEntries] : [];
    const isPaused = isInteracting || Boolean(activeItemId);

    const scheduleResume = () => {
        if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = window.setTimeout(() => setIsInteracting(false), 900);
    };

    useEffect(() => {
        const node = railScrollerRef.current;
        if (!node || isPaused || railEntries.length === 0) return;

        let frameId = 0;
        let lastTime = 0;
        const speedPerMs = 0.035;

        const tick = (time: number) => {
            if (!lastTime) lastTime = time;
            const delta = time - lastTime;
            lastTime = time;

            const loopWidth = node.scrollWidth / 2;
            if (loopWidth > 0) {
                node.scrollLeft += delta * speedPerMs;
                if (node.scrollLeft >= loopWidth) node.scrollLeft -= loopWidth;
            }

            frameId = window.requestAnimationFrame(tick);
        };

        frameId = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frameId);
    }, [isPaused, railEntries.length, viewMode]);

    useEffect(() => () => {
        if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    }, []);

    return (
        <section
            className={cx(
                "overflow-hidden rounded-[22px] border border-amber-200/60 bg-[linear-gradient(180deg,rgba(255,247,237,0.96),rgba(255,255,255,0.88))] p-3.5 shadow-lg shadow-amber-500/[0.06] backdrop-blur-xl",
                className,
            )}
        >
            <div className="flex items-center justify-between gap-3">
                <SectionHeading title="SHOW CASE" sub="流し見しながら、服の全体感と役割をつかむ" />
                <div className="flex rounded-full border border-slate-200/80 bg-white/90 p-0.5">
                    <button
                        type="button"
                        onClick={() => setViewMode("grid")}
                        className={cx(
                            "rounded-full px-2.5 py-1 text-[11px] font-bold transition",
                            viewMode === "grid" ? "bg-slate-900 text-white" : "text-slate-500",
                        )}
                    >
                        一覧
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewMode("roles")}
                        className={cx(
                            "rounded-full px-2.5 py-1 text-[11px] font-bold transition",
                            viewMode === "roles" ? "bg-slate-900 text-white" : "text-slate-500",
                        )}
                    >
                        役割別
                    </button>
                </div>
            </div>

            {railEntries.length === 0 ? (
                <div className="mt-3">
                    <EmptyState icon="🧥" text="ワードローブを追加すると、ここに持ち物の全体像が流れます。" />
                </div>
            ) : (
                <div
                    ref={railScrollerRef}
                    className="mt-3 overflow-x-auto overscroll-x-contain scrollbar-hide"
                    onPointerDown={() => setIsInteracting(true)}
                    onPointerUp={() => setIsInteracting(false)}
                    onPointerLeave={() => setIsInteracting(false)}
                    onPointerCancel={() => setIsInteracting(false)}
                    onTouchStart={() => {
                        setIsInteracting(true);
                        scheduleResume();
                    }}
                    onTouchEnd={scheduleResume}
                    onWheel={() => {
                        setIsInteracting(true);
                        scheduleResume();
                    }}
                >
                    <div className="flex w-max gap-2 pr-2">
                        {railLoop.map((entry, index) => (
                            <button
                                key={`${entry.key}-${index}`}
                                type="button"
                                onClick={() => onSelectItem(entry.item.id)}
                                className="group w-28 shrink-0 overflow-hidden rounded-xl border border-slate-200/70 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:w-32"
                            >
                                <div className="relative">
                                    <ImageSurface image={entry.item.imageUrl} label={entry.item.name} gradient="from-slate-700 to-slate-900" ratio="aspect-[6/5]" />
                                    <div className="absolute left-1.5 top-1.5">
                                        <Badge tone={entry.badgeTone}>{entry.badge}</Badge>
                                    </div>
                                </div>
                                <div className="p-2">
                                    <div className="truncate text-[12px] font-bold text-slate-800">{entry.item.name}</div>
                                    <p className="mt-0.5 line-clamp-1 text-[11px] leading-relaxed text-slate-500">{entry.summary}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
