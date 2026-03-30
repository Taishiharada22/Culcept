"use client";

/**
 * TrajectorySection
 * 関係の育ち方 — タイムラインUIでフェーズを接続ノードで表示
 */

import type { TrajectoryForecast } from "@/lib/orbiter/types";

const PACE_ICON: Record<string, string> = {
  slow: "🐢",
  moderate: "🚶",
  fast: "⚡",
};

type Props = {
  trajectoryForecast: TrajectoryForecast;
};

export default function TrajectorySection({ trajectoryForecast }: Props) {
  const {
    typeLabel,
    typeDescription,
    phases,
    estimatedPace,
    paceNarrative,
  } = trajectoryForecast;

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
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 2.5,
              height: 12,
              borderRadius: 2,
              background: "#8B5CF6",
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
            関係の育ち方
          </span>
        </div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: "#8B5CF6",
            padding: "2px 8px",
            borderRadius: 6,
            background: "rgba(139, 92, 246, 0.08)",
          }}
        >
          {PACE_ICON[estimatedPace] ?? "🚶"} {typeLabel}
        </span>
      </div>

      {/* Type description */}
      <p
        style={{
          fontSize: 12,
          color: "rgba(30, 30, 60, 0.55)",
          lineHeight: 1.7,
          margin: "0 0 16px",
        }}
      >
        {typeDescription}
      </p>

      {/* Timeline */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {phases.map((phase, i) => {
          const isLast = i === phases.length - 1;
          return (
            <div
              key={`phase-${i}`}
              style={{
                display: "flex",
                gap: 12,
                paddingBottom: isLast ? 0 : 16,
                position: "relative",
              }}
            >
              {/* Timeline line + node */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: 20,
                  flexShrink: 0,
                }}
              >
                {/* Node */}
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background:
                      i === 0
                        ? "#8B5CF6"
                        : isLast
                          ? "rgba(139, 92, 246, 0.3)"
                          : "rgba(139, 92, 246, 0.5)",
                    border: "2px solid rgba(139, 92, 246, 0.2)",
                    flexShrink: 0,
                    marginTop: 4,
                  }}
                />
                {/* Line */}
                {!isLast && (
                  <div
                    style={{
                      width: 1.5,
                      flex: 1,
                      background:
                        "linear-gradient(180deg, rgba(139,92,246,0.3) 0%, rgba(139,92,246,0.1) 100%)",
                      marginTop: 4,
                    }}
                  />
                )}
              </div>

              {/* Phase content */}
              <div style={{ flex: 1, paddingTop: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "rgba(30, 30, 60, 0.75)",
                    }}
                  >
                    {phase.name}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      color: "rgba(30, 30, 60, 0.4)",
                    }}
                  >
                    {phase.estimatedDuration}
                  </span>
                </div>

                <p
                  style={{
                    fontSize: 11,
                    color: "rgba(30, 30, 60, 0.5)",
                    lineHeight: 1.6,
                    margin: "0 0 6px",
                  }}
                >
                  {phase.description}
                </p>

                {/* Risk points */}
                {phase.riskPoints.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    {phase.riskPoints.map((risk, ri) => (
                      <div
                        key={`risk-${ri}`}
                        style={{
                          fontSize: 10,
                          color: "rgba(239, 68, 68, 0.7)",
                          padding: "2px 0",
                        }}
                      >
                        ⚠ {risk}
                      </div>
                    ))}
                  </div>
                )}

                {/* Growth opportunities */}
                {phase.growthOpportunities.length > 0 && (
                  <div>
                    {phase.growthOpportunities.map((growth, gi) => (
                      <div
                        key={`growth-${gi}`}
                        style={{
                          fontSize: 10,
                          color: "rgba(16, 185, 129, 0.7)",
                          padding: "2px 0",
                        }}
                      >
                        ✦ {growth}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pace narrative */}
      <div
        style={{
          marginTop: 14,
          padding: "10px 12px",
          borderRadius: 10,
          background: "rgba(139, 92, 246, 0.04)",
        }}
      >
        <p
          style={{
            fontSize: 11,
            color: "rgba(30, 30, 60, 0.5)",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {PACE_ICON[estimatedPace] ?? "🚶"} {paceNarrative}
        </p>
      </div>
    </div>
  );
}
