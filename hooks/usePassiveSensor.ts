// hooks/usePassiveSensor.ts
// パッシブセンサーフック: 各ページに1行追加でユーザー行動を自動収集
//
// 使い方:
//   const sensor = usePassiveSensor("drops");
//   sensor.trackInteraction("detail_view", { itemId: "123" });
//   sensor.trackDecision("like", 1200);

"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  recordFootprint,
  type FootprintSignal,
  type FootprintSignalType,
} from "@/lib/stargazer/footprintCollector";
import { scheduleSensorFlush } from "@/lib/stargazer/sensors/sensorPipeline";

/** 対応する機能名 */
export type SensorFeature =
  | "calendar"
  | "drops"
  | "battle"
  | "rendezvous"
  | "body_color"
  | "stargazer"
  | "origin"
  | "my_style";

interface PassiveSensorResult {
  /** インタラクション記録（ボタン押下、スワイプ等） */
  trackInteraction: (type: string, data?: Record<string, unknown>) => void;
  /** 判断記録（Like/Pass/投票等、判断にかかった時間付き） */
  trackDecision: (choice: string, timeMs: number) => void;
  /** 滞在時間記録（特定要素の閲覧時間） */
  trackDwell: (elementId: string, durationMs: number) => void;
}

/**
 * パッシブセンサーフック
 *
 * マウント時に自動で feature_view を記録し、
 * アンマウント時にページ滞在時間を session_duration として記録する。
 * 返すオブジェクトで手動記録も可能。
 */
export function usePassiveSensor(feature: SensorFeature): PassiveSensorResult {
  const mountTime = useRef<number>(0);
  const interactionCount = useRef(0);

  // マウント時: feature_view 記録 + フラッシュスケジュール
  useEffect(() => {
    mountTime.current = Date.now();

    const signal: FootprintSignal = {
      type: "feature_view",
      value: 1,
      context: feature,
      timestamp: new Date().toISOString(),
    };
    recordFootprint(signal);

    // セッション時間帯も記録
    const hour = new Date().getHours();
    recordFootprint({
      type: "session_timing",
      value: hour,
      context: feature,
      timestamp: new Date().toISOString(),
    });

    // フラッシュをスケジュール
    scheduleSensorFlush();

    // アンマウント時: 滞在時間記録
    return () => {
      const elapsed = Date.now() - mountTime.current;
      if (elapsed > 1000) { // 1秒未満は誤操作として無視
        recordFootprint({
          type: "session_duration",
          value: Math.round(elapsed / 1000), // 秒に変換
          context: feature,
          timestamp: new Date().toISOString(),
        });
      }

      // 閲覧深度（インタラクション数）
      if (interactionCount.current > 0) {
        recordFootprint({
          type: "browse_depth",
          value: interactionCount.current,
          context: feature,
          timestamp: new Date().toISOString(),
        });
      }
    };
  }, [feature]);

  const trackInteraction = useCallback(
    (type: string, data?: Record<string, unknown>) => {
      interactionCount.current += 1;
      const signal: FootprintSignal = {
        type: "browse_depth",
        value: interactionCount.current,
        context: `${feature}:${type}${data ? `:${JSON.stringify(data)}` : ""}`.slice(0, 200),
        timestamp: new Date().toISOString(),
      };
      recordFootprint(signal);
    },
    [feature],
  );

  const trackDecision = useCallback(
    (choice: string, timeMs: number) => {
      interactionCount.current += 1;

      // 判断速度
      recordFootprint({
        type: "interaction_speed",
        value: timeMs,
        context: `${feature}:${choice}`,
        timestamp: new Date().toISOString(),
      });

      // 好み信号
      const prefValue = choice === "like" || choice === "right" ? 1
        : choice === "pass" || choice === "left" || choice === "skip" ? -1
        : 0;
      recordFootprint({
        type: "preference_signal",
        value: prefValue,
        context: `${feature}:${choice}`,
        timestamp: new Date().toISOString(),
      });
    },
    [feature],
  );

  const trackDwell = useCallback(
    (elementId: string, durationMs: number) => {
      if (durationMs < 500) return; // 0.5秒未満は無視
      recordFootprint({
        type: "dwell_time",
        value: durationMs,
        context: `${feature}:${elementId}`,
        timestamp: new Date().toISOString(),
      });
    },
    [feature],
  );

  return { trackInteraction, trackDecision, trackDwell };
}
