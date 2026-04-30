/**
 * L2.2 Time Solver — Comprehension-First v1.3+ Wave 1
 *
 * 設計書: docs/alter-morning-comprehension-first-v1.3plus.md §3.2
 *
 * 責務:
 *   - Event[] を受け取り、startTime / timeHint / order から時刻整合した
 *     TimeLine を純関数的に構築する
 *   - LLM を呼ばない（Bug 2 で露呈した「LLM が時刻整合を壊す」問題の恒久対処）
 *
 * 入力:
 *   Event[] （place_ref 段階で可。実 place 解決は不要）
 *
 * 出力:
 *   TimeLine{ entries: [{event_id, startTime, endTime, transport_duration}] }
 *
 * アルゴリズム:
 *   1. 各 event の startTime anchor を決定
 *      - 明示 startTime があればそれを使用
 *      - なければ timeHint から anchor（morning=09:00, noon=12:00, afternoon=15:00, evening=19:00）
 *      - どちらもなければ null（未確定）
 *   2. order 昇順でソート
 *   3. 前 event の endTime と次 event の startTime の整合チェック
 *      - transport_duration がデフォルト 15 分、overlap があれば violation 記録
 *
 * 境界時刻マッピング（bug1Bug2Triage.test と整合）:
 *   - morning: hh < 11  → anchor 09:00
 *   - noon:    11 ≤ hh < 14 → anchor 12:00
 *   - afternoon: 14 ≤ hh < 17 → anchor 15:00
 *   - evening: 17 ≤ hh     → anchor 19:00
 */

import type { Event, TimeHintValue } from "../comprehension/eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TimeLineEntry {
  event_id: string;
  /** "HH:mm" or null（未確定） */
  startTime: string | null;
  /** "HH:mm" or null（duration 推定で確定） */
  endTime: string | null;
  /** 前 entry からの移動時間（分）。先頭は 0 */
  transport_duration_min: number;
  /** 時刻整合性違反（前 event と重複する等） */
  violation: TimeViolation | null;
}

export type TimeViolation =
  | "overlap_with_previous"        // 前 event の endTime より前に始まる
  | "transport_window_too_short"   // 前 event 終了 → 当 event 開始の gap が transport 所要より短い
  | "non_monotonic_startTime"      // order と startTime が逆順
  | "undetermined_startTime";      // startTime も timeHint もなく anchor 決定不能

export interface TimeLine {
  entries: TimeLineEntry[];
  /** 全 entry の violation をまとめたもの */
  violations: Array<{ event_id: string; violation: TimeViolation }>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// timeHint → anchor
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TIME_HINT_ANCHOR: Record<TimeHintValue, string> = {
  morning: "09:00",
  noon: "12:00",
  afternoon: "15:00",
  evening: "19:00",
};

/**
 * "HH:mm" を分単位に変換。不正形式は null。
 */
export function parseHHmm(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/**
 * 分 → "HH:mm"。負値・1440 以上は clamp せず null（呼び出し側でハンドル）。
 */
export function formatHHmm(minutes: number | null): string | null {
  if (minutes == null) return null;
  if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 24 * 60) return null;
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * startTime を anchor 解決する。
 *
 * - 明示 startTime (HH:mm) → そのまま
 * - timeHint のみ → 対応 anchor
 * - どちらもない → null
 */
export function resolveStartTimeAnchor(ev: Event): string | null {
  if (ev.when.startTime) {
    const m = parseHHmm(ev.when.startTime);
    if (m != null) return ev.when.startTime;
  }
  if (ev.when.timeHint) {
    return TIME_HINT_ANCHOR[ev.when.timeHint];
  }
  return null;
}

/**
 * startTime から timeHint を逆引き（bug1Bug2Triage 互換の境界時刻）。
 *
 * - hh < 11          → morning
 * - 11 ≤ hh < 14    → noon
 * - 14 ≤ hh < 17    → afternoon
 * - 17 ≤ hh         → evening
 */
export function deriveTimeHintFromStartTime(
  startTime: string | null,
): TimeHintValue | null {
  const m = parseHHmm(startTime);
  if (m == null) return null;
  const hh = Math.floor(m / 60);
  if (hh < 11) return "morning";
  if (hh < 14) return "noon";
  if (hh < 17) return "afternoon";
  return "evening";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Duration 推定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_DURATION_MIN = 60;

/**
 * event の duration を推定する。
 * 現状は 60 分固定（Wave 1 スコープ）。
 * Wave 2 以降で activityCanonical → duration 推定辞書を接続。
 */
export function estimateDurationMin(_ev: Event): number {
  return DEFAULT_DURATION_MIN;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Transport duration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_TRANSPORT_MIN = 15;

export function estimateTransportMin(
  _prev: Event | null,
  _next: Event,
): number {
  // Wave 1: 定数 15 分。Wave 2 以降で travelTimeEngine と接続
  return DEFAULT_TRANSPORT_MIN;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Time Solver 本体
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Event[] を受け取り TimeLine を構築する。
 *
 * 純関数。副作用なし。LLM 呼び出しなし。
 *
 * @param events  L1 Comprehension 層から受け取った events（既に provenance 検査済み）
 */
export function solveTimeLine(events: Event[]): TimeLine {
  // order 昇順で並べる（安定ソート）
  const ordered = [...events].sort((a, b) => {
    // event_id の末尾数字順 fallback
    const aid = Number(a.event_id.replace(/^event_/, "")) || 0;
    const bid = Number(b.event_id.replace(/^event_/, "")) || 0;
    return aid - bid;
  });

  const entries: TimeLineEntry[] = [];
  const violations: TimeLine["violations"] = [];

  let prevEndMin: number | null = null;
  let prevStartMin: number | null = null;
  let prevEvent: Event | null = null;

  for (const ev of ordered) {
    const startAnchor = resolveStartTimeAnchor(ev);
    const startMin = parseHHmm(startAnchor);

    // violation 検査
    let violation: TimeViolation | null = null;

    if (startMin == null) {
      violation = "undetermined_startTime";
      entries.push({
        event_id: ev.event_id,
        startTime: null,
        endTime: null,
        transport_duration_min: 0,
        violation,
      });
      violations.push({ event_id: ev.event_id, violation });
      continue;
    }

    const transportMin = prevEvent ? estimateTransportMin(prevEvent, ev) : 0;
    const durationMin = estimateDurationMin(ev);
    const endMin = startMin + durationMin;

    // 前 event との整合チェック
    if (prevEndMin != null && startMin < prevEndMin) {
      violation = "overlap_with_previous";
    } else if (prevEndMin != null && startMin - prevEndMin < transportMin) {
      violation = "transport_window_too_short";
    } else if (prevStartMin != null && startMin < prevStartMin) {
      violation = "non_monotonic_startTime";
    }

    entries.push({
      event_id: ev.event_id,
      startTime: startAnchor,
      endTime: formatHHmm(endMin),
      transport_duration_min: transportMin,
      violation,
    });

    if (violation) {
      violations.push({ event_id: ev.event_id, violation });
    }

    prevEndMin = endMin;
    prevStartMin = startMin;
    prevEvent = ev;
  }

  return { entries, violations };
}

/**
 * event_id で TimeLineEntry を引く。
 */
export function findEntry(
  timeline: TimeLine,
  event_id: string,
): TimeLineEntry | null {
  return timeline.entries.find((e) => e.event_id === event_id) ?? null;
}
