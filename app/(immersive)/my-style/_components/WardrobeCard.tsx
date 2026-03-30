"use client";

import React from "react";
import type { WardrobeItem } from "../_lib/types";
import { qualityLabel } from "../_lib/taxonomy";

interface WardrobeCardProps {
    item: WardrobeItem;
    onEdit: () => void;
    onRemove: () => void;
    onAddToSetup?: () => void;
}

export default function WardrobeCard({ item, onEdit, onRemove, onAddToSetup }: WardrobeCardProps) {
    const qLabel = item.qualityScore != null ? qualityLabel(item.qualityScore) : null;

    return (
        <div className="group relative flex-shrink-0 w-[130px] snap-start">
            {/* Image */}
            <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-slate-100 border border-slate-200/60 shadow-sm">
                {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        draggable={false}
                    />
                ) : (
                    <div className="flex items-center justify-center w-full h-full text-3xl opacity-30">
                        📷
                    </div>
                )}

                {/* Quality badge */}
                {qLabel && (
                    <div
                        className={`absolute top-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-black shadow-sm ${
                            item.qualityScore! >= 80
                                ? "bg-emerald-500 text-white"
                                : item.qualityScore! >= 50
                                  ? "bg-amber-400 text-amber-900"
                                  : "bg-slate-300 text-slate-600"
                        }`}
                    >
                        {qLabel}
                    </div>
                )}

                {/* Color swatch */}
                {item.colorHex && (
                    <div
                        className="absolute bottom-1.5 left-1.5 w-4 h-4 rounded-full border-2 border-white shadow-sm"
                        style={{ backgroundColor: item.colorHex }}
                        title={item.colorName ?? item.color}
                    />
                )}

                {/* Hover overlay with edit/remove */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    {onAddToSetup ? (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onAddToSetup();
                            }}
                            className="h-8 w-8 rounded-full bg-white/90 flex items-center justify-center text-sm shadow-md hover:bg-indigo-50 transition"
                            title="セットアップに追加"
                        >
                            +
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit();
                        }}
                        className="h-8 w-8 rounded-full bg-white/90 flex items-center justify-center text-sm shadow-md hover:bg-white transition"
                        title="編集"
                    >
                        ✏️
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove();
                        }}
                        className="h-8 w-8 rounded-full bg-white/90 flex items-center justify-center text-sm shadow-md hover:bg-red-50 transition"
                        title="削除"
                    >
                        🗑️
                    </button>
                </div>
            </div>

            {/* Name label */}
            <div className="mt-1.5 px-0.5 text-[10px] font-bold text-slate-600 truncate text-center">
                {item.name}
            </div>
        </div>
    );
}
