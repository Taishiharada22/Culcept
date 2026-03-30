"use client";

import { motion } from "framer-motion";
import { useCallback, useMemo } from "react";
import { getAtmosphereCardsForPeriod } from "@/lib/origin/v7/chainLogic";
import { getPeriodLabel } from "@/lib/origin/v7/periods";
import type { DraftChapter } from "@/lib/origin/v7/types";
import CardSelector from "./CardSelector";

type Props = {
  draft: DraftChapter;
  onComplete: (update: Partial<DraftChapter>) => void;
};

export default function AtmosphereStep({ draft, onComplete }: Props) {
  const cards = useMemo(
    () =>
      draft.period
        ? getAtmosphereCardsForPeriod(draft.period)
        : [],
    [draft.period],
  );

  const handleSelect = useCallback(
    (id: string) => {
      onComplete({ atmosphere: id });
    },
    [onComplete],
  );

  const periodLabel = draft.period ? getPeriodLabel(draft.period) : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-6"
    >
      <div className="text-center">
        <p className="mb-1 text-sm text-gray-500">Step 2</p>
        <h2 className="text-lg font-semibold text-gray-800">
          {periodLabel}の空気感は？
        </h2>
        <p className="mt-1 text-xs text-gray-400">
          正確でなくて大丈夫。なんとなく近いものを選んでください
        </p>
      </div>

      <CardSelector
        cards={cards}
        selected={draft.atmosphere ?? ""}
        onSelect={handleSelect}
        mode="single"
        columns={2}
      />
    </motion.div>
  );
}
