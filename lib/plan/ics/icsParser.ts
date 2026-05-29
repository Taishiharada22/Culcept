/**
 * P3 W1 — .ics / iCal parser (= pure module、 ical.js wrap)
 *
 * 設計書: docs/alter-plan-p3-ics-import-readiness.md §2 Q1 (= ical.js 採用)
 *
 * 役割:
 *   - raw .ics string (= RFC 5545 iCalendar) → ParsedIcsEvent[] 変換
 *   - 内部 type ParsedIcsEvent を返す (= ExternalAnchor 直接ではなく、 mapper で変換)
 *   - **pure module** (= I/O / DB / network 不使用、 deterministic)
 *   - **safe degrade** (= 不正 .ics で例外を throw せず空配列 return + reason)
 *
 * 不変原則:
 *   - 入力文字列 mutate なし
 *   - ical.js 例外を吸収、 fail-open 設計
 *   - timezone は **UTC 想定 (= MVP)**、 TZID は raw 保持し W2 以降で扱う
 *   - VEVENT のみ抽出 (= VTODO / VJOURNAL / VFREEBUSY 等は scope 外)
 *
 * 設計参考:
 *   - lib/plan/external-anchor.ts (= ExternalAnchor 型、 mapper で利用)
 *   - ical.js: dist/types/event.d.ts / time.d.ts (= API surface)
 */

// 注: pure module、 server-only marker 不要 (= I/O なし、 client / server 両方で読み込み可能)
//     ただし ical.js は ~50KB あるため、 client 側で実行する場合は次の dynamic import 推奨。

import ICAL from "ical.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Parser 内部 event type (= ical.js Event を絞り込んだ shape)
 *
 * mapper (= icsToAnchorMapper.ts) でこれを ExternalAnchorInput に変換する。
 *
 * 設計:
 *   - 必須: uid / summary / startDate
 *   - optional: endDate / location / description / recurrenceRuleRaw / tzid
 *   - isAllDay: DTSTART が日付のみ (= 時刻なし) なら true
 *   - 全 ISO 8601 文字列で保持 (= JS Date 化は mapper 内で行う)
 */
export type ParsedIcsEvent = {
  /** VEVENT UID (= RFC 5545、 重複判定の鍵) */
  readonly uid: string;
  /** SUMMARY (= イベント名) */
  readonly summary: string;
  /** DTSTART (= ISO 8601 文字列、 「書かれた wall-clock」 を保持。 TZ 変換しない = 2026-05-29 修正) */
  readonly startDateIso: string;
  /** DTEND (= optional、 ISO 8601、 「書かれた wall-clock」 を保持) */
  readonly endDateIso?: string;
  /** LOCATION (= 任意の文字列) */
  readonly location?: string;
  /** DESCRIPTION (= 自由テキスト、 任意) */
  readonly description?: string;
  /** RRULE raw (= RFC 5545 format そのまま、 例 "FREQ=WEEKLY;BYDAY=MO") */
  readonly recurrenceRuleRaw?: string;
  /** isDate (= DTSTART が DATE 型なら true、 終日 event) */
  readonly isAllDay: boolean;
  /** TZID (= DTSTART の timezone、 ある場合のみ、 例 "America/New_York") */
  readonly tzid?: string;
};

/**
 * Parser 結果 (= 結果配列 + メタ情報)
 */
