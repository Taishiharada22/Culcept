"use client";

import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { WardrobeItem } from "../_lib/types";
import { analyzeColorGroup, type ColorHarmonyResult } from "../_lib/colorHarmony";

type Props = {
    items: WardrobeItem[];
};

type CanvasItem = {
    itemId: string;
    x: number;
    y: number;
    scale: number;
    rotation: number;
};

const CANVAS_W = 300;
const CANVAS_H = 400;

export default function FlatLayComposer({ items }: Props) {
    const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
    const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

    const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

    const canvasColors = useMemo(() => {
        return canvasItems
            .map((ci) => itemMap.get(ci.itemId)?.colorHex)
            .filter((hex): hex is string => !!hex);
    }, [canvasItems, itemMap]);

    const colorAnalysis = useMemo(() => analyzeColorGroup(canvasColors), [canvasColors]);

    const snapToGrid = (val: number) => Math.round(val / 25) * 25;

    const autoLayout = useCallback(() => {
        setCanvasItems((prev) => {
            const n = prev.length;
            if (n === 0) return prev;
            if (n === 1) {
                return [{ ...prev[0], x: snapToGrid(CANVAS_W / 2 - 32), y: snapToGrid(CANVAS_H / 2 - 32) }];
            }
            if (n === 2) {
                return [
                    { ...prev[0], x: snapToGrid(CANVAS_W / 4 - 32), y: snapToGrid(CANVAS_H / 2 - 32) },
                    { ...prev[1], x: snapToGrid((CANVAS_W * 3) / 4 - 32), y: snapToGrid(CANVAS_H / 2 - 32) },
                ];
            }
            if (n === 3) {
                return [
                    { ...prev[0], x: snapToGrid(CANVAS_W / 2 - 32), y: snapToGrid(60) },
                    { ...prev[1], x: snapToGrid(CANVAS_W / 4 - 32), y: snapToGrid(220) },
                    { ...prev[2], x: snapToGrid((CANVAS_W * 3) / 4 - 32), y: snapToGrid(220) },
                ];
            }
            // 4+ items: 2x2 grid
            return prev.map((ci, i) => {
                const col = i % 2;
                const row = Math.floor(i / 2);
                return {
                    ...ci,
                    x: snapToGrid(CANVAS_W / 4 - 32 + col * (CANVAS_W / 2)),
                    y: snapToGrid(60 + row * 150),
                };
            });
        });
    }, []);

    const addToCanvas = useCallback((itemId: string) => {
        setCanvasItems((prev) => {
            if (prev.some((ci) => ci.itemId === itemId)) return prev;
            return [
                ...prev,
                {
                    itemId,
                    x: CANVAS_W / 2 - 30 + (prev.length * 15) % 60,
                    y: 60 + (prev.length * 80) % (CANVAS_H - 120),
                    scale: 1,
                    rotation: (Math.random() - 0.5) * 10,
                },
            ];
        });
    }, []);

    const removeFromCanvas = useCallback((itemId: string) => {
        setCanvasItems((prev) => prev.filter((ci) => ci.itemId !== itemId));
    }, []);

    const availableItems = items.filter((i) => !canvasItems.some((ci) => ci.itemId === i.id));

    return (
        <div className="space-y-4">
            {/* Auto-layout button */}
            {canvasItems.length >= 2 && (
                <div className="flex justify-end">
                    <button
                        onClick={autoLayout}
                        className="text-xs text-orange-500 font-bold px-3 py-1.5 rounded-full bg-orange-50 hover:bg-orange-100 transition-colors"
                    >
                        ✨ 自動配置
                    </button>
                </div>
            )}

            {/* Canvas */}
            <GlassCard className="p-2 relative overflow-hidden" style={{ minHeight: CANVAS_H }}>
                <div
                    className="relative mx-auto bg-gradient-to-b from-slate-50 to-white rounded-lg border border-dashed border-slate-200"
                    style={{ width: CANVAS_W, height: CANVAS_H }}
                >
                    {canvasItems.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-xs">
                            下のアイテムをタップして追加
                        </div>
                    )}

                    {canvasItems.map((ci) => {
                        const item = itemMap.get(ci.itemId);
                        if (!item) return null;
                        return (
                            <motion.div
                                key={ci.itemId}
                                drag
                                dragMomentum={false}
                                onDragEnd={(_e, info) => {
                                    setCanvasItems((prev) =>
                                        prev.map((c) =>
                                            c.itemId === ci.itemId
                                                ? { ...c, x: snapToGrid(c.x + info.offset.x), y: snapToGrid(c.y + info.offset.y) }
                                                : c,
                                        ),
                                    );
                                }}
                                className="absolute cursor-grab active:cursor-grabbing"
                                style={{
                                    left: ci.x,
                                    top: ci.y,
                                    rotate: ci.rotation,
                                    scale: ci.scale,
                                }}
                                whileDrag={{ scale: 1.1, zIndex: 50 }}
                            >
                                <div className="relative group">
                                    <div
                                        className="w-16 h-16 rounded-lg shadow-md border-2 border-white overflow-hidden"
                                        style={{ backgroundColor: item.colorHex ?? "#e2e8f0" }}
                                    >
                                        {item.imageUrl ? (
                                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white/80">
                                                {item.name.slice(0, 1)}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeFromCanvas(ci.itemId);
                                        }}
                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-400 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                    >
                                        ×
                                    </button>
                                    <p className="text-[8px] text-slate-500 text-center mt-0.5 truncate max-w-[64px]">
                                        {item.name}
                                    </p>
                                    {item.materialFamily && item.materialFamily.length > 0 && (
                                        <span className="block text-[7px] text-slate-400 text-center truncate max-w-[64px]">
                                            {item.materialFamily[0]}
                                        </span>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </GlassCard>

            {/* Color harmony score */}
            {canvasItems.length >= 2 && (
                <GlassCard className="p-3">
                    <div className="flex items-center gap-3">
                        <div className="flex -space-x-1">
                            {canvasColors.map((hex, i) => (
                                <div
                                    key={i}
                                    className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                                    style={{ backgroundColor: hex }}
                                />
                            ))}
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full rounded-full"
                                        style={{
                                            backgroundColor:
                                                colorAnalysis.overallScore >= 80
                                                    ? "#22c55e"
                                                    : colorAnalysis.overallScore >= 60
                                                      ? "#f59e0b"
                                                      : "#ef4444",
                                        }}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${colorAnalysis.overallScore}%` }}
                                        transition={{ duration: 0.5 }}
                                    />
                                </div>
                                <span className="text-xs font-mono text-slate-600">
                                    {colorAnalysis.overallScore}
                                </span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">{colorAnalysis.suggestion}</p>
                        </div>
                    </div>

                    {/* Pair details */}
                    {colorAnalysis.pairs.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                            {colorAnalysis.pairs.map((pair, i) => (
                                <span
                                    key={i}
                                    className={`rounded-full px-2 py-0.5 text-[9px] ${
                                        pair.result.score >= 80
                                            ? "bg-green-50 text-green-600"
                                            : pair.result.score >= 60
                                              ? "bg-amber-50 text-amber-600"
                                              : "bg-red-50 text-red-600"
                                    }`}
                                >
                                    {pair.result.label}
                                </span>
                            ))}
                        </div>
                    )}
                </GlassCard>
            )}

            {/* Item picker */}
            <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest px-1 mb-1.5">
                    アイテムを追加
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {availableItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => addToCanvas(item.id)}
                            className="shrink-0 group"
                        >
                            <div
                                className="w-14 h-14 rounded-lg border-2 border-slate-200 overflow-hidden transition-all group-hover:border-orange-400 group-hover:shadow-md"
                                style={{ backgroundColor: item.colorHex ?? "#e2e8f0" }}
                            >
                                {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white/80">
                                        {item.name.slice(0, 1)}
                                    </div>
                                )}
                            </div>
                            <p className="text-[8px] text-slate-500 truncate max-w-[56px] mt-0.5 text-center">
                                {item.name}
                            </p>
                        </button>
                    ))}
                    {availableItems.length === 0 && (
                        <p className="text-xs text-slate-400">すべてのアイテムがキャンバスに配置済み</p>
                    )}
                </div>
            </div>
        </div>
    );
}
