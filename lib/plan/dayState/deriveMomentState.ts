/**
 * deriveMomentState — 開いた瞬間の状態を 1 分精度で導出する pure 関数（保存しない・push しない）
 *
 * 正本: docs/day-state-alter-tab-v0-design.md §2.1（v0.2 で 14 フィールド凍結。勝手な増減禁止）
 * 規律:
 *  - now は必ず引数注入（Date.now() 直呼び禁止）。
 *  - receptivity-gate.ts / authority-escalation.ts を import しない（値域は inline 定義が正本）。
 *  - timePressure / interruptibility / receptivity / interventionWindow の v0 消費者は表示選択のみ。
 *    proactive 配信判定への使用は B2/R6 gate 後。
 *  - departureDeadline: resolved 移動 segment が無ければ null（分数の捏造禁止）。
 *  - 比較は全て主観分（05:00 起点）で行い、late_night（23:00-05:00）跨ぎを正しく扱う。
 */

import type { DaySegmentLite, MomentStateV0 } from "./dayStateTypes";
import { isNightCheckBucket, toSubjectiveMin, toTimeBucket } from "./timeOfDay";

// ── 閾値（named constant・画面非表示・fixture 検証対象） ──
export const TIME_PRESSURE_HIGH_MIN = 15;
export const TIME_PRESSURE_MEDIUM_MIN = 45;
export const PRE_EVENT_WINDOW_MIN = 30;
export const POST_EVENT_WINDOW_MIN = 20;
// 次 fixed event に「接続する」travel と見なす窓（travel 終端が開始のこの分数以内）
export const DEPARTURE_TRAVEL_ATTACH_WINDOW_MIN = 90;

export interface MomentStateInput {
  nowHHMM: string;
  segments: DaySegmentLite[]; // DayGraph からの lite 写像（Stage 0 は fixture 供給）
}

interface SubjectiveSegment {
  seg: DaySegmentLite;
  start: number; // 主観分
  end: number;
}

function toSubjective(segments: DaySegmentLite[]): SubjectiveSegment[] {
  const out: SubjectiveSegment[] = [];
  for (const seg of segments) {
    const start = toSubjectiveMin(seg.startHHMM);
    if (start === null) continue;
    // durationMin を正とし、終端は開始 + 長さ（主観日内に clamp）
    const end = Math.min(start + seg.durationMin, 1440);
    out.push({ seg, start, end });
  }
  return out.sort((a, b) => a.start - b.start);
}

function isFixedEvent(seg: DaySegmentLite): boolean {
  return seg.kind === "event" && (seg.latencyTolerance === "strict" || seg.latencyTolerance === "tight");
}