export type IcsParseResult = {
  /** 抽出された VEVENT (= 数 0 以上) */
  readonly events: ReadonlyArray<ParsedIcsEvent>;
  /** parse 中に検出された警告 (= 致命的でないが要注意の問題) */
  readonly warnings: ReadonlyArray<string>;
  /** parse が成功したか */
  readonly success: boolean;
  /** 失敗 reason (= success=false の場合のみ) */
  readonly error?: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parseIcsString (= main entry、 pure + fail-open)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Raw .ics string を parse して ParsedIcsEvent[] を return
 *
 * 不変:
 *   - 入力 string mutate なし
 *   - 例外 throw しない (= fail-open、 success=false + error で return)
 *   - VEVENT のみ抽出 (= VTODO / VJOURNAL は scope 外)
 *   - 空 input → success=true + events 空配列 (= 「正しく空」)
 *
 * @param raw - .ics file の中身 (= 文字列、 UTF-8)
 * @returns 結果 (= events + warnings + success / error)
 */
export function parseIcsString(raw: string): IcsParseResult {
  // 1. 空入力 / 非文字列 → 成功 + 空 events
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { events: [], warnings: [], success: true };
  }

  const warnings: string[] = [];
  const events: ParsedIcsEvent[] = [];

  // 2. ical.js parse
  let jcal: unknown;
  try {
    jcal = ICAL.parse(raw);
  } catch (e) {
    return {
      events: [],
      warnings: [],
      success: false,
      error: `parse_failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // 3. Component build (= jCal → Component tree)
  let root: ICAL.Component;
  try {
    // ical.js parse は jCal array format を return、 Component で wrap する
    root = new ICAL.Component(jcal as Array<unknown>);
  } catch (e) {
    return {
      events: [],
      warnings: [],
      success: false,
      error: `component_failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // 4. VEVENT 抽出 (= サブコンポーネント iterate)
  const vevents = root.getAllSubcomponents("vevent");
  for (const vevent of vevents) {
    try {
      const event = new ICAL.Event(vevent);
      const parsed = mapIcalEventToParsed(event, warnings);
      if (parsed !== null) {
        events.push(parsed);
      }
    } catch (e) {
      warnings.push(
        `vevent_skipped: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return {
    events,
    warnings,
    success: true,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// internal: ICAL.Time → ISO 8601 (= timezone shift 回避)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ICAL.Time → ISO 8601 string (= 「書かれた wall-clock」 を直接保持、 TZ 変換しない)
 *
 * 重要 (= 2026-05-29 修正): 終日 / 時刻あり ともに year/month/day/hour/minute/second の
 * **書かれた値** を直接 ISO 化する。 `toJSDate().toISOString()` は使わない。
 *
 * 理由:
 *   - app は timezone-naive (= mapper が ISO の HH:MM / YYYY-MM-DD を wall-clock として slice、
 *     viewer TZ への変換を持たない)。
 *   - `toJSDate().toISOString()` は絶対時刻を UTC へ変換するため、 TZID=Asia/Tokyo の 21:00 が
 *     12:00 へズレる (= 9h shift。 floating time は machine TZ 依存にもなる)。
 *   - `.hour`/`.minute` 等は zone 変換せず「書かれた値」を返すので、 21:00 を 21:00 のまま保持できる。
 *   - これは Google API path (= googleEventsToAnchorMapper が `+09:00` 文字列の HH:MM を
 *     local wall-clock として採用) と一致する。
 *
 * 注: 末尾 "Z" は format 安定用 (= 下流 mapper は slice のみ、 真の UTC instant は意味しない)。
 *     多 TZ 環境での viewer TZ 正規変換は app に TZ 概念が入った後の別 phase。
 */
function icalTimeToIso(time: ICAL.Time): string {
  const y = time.year.toString().padStart(4, "0");
  const m = time.month.toString().padStart(2, "0");
  const d = time.day.toString().padStart(2, "0");
  if (time.isDate === true) {
    // 終日 event: 日付 components のみ (= 時刻なし)
    return `${y}-${m}-${d}T00:00:00.000Z`;
  }
  // 時刻あり: 書かれた wall-clock components を直接 ISO 化 (= TZ shift 回避)
  const hh = time.hour.toString().padStart(2, "0");
  const mm = time.minute.toString().padStart(2, "0");
  const ss = time.second.toString().padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}.000Z`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// internal: ICAL.Event → ParsedIcsEvent
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ICAL.Event → ParsedIcsEvent (= 必須 field check 込み)
 *
 * 必須 field 不足 (= uid / summary / startDate) → null return + warning。
 *
 * 不変:
 *   - 入力 mutate なし
 *   - pure (= I/O なし)
 */
function mapIcalEventToParsed(
  event: ICAL.Event,
  warnings: string[],
): ParsedIcsEvent | null {
  // 必須 field check
  const uid = event.uid;
  if (typeof uid !== "string" || uid.length === 0) {
    warnings.push("vevent_missing_uid");
    return null;
  }

  const summary = event.summary;
  if (typeof summary !== "string" || summary.length === 0) {
    warnings.push(`vevent_missing_summary: uid=${uid}`);
    return null;
  }

  const startDate = event.startDate;
  if (startDate === null || startDate === undefined) {
    warnings.push(`vevent_missing_startDate: uid=${uid}`);
    return null;
  }

  // ISO 8601 化:
  //   - isDate (= 終日 event): year/month/day を直接 ISO 化 (= timezone shift 回避、 UTC midnight 固定)
  //   - 時刻あり: toJSDate().toISOString() (= TZ 考慮済 UTC ISO)
  let startDateIso: string;
  try {
    startDateIso = icalTimeToIso(startDate);
  } catch (e) {
    warnings.push(
      `vevent_invalid_startDate: uid=${uid}, ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }

  let endDateIso: string | undefined;
  if (event.endDate !== null && event.endDate !== undefined) {
    try {
      endDateIso = icalTimeToIso(event.endDate);
    } catch {
      // endDate は optional、 不正なら warning + skip 程度
      warnings.push(`vevent_invalid_endDate: uid=${uid}`);
    }
  }

  // location / description (= optional)
  const location =
    typeof event.location === "string" && event.location.length > 0
      ? event.location
      : undefined;
  const description =
    typeof event.description === "string" && event.description.length > 0
      ? event.description
      : undefined;

  // RRULE raw (= RFC 5545 format そのまま保存、 mapper で OneOff/Recurring 判定に使う)
  let recurrenceRuleRaw: string | undefined;
  if (event.isRecurring()) {
    // event.component から RRULE prop を直接取得
    const rrulePropArray = event.component.getAllProperties("rrule");
    if (rrulePropArray.length > 0) {
      try {
        // getFirstValue は ICAL.Recur instance を返す、 toString() で RFC 5545 形式
        const recurValue = rrulePropArray[0]?.getFirstValue();
        if (recurValue !== null && recurValue !== undefined) {
          recurrenceRuleRaw = String(recurValue);
        }
      } catch {
        warnings.push(`vevent_invalid_rrule: uid=${uid}`);
      }
    }
  }

  // isAllDay (= DTSTART が DATE 型なら時刻なし)
  const isAllDay = startDate.isDate === true;

  // TZID (= DTSTART の timezone parameter)
  let tzid: string | undefined;
  const dtstartProp = event.component.getFirstProperty("dtstart");
  if (dtstartProp !== null) {
    const tzidParam = dtstartProp.getParameter("tzid");
    if (typeof tzidParam === "string" && tzidParam.length > 0) {
      tzid = tzidParam;
    }
  }

  return {
    uid,
    summary,
    startDateIso,
    ...(endDateIso !== undefined ? { endDateIso } : {}),
    ...(location !== undefined ? { location } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(recurrenceRuleRaw !== undefined ? { recurrenceRuleRaw } : {}),
    isAllDay,
    ...(tzid !== undefined ? { tzid } : {}),
  };
}
