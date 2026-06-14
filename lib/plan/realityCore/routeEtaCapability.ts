/**
 * routeEtaCapability — RD2d-a route/ETA の mode-aware capability DAG を pure type / invariant / walker として固定
 *
 * 正本: docs/reality-route-eta-supply-boundary-rd2d-0b.md（mode-aware capability DAG）/ RD2d-0A（identity/freshness/heuristic）
 *   / CEO RD2d-a 実装 GO（2026-06-14・types + walker only・adapter/provider 接続なし）
 *
 * 思想（単調 lattice でなく mode-aware DAG）: route/duration/temporal/condition を独立ファミリに分け、precise edges で
 *   higher capability（arrivalProjection/planning/leaveBy）を導く。「各能力は edges 入力以上を主張しない」monotone 安全性
 *   のみ継承し、偽の直列（trafficAware 全 mode 必須・duration⊃routeShape・arrivalTarget/leaveBy 混入）を除去。
 *
 * 不変条件（CEO RD2d-a 必守）:
 *   ① travelDurationKnown ≠ arrivalProjectionKnown ≠ timeEstimateUsableForPlanning ≠ leaveByEligible（DAG derive で強制）
 *   ② routeShapeKnown と travelDurationKnown は独立（直列にしない）
 *   ③ mode 別 condition adequacy（car=traffic_aware / walk=static / transit=schedule / unknown=projection 不可）
 *   ④ heuristic は travelDuration まで・projection/planning/leaveBy/action input にしない・displayPolicy=internalReference|debugOnly
 *   ⑤ user_confirmed は scope 別・全能力 true にしない・scope mismatch は stale/unknown
 *   ⑥ origin conflict で leaveByEligible=false・user_confirmed origin を current 観測で上書きしない
 *   ⑦ endpoint pair gate（片側 sensitive で external send 不可・current 観測座標は最強 sensitive・raw 座標 log/id 禁止）
 *
 * 修正（RD2d-0B §1.2 の自己補正）: leaveByEligible の join に pairPermissionOk を入れない。endpoint pair gate は external
 *   provider 呼び出し可否を govern するもので、leaveBy eligibility の条件ではない（user_confirmed route は外部送信なしで
 *   leaveBy 可能）。両者を分離。
 *
 * 規律（CEO）: route/ETA provider・transport cascade・Google Routes・geocode・currentLocation 取得・weather API・
 *   RC2a compile 変更・UI/DB/Supabase/localStorage・notification・external 接続なし。adapter はまだ作らない（RD2d-b）。
 *   pure（IO・時刻 API[Date.now/new Date]・乱数[Math.random]・navigator/geolocation なし）。freshnessStatus は外部計算済を受け取る。
 */

export const ROUTE_ETA_CAPABILITY_VERSION = 0;

export type TransportModeV0 = "walk" | "transit" | "car" | "bike" | "unknown";

export type DurationBasisV0 =
  | "none"
  | "heuristic"
  | "scheduled"
  | "user_confirmed"
  | "external_route"
  | "cached_route";

export type ConditionModelStatusV0 =
  | "traffic_aware"
  | "schedule_aware"
  | "weather_aware"
  | "static_assumption"
  | "not_applicable"
  | "unknown";

export type RouteEtaFreshnessStatusV0 = "fresh" | "stale" | "expired";

export type RouteEtaDisplayPolicyV0 = "visible" | "notActionable" | "internalReference" | "debugOnly" | "hidden";

export type ActionConfidenceV0 = "high" | "moderate" | "low" | "none";

/** opaque endpoint 参照（raw 座標を持たない） */
export interface OpaqueEndpointRef {
  readonly opaqueRef: string;
}

export interface RouteCapabilityV0 {
  readonly transportModeKnown: boolean;
  readonly routeShapeKnown: boolean;
  readonly routeOptionKnown: boolean;
  readonly providerKindKnown: boolean;
}

export interface DurationCapabilityV0 {
  readonly travelDurationKnown: boolean;
  readonly durationBasis: DurationBasisV0;
  readonly durationScopeKnown: boolean;
}

export interface TemporalCapabilityV0 {
  readonly departureTimeScoped: boolean;
  readonly arrivalTargetScoped: boolean;
  readonly timeBandScoped: boolean;
  readonly evaluatedAtKnown: boolean;
  readonly temporalFreshnessKnown: boolean;
}

export interface ConditionCapabilityV0 {
  readonly conditionModelStatus: ConditionModelStatusV0;
}

