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

/**
 * 場所の種類（アンカー解決のための分類）
 *
 * - exact_proper_noun: 固有名（「サドヤ」「叙々苑」）— Web検索 → Places確認
 * - chain_brand: チェーン店（「マック」「スタバ」）— Places Nearby/Text Search
 * - generic_place: 一般名詞（「図書館」「カフェ」「公園」）— Places Nearby + 位置情報
 * - known_base: 既知の拠点（「自宅」「オフィス」）— プロフィールから解決済み
 */
export type PlaceType = "exact_proper_noun" | "chain_brand" | "generic_place" | "known_base";

/** 場所解決の確信度（分類 placeType とは独立） */
export type ResolutionConfidence = "high" | "medium" | "low" | "unresolved";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TimeConstraint — 時間意味論
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザー発話から拾った時刻が「何の時刻か」を区別する。
 *
 * CEO方針: startTime 一枚では足りない。
 * 「8時に家を出る」と「8時から仕事」は意味が違う。
 */
export type TimeConstraintType =
  | "fixed_departure"    // 「8時に家を出る」→ 出発時刻
  | "fixed_start"        // 「14時から打ち合わせ」→ 活動開始時刻
  | "fixed_arrival"      // 「18時までに帰宅」→ 到着時刻
  | "window_morning"     // 「朝」→ 06:00-11:59
  | "window_noon"        // 「昼」→ 11:00-13:59
  | "window_afternoon"   // 「午後」→ 13:00-17:59
  | "window_evening"     // 「夕方」→ 17:00-20:59
  | "window_night"       // 「夜」→ 20:00-23:59
  | "none";              // 時間制約なし

export interface TimeConstraint {
  type: TimeConstraintType;
  /** 固定時刻（fixed_* の場合）: "HH:MM" */
  fixedTime?: string;
  /** ウィンドウの最早開始: "HH:MM" */
  windowStart?: string;
  /** ウィンドウの最遅開始: "HH:MM" */
  windowEnd?: string;
}

/** 時間帯ウィンドウの定義（分） */
export const TIME_WINDOWS: Record<string, { start: number; end: number }> = {
  window_morning:   { start: 6 * 60,  end: 12 * 60 - 1 },
  window_noon:      { start: 11 * 60, end: 14 * 60 - 1 },
  window_afternoon: { start: 13 * 60, end: 18 * 60 - 1 },
  window_evening:   { start: 17 * 60, end: 21 * 60 - 1 },
  window_night:     { start: 20 * 60, end: 24 * 60 - 1 },
};

export interface PlanSegment {
  /** 安定したID（ターンをまたいでも変わらない） */
  id: string;
  /** 表示順序 */
  order: number;

  // ── When ──
  /** 時間帯ヒント（レガシー互換。新規は timeConstraint を使う） */
  timeHint?: TimeHint;
  /** 開始時刻（指定された場合）: "HH:MM"（レガシー互換。新規は timeConstraint.fixedTime を使う） */
  startTime?: string;
  /** 時間制約の意味論（CEO方針: 時刻が何を意味するか） */
  timeConstraint?: TimeConstraint;

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
  /** 場所の種類（アンカー解決用） */
  placeType?: PlaceType;
  /**
   * 場所解決の確信度。placeType とは独立。
   *
   * - high: 固有名で候補1件、文脈と整合 → 黙って採用
   * - medium: 候補複数だが1件が優勢 → 「〇〇であってる？」
   * - low: 曖昧、候補拮抗、現在地不明 → 確認必須
   * - unresolved: まだ解決を試みていない
   *
   * GPT指摘: 「分類と確信度は別物」— placeType=exact_proper_noun でも confidence=low はあり得る
   */
  resolutionConfidence?: ResolutionConfidence;
  /** 解決済みの正式名称（Web検索/Places API で取得） */
  resolvedPlaceName?: string;
  /** 解決済みの住所 */
  resolvedAddress?: string;
  /** Google Place ID（Phase B 以降で使用） */
  resolvedPlaceId?: string;
  /** 解決済みの緯度（Phase C: Routes API で移動時間計算に使用） */
  resolvedLat?: number;
  /** 解決済みの経度（Phase C: Routes API で移動時間計算に使用） */
  resolvedLng?: number;

  // ── Anchor ──
  /**
   * アンカースコア（拘束力）。高いほど先に場所解決される。
   *
   * 計算: explicit_time(+3) + named_place(+2/+1/+0) + companion(+1) + opening_hours(+1)
   * Hard anchor: >= 4 / Semi-hard: 2-3 / Soft: 0-1
   */
  anchorScore?: number;

  /**
   * 場所探索の依頼（CEO方針 2026-04-17 Block 1 (a) 安全弁 + Block 2 (c) で使用）。
   *
   * ユーザーが「サドヤ近くのカフェないかな？」と疑問形で言った場合、place は null に
   * 置き、ここに探索条件を保持する。後段の gapFillEngine / placeResolver が anchor
   * 近傍を Places API で検索し候補を生成する。
   */
  placeSearchHint?: {
    /** 近傍探索の基準となる anchor ラベル（ユーザー発話） */
    nearAnchorLabel?: string;
    /** 探索カテゴリ（「カフェ」「レストラン」「バー」等） */
    searchCategory?: string;
    /** 元の疑問文（デバッグ / ログ用） */
    originalQuery?: string;
    /**
     * 半径オーバーライド（メートル）。
     *
     * GPT追加ルール 2026-04-17 UI side:
     *   候補 0 件時にユーザーが「広げる」と応えた場合、次回検索の半径を
     *   ここに書き込む。placeResolver.resolveNearAnchorPlaces は
     *   radiusOverrideM が設定されていればカテゴリデフォルトではなくこちらを使う。
     */
    radiusOverrideM?: number;
  };

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

