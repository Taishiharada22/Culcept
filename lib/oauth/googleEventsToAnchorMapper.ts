/**
 * P3-A-1-2 C-α: Google Calendar event → AnchorDraft 変換 (= pure module)
 *
 * 設計書: docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md §1.4 / §1.5
 * decision-log: 2026-05-26 D-e 採用、 DB 非依存進行範囲
 *
 * 役割:
 *   - GoogleCalendarEventRaw → AnchorDraft 変換
 *   - all-day / timed / cancelled / 不正 shape を区別
 *   - sourceType: 'ics' 流用 (= migration 触らない、 D-e 整合)
 *   - externalUid: iCalUID で dedup 機構を再利用
 *
 * 不変原則 (= 既存 IcsToAnchorMapper と類似 pattern):
 *   1. pure module (= I/O なし、 deterministic)
 *   2. throw しない (= 結果配列 + skip reason)
 *   3. cancelled / 不正 / sumamry 空 は skip
 *   4. recurring は singleEvents=true 前提で個別 instance 扱い (= AnchorDraft は OneOff)
 *   5. multi-day event は 開始日のみ で OneOff (= MVP、 将来 split は別 phase)
 *
 * sourceType 選択 (= 2026-05-26 自立判断、 CEO 確定 「暫定許容、 恒久化しない」):
 *   - 既存 schema (= sourceType union) は 'manual' | 'template' | 'ics'
 *   - 新規 'google_calendar' 追加は migration 必要 → D-e 不変原則違反
 *   - → **'ics' を流用** (= 暫定措置、 既存 dedup 機構 [externalUid] も再利用)
 *
 * ⚠️ TODO (= migration apply phase で必ず実施):
 *   - sourceType に 'google_calendar' を追加する migration を起草 / apply
 *   - 本 mapper の sourceType 'ics' → 'google_calendar' に切替
 *   - 既存 .ics import (= IcsAnchorDraft) と Google Calendar import (= 本 mapper) の
 *     source 区別を schema レベルで確立
 *   - 関連 docs: docs/alter-plan-migration-apply-plan.md (= 移行計画整理)
 *   - decision-log 2026-05-26 D-e + E-α section 参照
 *   - **本流用は P3-A-1-2 phase 限定の暫定措置、 恒久化しない**
 */

import type {
  CreateExternalAnchorInput,
  CreateOneOffAnchorInput,
} from "../plan/external-anchor-input";

import type { GoogleCalendarEventRaw } from "./googleCalendarEvents";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 変換結果 1 件 (= AnchorDraft is_ External-anchor-input shape) */
export type GoogleAnchorDraft = CreateOneOffAnchorInput & {
  /** dedup の主 key (= Google iCalUID または event id) */
  readonly externalUid: string;
};

/** skip された event の reason 詳細 */
export type SkippedEvent = {
  readonly eventId: string;
  readonly reason:
    | "cancelled"
    | "no_summary"
    | "invalid_start"
    | "invalid_date_format"
    | "invalid_time_format";
};

export type MapEventsResult = {
  readonly drafts: ReadonlyArray<GoogleAnchorDraft>;
  readonly skipped: ReadonlyArray<SkippedEvent>;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Single event → draft
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type SingleMapResult =
  | { readonly kind: "ok"; readonly draft: GoogleAnchorDraft }
  | { readonly kind: "skip"; readonly reason: SkippedEvent["reason"] };

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HH_MM_REGEX = /^\d{2}:\d{2}$/;

function extractDateFromIso(iso: string): string | null {
  const t = iso.indexOf("T");
  const datePart = t < 0 ? iso : iso.slice(0, t);
  if (!DATE_REGEX.test(datePart)) return null;
  return datePart;
}

function extractTimeFromIso(iso: string): string | null {
  const t = iso.indexOf("T");
  if (t < 0) return null;
  const timePart = iso.slice(t + 1, t + 6); // "HH:MM"
  if (!TIME_HH_MM_REGEX.test(timePart)) return null;
  return timePart;
}

function mapSingleEvent(event: GoogleCalendarEventRaw): SingleMapResult {
  // ── 1. cancelled status ──
  if (event.status === "cancelled") {
    return { kind: "skip", reason: "cancelled" };
  }

  // ── 2. summary (= title) 必須 ──
  const summary = event.summary?.trim() ?? "";
  if (summary.length === 0) {
    return { kind: "skip", reason: "no_summary" };
  }

  // ── 3. start 必須 ──
  if (!event.start) {
    return { kind: "skip", reason: "invalid_start" };
  }

  // ── 4. all-day vs timed の判定 ──
  const isAllDay =
    typeof event.start.date === "string" && !event.start.dateTime;

  let date: string;
  let startTime: string;
  let endTime: string | undefined;

  if (isAllDay) {
    const d = event.start.date;
    if (!d || !DATE_REGEX.test(d)) {
      return { kind: "skip", reason: "invalid_date_format" };
    }
    date = d;
    startTime = "00:00"; // MVP: all-day は終日 (= ics と同じ扱い)
  } else {
    const dt = event.start.dateTime;
    if (typeof dt !== "string" || dt.length === 0) {
      return { kind: "skip", reason: "invalid_start" };
    }
    const d = extractDateFromIso(dt);
    const t = extractTimeFromIso(dt);
    if (!d) return { kind: "skip", reason: "invalid_date_format" };
    if (!t) return { kind: "skip", reason: "invalid_time_format" };
    date = d;
    startTime = t;

    // endTime (= optional)
    const endDt = event.end?.dateTime;
    if (typeof endDt === "string" && endDt.length > 0) {
      const et = extractTimeFromIso(endDt);
      if (et) endTime = et;
    }
  }

  // ── 5. location (= optional) ──
  const locationText =
    typeof event.location === "string" && event.location.trim().length > 0
      ? event.location.trim()
      : undefined;

  // ── 6. externalUid (= iCalUID 優先、 fallback で id) ──
  const externalUid =
    typeof event.iCalUID === "string" && event.iCalUID.length > 0
      ? event.iCalUID
      : event.id;

  const draft: GoogleAnchorDraft = {
    anchorKind: "one_off",
    title: summary,
    startTime,
    ...(endTime !== undefined ? { endTime } : {}),
    date,
    ...(locationText !== undefined ? { locationText } : {}),
    rigidity: "hard", // MVP default (= 既存 ics import と同方針、 user 後で override 可)
    sourceType: "ics", // D-e 整合: migration 触らず既存 sourceType 流用
    externalUid,
  };

  return { kind: "ok", draft };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bulk transform
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * GoogleCalendarEventRaw[] → GoogleAnchorDraft[] + SkippedEvent[]
 *
 * pure、 入力 mutate なし、 1 件失敗で全体落ちない。
 *
 * @returns drafts: 変換成功、 skipped: cancelled / 不正で除外、 reason 付き
 */
export function mapGoogleEventsToAnchorDrafts(
  events: ReadonlyArray<GoogleCalendarEventRaw>,
): MapEventsResult {
  const drafts: GoogleAnchorDraft[] = [];
  const skipped: SkippedEvent[] = [];

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Type guard / utility (= test 用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** AnchorDraft が CreateExternalAnchorInput と互換 (= 後段 repository 直接渡し可能) */
export function isCreateExternalAnchorInput(
  draft: GoogleAnchorDraft,
): draft is GoogleAnchorDraft & CreateExternalAnchorInput {
  return draft.anchorKind === "one_off" && typeof draft.date === "string";
}
