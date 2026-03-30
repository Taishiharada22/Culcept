"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BODY_FOOT_MEASUREMENT_FIELDS,
  type BodyFootMeasurementKey,
} from "@/lib/body/footMeasurements";

const FIELD_META: Record<
  BodyFootMeasurementKey,
  {
    color: string;
    tip: string;
    linePct?: { x1: number; y1: number; x2: number; y2: number };
    ellipsePct?: { cx: number; cy: number; rx: number; ry: number };
    dotsPct?: Array<{ x: number; y: number }>;
    labelPct: { x: number; y: number };
  }
> = {
  foot_length_cm: {
    color: "#0ea5e9",
    tip: "かかと〜最長つま先",
    linePct: { x1: 0.565, y1: 0.925, x2: 0.425, y2: 0.605 },
    dotsPct: [
      { x: 0.565, y: 0.925 },
      { x: 0.425, y: 0.605 },
    ],
    labelPct: { x: 0.695, y: 0.675 },
  },
  foot_girth_cm: {
    color: "#14b8a6",
    tip: "最も張る部分を一周",
    ellipsePct: { cx: 0.535, cy: 0.665, rx: 0.155, ry: 0.07 },
    dotsPct: [{ x: 0.69, y: 0.665 }],
    labelPct: { x: 0.705, y: 0.595 },
  },
  foot_width_cm: {
    color: "#f97316",
    tip: "最も幅広い部分",
    linePct: { x1: 0.395, y1: 0.665, x2: 0.675, y2: 0.665 },
    dotsPct: [
      { x: 0.395, y: 0.665 },
      { x: 0.675, y: 0.665 },
    ],
    labelPct: { x: 0.705, y: 0.725 },
  },
};

type ImageBox = { left: number; top: number; width: number; height: number };

function computeImageBox(naturalWidth: number, naturalHeight: number, clientWidth: number, clientHeight: number): ImageBox {
  if (!naturalWidth || !naturalHeight || !clientWidth || !clientHeight) {
    return { left: 0, top: 0, width: clientWidth, height: clientHeight };
  }

  const imageRatio = naturalWidth / naturalHeight;
  const boxRatio = clientWidth / clientHeight;

  if (imageRatio > boxRatio) {
    const width = clientWidth;
    const height = width / imageRatio;
    return {
      left: 0,
      top: (clientHeight - height) / 2,
      width,
      height,
    };
  }

  const height = clientHeight;
  const width = height * imageRatio;
  return {
    left: (clientWidth - width) / 2,
    top: 0,
    width,
    height,
  };
}

function toPoint(box: ImageBox, x: number, y: number) {
  return {
    x: box.left + box.width * x,
    y: box.top + box.height * y,
  };
}

export default function BodyFootGuide({
  activeFieldKey,
  className,
}: {
  activeFieldKey: BodyFootMeasurementKey | null;
  className?: string;
}) {
  const activeMeta = activeFieldKey ? FIELD_META[activeFieldKey] : null;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;

    const updateSize = () => {
      setBoxSize({ width: node.clientWidth, height: node.clientHeight });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const imageBox = useMemo(
    () => computeImageBox(naturalSize.width, naturalSize.height, boxSize.width, boxSize.height),
    [boxSize.height, boxSize.width, naturalSize.height, naturalSize.width]
  );

  const imageCandidates = ["/avatars/ashi.png", "/avatars/ashi.svg"];
  const imageSrc = imageCandidates[candidateIndex] ?? null;

  return (
    <div className={className ?? "relative mx-auto w-full max-w-[280px]"}>
      <div ref={wrapperRef} className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-slate-100">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt="足の計測ガイド"
            className="absolute inset-0 h-full w-full object-contain"
            onLoad={(event) => {
              setNaturalSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
            }}
            onError={() => setCandidateIndex((current) => current + 1)}
          />
        ) : null}

        <svg viewBox={`0 0 ${boxSize.width || 1} ${boxSize.height || 1}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          <defs>
            <filter id="body-foot-guide-glow">
              <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {activeMeta?.ellipsePct ? (() => {
            const center = toPoint(imageBox, activeMeta.ellipsePct.cx, activeMeta.ellipsePct.cy);
            return (
              <ellipse
                cx={center.x}
                cy={center.y}
                rx={imageBox.width * activeMeta.ellipsePct.rx}
                ry={imageBox.height * activeMeta.ellipsePct.ry}
                fill="none"
                stroke={activeMeta.color}
                strokeWidth="8"
                strokeDasharray="18 12"
                filter="url(#body-foot-guide-glow)"
                style={{ animation: "bodyFootGuidePulse 1.6s ease-in-out infinite" } as CSSProperties}
              />
            );
          })() : null}

          {activeMeta?.linePct ? (() => {
            const start = toPoint(imageBox, activeMeta.linePct.x1, activeMeta.linePct.y1);
            const end = toPoint(imageBox, activeMeta.linePct.x2, activeMeta.linePct.y2);
            return (
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={activeMeta.color}
                strokeWidth="8"
                strokeLinecap="round"
                filter="url(#body-foot-guide-glow)"
                style={{ animation: "bodyFootGuidePulse 1.6s ease-in-out infinite" } as CSSProperties}
              />
            );
          })() : null}

          {activeMeta?.dotsPct?.map((dot, index) => {
            const point = toPoint(imageBox, dot.x, dot.y);
            return (
              <circle
                key={`${activeFieldKey}-dot-${index}`}
                cx={point.x}
                cy={point.y}
                r="10"
                fill={activeMeta.color}
                style={{ animation: "bodyFootGuidePulse 1.6s ease-in-out infinite" } as CSSProperties}
              />
            );
          })}

          {activeFieldKey ? (
            (() => {
              const labelPoint = toPoint(imageBox, activeMeta!.labelPct.x, activeMeta!.labelPct.y);
              const labelText = BODY_FOOT_MEASUREMENT_FIELDS.find((field) => field.key === activeFieldKey)?.shortTip ?? activeMeta!.tip;
              const labelWidth = Math.max(132, labelText.length * 14);
              const rectX = Math.max(16, Math.min(labelPoint.x - labelWidth / 2, Math.max(16, boxSize.width - labelWidth - 16)));
              const rectY = Math.max(16, Math.min(labelPoint.y - 18, Math.max(16, boxSize.height - 54)));
              return (
                <g style={{ animation: "bodyFootGuideFadeIn 0.2s ease-out" } as CSSProperties}>
                  <rect
                    x={rectX}
                    y={rectY}
                    width={labelWidth}
                    height="36"
                    rx="18"
                    fill={activeMeta!.color}
                    opacity="0.92"
                  />
                  <text
                    x={rectX + labelWidth / 2}
                    y={rectY + 23}
                    fill="white"
                    fontSize="14"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {labelText}
                  </text>
                </g>
              );
            })()
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
