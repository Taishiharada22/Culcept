"use client";

import { useMemo } from "react";
import { cx } from "../_lib/pageUtils";
import type { SavedState } from "../_lib/types";

type Props = {
    state: SavedState;
    activeItemId?: string | null;
    onSelectItem: (itemId: string) => void;
    className?: string;
};

export default function ShowcaseRail({ state, activeItemId = null, onSelectItem, className }: Props) {
    const items = state.wardrobe;

    if (items.length === 0) return null;

    return (
        <div className={cx("flex gap-1 overflow-x-auto scrollbar-hide", className)}>
            {items.slice(0, 20).map((item) => (
                <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectItem(item.id)}
                    className={cx(
                        "shrink-0 w-12 h-12 rounded-lg overflow-hidden border transition",
                        activeItemId === item.id
                            ? "border-slate-900 ring-1 ring-slate-900/20"
                            : "border-slate-200/50 hover:border-slate-300",
                    )}
                >
                    {item.imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                        <div className="h-full w-full" style={{ backgroundColor: item.colorHex ?? "#e2e8f0" }} />
                    )}
                </button>
            ))}
        </div>
    );
}
