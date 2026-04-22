/**
 * MapPin / MapRenderData — PR-13 Map UI 型予約
 *
 * 位置づけ:
 *   CEO 最終ビジョン「全ての予定を map にピン」の描画層に渡す型。
 *   commit 13 では型定義のみ、実装は PR-13。
 *
 * 設計書:
 *   - docs/alter-morning-pr10-14-interface-reservation.md §4
 *
 * 型整合:
 *   - coordinates: search/normalizedPlace.ts の GeoCoordinates と同一形状。
 *     循環参照を避けるため import せず互換な inline 定義にする（構造的等価）。
 *   - TransportMode は transport/types.ts から import（polyline 描画用）。
 *
 * 凍結規則:
 *   - 本 file に関数・class を追加してはいけない（PR-13 本体で追加）
 *   - 型定義のみ
 */

import type { TransportMode } from "../transport/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Visual style — pin のカラー / アイコン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type MapPinIconKind =
  | "work"
  | "meal"
  | "leisure"
  | "move"
  | "meeting"
  | "other";

export interface MapPinVisualStyle {
  /** Zone color system 準拠の hex or token */
  color: string;
  iconKind: MapPinIconKind;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapPin
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MapPin {
  /** 対応する event */
  eventId: string;
  /** 座標（PR-9 で埋まったもの） */
  coordinates: { lat: number; lng: number };
  /** 表示ラベル（時刻 + 活動の短縮） */
  label: string;
  /** 時系列順序（1 始まり、sequenceIndex と同じ） */
  ordinal: number;
  /** 色 / アイコン */
  visualStyle: MapPinVisualStyle;
  /** confirmationState（PR-8 rev 1 由来、暫定 pin は薄く描画する） */
  confirmationState: "confirmed" | "provisional" | "needs_answer";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapRenderData
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MapPolyline {
  fromPinOrdinal: number;
  toPinOrdinal: number;
  mode: TransportMode;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapRenderData {
  pins: MapPin[];
  /** PR-10 の transport segment を map 上に線で描画するためのデータ */
  polylines: MapPolyline[];
  /** 地図の初期 view（全 pin が入る bbox） */
  initialBounds: MapBounds;
}
