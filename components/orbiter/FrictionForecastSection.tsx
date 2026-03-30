"use client";

/**
 * FrictionForecastSection
 * すれ違い予報 — Friction Forecast アイテムをカード形式で表示
 * severity badge + scenario + advice
 * isPersonalized なら「あなたの傾向から」バッジ
 */

import type { FrictionForecast, FrictionSeverity } from "@/lib/orbiter/types";

const SEVERITY_CONFIG: Record<
  FrictionSeverity,
  { color: string; bg: string; label: string }
> = {
  low: {
    color: "#10B981",
    bg: "rgba(16, 185, 129, 0.08)",
    label: "低",
  },
  medium: {
    color: "#F59E0B",
    bg: "rgba(245, 158, 11, 0.08)",
    label: "中",
  },
  high: {
    color: "#EF4444",
    bg: "rgba(239, 68, 68, 0.08)",
    label: "高",
  },
};

type Props = {
  frictionForecast: FrictionForecast;
};

export default function FrictionForecastSection({ frictionForecast }: Props) {
  const { items, overallRisk, personalizedCount, narrativeSummary } =
    frictionForecast;

  if (items.length === 0) {
    return (
      <div
        style={{
          padding: "20px 16px",
          borderRadius: 16,
          background: "rgba(16, 185, 129, 0.04)",
          border: "1px solid rgba(16, 185, 129, 0.1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              width: 2.5,
              height: 12,
              borderRadius: 2,
              background: "#EA580C",
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(30, 30, 60, 0.6)",
              letterSpacing: 0.5,
            }}
          >
            すれ違い予報
          </span>
        </div>
        <p
          style={{
            fontSize: 12,
            color: "rgba(30, 30, 60, 0.5)",
            lineHeight: 1.7,
            margin: 0,
          }}
        >
          {narrativeSummary}
        </p>
      </div>
    );
  }

  const overallConfig = SEVERITY_CONFIG[overallRisk];

  return (
    <div
      style={{
        padding: "20px 16px",
        borderRadius: 16,
        background: "rgba(255, 255, 255, 0.6)",
        border: "1px solid rgba(30, 30, 60, 0.06)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 2.5,
              height: 12,
              borderRadius: 2,
              background: "#EA580C",
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(30, 30, 60, 0.7)",
              letterSpacing: 0.5,
            }}
          >
            すれ違い予報
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {personalizedCount > 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: "#6366F1",
                padding: "2px 6px",
                borderRadius: 4,
                background: "rgba(99, 102, 241, 0.08)",
              }}
            >
              {personalizedCount}件パーソナライズ済
            </span>
          )}
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: overallConfig.color,
              padding: "2px 6px",
              borderRadius: 4,
              background: overallConfig.bg,
            }}
          >
            総合: {overallConfig.label}
          </span>
        </div>
      </div>

      {/* Summary */}
      <p
        style={{
          fontSize: 12,
          color: "rgba(30, 30, 60, 0.55)",
          lineHeight: 1.7,
          margin: "0 0 14px",
        }}
      >
        {narrativeSummary}
      </p>

      {/* Items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item, i) => {
          const sevConfig = SEVERITY_CONFIG[item.severity];
          return (
            <div
              key={`${item.cautionCode}-${i}`}
              style={{
                padding: "12px",
                borderRadius: 12,
                background: sevConfig.bg,
                border: `1px solid ${sevConfig.color}15`,
              }}
            >
              {/* Top row: severity badge + personalized badge */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: sevConfig.color,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: `${sevConfig.color}15`,
                    textTransform: "uppercase",
                  }}
                >
                  {sevConfig.label}
                </span>
                {item.isPersonalized && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: "#6366F1",
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: "rgba(99, 102, 241, 0.08)",
                    }}
                  >
                    あなたの傾向から
                  </span>
                )}
              </div>

              {/* Scenario */}
              <p
                style={{
                  fontSize: 12,
                  color: "rgba(30, 30, 60, 0.7)",
                  lineHeight: 1.6,
                  margin: "0 0 6px",
                }}
              >
                {item.scenario}
              </p>

              {/* Advice */}
              <p
                style={{
                  fontSize: 11,
                  color: "rgba(30, 30, 60, 0.5)",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                💡 {item.advice}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
