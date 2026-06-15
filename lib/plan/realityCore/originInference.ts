/**
 * OriginInference — RD2c 出発地（origin）推定の段階・不変条件（pure type 限定・currentLocation 取得なし）
 *
 * 正本: docs/reality-mobility-place-supply-rd2-0.md（§3 + §3.1）/ CEO RD2c 実装 GO（2026-06-14・types only）
 *
 * 思想（origin は「確定」でなく「由来と信頼度を持つ推定段階」）: place（RD2a §2.1）と同型 —「現在地」が最強シグナル
 *   でも **confirmed にしない**。「今いる場所」≠「出発する場所」（出発前に移動しうる）。よって confirmed に上げてよいのは
 *   **user_confirmed_origin（本人確認）のみ**。previous_event_end / home_assumed / work_assumed /
 *   current_location_candidate は全て **inferred 止まり**。
 *
 * 不変条件（CEO RD2c 必守）:
 *   ① currentLocation を取得しない・navigator/geolocation API を使わない（pure）
 *   ② current_location_candidate は **すでに外部で gate 済みの入力（evidence）が渡された場合のみ**表現
 *      （RD2c は gate を実行せず結果を受け取る = RD2b provider 注入と同型）
 *   ③ home_assumed / work_assumed / previous_event_end / current_location_candidate は confirmed にしない
 *   ④ user_confirmed_origin のみ confirmed 候補
 *   ⑤ origin 不明を home / currentLocation で勝手に補完しない（unknown_origin は source none）
 *   ⑥ route / ETA / leaveBy / movementRequired を生成しない（この型に field を持たない）
 *   ⑦ raw lat/lng/address/location label を consumer 前提 field に出さない（originRef は opaque）
 *   ⑧ source / evidence / confidence 必須
 *   ⑨ 革新的安全則: confidence の `high` は confirmed に予約（inferred は `moderate` 上限・gated GPS でも candidate）
 *
 * 規律（CEO）: currentLocation 取得・geolocation 直接参照・locationResolver 実行・route/ETA/leaveBy・MovementReality 変更・
 *   RC2a compile 変更・PlaceResolution/PlaceCandidateAdapter 変更・UI/Alter tab/本線・DB/Supabase/localStorage・
 *   API route・notification・external なし。pure（IO・時刻 API[Date.now/new Date]・乱数[Math.random]なし）。
 */

export const ORIGIN_INFERENCE_VERSION = 0;

/** 推定段階（6・unknown→user_confirmed） */
export type OriginInferenceStage =
  | "unknown_origin"
  | "previous_event_end"
  | "home_assumed"
  | "work_assumed"
  | "current_location_candidate"
  | "user_confirmed_origin";

/** RC2a / leaveBy 判断へ渡す status（接続は RD2d 以降） */
export type OriginCertaintyStatus = "confirmed" | "inferred" | "unknown";

/** 確信度（qualitative・high は confirmed に予約） */
export type OriginInferenceConfidence = "high" | "moderate" | "low" | "none";

/** inferred 段階が取りうる confidence（high/none を許さない） */
export type InferredOriginConfidence = "moderate" | "low";

/**
 * 推定の由来。confirmed に上げてよいのは ConfirmedOriginSource のみ。
 * gated_current_location は「外部で gate 済みの現在地」= candidate（confirmed ではない）。
 */
export type OriginInferenceSource =
  | "none"
  | "previous_event_chain"
  | "home_profile"
  | "work_profile"
  | "gated_current_location"
  | "user_confirmed";

/** origin を confirmed に上げてよい確認 provenance（user 確認のみ・現在地は含まない） */
export type ConfirmedOriginSource = "user_confirmed";

/** 確認 provenance 集合（walker 用・型と一致） */
export const CONFIRMED_ORIGIN_SOURCES: ReadonlyArray<OriginInferenceSource> = ["user_confirmed"];

/** opaque origin 参照（raw lat/lng/address/label を持たない・consumer 露出を構造的に不可能化） */
export interface OriginRef {
  readonly opaqueRef: string;
}

