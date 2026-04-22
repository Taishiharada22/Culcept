/**
 * TransportSegment — PR-10 Transport Staircase 型予約
 *
 * 位置づけ:
 *   2 event 間の移動手段・経路情報を保持する segment 型。PR-10 本体では
 *   MorningPlan.items に `kind: "travel"` として挿入される（新 kind 追加しない）。
 *   commit 13 では型定義のみ。
 *
 * 設計書:
 *   - docs/alter-morning-pr10-14-interface-reservation.md §1
 *
 * 依存:
 *   - 入力: event.where.coordinates（PR-9 完了後に埋まる）
 *   - 出力: Transport segment として timeline / map polyline に使用
 *
 * 凍結規則:
 *   - 本 file に関数・class を追加してはいけない（PR-10 本体で追加）
 *   - 型定義のみ
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Transport mode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TransportMode =
  | "walk"
  | "car"
  | "public_transit"
  | "bicycle"
  | "taxi"
  | "unknown";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TransportSegment
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TransportSegment {
  /** この segment の前の event */
  fromEventId: string;
  /** この segment の後の event */
  toEventId: string;
  /** 移動手段（LLM 推論 or ユーザー明示 or default） */
  mode: TransportMode;
  /** 経路推定所要時間（分）。取得不能時 null */
  estimatedDurationMin: number | null;
  /** 距離（m、Routes API 由来 or 直線距離概算）。null 許容 */
  distanceM: number | null;
  /** 確定度 */
  confidence: "explicit_user" | "route_api" | "inferred" | "default";
  /** 推定ソース（analytics / debug） */
  source:
    | "user_utterance"
    | "routes_api"
    | "distance_heuristic"
    | "default_walk";
}
