/**
 * NormalizedPlaceCandidate — PR-9 Places Search 型予約
 *
 * 位置づけ:
 *   PR-9 で Places API から返される候補を UI / selection handler に渡すための
 *   正規化型。commit 13 では型宣言のみ landing、関数・class は export しない。
 *   実装は PR-9 merge 時。
 *
 * 設計書:
 *   - docs/alter-morning-pr9-places-search-design.md §3.1
 *
 * 後続 PR との握り:
 *   - coordinates: { lat; lng } は PR-13 MapPin.coordinates と **同一構造**
 *   - placeId は Google Places API の place_id（provider 依存、cache key）
 *   - ユーザー選択時に event.where.coordinates にコピーされ、ここから map 描画が可能になる
 *
 * 凍結規則:
 *   - 本 file に **関数・class を追加してはいけない**（PR-9 本体で追加）
 *   - 型定義のみ。interface / type のみ export 可。
 *   - 型変更は docs/alter-morning-pr10-14-interface-reservation.md §7 に準拠
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 座標（PR-13 MapPin.coordinates と共有する最小構造）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Places provider 抽象
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * provider 識別子。将来 Google 以外にも対応する可能性があるため union で開ける。
 * PR-9 本体では "google_places" のみ実装。
 */
export type PlacesProvider = "google_places";

export interface PlacesRawRef {
  provider: PlacesProvider;
  /** provider の place_id（Google: Places API place_id） */
  placeId: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NormalizedPlaceCandidate — PR-9 本体型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface NormalizedPlaceCandidate {
  /** provider の place_id（cache key / 重複排除キー） */
  placeId: string;
  /** 表示名（「スターバックス甲府駅前店」等） */
  displayName: string;
  /** 住所（市区町村以下） */
  address: string;
  /** 座標（必須、これが map pin の本体） */
  coordinates: GeoCoordinates;
  /** anchor 中心からの距離（m、表示ソート用）。anchor 由来なしの場合 null */
  distanceFromAnchor: number | null;
  /** カテゴリ（Places API types から正規化）。取得不能時 null */
  category: string | null;
  /** chain 所属（検出できた場合のみ）。detail §2 chainBrandDict と連動 */
  chainToken: string | null;
  /** Places API 生データへの参照（debug / 追加情報取得用） */
  rawRef: PlacesRawRef;
}
