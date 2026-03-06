"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import {
  BODY_FOOT_MEASUREMENT_FIELDS,
  type BodyFootMeasurementKey,
} from "@/lib/body/footMeasurements";

const FIELD_META: Record<
  BodyFootMeasurementKey,
  {
    color: string;
    tip: string;
    line?: { x1: number; y1: number; x2: number; y2: number };
    ellipse?: { cx: number; cy: number; rx: number; ry: number };
    dots?: Array<{ cx: number; cy: number }>;
    label: { x: number; y: number };
  }
> = {
  foot_length_cm: {
    color: "#0ea5e9",
    tip: "かかと〜最長つま先",
    line: { x1: 534, y1: 1230, x2: 534, y2: 598 },
    dots: [{ cx: 534, cy: 1230 }, { cx: 534, cy: 598 }],
    label: { x: 710, y: 920 },
  },
  foot_girth_cm: {
    color: "#14b8a6",
    tip: "最も張る部分を一周",
    ellipse: { cx: 540, cy: 790, rx: 230, ry: 120 },
    dots: [{ cx: 770, cy: 790 }],
    label: { x: 742, y: 650 },
  },
  foot_width_cm: {
    color: "#f97316",
    tip: "最も幅広い部分",
    line: { x1: 300, y1: 100, x2: 785, y2: 100 },
    dots: [{ cx: 300, cy: 815 }, { cx: 785, cy: 815 }],
    label: { x: 705, y: 712 },
  },
};

export default function BodyFootGuide({
  activeFieldKey,
  className,
}: {
  activeFieldKey: BodyFootMeasurementKey | null;
  className?: string;
}) {
  const activeMeta = activeFieldKey ? FIELD_META[activeFieldKey] : null;

  return (
    <div className={className ?? "relative mx-auto w-full max-w-[280px]"}>
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-slate-100">
        <Image
          src="/avatars/ashi.png"
          alt="足の計測ガイド"
          fill
          sizes="(max-width: 1024px) 280px, 320px"
          unoptimized
          className="object-contain"
        />
        <svg viewBox="0 0 1024 1536" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <filter id="body-foot-guide-glow">
              <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {activeMeta?.ellipse ? (
            <ellipse
              cx={activeMeta.ellipse.cx}
              cy={activeMeta.ellipse.cy}
              rx={activeMeta.ellipse.rx}
              ry={activeMeta.ellipse.ry}
              fill="none"
              stroke={activeMeta.color}
              strokeWidth="16"
              strokeDasharray="28 18"
              filter="url(#body-foot-guide-glow)"
              style={{ animation: "bodyFootGuidePulse 1.6s ease-in-out infinite" } as CSSProperties}
            />
          ) : null}

          {activeMeta?.line ? (
            <line
              x1={activeMeta.line.x1}
              y1={activeMeta.line.y1}
              x2={activeMeta.line.x2}
              y2={activeMeta.line.y2}
              stroke={activeMeta.color}
              strokeWidth="16"
              strokeLinecap="round"
              filter="url(#body-foot-guide-glow)"
              style={{ animation: "bodyFootGuidePulse 1.6s ease-in-out infinite" } as CSSProperties}
            />
          ) : null}

          {activeMeta?.dots?.map((dot, index) => (
            <circle
              key={`${activeFieldKey}-dot-${index}`}
              cx={dot.cx}
              cy={dot.cy}
              r="18"
              fill={activeMeta.color}
              style={{ animation: "bodyFootGuidePulse 1.6s ease-in-out infinite" } as CSSProperties}
            />
          ))}

          {activeFieldKey ? (
            <g style={{ animation: "bodyFootGuideFadeIn 0.2s ease-out" } as CSSProperties}>
              <rect
                x={Math.max(24, activeMeta!.label.x - 170)}
                y={Math.max(24, activeMeta!.label.y - 42)}
                width="340"
                height="82"
                rx="24"
                fill={activeMeta!.color}
                opacity="0.92"
              />
              <text
                x={activeMeta!.label.x}
                y={activeMeta!.label.y + 8}
                fill="white"
                fontSize="38"
                fontWeight="700"
                textAnchor="middle"
              >
                {BODY_FOOT_MEASUREMENT_FIELDS.find((field) => field.key === activeFieldKey)?.label?.replace("（cm）", "")}
              </text>
            </g>
          ) : null}
        </svg>
      </div>

      <style jsx>{`
        @keyframes bodyFootGuidePulse {
          0%, 100% {
            opacity: 0.65;
          }
          50% {
            opacity: 1;
          }
        }
        @keyframes bodyFootGuideFadeIn {
          from {
            opacity: 0;
            transform: translateY(2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
