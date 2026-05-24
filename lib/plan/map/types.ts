/**
 * Phase 3-N Map impl sub-phase 9a-pre — Pure type 定義
 *
 * 設計原則 (= Map spec audit v3 + readiness v2):
 *   - pure type のみ (= LLM / API / DB / network 不使用)
 *   - 既存 ExternalAnchor data model から transform する view model
 *   - List `lib/plan/list/types.ts` (= EventCategory) を共通 token として参照
 *   - Map 固有: MapPinViewModel + MapSheetViewModel + MapRouteSegmentViewModel
 *
 * 設計書:
 *   - docs/alter-plan-map-redesign-spec-audit.md v3 (= §4 Pin / §9 Sheet / §5 Route)
 *   - docs/alter-plan-map-redesign-impl-readiness.md v2
 *   - lib/plan/list/types.ts (= EventCategory 共通)
 */

import { type EventCategory } from "@/lib/plan/list/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapPinViewModel (= spec v3 §4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 緯度経度 coordinates (= Map 固有、 List には不要だった)
 */
export type MapCoordinates = {
  readonly lat: number;
  readonly lng: number;
};

/**
 * Map pin 表示 view model (= spec v3 §4)
 *
 * 涙型 pin + semantic color + 白抜き SVG icon を表現するための最小構造。
 * provenance / source semantics は Map では pin 上に出さない (= spec §4 + readiness §2.1)
 * → MapPinViewModel に source / authority は含めない (= sheet で扱う)
 */
export type MapPinViewModel = {
  /** anchor id (= ExternalAnchor.id 流用、 sheet 同期 key) */
  readonly id: string;
  /** category (= semantic color + icon mapping)、 List EventCategory を共通参照 */
  readonly category: EventCategory;
  /** 緯度経度 (= 必須、 pin は地理的に bind される) */
  readonly coordinates: MapCoordinates;
  /** 選択時 ラベル用 title (= 最大 8 文字、 ellipsis は表示側で適用) */
  readonly title: string;
  /** 選択時 ラベル用 time (= HH:MM、 spec v3 §6.1) */
  readonly time: string;
  /** 順序 (= 1, 2, 3...、 spec v3 §5 「番号は副、 線が主」 で控えめに表示) */
  readonly order: number;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapRouteSegmentViewModel (= spec v3 §5)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Route の 1 区間 (= pin A → pin B の抽象線)
 *
 * spec v3 §5 + readiness §2.3.4 採用方向:
 *   - 細い中立色 破線 (= gray、 dashed)
 *   - 流れの可視化、 ナビ精度主張禁止
 *   - 距離 / 交通手段 / 所要時間 を含めない (= 型上から除外)
 */
export type MapRouteSegmentViewModel = {
  /** 開始 pin id */
  readonly fromPinId: string;
  /** 終了 pin id */
  readonly toPinId: string;
  /** 開始座標 */
  readonly from: MapCoordinates;
  /** 終了座標 */
  readonly to: MapCoordinates;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MapSheetViewModel (= spec v3 §9 bottom sheet)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Bottom sheet 内容 (= spec v3 §9 4 段構造)
 *
 * pin と sheet は selected で同期 (= readiness §2.1.6)。
 * sheet は Map 完成度の中心、 List EventCard 相当の情報密度を集約。
 */
export type MapSheetViewModel = {
  /** 対応 pin id (= 同期 key) */
  readonly pinId: string;
  /** category (= 大 icon 用、 pin と同) */
  readonly category: EventCategory;
  /** 時刻 range (= HH:MM-HH:MM、 endTime 未確定なら startTime のみ) */
  readonly timeRange: string;
  /** title (= 黒 + 太、 sheet 最重要) */
  readonly title: string;
  /** location 表示文字列 (= 「📍」 等の絵文字は表示側で禁止、 専用 SVG icon 使用) */
  readonly location?: string;
  /** meaning text (= sheet 内 ✨ + 1-2 行 自然な日本語、 List CategoryMeaning getNarrative 再利用候補) */
  readonly meaningText?: string;
  /** image url (= optional、 truth ない時 undefined、 表示側で fake 禁止) */
  readonly imageUrl?: string;
};
