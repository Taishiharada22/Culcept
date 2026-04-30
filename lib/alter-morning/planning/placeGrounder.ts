/**
 * L2.3 Place Grounder — Comprehension-First v1.3+ Wave 2
 *
 * 設計書: docs/alter-morning-comprehension-first-wave2-design.md §2
 *
 * 責務:
 *   Wave 1 で得た Event.where.place_ref（記号）を実 place 候補に解決する。
 *   Wave 2 は辞書ベースのみ（Q-1=A: placeTable.ts 流用、新辞書追加なし）。
 *   外部 API は一切呼ばない（Q-3=A: Wave 3 以降）。
 *
 * 設計原則:
 *   - Solver は place_ref（記号）で planning し、Place Grounder は
 *     解決候補を注釈として添えるだけ。plan graph を書き換えない
 *   - tentative place は candidates 複数のまま保持し narration で揺らす
 *   - unresolved は「辞書外だがユーザ発話尊重」扱い。エラーではない
 *   - 純関数。副作用なし。LLM 呼び出しなし
 */

import type { Event } from "../comprehension/eventSchema";
import { normalizeForMatch } from "../comprehension/provenanceChecker";
import { PLACE_TABLE, resolvePlace, type PlaceEntry } from "../placeTable";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PlaceCandidate {
  /** 正式名称（PlaceEntry.canonicalLabel） */
  resolvedName: string;
  /** 分類 */
  placeType: "exact_proper_noun" | "chain_brand" | "generic_place" | "known_base";
  /** 辞書由来の確信度 */
  confidence: "high" | "medium" | "low";
  /** 辞書ソース */
  source: "placeTable" | "user_baseline" | "unresolved";
  /** マッチした alias（デバッグ用） */
  matchedAlias?: string;
  /** PlaceEntry の id */
  entryId?: string;
}

export type GroundingStatus = "resolved" | "ambiguous" | "unresolved";

export interface GroundedPlace {
  event_id: string;
  place_ref: string;
  candidates: PlaceCandidate[];
  /** 最上位候補。unresolved 時は null */
  selected: PlaceCandidate | null;
  status: GroundingStatus;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlaceEntry.category → L1 placeType mapping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function categoryToPlaceType(
  category: PlaceEntry["category"],
): PlaceCandidate["placeType"] {
  if (category === "home") return "known_base";
  // チェーン店は placeTable 側で category が cafe/fast_food/... に分類されているため、
  // ここでは placeTable にあれば chain_brand 扱いにする（exact_proper_noun より優先度低）
  // ただし L1 placeType を優先する (§2.4 の分岐で placeType==exact_proper_noun は辞書 miss でも unresolved+尊重)
  return "chain_brand";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// known_base lookup (user baseline)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * known_base 語彙（placeTable の home category に加え、自宅/オフィス/会社/ホテル/実家）。
 * user_baseline 経由で実住所を埋めるのは Wave 2 スコープ外 → label だけで判定。
 */
const KNOWN_BASE_LABELS = ["自宅", "家", "オフィス", "会社", "ホテル", "実家"];

function isKnownBase(placeRef: string): boolean {
  const norm = normalizeForMatch(placeRef);
  return KNOWN_BASE_LABELS.some(
    (label) => normalizeForMatch(label) === norm,
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Grounding per event
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Event の where.place_ref を辞書ベースで解決する。
 *
 * 分岐:
 *   - place_ref == null: unresolved（status: unresolved, candidates: []）
 *   - L1 placeType == "known_base": known_base 判定 → resolved
 *   - placeTable で単一ヒット: resolved
 *   - placeTable で複数ヒット: ambiguous（Wave 2 では 1 件目を selected、他は候補保持）
 *   - placeTable miss:
 *       L1 placeType == "exact_proper_noun" → unresolved（narration で place_ref 尊重）
 *       それ以外 → unresolved
 */
export function groundPlace(ev: Event): GroundedPlace {
  const placeRef = ev.where.place_ref;
  const l1PlaceType = ev.where.placeType;

  if (!placeRef) {
    return {
      event_id: ev.event_id,
      place_ref: "",
      candidates: [],
      selected: null,
      status: "unresolved",
    };
  }

  // known_base 優先判定
  if (l1PlaceType === "known_base" || isKnownBase(placeRef)) {
    const candidate: PlaceCandidate = {
      resolvedName: placeRef,
      placeType: "known_base",
      confidence: "high",
      source: "user_baseline",
    };
    return {
      event_id: ev.event_id,
      place_ref: placeRef,
      candidates: [candidate],
      selected: candidate,
      status: "resolved",
    };
  }

  // placeTable で全一致候補を探す（resolvePlace は first-match のみ、ここは複数検出したい）
  const normRef = normalizeForMatch(placeRef);
  const hits: Array<{ entry: PlaceEntry; matchedAlias: string }> = [];

  for (const entry of PLACE_TABLE) {
    for (const alias of entry.aliases) {
      const normAlias = normalizeForMatch(alias);
      if (!normAlias) continue;
      // 完全一致 or substring 一致（generic_place で「カフェ」→「スタバ」等は拾わない。
      // ここは place_ref 側を基準に alias が含まれるか見る）
      //
      // 注: normalizeForMatch は "ー" を削除するため、"バー" → "バ" のように
      //     短くなるケースがある。1 文字 substring マッチはノイズなので弾く。
      const exact = normRef === normAlias;
      const substring = normAlias.length >= 2 && normRef.includes(normAlias);
      if (exact || substring) {
        hits.push({ entry, matchedAlias: alias });
        break; // 同一 entry で複数 alias は 1 件まで
      }
    }
  }

  if (hits.length === 1) {
    const { entry, matchedAlias } = hits[0];
    const candidate: PlaceCandidate = {
      resolvedName: entry.canonicalLabel,
      placeType:
        l1PlaceType === "generic_place"
          ? "generic_place"
          : categoryToPlaceType(entry.category),
      confidence: "high",
      source: "placeTable",
      matchedAlias,
      entryId: entry.id,
    };
    return {
      event_id: ev.event_id,
      place_ref: placeRef,
      candidates: [candidate],
      selected: candidate,
      status: "resolved",
    };
  }

  if (hits.length > 1) {
    const candidates: PlaceCandidate[] = hits.map(({ entry, matchedAlias }) => ({
      resolvedName: entry.canonicalLabel,
      placeType:
        l1PlaceType === "generic_place"
          ? "generic_place"
          : categoryToPlaceType(entry.category),
      confidence: "medium",
      source: "placeTable",
      matchedAlias,
      entryId: entry.id,
    }));
    return {
      event_id: ev.event_id,
      place_ref: placeRef,
      candidates,
      selected: candidates[0],
      status: "ambiguous",
    };
  }

  // placeTable で miss
  // exact_proper_noun / generic_place / chain_brand いずれも unresolved。
  // ただし narration 層では place_ref をそのまま使う（発話尊重）
  return {
    event_id: ev.event_id,
    place_ref: placeRef,
    candidates: [],
    selected: null,
    status: "unresolved",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bulk grounding
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function groundPlaces(events: Event[]): GroundedPlace[] {
  return events.map(groundPlace);
}

/**
 * Event.where.place_ref から実 place name を引く convenience 関数。
 * narration 層で選択済み候補を取り出すときに使う。
 */
export function resolveDisplayName(
  grounded: GroundedPlace,
): string {
  if (grounded.selected) return grounded.selected.resolvedName;
  return grounded.place_ref; // unresolved: 元の place_ref を尊重
}

// 未使用 export を避けるための参照維持（test から直接使うことがあれば後段で）
void resolvePlace;
