/**
 * PlanState — v2 Morning Protocol のスロットベース状態管理
 *
 * 設計思想:
 * - テキスト配列ではなく、型付きスロット（PlanSegment）で状態を持つ
 * - 各セグメントが When/What/Where/Who を一体で保持
 * - targetDate が first-class フィールド（ハードコード「今日」を根絶）
 * - 正規化テキストと生テキストを分離
 *
 * 参照: docs/morning-protocol-v2-design.md
 */

import type { TransportMode } from "@/app/(culcept)/calendar/_lib/vcTypes";
import type { ActivityCategory } from "./activityVocabulary";
import type { PlaceCategory } from "./placeTable";
import type { EndpointType } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlanSegment — 1つの活動セグメント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TimeHint = "morning" | "noon" | "afternoon" | "evening";
export type SegmentStatus = "confirmed" | "tentative" | "needs_clarify";

export interface PlanSegment {
  /** 安定したID（ターンをまたいでも変わらない） */
  id: string;
  /** 表示順序 */
  order: number;

  // ── When ──
  /** 時間帯ヒント */
  timeHint?: TimeHint;
  /** 開始時刻（指定された場合）: "HH:MM" */
  startTime?: string;

  // ── What ──
  /** ユーザーが言った活動名 */
  activity: string;
  /** 正規化された活動名（activityVocabulary 由来） */
  activityCanonical?: string;
  /** 活動カテゴリ */
  activityCategory?: ActivityCategory;
  /** 推定所要時間（分） */
  estimatedDurationMin?: number;

  // ── Where ──
  /** ユーザーが言った場所名 */
  place?: string;
  /** 正規化された場所名（placeTable 由来） */
  placeCanonical?: string;
  /** 場所カテゴリ */
  placeCategory?: PlaceCategory;

  // ── Who ──
  /** 同行者 */
  companions: string[];

  // ── How ──
  /** このセグメント固有の移動手段 */
  transport?: TransportMode;

  /** セグメントのステータス */
  status: SegmentStatus;
  /** 備考 */
  notes?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlanState — プランの正規状態 (Single Source of Truth)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type PlanStatus = "collecting" | "clarifying" | "confirmed";

export interface PlanState {
  /** 対象日: YYYY-MM-DD */
  targetDate: string;
  /** 対象日の自然言語ラベル: "明日" | "今日" | "明後日" 等 */
  targetDateLabel: string;
  /** タイムゾーン */
  timezone: string;

  /** 時間軸に沿ったセグメント列 */
  segments: PlanSegment[];

  /** グローバル移動手段（個別指定がなければこれを使う） */
  transport?: TransportMode;
  /** 終了時刻 */
  endTime?: string;
  /** 終了アクション: "帰宅" 等 */
  endAction?: string;
  /** 終点タイプ */
  endpointType?: EndpointType;
  /** 出発地点 */
  startPoint?: string;
  /** 外出するか */
  goOut?: boolean;

  /** プラン全体のステータス */
  status: PlanStatus;
  /** 不足フィールドのリスト */
  missingFields: string[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlanDelta — Turn 2+ の差分操作
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type DeltaTurnType =
  | "correction"       // 既存情報の修正
  | "addition"         // 新しい予定の追加
  | "deletion"         // 既存予定の削除
  | "clarify_response"; // 質問への回答

export type DeltaChangeType = "set" | "replace" | "remove" | "add_segment" | "remove_segment";

export interface DeltaChange {
  type: DeltaChangeType;
  /** 対象セグメントのID（グローバル変更の場合 null） */
  segmentId: string | null;
  /** LLM が提供するヒント（コードがセグメントIDに解決） */
  targetSegmentHint?: string;
  /** 変更対象フィールド */
  field: string;
  /** 新しい値 */
  newValue?: string | string[] | null;
  /** 追加セグメント（add_segment 時） */
  newSegment?: LLMRawSegment;
}

export interface PlanDelta {
  turnType: DeltaTurnType;
  changes: DeltaChange[];
  /** 変更内容の自然な1文要約（コードで決定論的に生成） */
  confirmSummary: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM 生出力の型（バリデーション前）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface LLMRawSegment {
  order: number;
  timeHint?: string | null;
  startTime?: string | null;
  activity: string;
  place?: string | null;
  companions?: string[];
  transport?: string | null;
}

export interface LLMExtractResult {
  targetDate: "today" | "tomorrow" | "day_after_tomorrow" | string;
  segments: LLMRawSegment[];
  endTime?: string | null;
  endAction?: string | null;
  transport?: string | null;
  goOut?: boolean | null;
  startPlace?: string | null;
}

export interface LLMDeltaResult {
  turnType: string;
  changes: Array<{
    type: string;
    targetSegmentHint?: string | null;
    field: string;
    newValue?: string | string[] | null;
    newSegment?: LLMRawSegment | null;
  }>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JSON Schema for LLM structured output
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const LLM_EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    targetDate: { type: "string", description: "today | tomorrow | day_after_tomorrow" },
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          order: { type: "number" },
          timeHint: { type: ["string", "null"], description: "morning | noon | afternoon | evening | null" },
          startTime: { type: ["string", "null"], description: "HH:MM format or null" },
          activity: { type: "string" },
          place: { type: ["string", "null"] },
          companions: { type: "array", items: { type: "string" } },
          transport: { type: ["string", "null"] },
        },
        required: ["order", "activity"],
      },
    },
    endTime: { type: ["string", "null"] },
    endAction: { type: ["string", "null"] },
    transport: { type: ["string", "null"] },
    goOut: { type: ["boolean", "null"] },
    startPlace: { type: ["string", "null"], description: "出発地点: 自宅 | ホテル | 実家 | 会社 等" },
  },
  required: ["targetDate", "segments"],
} as const;

export const LLM_DELTA_SCHEMA = {
  type: "object",
  properties: {
    turnType: { type: "string", description: "correction | addition | deletion | clarify_response" },
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", description: "set | replace | remove | add_segment | remove_segment" },
          targetSegmentHint: { type: ["string", "null"], description: "自然言語での対象セグメントのヒント（例: 'ランチ', '午後の打ち合わせ'）" },
          field: { type: "string", description: "place | activity | companions | startTime | transport | endTime | segment" },
          newValue: { description: "新しい値（文字列 or 文字列配列 or null）" },
          newSegment: {
            type: ["object", "null"],
            properties: {
              order: { type: "number" },
              timeHint: { type: ["string", "null"] },
              startTime: { type: ["string", "null"] },
              activity: { type: "string" },
              place: { type: ["string", "null"] },
              companions: { type: "array", items: { type: "string" } },
              transport: { type: ["string", "null"] },
            },
          },
        },
        required: ["type", "field"],
      },
    },
  },
  required: ["turnType", "changes"],
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Utility: Segment ID 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let _segCounter = 0;

export function generateSegmentId(): string {
  _segCounter += 1;
  return `seg_${_segCounter}`;
}

/** テスト用: カウンターをリセット */
export function resetSegmentCounter(): void {
  _segCounter = 0;
}
