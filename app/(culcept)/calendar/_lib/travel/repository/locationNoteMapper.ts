// app/(culcept)/calendar/_lib/travel/repository/locationNoteMapper.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-3A: location_notes DB 行（snake_case）→ LocationItem（UI型）変換（pure・read-only）。
//
// 方針（honesty）:
//   - null / missing は fail-soft（空配列・空文字・0・null）。捏造しない。
//   - 写真は photo_id join 結果が無ければ null（blank/placeholder）。捏造写真なし。
//   - rating/ratingCount は数値化（無ければ 0＝未評価。捏造しない）。
//   - contributor_type / source_type は表示メタ:
//       contributor_type(local/traveler/self) → LocationItem.source(local/traveler)。self は traveler 扱い。
//       source_type は LocationItem に対応フィールド無し＝surface しない（ランキング/feed 用メタ）。
//   - classification(classic/hidden/standard) は UI の 王道/穴場 振り分けにそのまま反映。
// ════════════════════════════════════════════════════════════════════════

import type {
  LocationAuthor,
  LocationClassification,
  LocationItem,
  LocationItemKind,
  LocationSource,
  PriceLevel,
} from "../types";
import { mapPhotoRow, type PhotoRow } from "./tripDayAssembler";

/** location_notes の SELECT * のうち mapper が使う列（snake_case）。 */
export interface LocationNoteRow {
  id: string;
  kind: string;
  prefecture: string | null;
  title: string | null;
  area_label: string | null;
  description: string | null;
  genre: string | null;
  hours: string | null;
  price_level: string | null;
  classification: string | null;
  contributor_type: string | null;
  source_type: string | null;
  author: unknown; // jsonb（LocationAuthor 期待・不正は fail-soft）
  theme_keys: string[] | null;
  tags: string[] | null;
  stops: string[] | null;
  match_reasons: string[] | null;
  rating: number | string | null;
  rating_count: number | null;
  duration_label: string | null;
  tagline: string | null;
  why_special: string | null;
  why_hidden: string | null;
  spot_count: number | null;
  match_pct: number | null;
  photo_id: string | null;
  status: string | null;
  moderation_status: string | null;
}

const PRICE_LEVELS: readonly string[] = ["¥", "¥¥", "¥¥¥", "¥¥¥¥"];

function strArray(v: string[] | null | undefined): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
}

function toNumber(v: number | string | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function mapKind(v: string | null): LocationItemKind {
  return v === "trip" ? "trip" : "spot";
}

function mapClassification(v: string | null): LocationClassification {
  return v === "classic" || v === "hidden" || v === "standard" ? v : "standard";
}

/** contributor_type → LocationSource（local/traveler）。self は traveler 視点として扱う。 */
export function mapContributorToSource(contributorType: string | null): LocationSource {
  return contributorType === "local" ? "local" : "traveler";
}

/** author jsonb を安全に LocationAuthor へ。不正/欠落は name 空（捏造しない）。 */
function parseAuthor(raw: unknown, fallbackSource: LocationSource): LocationAuthor {
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : "";
    const source: LocationSource = o.source === "local" || o.source === "traveler" ? o.source : fallbackSource;
    const author: LocationAuthor = { name, source };
    if (typeof o.roleLabel === "string") author.roleLabel = o.roleLabel;
    return author;
  }
  return { name: "", source: fallbackSource };
}

/**
 * DB 行 → LocationItem。photoById は事前取得した travel_photos の id→row Map。
 */
export function mapLocationNoteRow(
  row: LocationNoteRow,
  photoById: Map<string, PhotoRow>
): LocationItem {
  const source = mapContributorToSource(row.contributor_type);
  const item: LocationItem = {
    id: row.id,
    kind: mapKind(row.kind),
    prefecture: row.prefecture ?? "",
    title: row.title ?? "",
    areaLabel: row.area_label ?? "",
    classification: mapClassification(row.classification),
    source,
    author: parseAuthor(row.author, source),
    genre: row.genre ?? "",
    themeKeys: strArray(row.theme_keys),
    tags: strArray(row.tags),
    rating: toNumber(row.rating),
    ratingCount: toNumber(row.rating_count),
    description: row.description ?? "",
    photo: row.photo_id ? mapPhotoRow(photoById.get(row.photo_id)) : null,
  };
  // trip 固有
  if (row.duration_label) item.durationLabel = row.duration_label;
  if (row.spot_count != null) item.spotCount = row.spot_count;
  const stops = strArray(row.stops);
  if (stops.length) item.stops = stops;
  // spot 固有（address は location_notes に列が無い＝surface しない）
  if (row.hours) item.hours = row.hours;
  if (row.price_level && PRICE_LEVELS.includes(row.price_level)) {
    item.priceLevel = row.price_level as PriceLevel;
  }
  // 穴場固有
  if (row.why_special) item.whySpecial = row.why_special;
  if (row.why_hidden) item.whyHidden = row.why_hidden;
  if (row.tagline) item.tagline = row.tagline;
  // Match 表示
  if (row.match_pct != null) item.matchPct = row.match_pct;
  const matchReasons = strArray(row.match_reasons);
  if (matchReasons.length) item.matchReasons = matchReasons;
  return item;
}
