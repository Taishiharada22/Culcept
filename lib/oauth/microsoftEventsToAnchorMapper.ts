/**
 * Track B TB-3: Microsoft Graph event → AnchorDraft 変換 (= pure module)
 *
 * 設計書: docs/alter-plan-track-b-provider-native-readiness.md §3 TB-3
 * (= googleEventsToAnchorMapper の MS 版)
 *
 * 役割:
 *   - MicrosoftCalendarEventRaw → MsAnchorDraft 変換
 *   - cancelled / seriesMaster / subject 空 / 不正 shape は skip
 *   - sourceType: 'microsoft_calendar'
 *   - externalUid: iCalUId (= dedup 機構を ICS/Google と共通再利用)
 *   - calendarView は recurring を occurrence に展開済 → draft は OneOff
 *
 * TZ (= Track A 教訓を適用、 二重防御):
 *   - Graph は `Prefer: outlook.timezone="Tokyo Standard Time"` 指定で JST naive dateTime を返す
 *     → naive (= Z/offset なし) は **そのまま JST wall-clock** として slice。
 *   - 万一 Z / offset 付き dateTime が来た場合は **絶対時刻を Asia/Tokyo の wall-clock に変換**
 *     (= Track A の ICS Z→JST と同じ。 「JST で見える」を変換規則として閉じる)。
 *
 * 不変原則: pure (= I/O なし、 deterministic) / throw しない / 入力 mutate なし。
 */

import type {
  CreateExternalAnchorInput,
  CreateOneOffAnchorInput,
} from "../plan/external-anchor-input";

import type { MicrosoftCalendarEventRaw } from "./microsoftCalendarEvents";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type MsAnchorDraft = CreateOneOffAnchorInput & {
  readonly externalUid: string;
};

export type MsSkippedEvent = {
  readonly eventId: string;
  readonly reason:
    | "cancelled"
    | "no_summary"
    | "series_master"
    | "invalid_start"
    | "invalid_date_format"
    | "invalid_time_format";
};

export type MsMapEventsResult = {
  readonly drafts: ReadonlyArray<MsAnchorDraft>;
  readonly skipped: ReadonlyArray<MsSkippedEvent>;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TZ helper (= naive → JST 扱い / zoned → JST 変換)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;
const APP_TIMEZONE = "Asia/Tokyo";

/** dateTime に Z / 数値 offset が付いているか (= zoned) */
function hasZoneMarker(dt: string): boolean {
  return /[zZ]$/.test(dt) || /[+-]\d{2}:?\d{2}$/.test(dt);
}

/**
 * Graph dateTime → app 表示 TZ (JST) の { date, time } wall-clock。
 * - naive (= Prefer=Tokyo の結果): 書かれた値をそのまま JST として slice。
 * - zoned (= Z/offset): 絶対時刻を Asia/Tokyo に変換 (= Intl/ICU)。
 * 返り値が null なら不正 (= caller が skip)。
 */
export function microsoftDateTimeToJst(
  dateTime: string,
): { readonly date: string; readonly time: string } | null {
  const dt = dateTime.trim();
  if (dt.length < 16) return null;

  if (!hasZoneMarker(dt)) {
    // naive: 書かれた JST wall-clock を slice
    const date = dt.slice(0, 10);
    const time = dt.slice(11, 16);
    if (!DATE_REGEX.test(date) || !TIME_REGEX.test(time)) return null;
    return { date, time };
  }

  // zoned: 絶対時刻を Asia/Tokyo の wall-clock へ
  const abs = new Date(dt);
  if (Number.isNaN(abs.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(abs);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  const hh = p.hour === "24" ? "00" : (p.hour ?? "00");
  const date = `${p.year ?? "1970"}-${p.month ?? "01"}-${p.day ?? "01"}`;
  const time = `${hh}:${p.minute ?? "00"}`;
  if (!DATE_REGEX.test(date) || !TIME_REGEX.test(time)) return null;
  return { date, time };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Single event → draft
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type SingleMapResult =
  | { readonly kind: "ok"; readonly draft: MsAnchorDraft }
  | { readonly kind: "skip"; readonly reason: MsSkippedEvent["reason"] };

function mapSingleEvent(event: MicrosoftCalendarEventRaw): SingleMapResult {
  if (event.isCancelled === true) {
    return { kind: "skip", reason: "cancelled" };
  }
  // seriesMaster は calendarView では通常返らないが、 念のため除外 (= occurrence のみ採用)
  if (event.type === "seriesMaster") {
    return { kind: "skip", reason: "series_master" };
  }

  const summary = event.subject?.trim() ?? "";
  if (summary.length === 0) {
    return { kind: "skip", reason: "no_summary" };
  }

  const startDt = event.start?.dateTime;
  if (typeof startDt !== "string" || startDt.length === 0) {
    return { kind: "skip", reason: "invalid_start" };
  }

  let date: string;
  let startTime: string;
  let endTime: string | undefined;

  if (event.isAllDay === true) {
    // 終日: 日付のみ、 00:00 (= ICS/Google all-day と同方針)
    const d = startDt.slice(0, 10);
    if (!DATE_REGEX.test(d)) return { kind: "skip", reason: "invalid_date_format" };
    date = d;
    startTime = "00:00";
  } else {
    const start = microsoftDateTimeToJst(startDt);
    if (!start) return { kind: "skip", reason: "invalid_time_format" };
    date = start.date;
    startTime = start.time;
    const endDt = event.end?.dateTime;
    if (typeof endDt === "string" && endDt.length > 0) {
      const end = microsoftDateTimeToJst(endDt);
      if (end) endTime = end.time;
    }
  }

  const locationText =
    typeof event.location?.displayName === "string" &&
    event.location.displayName.trim().length > 0
      ? event.location.displayName.trim()
      : undefined;

  const externalUid =
    typeof event.iCalUId === "string" && event.iCalUId.length > 0 ? event.iCalUId : event.id;

  const draft: MsAnchorDraft = {
    anchorKind: "one_off",
    title: summary,
    startTime,
    ...(endTime !== undefined ? { endTime } : {}),
    date,
    ...(locationText !== undefined ? { locationText } : {}),
    rigidity: "hard", // MVP default (= ICS/Google と同方針、 user 後で override 可)
    sourceType: "microsoft_calendar",
    externalUid,
  };

  return { kind: "ok", draft };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bulk transform
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function mapMicrosoftEventsToAnchorDrafts(
  events: ReadonlyArray<MicrosoftCalendarEventRaw>,
): MsMapEventsResult {
  const drafts: MsAnchorDraft[] = [];
  const skipped: MsSkippedEvent[] = [];

  for (const event of events) {
    const r = mapSingleEvent(event);
    if (r.kind === "ok") {
      drafts.push(r.draft);
    } else {
      skipped.push({ eventId: event.id, reason: r.reason });
    }
  }

  return { drafts, skipped };
}

/** AnchorDraft が CreateExternalAnchorInput と互換 (= repository 直接渡し可能) */
export function isMsCreateExternalAnchorInput(
  draft: MsAnchorDraft,
): draft is MsAnchorDraft & CreateExternalAnchorInput {
  return draft.anchorKind === "one_off" && typeof draft.date === "string";
}
