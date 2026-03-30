"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { WorkspaceEntrySuggestion } from "@/lib/origin/v7/assistedFill";
import type { ActivityEntry, TurningPoint, EraAffiliation } from "@/lib/origin/v7/workspaceTypes";

type Props = {
  suggestions: WorkspaceEntrySuggestion[];
  onAcceptActivity: (data: Partial<ActivityEntry>) => void;
  onAcceptTurningPoint: (data: Partial<TurningPoint>) => void;
  onAcceptEra: (data: Partial<EraAffiliation>) => void;
  onDismiss: (index: number) => void;
};

const TYPE_ICONS: Record<string, string> = {
  activity: "📋",
  turning_point: "⚡",
  era: "📖",
};

const TYPE_LABELS: Record<string, string> = {
  activity: "活動",
  turning_point: "転機",
  era: "時代骨格",
};

export default function WorkspaceEntrySuggestionOverlay({
  suggestions,
  onAcceptActivity,
  onAcceptTurningPoint,
  onAcceptEra,
  onDismiss,
}: Props) {
  if (suggestions.length === 0) return null;

  function handleAccept(suggestion: WorkspaceEntrySuggestion) {
    switch (suggestion.type) {
      case "activity":
        onAcceptActivity(suggestion.suggestedData as Partial<ActivityEntry>);
        break;
      case "turning_point":
        onAcceptTurningPoint(suggestion.suggestedData as Partial<TurningPoint>);
        break;
      case "era":
        onAcceptEra(suggestion.suggestedData as Partial<EraAffiliation>);
        break;
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-2"
    >
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <span className="text-sm">💡</span>
        <h3 className="text-xs font-semibold text-amber-600/70">
          記憶断片からの候補
        </h3>
      </div>

      <div className="space-y-1">
        <AnimatePresence mode="popLayout">
          {suggestions.map((s, i) => (
            <motion.div
              key={`${s.type}-${i}`}
              layout
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6, height: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-2 rounded-xl border border-amber-200/40 bg-amber-50/50 px-3 py-2"
            >
              <span className="text-sm">
                {TYPE_ICONS[s.type] ?? "📝"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-gray-700">
                  {TYPE_LABELS[s.type] ?? s.type}を追加
                </p>
                <p className="truncate text-[10px] text-gray-400">
                  {s.reason}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => handleAccept(s)}
                  className="rounded-lg bg-amber-400/80 px-2.5 py-1 text-[10px] font-medium text-white transition-colors hover:bg-amber-500/80"
                >
                  追加
                </button>
                <button
                  onClick={() => onDismiss(i)}
                  className="rounded-lg bg-gray-100/60 px-2 py-1 text-[10px] text-gray-400 transition-colors hover:bg-gray-200/60"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