  /**
   * CEO方針 2026-04-18 Bug 6+1: セッション内で確定した「今日の起点」。
   *
   * 目的: startPoint はターンごとに消える可能性があるが、
   * 一度「ホテルから出発」などで起点が確定したらセッション中は保持したい。
   * resolveOrigin は baseline home より優先する（=「今日の起点」として尊重）。
   *
   * 優先順位 (locationResolver.resolveOrigin):
   *   1. explicit startPoint（現ターンで明示）
   *   2. currentLocation（GPS / 近傍推定 — 未実装プレースホルダ）
   *   3. todayOrigin（このフィールド）
   *   4. baseline home（savedBase の prefecture/city）
   *
   * 書き込みタイミング: startPoint が座標付きで解決された時にスナップショット
   * （将来実装）。現状は手動設定可能な受け皿として追加。
   */
  todayOrigin?: {
    label: string;
    coords?: { lat: number; lng: number };
    source: "user_declared" | "inferred_from_segment";
  };

  /**
   * CEO方針 2026-04-18 Bug 6+1: 現在地（GPS or 近傍セグメント推定）。
   *
   * 目的: baseline home を「常時そこにいる」と誤解しない。
   * 例: 自宅住所は甲府でも、今朝ホテルから出発する場合は currentLocation が優先される。
   *
   * 現時点で GPS 未接続のため、将来拡張用のプレースホルダとして追加。
   * 手動テスト / future GPS hook 経由で populate される想定。
   */
  currentLocation?: {
    label: string;
    coords?: { lat: number; lng: number };
    source: "gps" | "recent_segment";
  };

  /** 出発時刻 "HH:MM" — 「8時に家を出る」等のプラン起点アンカー */
  departureTime?: string;
  /** 出発時刻の制約（固定出発/ウィンドウ等の意味情報） */
  departureTimeConstraint?: TimeConstraint;
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
  /**
   * 時刻の意味タイプ（CEO方針: 出発/開始/到着/時間帯を区別）
   *
   * - "fixed_departure": 「8時に家を出る」→ 出発時刻
   * - "fixed_start": 「14時から打ち合わせ」→ 活動開始時刻
   * - "fixed_arrival": 「18時までに帰宅」→ 到着時刻
   * - "window_morning" | "window_noon" | "window_afternoon" | "window_evening" | "window_night"
   * - null: 時間言及なし
   */
  timeType?: string | null;
  activity: string;
  place?: string | null;
  /**
   * 場所の種類（LLM が判定）
   *
   * - "exact_proper_noun": 固有名（「サドヤ」「叙々苑」「アトレ恵比寿」）
   * - "chain_brand": チェーン店（「マック」「スタバ」「ドトール」「コメダ」）
   * - "generic_place": 一般名詞（「図書館」「カフェ」「公園」「駅前の店」）
   * - "known_base": 既知拠点（「自宅」「家」「オフィス」「会社」）
   * - null: 場所言及なし
   */
  placeType?: string | null;
  companions?: string[];
  transport?: string | null;
}

export interface LLMExtractResult {
  targetDate: "today" | "tomorrow" | "day_after_tomorrow" | string;
  segments: LLMRawSegment[];
  endTime?: string | null;
  endAction?: string | null;
  /** 終了時刻の意味タイプ: "fixed_arrival" 等 */
  endTimeType?: string | null;
  transport?: string | null;
  goOut?: boolean | null;
  startPlace?: string | null;
  /**
   * プラン全体の出発時刻 "HH:MM"。
   * 「8時に家を出る」→ "08:00"
   * セグメントではなくプランの起点アンカー。
   */
  departureTime?: string | null;
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
          timeType: { type: ["string", "null"], description: "時刻の意味: fixed_departure(出発時刻) | fixed_start(活動開始時刻) | fixed_arrival(到着時刻) | window_morning | window_noon | window_afternoon | window_evening | window_night | null(時間言及なし)" },
          activity: { type: "string" },
          place: { type: ["string", "null"] },
          placeType: { type: ["string", "null"], description: "場所の種類: exact_proper_noun(固有名:サドヤ,叙々苑) | chain_brand(チェーン:マック,スタバ) | generic_place(一般名詞:図書館,カフェ) | known_base(自宅,オフィス) | null(場所なし)" },
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
    departureTime: { type: ["string", "null"], description: "出発時刻 HH:MM。「8時に家を出る」→ 08:00。セグメントではなくプラン全体の出発アンカー" },
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
          field: { type: "string", description: "place | activity | companions | startTime | transport | endTime | targetDate | departureTime | goOut | segment" },
          newValue: { description: "新しい値（文字列 or 文字列配列 or null）" },
          newSegment: {
            type: ["object", "null"],
            properties: {
              order: { type: "number" },
              timeHint: { type: ["string", "null"] },
              startTime: { type: ["string", "null"] },
              timeType: { type: ["string", "null"], description: "fixed_departure | fixed_start | fixed_arrival | window_* | null" },
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
