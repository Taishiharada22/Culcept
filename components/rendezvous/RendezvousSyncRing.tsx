"use client";

/**
 * RendezvousSyncRing v2
 * SVG circle progress ring showing SYNC percentage.
 * Living Score trajectory arrow indicator.
 */

type TrajectoryDirection = "rising" | "stable" | "cooling";

type Props = {
  percent: number;
  size?: number;
  strokeWidth?: number;
  /** 文脈カラーを上書きしたい場合 */
  color?: string;
  /** Living Score trajectory */
  trajectory?: {
    direction: TrajectoryDirection;
    livingScore: number;
  } | null;
};

const DIRECTION_ARROW: Record<TrajectoryDirection, { d: string; color: string }> = {
  rising: { d: "M0 4 L3 0 L6 4", color: "#22C55E" },
  stable: { d: "M0 3 L6 3", color: "#6366F1" },
  cooling: { d: "M0 0 L3 4 L6 0", color: "#F59E0B" },
};

export default function RendezvousSyncRing({
  percent,
  size = 40,
  strokeWidth = 3,
  color,
  trajectory,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Use livingScore when available
  const displayPercent = trajectory?.livingScore ?? percent;
  const offset = circumference - (Math.min(displayPercent, 100) / 100) * circumference;

  const ringColor = color ?? "#6366F1";
  const trackColor = "rgba(99, 102, 241, 0.1)";
  const textColor = "rgba(30, 30, 60, 0.7)";

  const dir = trajectory?.direction;
  const arrow = dir ? DIRECTION_ARROW[dir] : null;

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 0.6s ease",
            filter: `drop-shadow(0 0 3px ${ringColor}44)`,
          }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: size < 36 ? 8 : 10,
            fontWeight: 700,
            color: textColor,
            fontFamily: "'JetBrains Mono','SF Mono',monospace",
            lineHeight: 1,
          }}
        >
          {displayPercent}
        </span>
        {arrow && size >= 40 && (
          <svg width={6} height={5} viewBox="0 0 6 5" style={{ marginTop: 1 }}>
            <path
              d={arrow.d}
              fill="none"
              stroke={arrow.color}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