/** field-level evidence（raw content なし・source/provenance のみ） */
export interface OriginEvidenceRef {
  readonly code: string;
  readonly sourceKind: OriginInferenceSource;
}

/** 欠落入力（なぜ未確定か・generic code） */
export interface OriginMissingInput {
  readonly code: string;
  readonly whyUnresolved: string;
}

/** 表示方針（consumer 露出可否・RC2a と整合） */
export type OriginDisplayPolicy = "visible" | "hidden" | "debugOnly" | "notActionable";

/**
 * origin 推定の正本オブジェクト（内部・RD2d 以降で genericize）。
 * raw lat/lng/address/label を field として持たない（originRef は opaque）。
 * route/ETA/leaveBy/movementRequired を持たない（origin 推定の責務外）。
 */
export interface OriginInferenceV0 {
  readonly schemaVersion: 0;
  readonly stage: OriginInferenceStage;
  readonly certaintyStatus: OriginCertaintyStatus;
  readonly confidence: OriginInferenceConfidence;
  readonly source: OriginInferenceSource;
  /** opaque origin 参照（raw place data なし）・無ければ null */
  readonly originRef: OriginRef | null;
  readonly evidenceRefs: ReadonlyArray<OriginEvidenceRef>;
  readonly missingInputs: ReadonlyArray<OriginMissingInput>;
  /** 対象 event node（id-only・raw なし）・不要なら null */
  readonly subjectNodeId: string | null;
  readonly displayPolicy: OriginDisplayPolicy;
}

// ── stage → 不変マッピング（walker と constructor が共有する単一の真実） ────────────────────

/** stage が要求する certaintyStatus（CEO ③④） */
const STAGE_CERTAINTY: Record<OriginInferenceStage, OriginCertaintyStatus> = {
  unknown_origin: "unknown",
  previous_event_end: "inferred",
  home_assumed: "inferred",
  work_assumed: "inferred",
  current_location_candidate: "inferred",
  user_confirmed_origin: "confirmed",
};

/** confidence の順序（U2-minimal walker ceiling 比較用） */
const CONFIDENCE_RANK: Record<OriginInferenceConfidence, number> = { none: 0, low: 1, moderate: 2, high: 3 };

/**
 * U2-minimal（2026-06-15）: stage ごとの confidence 上限。high は user_confirmed 予約・
 * home/work_assumed は low 上限（静的仮定）・previous_event_end / current は moderate 上限。
 */
const STAGE_MAX_CONFIDENCE: Record<OriginInferenceStage, OriginInferenceConfidence> = {
  unknown_origin: "none",
  previous_event_end: "moderate",
  home_assumed: "low",
  work_assumed: "low",
  current_location_candidate: "moderate",
  user_confirmed_origin: "high",
};

function isConfirmedOriginSource(source: OriginInferenceSource): boolean {
  return CONFIRMED_ORIGIN_SOURCES.indexOf(source) >= 0;
}

function inferredConfidence(c: InferredOriginConfidence | undefined): InferredOriginConfidence {
  return c ?? "moderate";
}

// ── constructors（pure・currentLocation/provider 呼び出しなし） ─────────────────────────────

/** unknown_origin — origin 不明 → unknown（home/currentLocation で補完しない） */
export function createUnknownOrigin(subjectNodeId: string | null): OriginInferenceV0 {
  return {
    schemaVersion: 0,
    stage: "unknown_origin",
    certaintyStatus: "unknown",
    confidence: "none",
    source: "none",
    originRef: null,
    evidenceRefs: [],
    missingInputs: [{ code: "origin_unknown", whyUnresolved: "no_origin_signal" }],
    subjectNodeId,
    displayPolicy: "hidden",
  };
}

/** previous_event_end — 前 event 終了地を origin と推定 → inferred（confirmed にしない） */
export function createPreviousEventEndOrigin(
  subjectNodeId: string | null,
  originRef: OriginRef | null,
  confidence?: InferredOriginConfidence,
): OriginInferenceV0 {
  return {
    schemaVersion: 0,
    stage: "previous_event_end",
    certaintyStatus: "inferred",
    confidence: inferredConfidence(confidence),
    source: "previous_event_chain",
    originRef,
    evidenceRefs: [{ code: "previous_event_chained", sourceKind: "previous_event_chain" }],
    missingInputs: [{ code: "origin_not_confirmed", whyUnresolved: "chained_inference_unconfirmed" }],
    subjectNodeId,
    displayPolicy: "notActionable",
  };
}

