"use client";

import { useEffect, useRef, useCallback } from "react";
import type { ImplicitSignals } from "@/lib/stargazer/implicitSignalCapture";
import { measureScrollVelocity, setupDeviceTiltCapture } from "@/lib/stargazer/implicitSignalCapture";

/**
 * Collects implicit behavioral signals from the Home page.
 * These are used by the Stargazer engine to infer personality traits
 * without explicit user input.
 *
 * Signals collected:
 * - scrollVelocity: px/ms scroll speed (impulsivity)
 * - insightDwellTimeMs: time spent viewing insight cards
 * - rereadCount: times user scrolls back up to re-read
 * - deviceTilt: phone tilt angle (relaxation state)
 */

const SIGNAL_STORAGE_KEY = "aneurasync_implicit_signals_v1";

function getJstDateKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
}

export function useImplicitSignals(scrollRef: React.RefObject<HTMLDivElement | null>) {
  const scrollEvents = useRef<{ y: number; time: number }[]>([]);
  const maxScrollY = useRef(0);
  const rereadCount = useRef(0);
  const insightVisibleStart = useRef<number | null>(null);
  const insightDwellMs = useRef(0);
  const deviceTilt = useRef<number | null>(null);

  // Track scroll events for velocity calculation
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      const y = el.scrollTop;
      const now = performance.now();

      // Record scroll event (keep last 20)
      scrollEvents.current.push({ y, time: now });
      if (scrollEvents.current.length > 20) scrollEvents.current.shift();

      // Detect re-read (scroll back up significantly)
      if (y < maxScrollY.current - 200) {
        rereadCount.current++;
      }
      maxScrollY.current = Math.max(maxScrollY.current, y);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef]);

  // Track insight card visibility via IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            insightVisibleStart.current = performance.now();
          } else if (insightVisibleStart.current) {
            insightDwellMs.current += performance.now() - insightVisibleStart.current;
            insightVisibleStart.current = null;
          }
        }
      },
      { threshold: 0.5 },
    );

    // Observe elements with data-insight attribute
    const el = scrollRef.current;
    if (el) {
      const insightElements = el.querySelectorAll("[data-insight]");
      insightElements.forEach((node) => observer.observe(node));
    }

    return () => observer.disconnect();
  }, [scrollRef]);

  // Device tilt
  useEffect(() => {
    const cleanup = setupDeviceTiltCapture((tilt) => {
      deviceTilt.current = tilt;
    });
    return () => cleanup?.();
  }, []);

  // Flush signals to localStorage on unmount / visibility change
  const flush = useCallback(() => {
    const signals: ImplicitSignals = {
      scrollVelocity: measureScrollVelocity(scrollEvents.current),
      positionBias: 0, // Requires stargazer session data — filled by Stargazer page
      sessionRhythm: 0, // Requires stargazer session data
      insightDwellTimeMs: insightDwellMs.current + (
        insightVisibleStart.current ? performance.now() - insightVisibleStart.current : 0
      ),
      rereadCount: rereadCount.current,
      deviceTilt: deviceTilt.current,
    };

    // Only persist if we have meaningful data
    const quality = [
      signals.scrollVelocity !== null ? 1 : 0,
      signals.insightDwellTimeMs > 0 ? 1 : 0,
      signals.rereadCount > 0 ? 1 : 0,
      signals.deviceTilt !== null ? 1 : 0,
    ].reduce((s, v) => s + v, 0) / 4;

    if (quality > 0) {
      try {
        localStorage.setItem(SIGNAL_STORAGE_KEY, JSON.stringify({
          date: getJstDateKey(),
          signals,
          quality,
        }));
      } catch {}
    }

    return signals;
  }, []);

  useEffect(() => {
    const onVisChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
      flush();
    };
  }, [flush]);

  return { flush };
}

/** Read stored signals (for use in buildImplicitProfile) */
export function readStoredSignals(): ImplicitSignals | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SIGNAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.date !== getJstDateKey()) return null;
    return parsed.signals;
  } catch {
    return null;
  }
}
