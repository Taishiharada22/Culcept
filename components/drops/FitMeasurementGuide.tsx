"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getFitGuideDefinition, type FitGuideId, type FitGuideOverlay, type FitGuideViewKey } from "@/lib/drops/fitGuide";

type ImageBox = { left: number; top: number; width: number; height: number };

function computeImageBox(
  naturalWidth: number,
  naturalHeight: number,
  clientWidth: number,
  clientHeight: number
): ImageBox {
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

function toCssPoint(box: ImageBox, x: number, y: number) {
  return {
    x: box.left + box.width * x,
    y: box.top + box.height * y,
  };
}

function GuideStage({
  viewCandidates,
  overlay,
}: {
  viewCandidates: string[];
  overlay: FitGuideOverlay | null;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = stageRef.current;
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

  const src = viewCandidates[candidateIndex] ?? null;
  const labelText = overlay?.label ?? "計測ガイド";

  return (
    <div
      ref={stageRef}
      className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-white/70 bg-white/70 shadow-inner"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={labelText}
          className="absolute inset-0 h-full w-full object-contain"
          onLoad={(event) => {
            const image = event.currentTarget;
            setNaturalSize({
              width: image.naturalWidth,
              height: image.naturalHeight,
            });
          }}
          onError={() => setCandidateIndex((current) => current + 1)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-400">
          ガイド画像を準備中です
        </div>
      )}

      {overlay && src ? (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${boxSize.width || 1} ${boxSize.height || 1}`}
          preserveAspectRatio="none"
        >
          <defs>
            <filter id="fit-guide-glow">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {overlay.linePct ? (() => {
            const start = toCssPoint(imageBox, overlay.linePct.x1, overlay.linePct.y1);
            const end = toCssPoint(imageBox, overlay.linePct.x2, overlay.linePct.y2);
            return (
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={overlay.color}
                strokeWidth="4"
                strokeLinecap="round"
                filter="url(#fit-guide-glow)"
                style={{ animation: "fitGuidePulse 1.6s ease-in-out infinite" } as CSSProperties}
              />
            );
          })() : null}

          {overlay.ellipsePct ? (() => {
            const center = toCssPoint(imageBox, overlay.ellipsePct.cx, overlay.ellipsePct.cy);
            return (
              <ellipse
                cx={center.x}
                cy={center.y}
                rx={imageBox.width * overlay.ellipsePct.rx}
                ry={imageBox.height * overlay.ellipsePct.ry}
                fill="none"
                stroke={overlay.color}
                strokeWidth="4"
                strokeDasharray="10 8"
                filter="url(#fit-guide-glow)"
                style={{ animation: "fitGuidePulse 1.6s ease-in-out infinite" } as CSSProperties}
              />
            );
          })() : null}

          {overlay.dotsPct?.map((dot, index) => {
            const point = toCssPoint(imageBox, dot.x, dot.y);
            return (
              <circle
                key={`${overlay.label}-dot-${index}`}
                cx={point.x}
                cy={point.y}
                r="6"
                fill={overlay.color}
                style={{ animation: "fitGuidePulse 1.6s ease-in-out infinite" } as CSSProperties}
              />
            );
          })}

          {overlay.labelPct ? (() => {
            const anchor = toCssPoint(imageBox, overlay.labelPct.x, overlay.labelPct.y);
            const labelWidth = Math.min(160, Math.max(112, labelText.length * 12));
            const rectX = Math.max(
              16,
              Math.min(anchor.x - labelWidth / 2, Math.max(16, boxSize.width - labelWidth - 16))
            );
            const rectY = Math.max(16, Math.min(anchor.y - 16, Math.max(16, boxSize.height - 48)));
            return (
              <g style={{ animation: "fitGuideFadeIn 0.2s ease-out" } as CSSProperties}>
                <rect x={rectX} y={rectY} width={labelWidth} height="34" rx="17" fill={overlay.color} opacity="0.92" />
                <text
                  x={rectX + labelWidth / 2}
                  y={rectY + 22}
                  fill="white"
                  fontSize="12"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {labelText}
                </text>
              </g>
            );
          })() : null}
        </svg>
      ) : null}

      <style jsx>{`
        @keyframes fitGuidePulse {
          0%,
          100% {
            opacity: 0.7;
          }
          50% {
            opacity: 1;
          }
        }
        @keyframes fitGuideFadeIn {
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

export default function FitMeasurementGuide({
  guideId,
  activeFieldKey,
  className,
}: {
  guideId: FitGuideId | null;
  activeFieldKey: string | null;
  className?: string;
}) {
  const guide = getFitGuideDefinition(guideId);
  const overlay = useMemo<FitGuideOverlay | null>(() => {
    if (!guide || !activeFieldKey) return null;
    return guide.overlays[activeFieldKey] ?? null;
  }, [guide, activeFieldKey]);

  const desiredView: FitGuideViewKey | null = overlay?.view ?? guide?.defaultView ?? null;
  const viewCandidates = useMemo(() => {
    if (!guide || !desiredView) return [] as string[];
    const priority = [
      desiredView,
      guide.defaultView,
      "naname" as const,
      "mae" as const,
      "yoko" as const,
      "ue" as const,
    ].filter((value, index, array) => array.indexOf(value) === index);

    return priority.flatMap((view) => guide.views[view] ?? []);
  }, [desiredView, guide]);

  const resetKey = `${guideId ?? "none"}:${desiredView ?? "none"}`;

  return (
    <div className={className ?? "relative w-full"}>
      <GuideStage key={resetKey} viewCandidates={viewCandidates} overlay={overlay} />
    </div>
  );
}
