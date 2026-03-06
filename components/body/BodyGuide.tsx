"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type ViewMode = "front" | "side";

type BodyMetricKey =
  | "inseam"
  | "yukitake"
  | "waist_position"
  | "shoulder_slope"
  | "pelvic_tilt"
  | "chest_width"
  | "rib_arch"
  | "pelvis_width"
  | "rise"
  | "thigh"
  | "calf"
  | "sleeve_length";

type OverlayDef = {
  id: string;
  metricKey: BodyMetricKey;
  d: string;
  label: string;
  tap: [number, number, number, number];
  color: string;
  viewMode: ViewMode;
  labelAnchor?: [number, number, "start" | "end"];
};

type FocusPreset = {
  viewMode: ViewMode;
  centerX: number;
  centerY: number;
  scale: number;
};

const ZOOM_DURATION_MS = 320;
const CROSSFADE_DURATION_MS = 160;
const OVERLAY_FADE_DURATION_MS = 140;
const STAGE_EASING = "cubic-bezier(0.22, 0.8, 0.22, 1)";

const BODY_OVERLAYS: OverlayDef[] = [
  {
    id: "line_inseam",
    metricKey: "inseam",
    d: "M50 70 L50 125",
    label: "股下",
    tap: [50, 101, 18, 72],
    color: "#a78bfa",
    viewMode: "front",
    labelAnchor: [55, 90, "start"],
  },
  {
    id: "line_yuki",
    metricKey: "yukitake",
    d: "M51 26 L64 30 L68 65",
    label: "裄丈",
    tap: [64, 44, 32, 54],
    color: "#38bdf8",
    viewMode: "front",
    labelAnchor: [70, 22, "start"],
  },
  {
    id: "line_waist_height",
    metricKey: "waist_position",
    d: "M42.5 50 L57.5 50",
    label: "ウエスト",
    tap: [50, 68, 34, 14],
    color: "#fb923c",
    viewMode: "front",
    labelAnchor: [40, 65, "start"],
  },
  {
    id: "zone_shoulder",
    metricKey: "shoulder_slope",
    d: "M50 26 L63 29",
    label: "肩傾斜",
    tap: [54, 26, 30, 14],
    color: "#22d3ee",
    viewMode: "front",
    labelAnchor: [50, 50, "start"],
  },
  {
    id: "zone_pelvis",
    metricKey: "pelvic_tilt",
    d: "M45 65 Q55 69 60 72 M60 72 L58 86",
    label: "骨盤前傾",
    tap: [54, 66, 22, 26],
    color: "#4ade80",
    viewMode: "side",
    labelAnchor: [40, 50, "start"],
  },
  {
    id: "zone_ribcage",
    metricKey: "chest_width",
    d: "M41 40 L59 40",
    label: "胸郭横幅",
    tap: [50, 45, 36, 14],
    color: "#f472b6",
    viewMode: "front",
    labelAnchor: [45, 60, "start"],
  },
  {
    id: "zone_costal_arch",
    metricKey: "rib_arch",
    d: "M42 46 M50 46 M58 46",
    label: "肋骨弓",
    tap: [50, 58, 34, 16],
    color: "#fbbf24",
    viewMode: "front",
    labelAnchor: [50, 80, "start"],
  },
  {
    id: "zone_pelvic_width",
    metricKey: "pelvis_width",
    d: "M37.5 65 L62.5 65",
    label: "骨盤幅",
    tap: [50, 82, 38, 14],
    color: "#34d399",
    viewMode: "front",
    labelAnchor: [40, 85, "start"],
  },
  {
    id: "line_rise",
    metricKey: "rise",
    d: "M50 56 L50 70",
    label: "股上",
    tap: [56, 79, 16, 28],
    color: "#c084fc",
    viewMode: "front",
    labelAnchor: [40, 40, "start"],
  },
  {
    id: "zone_thigh",
    metricKey: "thigh",
    d: "M51 73 L62 73",
    label: "太もも",
    tap: [63, 107, 18, 12],
    color: "#fb7185",
    viewMode: "front",
    labelAnchor: [50, 103, "start"],
  },
  {
    id: "zone_calf",
    metricKey: "calf",
    d: "M52 105 L58 105",
    label: "ふくらはぎ",
    tap: [63, 126, 16, 12],
    color: "#60a5fa",
    viewMode: "front",
    labelAnchor: [35, 125, "start"],
  },
  {
    id: "line_sleeve",
    metricKey: "sleeve_length",
    d: "M64 30 Q66 50 68 65",
    label: "袖丈",
    tap: [70, 48, 22, 50],
    color: "#2dd4bf",
    viewMode: "front",
    labelAnchor: [70, 25, "start"],
  },
];

