"use client";

import { getCloudLayerConfig } from "@/lib/life-map/getCloudLayerConfig";

type CloudLayerProps = {
  width: number;
  height: number;
  panX: number;
  panY: number;
  zoom: number;
  timeSeconds: number;
};

export default function CloudLayer({
  width,
  height,
  panX,
  panY,
  zoom,
  timeSeconds,
}: CloudLayerProps) {
  const safeZoom = Math.max(zoom, 0.01);
  const layers = getCloudLayerConfig();

  return (
    <g style={{ pointerEvents: "none", mixBlendMode: "soft-light" }}>
      {layers.map((layer, idx) => {
        const t = timeSeconds * layer.driftSpeed + idx * 1.17;
        const driftX = Math.sin(t) * layer.driftRadius;
        const driftY = Math.cos(t * 0.8) * layer.driftRadius * 0.42;
        const parallaxX = (-panX / safeZoom) * layer.panFactorX;
        const parallaxY = (-panY / safeZoom) * layer.panFactorY;
        const baseScale = width / 1600;
        const renderW = layer.width * baseScale;
        const renderH = layer.height * baseScale;
        const x = layer.baseX * baseScale + driftX + parallaxX;
        const y = layer.baseY * baseScale + driftY + parallaxY;

        return (
          <image
            key={layer.id}
            href={layer.src}
            x={x}
            y={y}
            width={renderW}
            height={renderH}
            opacity={layer.opacity}
            preserveAspectRatio="none"
          />
        );
      })}
    </g>
  );
}