export interface RouteEtaFreshnessV0 {
  readonly freshnessStatus: RouteEtaFreshnessStatusV0;
  readonly staleReason: string | null;
  /** opaque（clock 計算をこの pure 型で行わない・外部計算済を受け取る） */
  readonly fetchedAtRef: string | null;
  readonly validUntilRef: string | null;
}

export interface PlanningEligibilityV0 {
  readonly arrivalProjectionKnown: boolean;
  readonly timeEstimateUsableForPlanning: boolean;
  readonly confidenceForAction: ActionConfidenceV0;
}

export interface LeaveByEligibilityPreconditionV0 {
  readonly originUsableForLeaveBy: boolean;
  readonly bufferKnown: boolean;
  readonly leaveByEligible: boolean;
}

export interface RouteEtaIdentityBasisV0 {
  readonly originRef: OpaqueEndpointRef | null;
  readonly destinationRef: OpaqueEndpointRef | null;
  readonly targetNodeId: string | null;
  readonly subjectiveDate: string | null;
  readonly transportMode: TransportModeV0;
  readonly temporalScopeRef: string | null;
  readonly providerKind: string;
  readonly providerVersion: string;
  readonly routeOptionsRef: string | null;
  readonly routeInputRevision: string | null;
}

export interface OriginConflictForRouteV0 {
  readonly originConflictStatus: "none" | "minor_discrepancy" | "conflict";
  readonly originDiscrepancyRefs: ReadonlyArray<string>;
  readonly userConfirmedOriginPresent: boolean;
  /** 不変条件: 常に false（current 観測で user 確認 origin を上書きしない） */
  readonly currentObservationOverrodeConfirmed: boolean;
}

export interface EndpointPairPrivacyGateV0 {
  readonly originEndpointSensitive: boolean;
  readonly destinationEndpointSensitive: boolean;
  /** どちらかの endpoint が現在地観測か（最強 sensitive） */
  readonly currentObservationInvolved: boolean;
  readonly homeWorkDerivedInvolved: boolean;
  readonly eitherEndpointSensitive: boolean;
  readonly pairExternalSendAllowed: boolean;
  readonly coordinatePrecisionPolicy: "minimized" | "not_sending";
  /** 不変条件: 常に true */
  readonly rawCoordinateLoggingProhibited: boolean;
}

export interface RouteEtaEvidenceRef {
  readonly code: string;
  readonly capability: "route" | "duration" | "temporal" | "condition" | "planning" | "leaveBy";
  readonly source: DurationBasisV0 | "event_anchor" | "origin_inference";
}

export interface RouteEtaMissingInput {
  readonly code: string;
  readonly whyUnresolved: string;
}

export interface RouteEtaCapabilityV0 {
  readonly schemaVersion: 0;
  readonly identity: RouteEtaIdentityBasisV0;
  readonly route: RouteCapabilityV0;
  readonly duration: DurationCapabilityV0;
  readonly temporal: TemporalCapabilityV0;
  readonly condition: ConditionCapabilityV0;
  readonly freshness: RouteEtaFreshnessV0;
  readonly planning: PlanningEligibilityV0;
  readonly leaveBy: LeaveByEligibilityPreconditionV0;
  readonly originConflict: OriginConflictForRouteV0;
  readonly pairPrivacy: EndpointPairPrivacyGateV0;
  readonly evidenceRefs: ReadonlyArray<RouteEtaEvidenceRef>;
  readonly missingInputs: ReadonlyArray<RouteEtaMissingInput>;
  readonly subjectNodeId: string | null;
  readonly displayPolicy: RouteEtaDisplayPolicyV0;
}

// ── mode × condition adequacy（CEO #3・trafficAware を全 mode 共通必須にしない） ─────────────

/**
 * conditionAdequateForMode — mode に対し planning-grade projection に十分な condition か。
 * car=traffic_aware / walk・bike=static_assumption|weather_aware|not_applicable / transit=schedule_aware / unknown=不可。
 */
export function conditionAdequateForMode(mode: TransportModeV0, status: ConditionModelStatusV0): boolean {
  if (mode === "unknown") return false;
  if (mode === "car") return status === "traffic_aware";
  if (mode === "transit") return status === "schedule_aware";
  // walk / bike
  return status === "static_assumption" || status === "weather_aware" || status === "not_applicable";
}

// ── DAG derive（precise edges・各能力は入力以上を主張しない） ────────────────────────────────

export interface CapabilityDeriveParts {
  readonly mode: TransportModeV0;
  readonly travelDurationKnown: boolean;
  readonly durationBasis: DurationBasisV0;
  readonly departureTimeScoped: boolean;
  readonly arrivalTargetScoped: boolean;
  readonly temporalFreshnessKnown: boolean;
  readonly conditionModelStatus: ConditionModelStatusV0;
  readonly freshnessStatus: RouteEtaFreshnessStatusV0;
  readonly originUsableForLeaveBy: boolean;
  readonly bufferKnown: boolean;
  readonly originConflictStatus: "none" | "minor_discrepancy" | "conflict";
}

