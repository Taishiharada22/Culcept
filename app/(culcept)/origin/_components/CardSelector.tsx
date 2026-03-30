"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCallback } from "react";

export type CardItem = {
  id: string;
  label: string;
  icon: string;
  colorAccent?: string;
  description?: string;
};

type Props = {
  cards: CardItem[];
  selected: string | string[];
  onSelect: (id: string) => void;
  mode: "single" | "multi";
  maxSelections?: number;
  columns?: 2 | 3;
  /** カテゴリ区切りラベル */
  categoryLabel?: string;
};

const springConfig = { type: "spring" as const, stiffness: 300, damping: 25 };

export default function CardSelector({
  cards,
  selected,
  onSelect,
  mode,
  maxSelections = 5,
  columns = 2,
}: Props) {
  const selectedSet = new Set(
    Array.isArray(selected) ? selected : selected ? [selected] : [],
  );

  const handleTap = useCallback(
    (id: string) => {
      if (mode === "multi" && !selectedSet.has(id) && selectedSet.size >= maxSelections) {
        return; // max reached
      }
      onSelect(id);
    },
    [mode, maxSelections, onSelect, selectedSet],
  );

  return (
    <div
      className={`grid gap-3 ${columns === 3 ? "grid-cols-3" : "grid-cols-2"}`}
    >
      <AnimatePresence mode="popLayout">
        {cards.map((card, i) => {
          const isSelected = selectedSet.has(card.id);
          return (
            <motion.button
              key={card.id}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ ...springConfig, delay: i * 0.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => handleTap(card.id)}
              className={`
                relative flex flex-col items-center gap-1.5 rounded-2xl px-3 py-4
                text-center transition-all duration-200 select-none
                ${
                  isSelected
                    ? "bg-white/90 shadow-lg ring-2 ring-amber-400/60"
                    : "bg-white/60 backdrop-blur-md hover:bg-white/75"
                }
              `}
              style={
                isSelected && card.colorAccent
                  ? {
                      borderColor: card.colorAccent,
                      boxShadow: `0 2px 12px ${card.colorAccent}30`,
                    }
                  : undefined
              }
            >
              <span className="text-2xl leading-none">{card.icon}</span>
              <span
                className={`text-sm font-medium leading-snug ${
                  isSelected ? "text-gray-900" : "text-gray-700"
                }`}
              >
                {card.label}
              </span>
              {isSelected && (
                <motion.div
                  layoutId={`check-${card.id}`}
                  className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] text-white"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={springConfig}
                >
                  ✓
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
