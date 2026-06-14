/**
 * PlaceResolution — RD2a 場所解決の段階・不変条件（pure type 限定・provider/API 接続なし）
 *
 * 正本: docs/reality-mobility-place-supply-rd2-0.md（§2 + §2.1 CEO 補正）/ CEO RD2a 実装 GO（2026-06-14・types only）
 *
 * 思想（確認由来で confirmed にする）: 場所が「どの段階まで解決したか」を RC2a placeCertainty に安全接続できる型として表す。
 *   核心は CEO 補正 — **文字列の整形状態 ≠ 確認**。canonicalLocationText 形・isPlaceUnconfirmed=false は「整っている」
 *   だけで「本人が確認した」ではない。よって exact_confirmed（confirmed）に上げてよいのは **確認 provenance**
 *   （本人選択 / persisted selected / explicit confirmation / trusted exact source）のみ。型レベルで強制する
 *   （createExactConfirmedResolution は ConfirmedPlaceSource しか受理しない → location_text / places_api_candidate /
 *   canonical_text からは TS 上構築不能）。
 *
 * 不変条件（CEO RD2a 必守）:
 *   ① locationText だけで exact_confirmed にしない
 *   ② Places API 候補だけで exact_confirmed にしない
 *   ③ municipality / prefecture 座標だけで exact_confirmed にしない
 *   ④ canonical text だけで exact_confirmed にしない
 *   ⑤ exact_confirmed は explicit confirmation / selected place / trusted exact source のみ
 *   ⑥ missing は unknown / candidate は unresolved / ambiguous は unresolved / candidate_selected は inferred 止まり
 *   ⑦ confirmed でも source / evidence / confidence 必須
 *   ⑧ raw locationText / placeId / lat / lng を consumer 前提 field に出さない（candidateRef は opaque）
 *   ⑨ route / ETA / leaveBy / movementRequired を生成しない（この型に field を持たない）
 *
 * 規律（CEO）: provider 呼び出し・Places/Google Maps/geocode API 接続・currentLocation 取得・external API なし。
 *   placeResolver import 禁止。RC2a 既存 compile / MovementReality 不接触（接続は RD2b 以降・別 GO）。
 *   no UI / API route / DB write / Supabase / localStorage / notification / push / external communication / action。
 *   pure（I/O・時刻 API[Date.now/new Date]・乱数[Math.random]・navigator/geolocation なし）。
 */

export const PLACE_RESOLUTION_VERSION = 0;

/** 解決段階（6・missing→exact_confirmed） */
export type PlaceResolutionStage =
  | "missing_place"
  | "location_text_only"
  | "candidate_unresolved"
  | "ambiguous_place"
  | "candidate_selected"
  | "exact_confirmed";

/** RC2a placeCertainty へ渡す status（接続は RD2b・ここでは値のみ） */
export type PlaceCertaintyStatus = "confirmed" | "inferred" | "unknown";

/** 確信度（qualitative・raw 数値を持たない） */
export type PlaceResolutionConfidence = "high" | "moderate" | "low" | "none";

/**
 * 解決の由来。CEO 補正核心 — confirmed に上げてよいのは ConfirmedPlaceSource のみ。
 * 非確認 source（location_text / places_api_candidate / municipality_coords / prefecture_coords / canonical_text）は
 * 整形・候補であって「確認」ではない。
 */
export type PlaceResolutionSource =
  | "none"
  | "location_text"
  | "places_api_candidate"
  | "municipality_coords"
  | "prefecture_coords"
  | "canonical_text"
  | "user_selected"
  | "user_confirmed"
  | "persisted_selected"
  | "trusted_exact_source";

/** exact_confirmed を許す確認 provenance（PlaceResolutionSource の部分集合・型で強制） */
export type ConfirmedPlaceSource =
  | "user_selected"
  | "user_confirmed"
  | "persisted_selected"
  | "trusted_exact_source";

/** 確認 provenance 集合（walker 用・型と一致させる） */
export const CONFIRMED_PLACE_SOURCES: ReadonlyArray<PlaceResolutionSource> = [
  "user_selected",
  "user_confirmed",
  "persisted_selected",
  "trusted_exact_source",
];

