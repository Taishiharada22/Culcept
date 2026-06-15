/**
 * anchor-start-time-provenance — U1-minimal（2026-06-15）: startTimeSource を **signal から server 導出**（pure）
 *
 * 設計書: docs/reality-leaveby-u1-minimal-startsource-0.md
 *
 * 思想: client は label（startTimeSource）を渡さない（mislabel 防止）。各 ingestion path は honest な signal
 *   （manual=startTimeUserEntered / ICS=icsIsAllDay,icsTzid）だけを input に載せ、**server がここで label を導出**する。
 *   scope は **manual + ICS-timed のみ**。それ以外は fail-closed `unknown`（fixed arrival にしない）。
 *
 * 不変条件:
 *   - manual + startTimeUserEntered===true → user_explicit / それ以外 → assumed_default（prefill 未編集を exact にしない）
 *   - **template は本片 scope 外**（同 form を通っても user_explicit にしない・CEO 補正）→ unknown
 *   - ics + isAllDay → assumed_default（all-day 00:00 placeholder・exact 不可）
 *   - ics + timed + tzid → imported_exact / ics + timed + floating（tzid 無）→ system_inferred
 */

import type { CreateExternalAnchorInput } from "./external-anchor-input";
import type { StartTimeSource } from "./external-anchor";

export interface StartTimeProvenanceDerivation {
  readonly source: StartTimeSource;
  readonly isAllDayPlaceholder: boolean;
  readonly timezoneOfRecord: string | null;
}

/** signal → startTimeSource label（pure・fail-closed）。 */
export function deriveStartTimeProvenance(input: CreateExternalAnchorInput): StartTimeProvenanceDerivation {
  if (input.sourceType === "manual") {
    return {
      source: input.startTimeUserEntered === true ? "user_explicit" : "assumed_default",
      isAllDayPlaceholder: false,
      timezoneOfRecord: null,
    };
  }
  if (input.sourceType === "ics") {
    if (input.icsIsAllDay === true) {
      return { source: "assumed_default", isAllDayPlaceholder: true, timezoneOfRecord: null };
    }
    const tz = input.icsTzid ?? null;
    if (tz !== null && tz.length > 0) {
      return { source: "imported_exact", isAllDayPlaceholder: false, timezoneOfRecord: tz };
    }
    return { source: "system_inferred", isAllDayPlaceholder: false, timezoneOfRecord: null };
  }
  // template / google_calendar / microsoft_calendar / shift_image …（本片 scope 外・fail-closed）
  return { source: "unknown", isAllDayPlaceholder: false, timezoneOfRecord: null };
}

/**
 * provenance を記録した時刻（unknown は記録しない）。start_time_source が正本で、単独判定には使わない。
 * sequential 経路は nowIso を渡す。RPC 経路は SQL 側で source<>'unknown' の時 NOW() を埋める（両経路一致）。
 */
export function startTimeProvenanceRecordedAt(source: StartTimeSource, nowIso: string): string | null {
  return source === "unknown" ? null : nowIso;
}

/**
 * DB 行の start_time_source を domain enum に倒す（read 側）。**NULL / 列 absent（migration 未適用）/ 未知値 → unknown**
 * （fail-closed・fixed arrival にしない）。legacy 行の provenance を捏造しない。
 */
export function coerceStartTimeSource(raw: string | null | undefined): StartTimeSource {
  switch (raw) {
    case "user_explicit":
    case "imported_exact":
    case "system_inferred":
    case "assumed_default":
    case "unknown":
      return raw;
    default:
      return "unknown";
  }
}
