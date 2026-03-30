"use client";

import { motion } from "framer-motion";
import type { ResidueSummary } from "@/lib/origin/v7/formationReader";

type Props = {
  summary: ResidueSummary;
};

export default function ResidueSummaryPanel({ summary }: Props) {
  if (summary.groups.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="rounded-2xl border border-amber-200/30 bg-white/50 p-4 backdrop-blur-sm"
    >
      <div className="mb-3 flex items-center gap-1.5">
        <span className="text-sm">🔍</span>
        <h3 className="text-xs font-semibold text-gray-600">残留マップ</h3>
      </div>

      <div className="space-y-2.5">
        {summary.groups.map((group) => (
          <div key={group.category}>
            <p className="mb-1 text-[10px] font-semibold text-gray-500">
              {group.categoryLabel}
            </p>
            <div className="flex flex-wrap gap-1">
              {group.items.map((item) => {
                const isStrong = summary.strongestItems.some(
                  (s) => s.id === item.id,
                );
                return (
                  <span
                    key={item.id}
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${
                      isStrong
                        ? "bg-amber-100/80 font-medium text-amber-700 ring-1 ring-amber-300/40"
                        : "bg-amber-50/60 text-amber-600/70"
                    }`}
                  >
                    {isStrong && "🔥 "}
                    {item.label}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
