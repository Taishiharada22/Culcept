/**
 * routeEtaProviderAdapter — RD2d-b provider 出力 → RouteEtaCapabilityV0 の pure 写像 adapter
 *
 * 正本: docs/reality-route-eta-provider-adapter-rd2d-b0.md（RD2d-b0A 同期版）/ CEO RD2d-b 実装 GO（2026-06-14・pure adapter）
 *
 * 思想（adapter は能力を上げない）: provider 出力をそのまま信用せず、**必ず RD2d-a-A の capability DAG
 *   （deriveCapabilityFlagsFromParts・buildRouteEtaCapability 内部）+ walker（routeEtaCapabilityViolations）を通す**。
 *   adapter が arrivalProjectionKnown / timeEstimateUsableForPlanning / leaveByComputable を**直接立てない**。
 *
 * 純粋性（RD2b placeCandidateAdapter と同型）: provider は引数注入（adapter は cascade/heuristicProvider/external を
 *   import しない・叩かない）。provider 未注入/failure/malformed → no_route_source に fail-safe。
 *
 * fail-closed mapping:
 *   - durationBasis が durationProjectionGradeOk allowlist 外（heuristic/none/unknown）→ projection 不可
 *   - condition adequate だけ / scope bounded なし / temporal 未 scope / stale → projection 不可（DAG が落とす）
 *   - provider が overclaim しても最終 routeEtaCapabilityViolations で検出（fail loud）
 *   - heuristic → durationSignalPresent 止まり・displayPolicy internalReference|debugOnly・action input にしない
 *
 * raw 不露出: adapter は provider の opaqueRouteRef を capability に**載せない**（capability は能力 flag のみ）。
 *   provider result に raw 座標が混入しても routeEtaProviderResultViolations が input 境界で検出 → no_route_source。
 *
 * 規律（CEO）: MovementReality / compileMovementReality / RC2a compile / routeKnown-etaKnown-leaveByKnown 既存出力 /
 *   dogfood preview / UI / Alter tab / 本線 / cascade / heuristicProvider / external API / currentLocation / weather 不接触。
 *   adapter は RouteEtaCapabilityV0 を返すまで。pure（IO・時刻 API・乱数・navigator なし。provider await のみ）。
 */

import {
  buildRouteEtaCapability,
  routeEtaCapabilityViolations,
  durationProjectionGradeOk,
  type RouteEtaCapabilityV0,
  type RouteEtaIdentityBasisV0,
  type TemporalCapabilityV0,
  type OriginConflictForRouteV0,
  type OpaqueEndpointRef,
  type TransportModeV0,
  type DurationBasisV0,
  type ConditionModelStatusV0,
  type RouteEtaFreshnessStatusV0,
  type RouteEtaEvidenceRef,
  type RouteEtaMissingInput,
} from "./routeEtaCapability";
import {
  containsRawLocation,
  redactRouteEtaUnsafeValue,
  routeEtaSafeExceptionReason,
} from "./routeEtaSafety";
import {
  deriveDurationValueFromProviderResult,
  durationValueViolations,
  bindDurationValueToCapability,
  type PlanningGradeDurationValueV0,
} from "./routeEtaDurationValue";

export const ROUTE_ETA_PROVIDER_ADAPTER_VERSION = 0;

export type RouteEtaProviderStatusV0 = "ok" | "no_route" | "failed";

export type RouteEtaProviderKindV0 =
  | "unresolved"
  | "heuristic_distance"
  | "transit_schedule"
  | "user_manual"
  | "external_route"
  | "route_cache";

/** provider が返す result（raw 座標/polyline を含まない opaque 契約） */
export interface RouteEtaProviderResultV0 {
  readonly status: RouteEtaProviderStatusV0;
  readonly providerKind: RouteEtaProviderKindV0;
  readonly providerVersion: string;
  readonly durationBasis: DurationBasisV0;
  /** 「所要が分かった」でなく duration signal の有無のみ */
  readonly durationSignalPresent: boolean;
  readonly durationScopeBounded: boolean;
  readonly routeShapePresent: boolean;
  readonly routeOptionPresent: boolean;
  readonly conditionModelStatus: ConditionModelStatusV0;
  /** internal opaque route ref（raw 座標不可・evidenceRef に opaque trace として残す・RD2d-b-A） */
  readonly opaqueRouteRef: string | null;
  readonly freshnessStatus: RouteEtaFreshnessStatusV0;
  /** freshness の根拠 opaque ref（fetchedAt/validUntil 相当）。fresh は basis 無しでは planning に上げない（RD2d-b-A self-claim 防御） */
  readonly freshnessBasisRef: string | null;
  /**
   * RD2d-b-VALUE: leaveBy 計算燃料の生分（fractional 可・未 ceil）。adapter が ceil → safe upper bound 化して捨てる。
   * raw seconds / raw payload は載せない（minutes のみ）。未供給 = null = value channel なし。
   */
  readonly durationMinutesRaw?: number | null;
  readonly durationLowerMinutesRaw?: number | null;
}

