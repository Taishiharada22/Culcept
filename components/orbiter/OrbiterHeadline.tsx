"use client";

/**
 * OrbiterHeadline
 * Orbiter が「今、一番伝えたいこと」を表示する。
 *
 * Design:
 * - intent に応じたアイコン・色
 * - tone に応じた背景・ボーダー
 * - confidence に応じた表示スタイル（低い = 点線、高い = 実線）
 * - Light-mode cosmic aesthetic
 */

import { useState } from "react";
import type { OrbiterHeadline as HeadlineType } from "@/lib/orbiter/types";

type Props = {
  headline: HeadlineType;
};

const INTENT_CONFIG: Record<
  string,
  { icon: string; label: string; accentColor: string }
> = {
  first_impression: {
    icon: "◎",
    label: "FIRST SIGNAL",
    accentColor: "rgba(99,102,241,0.7)",
  },
  pattern_noticed: {
    icon: "◈",
    label: "PATTERN DETECTED",
    accentColor: "rgba(251,191,36,0.7)",
  },
  question: {
    icon: "？",
    label: "ORBITER ASKS",
    accentColor: "rgba(139,92,246,0.8)",
  },
  state_warning: {
    icon: "◇",
    label: "STATE ALERT",
    accentColor: "rgba(244,114,182,0.7)",
  },
  delta_report: {
    icon: "△",
    label: "CHANGE NOTICED",
    accentColor: "rgba(96,165,250,0.7)",
  },
  provocation: {
    icon: "⟡",
    label: "ORBITER PROVOKES",
    accentColor: "rgba(234,88,12,0.7)",
  },
  revision: {
    icon: "↻",
    label: "VIEW REVISED",
    accentColor: "rgba(220,38,38,0.6)",
  },
  encouragement: {
    icon: "✦",
    label: "SIGNAL CLEAR",
    accentColor: "rgba(74,222,128,0.7)",
  },
};

const TONE_BG: Record<string, string> = {
  curious: "rgba(99,102,241,0.03)",
  tentative: "rgba(139,92,246,0.03)",
  confident: "rgba(74,222,128,0.03)",
  gentle: "rgba(244,114,182,0.03)",
  provocative: "rgba(234,88,12,0.04)",
  honest: "rgba(220,38,38,0.03)",
};

export default function OrbiterHeadline({ headline }: Props) {
  const [expanded, setExpanded] = useState(false);
  const config = INTENT_CONFIG[headline.intent] ?? INTENT_CONFIG.first_impression;
  const bgColor = TONE_BG[headline.tone] ?? TONE_BG.curious;

  // Confidence → visual treatment
  const isLowConfidence = headline.confidence < 0.4;
  const borderStyle = isLowConfidence ? "dashed" : "solid";

  return (
    <div
      onClick={() => headline.subMessage && setExpanded(!expanded)}
      style={{
        padding: "16px 18px",
        borderRadius: 14,
        background: bgColor,
        border: `1px ${borderStyle} ${config.accentColor}20`,
        boxShadow: `0 2px 12px ${config.accentColor}08`,
        cursor: headline.subMessage ? "pointer" : "default",
        transition: "all 0.3s ease",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        {/* Intent icon */}
        <span
          style={{
            fontSize: 14,
            color: config.accentColor,
            fontWeight: 700,
            width: 20,
            textAlign: "center",
          }}
        >
          {config.icon}
        </span>

        {/* Intent label */}
        <span
          style={{
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: config.accentColor,
            fontFamily: "'JetBrains Mono','SF Mono',monospace",
          }}
        >
          {config.label}
        </span>

        {/* Confidence indicator */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 2,
          }}
        >
          {[0.25, 0.5, 0.75].map((threshold) => (
            <div
              key={threshold}
              style={{
                width: 3,
                height: 8,
                borderRadius: 1,
                background:
                  headline.confidence >= threshold
                    ? config.accentColor
                    : "rgba(30,30,60,0.06)",
                transition: "background 0.3s",
              }}
            />
          ))}
        </div>
      </div>

      {/* Main message */}
      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          lineHeight: 1.7,
          color: "#1E1E3C",
          margin: 0,
        }}
      >
        {headline.message}
      </p>

      {/* Sub message (expandable) */}
      {headline.subMessage && (
        <div
          style={{
            overflow: "hidden",
            maxHeight: expanded ? 200 : 0,
            opacity: expanded ? 1 : 0,
            transition: "all 0.3s ease",
            marginTop: expanded ? 8 : 0,
          }}
        >
          <p
            style={{
              fontSize: 12,
              lineHeight: 1.7,
              color: "rgba(30,30,60,0.5)",
              margin: 0,
              paddingLeft: 28,
            }}
          >
            {headline.subMessage}
          </p>
        </div>
      )}

      {/* Expand hint */}
      {headline.subMessage && !expanded && (
        <div
          style={{
            marginTop: 6,
            paddingLeft: 28,
          }}
        >
          <span
            style={{
              fontSize: 9,
              color: "rgba(30,30,60,0.2)",
              fontFamily: "'JetBrains Mono','SF Mono',monospace",
            }}
          >
            TAP TO EXPAND
          </span>
        </div>
      )}
    </div>
  );
}
