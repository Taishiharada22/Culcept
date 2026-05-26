/**
 * P3 W1 — ParsedIcsEvent → ExternalAnchor (= 入力) 変換 mapper (= pure module)
 *
 * 設計書: docs/alter-plan-p3-ics-import-readiness.md §2 Q2/Q3/Q4/Q5
 *
 * 役割:
 *   - ParsedIcsEvent (= icsParser.ts の出力) を ExternalAnchor 入力 shape に変換
 *   - **OneOff / Recurring の自動判定** (= recurrenceRuleRaw 有無、 expansion なし、 raw RRULE 保持のみ)
 *   - **pure module** (= I/O なし、 deterministic)
 *   - **safe degrade** (= 不正 event は IcsAnchorDraft で reason 付き skip)
 *
 * CEO + GPT 4 補正 (= 2026-05-26):
 *   - 補正 1: rigidity="hard" は **デフォルト値** であり invariant ではない (= W2 で user 選択可)
 *           「動かせなさ」 (= rigidity) と 「由来 / authority」 (= imported / import_locked) は別 concept
 *           既存 sourceProvenance.ts の SourceModel に従い、 source は W3 で authority="import_locked" 設定
 *   - 補正 2: recurring は **判定のみ**、 expansion / 複雑 RRULE 解釈は後段 (= W4 以降)
 *   - 補正 3: W2 では本 draft を **review/approve UI** に渡す (= user が承認後に保存)
 *   - 補正 4: dedup (= UID 完全一致) は W3、 W2 では sourceUid を保持して 簡易 「重複候補」 warning に流す
 *
 * 不変原則:
 *   - 入力 mutate なし
 *   - id / userId / sourceId / confirmedAt は **本 module では割り当てない**
 *     (= W3 server action 経由で 永続時に割り当てる、 W1 では draft shape)
 *   - timezone: UTC 想定 MVP (= startDateIso → "HH:MM" 抽出 / date YYYY-MM-DD 抽出)
 *   - RRULE は raw のまま保存 (= ExternalAnchor.recurrenceRule field 流用、 RFC 5545)
 *   - sourceUid: ParsedIcsEvent.uid を保持 (= W2 重複候補 warning + W3 dedup 用)
 *
 * 設計参考:
 *   - lib/plan/external-anchor.ts (= ExternalAnchor 型)
 *   - lib/plan/list/sourceProvenance.ts (= SourceModel、 ImportedLockedSource pattern)
 *   - lib/plan/ics/icsParser.ts (= ParsedIcsEvent)
 */

import type { ParsedIcsEvent } from "./icsParser";
import type { AnchorRigidity } from "../external-anchor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Anchor draft (= W1 出力、 W3 で id/userId/sourceId/confirmedAt を 補って ExternalAnchor 化)
 *
 * shape:
 *   - 共通 field (= title / startTime / endTime / locationText / rigidity)
 *   - anchorKind 別 field (= one_off → date、 recurring → validFrom/recurrenceRule)
 *   - sourceUid (= .ics の VEVENT UID、 W3 dedup 用、 ExternalAnchor 型には載らない meta)
 *
 * 注: 既存 ExternalAnchor 型は id 必須 / userId 必須 / sourceId 必須。
 *     draft は その手前 (= server action 受領前) の shape。
 */
export type IcsAnchorDraft = {
  /** discriminated union: one_off or recurring */
  readonly anchorKind: "one_off" | "recurring";

  /** ExternalAnchor.title 相当 */
  readonly title: string;

  /** "HH:MM" (= 時刻のみ、 startDateIso から抽出) */
  readonly startTime: string;
  /** "HH:MM" (= 時刻のみ、 endDateIso から抽出、 optional) */
  readonly endTime?: string;

  /** OneOff 専用: YYYY-MM-DD */
  readonly date?: string;

  /** Recurring 専用: YYYY-MM-DD (= validFrom) */
  readonly validFrom?: string;
  /** Recurring 専用: RFC 5545 RRULE raw (= 例 "FREQ=WEEKLY;BYDAY=MO,TU") */
  readonly recurrenceRule?: string;

  /** ExternalAnchor.locationText 相当 (= optional) */
  readonly locationText?: string;

  /**
   * ExternalAnchor.rigidity (= デフォルト "hard"、 ただし invariant ではない)
   *
   * CEO + GPT 補正 1 (= 2026-05-26): rigidity は 「動かせなさ」 (= 仕事会議 hard / 定期ジム soft)、
   * source 由来とは独立。 .ics import default は "hard" だが、 W2 preview で user が toggle 可能。
   * 永続化時の lock 管理は authority="import_locked" (= sourceProvenance.ts) で別 layer 化。
   */
  readonly rigidity: AnchorRigidity;

  /** .ics の VEVENT UID (= W3 dedup 用) */
  readonly sourceUid: string;

  /** original ParsedIcsEvent (= debug / preview 用、 W2 UI で表示) */
  readonly source: ParsedIcsEvent;
};

/**
 * Mapper 結果 (= draft 配列 + 各 event 別 reason)
 */
