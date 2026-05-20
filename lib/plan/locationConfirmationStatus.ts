/**
 * Location Confirmation Status helper (Phase 2-D C3)
 *
 * 設計書: docs/alter-plan-phase2-d-place-picker-mini-design.md §6 (C3)
 *
 * 役割:
 *   anchor.locationText の「未確定」状態判定を **Cross-tab 単一仕様**で提供する。
 *   CalendarTab / FlowTab / MapTab SelectedAnchorCard の **全 3 箇所**で
 *   本関数のみを使い、独自判定を書かない (仕様ズレによる false positive/negative を防ぐ)。
 *
 * 不変原則 (GPT 補正 2026-05-21):
 *   - 「場所必要性」(requiresLocation) と「未確定」を厳密に区別する
 *   - 空欄まで未確定扱いしない (「家で考える」「資料整理」「オンライン作業」など
 *     場所が不要な anchor で false positive を出さない)
 *   - 将来 ExternalAnchor に requiresLocation flag が入った段階で、
 *     空欄 + requiresLocation=true も未確定扱いするよう 2-arg 版を追加可能
 *     (現 1-arg 版は backward compatible で残す)
 *
 * 設計思想 (Aneurasync 三原則):
 *   1. 強制しない: indicator は subtle、行動を求めない
 *   2. 観測の入口: 「これも確定すれば、もっと良い体験になる」を示唆
 *   3. 世界観の一貫: glassmorphism / slate muted / 短い日本語
 */

import { isCanonicalLocationText } from "@/lib/shared/canonicalLocationText";

/**
 * locationText が「入力されたが、まだ Places API で canonical 確定されていない」状態か。
 *
 * 判定表:
 *   | 入力                                              | 戻り値 | 理由                       |
 *   |---------------------------------------------------|--------|----------------------------|
 *   | null / undefined / 空文字 / "   " / "\t\n"        | false  | 場所必要性なし、indicator 不要 |
 *   | "成田のスタバ" (free text、separator なし)        | true   | 入力あるが未確定           |
 *   | "スタバ · 千葉県" (canonical)                     | false  | 確定済み                   |
 *   | " · 千葉県" (displayName 空、malformed canonical) | true   | 入力 trim 後 non-empty かつ非 canonical |
 *   | "スタバ · " (address 空、malformed canonical)     | true   | 同上                       |
 *
 * Cross-tab で完全同一仕様。CalendarTab / FlowTab / SelectedAnchorCard すべて本関数を呼ぶ。
 *
 * @param locationText anchor.locationText の値 (null/undefined 許容)
 * @returns 未確定 indicator を表示すべきか
 */
export function isPlaceUnconfirmed(
  locationText: string | null | undefined,
): boolean {
  // 空 / whitespace-only は「場所必要性なし」として indicator 出さない (GPT 補正核心)
  if (!locationText || !locationText.trim()) return false;
  // 非空かつ canonical でない → 未確定 (入力されたが Places API で確定されていない)
  return !isCanonicalLocationText(locationText);
}