export type RouteEtaProviderFailureReasonV0 =
  | "not_injected"
  | "provider_failed"
  | "no_route"
  | "raw_route_data_detected"
  | "malformed_enum"
  | "malformed_result"
  | "basis_unknown"
  | "no_duration_signal"
  | "dependency_error"; // provider が throw/reject した時（RD2d-b-B2・raw を一切 echo しない）

export type RouteEtaAdapterStageV0 = "resolved" | "duration_signal_only" | "no_route_source";

/** adapter 入力 = request context（provider が埋める duration/condition/freshness は含まない） */
export interface RouteEtaAdapterInputV0 {
  readonly originRef: OpaqueEndpointRef | null;
  readonly destinationRef: OpaqueEndpointRef | null;
  readonly targetNodeId: string | null;
  readonly subjectiveDate: string | null;
  readonly transportMode: TransportModeV0;
  readonly temporalScopeRef: string | null;
  readonly routeOptionsRef: string | null;
  readonly routeInputRevision: string | null;
  readonly temporal: TemporalCapabilityV0;
  readonly originUsableForLeaveBy: boolean;
  readonly bufferKnown: boolean;
  readonly originConflict: OriginConflictForRouteV0;
  readonly pairPrivacyParts: {
    readonly originEndpointSensitive: boolean;
    readonly destinationEndpointSensitive: boolean;
    readonly currentObservationInvolved: boolean;
    readonly homeWorkDerivedInvolved: boolean;
  };
  readonly subjectNodeId: string | null;
}

export type RouteEtaProvider = (input: RouteEtaAdapterInputV0) => Promise<RouteEtaProviderResultV0>;

export interface RouteEtaAdapterDepsV0 {
  readonly provider?: RouteEtaProvider;
}

export interface RouteEtaAdapterOutputV0 {
  readonly capability: RouteEtaCapabilityV0 | null;
  /**
   * RD2d-b-VALUE: leaveBy 計算用の internal-only duration value（**sibling return**・capability に nest しない）。
   * server-only・consumer 非露出。null = value channel なし（heuristic/exception/numeric 欠如）。
   * 数値があっても usableForLeaveByComputation=false なら leaveBy 不可（二鍵）。
   */
  readonly durationValue: PlanningGradeDurationValueV0 | null;
  readonly stage: RouteEtaAdapterStageV0;
  readonly resolved: boolean;
  readonly failureReason: RouteEtaProviderFailureReasonV0 | null;
  readonly violations: ReadonlyArray<string>;
}

// ── provider result の input 境界 validation（raw 座標 / enum / 整合） ───────────────────────

const PROVIDER_KINDS: ReadonlyArray<RouteEtaProviderKindV0> = [
  "unresolved",
  "heuristic_distance",
  "transit_schedule",
  "user_manual",
  "external_route",
  "route_cache",
];
const DURATION_BASES: ReadonlyArray<DurationBasisV0> = [
  "none",
  "heuristic",
  "scheduled",
  "user_confirmed",
  "external_route",
  "cached_route",
];
const CONDITION_STATUSES: ReadonlyArray<ConditionModelStatusV0> = [
  "traffic_aware",
  "schedule_aware",
  "weather_aware",
  "static_assumption",
  "not_applicable",
  "unknown",
];
const FRESHNESS_STATUSES: ReadonlyArray<RouteEtaFreshnessStatusV0> = ["fresh", "stale", "expired"];

// raw-leak 検出は shared routeEtaSafety に集約（RD2d-b-B・全層で同一の最強検出）
const redactIfRaw = redactRouteEtaUnsafeValue;

/** raw-leak signal が立っているか（reason precedence: leak > enum > structural） */
export function providerResultHasRawLeak(r: RouteEtaProviderResultV0): boolean {
  return containsRawLocation(JSON.stringify(r).toLowerCase());
}

