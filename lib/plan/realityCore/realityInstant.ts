/**
 * RealityInstant — Graph 全体の時刻契約（RC2a-1）
 *
 * 正本: docs/reality-graph-identity-hardening-rg06b.md §2/§16 / RG0.6a §7 / RG0.6 §3
 *
 * 背景（W6-smoke-fix の実バグ）: チャートは UTC+9 明示計算・gating はブラウザ local getHours() という
 * 時刻ソース分裂で Night Check が出なかった。本モジュールが TZ 換算の**単一正本**であり、
 * fixture が screenViewModel.jstNowMinutes / adapter.toJstWallClock との等価性を機械固定して再分裂を防ぐ。
 *
 * 規律:
 *  - RealityInstant を組めるのは境界 1 箇所のみ（client の mount/tick・テストの fixture）。
 *    pure 層は受け取るだけで内部で Date.now()/getHours() を呼ばない
 *  - timezone は明示 field（IANA string）。**ブラウザ local TZ の暗黙取得は永久禁止**
 *  - v0 既定 = "Asia/Tokyo"（固定 UTC+9・DST なし）。Travel mode 等の他 TZ は将来 factory 追加で
 *    差し替える（JST 固定を永久正本にしない — RG0.6a §7）
 */

/** 主観日境界 05:00（dayState/timeOfDay・adapter と同一規約） */
const SUBJECTIVE_DAY_START_MIN = 5 * 60;

export interface RealityInstant {
  /** ISO 8601（唯一の源。秒以下は runtime metadata 用 — identity には使わない） */
  readonly nowInstant: string;
  /** IANA timezone（明示入力。暗黙取得禁止） */
  readonly timezone: string;
  /** timezone の壁時計 "HH:MM" */
  readonly wallClockHHMM: string;
  /** timezone の暦日 "YYYY-MM-DD" */
  readonly calendarDate: string;
  /** 主観日（05:00 境界 — 00:00-04:59 は前日） */
  readonly subjectiveDate: string;
  /** 主観日内の分 0-1439（05:00 起点） — snapshot identity の時間成分（minute precision） */
  readonly minuteOfSubjectiveDay: number;
}

const JST_TIMEZONE = "Asia/Tokyo";
const JST_OFFSET_MS = 9 * 3600000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * JST（UTC+9 固定）の RealityInstant を組む。now は呼び出し側（境界）が評価して注入。
 * 換算は screenViewModel.jstNowMinutes / adapter.toJstWallClock と同一（fixture で等価性固定）。
 */
export function makeRealityInstantJst(now: Date): RealityInstant {
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const jst = new Date(utcMs + JST_OFFSET_MS);
  const wallClockHHMM = `${pad2(jst.getHours())}:${pad2(jst.getMinutes())}`;
  const calendarDate = `${jst.getFullYear()}-${pad2(jst.getMonth() + 1)}-${pad2(jst.getDate())}`;

  const absMin = jst.getHours() * 60 + jst.getMinutes();
  const minuteOfSubjectiveDay = (absMin - SUBJECTIVE_DAY_START_MIN + 1440) % 1440;

  let subjectiveDate = calendarDate;
  if (jst.getHours() < 5) {
    const prev = new Date(jst.getFullYear(), jst.getMonth(), jst.getDate() - 1);
    subjectiveDate = `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}-${pad2(prev.getDate())}`;
  }

  return {
    nowInstant: now.toISOString(),
    timezone: JST_TIMEZONE,
    wallClockHHMM,
    calendarDate,
    subjectiveDate,
    minuteOfSubjectiveDay,
  };
}
