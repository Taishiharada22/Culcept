/**
 * routeEtaCapability — RD2d-a route/ETA の mode-aware capability DAG を pure type / invariant / walker として固定
 *
 * 正本: docs/reality-route-eta-supply-boundary-rd2d-0b.md（mode-aware capability DAG）/ RD2d-0A（identity/freshness/heuristic）
 *   / CEO RD2d-a 実装 GO + RD2d-a-A micro-fix（2026-06-14・types + walker only・adapter/provider 接続なし）
 *
 * 思想（単調 lattice でなく mode-aware DAG）: route/duration/temporal/condition を独立ファミリに分け、precise edges で
 *   higher capability（arrivalProjection/planning/leaveBy）を導く。「各能力は edges 入力以上を主張しない」monotone 安全性
 *   のみ継承し、偽の直列を除去。
 *
 * RD2d-a-A 補正（4 レンズ敵対監査 wf_cef6e0fa 反映・自立検証）:
 *   ① duration 語彙: travelDurationKnown → durationSignalPresent（heuristic でも true ＝「known」は誇張。「signal が
 *      ある」だけ。durationBasis が真の epistemic 状態を持つ）。durationScopeKnown → durationScopeBounded。
 *      temporalFreshnessKnown → temporalFreshnessEvaluated（real freshness[freshnessStatus]との誤読防止）。
 *   ② projection gate を DENYLIST(!heuristic)→ALLOWLIST(durationProjectionGradeOk)。straight-line を external_route と
 *      誤 stamp / durationBasis="none" でも projection に登れた fail-open hole を fail-closed に。conditionAdequateForMode
 *      とは独立（条件は condition、duration 品質は basis grade）。durationScopeBounded も projection conjunct に追加。
 *   ③ leaveBy 語彙: leaveByEligible → leaveByComputable（tier-1 内部計算可能性のみ。display/action eligibility は RJ2/
 *      Permission/delivery の別 gate。INV-1..3: computable ⇏ display/departure-line/action）。endpoint pair gate は
 *      leaveBy computation の条件でない（sibling・external send 可否のみ govern）。
 *   ④ leak guard: serialized-output scan 維持 + encodedpolyline/waypoints token + 粗い座標 pair pattern 追加
 *      （2 桁小数 lat,lng pair も検出）。bare lat/lng は free-text 誤検出ゆえ非採用。
 *
 * 不変条件（CEO RD2d-a 必守）:
 *   - durationSignalPresent ≠ arrivalProjectionKnown ≠ timeEstimateUsableForPlanning ≠ leaveByComputable（DAG derive で強制）
 *   - routeShapeKnown と durationSignalPresent は独立（直列にしない）
 *   - mode 別 condition adequacy（car=traffic_aware / walk=static / transit=schedule / unknown=projection 不可）
 *   - projection-grade durationBasis（scheduled/user_confirmed/external_route/cached_route）のみ projection に登れる（heuristic/none 不可）
 *   - heuristic は durationSignalPresent 止まり・action input にしない・displayPolicy=internalReference|debugOnly
 *   - origin conflict で leaveByComputable=false・current 観測で user_confirmed origin を上書きしない
 *   - endpoint pair gate（片側 sensitive で external send 不可）は leaveBy 条件でない
 *   - raw lat/lng/address/label を consumer 前提 field に出さない（opaque ref のみ・serialized leak guard）
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
  /** duration の「値が存在する」だけ（heuristic でも true）。品質は durationBasis が持つ。「known」ではない。 */
  readonly durationSignalPresent: boolean;
  readonly durationBasis: DurationBasisV0;
  /** duration の scope（origin/dest/timeBand）が pin されているか */
  readonly durationScopeBounded: boolean;
}