/** routeEtaProviderResultViolations — provider result の shape / enum / raw-leak を検証（空 = 健全・値は redact 済） */
export function routeEtaProviderResultViolations(r: RouteEtaProviderResultV0): string[] {
  let out: string[] = [];
  const add = (cond: boolean, msg: string): void => {
    out = cond ? out.concat([msg]) : out;
  };

  // enum 違反 message は raw 値を echo しない（redactIfRaw）
  add(["ok", "no_route", "failed"].indexOf(r.status) < 0, `invalid status: ${redactIfRaw(String(r.status))}`);
  add(PROVIDER_KINDS.indexOf(r.providerKind) < 0, `invalid providerKind: ${redactIfRaw(String(r.providerKind))}`);
  add(DURATION_BASES.indexOf(r.durationBasis) < 0, `invalid durationBasis: ${redactIfRaw(String(r.durationBasis))}`);
  add(CONDITION_STATUSES.indexOf(r.conditionModelStatus) < 0, `invalid conditionModelStatus: ${redactIfRaw(String(r.conditionModelStatus))}`);
  add(FRESHNESS_STATUSES.indexOf(r.freshnessStatus) < 0, `invalid freshnessStatus: ${redactIfRaw(String(r.freshnessStatus))}`);

  // raw-leak（input 境界・message は定数のみ・raw 値を含めない・shared 最強検出）
  if (containsRawLocation(JSON.stringify(r).toLowerCase())) {
    out = out.concat(["provider result contains raw location (coordinate/encoding) — opaque refs only"]);
  }
  return out;
}

// ── adapter 本体 ─────────────────────────────────────────────────────────────────────────

function identityOf(input: RouteEtaAdapterInputV0, providerKind: string, providerVersion: string): RouteEtaIdentityBasisV0 {
  return {
    originRef: input.originRef,
    destinationRef: input.destinationRef,
    targetNodeId: input.targetNodeId,
    subjectiveDate: input.subjectiveDate,
    transportMode: input.transportMode,
    temporalScopeRef: input.temporalScopeRef,
    providerKind,
    providerVersion,
    routeOptionsRef: input.routeOptionsRef,
    routeInputRevision: input.routeInputRevision,
  };
}

/** capability flag から missingInputs を honest に導く（heuristic は route/eta/leaveBy を消さない） */
function deriveMissingInputs(cap: RouteEtaCapabilityV0): RouteEtaMissingInput[] {
  return [
    !cap.route.routeShapeKnown ? { code: "route_missing", whyUnresolved: "route_shape_absent" } : null,
    !cap.planning.timeEstimateUsableForPlanning ? { code: "eta_source_missing", whyUnresolved: "no_planning_grade_eta" } : null,
    !cap.leaveBy.leaveByComputable ? { code: "leaveBy_missing", whyUnresolved: "leaveby_not_computable" } : null,
  ].filter((x): x is RouteEtaMissingInput => x !== null);
}

function withMissingInputs(cap: RouteEtaCapabilityV0): RouteEtaCapabilityV0 {
  return { ...cap, missingInputs: deriveMissingInputs(cap) };
}

/** no_route_source capability（fake 候補なし・durationSignalPresent=false） */
function buildNoRouteSource(
  input: RouteEtaAdapterInputV0,
  reason: RouteEtaProviderFailureReasonV0,
  extraViolations: ReadonlyArray<string> = [],
): RouteEtaAdapterOutputV0 {
  const cap = buildRouteEtaCapability({
    identity: identityOf(input, "", ""),
    route: {
      transportModeKnown: input.transportMode !== "unknown",
      routeShapeKnown: false,
      routeOptionKnown: false,
      providerKindKnown: false,
    },
    duration: { durationSignalPresent: false, durationBasis: "none", durationScopeBounded: false },
    temporal: input.temporal,
    condition: { conditionModelStatus: "unknown" },
    freshness: { freshnessStatus: "stale", staleReason: reason, fetchedAtRef: null, validUntilRef: null },
    originUsableForLeaveBy: input.originUsableForLeaveBy,
    bufferKnown: input.bufferKnown,
    originConflict: input.originConflict,
    pairPrivacyParts: input.pairPrivacyParts,
    evidenceRefs: [],
    subjectNodeId: input.subjectNodeId,
    displayPolicy: "hidden",
  });
  const finalCap = withMissingInputs(cap);
  return {
    capability: finalCap,
    durationValue: null, // no_route_source は計算燃料を持たない（provider failure/exception/malformed/未注入）
    stage: "no_route_source",
    resolved: false,
    failureReason: reason,
    violations: routeEtaCapabilityViolations(finalCap).concat(extraViolations),
  };
}

/**
 * resolveRouteEtaCapability — provider 出力を DAG/walker 経由で RouteEtaCapabilityV0 に写像（pure adapter）。
 * adapter は能力を直接立てず、buildRouteEtaCapability（内部で deriveCapabilityFlagsFromParts）+ routeEtaCapabilityViolations を通す。
 */