/** home_assumed — 居住地 baseline を仮 origin → inferred（assumed・low） */
export function createHomeAssumedOrigin(subjectNodeId: string | null, originRef: OriginRef | null): OriginInferenceV0 {
  return {
    schemaVersion: 0,
    stage: "home_assumed",
    certaintyStatus: "inferred",
    confidence: "low",
    source: "home_profile",
    originRef,
    evidenceRefs: [{ code: "home_profile_baseline", sourceKind: "home_profile" }],
    missingInputs: [{ code: "origin_assumed_not_confirmed", whyUnresolved: "home_assumption_unconfirmed" }],
    subjectNodeId,
    displayPolicy: "notActionable",
  };
}

/** work_assumed — 勤務地 baseline を仮 origin → inferred（assumed・low） */
export function createWorkAssumedOrigin(subjectNodeId: string | null, originRef: OriginRef | null): OriginInferenceV0 {
  return {
    schemaVersion: 0,
    stage: "work_assumed",
    certaintyStatus: "inferred",
    confidence: "low",
    source: "work_profile",
    originRef,
    evidenceRefs: [{ code: "work_profile_baseline", sourceKind: "work_profile" }],
    missingInputs: [{ code: "origin_assumed_not_confirmed", whyUnresolved: "work_assumption_unconfirmed" }],
    subjectNodeId,
    displayPolicy: "notActionable",
  };
}

/**
 * current_location_candidate — 外部で gate 済みの現在地を candidate → inferred（confirmed にしない・moderate 上限）。
 * gateEvidenceCodes 非空必須（gate 結果の表現・RD2c は gate を実行しない）。
 */
export function createCurrentLocationCandidateOrigin(
  subjectNodeId: string | null,
  gateEvidenceCodes: ReadonlyArray<string>,
  originRef: OriginRef | null,
  confidence?: InferredOriginConfidence,
): OriginInferenceV0 {
  const evidenceRefs: OriginEvidenceRef[] = gateEvidenceCodes.map((code) => ({
    code,
    sourceKind: "gated_current_location",
  }));
  return {
    schemaVersion: 0,
    stage: "current_location_candidate",
    certaintyStatus: "inferred",
    confidence: inferredConfidence(confidence),
    source: "gated_current_location",
    originRef,
    evidenceRefs,
    missingInputs: [{ code: "origin_candidate_not_confirmed", whyUnresolved: "current_location_candidate_unconfirmed" }],
    subjectNodeId,
    displayPolicy: "notActionable",
  };
}

/**
 * user_confirmed_origin — 本人確認 → confirmed（唯一の confirmed 段階）。
 * evidenceCodes 非空必須・confidence high。
 */