export interface DerivedCapabilityFlags {
  readonly arrivalProjectionKnown: boolean;
  readonly timeEstimateUsableForPlanning: boolean;
  readonly leaveByEligible: boolean;
}

/**
 * deriveCapabilityFlagsFromParts — DAG edges を適用して higher capability を導く。
 * heuristic / unknown mode / condition 不適 / temporal 未 scope / stale / origin conflict は上位を false に落とす。
 */
export function deriveCapabilityFlagsFromParts(p: CapabilityDeriveParts): DerivedCapabilityFlags {
  const heuristic = p.durationBasis === "heuristic";
  const arrivalProjectionKnown =
    !heuristic &&
    p.travelDurationKnown &&
    (p.departureTimeScoped || p.arrivalTargetScoped) &&
    p.temporalFreshnessKnown &&
    conditionAdequateForMode(p.mode, p.conditionModelStatus);
  const timeEstimateUsableForPlanning = arrivalProjectionKnown && p.freshnessStatus === "fresh";
  const leaveByEligible =
    timeEstimateUsableForPlanning &&
    p.arrivalTargetScoped &&
    p.originUsableForLeaveBy &&
    p.bufferKnown &&
    p.originConflictStatus !== "conflict";
  return { arrivalProjectionKnown, timeEstimateUsableForPlanning, leaveByEligible };
}

/** endpoint pair gate を導く（片側 sensitive / current 観測 / home-work 由来 → 外部送信不可） */
export function deriveEndpointPairGate(parts: {
  readonly originEndpointSensitive: boolean;
  readonly destinationEndpointSensitive: boolean;
  readonly currentObservationInvolved: boolean;
  readonly homeWorkDerivedInvolved: boolean;
}): { readonly eitherEndpointSensitive: boolean; readonly pairExternalSendAllowed: boolean } {
  const either =
    parts.originEndpointSensitive ||
    parts.destinationEndpointSensitive ||
    parts.currentObservationInvolved ||
    parts.homeWorkDerivedInvolved;
  return { eitherEndpointSensitive: either, pairExternalSendAllowed: !either };
}

// ── walkers ───────────────────────────────────────────────────────────────────────────────

// 注: "rawcoord"/"coordinate" は legit field 名（rawCoordinateLoggingProhibited/coordinatePrecisionPolicy）に
// 部分一致するため forbidden に含めない。実 raw 座標は latitude/longitude/polyline + COORD_PATTERN で検出。
const FORBIDDEN_RAW_TOKENS: ReadonlyArray<string> = [
  "polyline",
  "latitude",
  "longitude",
  "lnglat",
  "latlng",
  "geometry",
  "coordinates",
  "routeresponse",
  "address",
];
const COORD_PATTERN = /\d{1,3}\.\d{4,}/;

/** endpointPairPrivacyViolations — pair gate の不変条件（空配列 = 健全） */
export function endpointPairPrivacyViolations(g: EndpointPairPrivacyGateV0): string[] {
  let out: string[] = [];
  const add = (cond: boolean, msg: string): void => {
    out = cond ? out.concat([msg]) : out;
  };

  const derived = deriveEndpointPairGate(g);
  add(
    g.eitherEndpointSensitive !== derived.eitherEndpointSensitive,
    `eitherEndpointSensitive mismatch (expected ${String(derived.eitherEndpointSensitive)})`,
  );
  add(
    g.pairExternalSendAllowed !== derived.pairExternalSendAllowed,
    `pairExternalSendAllowed mismatch (expected ${String(derived.pairExternalSendAllowed)})`,
  );
  // 片側 sensitive / current 観測 / home-work 由来なら external send 不可
  add(g.eitherEndpointSensitive && g.pairExternalSendAllowed, "sensitive endpoint pair must not allow external send");
  add(
    g.currentObservationInvolved && g.pairExternalSendAllowed,
    "current observation endpoint is strongest sensitive — external send must be blocked",
  );
  // raw 座標 log/id 禁止は常に true
  add(g.rawCoordinateLoggingProhibited !== true, "rawCoordinateLoggingProhibited must be true");
  // precision policy: 送信許可なら minimized・不許可なら not_sending
  add(
    g.pairExternalSendAllowed && g.coordinatePrecisionPolicy !== "minimized",
    "external send requires coordinatePrecisionPolicy minimized",
  );
  add(
    !g.pairExternalSendAllowed && g.coordinatePrecisionPolicy !== "not_sending",
    "blocked send requires coordinatePrecisionPolicy not_sending",
  );
  return out;
}