export function deriveMomentState(input: MomentStateInput): MomentStateV0 {
  const bucket = toTimeBucket(input.nowHHMM);
  const now = toSubjectiveMin(input.nowHHMM);

  if (bucket === null || now === null) {
    // parse 不能: 全 unknown（偽の状態を作らない）
    return {
      nowHHMM: input.nowHHMM,
      timeBucket: "late_night",
      nowSegment: null,
      nextFixedEventAt: null,
      minutesUntilNextFixedEvent: null,
      departureDeadlineHHMM: null,
      minutesUntilDeparture: null,
      eveningSlackRemainingMin: null,
      timePressure: "unknown",
      currentMode: "unknown",
      interruptibility: "unknown",
      receptivity: "unknown",
      interventionWindow: "unknown",
      isNightCheckWindow: false,
    };
  }

  const subs = toSubjective(input.segments);

  // nowSegment: 今いる位置
  const current = subs.find((s) => s.start <= now && now < s.end) ?? null;
  const nowSegment = current
    ? { kind: current.seg.kind, startHHMM: current.seg.startHHMM, endHHMM: current.seg.endHHMM }
    : null;

  // 次の fixed event（latencyTolerance ∈ {strict, tight}）
  const nextFixed = subs.find((s) => isFixedEvent(s.seg) && s.start > now) ?? null;
  const nextFixedEventAt = nextFixed ? nextFixed.seg.startHHMM : null;
  const minutesUntilNextFixedEvent = nextFixed ? nextFixed.start - now : null;

  // 出発期限 = 次 fixed event の直前 travel segment（resolved のみ存在しうる）
  let departureDeadlineHHMM: string | null = null;
  let minutesUntilDeparture: number | null = null;
  if (nextFixed) {
    // 直前 travel = nextFixed の開始に接続する travel（終端が開始の 90 分以内に届くもののうち最後）。
    // resolved travel segment が無い日は null のまま（分数の捏造禁止）。
    const candidates = subs.filter(
      (s) =>
        s.seg.kind === "travel" &&
        s.end <= nextFixed.start &&
        s.end > nextFixed.start - DEPARTURE_TRAVEL_ATTACH_WINDOW_MIN,
    );
    const chosen = candidates.length > 0 ? candidates[candidates.length - 1] : null;
    if (chosen) {
      departureDeadlineHHMM = chosen.seg.startHHMM;
      minutesUntilDeparture = chosen.start - now;
    }
  }

  // 夜の余白の残り（now 以降の evening/night gap の残存分）
  const eveningGaps = subs.filter(
    (s) => s.seg.kind === "gap" && (s.seg.timeBucket === "evening" || s.seg.timeBucket === "night"),
  );
  const eveningSlackRemainingMin = eveningGaps.reduce((sum, s) => sum + Math.max(0, s.end - Math.max(s.start, now)), 0);

  // timePressure（出発期限優先。fixed event なし → low）
  const pressureBasis = minutesUntilDeparture ?? minutesUntilNextFixedEvent;
  const timePressure: MomentStateV0["timePressure"] =
    pressureBasis === null
      ? "low"
      : pressureBasis <= TIME_PRESSURE_HIGH_MIN
        ? "high"
        : pressureBasis <= TIME_PRESSURE_MEDIUM_MIN
          ? "medium"
          : "low";

  // currentMode
  let currentMode: MomentStateV0["currentMode"] = "open";
  const justEnded = subs.find((s) => s.seg.kind === "event" && s.end <= now && now - s.end <= POST_EVENT_WINDOW_MIN);
  if (current?.seg.kind === "event") {
    currentMode = "in_event";
  } else if (
    nextFixed &&
    ((minutesUntilDeparture !== null && minutesUntilDeparture <= 0) ||
      (minutesUntilNextFixedEvent !== null && minutesUntilNextFixedEvent <= PRE_EVENT_WINDOW_MIN))
  ) {
    currentMode = "pre_event";
  } else if (justEnded) {
    currentMode = "post_event";
  } else if (
    current?.seg.kind === "gap" &&
    (bucket === "evening" || bucket === "night") &&
    eveningSlackRemainingMin > 0
  ) {
    currentMode = "evening_recovery";
  }

  // interruptibility（currentMode × timePressure の純関数）
  const interruptibility: MomentStateV0["interruptibility"] =
    currentMode === "in_event"
      ? "low"
      : currentMode === "pre_event"
        ? timePressure === "high"
          ? "low"
          : "medium"
        : currentMode === "post_event"
          ? "medium"
          : "high";

  // receptivity = moment が許す配信上限（DeliveryMode 同語彙の部分集合。push 系は B2/R6 まで除外）
  const receptivity: MomentStateV0["receptivity"] = interruptibility === "low" ? "silent" : "on_open";

  // interventionWindow
  let interventionWindow: MomentStateV0["interventionWindow"] = "open";
  if (minutesUntilDeparture !== null) {
    interventionWindow =
      minutesUntilDeparture <= 0
        ? "closed"
        : minutesUntilDeparture <= TIME_PRESSURE_HIGH_MIN
          ? "closing"
          : minutesUntilDeparture <= TIME_PRESSURE_MEDIUM_MIN
            ? "narrowing"
            : "open";
  } else if (minutesUntilNextFixedEvent !== null) {
    interventionWindow =
      minutesUntilNextFixedEvent <= 0
        ? "closed"
        : minutesUntilNextFixedEvent <= TIME_PRESSURE_HIGH_MIN
          ? "closing"
          : minutesUntilNextFixedEvent <= TIME_PRESSURE_MEDIUM_MIN
            ? "narrowing"
            : "open";
  }

  return {
    nowHHMM: input.nowHHMM,
    timeBucket: bucket,
    nowSegment,
    nextFixedEventAt,
    minutesUntilNextFixedEvent,
    departureDeadlineHHMM,
    minutesUntilDeparture,
    eveningSlackRemainingMin,
    timePressure,
    currentMode,
    interruptibility,
    receptivity,
    interventionWindow,
    isNightCheckWindow: isNightCheckBucket(bucket),
  };
}