/**
 * 候補参照（opaque）。raw placeId / lat / lng / address を持たない（consumer 露出を構造的に不可能化）。
 * opaqueRef は内部ハンドル（Google placeId 等ではない）。candidateCount は候補数のみ。
 */
export interface PlaceCandidateRef {
  readonly candidateCount: number;
  readonly opaqueRef: string;
}

/** field-level evidence（raw content を持たない・source/confidence の provenance のみ） */
export interface PlaceResolutionEvidenceRef {
  readonly code: string;
  readonly sourceKind: PlaceResolutionSource;
}

/** 欠落入力（なぜ未解決か・slice 名や raw を漏らさない generic code） */
export interface PlaceResolutionMissingInput {
  readonly code: string;
  readonly whyUnresolved: string;
}

/** 表示方針（consumer 露出可否・RC2a と整合） */
export type PlaceResolutionDisplayPolicy = "visible" | "hidden" | "debugOnly" | "notActionable";

/**
 * 場所解決の正本オブジェクト（内部・RD2d projection で genericize される）。
 * raw locationText / placeId / lat / lng を **field として持たない**（candidateRef は opaque）。
 * route / ETA / leaveBy / movementRequired を **持たない**（場所解決の責務外）。
 */
export interface PlaceResolutionV0 {
  readonly schemaVersion: 0;
  readonly stage: PlaceResolutionStage;
  /** RC2a placeCertainty へ渡す status（接続は RD2b） */
  readonly certaintyStatus: PlaceCertaintyStatus;
  readonly confidence: PlaceResolutionConfidence;
  readonly source: PlaceResolutionSource;
  /** opaque 候補参照（raw place data なし）・候補が無い段階は null */
  readonly candidateRef: PlaceCandidateRef | null;
  /** field-level evidence（confirmed では非空必須） */
  readonly evidenceRefs: ReadonlyArray<PlaceResolutionEvidenceRef>;
  readonly missingInputs: ReadonlyArray<PlaceResolutionMissingInput>;
  /** 対象 event node（id-only・raw なし）・不要なら null */
  readonly subjectNodeId: string | null;
  readonly displayPolicy: PlaceResolutionDisplayPolicy;
}

// ── stage → 不変マッピング（walker と constructor が共有する単一の真実） ────────────────────

/** stage が要求する certaintyStatus（不変条件 ⑥・CEO #1） */
const STAGE_CERTAINTY: Record<PlaceResolutionStage, PlaceCertaintyStatus> = {
  missing_place: "unknown",
  location_text_only: "unknown",
  candidate_unresolved: "unknown",
  ambiguous_place: "unknown",
  candidate_selected: "inferred",
  exact_confirmed: "confirmed",
};

function isConfirmedSource(source: PlaceResolutionSource): boolean {
  return CONFIRMED_PLACE_SOURCES.indexOf(source) >= 0;
}

// ── constructors（pure・provider/API 呼び出しなし） ────────────────────────────────────────

/** missing_place — locationText すら無い → unknown */
export function createMissingPlaceResolution(subjectNodeId: string | null): PlaceResolutionV0 {
  return {
    schemaVersion: 0,
    stage: "missing_place",
    certaintyStatus: "unknown",
    confidence: "none",
    source: "none",
    candidateRef: null,
    evidenceRefs: [],
    missingInputs: [{ code: "place_missing", whyUnresolved: "no_location_text" }],
    subjectNodeId,
    displayPolicy: "hidden",
  };
}

/** location_text_only — 文字列のみ（未解決） → unknown */
export function createLocationTextOnlyResolution(subjectNodeId: string | null): PlaceResolutionV0 {
  return {
    schemaVersion: 0,
    stage: "location_text_only",
    certaintyStatus: "unknown",
    confidence: "low",
    source: "location_text",
    candidateRef: null,
    evidenceRefs: [{ code: "location_text_present", sourceKind: "location_text" }],
    missingInputs: [{ code: "place_unresolved", whyUnresolved: "location_text_not_resolved" }],
    subjectNodeId,
    displayPolicy: "hidden",
  };
}

