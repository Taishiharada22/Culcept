"use client";

/**
 * RendezvousContextBadge
 * 友達 / 恋愛 / Orbiter の文脈表示バッジ
 * 既存のcategory badge と並列表示される追加レンズ表示
 */

import type { ContextType } from "@/lib/rendezvous/questions/types";
import { CONTEXT_LABELS, CONTEXT_COLORS } from "@/lib/rendezvous/questions/types";

type Props = {
  context: ContextType;
  score?: number;
  size?: "sm" | "md";
};

export default function RendezvousContextBadge({
  context,
  score,
  size = "sm",
}: Props) {
  const color = CONTEXT_COLORS[context];
  const label = CONTEXT_LABELS[context];
  const fontSize = size === "sm" ? 9 : 11;
  const padding = size === "sm" ? "1px 6px" : "2px 8px";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding,
        borderRadius: 4,
        fontSize,
        fontWeight: 700,
        color,
        background: `${color}12`,
        border: `1px solid ${color}18`,
        letterSpacing: 0.3,
        whiteSpace: "nowrap",
      }}
    >
      {label}
      {score != null && (
        <span
          style={{
            fontFamily: "'JetBrains Mono','SF Mono',monospace",
            fontSize: fontSize - 1,
            opacity: 0.8,
          }}
        >
          {score}
        </span>
      )}
    </span>
  );
}