const BODY_FOCUS_PRESETS: Record<BodyMetricKey, FocusPreset> = {
  inseam: { viewMode: "front", centerX: 0.5, centerY: 0.66, scale: 2.15 },
  yukitake: { viewMode: "front", centerX: 0.6, centerY: 0.26, scale: 1.8 },
  waist_position: { viewMode: "front", centerX: 0.5, centerY: 0.46, scale: 2.0 },
  shoulder_slope: { viewMode: "front", centerX: 0.5, centerY: 0.21, scale: 2.2 },
  pelvic_tilt: { viewMode: "side", centerX: 0.53, centerY: 0.52, scale: 2.15 },
  chest_width: { viewMode: "front", centerX: 0.5, centerY: 0.3, scale: 2.0 },
  rib_arch: { viewMode: "front", centerX: 0.5, centerY: 0.38, scale: 2.15 },
  pelvis_width: { viewMode: "front", centerX: 0.5, centerY: 0.54, scale: 2.0 },
  rise: { viewMode: "front", centerX: 0.5, centerY: 0.58, scale: 2.2 },
  thigh: { viewMode: "front", centerX: 0.5, centerY: 0.69, scale: 2.2 },
  calf: { viewMode: "front", centerX: 0.5, centerY: 0.82, scale: 2.35 },
  sleeve_length: { viewMode: "front", centerX: 0.6, centerY: 0.31, scale: 1.85 },
};

const OVERLAY_BY_ID = Object.fromEntries(BODY_OVERLAYS.map((overlay) => [overlay.id, overlay])) as Record<string, OverlayDef>;
const FRONT_IMAGE_SRC = "/avatars/avatar_zenshin.png";
const SIDE_IMAGE_SRC = "/avatars/avatar_yoko.png";

function computeStageTransform(
  preset: FocusPreset,
  viewportWidth: number,
  viewportHeight: number,
  stageWidth: number,
  stageHeight: number,
) {
  const focusX = stageWidth * preset.centerX;
  const focusY = stageHeight * preset.centerY;

  const translateX = viewportWidth / 2 - focusX * preset.scale;
  const translateY = viewportHeight / 2 - focusY * preset.scale;

  return {
    x: translateX,
    y: translateY,
    scale: preset.scale,
  };
}

function extractPathPoints(pathData: string) {
  return pathData.match(/[ML]\s*(\d+\.?\d*)\s+(\d+\.?\d*)/g)?.map((segment) => {
    const [x, y] = segment.replace(/[ML]\s*/, "").split(/\s+/);
    return { x: Number(x), y: Number(y) };
  }) ?? [];
}

export { BODY_OVERLAYS };

