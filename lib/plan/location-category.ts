/**
 * LocationCategory — 場所カテゴリ
 *
 * Plan / DriftEvent / Anchor で共有される場所分類。
 * 設計書: docs/alter-plan-foundation-design.md §2.1, §2.3
 *
 * Wave 1: 型定義のみ（W1-1）。実装ロジックは後続 commit で追加する。
 */

export type LocationCategory =
  | "home"
  | "office"
  | "school"
  | "cafe"
  | "outdoor"
  | "public"
  | "transit"
  | "unknown";
