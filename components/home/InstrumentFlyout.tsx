"use client";

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import Link from "next/link";

export type FlyoutPage = {
  title: string;
  status?: { label: string; body: string; pulseLabel?: string };
  rows?: { icon: string; label: string; desc: string }[];
  body?: string;
  subBody?: string;
  progress?: { current: number; total: number; label: string };
  cta?: { label: string; href: string };
};

type Props = {
  pages: FlyoutPage[];
  isOpen: boolean;
  onClose: () => void;
  accentColor: string;
  sectionName: string;
  sectionIcon: string;
  href: string;
};

const AUTO_ADVANCE_MS = 3000;

export default function InstrumentFlyout({
  pages,
  isOpen,
  onClose,
  accentColor,
  sectionName,
  sectionIcon,
  href,
}: Props) {
  const [currentPage, setCurrentPage] = useState(0);
  const [translateYOffset, setTranslateYOffset] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset page when opened
  useEffect(() => {
    if (isOpen) setCurrentPage(0);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setTranslateYOffset(0);
      return;
    }

    const measure = () => {
      const node = containerRef.current;
      if (!node) return;
      const viewportMargin = 16;
      const rect = node.getBoundingClientRect();
      let nextOffset = 0;

      if (rect.top < viewportMargin) {
        nextOffset = viewportMargin - rect.top;
      } else if (rect.bottom > window.innerHeight - viewportMargin) {
        nextOffset = window.innerHeight - viewportMargin - rect.bottom;
      }

      setTranslateYOffset(nextOffset);
    };

    const raf = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [isOpen, currentPage, pages.length]);

  // Auto-advance
  useEffect(() => {
    if (!isOpen) return;
    if (currentPage >= pages.length - 1) return; // stop on last page
    timerRef.current = setTimeout(() => {
      setCurrentPage((p) => Math.min(p + 1, pages.length - 1));
    }, AUTO_ADVANCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isOpen, currentPage, pages.length]);

  // Touch swipe
  const touchStartX = useRef(0);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);
  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(dx) < 40) return;
      if (dx < 0 && currentPage < pages.length - 1) {
        setCurrentPage((p) => p + 1);
      } else if (dx > 0 && currentPage > 0) {
        setCurrentPage((p) => p - 1);
      }
    },
    [currentPage, pages.length],
  );

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid immediate close on the opening click
    const t = setTimeout(() => document.addEventListener("click", handler), 100);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handler);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const page = pages[currentPage];
  const flyoutTransform = translateYOffset === 0
    ? "translateY(-50%)"
    : `translateY(calc(-50% ${translateYOffset > 0 ? "+" : "-"} ${Math.abs(translateYOffset)}px))`;

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: "absolute",
        right: "100%",
        top: "50%",
        transform: flyoutTransform,
        marginRight: 10,
        width: 260,
        maxHeight: "min(360px, calc(100vh - 32px))",
        borderRadius: 20,
        background: "linear-gradient(145deg, rgba(255,255,255,0.96) 0%, rgba(248,248,255,0.98) 100%)",
        border: `1.5px solid ${accentColor}30`,
        boxShadow: `0 16px 48px rgba(0,0,0,0.12), 0 4px 12px ${accentColor}20`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        overflowX: "hidden",
        overflowY: "auto",
        animation: "flyoutSlideIn 200ms ease-out",
        zIndex: 100,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px 10px",
          borderBottom: `1px solid ${accentColor}15`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 16 }}>{sectionIcon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{sectionName}</span>
      </div>

      {/* Page content */}
      <div style={{ padding: "14px 16px 12px", minHeight: 180 }}>
        <div
          style={{
            fontSize: 9,
            color: accentColor,
            fontWeight: 700,
            letterSpacing: 1.5,
            fontFamily: "'JetBrains Mono','SF Mono',monospace",
            marginBottom: 10,
          }}
        >
          {page.title}
        </div>

        {page.status && (
          <div
            style={{
              marginBottom: 10,
              padding: "10px 11px",
              borderRadius: 12,
              background: `linear-gradient(135deg, ${accentColor}14 0%, rgba(255,255,255,0.96) 100%)`,
              border: `1px solid ${accentColor}22`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.7)`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: `${accentColor}22`,
                  color: accentColor,
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 0.6,
                }}
              >
                {page.status.label}
              </span>
              {page.status.pulseLabel && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 7px",
                    borderRadius: 999,
                    background: `${accentColor}12`,
                    color: "#6b7094",
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: accentColor,
                      boxShadow: `0 0 10px ${accentColor}66`,
                      animation: "statusPulse 1.8s ease-in-out infinite",
                    }}
                  />
                  PULSE {page.status.pulseLabel}
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: "#1a1a2e", lineHeight: 1.55 }}>
              {page.status.body}
            </div>
          </div>
        )}

        {/* Rows (tab list) */}
        {page.rows && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {page.rows.map((row, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 10,
                  background: `${accentColor}06`,
                  border: `1px solid ${accentColor}10`,
                }}
              >
                <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>{row.icon}</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1a2e" }}>{row.label}</div>
                  <div style={{ fontSize: 9, color: "#8888a0", marginTop: 1 }}>{row.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Body text */}
        {page.body && (
          <div style={{ fontSize: 12, color: "#1a1a2e", lineHeight: 1.7, fontWeight: 500 }}>
            {page.body}
          </div>
        )}
        {page.subBody && (
          <div style={{ fontSize: 10, color: "#8888a0", lineHeight: 1.5, marginTop: 8 }}>
            {page.subBody}
          </div>
        )}

        {/* Progress bar */}
        {page.progress && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "#8888a0" }}>{page.progress.label}</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: accentColor,
                  fontFamily: "'JetBrains Mono','SF Mono',monospace",
                }}
              >
                {page.progress.current}/{page.progress.total}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "#ecedf4", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(100, (page.progress.current / page.progress.total) * 100)}%`,
                  borderRadius: 2,
                  background: `linear-gradient(90deg, ${accentColor}, ${accentColor}aa)`,
                  transition: "width 0.8s ease",
                }}
              />
            </div>
          </div>
        )}

        {/* CTA button */}
        {page.cta && (
          <Link
            href={page.cta.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 14,
              padding: "8px 16px",
              borderRadius: 10,
              background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: `0 4px 14px ${accentColor}30`,
            }}
          >
            {page.cta.label}
            <svg
              width={12}
              height={12}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>

      {/* Dot indicators */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 6,
          padding: "8px 16px 14px",
        }}
      >
        {pages.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentPage(i)}
            aria-label={`ページ${i + 1}`}
            style={{
              width: i === currentPage ? 16 : 6,
              height: 6,
              borderRadius: 3,
              border: "none",
              cursor: "pointer",
              background: i === currentPage ? accentColor : "#e0e2ee",
              transition: "all 0.25s ease",
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes flyoutSlideIn {
          from { opacity: 0; transform: translateY(-50%) translateX(12px); }
          to { opacity: 1; transform: translateY(-50%) translateX(0); }
        }
        @keyframes statusPulse {
          0%, 100% { transform: scale(0.85); opacity: 0.65; }
          50% { transform: scale(1.2); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
