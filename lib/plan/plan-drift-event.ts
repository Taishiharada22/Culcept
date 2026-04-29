/**
 * PlanDriftEvent — ズレの観測
 *
 * passive / inferred / explicit の 3 種で本人モデル更新機会を記録する。
 * Wave 1 では記録のみ、学習は行わない。
 *
 *   Wave 1: passive drift logging（編集 / 削除 / 時間変更 / 完了 / 延期 / 置換 / 場所変更）
 *   Wave 2: inferred drift logging（会話・行動からの推定）
 *   Wave 3: explicit drift logging（チェックイン UI）
 *   Wave 4: 反復検出 + evidenceStrength 動的昇格 + Drift Learning（A/E/D 軸）
 *
 * polymorphic target を採用するため、DB レベルの完全な FK は張れない。
 * 代わりに：
 *   - API 層で target_type ごとの存在確認
 *   - targetSnapshot に対象主要 field をコピー保存
 *   - 元対象（Anchor 等）が削除されても drift 意味は保持される
 *
 * 設計書: docs/alter-plan-foundation-design.md §2.3
 *
 * Wave 1: 型定義のみ（W1-1）。
 *   - migration は W1-5。
 *   - passive logging hook 実装は W1-6。
 */

import type { LocationCategory } from "./location-category";
import type { ActionShape } from "../stargazer/alterHomeAdapter";

/**
 * Drift の対象（多態）
 *
 * Wave 1 開始時点では DraftPlan item / OutfitCalendarItem 由来は出現しない。
 * 最初は target = "external_anchor" の編集が主。
 */
export type PlanDriftTarget =
  | { targetType: "external_anchor"; externalAnchorId: string }
  | { targetType: "plan_seed"; planSeedId: string }
  | { targetType: "draft_plan_item"; draftPlanItemId: string }
  | { targetType: "outfit_calendar_item"; outfitCalendarItemId: string };

/** どんなズレか */
export type PlanDriftType =
  | "time_changed"
  | "location_changed"
  | "deleted"
  | "delayed"
  | "completed"
  | "skipped"
  | "replaced";

/** Drift をどう取得したか */
export type PlanDriftEvidenceSource =
  | "passive"    // 編集・削除等の自然操作から
  | "inferred"   // 会話・行動からの推定
  | "explicit";  // チェックイン UI 等のユーザー明示操作

/**
 * 証拠の強さ
 *
 * passive 単発は weak、同 patternKey が短期間に反復されると medium → strong に昇格。
 * 具体的な反復関数は Wave 4 で確定する。本設計では方向性のみ：
 *   - 1 回の編集（単発） → weak
 *   - 短期間に 3 回連続同パターン → medium
 *   - 7 回以上反復 → strong
 */
export type PlanDriftEvidenceStrength = "weak" | "medium" | "strong";

/** Drift 時点の予測値（DraftPlan 由来 / Anchor 由来） */
export interface PlanDriftPredicted {
  startTime?: string;
  endTime?: string;
  locationCategory?: LocationCategory;
  actionShape?: ActionShape;
  intensity?: number;
}

/** Drift 時点の実測値（ユーザー操作・観測由来） */
export interface PlanDriftActual {
  startTime?: string;
  endTime?: string;
  locationCategory?: LocationCategory;
  completed?: boolean;
  skippedReason?: string;
  intensityFelt?: number;
}

/**
 * 元対象が削除されても drift event の意味を保つためのスナップショット。
 * polymorphic target の整合性確保（§2.3 参照）。
 */
export interface PlanDriftTargetSnapshot {
  title?: string;
  startTime?: string;
  endTime?: string;
  locationText?: string;
  /** 元 entity の type 概要（"recurring_anchor" / "manual_seed" 等） */
  sourceKind?: string;
}

export interface PlanDriftEvent {
  id: string;
  userId: string;

  /** 対象の多態的識別（必須） */
  target: PlanDriftTarget;

  driftType: PlanDriftType;

  predicted?: PlanDriftPredicted;
  actual?: PlanDriftActual;

  evidenceSource: PlanDriftEvidenceSource;
  evidenceStrength: PlanDriftEvidenceStrength;

  /** 反復検出のための集計キー */
  patternKey?: string;

  /** 同 patternKey の累積回数 */
  repetitionCount?: number;

  /** 反復の時間窓（日数） */
  timeWindowDays?: number;

  /** 元対象削除耐性のためのスナップショット */
  targetSnapshot?: PlanDriftTargetSnapshot;

  createdAt: string;
}
