"use client";

/**
 * ChatSkeleton — glassmorphism-styled skeleton for chat loading state.
 * Matches RendezvousChatView layout: header, message bubbles, input bar.
 */

export default function ChatSkeleton() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #F8F7FF 0%, #EEF0FF 50%, #FFF8F6 100%)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Noto Sans JP',-apple-system,sans-serif",
      }}
    >
      {/* Skeleton Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(248,247,255,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(99,102,241,0.08)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(30,30,60,0.06)" }} />
        <div style={{ flex: 1 }}>
          <div
            className="animate-pulse"
            style={{ width: 100, height: 14, borderRadius: 6, background: "rgba(30,30,60,0.08)" }}
          />
          <div
            className="animate-pulse"
            style={{ width: 60, height: 10, borderRadius: 4, background: "rgba(30,30,60,0.04)", marginTop: 4 }}
          />
        </div>
      </div>

      {/* Skeleton Messages */}
      <div style={{ flex: 1, padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Left bubble */}
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <div
            className="animate-pulse"
            style={{
              width: "65%",
              maxWidth: 260,
              height: 48,
              borderRadius: "14px 14px 14px 4px",
              background: "rgba(30,30,60,0.05)",
            }}
          />
        </div>

        {/* Right bubble */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div
            className="animate-pulse"
            style={{
              width: "55%",
              maxWidth: 220,
              height: 40,
              borderRadius: "14px 14px 4px 14px",
              background: "rgba(99,102,241,0.08)",
            }}
          />
        </div>

        {/* Left bubble (longer) */}
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <div
            className="animate-pulse"
            style={{
              width: "75%",
              maxWidth: 300,
              height: 64,
              borderRadius: "14px 14px 14px 4px",
              background: "rgba(30,30,60,0.05)",
            }}
          />
        </div>

        {/* Right bubble (short) */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div
            className="animate-pulse"
            style={{
              width: "35%",
              maxWidth: 140,
              height: 36,
              borderRadius: "14px 14px 4px 14px",
              background: "rgba(99,102,241,0.08)",
            }}
          />
        </div>

        {/* Left bubble */}
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <div
            className="animate-pulse"
            style={{
              width: "50%",
              maxWidth: 200,
              height: 44,
              borderRadius: "14px 14px 14px 4px",
              background: "rgba(30,30,60,0.05)",
            }}
          />
        </div>

        {/* Right bubble */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div
            className="animate-pulse"
            style={{
              width: "60%",
              maxWidth: 240,
              height: 52,
              borderRadius: "14px 14px 4px 14px",
              background: "rgba(99,102,241,0.08)",
            }}
          />
        </div>
      </div>

      {/* Skeleton Input Bar */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid rgba(30,30,60,0.06)",
          background: "rgba(248,247,255,0.95)",
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <div
          className="animate-pulse"
          style={{
            flex: 1,
            height: 40,
            borderRadius: 20,
            background: "rgba(30,30,60,0.05)",
          }}
        />
        <div
          className="animate-pulse"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            background: "rgba(99,102,241,0.1)",
          }}
        />
      </div>
    </div>
  );
}