/** candidate_unresolved — 候補取得したが未選択 → unknown（confirmed にしない） */
export function createCandidateUnresolvedResolution(
  subjectNodeId: string | null,
  candidate: PlaceCandidateRef,
  source: "places_api_candidate" | "municipality_coords" | "prefecture_coords",
): PlaceResolutionV0 {
  return {
    schemaVersion: 0,
    stage: "candidate_unresolved",
    certaintyStatus: "unknown",
    confidence: "low",
    source,
    candidateRef: candidate,
    evidenceRefs: [{ code: "candidate_present", sourceKind: source }],
    missingInputs: [{ code: "candidate_not_selected", whyUnresolved: "candidate_present_unselected" }],
    subjectNodeId,
    displayPolicy: "hidden",
  };
}

/** ambiguous_place — 複数候補が拮抗（≥2）→ unknown（断定しない） */
export function createAmbiguousPlaceResolution(
  subjectNodeId: string | null,
  candidate: PlaceCandidateRef,
): PlaceResolutionV0 {
  return {
    schemaVersion: 0,
    stage: "ambiguous_place",
    certaintyStatus: "unknown",
    confidence: "low",
    source: "places_api_candidate",
    candidateRef: candidate,
    evidenceRefs: [{ code: "candidates_competing", sourceKind: "places_api_candidate" }],
    missingInputs: [{ code: "ambiguous_multiple_candidates", whyUnresolved: "candidates_competing_unresolved" }],
    subjectNodeId,
    displayPolicy: "hidden",
  };
}

/**
 * candidate_selected — 候補を 1 つ選択（だが確認 provenance なし）→ inferred（confirmed にしない）。
 * canonical 化済・isPlaceUnconfirmed=false でも、確認由来でない限りここ止まり（CEO 補正）。
 */
export function createCandidateSelectedResolution(
  subjectNodeId: string | null,
  source: "canonical_text" | "places_api_candidate" | "municipality_coords",
  candidate: PlaceCandidateRef | null,
): PlaceResolutionV0 {
  return {
    schemaVersion: 0,
    stage: "candidate_selected",
    certaintyStatus: "inferred",
    confidence: "moderate",
    source,
    candidateRef: candidate,
    evidenceRefs: [{ code: "candidate_selected_unconfirmed", sourceKind: source }],
    missingInputs: [{ code: "not_confirmed", whyUnresolved: "selected_but_confirmation_absent" }],
    subjectNodeId,
    displayPolicy: "notActionable",
  };
}

/**
 * exact_confirmed — 確認 provenance のみ → confirmed。
 * source は ConfirmedPlaceSource に型制約（location_text / places_api_candidate / canonical_text からは構築不能）。
 * evidenceCodes は非空必須（CEO #7/#9）。
 */
export function createExactConfirmedResolution(
  subjectNodeId: string | null,
  source: ConfirmedPlaceSource,
  evidenceCodes: ReadonlyArray<string>,
  candidate: PlaceCandidateRef | null = null,
): PlaceResolutionV0 {
  const evidenceRefs: PlaceResolutionEvidenceRef[] = evidenceCodes.map((code) => ({ code, sourceKind: source }));
  return {
    schemaVersion: 0,
    stage: "exact_confirmed",
    certaintyStatus: "confirmed",
    confidence: "high",
    source,
    candidateRef: candidate,
    evidenceRefs,
    missingInputs: [],
    subjectNodeId,
    displayPolicy: "visible",
  };
}

// ── walker（不変条件を構造検証・hand-crafted object 偽造も検出） ──────────────────────────

/** consumer 露出してはいけない raw field 名（型に無いが偽造 object を検出） */
const FORBIDDEN_RAW_FIELDS: ReadonlyArray<string> = [
  "lat",
  "lng",
  "latitude",
  "longitude",
  "placeid",
  "place_id",
  "locationtext",
  "address",
  "coordinates",
  "geometry",
  "rawcandidate",
];

