"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { C, mono } from "./constants";

type HomeHeaderProps = {
  scrollAlpha: number;
  onScrollTop: () => void;
};

/**
 * Light-mode header that matches the warm lavender-grey content area.
 * On scroll: frosted glass background with subtle border.
 */
export default function HomeHeader({ scrollAlpha: ha, onScrollTop }: HomeHeaderProps) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications/unread-count")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setUnreadCount(d.count ?? 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: ha > 0 ? `rgba(248,246,243,${Math.min(ha * 0.95, 0.92)})` : "transparent",
        backdropFilter: ha > 0.1 ? `blur(${Math.round(ha * 20)}px) saturate(1.2)` : "none",
        WebkitBackdropFilter: ha > 0.1 ? `blur(${Math.round(ha * 20)}px) saturate(1.2)` : "none",
        borderBottom: ha > 0.3 ? `1px solid rgba(0,0,0,${ha * 0.06})` : "1px solid transparent",
        transition: "all 0.3s",
      }}
    >
      <button
        onClick={onScrollTop}
        aria-label="トップへ戻る"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "none", border: "none", cursor: "pointer",
          padding: 0, color: C.t1,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: `linear-gradient(135deg, #6366F1, #8B5CF6)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 900,
            color: "#fff",
            fontFamily: mono,
            boxShadow: "0 2px 8px rgba(99,102,241,0.25)",
            transition: "box-shadow 0.3s, transform 0.3s",
          }}
        >
          An
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.5, color: C.t1 }}>Aneurasync</span>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link
          href="/my-page/notifications"
          aria-label="通知"
          style={{
            position: "relative",
            width: 32,
            height: 32,
            borderRadius: 10,
            background: "rgba(0,0,0,0.03)",
            border: "1px solid rgba(0,0,0,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            textDecoration: "none",
            transition: "background 0.2s",
          }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 && (
            <div style={{
              position: "absolute", top: -2, right: -2,
              width: 8, height: 8, borderRadius: "50%",
              background: C.rv,
              border: "1.5px solid #f8f6f3",
              boxShadow: `0 0 6px ${C.rv}50`,
            }} />
          )}
        </Link>
        <Link
          href="/my-page"
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: "rgba(0,0,0,0.03)",
            border: "1px solid rgba(0,0,0,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: 13,
            textDecoration: "none",
            transition: "background 0.2s",
          }}
        >
          👤
        </Link>
      </div>
    </header>
  );
}
