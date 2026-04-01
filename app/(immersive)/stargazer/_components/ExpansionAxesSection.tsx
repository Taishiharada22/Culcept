// app/stargazer/_components/ExpansionAxesSection.tsx
// P4 Phase C: 拡張軸の表示セクション
// visible / displayTier を唯一の表示判定源とする（CEO条件）
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

/** profile API の expansionAxes 配列の要素型 */
export interface ExpansionAxisData {
  id: string;
  labelLeft: string;
  labelRight: string;
  /** hidden tier では null */
  score: number | null;
  confidence: number;
  precision: number;
  source: "inferred" | "observed";
  displayTier: "hidden" | "emerging" | "forming" | "visible";
  displayPrefix: string;
  visible: boolean;
  originLabel: string;
}

interface Props {
  axes: ExpansionAxisData[];
}

export default function ExpansionAxesSection({ axes }: Props) {
  const [expanded, setExpanded] = useState(false);

  // visible / displayTier が唯一の表示判定源
  // hidden tier は絶対に表示しない
  const visibleAxes = axes.filter((a) => a.visible && a.displayTier !== "hidden");

  if (visibleAxes.length === 0) return null;

  return (
    <motion.section
      className="space-y-3"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      {/* セクションヘッダ */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-1 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "rgba(170,150,90,0.5)" }}
          />
          <span
            className="font-display text-sm"
            style={{ color: "rgba(30,35,55,0.75)" }}
          >
            観測が深まっています
          </span>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(170,150,90,0.08)",
              color: "rgba(170,150,90,0.7)",
              border: "1px solid rgba(170,150,90,0.15)",
            }}
          >
            {visibleAxes.length}軸
          </span>
        </div>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-xs"
          style={{ color: "rgba(100,105,130,0.4)" }}
        >
          ▼
        </motion.span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-2.5 overflow-hidden"
          >
            {visibleAxes.map((axis, i) => (
              <ExpansionAxisCard key={axis.id} axis={axis} index={i} />
            ))}

            <p
              className="text-[10px] text-center pt-1"
              style={{ color: "rgba(100,105,130,0.35)" }}
            >
              拡張軸は日々の観測で精度が深まります
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function ExpansionAxisCard({ axis, index }: { axis: ExpansionAxisData; index: number }) {
  // visible=true のみがここに到達する（親で filter 済み）
  // score が null なら表示しない（追加の安全弁）
  if (axis.score === null) return null;

  // score: -1 ~ +1 → percentage: 0 ~ 100
  const position = ((axis.score + 1) / 2) * 100;

  return (
    <motion.div
      className="p-3.5 rounded-xl space-y-2"
      style={{
        background: "rgba(170,150,90,0.03)",
        border: "1px solid rgba(170,150,90,0.1)",
      }}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06 }}
    >
      {/* ティア表示 + 軸名 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-medium"
            style={{ color: "rgba(170,150,90,0.65)" }}
          >
            {axis.displayPrefix}
          </span>
        </div>
        {axis.source === "inferred" && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-full"
            style={{
              background: "rgba(139,92,246,0.06)",
              color: "rgba(139,92,246,0.5)",
              border: "1px solid rgba(139,92,246,0.1)",
            }}
          >
            推定値
          </span>
        )}
      </div>

      {/* 軸バー */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]">
          <span style={{ color: "rgba(50,55,75,0.55)" }}>{axis.labelLeft}</span>
          <span style={{ color: "rgba(50,55,75,0.55)" }}>{axis.labelRight}</span>
        </div>
        <div
          className="relative h-1.5 rounded-full overflow-hidden"
          style={{ background: "rgba(160,170,200,0.1)" }}
        >
          <div
            className="absolute top-0 left-1/2 w-px h-full"
            style={{ background: "rgba(160,170,200,0.15)" }}
          />
          <motion.div
            className="absolute top-0 h-full rounded-full"
            style={{
              width: 8,
              background: "rgba(170,150,90,0.5)",
              left: `calc(${position}% - 4px)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 + index * 0.06, duration: 0.4 }}
          />
        </div>
      </div>

      {/* 由来ラベル */}
      {axis.originLabel && (
        <p
          className="text-[9px] leading-relaxed"
          style={{ color: "rgba(100,105,130,0.4)" }}
        >
          ↳ {axis.originLabel}
        </p>
      )}
    </motion.div>
  );
}
