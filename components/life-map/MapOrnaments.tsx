"use client";

import { useCallback } from "react";

// MapOrnaments.tsx — Compass rose, N indicator, corner ornaments, theme counter

interface MapOrnamentsProps {
  onToggleNorth?: () => void;
  showFrameCorner?: boolean;
  themeCountLabel?: string;
}

export default function MapOrnaments({ onToggleNorth, showFrameCorner = false, themeCountLabel }: MapOrnamentsProps) {
  const handleNorth = useCallback(() => { onToggleNorth?.(); }, [onToggleNorth]);

  return (
    <>
      <div className="absolute flex flex-col items-center" style={{ left: 18, bottom: 18, zIndex: 40 }}>
        <svg width={56} height={56} viewBox="0 0 56 56">
          <circle cx={28} cy={28} r={26} fill="none" stroke="#a89870" strokeWidth={1.5} opacity={0.6} />
          {Array.from({ length: 16 }).map((_, i) => {
            const angle = (i * 360) / 16 - 90;
            const rad = (angle * Math.PI) / 180;
            const major = i % 4 === 0;
            const r1 = major ? 18 : 21;
            return (
              <line key={i} x1={28 + r1 * Math.cos(rad)} y1={28 + r1 * Math.sin(rad)} x2={28 + 26 * Math.cos(rad)} y2={28 + 26 * Math.sin(rad)} stroke="#a89870" strokeWidth={major ? 2 : 1} opacity={major ? 0.8 : 0.4} />
            );
          })}
          <polygon points="28,6 31,28 28,24 25,28" fill="#a89870" opacity={0.7} />
          <polygon points="28,50 25,28 28,32 31,28" fill="#c8b888" opacity={0.4} />
        </svg>
        <button onClick={handleNorth} className="mt-1 text-xs font-bold tracking-wider" style={{ color: "#6a5a3a", opacity: 0.7 }}>N</button>
      </div>
      {showFrameCorner && (
        <>
          {[{ top: 8, left: 8 }, { top: 8, right: 8 }, { bottom: 8, left: 8 }, { bottom: 8, right: 8 }].map((pos, i) => (
            <div key={i} className="absolute" style={{ ...pos, width: 28, height: 28, borderColor: "rgba(168,152,112,0.3)", borderTopWidth: pos.top !== undefined ? 2 : 0, borderBottomWidth: pos.bottom !== undefined ? 2 : 0, borderLeftWidth: pos.left !== undefined ? 2 : 0, borderRightWidth: pos.right !== undefined ? 2 : 0, zIndex: 40 }} />
          ))}
        </>
      )}
      {themeCountLabel && (
        <div className="absolute text-xs font-medium" style={{ top: 14, right: 14, color: "#8a7a5a", opacity: 0.7, zIndex: 40 }}>{themeCountLabel}</div>
      )}
    </>
  );
}
