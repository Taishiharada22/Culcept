"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ReasonTrace, Evidence } from "@/lib/stargazer/reasonTrace";

// ---------------------------------------------------------------------------
// Evidence type → 表示用アイコン
// ---------------------------------------------------------------------------

const EVIDENCE_ICON: Record<string, string> = {
  axis_score: "◆",
  response_time: "⏱",
  contradiction: "⇌",
  state: "◎",
  past_pattern: "↻",
  mirror_divergence: "◫",
  archetype: "✦",
  observation: "◇",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  trace: ReasonTrace | null | undefined;
  /** ラベル（デフォルト: "なぜこの判断？"） */
  label?: string;
}

/**
 * Reason Trace の薄い展開パネル。
 * デフォルトは折りたたみ。タップで根拠リストと reasoning を表示。
 */
export default function ReasonTracePanel({ trace, label }: Props) {
  const [open, setOpen] = useState(false);

  if (!trace || trace.evidences.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
      >
        <span className="text-[10px]">{open ? "▾" : "▸"}</span>
        <span>{label ?? "なぜこの判断？"}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-lg border border-slate-200/60 bg-slate-50/50 p-3 space-y-2">
              {/* Reasoning text */}
              <p className="text-xs text-slate-600 leading-relaxed">
                {trace.reasoning}
              </p>

              {/* Evidence list */}
              <div className="space-y-1">
                {trace.evidences.slice(0, 5).map((ev, i) => (
                  <EvidenceLine key={i} evidence={ev} />
                ))}
                {trace.evidences.length > 5 && (
                  <p className="text-[10px] text-slate-400">
                    他 {trace.evidences.length - 5} 件の根拠
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence line
// ---------------------------------------------------------------------------

function EvidenceLine({ evidence }: { evidence: Evidence }) {
  const icon = EVIDENCE_ICON[evidence.type] ?? "·";
  // weight を●の数で表示（0.1-0.3→●, 0.4-0.6→●●, 0.7+→●●●）
  const dots = evidence.weight >= 0.7 ? "●●●" : evidence.weight >= 0.4 ? "●●" : "●";

  return (
    <div className="flex items-start gap-2 text-[11px]">
      <span className="text-slate-400 mt-px shrink-0">{icon}</span>
      <span className="text-slate-500 flex-1">{evidence.humanLabel}</span>
      <span className="text-slate-300/60 shrink-0 text-[9px] tracking-tight">{dots}</span>
    </div>
  );
}