export async function resolveRouteEtaCapability(
  input: RouteEtaAdapterInputV0,
  deps: RouteEtaAdapterDepsV0 = {},
): Promise<RouteEtaAdapterOutputV0> {
  const provider = deps.provider;
  if (provider === undefined) return buildNoRouteSource(input, "not_injected");

  // provider invocation 境界を総関数化（RD2d-b-B2）。
  // 任意 provider が sync throw / async reject しても adapter は throw しない。
  // catch binding を取らない（raw message / stack / payload に一切触れない）→ shared safe reason のみへ倒す。
  let raw: unknown;
  try {
    raw = await provider(input);
  } catch {
    return buildNoRouteSource(input, routeEtaSafeExceptionReason(), [
      "provider invocation failed — raw exception not exposed",
    ]);
  }

  // provider が malformed shape（null / 非 object）を返した場合も総関数で防御（後続の field access throw を遮断）。
  if (raw === null || typeof raw !== "object") {
    return buildNoRouteSource(input, "malformed_result", [
      "provider returned malformed result shape — raw not exposed",
    ]);
  }
  // 形は backstop（routeEtaProviderResultViolations）で検証する。ここでは object であることのみ確定。
  const result = raw as RouteEtaProviderResultV0;

  // provider result 境界 validation（malformed / raw-leak → no_route_source に fail-safe）
  // reason precedence: raw-leak > enum（leak は privacy-contract breach ゆえ独立 loud reason・benign に丸めない）
  const rv = routeEtaProviderResultViolations(result);
  if (rv.length > 0) {
    return buildNoRouteSource(input, providerResultHasRawLeak(result) ? "raw_route_data_detected" : "malformed_enum", rv);
  }

  if (result.status === "failed") return buildNoRouteSource(input, "provider_failed");
  if (result.status === "no_route") return buildNoRouteSource(input, "no_route");

  // status ok だが basis 不正/none/signal なし → fail-safe
  if (result.durationBasis === "none") return buildNoRouteSource(input, "basis_unknown");
  if (!result.durationSignalPresent) return buildNoRouteSource(input, "no_duration_signal");

  // self-claim corroboration（provider を信用しきらない・adapter-side trusted context で gate）
  // freshness: 'fresh' は基準 ref（freshnessBasisRef）が無ければ planning に上げない → stale へ downgrade
  const freshnessSubstantiated = result.freshnessBasisRef !== null && result.freshnessBasisRef.length > 0;
  const effectiveFreshness: RouteEtaFreshnessStatusV0 =
    result.freshnessStatus === "fresh" && !freshnessSubstantiated ? "stale" : result.freshnessStatus;
  const freshnessStaleReason =
    result.freshnessStatus === "fresh" && !freshnessSubstantiated ? "freshness_unsubstantiated" : null;
  // scope bounded: trusted caller context（origin/dest present）が無ければ provider の scopeBounded を信じない
  const effectiveScopeBounded = result.durationScopeBounded && input.originRef !== null && input.destinationRef !== null;

  // evidenceRefs: duration + route（flag を立てるなら field-level route evidence・opaqueRouteRef は opaque trace のみ）
  const evidenceRefs: RouteEtaEvidenceRef[] = [
    { code: `provider:${result.durationBasis}`, capability: "duration", source: result.durationBasis },
    ...(result.routeShapePresent
      ? [{ code: `route:shape:${result.providerKind}@${result.providerVersion}#${result.opaqueRouteRef ?? "noref"}`, capability: "route" as const, source: result.durationBasis }]
      : []),
    ...(result.routeOptionPresent
      ? [{ code: `route:option:${result.providerKind}@${result.providerVersion}`, capability: "route" as const, source: result.durationBasis }]
      : []),
  ];

  // capability 構築（必ず DAG derive 経由・adapter は flag を直接立てない）
  const built = buildRouteEtaCapability({
    identity: identityOf(input, result.providerKind, result.providerVersion),
    route: {
      transportModeKnown: input.transportMode !== "unknown",
      routeShapeKnown: result.routeShapePresent,
      routeOptionKnown: result.routeOptionPresent,
      providerKindKnown: result.providerKind.length > 0 && result.providerKind !== "unresolved",
    },
    duration: {
      durationSignalPresent: result.durationSignalPresent,
      durationBasis: result.durationBasis,
      durationScopeBounded: effectiveScopeBounded,
    },
    temporal: input.temporal,
    condition: { conditionModelStatus: result.conditionModelStatus },
    freshness: { freshnessStatus: effectiveFreshness, staleReason: freshnessStaleReason, fetchedAtRef: result.freshnessBasisRef, validUntilRef: null },
    originUsableForLeaveBy: input.originUsableForLeaveBy,
    bufferKnown: input.bufferKnown,
    originConflict: input.originConflict,
    pairPrivacyParts: input.pairPrivacyParts,
    evidenceRefs,
    subjectNodeId: input.subjectNodeId,
  });
  const cap = withMissingInputs(built);

  // walker fail-loud（provider overclaim / raw-leak が built に残れば検出 → 漏れる capability を emit しない）
  const violations = routeEtaCapabilityViolations(cap);
  if (violations.length > 0) {
    return { capability: null, durationValue: null, stage: "no_route_source", resolved: false, failureReason: "malformed_result", violations };
  }

  // RD2d-b-VALUE: capability green の上で duration value（計算燃料）を sibling 生成。
  // raw payload は捨て numeric だけを validated value に昇格。value 自己整合を walker（fail-loud）。
  // value が leak/形不整合なら value を drop（capability は honest に維持・leaveBy は使えないだけ）。
  const dv = deriveDurationValueFromProviderResult(result, cap);
  const durationValue: PlanningGradeDurationValueV0 | null = dv !== null && durationValueViolations(dv).length === 0 ? dv : null;

  const stage: RouteEtaAdapterStageV0 = cap.planning.arrivalProjectionKnown ? "resolved" : "duration_signal_only";
  return { capability: cap, durationValue, stage, resolved: cap.planning.arrivalProjectionKnown, failureReason: null, violations: [] };
}