export default function BodyGuide({
  activeOverlayId,
  onOverlayTap,
  compact = false,
  className,
}: {
  activeOverlayId?: string | null;
  onOverlayTap?: (overlayId: string) => void;
  compact?: boolean;
  className?: string;
}) {
  const interactive = Boolean(onOverlayTap);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const crossfadeTimerRef = useRef<number | null>(null);
  const zoomTimerRef = useRef<number | null>(null);
  const currentViewModeRef = useRef<ViewMode>("front");

  const [selectedBodyMetric, setSelectedBodyMetric] = useState<BodyMetricKey | null>(null);
  const [currentViewMode, setCurrentViewMode] = useState<ViewMode>("front");
  const [activePreset, setActivePreset] = useState<FocusPreset | null>(null);
  const [isZooming, setIsZooming] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [frontLoaded, setFrontLoaded] = useState(false);
  const [sideLoaded, setSideLoaded] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    currentViewModeRef.current = currentViewMode;
  }, [currentViewMode]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    const updateSize = () => {
      setViewportSize({
        width: node.clientWidth,
        height: node.clientHeight,
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (crossfadeTimerRef.current) {
        window.clearTimeout(crossfadeTimerRef.current);
      }
      if (zoomTimerRef.current) {
        window.clearTimeout(zoomTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (crossfadeTimerRef.current) {
      window.clearTimeout(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }
    if (zoomTimerRef.current) {
      window.clearTimeout(zoomTimerRef.current);
      zoomTimerRef.current = null;
    }

    let frameId: number | null = null;

    if (!activeOverlayId) {
      frameId = window.requestAnimationFrame(() => {
        setShowOverlay(false);
        setIsZooming(false);
        setSelectedBodyMetric(null);
        setActivePreset(null);
        setCurrentViewMode("front");
      });
      return () => {
        if (frameId != null) {
          window.cancelAnimationFrame(frameId);
        }
      };
    }

    const overlay = OVERLAY_BY_ID[activeOverlayId];
    if (!overlay) {
      frameId = window.requestAnimationFrame(() => {
        setShowOverlay(false);
        setIsZooming(false);
        setSelectedBodyMetric(null);
        setActivePreset(null);
        setCurrentViewMode("front");
      });
      return () => {
        if (frameId != null) {
          window.cancelAnimationFrame(frameId);
        }
      };
    }

    const nextPreset = BODY_FOCUS_PRESETS[overlay.metricKey];

    frameId = window.requestAnimationFrame(() => {
      setShowOverlay(false);
      setIsZooming(true);
      setSelectedBodyMetric(overlay.metricKey);

      const startStageZoom = () => {
        setActivePreset(nextPreset);
        zoomTimerRef.current = window.setTimeout(() => {
          setIsZooming(false);
          setShowOverlay(true);
        }, ZOOM_DURATION_MS);
      };

      const needsViewSwitch = currentViewModeRef.current !== nextPreset.viewMode;

      if (needsViewSwitch) {
        setCurrentViewMode(nextPreset.viewMode);
        crossfadeTimerRef.current = window.setTimeout(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              startStageZoom();
            });
          });
        }, CROSSFADE_DURATION_MS);
        return;
      }

      startStageZoom();
    });

    return () => {
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [activeOverlayId]);

  const selectedOverlay = useMemo(() => {
    if (!selectedBodyMetric) return null;
    return BODY_OVERLAYS.find((overlay) => overlay.metricKey === selectedBodyMetric) ?? null;
  }, [selectedBodyMetric]);

  const stageReady = currentViewMode === "front" ? frontLoaded : sideLoaded;

  const frontTransform = useMemo(() => {
    if (!activePreset || currentViewMode !== "front" || activePreset.viewMode !== "front" || !viewportSize.width || !viewportSize.height) {
      return { x: 0, y: 0, scale: 1 };
    }
    return computeStageTransform(
      activePreset,
      viewportSize.width,
      viewportSize.height,
      viewportSize.width,
      viewportSize.height,
    );
  }, [activePreset, currentViewMode, viewportSize.height, viewportSize.width]);

  const sideTransform = useMemo(() => {
    if (!activePreset || currentViewMode !== "side" || activePreset.viewMode !== "side" || !viewportSize.width || !viewportSize.height) {
      return { x: 0, y: 0, scale: 1 };
    }
    return computeStageTransform(
      activePreset,
      viewportSize.width,
      viewportSize.height,
      viewportSize.width,
      viewportSize.height,
    );
  }, [activePreset, currentViewMode, viewportSize.height, viewportSize.width]);

  const frontStageStyle: CSSProperties = {
    opacity: currentViewMode === "front" ? 1 : 0,
    pointerEvents: currentViewMode === "front" ? "auto" : "none",
    transform: `translate(${frontTransform.x}px, ${frontTransform.y}px) scale(${frontTransform.scale})`,
    transformOrigin: "top left",
    transition: `opacity ${CROSSFADE_DURATION_MS}ms ease, transform ${ZOOM_DURATION_MS}ms ${STAGE_EASING}`,
    willChange: "transform, opacity",
  };

  const sideStageStyle: CSSProperties = {
    opacity: currentViewMode === "side" ? 1 : 0,
    pointerEvents: currentViewMode === "side" ? "auto" : "none",
    transform: `translate(${sideTransform.x}px, ${sideTransform.y}px) scale(${sideTransform.scale})`,
    transformOrigin: "top left",
    transition: `opacity ${CROSSFADE_DURATION_MS}ms ease, transform ${ZOOM_DURATION_MS}ms ${STAGE_EASING}`,
    willChange: "transform, opacity",
  };

  const renderOverlayLayer = (stageViewMode: ViewMode) => (
    <svg
      viewBox="0 0 100 150"
      className={`absolute inset-0 h-full w-full ${interactive ? "" : "pointer-events-none"}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <filter id={`body-guide-glow-${stageViewMode}`}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {BODY_OVERLAYS.map((overlay) => {
        const [cx, cy, w, h] = overlay.tap;
        const isActiveOverlay =
          selectedOverlay?.id === overlay.id &&
          overlay.viewMode === stageViewMode &&
          stageReady &&
          showOverlay;
        const labelAnchor = overlay.labelAnchor ?? [cx + w / 2 + 2, cy - 4, "start"];
        const labelWidth = overlay.label.length * 5.2 + 6;
        const labelX = labelAnchor[2] === "end" ? labelAnchor[0] - labelWidth : labelAnchor[0];
        const pathPoints = extractPathPoints(overlay.d);

        return (
          <g key={`${stageViewMode}-${overlay.id}`}>
            <g
              style={{
                opacity: isActiveOverlay ? 1 : 0,
                transition: `opacity ${OVERLAY_FADE_DURATION_MS}ms ease`,
              }}
            >
              <path
                d={overlay.d}
                fill="none"
                stroke={overlay.color}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={`url(#body-guide-glow-${stageViewMode})`}
                style={isActiveOverlay ? ({ animation: "bodyGuidePulse 1.6s ease-in-out infinite" } as CSSProperties) : undefined}
              />

              {pathPoints.map((point, index) => (
                <circle
                  key={`${overlay.id}-dot-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={2}
                  fill={overlay.color}
                  style={isActiveOverlay ? ({ animation: "bodyGuidePulse 1.6s ease-in-out infinite" } as CSSProperties) : undefined}
                />
              ))}

              <g style={isActiveOverlay ? ({ animation: "bodyGuideFadeIn 0.3s ease-out" } as CSSProperties) : undefined}>
                <rect x={labelX} y={labelAnchor[1] - 5} width={labelWidth} height={11} rx={3} fill={overlay.color} opacity={0.92} />
                <text
                  x={labelAnchor[2] === "end" ? labelAnchor[0] - labelWidth + 3 : labelAnchor[0] + 3}
                  y={labelAnchor[1] + 3}
                  fill="white"
                  fontSize="5.5"
                  fontWeight="bold"
                >
                  {overlay.label}
                </text>
              </g>
            </g>

            {interactive && (
              <rect
                x={cx - w / 2}
                y={cy - h / 2}
                width={w}
                height={h}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => onOverlayTap?.(overlay.id)}
              />
            )}
          </g>
        );
      })}
    </svg>
  );

  return (
    <div className={className ?? `relative w-full ${compact ? "max-w-[260px]" : "max-w-[420px]"}`}>
      <div
        ref={viewportRef}
        aria-busy={isZooming}
        className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100/70"
        style={{ aspectRatio: "2 / 3" }}
      >
        <div className="absolute inset-0" style={frontStageStyle} aria-hidden={currentViewMode !== "front"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={FRONT_IMAGE_SRC}
            alt="body guide front"
            className="h-full w-full select-none object-cover"
            draggable={false}
            onLoad={() => setFrontLoaded(true)}
          />
          {renderOverlayLayer("front")}
        </div>

        <div className="absolute inset-0" style={sideStageStyle} aria-hidden={currentViewMode !== "side"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={SIDE_IMAGE_SRC}
            alt="body guide side"
            className="h-full w-full select-none object-cover"
            draggable={false}
            onLoad={() => setSideLoaded(true)}
          />
          {renderOverlayLayer("side")}
        </div>

        {!frontLoaded && currentViewMode === "front" && (
          <div className="absolute inset-0 bg-gradient-to-b from-slate-50 to-slate-100/70" />
        )}
        {!sideLoaded && currentViewMode === "side" && (
          <div className="absolute inset-0 bg-gradient-to-b from-slate-50 to-slate-100/70" />
        )}

      </div>

      <style jsx>{`
        @keyframes bodyGuidePulse {
          0%,
          100% {
            opacity: 0.62;
          }
          50% {
            opacity: 1;
          }
        }
        @keyframes bodyGuideFadeIn {
          from {
            opacity: 0;
            transform: translateX(-2px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