export function createUserConfirmedOrigin(
  subjectNodeId: string | null,
  evidenceCodes: ReadonlyArray<string>,
  originRef: OriginRef | null = null,
): OriginInferenceV0 {
  const evidenceRefs: OriginEvidenceRef[] = evidenceCodes.map((code) => ({ code, sourceKind: "user_confirmed" }));
  return {
    schemaVersion: 0,
    stage: "user_confirmed_origin",
    certaintyStatus: "confirmed",
    confidence: "high",
    source: "user_confirmed",
    originRef,
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
  "address",
  "coordinates",
  "geometry",
  "locationlabel",
  "locationtext",
  "placeid",
  "place_id",
];

/** origin 推定の責務外 field（route/ETA/leaveBy/movement を持ってはいけない） */
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
 * originInferenceViolations — 不変条件違反を列挙（空配列 = 健全）。concat ベース（"push(" を避ける）。
 * 核: confirmed は user 確認のみ・現在地でも candidate・high は confirmed に予約。
 */
export function originInferenceViolations(o: OriginInferenceV0): string[] {
  let out: string[] = [];
  const add = (cond: boolean, msg: string): void => {
    out = cond ? out.concat([msg]) : out;
  };

  add(o.schemaVersion !== 0, `schemaVersion must be 0 (got ${String(o.schemaVersion)})`);

  // stage → certaintyStatus の不変マッピング
  const expected = STAGE_CERTAINTY[o.stage];
  add(expected === undefined, `unknown stage: ${String(o.stage)}`);
  add(
    expected !== undefined && o.certaintyStatus !== expected,
    `stage ${o.stage} requires certaintyStatus ${String(expected)} (got ${o.certaintyStatus})`,
  );

  // confirmed は確認 provenance（user_confirmed）のみ — 現在地/assumed/chain は confirmed にならない
  add(
    o.certaintyStatus === "confirmed" && !isConfirmedOriginSource(o.source),
    `confirmed origin requires user-confirmation provenance (got non-confirmed ${o.source})`,
  );
  add(
    o.stage === "user_confirmed_origin" && o.source !== "user_confirmed",
    `user_confirmed_origin requires source user_confirmed (got ${o.source})`,
  );

  // 革新的安全則: confidence high は confirmed に予約・unknown は none・inferred は low|moderate
  add(o.certaintyStatus === "confirmed" && o.confidence !== "high", "confirmed origin requires confidence high");
  add(o.certaintyStatus === "unknown" && o.confidence !== "none", "unknown origin requires confidence none");
  add(
    o.certaintyStatus === "inferred" && (o.confidence === "high" || o.confidence === "none"),
    `inferred origin confidence must be low|moderate (high reserved for confirmed); got ${o.confidence}`,
  );

  // U2-minimal（2026-06-15）: stage ごとの confidence 上限を walker で強制（certaintyStatus だけでは
  // inferred 全 stage に moderate を許す穴があった）。previous_event_end は moderate 上限・home/work は low 上限。
  const maxC = STAGE_MAX_CONFIDENCE[o.stage];
  add(
    maxC !== undefined && CONFIDENCE_RANK[o.confidence] > CONFIDENCE_RANK[maxC],
    `stage ${o.stage} confidence exceeds max ${String(maxC)} (got ${o.confidence})`,
  );

  // confirmed の evidence 必須 + evidence sourceKind も確認 provenance
  if (o.certaintyStatus === "confirmed") {
    add(o.evidenceRefs.length === 0, "confirmed origin requires non-empty evidenceRefs");
    const badEv = o.evidenceRefs.filter((e) => !isConfirmedOriginSource(e.sourceKind));
    out = out.concat(badEv.map((e) => `confirmed evidence sourceKind must be confirmation provenance (got ${e.sourceKind})`));
  }

  // current_location_candidate は gate 済み evidence 必須（RD2c は gate を実行しない・結果のみ）
  if (o.stage === "current_location_candidate") {
    const gated = o.evidenceRefs.filter((e) => e.sourceKind === "gated_current_location");
    add(gated.length === 0, "current_location_candidate requires non-empty gated_current_location evidence");
  }

  // unknown は source none・origin 補完なし
  add(o.stage === "unknown_origin" && o.source !== "none", "unknown_origin requires source none (no auto home/current_location fill)");
  add(o.stage === "unknown_origin" && o.originRef !== null, "unknown_origin must not carry originRef");

  // originRef の健全性
  add(
    o.originRef !== null && (typeof o.originRef.opaqueRef !== "string" || o.originRef.opaqueRef.length === 0),
    "originRef.opaqueRef must be a non-empty opaque handle",
  );

  // 偽造 object に raw / mobility field が混入していないか（構造 backstop）
  const keys = Object.keys(o as unknown as Record<string, unknown>).map((k) => k.toLowerCase());
  out = out.concat(FORBIDDEN_RAW_FIELDS.filter((f) => keys.indexOf(f) >= 0).map((f) => `forbidden raw field present: ${f}`));
  out = out.concat(
    FORBIDDEN_MOBILITY_FIELDS.filter((f) => keys.indexOf(f) >= 0).map(
      (f) => `forbidden mobility field present: ${f} (origin inference must not carry route/ETA/leaveBy/movement)`,
    ),
  );

  return out;
}