/** routeEtaAdapterOutputViolations — adapter 出力の整合（capability は walker green・stage/resolved 整合） */
export function routeEtaAdapterOutputViolations(o: RouteEtaAdapterOutputV0): string[] {
  let out: string[] = [];
  const add = (cond: boolean, msg: string): void => {
    out = cond ? out.concat([msg]) : out;
  };

  if (o.capability !== null) {
    out = out.concat(routeEtaCapabilityViolations(o.capability));
    add(
      o.resolved !== o.capability.planning.arrivalProjectionKnown,
      "resolved must equal capability.arrivalProjectionKnown",
    );
    add(
      o.stage === "resolved" && !o.capability.planning.arrivalProjectionKnown,
      "stage resolved requires arrivalProjectionKnown",
    );
    add(
      o.stage === "no_route_source" && o.capability.duration.durationSignalPresent,
      "stage no_route_source must not carry a duration signal",
    );
    // route 系 flag は field-level route evidence が必要（flags-without-evidence 禁止・INV-R1）
    const hasRouteEvidence = o.capability.evidenceRefs.some((e) => e.capability === "route");
    add(o.capability.route.routeShapeKnown && !hasRouteEvidence, "routeShapeKnown requires a route evidenceRef");
    add(o.capability.route.routeOptionKnown && !hasRouteEvidence, "routeOptionKnown requires a route evidenceRef");
  }
  add(o.capability === null && o.resolved, "null capability must not be resolved");
  add(o.resolved && o.failureReason !== null, "resolved output must not carry a failureReason");

  // RD2d-b-VALUE sibling 不変条件（二鍵）
  if (o.durationValue !== null) {
    out = out.concat(durationValueViolations(o.durationValue)); // value 自己整合（leak/形/basis）
    add(o.capability === null, "durationValue must not accompany a null capability"); // value 単独で capability を主張しない
    if (o.durationValue.usableForLeaveByComputation) {
      // 二鍵: usable value は bind 先 capability.timeEstimateUsableForPlanning と full basis 一致が必須
      add(
        o.capability === null || !o.capability.planning.timeEstimateUsableForPlanning,
        "usable durationValue requires bound capability timeEstimateUsableForPlanning",
      );
      if (o.capability !== null) {
        add(!bindDurationValueToCapability(o.durationValue, o.capability).matched, "usable durationValue must match capability full binding basis");
      }
    }
  }
  // contract violation を benign に丸めない: malformed/raw failureReason は violation を伴う（INV-SURVIVE）
  add(
    (o.failureReason === "raw_route_data_detected" || o.failureReason === "malformed_enum" || o.failureReason === "malformed_result") &&
      o.violations.length === 0,
    "malformed/raw failureReason must carry violations",
  );
  // violation message 自体が raw 座標/位置を echo しない（leak guard を message が defeat しない・INV-NO-RAW-ECHO・shared 検出）
  const echoed = o.violations.filter((v) => containsRawLocation(v.toLowerCase()));
  out = out.concat(echoed.map(() => "violation message must not echo raw location value"));
  return out;
}
