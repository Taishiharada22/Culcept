"use client";

/**
 * SelfStateAlert
 * 判断品質アラート — decisionQualityHint が "optimal" でない時に表示
 * Hero直後に配置される上部アラートバー
 */

import type { SelfStateReport } from "@/lib/orbiter/types";

const QUALITY_CONFIG = {
  caution: {
    bgColor: "rgba(245, 158, 11, 0.08)",
    borderColor: "rgba(245, 158, 11, 0.2)",
    iconColor: "#F59E0B",
    icon: "⚡",
    label: "注意",
  },
  rest_first: {
    bgColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    iconColor: "#EF4444",
    icon: "🌙",
    label: "休息推奨",
  },
} as const;

type Props = {
  selfStateReport: SelfStateReport;
};

export default function SelfStateAlert({ selfStateReport }: Props) {
  const { decisionQualityHint, currentState, attractionWarning, recommendation } =
    selfStateReport;

  // optimal の場合は表示しない
  if (decisionQualityHint === "optimal") return null;

  const config = QUALITY_CONFIG[decisionQualityHint];

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 14,
        background: config.bgColor,
        border: `1px solid ${config.borderColor}`,
        marginBottom: 16,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 16 }}>{config.icon}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: config.iconColor,
            letterSpacing: 0.5,
          }}
        >
          {config.label}
        </span>
        {currentState && (
          <span
            style={{
              fontSize: 10,
              color: "rgba(30, 30, 60, 0.5)",
              marginLeft: "auto",
            }}
          >
            {currentState.overallLabel}
          </span>
        )}
      </div>

      {/* Warning */}
      {attractionWarning && (
        <p
          style={{
            fontSize: 12,
            color: "rgba(30, 30, 60, 0.7)",
            lineHeight: 1.7,
            margin: "0 0 6px",
          }}
        >
          {attractionWarning}
        </p>
      )}

      {/* Recommendation */}
      <p
        style={{
          fontSize: 11,
          color: "rgba(30, 30, 60, 0.5)",
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {recommendation}
      </p>
    </div>
  );
}
