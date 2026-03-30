"use client";

/**
 * TraitInfluenceTooltip
 * 「この人の前であなたは…」— 相手との相互作用による自己変容を表示
 */

import { motion } from "framer-motion";
import type { TraitInfluence } from "@/lib/relational/types";

type Props = {
  influences: TraitInfluence[];
};

const DIRECTION_META: Record<
  TraitInfluence["direction"],
  { label: string; color: string; icon: string }
> = {
  amplified: { label: "増幅", color: "#22C55E", icon: "↑" },
  suppressed: { label: "抑制", color: "#6366F1", icon: "↓" },
  pulled: { label: "引出", color: "#F59E0B", icon: "→" },
};

export default function TraitInfluenceTooltip({ influences }: Props) {
  if (influences.length === 0) return null;

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(99,102,241,0.06)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "rgba(30,30,60,0.4)",
          marginBottom: 10,
          letterSpacing: "0.3px",
        }}
      >
        この人の前であなたは…
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {influences.map((inf, i) => {
          const meta = DIRECTION_META[inf.direction];

          return (
            <motion.div
              key={inf.axis}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 10,
                background: `${meta.color}06`,
                borderLeft: `3px solid ${meta.color}50`,
              }}
            >
              {/* Direction icon */}
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: meta.color,
                  lineHeight: 1,
                  minWidth: 18,
                  textAlign: "center",
                }}
              >
                {meta.icon}
              </span>

              <div style={{ flex: 1 }}>
                {/* Axis name + direction */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 2,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "rgba(30,30,60,0.7)",
                    }}
                  >
                    {inf.axisLabel}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: meta.color,
                      background: `${meta.color}12`,
                      padding: "1px 5px",
                      borderRadius: 4,
                    }}
                  >
                    {meta.label}
                  </span>
                </div>

                {/* Narrative */}
                <p
                  style={{
                    fontSize: 11,
                    color: "rgba(30,30,60,0.55)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {inf.narrative}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
