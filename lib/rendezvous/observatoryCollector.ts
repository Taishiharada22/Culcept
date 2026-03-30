"use client";

/**
 * Observatory Collector - クライアントサイド行動イベント収集
 *
 * シングルトンパターンでイベントをバッファリングし、
 * 定期的にサーバーへ一括送信する。
 */

import { useCallback, useEffect, useRef } from "react";
import type { BehaviorEventType, ObservableEvent } from "./implicitObservatory";

// ============================================================
// Collector Class (Singleton)
// ============================================================

export class ObservatoryCollector {
  private static instance: ObservatoryCollector | null = null;

  private buffer: ObservableEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;

  /** Maximum events to buffer before forcing a flush */
  private readonly maxBufferSize = 100;

  private constructor() {}

  static getInstance(): ObservatoryCollector {
    if (!ObservatoryCollector.instance) {
      ObservatoryCollector.instance = new ObservatoryCollector();
    }
    return ObservatoryCollector.instance;
  }

  /**
   * Track a behavioral event. The event is buffered locally
   * and will be sent to the server on the next flush cycle.
   */
  track(type: BehaviorEventType, metadata: Record<string, unknown> = {}): void {
    const event: ObservableEvent = {
      type,
      metadata,
      timestamp: new Date().toISOString(),
    };
    this.buffer.push(event);

    // Force flush if buffer is full
    if (this.buffer.length >= this.maxBufferSize) {
      void this.flush();
    }
  }

  /**
   * Send all buffered events to the server.
   * Returns silently on failure (fire-and-forget semantics for passive tracking).
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) return;

    this.isFlushing = true;
    const eventsToSend = [...this.buffer];
    this.buffer = [];

    try {
      const res = await fetch("/api/rendezvous/observatory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: eventsToSend }),
      });

      if (!res.ok) {
        // Put events back in the buffer for retry on next flush
        this.buffer.unshift(...eventsToSend);
        // Trim to avoid unbounded growth on persistent failures
        if (this.buffer.length > this.maxBufferSize * 2) {
          this.buffer = this.buffer.slice(-this.maxBufferSize);
        }
      }
    } catch {
      // Network error - re-queue events
      this.buffer.unshift(...eventsToSend);
      if (this.buffer.length > this.maxBufferSize * 2) {
        this.buffer = this.buffer.slice(-this.maxBufferSize);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Start automatic periodic flushing.
   * @param intervalMs Flush interval in ms (default: 60000 = 1 minute)
   */
  startAutoFlush(intervalMs: number = 60_000): void {
    this.stopAutoFlush();
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, intervalMs);
  }

  /** Stop automatic periodic flushing. */
  stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Current number of buffered events (for testing / debugging). */
  get pendingCount(): number {
    return this.buffer.length;
  }
}

// ============================================================
// React Hook
// ============================================================

/**
 * React hook for tracking behavioral events.
 * Automatically starts/stops auto-flush with the component lifecycle.
 *
 * Usage:
 * ```tsx
 * const { track } = useObservatory();
 * track("profile_view_duration", { duration_seconds: 42 });
 * ```
 */
export function useObservatory(): {
  track: (type: BehaviorEventType, metadata?: Record<string, unknown>) => void;
} {
  const collectorRef = useRef<ObservatoryCollector | null>(null);

  useEffect(() => {
    const collector = ObservatoryCollector.getInstance();
    collectorRef.current = collector;
    collector.startAutoFlush();

    // Flush on page unload (best-effort)
    const handleBeforeUnload = () => {
      void collector.flush();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      collector.stopAutoFlush();
      // Final flush on unmount
      void collector.flush();
    };
  }, []);

  const track = useCallback(
    (type: BehaviorEventType, metadata: Record<string, unknown> = {}) => {
      collectorRef.current?.track(type, metadata);
    },
    [],
  );

  return { track };
}
