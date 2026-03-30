"use client";

// hooks/useFootprintTracker.ts
// パッシブ足跡収集フック — ページ訪問・滞在時間・機能利用を自動記録
//
// 収集信号:
// 1. feature_view — どのページ/機能を見たか
// 2. dwell_time — どれくらい滞在したか
// 3. session_timing — 何時にアクセスしたか
// 4. interaction_speed — 操作の速度
// 5. preference_signal — 明示的な好み信号（like/pass/skip）

import { useEffect, useRef, useCallback } from "react";
import { recordFootprint } from "@/lib/stargazer/footprintCollector";

interface UseFootprintTrackerOptions {
  /** Current feature/page identifier */
  feature: string;
  /** Whether tracking is enabled */
  enabled?: boolean;
}

/**
 * パッシブ行動追跡フック
 *
 * mount時にfeature_view + session_timingを記録
 * unmount時にdwell_timeを記録
 *
 * 返り値:
 * - trackInteraction: 操作と所要時間を記録
 * - trackPreference: like/pass/skip信号を記録
 * - trackReturn: 再訪問を記録
 */
export function useFootprintTracker({ feature, enabled = true }: UseFootprintTrackerOptions) {
  const mountedAt = useRef<number>(0);
  const featureRef = useRef(feature);

  useEffect(() => {
    featureRef.current = feature;
  }, [feature]);

  useEffect(() => {
    if (!enabled) return;
    mountedAt.current = Date.now();

    recordFootprint({
      type: "feature_view",
      value: 1,
      context: feature,
      timestamp: new Date().toISOString(),
    });

    const hour = new Date().getHours();
    recordFootprint({
      type: "session_timing",
      value: hour,
      context: feature,
      timestamp: new Date().toISOString(),
    });

    return () => {
      const dwellMs = Date.now() - mountedAt.current;
      if (dwellMs > 1000) {
        recordFootprint({
          type: "dwell_time",
          value: dwellMs,
          context: featureRef.current,
          timestamp: new Date().toISOString(),
        });
      }
    };
  }, [feature, enabled]);

  const trackInteraction = useCallback(
    (action: string, durationMs?: number) => {
      if (!enabled) return;
      recordFootprint({
        type: "interaction_speed",
        value: durationMs ?? 0,
        context: `${featureRef.current}:${action}`,
        timestamp: new Date().toISOString(),
      });
    },
    [enabled],
  );

  const trackPreference = useCallback(
    (action: "like" | "pass" | "skip", context?: string) => {
      if (!enabled) return;
      const valueMap = { like: 1, pass: -1, skip: 0 };
      recordFootprint({
        type: "preference_signal",
        value: valueMap[action],
        context: context ?? featureRef.current,
        timestamp: new Date().toISOString(),
      });
    },
    [enabled],
  );

  const trackReturn = useCallback(() => {
    if (!enabled) return;
    recordFootprint({
      type: "return_behavior",
      value: 1,
      context: featureRef.current,
      timestamp: new Date().toISOString(),
    });
  }, [enabled]);

  return { trackInteraction, trackPreference, trackReturn };
}
