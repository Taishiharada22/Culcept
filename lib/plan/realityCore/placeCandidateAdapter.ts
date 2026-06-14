/**
 * placeCandidateAdapter — RD2b locationText / provider result / confirmation を PlaceResolutionV0 に写像する pure adapter
 *
 * 正本: docs/reality-place-candidate-adapter-rd2b-0.md（RD2b-0 設計）/ docs/reality-mobility-place-supply-rd2-0.md §2.1
 *   / CEO RD2b 実装 GO（2026-06-14・pure adapter のみ・provider 実行/Places API/geocode/currentLocation/RC2a 接続なし）
 *
 * 思想（adapter は「解決器」でなく「provenance → 段階の写像」）: adapter は確信度を**上げない**。確信度は入力の
 *   provenance が決める。confirmation event → exact_confirmed（確認 provenance のみ）/ selection → candidate_selected
 *   （inferred・確認でない）/ provider 候補 → candidate_unresolved or ambiguous_place（unknown・top-1 でも confirmed に
 *   しない）/ locationText のみ → location_text_only / 無 → missing_place。**resolver の confidence high でも candidate 止まり**。
 *
 * 純粋性（RD1a listAnchors と同型）: provider は**引数注入**（adapter は placeResolver を import しない・Places API を
 *   叩かない）。provider 未注入 → location_text_only。provider 失敗 → location_text_only（**fake 候補を作らない**）。
 *
 * raw 不露出: adapter は raw lat/lng/placeId/address を**受け取らない**（provider は opaque ref のみ返す契約）。出力
 *   PlaceResolutionV0 は raw field を持たず candidateRef は opaque。leak scan で座標パターン/raw token を backstop。
 *
 * 規律（CEO RD2b 必守）: placeResolver/geocode/currentLocation/external/DB/Supabase/localStorage/UI/Alter tab/本線/
 *   RC2a compile 不接触。route/ETA/leaveBy/movementRequired 生成なし。exact_confirmed は ConfirmedPlaceSource のみ。
 *   pure（IO・時刻 API[Date.now/new Date]・乱数[Math.random]・navigator/geolocation なし）。adapter は async だが
 *   await するのは注入された provider のみ（adapter 自体は IO しない）。
 */

import {
  createMissingPlaceResolution,
  createLocationTextOnlyResolution,
  createCandidateUnresolvedResolution,
  createAmbiguousPlaceResolution,
  createCandidateSelectedResolution,
  createExactConfirmedResolution,
  placeResolutionViolations,
  type PlaceResolutionV0,
  type PlaceCandidateRef,
  type ConfirmedPlaceSource,
} from "./placeResolution";

export const PLACE_CANDIDATE_ADAPTER_VERSION = 0;

/**
 * provider が返す候補要約（raw なし）。adapter は raw lat/lng/placeId を**見ない** — provider（将来 RD2b' で
 * placeResolver をラップ）が opaque ref に圧縮して返す契約。
 */
export interface PlaceProviderCandidateResult {
  readonly status: "ok" | "no_candidates" | "failed";
  readonly candidateCount: number;
  /** resolver の自己 confidence（「本人の確認」ではない・high でも candidate 止まり） */
  readonly confidence: "high" | "moderate" | "low";
  /** top 候補が拮抗しているか（ambiguous 判定） */
  readonly competing: boolean;
  readonly source: "places_api_candidate" | "municipality_coords" | "prefecture_coords";
  /** opaque 内部ハンドル（raw placeId/lat/lng ではない）・無ければ null */
  readonly opaqueRef: string | null;
}

/** provider 依存注入（adapter は import せず引数で受ける・実 placeResolver は RD2b' で注入） */
export type PlaceCandidateProvider = (locationText: string) => Promise<PlaceProviderCandidateResult>;

/** 本人選択（確認前・canonical 化/絞り込み）。confirmed にしない（inferred 止まり） */
export interface PlaceSelectionInput {
  readonly source: "canonical_text" | "places_api_candidate" | "municipality_coords";
  readonly opaqueRef: string | null;
}

/** 確認イベント。source は ConfirmedPlaceSource に型制約（非確認 source を入れられない）・evidence 非空必須 */
export interface PlaceConfirmationInput {
  readonly source: ConfirmedPlaceSource;
  readonly evidenceCodes: ReadonlyArray<string>;
  readonly opaqueRef: string | null;
}

/** adapter 入力（provenance 別の手がかり） */
export interface PlaceAdapterInput {
  readonly subjectNodeId: string | null;
  readonly locationText: string | null;
  readonly selection: PlaceSelectionInput | null;
  readonly confirmation: PlaceConfirmationInput | null;
}