export interface TemporalCapabilityV0 {
  readonly departureTimeScoped: boolean;
  readonly arrivalTargetScoped: boolean;
  readonly timeBandScoped: boolean;
  readonly evaluatedAtKnown: boolean;
  /** freshness が「評価済」か（real freshness は freshnessStatus・混同しない） */
  readonly temporalFreshnessEvaluated: boolean;
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

/**
 * leaveBy の **tier-1（内部計算可能性）のみ**。computable ⇏ display-eligible ⇏ action-eligible。
 * display/action は RJ2 surface / Permission / delivery の別 gate。
 */
export interface LeaveByComputabilityV0 {
  readonly originUsableForLeaveBy: boolean;
  readonly bufferKnown: boolean;
  readonly leaveByComputable: boolean;
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
  /** external 第三者送信の可否 */
  readonly pairExternalSendAllowed: boolean;
  /**
   * raw 座標を **local（外部送信なし）で距離計算に使ってよいか**。pairExternalSendAllowed と **直交**な別 gate
   * （RD2d-a-B）。local heuristic も raw 座標を消費するので external 可否とは別判断。sensitive/current/home-work は false。
   */
  readonly localHeuristicAllowed: boolean;
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
  readonly leaveBy: LeaveByComputabilityV0;
  readonly originConflict: OriginConflictForRouteV0;
  readonly pairPrivacy: EndpointPairPrivacyGateV0;
  readonly evidenceRefs: ReadonlyArray<RouteEtaEvidenceRef>;
  readonly missingInputs: ReadonlyArray<RouteEtaMissingInput>;
  readonly subjectNodeId: string | null;
  readonly displayPolicy: RouteEtaDisplayPolicyV0;
}

// ── mode × condition adequacy（CEO #3・trafficAware を全 mode 共通必須にしない・CONDITION のみ） ──────

/**
 * conditionAdequateForMode — mode に対し planning-grade projection に十分な **condition** か（duration 品質は別 gate）。
 * car=traffic_aware / walk・bike=static_assumption|weather_aware|not_applicable / transit=schedule_aware / unknown=不可。
 */
export function conditionAdequateForMode(mode: TransportModeV0, status: ConditionModelStatusV0): boolean {
  if (mode === "unknown") return false;
  if (mode === "car") return status === "traffic_aware";
  if (mode === "transit") return status === "schedule_aware";
  // walk / bike
  return status === "static_assumption" || status === "weather_aware" || status === "not_applicable";
}

/**
 * durationProjectionGradeOk — projection に登ってよい duration basis の ALLOWLIST（fail-closed）。
 * heuristic（straight-line）/ none（provenance 不明）は projection-grade でない。これにより straight-line を
 * 別 basis に誤 stamp しても、また未知 basis でも、fail-closed で projection に登れない。
 */
export function durationProjectionGradeOk(basis: DurationBasisV0): boolean {
  return basis === "scheduled" || basis === "user_confirmed" || basis === "external_route" || basis === "cached_route";
}

// ── DAG derive（precise edges・各能力は入力以上を主張しない） ────────────────────────────────

export interface CapabilityDeriveParts {
  readonly mode: TransportModeV0;
  readonly durationSignalPresent: boolean;
  readonly durationBasis: DurationBasisV0;
  readonly durationScopeBounded: boolean;
  readonly departureTimeScoped: boolean;
  readonly arrivalTargetScoped: boolean;
  readonly temporalFreshnessEvaluated: boolean;
  readonly conditionModelStatus: ConditionModelStatusV0;
  readonly freshnessStatus: RouteEtaFreshnessStatusV0;
  /** freshness の根拠 ref（fetchedAt 相当）が存在するか。fresh は basis なしでは planning に上げない（RD2d-a-B） */
  readonly fetchedAtRefPresent: boolean;
  readonly originUsableForLeaveBy: boolean;
  readonly bufferKnown: boolean;
  readonly originConflictStatus: "none" | "minor_discrepancy" | "conflict";
}

export interface DerivedCapabilityFlags {
  readonly arrivalProjectionKnown: boolean;
  readonly timeEstimateUsableForPlanning: boolean;
  readonly leaveByComputable: boolean;
}

/**
 * deriveCapabilityFlagsFromParts — DAG edges を適用して higher capability を導く。
 * projection は ALLOWLIST(durationProjectionGradeOk) + scope bounded + temporal + condition adequate（heuristic/none は fail-closed）。
 * planning は freshnessStatus=fresh **かつ** freshness evidence（fetchedAtRefPresent）必須（RD2d-a-B・self-claim fresh を弾く）。
 */
export function deriveCapabilityFlagsFromParts(p: CapabilityDeriveParts): DerivedCapabilityFlags {
  const arrivalProjectionKnown =
    durationProjectionGradeOk(p.durationBasis) &&
    p.durationSignalPresent &&
    p.durationScopeBounded &&
    (p.departureTimeScoped || p.arrivalTargetScoped) &&
    p.temporalFreshnessEvaluated &&
    conditionAdequateForMode(p.mode, p.conditionModelStatus);
  const timeEstimateUsableForPlanning = arrivalProjectionKnown && p.freshnessStatus === "fresh" && p.fetchedAtRefPresent;
  const leaveByComputable =
    timeEstimateUsableForPlanning &&
    p.arrivalTargetScoped &&
    p.originUsableForLeaveBy &&
    p.bufferKnown &&
    p.originConflictStatus !== "conflict";
  return { arrivalProjectionKnown, timeEstimateUsableForPlanning, leaveByComputable };
}

/**
 * endpoint pair gate を導く（片側 sensitive / current 観測 / home-work 由来 → 外部送信不可）。
 * localHeuristicAllowed は default `!either`（保守的）だが pairExternalSendAllowed とは **別フィールド**（直交・privacy guard が
 * override で tighten 可能・ただし sensitive を loosen はできない＝walker が enforce）。
 */
export function deriveEndpointPairGate(parts: {
  readonly originEndpointSensitive: boolean;
  readonly destinationEndpointSensitive: boolean;
  readonly currentObservationInvolved: boolean;
  readonly homeWorkDerivedInvolved: boolean;
}): { readonly eitherEndpointSensitive: boolean; readonly pairExternalSendAllowed: boolean; readonly localHeuristicAllowedDefault: boolean } {
  const either =
    parts.originEndpointSensitive ||
    parts.destinationEndpointSensitive ||
    parts.currentObservationInvolved ||
    parts.homeWorkDerivedInvolved;
  return { eitherEndpointSensitive: either, pairExternalSendAllowed: !either, localHeuristicAllowedDefault: !either };
}

// ── walkers ───────────────────────────────────────────────────────────────────────────────

// serialized-output scan（output-only・source scan は #18/#19/#20 が別途担当）。
// 注: "rawcoord"/"coordinate" は legit field 名に部分一致するため不採用。bare "lat"/"lng" も free-text 誤検出ゆえ不採用。
const FORBIDDEN_RAW_TOKENS: ReadonlyArray<string> = [
  "polyline",
  "encodedpolyline",
  "latitude",
  "longitude",
  "lnglat",
  "latlng",
  "geometry",
  "coordinates",
  "routeresponse",
  "address",
  "waypoints",
];
/** 高精度単一座標（4 桁以上小数・整数部 3 桁以下） */
const COORD_PATTERN = /\d{1,3}\.\d{4,}/;
/** 粗い座標ペア（2 桁以上小数の lat,lng pair・providerVersion 等の単一小数を誤検出しない） */
const COORD_PAIR_PATTERN = /-?\d{1,3}\.\d{2,}\s*[,;]\s*-?\d{1,3}\.\d{2,}/;

/** 違反 message が raw 座標値を echo して leak guard を defeat しないよう redact（RD2d-a-B・INV-NO-RAW-ECHO） */
function redactIfRaw(v: string): string {
  const lower = v.toLowerCase();
  if (COORD_PATTERN.test(v) || COORD_PAIR_PATTERN.test(v) || FORBIDDEN_RAW_TOKENS.some((t) => lower.includes(t))) {
    return "<redacted: matched raw-data pattern>";
  }
  return v;
}

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
  add(g.eitherEndpointSensitive && g.pairExternalSendAllowed, "sensitive endpoint pair must not allow external send");
  add(
    g.currentObservationInvolved && g.pairExternalSendAllowed,
    "current observation endpoint is strongest sensitive — external send must be blocked",
  );
  // localHeuristicAllowed は external send とは別 gate（直交）。但し sensitive/current/home-work は local heuristic も不可
  add(g.eitherEndpointSensitive && g.localHeuristicAllowed, "sensitive endpoint pair must not allow local heuristic (raw coords)");
  add(
    g.currentObservationInvolved && g.localHeuristicAllowed,
    "current observation endpoint must not allow local heuristic (strongest sensitive)",
  );
  add(g.homeWorkDerivedInvolved && g.localHeuristicAllowed, "home/work-derived endpoint must not allow local heuristic by default");
  add(g.rawCoordinateLoggingProhibited !== true, "rawCoordinateLoggingProhibited must be true");
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
 * routeEtaCapabilityViolations — capability DAG / projection grade / heuristic / origin conflict / raw / pair gate を検証。
 */
export function routeEtaCapabilityViolations(cap: RouteEtaCapabilityV0): string[] {
  let out: string[] = [];
  const add = (cond: boolean, msg: string): void => {
    out = cond ? out.concat([msg]) : out;
  };

  add(cap.schemaVersion !== 0, `schemaVersion must be 0 (got ${String(cap.schemaVersion)})`);

  const fetchedAtRefPresent = cap.freshness.fetchedAtRef !== null && cap.freshness.fetchedAtRef.length > 0;
  // DAG derive consistency（各能力は edges 入力以上を主張しない）
  const derived = deriveCapabilityFlagsFromParts({
    mode: cap.identity.transportMode,
    durationSignalPresent: cap.duration.durationSignalPresent,
    durationBasis: cap.duration.durationBasis,
    durationScopeBounded: cap.duration.durationScopeBounded,
    departureTimeScoped: cap.temporal.departureTimeScoped,
    arrivalTargetScoped: cap.temporal.arrivalTargetScoped,
    temporalFreshnessEvaluated: cap.temporal.temporalFreshnessEvaluated,
    conditionModelStatus: cap.condition.conditionModelStatus,
    freshnessStatus: cap.freshness.freshnessStatus,
    fetchedAtRefPresent,
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
    cap.leaveBy.leaveByComputable !== derived.leaveByComputable,
    `leaveByComputable must equal DAG derive ${String(derived.leaveByComputable)}`,
  );

  // projection grade ALLOWLIST: 非 projection-grade basis は arrivalProjection を持てない（fail-closed・明示 invariant）
  add(
    !durationProjectionGradeOk(cap.duration.durationBasis) && cap.planning.arrivalProjectionKnown,
    `non-projection-grade durationBasis (${redactIfRaw(cap.duration.durationBasis)}) must not yield arrivalProjectionKnown`,
  );

  // freshness evidence: planning usable は freshnessStatus=fresh かつ fetchedAtRef 必須（self-claim fresh を弾く・RD2d-a-B）
  add(
    cap.planning.timeEstimateUsableForPlanning && cap.freshness.freshnessStatus !== "fresh",
    "timeEstimateUsableForPlanning requires freshnessStatus fresh",
  );
  add(
    cap.planning.timeEstimateUsableForPlanning && !fetchedAtRefPresent,
    "timeEstimateUsableForPlanning requires freshness evidence (fetchedAtRef)",
  );

  // route evidence parity: route flag を立てるなら field-level route evidenceRef が必要（flags-without-evidence 禁止）
  const hasRouteEvidence = cap.evidenceRefs.some((e) => e.capability === "route");
  add(cap.route.routeShapeKnown && !hasRouteEvidence, "routeShapeKnown requires a route evidenceRef");
  add(cap.route.routeOptionKnown && !hasRouteEvidence, "routeOptionKnown requires a route evidenceRef");

  // condition-basis coherence: heuristic は traffic/schedule/weather aware の condition を持てない（incoherent lie-up）
  add(
    cap.duration.durationBasis === "heuristic" &&
      (cap.condition.conditionModelStatus === "traffic_aware" ||
        cap.condition.conditionModelStatus === "schedule_aware" ||
        cap.condition.conditionModelStatus === "weather_aware"),
    "heuristic basis cannot carry a condition-modeled status (traffic/schedule/weather aware)",
  );

  // heuristic 境界（displayPolicy は derive で導けないので明示・projection 系は ALLOWLIST と二重防御）
  if (cap.duration.durationBasis === "heuristic") {
    add(cap.planning.arrivalProjectionKnown, "heuristic must not yield arrivalProjectionKnown");
    add(cap.planning.timeEstimateUsableForPlanning, "heuristic must not yield timeEstimateUsableForPlanning");
    add(cap.leaveBy.leaveByComputable, "heuristic must not yield leaveByComputable");
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

  // user_confirmed は evidence 必須
  add(
    cap.duration.durationBasis === "user_confirmed" && cap.evidenceRefs.length === 0,
    "user_confirmed duration requires non-empty evidenceRefs",
  );
  // external/cached は providerKind/Version 必須
  if (cap.duration.durationBasis === "external_route" || cap.duration.durationBasis === "cached_route") {
    add(cap.identity.providerKind.length === 0, "external/cached duration requires providerKind");
    add(cap.identity.providerVersion.length === 0, "external/cached duration requires providerVersion");
  }

  // origin conflict
  add(
    cap.originConflict.currentObservationOverrodeConfirmed !== false,
    "current observation must not override user_confirmed origin (currentObservationOverrodeConfirmed must be false)",
  );
  add(
    cap.originConflict.originConflictStatus === "conflict" && cap.leaveBy.leaveByComputable,
    "origin conflict must force leaveByComputable false",
  );

  // endpoint pair gate（leaveBy 条件でない sibling）
  out = out.concat(endpointPairPrivacyViolations(cap.pairPrivacy));

  // raw 座標 / polyline / route response の混入を serialized-output backstop
  const json = JSON.stringify(cap).toLowerCase();
  out = out.concat(FORBIDDEN_RAW_TOKENS.filter((t) => json.includes(t)).map((t) => `output leaks raw token: ${t}`));
  if (COORD_PATTERN.test(json) || COORD_PAIR_PATTERN.test(json)) {
    out = out.concat(["output contains raw coordinate pattern (refs must be opaque)"]);
  }

  // INV-NO-RAW-ECHO: 違反 message 自体が raw 座標値を echo していないか（leak guard を message が defeat しない）
  const echoed = out.filter((v) => COORD_PATTERN.test(v) || COORD_PAIR_PATTERN.test(v));
  out = out.concat(echoed.map(() => "violation message must not echo raw coordinate value"));

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
    /** privacy guard による local heuristic override（default `!eitherEndpointSensitive`・tighten のみ可・sensitive は loosen 不可） */
    readonly localHeuristicAllowed?: boolean;
  };
  readonly evidenceRefs?: ReadonlyArray<RouteEtaEvidenceRef>;
  readonly missingInputs?: ReadonlyArray<RouteEtaMissingInput>;
  readonly subjectNodeId?: string | null;
  readonly displayPolicy?: RouteEtaDisplayPolicyV0;
}

function deriveConfidence(basis: DurationBasisV0, planningUsable: boolean, signalPresent: boolean): ActionConfidenceV0 {
  if (!planningUsable) return signalPresent ? "low" : "none";
  return basis === "user_confirmed" ? "high" : "moderate";
}

/** buildRouteEtaCapability — DAG/gate を derive して常に整合な RouteEtaCapabilityV0 を返す */
export function buildRouteEtaCapability(input: BuildRouteEtaCapabilityInput): RouteEtaCapabilityV0 {
  const flags = deriveCapabilityFlagsFromParts({
    mode: input.identity.transportMode,
    durationSignalPresent: input.duration.durationSignalPresent,
    durationBasis: input.duration.durationBasis,
    durationScopeBounded: input.duration.durationScopeBounded,
    departureTimeScoped: input.temporal.departureTimeScoped,
    arrivalTargetScoped: input.temporal.arrivalTargetScoped,
    temporalFreshnessEvaluated: input.temporal.temporalFreshnessEvaluated,
    conditionModelStatus: input.condition.conditionModelStatus,
    freshnessStatus: input.freshness.freshnessStatus,
    fetchedAtRefPresent: input.freshness.fetchedAtRef !== null && input.freshness.fetchedAtRef.length > 0,
    originUsableForLeaveBy: input.originUsableForLeaveBy,
    bufferKnown: input.bufferKnown,
    originConflictStatus: input.originConflict.originConflictStatus,
  });
  const gate = deriveEndpointPairGate(input.pairPrivacyParts);
  // localHeuristicAllowed: privacy guard override（あれば）を採用。但し sensitive では default(false)を超えて loosen しない
  const localHeuristicAllowed =
    input.pairPrivacyParts.localHeuristicAllowed === undefined
      ? gate.localHeuristicAllowedDefault
      : input.pairPrivacyParts.localHeuristicAllowed && gate.localHeuristicAllowedDefault;
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
        input.duration.durationSignalPresent,
      ),
    },
    leaveBy: {
      originUsableForLeaveBy: input.originUsableForLeaveBy,
      bufferKnown: input.bufferKnown,
      leaveByComputable: flags.leaveByComputable,
    },
    originConflict: input.originConflict,
    pairPrivacy: {
      originEndpointSensitive: input.pairPrivacyParts.originEndpointSensitive,
      destinationEndpointSensitive: input.pairPrivacyParts.destinationEndpointSensitive,
      currentObservationInvolved: input.pairPrivacyParts.currentObservationInvolved,
      homeWorkDerivedInvolved: input.pairPrivacyParts.homeWorkDerivedInvolved,
      eitherEndpointSensitive: gate.eitherEndpointSensitive,
      pairExternalSendAllowed: gate.pairExternalSendAllowed,
      localHeuristicAllowed,
      coordinatePrecisionPolicy: gate.pairExternalSendAllowed ? "minimized" : "not_sending",
      rawCoordinateLoggingProhibited: true,
    },
    evidenceRefs: input.evidenceRefs ?? [],
    missingInputs: input.missingInputs ?? [],
    subjectNodeId: input.subjectNodeId ?? null,
    displayPolicy,
  };
}
