"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { LifePeriod, MemoryHandle } from "@/lib/origin/v7/types";
import { getHandlesForPeriod } from "@/lib/origin/v7/memoryHandles";
import { PHASE2_COPY } from "@/lib/origin/v7/deepFlowQuestions";

type Props = {
  period: LifePeriod;
  initialSelected?: string[];
  onComplete: (selectedHandles: string[]) => void;
};

export default function MemoryHandleStep({
  period,
  initialSelected,
  onComplete,
}: Props) {
  const handles = useMemo(() => getHandlesForPeriod(period), [period]);
  const [selected, setSelected] = useState<string[]>(initialSelected ?? []);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-5"
    >
      <div className="text-center">
        <p className="mb-1 text-sm text-gray-500">Phase 2</p>
        <h2 className="text-lg font-semibold text-gray-800">
          {PHASE2_COPY.heading}
        </h2>
        <p className="mt-1 text-xs text-gray-400">{PHASE2_COPY.sub}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {handles.map((handle: MemoryHandle) => {
          const isSelected = selected.includes(handle.id);
          return (
            <motion.button
              key={handle.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => toggle(handle.id)}
              className={`flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-left transition-all ${
                isSelected
                  ? "bg-amber-100/70 ring-1 ring-amber-300/40 shadow-sm"
                  : "bg-white/60 ring-1 ring-gray-200/30 hover:bg-white/80"
              }`}
            >
              <span className="text-base">{handle.icon}</span>
              <span className="text-xs text-gray-700">{handle.label}</span>
            </motion.button>
          );
        })}
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => onComplete(selected)}
        disabled={selected.length === 0}
        className="mx-auto w-full max-w-xs rounded-2xl bg-amber-400/90 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-amber-500/90 disabled:opacity-40"
      >
        次へ
      </motion.button>
    </motion.div>
  );
}