/**
 * routeEtaCapabilityViolations — capability DAG / heuristic / origin conflict / raw / pair gate の不変条件を検証。
 */
export function routeEtaCapabilityViolations(cap: RouteEtaCapabilityV0): string[] {
  let out: string[] = [];
  const add = (cond: boolean, msg: string): void => {
    out = cond ? out.concat([msg]) : out;
  };

  add(cap.schemaVersion !== 0, `schemaVersion must be 0 (got ${String(cap.schemaVersion)})`);

  // ① DAG derive consistency（各能力は edges 入力以上を主張しない）
  const derived = deriveCapabilityFlagsFromParts({
    mode: cap.identity.transportMode,
    travelDurationKnown: cap.duration.travelDurationKnown,
    durationBasis: cap.duration.durationBasis,
    departureTimeScoped: cap.temporal.departureTimeScoped,
    arrivalTargetScoped: cap.temporal.arrivalTargetScoped,
    temporalFreshnessKnown: cap.temporal.temporalFreshnessKnown,
    conditionModelStatus: cap.condition.conditionModelStatus,
    freshnessStatus: cap.freshness.freshnessStatus,
    originUsableForLeaveBy: cap.leaveBy.originUsableForLeaveBy,
    bufferKnown: cap.leaveBy.bufferKnown,
    originConflictStatus: cap.originConflict.originConflictStatus,
  });
  add(
    cap.planning.arrivalProjectionKnown !== derived.arrivalProjectionKnown,
    `arrivalProjectionKnown must equal DAG derive ${String(derived.arrivalProjectionKnown)} (got ${String(cap.planning.arrivalProjectionKnown)})`,
  );
  add(
    cap.planning.timeEstimateUsableForPlanning !== derived.timeEstimateUsableForPlanning,
    `timeEstimateUsableForPlanning must equal DAG derive ${String(derived.timeEstimateUsableForPlanning)}`,
  );
  add(
    cap.leaveBy.leaveByEligible !== derived.leaveByEligible,
    `leaveByEligible must equal DAG derive ${String(derived.leaveByEligible)}`,
  );

  // ④ heuristic 境界
  if (cap.duration.durationBasis === "heuristic") {
    add(cap.planning.arrivalProjectionKnown, "heuristic must not yield arrivalProjectionKnown");
    add(cap.planning.timeEstimateUsableForPlanning, "heuristic must not yield timeEstimateUsableForPlanning");
    add(cap.leaveBy.leaveByEligible, "heuristic must not yield leaveByEligible");
    add(
      cap.displayPolicy !== "internalReference" && cap.displayPolicy !== "debugOnly",
      "heuristic displayPolicy must be internalReference|debugOnly",
    );
  }

  // confidence high は user_confirmed in-scope（planning usable）のみ予約
  add(
    cap.planning.confidenceForAction === "high" &&
      !(cap.duration.durationBasis === "user_confirmed" && cap.planning.timeEstimateUsableForPlanning),
    "confidence high reserved for user_confirmed in-scope planning-usable supply",
  );

  // ⑤ user_confirmed は evidence 必須
  add(
    cap.duration.durationBasis === "user_confirmed" && cap.evidenceRefs.length === 0,
    "user_confirmed duration requires non-empty evidenceRefs",
  );
  // external/cached は providerKind/Version 必須
  if (cap.duration.durationBasis === "external_route" || cap.duration.durationBasis === "cached_route") {
    add(cap.identity.providerKind.length === 0, "external/cached duration requires providerKind");
    add(cap.identity.providerVersion.length === 0, "external/cached duration requires providerVersion");
  }

  // ⑥ origin conflict
  add(
    cap.originConflict.currentObservationOverrodeConfirmed !== false,
    "current observation must not override user_confirmed origin (currentObservationOverrodeConfirmed must be false)",
  );
  add(
    cap.originConflict.originConflictStatus === "conflict" && cap.leaveBy.leaveByEligible,
    "origin conflict must force leaveByEligible false",
  );

  // ⑦ endpoint pair gate
  out = out.concat(endpointPairPrivacyViolations(cap.pairPrivacy));

  // raw 座標 / polyline / route response の混入を構造 backstop（serialization scan）
  const json = JSON.stringify(cap).toLowerCase();
  out = out.concat(FORBIDDEN_RAW_TOKENS.filter((t) => json.includes(t)).map((t) => `output leaks raw token: ${t}`));
  if (COORD_PATTERN.test(json)) {
    out = out.concat(["output contains raw coordinate pattern (refs must be opaque)"]);
  }

  return out;
}

