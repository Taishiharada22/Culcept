"use client";

import React from "react";
import type { WardrobeItem } from "../_lib/types";
import { qualityLabel } from "../_lib/taxonomy";

interface WardrobeCardProps {
    item: WardrobeItem;
    onEdit: () => void;
    onRemove: () => void;
    onAddToSetup?: () => void;
    /** M2-extra: tap で詳細モーダル（activeItem）を開く。 未指定なら従来挙動（tap で何もしない）。 */
    onSelect?: () => void;
}

export default function WardrobeCard({ item, onEdit, onRemove, onAddToSetup, onSelect }: WardrobeCardProps) {
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

                {/* M2-extra: image 全面の透明 button（onSelect 指定時のみ）。
                  *   - badge/swatch は pointer-events-none で透過、 tap は button が受ける
                  *   - hover overlay の 3 ボタンは DOM 後段＋ stopPropagation 済で衝突なし */}
                {onSelect && (
                    <button
                        type="button"
                        onClick={onSelect}
                        aria-label={`${item.name} の詳細を見る`}
                        className="absolute inset-0 z-[1] cursor-pointer bg-transparent appearance-none border-0 p-0 m-0"
                    />
                )}

                {/* Quality badge */}
                {qLabel && (
                    <div
                        className={`pointer-events-none absolute top-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-black shadow-sm ${
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
                        className="pointer-events-none absolute bottom-1.5 left-1.5 w-4 h-4 rounded-full border-2 border-white shadow-sm"
                        style={{ backgroundColor: item.colorHex }}
                        title={item.colorName ?? item.color}
                    />
                )}

                {/* Hover overlay with edit/remove (z-[2] で M2-extra 被せ button より上、 内側ボタンは stopPropagation 済) */}
                <div className="absolute inset-0 z-[2] bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
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
