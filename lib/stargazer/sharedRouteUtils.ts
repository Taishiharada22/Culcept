/**
 * lib/stargazer/sharedRouteUtils.ts
 *
 * v4 API routes 共通ユーティリティ。
 * mergeAxisScores / todayJST / observationDepth / buildAxisScores を
 * 1 箇所に集約し、全ルートが同じロジックを使うことを保証する。
 */

import {
  createEmptyAxisScores,
  TRAIT_AXES,
  type TraitAxisKey,
} from "@/lib/stargazer/traitAxes";

// ─── 軸スコアのマージ ───────────────────────────────

/**
 * target の軸スコアに source の値を上書きマージする。
 * source は Supabase から取得した jsonb カラム（型不明）を想定。
 * 値は必ず [-1, 1] にクランプする。
 */
export function mergeAxisScores(
  target: Record<TraitAxisKey, number>,
  source: unknown,
): void {
  if (!source || typeof source !== "object") return;

  const record = source as Record<string, unknown>;
  for (const axis of TRAIT_AXES) {
    const rawValue = record[axis.id];
    const numericValue =
      typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (Number.isFinite(numericValue)) {
      target[axis.id] = Math.max(-1, Math.min(1, numericValue));
    }
  }
}

/**
 * profiles.dimensions + resolved_types.axis_scores をマージして
 * 統合軸スコアを返す便利関数。
 */
export function buildAxisScores(
  profileDimensions: unknown,
  resolvedAxisScores: unknown,
  /** ベータテスター用: true の場合 hasEvidence を強制的に true にする */
  forceEvidence?: boolean,
): { axisScores: Record<TraitAxisKey, number>; hasEvidence: boolean } {
  const axisScores = createEmptyAxisScores();
  mergeAxisScores(axisScores, profileDimensions);
  mergeAxisScores(axisScores, resolvedAxisScores);

  const hasEvidence = forceEvidence || Object.values(axisScores).some(
    (value) => Math.abs(value) > 0.001,
  );

  return { axisScores, hasEvidence };
}

// ─── 日付ヘルパー ──────────────────────────────────

/**
 * 今日の日付文字列を JST (UTC+9) で返す。
 * サーバー TZ に依存しない安全な実装。
 */
export function todayJST(): string {
  const now = new Date();
  const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const jst = new Date(jstMs);
  return jst.toISOString().slice(0, 10);
}

// ─── 観測深度 ─────────────────────────────────────

/**
 * observationDepth を統一計算する。
 * totalSessions は stargazer_profiles.total_sessions を渡す。
 * 戻り値: 0.0 ~ 1.0 （0 = 未観測、1 = 十分な観測）
 */
export function calcObservationDepth(totalSessions: number): number {
  return Math.min(1, Math.max(0, totalSessions) / 30);
}

// ─── 入力バリデーション ─────────────────────────────

/**
 * 数値が指定範囲に収まっているかを検証。
 */
export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 文字列を最大長で切り詰める。
 */
export function truncateString(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
