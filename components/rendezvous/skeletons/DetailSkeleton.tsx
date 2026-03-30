"use client";

/**
 * DetailSkeleton — glassmorphism-styled skeleton for candidate detail loading.
 * Matches RendezvousDetailClient layout: hero, reasons, action buttons.
 */

export default function DetailSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: "24px 20px",
      }}
    >
      {/* Hero: avatar circle + sync ring */}
      <div style={{ position: "relative", width: 120, height: 120 }}>
        <div
          className="animate-pulse"
          style={{
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))",
          }}
        />
        {/* Sync ring pulse */}
        <div
          className="animate-pulse"
          style={{
            position: "absolute",
            inset: -6,
            borderRadius: "50%",
            border: "3px solid rgba(99,102,241,0.12)",
          }}
        />
      </div>

      {/* Name bar */}
      <div
        className="animate-pulse"
        style={{ width: 140, height: 18, borderRadius: 8, background: "rgba(30,30,60,0.08)" }}
      />

      {/* Label badges */}
      <div style={{ display: "flex", gap: 8 }}>
        <div
          className="animate-pulse"
          style={{ width: 60, height: 22, borderRadius: 11, background: "rgba(99,102,241,0.06)" }}
        />
        <div
          className="animate-pulse"
          style={{ width: 80, height: 22, borderRadius: 11, background: "rgba(236,72,153,0.06)" }}
        />
      </div>

      {/* Reasons section */}
      <div style={{ width: "100%", marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{
              height: 56,
              borderRadius: 14,
              background: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(30,30,60,0.04)",
            }}
          />
        ))}
      </div>

      {/* Action buttons bar */}
      <div style={{ display: "flex", gap: 8, width: "100%", marginTop: 12 }}>
        <div
          className="animate-pulse"
          style={{
            flex: 1,
            height: 44,
            borderRadius: 10,
            background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))",
          }}
        />
        <div
          className="animate-pulse"
          style={{
            flex: 0.6,
            height: 44,
            borderRadius: 10,
            background: "rgba(30,30,60,0.05)",
          }}
        />
      </div>
    </div>
  );
}
