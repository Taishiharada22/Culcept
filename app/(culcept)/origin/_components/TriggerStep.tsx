"use client";

import { motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import { getTriggerCardsForPeriod } from "@/lib/origin/v7/chainLogic";
import { getPeriodLabel } from "@/lib/origin/v7/periods";
import { TRIGGER_CATEGORIES, TRIGGER_CATEGORY_META } from "@/lib/origin/v7/types";
import type { DraftChapter, TriggerCategory } from "@/lib/origin/v7/types";
import CardSelector from "./CardSelector";

type Props = {
  draft: DraftChapter;
  onComplete: (update: Partial<DraftChapter>) => void;
};

export default function TriggerStep({ draft, onComplete }: Props) {
  const [selected, setSelected] = useState<string[]>(draft.triggers);
  const [activeCategory, setActiveCategory] = useState<TriggerCategory>("place");

  const allCards = useMemo(
    () => (draft.period ? getTriggerCardsForPeriod(draft.period) : []),
    [draft.period],
  );

  const filteredCards = useMemo(
    () => allCards.filter((c) => c.category === activeCategory),
    [allCards, activeCategory],
  );

  const handleToggle = useCallback(
    (id: string) => {
      setSelected((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        if (prev.length >= 5) return prev; // max 5
        return [...prev, id];
      });
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    if (selected.length === 0) return;
    onComplete({ triggers: selected });
  }, [selected, onComplete]);

  const periodLabel = draft.period ? getPeriodLabel(draft.period) : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-5"
    >
      <div className="text-center">
        <p className="mb-1 text-sm text-gray-500">Step 5</p>
        <h2 className="text-lg font-semibold text-gray-800">
          {periodLabel}を思い出すものは？
        </h2>
        <p className="mt-1 text-xs text-gray-400">
          場所・もの・人・感覚から、記憶に近いものを選んでください（最大5つ）
        </p>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto px-1 pb-1">
        {TRIGGER_CATEGORIES.map((cat) => {
          const meta = TRIGGER_CATEGORY_META[cat];
          const isActive = activeCategory === cat;
          const count = selected.filter((id) =>
            allCards.find((c) => c.id === id && c.category === cat),
          ).length;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`
                flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5
                text-xs font-medium transition-all
                ${
                  isActive
                    ? "bg-amber-400/20 text-amber-700 ring-1 ring-amber-400/40"
                    : "bg-white/50 text-gray-500 hover:bg-white/70"
                }
              `}
            >
              {meta.icon} {meta.label}
              {count > 0 && (
                <span className="ml-0.5 rounded-full bg-amber-400/30 px-1.5 text-[10px]">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Cards */}
      <CardSelector
        cards={filteredCards}
        selected={selected}
        onSelect={handleToggle}
        mode="multi"
        maxSelections={5}
        columns={3}
      />

      {/* Selected summary + confirm */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <p className="text-xs text-gray-400">
          {selected.length}/5 選択中
        </p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleConfirm}
          disabled={selected.length === 0}
          className={`
            w-full max-w-xs rounded-2xl px-6 py-3
            text-sm font-semibold transition-all
            ${
              selected.length > 0
                ? "bg-amber-400/90 text-white shadow-md hover:bg-amber-500/90"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }
          `}
        >
          次へ
        </motion.button>
      </div>
    </motion.div>
  );
}