/** 依存（provider 未注入なら text-only に倒す） */
export interface PlaceAdapterDeps {
  readonly provider?: PlaceCandidateProvider;
}

function toCandidateRef(opaqueRef: string | null, candidateCount: number): PlaceCandidateRef | null {
  if (opaqueRef === null || opaqueRef.length === 0) return null;
  return { candidateCount, opaqueRef };
}

/**
 * resolvePlaceCandidate — provenance → PlaceResolutionV0 の写像。adapter は確信度を上げない。
 * 優先順位: confirmation（確認・最強）> selection（選択・inferred）> [locationText 有無] > provider 候補。
 */
export async function resolvePlaceCandidate(
  input: PlaceAdapterInput,
  deps: PlaceAdapterDeps = {},
): Promise<PlaceResolutionV0> {
  const { subjectNodeId, locationText, selection, confirmation } = input;

  // 1. confirmation（確認 provenance + 非空 evidence）→ exact_confirmed。source は型で ConfirmedPlaceSource のみ。
  if (confirmation !== null && confirmation.evidenceCodes.length > 0) {
    return createExactConfirmedResolution(
      subjectNodeId,
      confirmation.source,
      confirmation.evidenceCodes,
      toCandidateRef(confirmation.opaqueRef, 1),
    );
  }

  // 2. selection（選択だが未確認）→ candidate_selected（inferred・confirmed にしない）。
  if (selection !== null) {
    return createCandidateSelectedResolution(subjectNodeId, selection.source, toCandidateRef(selection.opaqueRef, 1));
  }

  // 3. locationText 無 → missing_place（unknown）。
  if (locationText === null || locationText.length === 0) {
    return createMissingPlaceResolution(subjectNodeId);
  }

  // 4. provider 未注入 → location_text_only（候補を作らない）。
  const provider = deps.provider;
  if (provider === undefined) {
    return createLocationTextOnlyResolution(subjectNodeId);
  }

  // 5. provider 実行（注入された関数のみ await・adapter 自体は IO しない）。
  const result = await provider(locationText);

  // 失敗 → fake 候補を作らず location_text_only に安全に倒す。
  if (result.status === "failed") {
    return createLocationTextOnlyResolution(subjectNodeId);
  }
  // 候補 0 → location_text_only。
  if (result.status === "no_candidates" || result.candidateCount <= 0) {
    return createLocationTextOnlyResolution(subjectNodeId);
  }
  // 候補拮抗（≥2）→ ambiguous_place（断定しない）。
  if (result.candidateCount >= 2 && result.competing) {
    return createAmbiguousPlaceResolution(subjectNodeId, {
      candidateCount: result.candidateCount,
      opaqueRef: result.opaqueRef ?? "opaque-candidates",
    });
  }
  // それ以外（候補 ≥1）→ candidate_unresolved（confidence high でも unresolved・本人未選択）。
  return createCandidateUnresolvedResolution(
    subjectNodeId,
    { candidateCount: result.candidateCount, opaqueRef: result.opaqueRef ?? "opaque-candidate" },
    result.source,
  );
}

// ── leak / violations scan ───────────────────────────────────────────────────────────────

/** consumer に出してはいけない raw token（serialization backstop） */
const FORBIDDEN_OUTPUT_TOKENS: ReadonlyArray<string> = [
  "lat",
  "lng",
  "latitude",
  "longitude",
  "placeid",
  "place_id",
  "address",
  "coordinates",
  "geometry",
  "locationtext",
];

/** 生座標らしき数値パターン（opaqueRef に raw 座標が紛れ込むのを検出） */
const COORD_PATTERN = /\d{1,3}\.\d{4,}/;

/**
 * placeAdapterOutputViolations — 出力の不変条件 + leak を検証（空配列 = 健全）。
 * 構造（placeResolutionViolations）+ serialization token scan + 座標パターン scan。
 */
export function placeAdapterOutputViolations(p: PlaceResolutionV0): string[] {
  let out: string[] = placeResolutionViolations(p).slice();
  const json = JSON.stringify(p).toLowerCase();
  out = out.concat(FORBIDDEN_OUTPUT_TOKENS.filter((t) => json.includes(t)).map((t) => `output leaks raw token: ${t}`));
  if (COORD_PATTERN.test(json)) {
    out = out.concat(["output contains raw coordinate pattern (opaqueRef must not carry raw lat/lng)"]);
  }
  return out;
}
