/**
 * ExternalAnchor (domain) → AnchorFormState 変換 (W1-X2)
 *
 * EditAnchorModal が既存 anchor を form に流し込むための pure 関数。
 *
 * 不変原則:
 *   1. 入力 mutate しない
 *   2. 副作用なし
 *   3. unknown sourceType は "manual" placeholder（external_anchors テーブルに
 *      sourceType column が無いため、anchor 単独からは取得不能）
 *   4. recurring の recurrenceRule から Weekday[] を逆引き（parseWeekdaysFromRRule 使用）
 *      逆引き失敗（範囲外 RRULE）→ selectedWeekdays は空配列にフォールバック
 *      この場合、ユーザーは曜日を再選択する必要がある（kind 不変前提では稀）
 */

import type { ExternalAnchor } from "./external-anchor";
import {
  type AnchorFormState,
  emptyAnchorFormState,
} from "./anchor-input-form";
import { parseWeekdaysFromRRule } from "./weekday-template";

export function domainToFormState(anchor: ExternalAnchor): AnchorFormState {
  const base: AnchorFormState = {
    ...emptyAnchorFormState(),
    title: anchor.title,
    startTime: anchor.startTime,
    rigidity: anchor.rigidity,
    endTime: anchor.endTime ?? "",
    locationCategory: anchor.locationCategory ?? "",
    locationText: anchor.locationText ?? "",
    sensitiveCategory: anchor.sensitiveCategory ?? "",
    // ExternalAnchor 型に sourceType は含まれない（anchor input 専用）
    // Edit modal では sourceType を変更しない想定だが、validation 用に default を入れる
    sourceType: "manual",
  };

  if (anchor.anchorKind === "one_off") {
    return {
      ...base,
      kind: "one_off",
      date: anchor.date,
    };
  }

  // recurring
  const weekdays = parseWeekdaysFromRRule(anchor.recurrenceRule) ?? [];
  // W1-X4: exception dates を form に流し込む（既存の DB 値を尊重、canonical sort）
  const exceptionDates = [...(anchor.exceptionDates ?? [])].sort();
  return {
    ...base,
    kind: "recurring",
    validFrom: anchor.validFrom,
    validUntil: anchor.validUntil ?? "",
    selectedWeekdays: weekdays,
    exceptionDates,
  };
}
