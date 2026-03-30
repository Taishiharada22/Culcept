// lib/stargazer/sensors/sensorPipeline.ts
// パッシブセンサーのフラッシュパイプライン
//
// localStorageに蓄積された行動信号を定期的に
// Stargazer観測APIへ送信し、軸スコアに反映させる。
//
// フラッシュタイミング:
// - アプリマウント時（usePassiveSensor経由）
// - 5分間隔（スケジュール済みの場合）
// - 手動呼び出し

import {
  getStoredFootprints,
  aggregateFootprints,
  footprintPatternsToAxisScores,
  type FootprintSignal,
} from "@/lib/stargazer/footprintCollector";

const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5分
const LAST_FLUSH_KEY = "culcept_sensor_last_flush_v1";
const MIN_SIGNALS_FOR_FLUSH = 5; // 最低5シグナルで送信

let flushTimerId: ReturnType<typeof setTimeout> | null = null;
let flushInFlight = false;

/**
 * フラッシュをスケジュール
 * 前回フラッシュから5分以上経過していれば即実行、
 * そうでなければ次の5分後にスケジュール
 */
export function scheduleSensorFlush(): void {
  if (typeof window === "undefined") return;

  // 既にスケジュール済みなら何もしない
  if (flushTimerId) return;

  const lastFlush = getLastFlushTime();
  const elapsed = Date.now() - lastFlush;

  if (elapsed >= FLUSH_INTERVAL_MS) {
    // 即フラッシュ
    flushSensorData();
  }

  // 次回フラッシュをスケジュール
  const delay = Math.max(FLUSH_INTERVAL_MS - elapsed, 1000);
  flushTimerId = setTimeout(() => {
    flushTimerId = null;
    flushSensorData();
    // 再スケジュール（ページがまだ開いていれば）
    scheduleSensorFlush();
  }, delay);
}

/**
 * 蓄積信号をStargazerへ送信
 */
export async function flushSensorData(): Promise<void> {
  if (typeof window === "undefined") return;
  if (flushInFlight) return;

  const signals = getStoredFootprints();
  if (signals.length < MIN_SIGNALS_FOR_FLUSH) return;

  // 集計
  const patterns = aggregateFootprints(signals, 7); // 直近7日で集計
  if (patterns.length === 0) return;

  // 軸スコアに変換
  const axisScores = footprintPatternsToAxisScores(patterns);
  if (axisScores.length === 0) return;

  flushInFlight = true;
  try {
    const response = await fetch("/api/stargazer/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "passive_sensor",
        source: "footprint",
        axisDeltas: axisScores.map((s) => ({
          axisId: s.axisId,
          delta: s.score * s.weight,
          source: "passive_sensor",
          confidence: s.weight,
        })),
        metadata: {
          signalCount: signals.length,
          patternCount: patterns.length,
          flushTimestamp: new Date().toISOString(),
        },
      }),
    });

    if (response.ok) {
      setLastFlushTime(Date.now());
      console.log(
        `[SensorPipeline] Flushed ${signals.length} signals → ${axisScores.length} axis updates`,
      );
    }
  } catch (error) {
    console.warn("[SensorPipeline] Flush failed:", error);
  } finally {
    flushInFlight = false;
  }
}

function getLastFlushTime(): number {
  try {
    const raw = localStorage.getItem(LAST_FLUSH_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

function setLastFlushTime(ts: number): void {
  try {
    localStorage.setItem(LAST_FLUSH_KEY, String(ts));
  } catch {
    /* ignore */
  }
}
