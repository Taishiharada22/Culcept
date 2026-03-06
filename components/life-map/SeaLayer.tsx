"use client";

// SeaLayer.tsx — Warm paper-texture background with faint sea tint

export default function SeaLayer() {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 65% at 45% 40%, #f2eadb 0%, #ece2cc 30%, #e4d8be 55%, #ddd0b0 80%, #d4c8a0 100%)",
        }}
      />
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.25 }}>
        <filter id="paperNoise">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves={4} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#paperNoise)" />
      </svg>
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 60% 55% at 48% 42%, transparent 40%, rgba(180,200,210,0.2) 100%)",
          opacity: 0.2,
        }}
      />
    </div>
  );
}