/** 場所解決の責務外 field（route/ETA/leaveBy/movement を持ってはいけない） */
const FORBIDDEN_MOBILITY_FIELDS: ReadonlyArray<string> = [
  "route",
  "routeknown",
  "eta",
  "etaknown",
  "leaveby",
  "leavebyknown",
  "movementrequired",
  "departure",
];

/**
 * placeResolutionViolations — 不変条件違反を列挙（空配列 = 健全）。
 * CEO 補正核心: exact_confirmed は ConfirmedPlaceSource のみ・整形状態だけでは confirmed にしない。
 */
export function placeResolutionViolations(p: PlaceResolutionV0): string[] {
  // concat ベースで蓄積（forbidden identifier "push(" を避ける・operatorDayPreview と同方針）
  let out: string[] = [];
  const add = (cond: boolean, msg: string): void => {
    out = cond ? out.concat([msg]) : out;
  };

  add(p.schemaVersion !== 0, `schemaVersion must be 0 (got ${String(p.schemaVersion)})`);

  // ⑥ stage → certaintyStatus の不変マッピング
  const expectedCertainty = STAGE_CERTAINTY[p.stage];
  add(expectedCertainty === undefined, `unknown stage: ${String(p.stage)}`);
  add(
    expectedCertainty !== undefined && p.certaintyStatus !== expectedCertainty,
    `stage ${p.stage} requires certaintyStatus ${String(expectedCertainty)} (got ${p.certaintyStatus})`,
  );

  // ⑤ + CEO 補正核心: confirmed は確認 provenance のみ（整形状態 ≠ 確認）
  add(
    p.certaintyStatus === "confirmed" && !isConfirmedSource(p.source),
    `confirmed requires confirmation provenance source (got non-confirmed ${p.source})`,
  );
  add(
    p.stage === "exact_confirmed" && !isConfirmedSource(p.source),
    `exact_confirmed requires confirmation provenance (got ${p.source})`,
  );

  // ⑦/#9 confirmed の evidence / confidence 必須
  add(p.stage === "exact_confirmed" && p.evidenceRefs.length === 0, "exact_confirmed requires non-empty evidenceRefs");
  add(p.stage === "exact_confirmed" && p.confidence === "none", "exact_confirmed requires confidence (not none)");
  // confirmed evidence の sourceKind も確認 provenance であること
  if (p.certaintyStatus === "confirmed") {
    const bad = p.evidenceRefs.filter((e) => !isConfirmedSource(e.sourceKind));
    out = out.concat(bad.map((e) => `confirmed evidence sourceKind must be confirmation provenance (got ${e.sourceKind})`));
  }

  // ambiguous は候補 ≥2
  add(
    p.stage === "ambiguous_place" && (p.candidateRef === null || p.candidateRef.candidateCount < 2),
    "ambiguous_place requires candidateRef.candidateCount >= 2",
  );
  // missing は候補・source なし
  add(p.stage === "missing_place" && p.source !== "none", "missing_place requires source none");
  add(p.stage === "missing_place" && p.candidateRef !== null, "missing_place must not carry candidateRef");

  // candidateRef の健全性
  if (p.candidateRef !== null) {
    add(p.candidateRef.candidateCount < 1, "candidateRef.candidateCount must be >= 1");
    add(
      typeof p.candidateRef.opaqueRef !== "string" || p.candidateRef.opaqueRef.length === 0,
      "candidateRef.opaqueRef must be a non-empty opaque handle",
    );
  }

  // ⑧/⑨ 偽造 object に raw / mobility field が混入していないか（構造 backstop）
  const keys = Object.keys(p as unknown as Record<string, unknown>).map((k) => k.toLowerCase());
  out = out.concat(FORBIDDEN_RAW_FIELDS.filter((f) => keys.indexOf(f) >= 0).map((f) => `forbidden raw field present: ${f}`));
  out = out.concat(
    FORBIDDEN_MOBILITY_FIELDS.filter((f) => keys.indexOf(f) >= 0).map(
      (f) => `forbidden mobility field present: ${f} (place resolution must not carry route/ETA/leaveBy/movement)`,
    ),
  );

  return out;
}
