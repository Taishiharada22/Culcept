"use client";

import React, { useRef, useState, useCallback } from "react";

type Props = {
  basePath: string;
  frameCount: number;
  width?: number;
  height?: number;
  sensitivity?: number;
  reverse?: boolean;
  mirror?: boolean;
  alt?: string;
  className?: string;
};

export default function Turntable360({
  basePath,
  frameCount,
  width = 400,
  height = 700,
  sensitivity = 5,
  reverse = false,
  mirror = false,
  alt = "360 view",
  className,
}: Props) {
  const [frame, setFrame] = useState(0);
  const lastX = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      lastX.current = e.clientX;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!e.buttons) return;
      const dx = e.clientX - lastX.current;
      if (Math.abs(dx) >= sensitivity) {
        const dir = reverse ? -1 : 1;
        setFrame((prev) => (prev + (dx > 0 ? dir : -dir) + frameCount) % frameCount);
        lastX.current = e.clientX;
      }
    },
    [frameCount, sensitivity, reverse]
  );

  const padded = String(frame).padStart(4, "0");
  const src = `${basePath}/frame_${padded}.png`;

  return (
    <div
      style={{
        width,
        height,
        userSelect: "none",
        touchAction: "none",
        transform: mirror ? "scaleX(-1)" : undefined,
      }}
      className={className}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </div>
  );
}
