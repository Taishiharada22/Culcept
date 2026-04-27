/**
 * 共有メモリ項目 mock (L1-h)
 *
 * 正本: UI spec §8.3 由来×確定度×可視性 3 軸 / §8.3.4 有効組み合わせ制約
 *       Core UX v1.1 §10 共有メモリとモード別文脈管理
 *
 * §8.3.1 3 軸の独立定義:
 *   - 由来 (source): explicit_shared / inferred / transient_summary
 *   - 確定度 (confidence): high / medium / low
 *   - 可視性 (visibility): both_visible / user_a_only / user_b_only / internal_only
 *
 * §8.3.4 禁止組み合わせ:
 *   - inferred × high × both_visible (明示共有経由なし)
 *   - transient_summary × high × both_visible
 *   - transient_summary × medium/high × both_visible (二段階確認経由なし)
 *
 * 本 mock は禁止組み合わせを含まない。preview の MemoryItemCard で 3 軸が
 * 独立して見えることを示す。
 *
 * NOTE: layout plan §4.8 は「由来 6 種」と記載するが、UI spec §8.3.1 は
 * 3 種を正本として固定しているため、本 mock では 3 種に揃える。
 */

export type MemorySource = "explicit_shared" | "inferred" | "transient_summary";
export type MemoryConfidence = "high" | "medium" | "low";
export type MemoryVisibility =
  | "both_visible"
  | "user_a_only"
  | "user_b_only"
  | "internal_only";

export interface MemoryItem {
  id: string;
  /** 項目本文（mock） */
  body: string;
  source: MemorySource;
  confidence: MemoryConfidence;
  visibility: MemoryVisibility;
  /** 検出 / 共有日時 (mock) */
  recordedAt: string;
  /** transient_summary 用の自動消滅時刻 (mock) */
  expiresAt?: string;
}

export const SOURCE_LABELS: Record<MemorySource, string> = {
  explicit_shared: "明示共有",
  inferred: "CoAlter 推定",
  transient_summary: "直近会話の要約",
};

export const CONFIDENCE_LABELS: Record<MemoryConfidence, string> = {
  high: "確定済",
  medium: "確認 1 回",
  low: "初回推定",
};

export const VISIBILITY_LABELS: Record<MemoryVisibility, string> = {
  both_visible: "両者に見えています",
  user_a_only: "あなた (たいし) だけに見えています",
  user_b_only: "あなた (みさき) だけに見えています",
  internal_only: "CoAlter 内部のみ (両者非表示)",
};

/** §8.3.2 由来は形 (アイコン)、色は使わない */
export const SOURCE_GLYPHS: Record<MemorySource, string> = {
  explicit_shared: "◇", // diamond — 双方共有の象徴
  inferred: "◯", // circle — 推定の柔らかさ
  transient_summary: "△", // triangle — 一時性の鋭さ
};

/**
 * Mock items: 3 軸の独立組み合わせを網羅 (§8.3.4 禁止組合せを除く)
 */
export const MEMORY_ITEMS: ReadonlyArray<MemoryItem> = [
  // 典型的に共起 (§8.3.1 相関例 1)
  {
    id: "m01",
    body: "週末は家でゆっくり過ごしたい (両者で確認済)",
    source: "explicit_shared",
    confidence: "high",
    visibility: "both_visible",
    recordedAt: "2026-04-20",
  },
  // explicit + medium + both
  {
    id: "m02",
    body: "夕食は外食より家のほうが好み傾向",
    source: "explicit_shared",
    confidence: "medium",
    visibility: "both_visible",
    recordedAt: "2026-04-22",
  },
  // inferred + low + internal_only (§8.3.1 相関例 2)
  {
    id: "m03",
    body: "朝の会話量が少ない日は、たいしさんが疲れている可能性",
    source: "inferred",
    confidence: "low",
    visibility: "internal_only",
    recordedAt: "2026-04-25",
  },
  // inferred + medium + user_a_only (片側可視)
  {
    id: "m04",
    body: "計画を細かく立てる傾向 (たいしさん側で観測)",
    source: "inferred",
    confidence: "medium",
    visibility: "user_a_only",
    recordedAt: "2026-04-23",
  },
  // inferred + low + user_b_only (片側可視、推定弱)
  {
    id: "m05",
    body: "現地で動きを決める方が落ち着く (みさきさん側で観測)",
    source: "inferred",
    confidence: "low",
    visibility: "user_b_only",
    recordedAt: "2026-04-24",
  },
  // transient_summary + medium + both_visible (§8.3.1 相関例 3、時間経過で消滅)
  {
    id: "m06",
    body: "今朝の会話: 旅行先の意見にやや温度差あり",
    source: "transient_summary",
    confidence: "medium",
    visibility: "both_visible",
    recordedAt: "2026-04-27 朝",
    expiresAt: "2026-04-27 夜",
  },
  // transient_summary + low + internal_only
  {
    id: "m07",
    body: "昨日のチップ tap 履歴: 『近い』が 3 回連続",
    source: "transient_summary",
    confidence: "low",
    visibility: "internal_only",
    recordedAt: "2026-04-26",
    expiresAt: "2026-04-28",
  },
  // explicit + high + user_a_only (片側のみ明示共有)
  {
    id: "m08",
    body: "仕事の状況については CoAlter にだけ話す",
    source: "explicit_shared",
    confidence: "high",
    visibility: "user_a_only",
    recordedAt: "2026-04-15",
  },
];

/**
 * §8.3.4 禁止組み合わせ列挙 (UI で生成されないことを保証する test 用)
 *
 * preview の MemoryItemCard でこれらが描画されないことが §8.3.4 の構造的
 * enforce となる。
 */
export const FORBIDDEN_COMBINATIONS: ReadonlyArray<{
  source: MemorySource;
  confidence: MemoryConfidence;
  visibility: MemoryVisibility;
  reason: string;
}> = [
  {
    source: "inferred",
    confidence: "high",
    visibility: "both_visible",
    reason: "CoAlter の推定が両者の共有事実に見える",
  },
  {
    source: "transient_summary",
    confidence: "high",
    visibility: "both_visible",
    reason: "一時要約が永続的な共有事実に見える",
  },
  {
    source: "transient_summary",
    confidence: "medium",
    visibility: "both_visible",
    reason: "二段階確認経由なしで両者可視は禁止",
  },
];

export function isForbiddenCombination(
  src: MemorySource,
  conf: MemoryConfidence,
  vis: MemoryVisibility,
): boolean {
  return FORBIDDEN_COMBINATIONS.some(
    (f) => f.source === src && f.confidence === conf && f.visibility === vis,
  );
}