// ── constructor helper（parts から DAG/gate を derive して整合 object を構築） ──────────────────

export interface BuildRouteEtaCapabilityInput {
  readonly identity: RouteEtaIdentityBasisV0;
  readonly route: RouteCapabilityV0;
  readonly duration: DurationCapabilityV0;
  readonly temporal: TemporalCapabilityV0;
  readonly condition: ConditionCapabilityV0;
  readonly freshness: RouteEtaFreshnessV0;
  readonly originUsableForLeaveBy: boolean;
  readonly bufferKnown: boolean;
  readonly originConflict: OriginConflictForRouteV0;
  readonly pairPrivacyParts: {
    readonly originEndpointSensitive: boolean;
    readonly destinationEndpointSensitive: boolean;
    readonly currentObservationInvolved: boolean;
    readonly homeWorkDerivedInvolved: boolean;
  };
  readonly evidenceRefs?: ReadonlyArray<RouteEtaEvidenceRef>;
  readonly missingInputs?: ReadonlyArray<RouteEtaMissingInput>;
  readonly subjectNodeId?: string | null;
  readonly displayPolicy?: RouteEtaDisplayPolicyV0;
}

function deriveConfidence(basis: DurationBasisV0, planningUsable: boolean, durationKnown: boolean): ActionConfidenceV0 {
  if (!planningUsable) return durationKnown ? "low" : "none";
  return basis === "user_confirmed" ? "high" : "moderate";
}

/** buildRouteEtaCapability — DAG/gate を derive して常に整合な RouteEtaCapabilityV0 を返す */
export function buildRouteEtaCapability(input: BuildRouteEtaCapabilityInput): RouteEtaCapabilityV0 {
  const flags = deriveCapabilityFlagsFromParts({
    mode: input.identity.transportMode,
    travelDurationKnown: input.duration.travelDurationKnown,
    durationBasis: input.duration.durationBasis,
    departureTimeScoped: input.temporal.departureTimeScoped,
    arrivalTargetScoped: input.temporal.arrivalTargetScoped,
    temporalFreshnessKnown: input.temporal.temporalFreshnessKnown,
    conditionModelStatus: input.condition.conditionModelStatus,
    freshnessStatus: input.freshness.freshnessStatus,
    originUsableForLeaveBy: input.originUsableForLeaveBy,
    bufferKnown: input.bufferKnown,
    originConflictStatus: input.originConflict.originConflictStatus,
  });
  const gate = deriveEndpointPairGate(input.pairPrivacyParts);
  const heuristic = input.duration.durationBasis === "heuristic";
  const displayPolicy: RouteEtaDisplayPolicyV0 =
    input.displayPolicy ?? (heuristic ? "internalReference" : "notActionable");
  return {
    schemaVersion: 0,
    identity: input.identity,
    route: input.route,
    duration: input.duration,
    temporal: input.temporal,
    condition: input.condition,
    freshness: input.freshness,
    planning: {
      arrivalProjectionKnown: flags.arrivalProjectionKnown,
      timeEstimateUsableForPlanning: flags.timeEstimateUsableForPlanning,
      confidenceForAction: deriveConfidence(
        input.duration.durationBasis,
        flags.timeEstimateUsableForPlanning,
        input.duration.travelDurationKnown,
      ),
    },
    leaveBy: {
      originUsableForLeaveBy: input.originUsableForLeaveBy,
      bufferKnown: input.bufferKnown,
      leaveByEligible: flags.leaveByEligible,
    },
    originConflict: input.originConflict,
    pairPrivacy: {
      originEndpointSensitive: input.pairPrivacyParts.originEndpointSensitive,
      destinationEndpointSensitive: input.pairPrivacyParts.destinationEndpointSensitive,
      currentObservationInvolved: input.pairPrivacyParts.currentObservationInvolved,
      homeWorkDerivedInvolved: input.pairPrivacyParts.homeWorkDerivedInvolved,
      eitherEndpointSensitive: gate.eitherEndpointSensitive,
      pairExternalSendAllowed: gate.pairExternalSendAllowed,
      coordinatePrecisionPolicy: gate.pairExternalSendAllowed ? "minimized" : "not_sending",
      rawCoordinateLoggingProhibited: true,
    },
    evidenceRefs: input.evidenceRefs ?? [],
    missingInputs: input.missingInputs ?? [],
    subjectNodeId: input.subjectNodeId ?? null,
    displayPolicy,
  };
}
