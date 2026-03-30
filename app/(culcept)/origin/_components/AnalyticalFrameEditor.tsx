"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalyticalFrame, EraRole, RewardType } from "@/lib/origin/v7/workspaceTypes";
import {
  ANALYTICAL_FRAME_QUESTIONS,
  countAnsweredQuestions,
  TOTAL_FRAME_QUESTIONS,
  type FrameQuestion,
} from "@/lib/origin/v7/analyticalFrameData";
import WhyLedgerCards from "./WhyLedgerCards";
import type { WhyPhase } from "./WhyLedgerCards";

type Props = {
  frame: AnalyticalFrame;
  onChange: (frame: AnalyticalFrame) => void;
};

/** Why Ledger の fieldKey → WhyPhase マッピング */
const WHY_PHASE_MAP: Record<string, WhyPhase> = {
  whyStarted: "started",
  whyContinued: "continued",
  whyStopped: "stopped",
};

export default function AnalyticalFrameEditor({ frame, onChange }: Props) {
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);
  const answered = countAnsweredQuestions(frame as unknown as Record<string, unknown>);
  const progress = Math.round((answered / TOTAL_FRAME_QUESTIONS) * 100);

  const toggleQuestion = useCallback((qId: string) => {
    setOpenQuestionId((prev) => (prev === qId ? null : qId));
  }, []);

  const updateField = useCallback(
    (fieldKey: string, value: unknown) => {
      onChange({ ...frame, [fieldKey]: value });
    },
    [frame, onChange],
  );

  const getStringValue = (fieldKey: string): string => {
    const val = (frame as Record<string, unknown>)[fieldKey];
    return typeof val === "string" ? val : "";
  };

  const getArrayValue = (fieldKey: string): string[] => {
    const val = (frame as Record<string, unknown>)[fieldKey];
    return Array.isArray(val) ? (val as string[]) : [];
  };

  const isQuestionAnswered = (q: FrameQuestion): boolean => {
    const val = (frame as Record<string, unknown>)[q.fieldKey];
    if (val === null || val === undefined || val === "") return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  };

  return (
    <div className="space-y-2">
      {/* Progress header */}
      <div className="flex items-center gap-2 px-1">
        <div className="flex-1">
          <div className="flex items-center justify-between text-[10px] text-gray-500">
            <span>分析フレーム</span>
            <span>
              {answered}/{TOTAL_FRAME_QUESTIONS}問回答済み
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-200/50">
            <motion.div
              className="h-full rounded-full bg-amber-400/80"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          </div>
        </div>
      </div>

      {/* Question accordion */}
      <div className="space-y-1">
        {ANALYTICAL_FRAME_QUESTIONS.map((q) => {
          const isOpen = openQuestionId === q.id;
          const isAnswered = isQuestionAnswered(q);
          const isWhyLedger = q.fieldKey in WHY_PHASE_MAP;

          return (
            <div key={q.id}>
              <button
                onClick={() => toggleQuestion(q.id)}
                className={`
                  flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-all
                  ${
                    isOpen
                      ? "border border-amber-300/60 bg-white/80 shadow-sm"
                      : isAnswered
                        ? "border border-amber-100/50 bg-amber-50/30 hover:bg-amber-50/50"
                        : "border border-gray-200/40 bg-white/40 hover:bg-white/60"
                  }
                `}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    isAnswered
                      ? "bg-amber-400/80 text-white"
                      : "bg-gray-200/60 text-gray-400"
                  }`}
                >
                  {q.number}
                </span>
                <span className="flex-1 text-xs font-medium text-gray-700">
                  {q.question}
                </span>
                <motion.span
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="shrink-0 text-[10px] text-gray-400"
                >
                  ▼
                </motion.span>
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="overflow-hidden"
                  >
                    <div className="px-2 pb-2 pt-1.5">
                      {/* WhyLedger (multi_select for started/continued/stopped) */}
                      {isWhyLedger && (
                        <WhyLedgerCards
                          phase={WHY_PHASE_MAP[q.fieldKey]}
                          selected={getArrayValue(q.fieldKey)}
                          onChange={(selected) => updateField(q.fieldKey, selected)}
                        />
                      )}

                      {/* Regular select */}
                      {q.type === "select" && !isWhyLedger && q.options && (
                        <div className="flex flex-wrap gap-1.5">
                          {q.options.map((opt) => {
                            const currentVal = getStringValue(q.fieldKey);
                            const isSelected = currentVal === opt.id;
                            return (
                              <motion.button
                                key={opt.id}
                                whileTap={{ scale: 0.95 }}
                                onClick={() =>
                                  updateField(
                                    q.fieldKey,
                                    isSelected ? null : opt.id,
                                  )
                                }
                                className={`
                                  rounded-full px-3 py-1.5 text-xs font-medium transition-all
                                  ${
                                    isSelected
                                      ? "border border-amber-400/70 bg-amber-50/90 text-amber-800 shadow-sm"
                                      : "border border-gray-200/60 bg-white/60 text-gray-600 hover:border-amber-200/60 hover:bg-white/80"
                                  }
                                `}
                              >
                                <span className="mr-1">{opt.icon}</span>
                                {opt.label}
                              </motion.button>
                            );
                          })}
                        </div>
                      )}

                      {/* Multi-select (non-WhyLedger) */}
                      {q.type === "multi_select" && !isWhyLedger && q.options && (
                        <div className="flex flex-wrap gap-1.5">
                          {q.options.map((opt) => {
                            const arr = getArrayValue(q.fieldKey);
                            const isSelected = arr.includes(opt.id);
                            return (
                              <motion.button
                                key={opt.id}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => {
                                  const next = isSelected
                                    ? arr.filter((v) => v !== opt.id)
                                    : [...arr, opt.id];
                                  updateField(q.fieldKey, next);
                                }}
                                className={`
                                  rounded-full px-3 py-1.5 text-xs font-medium transition-all
                                  ${
                                    isSelected
                                      ? "border border-amber-400/70 bg-amber-50/90 text-amber-800 shadow-sm"
                                      : "border border-gray-200/60 bg-white/60 text-gray-600 hover:border-amber-200/60 hover:bg-white/80"
                                  }
                                `}
                              >
                                <span className="mr-1">{opt.icon}</span>
                                {opt.label}
                              </motion.button>
                            );
                          })}
                        </div>
                      )}

                      {/* Short text */}
                      {q.type === "short_text" && (
                        <input
                          type="text"
                          value={getStringValue(q.fieldKey)}
                          onChange={(e) => updateField(q.fieldKey, e.target.value || null)}
                          placeholder={q.placeholder ?? ""}
                          className="w-full rounded-xl border border-gray-200/60 bg-white/70 px-3 py-2 text-xs text-gray-700 placeholder-gray-400 outline-none transition-all focus:border-amber-300/70 focus:bg-white/90 focus:ring-1 focus:ring-amber-200/50"
                        />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
