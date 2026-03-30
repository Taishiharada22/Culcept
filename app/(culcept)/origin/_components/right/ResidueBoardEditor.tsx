"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ResidueItem, ResidueCategory } from "@/lib/origin/v7/workspaceTypes";
import type { ResidueSuggestion } from "@/lib/origin/v7/assistedFill";
import {
  RESIDUE_CATEGORY_CARDS,
  RESIDUE_PRESET_LABELS,
  INTENSITY_CARDS,
} from "@/lib/origin/v7/residueData";

type Props = {
  items: ResidueItem[];
  onSave: (item: ResidueItem) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  residueSuggestions?: ResidueSuggestion[];
};

type AddingState = {
  category: ResidueCategory;
  label: string;
  intensity: "strong" | "moderate" | "faint";
};

export default function ResidueBoardEditor({ items, onSave, onDelete, onClose, residueSuggestions }: Props) {
  const [addingCategory, setAddingCategory] = useState<ResidueCategory | null>(null);
  const [adding, setAdding] = useState<AddingState | null>(null);

  const startAdding = useCallback((category: ResidueCategory) => {
    setAddingCategory(category);
    setAdding({ category, label: "", intensity: "moderate" });
  }, []);

  const handleSelectPreset = useCallback(
    (label: string) => {
      if (!adding) return;
      setAdding((prev) => prev && { ...prev, label });
    },
    [adding],
  );

  const handleSaveNew = useCallback(() => {
    if (!adding || !adding.label.trim()) return;
    const item: ResidueItem = {
      id: crypto.randomUUID(),
      category: adding.category,
      label: adding.label.trim(),
      intensity: adding.intensity,
    };
    onSave(item);
    setAdding(null);
    setAddingCategory(null);
  }, [adding, onSave]);

  const handleCancelAdd = useCallback(() => {
    setAdding(null);
    setAddingCategory(null);
  }, []);

  // Group existing items by category
  const grouped = RESIDUE_CATEGORY_CARDS.map((cat) => ({
    ...cat,
    items: items.filter((item) => item.category === cat.id),
  }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔍</span>
          <h3 className="text-sm font-bold text-gray-800">今に残るもの</h3>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100/50 hover:text-gray-600"
        >
          <span className="text-sm">✕</span>
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-gray-500">
        過去の経験から今も残っている行動パターン、対人の癖、誇り、傷、武器、守り方を記録します。
      </p>

      {/* Residue Suggestions from chapters */}
      {residueSuggestions && residueSuggestions.length > 0 && (
        <section className="rounded-2xl border border-amber-100/50 bg-amber-50/20 p-3 space-y-2">
          <p className="text-[10px] font-medium text-amber-600/70">
            💡 記憶断片から推測される残留
          </p>
          <div className="space-y-1">
            {residueSuggestions.map((s, i) => (
              <motion.button
                key={`${s.label}-${i}`}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  const item: ResidueItem = {
                    id: crypto.randomUUID(),
                    category: s.category,
                    label: s.label,
                    intensity: s.intensity,
                  };
                  onSave(item);
                }}
                className="flex w-full items-center gap-2 rounded-xl border border-amber-200/40 bg-white/60 px-3 py-2 text-left transition-all hover:border-amber-300/60 hover:bg-white/80"
              >
                <span className="text-sm">
                  {RESIDUE_CATEGORY_CARDS.find((c) => c.id === s.category)?.icon ?? "📝"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-gray-700">{s.label}</p>
                  <p className="text-[9px] text-amber-500/60">{s.reason}</p>
                </div>
                <span className="shrink-0 text-[10px] text-amber-500">+ 追加</span>
              </motion.button>
            ))}
          </div>
        </section>
      )}

      {/* Category sections */}
      {grouped.map((cat) => (
        <section key={cat.id} className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-0.5">
            <span className="text-sm">{cat.icon}</span>
            <h4 className="text-xs font-semibold text-gray-700">{cat.label}</h4>
            <span className="text-[10px] text-gray-400">
              {cat.description}
            </span>
          </div>

          {/* Existing items */}
          {cat.items.length > 0 && (
            <div className="space-y-1">
              {cat.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-xl border border-amber-100/50 bg-white/60 px-3 py-2"
                >
                  <span className="flex-1 text-xs text-gray-700">
                    {item.label}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {INTENSITY_CARDS.find((c) => c.id === item.intensity)?.icon}{" "}
                    {INTENSITY_CARDS.find((c) => c.id === item.intensity)?.label}
                  </span>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="shrink-0 rounded-full p-1 text-[10px] text-gray-300 transition-colors hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add button or adding form */}
          <AnimatePresence mode="wait">
            {addingCategory === cat.id && adding ? (
              <motion.div
                key="adding"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-2xl border border-amber-200/50 bg-white/80 p-3 space-y-3">
                  {/* Preset labels */}
                  <div>
                    <p className="mb-1.5 text-[10px] font-medium text-gray-500">
                      プリセットから選ぶ
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {RESIDUE_PRESET_LABELS[cat.id].map((preset) => (
                        <motion.button
                          key={preset}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleSelectPreset(preset)}
                          className={`
                            rounded-full px-2.5 py-1 text-[10px] font-medium transition-all
                            ${
                              adding.label === preset
                                ? "border border-amber-400/70 bg-amber-50/90 text-amber-800"
                                : "border border-gray-200/50 bg-white/60 text-gray-600 hover:border-amber-200/60"
                            }
                          `}
                        >
                          {preset}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Custom label */}
                  <div>
                    <p className="mb-1 text-[10px] font-medium text-gray-500">
                      または自由入力
                    </p>
                    <input
                      type="text"
                      value={adding.label}
                      onChange={(e) =>
                        setAdding((prev) => prev && { ...prev, label: e.target.value })
                      }
                      placeholder="自分の言葉で書く..."
                      className="w-full rounded-xl border border-gray-200/60 bg-white/70 px-3 py-2 text-xs text-gray-700 placeholder-gray-400 outline-none transition-all focus:border-amber-300/70 focus:bg-white/90"
                    />
                  </div>

                  {/* Intensity */}
                  <div>
                    <p className="mb-1 text-[10px] font-medium text-gray-500">
                      強さ
                    </p>
                    <div className="flex gap-1.5">
                      {INTENSITY_CARDS.map((card) => {
                        const isSelected = adding.intensity === card.id;
                        return (
                          <motion.button
                            key={card.id}
                            whileTap={{ scale: 0.95 }}
                            onClick={() =>
                              setAdding((prev) =>
                                prev && {
                                  ...prev,
                                  intensity: card.id as "strong" | "moderate" | "faint",
                                },
                              )
                            }
                            className={`
                              flex-1 rounded-xl px-2 py-1.5 text-center text-[10px] font-medium transition-all
                              ${
                                isSelected
                                  ? "border border-amber-400/70 bg-amber-50/90 text-amber-800 shadow-sm"
                                  : "border border-gray-200/50 bg-white/50 text-gray-600"
                              }
                            `}
                          >
                            {card.icon} {card.label}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Save/Cancel */}
                  <div className="flex gap-2">
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleSaveNew}
                      disabled={!adding.label.trim()}
                      className={`
                        flex-1 rounded-xl py-2 text-xs font-semibold transition-all
                        ${
                          adding.label.trim()
                            ? "bg-amber-400/90 text-white hover:bg-amber-500/90"
                            : "bg-gray-200/60 text-gray-400 cursor-not-allowed"
                        }
                      `}
                    >
                      追加
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleCancelAdd}
                      className="rounded-xl bg-white/70 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-white/90"
                    >
                      キャンセル
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="add-btn"
                whileTap={{ scale: 0.97 }}
                onClick={() => startAdding(cat.id)}
                className="w-full rounded-xl border border-dashed border-gray-200/60 bg-white/30 py-2 text-[10px] font-medium text-gray-400 transition-all hover:border-amber-200/60 hover:bg-white/50 hover:text-amber-600"
              >
                + 追加する
              </motion.button>
            )}
          </AnimatePresence>
        </section>
      ))}
    </div>
  );
}