export type IcsAnchorMappingResult = {
  /** 変換成功 draft (= 配列) */
  readonly drafts: ReadonlyArray<IcsAnchorDraft>;
  /** skip された event の reason 配列 */
  readonly skipped: ReadonlyArray<{
    readonly sourceUid: string;
    readonly reason: string;
  }>;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// mapIcsEventsToDrafts (= main entry)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ParsedIcsEvent[] → IcsAnchorDraft[] 変換
 *
 * 不変:
 *   - 入力 mutate なし
 *   - 各 event は独立して変換、 1 つの失敗で全体落ちない
 *   - 不正 event は skipped[] に reason 付きで記録 (= UI で表示できる)
 */
export function mapIcsEventsToDrafts(
  events: ReadonlyArray<ParsedIcsEvent>,
): IcsAnchorMappingResult {
  const drafts: IcsAnchorDraft[] = [];
  const skipped: { sourceUid: string; reason: string }[] = [];

  for (const event of events) {
    const result = mapSingleIcsEventToDraft(event);
    if (result.kind === "ok") {
      drafts.push(result.draft);
    } else {
      skipped.push({ sourceUid: event.uid, reason: result.reason });
    }
  }

  return { drafts, skipped };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// internal: 単一 event → draft
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type SingleMapResult =
  | { readonly kind: "ok"; readonly draft: IcsAnchorDraft }
  | { readonly kind: "skip"; readonly reason: string };

/**
 * 1 件の ParsedIcsEvent → IcsAnchorDraft
 *
 * 変換 logic:
 *   1. title: event.summary
 *   2. startTime / date: startDateIso (= ISO 8601) から HH:MM / YYYY-MM-DD 抽出
 *      - isAllDay → startTime は "00:00" (= MVP)、 終日 event
 *   3. endTime: endDateIso があれば "HH:MM" 抽出
 *   4. locationText: event.location
 *   5. rigidity: "hard" 固定 (= .ics import の予定は外部固定、 §2.0 invariant)
 *   6. anchorKind: recurrenceRuleRaw あれば "recurring"、 なければ "one_off"
 *   7. recurring の場合: validFrom = date、 recurrenceRule = recurrenceRuleRaw
 *
 * skip 条件:
 *   - title 空 / 不正
 *   - startDateIso parse 失敗
 */
function mapSingleIcsEventToDraft(event: ParsedIcsEvent): SingleMapResult {
  // title
  const title = event.summary.trim();
  if (title.length === 0) {
    return { kind: "skip", reason: "empty_title" };
  }

  // startDateIso → Date object
  const startDate = new Date(event.startDateIso);
  if (isNaN(startDate.getTime())) {
    return { kind: "skip", reason: "invalid_start_date" };
  }

  // YYYY-MM-DD 抽出 (= UTC 想定、 toISOString() の前 10 文字)
  const datePart = event.startDateIso.slice(0, 10);
  // YYYY-MM-DD 形式 check
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return { kind: "skip", reason: "invalid_date_format" };
  }

  // HH:MM 抽出 (= isAllDay なら "00:00"、 そうでなければ ISO 8601 の T 後の 5 文字)
  let startTime: string;
  if (event.isAllDay) {
    startTime = "00:00";
  } else {
    // ISO 8601 例: "2026-05-26T14:30:00.000Z" → "14:30"
    const tIndex = event.startDateIso.indexOf("T");
    if (tIndex < 0) {
      return { kind: "skip", reason: "invalid_iso_format" };
    }
    startTime = event.startDateIso.slice(tIndex + 1, tIndex + 6);
    if (!/^\d{2}:\d{2}$/.test(startTime)) {
      return { kind: "skip", reason: "invalid_time_format" };
    }
  }

  // endTime (= optional)
  let endTime: string | undefined;
  if (event.endDateIso !== undefined && !event.isAllDay) {
    const endTIndex = event.endDateIso.indexOf("T");
    if (endTIndex >= 0) {
      const t = event.endDateIso.slice(endTIndex + 1, endTIndex + 6);
      if (/^\d{2}:\d{2}$/.test(t)) {
        endTime = t;
      }
    }
  }

  // locationText (= optional)
  const locationText =
    typeof event.location === "string" && event.location.trim().length > 0
      ? event.location.trim()
      : undefined;

  // rigidity (= 補正 1: "hard" デフォルト、 W2 preview で user 選択可、 invariant ではない)
  const rigidity: AnchorRigidity = "hard";

  // anchorKind 判定 + 専用 field
  const isRecurring =
    typeof event.recurrenceRuleRaw === "string" &&
    event.recurrenceRuleRaw.length > 0;

  if (isRecurring) {
    return {
      kind: "ok",
      draft: {
        anchorKind: "recurring",
        title,
        startTime,
        ...(endTime !== undefined ? { endTime } : {}),
        validFrom: datePart,
        recurrenceRule: event.recurrenceRuleRaw,
        ...(locationText !== undefined ? { locationText } : {}),
        rigidity,
        sourceUid: event.uid,
        source: event,
      },
    };
  }

  // OneOff
  return {
    kind: "ok",
    draft: {
      anchorKind: "one_off",
      title,
      startTime,
      ...(endTime !== undefined ? { endTime } : {}),
      date: datePart,
      ...(locationText !== undefined ? { locationText } : {}),
      rigidity,
      sourceUid: event.uid,
      source: event,
    },
  };
}
