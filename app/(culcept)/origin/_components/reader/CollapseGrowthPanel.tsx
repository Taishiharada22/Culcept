"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback } from "react";
import type { CollapseCondition, GrowthCondition } from "@/lib/origin/v7/behavioralLaws";
import type { CollapseGrowthInsight, LifeDomain } from "@/lib/origin/v7/types";
import { DOMAIN_LABELS } from "@/lib/origin/v7/types";

type Props = {
  collapseConditions: CollapseCondition[];
  growthConditions: GrowthCondition[];
  insights: CollapseGrowthInsight[];
  onSaveInsight: (insight: CollapseGrowthInsight) => void;
};

type RecognitionType = "accurate" | "surprising" | "partially";

const RECOGNITION_OPTIONS: { value: RecognitionType; label: string; icon: string }[] = [
  { value: "accurate", label: "正確", icon: "✓" },
  { value: "partially", label: "部分的", icon: "△" },
  { value: "surprising", label: "意外", icon: "!" },
];

export default function CollapseGrowthPanel({
  collapseConditions,
  growthConditions,
  insights,
  onSaveInsight,
}: Props) {
  const hasData = collapseConditions.length > 0 || growthConditions.length > 0;
  if (!hasData) return null;

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mt-3 space-y-2"
    >
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
        <span className="text-sm">⚡</span>
        崩壊と成長の条件
      </h3>

      {/* 崩壊条件 */}
      {collapseConditions.map((cc) => (
        <InsightCard
          key={cc.id}
          type="collapse"
          id={cc.id}
          trigger={cc.trigger}
          mechanism={cc.mechanism}
          evidence={cc.evidence}
          insight={insights.find((i) => i.sourceId === cc.id && i.type === "collapse")}
          onSave={onSaveInsight}
        />
      ))}

      {/* 成長条件 */}
      {growthConditions.map((gc) => (
        <InsightCard
          key={gc.id}
          type="growth"
          id={gc.id}
          trigger={gc.trigger}
          mechanism={gc.mechanism}
          evidence={gc.evidence}
          insight={insights.find((i) => i.sourceId === gc.id && i.type === "growth")}
          onSave={onSaveInsight}
        />
      ))}
    </motion.section>
  );
}

/* ━━━ InsightCard ━━━ */

function InsightCard({
  type,
  id,
  trigger,
  mechanism,
  evidence,
  insight,
  onSave,
}: {
  type: "collapse" | "growth";
  id: string;
  trigger: string;
  mechanism: string;
  evidence: string[];
  insight?: CollapseGrowthInsight;
  onSave: (insight: CollapseGrowthInsight) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(insight?.userNote ?? "");
  const [recognition, setRecognition] = useState<RecognitionType | null>(
    insight?.userRecognition ?? null,
  );
  const [showGoldenPulse, setShowGoldenPulse] = useState(false);

  const isCollapse = type === "collapse";
  const borderColor = isCollapse ? "border-rose-200/50" : "border-emerald-200/50";
  const bgColor = isCollapse ? "bg-rose-50/30" : "bg-emerald-50/30";
  const accentColor = isCollapse ? "text-rose-500" : "text-emerald-500";
  const icon = isCollapse ? "↘" : "↗";

  const handleRecognition = useCallback(
    (value: RecognitionType) => {
      setRecognition(value);
      if (value === "surprising") {
        setShowGoldenPulse(true);
        setTimeout(() => setShowGoldenPulse(false), 2000);
      }
      const updated: CollapseGrowthInsight = {
        type,
        sourceId: id,
        userRecognition: value,
        userNote: note || null,
        relatedDomains: insight?.relatedDomains ?? [],
      };
      onSave(updated);
    },
    [type, id, note, insight?.relatedDomains, onSave],
  );

  const handleNoteBlur = useCallback(() => {
    if (!recognition) return;
    const updated: CollapseGrowthInsight = {
      type,
      sourceId: id,
      userRecognition: recognition,
      userNote: note || null,
      relatedDomains: insight?.relatedDomains ?? [],
    };
    onSave(updated);
  }, [type, id, recognition, note, insight?.relatedDomains, onSave]);

  return (
    <motion.div
      layout
      className={`relative overflow-hidden rounded-xl border ${borderColor} ${bgColor} px-3 py-2.5`}
      animate={
        showGoldenPulse
          ? {
              boxShadow: [
                "0 0 0 0 rgba(245,158,11,0)",
                "0 0 16px 4px rgba(245,158,11,0.3)",
                "0 0 0 0 rgba(245,158,11,0)",
              ],
            }
          : {}
      }
      transition={showGoldenPulse ? { duration: 1.5, repeat: 1 } : {}}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-2 text-left"
      >
        <span className={`mt-0.5 text-sm font-bold ${accentColor}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-gray-700">{trigger}</p>
          <p className="mt-0.5 text-[10px] text-gray-400">{mechanism}</p>
        </div>
        {recognition && (
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
              recognition === "surprising"
                ? "bg-amber-100 text-amber-600"
                : recognition === "accurate"
                  ? "bg-gray-100 text-gray-500"
                  : "bg-blue-50 text-blue-500"
            }`}
          >
            {RECOGNITION_OPTIONS.find((o) => o.value === recognition)?.label}
          </span>
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 space-y-2"
          >
            {/* Evidence */}
            {evidence.length > 0 && (
              <div>
                <p className="mb-1 text-[9px] font-medium text-gray-400">根拠</p>
                {evidence.map((e, i) => (
                  <p key={i} className="text-[10px] text-gray-500">
                    · {e}
                  </p>
                ))}
              </div>
            )}

            {/* Recognition prompt */}
            <div>
              <p className="mb-1.5 text-[10px] font-medium text-gray-500">
                これ、当たってる？
              </p>
              <div className="flex gap-1.5">
                {RECOGNITION_OPTIONS.map((opt) => (
                  <motion.button
                    key={opt.value}
                    whileTap={{ scale: 0.93 }}
                    onClick={() => handleRecognition(opt.value)}
                    className={`rounded-full px-3 py-1 text-[10px] font-medium transition-all ${
                      recognition === opt.value
                        ? opt.value === "surprising"
                          ? "bg-amber-400 text-white shadow-sm"
                          : opt.value === "accurate"
                            ? "bg-gray-600 text-white"
                            : "bg-blue-400 text-white"
                        : "bg-white/60 text-gray-500 hover:bg-white/80"
                    }`}
                  >
                    {opt.icon} {opt.label}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Note field */}
            {recognition && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={handleNoteBlur}
                  placeholder="一言メモ（任意）"
                  className="w-full rounded-lg border border-gray-100/50 bg-white/40 px-2.5 py-1.5 text-[10px] text-gray-600 placeholder:text-gray-300 outline-none focus:border-amber-200/50"
                />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
