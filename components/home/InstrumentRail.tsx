"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import InstrumentFlyout, { type FlyoutPage } from "./InstrumentFlyout";
import { useVerticalDragPosition } from "@/hooks/useVerticalDragPosition";

export type InstrumentItem = {
  key: string;
  icon: string;
  label: string;
  color: string;
  progress: number; // 0-100
  pulse: "strong" | "medium" | "soft" | "none";
  href: string;
  flyoutPages: FlyoutPage[];
  usedToday?: boolean; // ストリークドット用
};

type Props = {
  instruments: InstrumentItem[];
  percentileLabel?: string | null;
  offsetY?: number;
  mobileOffsetY?: number;
};

const toRailTranslateY = (offsetY: number) =>
  offsetY === 0 ? "translateY(-50%)" : `translateY(calc(-50% + ${offsetY}px))`;

/* ── Water-fill circle: SVG circle with clipPath fill from bottom ── */
function WaterFillIcon({ icon, color, progress, pulse, isOpen, isComplete }: {
  icon: string; color: string; progress: number; pulse: "strong" | "medium" | "soft" | "none"; isOpen: boolean; isComplete: boolean;
}) {
  const size = 48;
  const pulseConfig = {
    strong: {
      haloInset: -22,
      ringInset: -12,
      outerRingInset: -18,
      glow: `${color}46`,
      border: `${color}aa`,
      outerBorder: `${color}52`,
      animation: "instrumentPulseStrong 1.18s ease-out infinite",
      ringAnimation: "instrumentRingStrong 1.18s ease-in-out infinite",
      outerRingAnimation: "instrumentOuterRingStrong 1.18s ease-out infinite",
      ringOpacity: 1,
      coreAnimation: "instrumentCoreStrong 1.18s ease-in-out infinite",
    },
    medium: {
      haloInset: -12,
      ringInset: -6,
      outerRingInset: -10,
      glow: `${color}22`,
      border: `${color}58`,
      outerBorder: `${color}22`,
      animation: "instrumentPulseMedium 2.2s ease-out infinite",
      ringAnimation: "instrumentRingMedium 2.2s ease-in-out infinite",
      outerRingAnimation: "instrumentOuterRingMedium 2.2s ease-out infinite",
      ringOpacity: 0.72,
      coreAnimation: "instrumentCoreMedium 2.2s ease-in-out infinite",
    },
    soft: {
      haloInset: -5,
      ringInset: -2,
      outerRingInset: null,
      glow: `${color}10`,
      border: `${color}24`,
      outerBorder: null,
      animation: "instrumentPulseSoft 3.8s ease-out infinite",
      ringAnimation: "instrumentRingSoft 3.8s ease-in-out infinite",
      outerRingAnimation: null,
      ringOpacity: 0.36,
      coreAnimation: "instrumentCoreSoft 3.8s ease-in-out infinite",
    },
    none: null,
  } as const;
  const pulseStyle = pulseConfig[pulse];

  return (
    <div style={{ width: size, height: size, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {pulseStyle && !isOpen && !isComplete && (
        <>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: pulseStyle.haloInset,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${pulseStyle.glow} 0%, transparent 72%)`,
              animation: pulseStyle.animation,
              pointerEvents: "none",
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: pulseStyle.ringInset,
              borderRadius: "50%",
              border: `1px solid ${pulseStyle.border}`,
              opacity: pulseStyle.ringOpacity,
              animation: pulseStyle.ringAnimation,
              pointerEvents: "none",
            }}
          />
          {pulseStyle.outerRingInset != null && pulseStyle.outerBorder && pulseStyle.outerRingAnimation && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: pulseStyle.outerRingInset,
                borderRadius: "50%",
                border: `1px solid ${pulseStyle.outerBorder}`,
                opacity: pulse === "strong" ? 0.7 : 0.34,
                animation: pulseStyle.outerRingAnimation,
                pointerEvents: "none",
              }}
            />
          )}
        </>
      )}

      <div
        data-water-fill-icon="true"
        role="meter"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          width: size, height: size, borderRadius: "50%",
          position: "relative", overflow: "hidden",
          background: isOpen ? `${color}15` : "rgba(255,255,255,0.6)",
          border: `2px solid ${isComplete ? "#22c55e" : isOpen ? color : `${color}40`}`,
          boxShadow: isOpen
            ? `0 0 12px ${color}25`
            : pulse === "strong" && !isComplete
              ? `0 0 0 1px ${color}18, 0 0 20px ${color}24, 0 2px 10px rgba(0,0,0,0.08)`
              : pulse === "medium" && !isComplete
                ? `0 0 0 1px ${color}10, 0 0 12px ${color}16, 0 2px 8px rgba(0,0,0,0.07)`
                : "0 2px 8px rgba(0,0,0,0.06)",
          animation: pulseStyle && !isOpen && !isComplete ? pulseStyle.coreAnimation : undefined,
          transition: "all 0.3s ease",
        }}
      >
        {/* Water fill from bottom */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: `${Math.min(100, progress)}%`,
          background: isComplete
            ? "linear-gradient(180deg, rgba(34,197,94,0.2) 0%, rgba(34,197,94,0.35) 100%)"
            : `linear-gradient(180deg, ${color}18 0%, ${color}40 100%)`,
          transition: "height 1s cubic-bezier(0.4, 0, 0.2, 1)",
          borderRadius: "0 0 50% 50%",
        }} />

        {/* Water surface wave */}
        {progress > 0 && progress < 100 && (
          <div style={{
            position: "absolute",
            bottom: `${Math.min(98, progress)}%`,
            left: -4, right: -4, height: 7,
            background: `linear-gradient(90deg, transparent 0%, ${color}20 30%, ${color}30 50%, ${color}20 70%, transparent 100%)`,
            animation: "waterWave 3s ease-in-out infinite",
            borderRadius: "50%",
          }} />
        )}

        {/* Icon */}
        <span style={{
          position: "relative", zIndex: 2,
          display: "flex", alignItems: "center", justifyContent: "center",
          width: "100%", height: "100%",
          fontSize: 22,
          filter: isComplete ? "none" : "none",
        }}>
          {icon}
        </span>

      </div>
    </div>
  );
}

export default function InstrumentRail({
  instruments,
  percentileLabel,
  offsetY = 0,
  mobileOffsetY = 0,
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const router = useRouter();
  const {
    dragHandlers,
    isDragging,
    offsetY: draggedOffsetY,
    targetRef,
  } = useVerticalDragPosition<HTMLDivElement>({
    storageKey: "aneurasync:instrument-rail-drag-offset-y",
  });

  // ── 初回パルス演出: 順番に光る ──
  const [introIndex, setIntroIndex] = useState(-1); // -1=未開始, 0-4=光っている, 5=完了
  const introRan = useRef(false);
  useEffect(() => {
    if (introRan.current) return;
    const seen = typeof window !== "undefined" && sessionStorage.getItem("instrument_intro_seen");
    if (seen) { setIntroIndex(instruments.length); return; }
    introRan.current = true;
    const delay = 800; // 初回表示から少し待つ
    const interval = 350; // 各アイコン間隔
    const timer = setTimeout(() => {
      for (let i = 0; i < instruments.length; i++) {
        setTimeout(() => setIntroIndex(i), i * interval);
      }
      setTimeout(() => {
        setIntroIndex(instruments.length);
        sessionStorage.setItem("instrument_intro_seen", "1");
      }, instruments.length * interval + 600);
    }, delay);
    return () => clearTimeout(timer);
  }, [instruments.length]);

  // ── ストリークドット: 今日使ったかどうか ──
  const todayUsedCount = instruments.filter((i) => i.usedToday).length;
  const allUsedToday = todayUsedCount === instruments.length;

  return (
    <div
      ref={targetRef}
      aria-label="クイックアクセス"
      role="navigation"
      data-instrument-rail="true"
      style={{
        position: "fixed",
        right: 10,
        top: "50%",
        transform: toRailTranslateY(offsetY + draggedOffsetY),
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
        padding: "22px 10px",
        borderRadius: 30,
        width: 80,
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(20px) saturate(1.3)",
        WebkitBackdropFilter: "blur(20px) saturate(1.3)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
        border: "1px solid rgba(255,255,255,0.6)",
        ["--instrument-rail-mobile-transform" as string]: toRailTranslateY(mobileOffsetY + draggedOffsetY),
      }}
    >
      {/* Drag handle — desktop only */}
      <div
        {...dragHandlers}
        aria-label="クイックアクセスを上下に移動"
        title="ドラッグして上下に移動"
        data-drag-handle="true"
        style={{
          width: 32,
          height: 18,
          marginTop: -6,
          marginBottom: -4,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: isDragging ? "grabbing" : "grab",
          touchAction: "none",
          userSelect: "none",
          background: isDragging ? "rgba(99,102,241,0.12)" : "rgba(107,112,148,0.08)",
          border: "1px solid rgba(107,112,148,0.12)",
          transition: "background 0.2s ease",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 4,
            borderRadius: 999,
            background: isDragging ? "#6366F1" : "rgba(107,112,148,0.6)",
            boxShadow: "0 6px 0 rgba(107,112,148,0.45), 0 -6px 0 rgba(107,112,148,0.45)",
          }}
        />
      </div>

      {/* Today Complete 表示 */}
      {allUsedToday && (
        <div data-today-complete="true" style={{
          fontSize: 7,
          fontWeight: 800,
          color: "#22c55e",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          textAlign: "center",
          lineHeight: 1.2,
          marginBottom: -8,
        }}>
          今日<br />完了
        </div>
      )}

      {instruments.map((item, idx) => {
        const isOpen = openKey === item.key;
        const isComplete = item.progress >= 100;
        const isIntroActive = introIndex === idx;

        return (
          <div key={item.key} style={{ position: "relative", width: 60, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            {/* 初回パルス: 一瞬強く光る */}
            {isIntroActive && (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: -24,
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${item.color}50 0%, transparent 70%)`,
                  animation: "instrumentIntroFlash 0.6s ease-out forwards",
                  pointerEvents: "none",
                  zIndex: 0,
                }}
              />
            )}

            <button
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                if (isOpen) {
                  setOpenKey(null);
                  router.push(item.href);
                } else {
                  setOpenKey(item.key);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (isOpen) {
                    setOpenKey(null);
                    router.push(item.href);
                  } else {
                    setOpenKey(item.key);
                  }
                }
              }}
              aria-label={`${item.label}${isOpen ? "へ移動" : "を開く"}`}
              aria-expanded={isOpen}
              data-instrument-item="true"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 0",
                position: "relative",
                width: 60,
                minHeight: 68,
                transform: isIntroActive ? "scale(1.15)" : "scale(1)",
                transition: "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <WaterFillIcon
                icon={item.icon}
                color={item.color}
                progress={item.progress}
                pulse={item.pulse}
                isOpen={isOpen}
                isComplete={isComplete}
              />

              {/* Label */}
              <span style={{
                display: "block",
                minHeight: 9,
                fontSize: 8,
                fontWeight: 700,
                color: isOpen ? item.color : "#6b7094",
                letterSpacing: 0.3,
                lineHeight: 1,
                whiteSpace: "nowrap",
                transition: "color 0.2s",
              }}>
                {item.label.split("—")[0].trim()}
              </span>

              {/* ストリークドット: 今日使ったら点灯 */}
              <div style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: item.usedToday ? item.color : "rgba(148,163,184,0.2)",
                boxShadow: item.usedToday ? `0 0 6px ${item.color}60` : "none",
                transition: "all 0.4s ease",
                marginTop: -1,
              }} />
            </button>

            {/* Flyout card */}
            <InstrumentFlyout
              pages={item.flyoutPages}
              isOpen={isOpen}
              onClose={() => setOpenKey(null)}
              accentColor={item.color}
              sectionName={item.label}
              sectionIcon={item.icon}
              href={item.href}
            />
          </div>
        );
      })}

      <style>{`
        @keyframes waterWave {
          0%, 100% { transform: translateX(-2px) scaleY(1); }
          50% { transform: translateX(2px) scaleY(1.3); }
        }
        @keyframes instrumentPulseStrong {
          0% { transform: scale(0.76); opacity: 0; }
          18% { opacity: 1; }
          100% { transform: scale(1.7); opacity: 0; }
        }
        @keyframes instrumentRingStrong {
          0%, 100% { transform: scale(0.94); opacity: 0.74; }
          50% { transform: scale(1.18); opacity: 1; }
        }
        @keyframes instrumentOuterRingStrong {
          0% { transform: scale(0.88); opacity: 0.52; }
          100% { transform: scale(1.34); opacity: 0; }
        }
        @keyframes instrumentPulseMedium {
          0% { transform: scale(0.88); opacity: 0; }
          24% { opacity: 0.68; }
          100% { transform: scale(1.28); opacity: 0; }
        }
        @keyframes instrumentRingMedium {
          0%, 100% { transform: scale(0.98); opacity: 0.38; }
          50% { transform: scale(1.08); opacity: 0.74; }
        }
        @keyframes instrumentOuterRingMedium {
          0% { transform: scale(0.92); opacity: 0.28; }
          100% { transform: scale(1.14); opacity: 0; }
        }
        @keyframes instrumentPulseSoft {
          0% { transform: scale(0.96); opacity: 0; }
          30% { opacity: 0.22; }
          100% { transform: scale(1.08); opacity: 0; }
        }
        @keyframes instrumentRingSoft {
          0%, 100% { transform: scale(1); opacity: 0.12; }
          50% { transform: scale(1.015); opacity: 0.26; }
        }
        @keyframes instrumentCoreStrong {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        @keyframes instrumentCoreMedium {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.025); }
        }
        @keyframes instrumentCoreSoft {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.01); }
        }
        @keyframes instrumentIntroFlash {
          0% { transform: scale(0.5); opacity: 0; }
          30% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        /* ── Mobile: horizontal scrollable strip ── */
        @media (max-width: 768px) {
          [data-instrument-rail] {
            /* Override vertical layout to horizontal — below header (52px) */
            top: auto !important;
            bottom: auto !important;
            right: 0 !important;
            left: 0 !important;
            transform: none !important;
            position: fixed !important;
            top: 52px !important;
            flex-direction: row !important;
            width: 100% !important;
            border-radius: 0 !important;
            padding: 6px 12px !important;
            gap: 4px !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            z-index: 55 !important;
            box-shadow: 0 2px 12px rgba(0,0,0,0.06) !important;
            border: none !important;
            border-bottom: 1px solid rgba(255,255,255,0.5) !important;
          }
          [data-instrument-rail]::-webkit-scrollbar {
            display: none;
          }
          /* Hide drag handle on mobile */
          [data-instrument-rail] [data-drag-handle] {
            display: none !important;
          }
          /* Today complete: inline on mobile */
          [data-instrument-rail] [data-today-complete] {
            white-space: nowrap !important;
            margin-bottom: 0 !important;
            font-size: 8px !important;
            display: flex !important;
            align-items: center !important;
            padding: 0 4px !important;
          }
          /* Instrument items: horizontal compact */
          [data-instrument-rail] [data-instrument-item="true"] {
            width: auto !important;
            min-width: 52px !important;
            min-height: auto !important;
            flex-shrink: 0 !important;
            gap: 2px !important;
          }
          [data-instrument-rail] [data-water-fill-icon="true"] {
            width: 40px !important;
            height: 40px !important;
          }
          [data-instrument-rail] [data-water-fill-icon="true"] span {
            font-size: 18px !important;
          }
        }
      `}</style>

      {/* パーセンタイル表示 (施策6: 社会的証明) */}
      {percentileLabel && (
        <div style={{
          fontSize: 9, color: "#8888a0", textAlign: "center",
          lineHeight: 1.3, marginTop: -6, paddingTop: 4,
          borderTop: "1px solid rgba(0,0,0,0.04)",
        }}>
          {percentileLabel}
        </div>
      )}
    </div>
  );
}
