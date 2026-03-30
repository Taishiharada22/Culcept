"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  signature: {
    shape?: string;
    japaneseName?: string;
    meaning?: string;
    color?: string;
    complexity?: number;
  } | null;
};

/** SVG shape renderers — each draws within a 60x60 viewBox */
function renderShape(
  shape: string,
  color: string,
  fillOpacity: number,
): React.ReactNode {
  const common = {
    stroke: color,
    strokeWidth: 1.5,
    fill: color,
    fillOpacity,
  };

  switch (shape) {
    case "circle":
      return (
        <>
          <circle cx={30} cy={30} r={22} {...common} />
          <circle
            cx={30}
            cy={30}
            r={22}
            fill="none"
            stroke={color}
            strokeWidth={0.5}
            opacity={0.3}
            filter="url(#glow)"
          />
        </>
      );

    case "star": {
      // 6-pointed star
      const points: string[] = [];
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI / 6) * i - Math.PI / 2;
        const r = i % 2 === 0 ? 24 : 12;
        points.push(`${30 + r * Math.cos(angle)},${30 + r * Math.sin(angle)}`);
      }
      return <polygon points={points.join(" ")} {...common} />;
    }

    case "crystal": {
      // Hexagon with internal lines
      const hex: string[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        hex.push(`${30 + 22 * Math.cos(angle)},${30 + 22 * Math.sin(angle)}`);
      }
      const hexPoints = hex.join(" ");
      return (
        <>
          <polygon points={hexPoints} {...common} />
          {/* Internal structural lines */}
          {[0, 1, 2].map((i) => {
            const a1 = (Math.PI / 3) * i - Math.PI / 2;
            const a2 = (Math.PI / 3) * (i + 3) - Math.PI / 2;
            return (
              <line
                key={i}
                x1={30 + 22 * Math.cos(a1)}
                y1={30 + 22 * Math.sin(a1)}
                x2={30 + 22 * Math.cos(a2)}
                y2={30 + 22 * Math.sin(a2)}
                stroke={color}
                strokeWidth={0.6}
                opacity={0.4}
              />
            );
          })}
        </>
      );
    }

    case "wave": {
      // Sine wave path
      let d = "M 4 30";
      for (let x = 4; x <= 56; x += 1) {
        const y = 30 + 14 * Math.sin(((x - 4) / 52) * Math.PI * 3);
        d += ` L ${x} ${y}`;
      }
      return (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      );
    }

    case "spiral": {
      // Archimedean spiral
      let d = "";
      const turns = 3;
      const steps = 120;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * turns * Math.PI * 2;
        const r = 2 + (22 * i) / steps;
        const x = 30 + r * Math.cos(t);
        const y = 30 + r * Math.sin(t);
        d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
      }
      return (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      );
    }

    case "flame": {
      // Teardrop / flame shape
      const d = [
        "M 30 6",
        "C 40 18, 48 30, 46 40",
        "C 44 50, 36 56, 30 56",
        "C 24 56, 16 50, 14 40",
        "C 12 30, 20 18, 30 6",
        "Z",
      ].join(" ");
      return <path d={d} {...common} />;
    }

    default:
      return <circle cx={30} cy={30} r={22} {...common} />;
  }
}

export default function PsycheSignatureDisplay({ signature }: Props) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (!signature) return null;

  const {
    shape = "circle",
    japaneseName = "",
    meaning = "",
    color = "#8b5cf6",
    complexity = 0.5,
  } = signature;

  const fillOpacity = 0.08 + complexity * 0.12;

  return (
    <div
      style={{
        borderRadius: 16,
        padding: 14,
        background: `linear-gradient(135deg, ${color}0A 0%, transparent 60%)`,
        border: `1px solid ${color}26`,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 60,
          height: 60,
        }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 60 60"
          width={60}
          height={60}
          style={{
            animation: prefersReducedMotion
              ? "none"
              : "psycheSignatureRotate 20s linear infinite",
          }}
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {renderShape(shape, color, fillOpacity)}
        </svg>
      </div>

      <div style={{ minWidth: 0 }}>
        {japaneseName && (
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: color,
              lineHeight: 1.3,
            }}
          >
            {japaneseName}
          </div>
        )}
        {meaning && (
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.55)",
              lineHeight: 1.4,
              marginTop: 2,
            }}
          >
            {meaning}
          </div>
        )}
      </div>

      <style>{`
        @keyframes psycheSignatureRotate {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
