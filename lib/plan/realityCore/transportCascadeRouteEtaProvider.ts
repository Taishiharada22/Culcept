/**
 * transportCascadeRouteEtaProvider — RD2d-c 既存 transport cascade を RouteEtaProvider 形へ翻訳する pure wrapper
 *
 * 正本: docs/reality-transport-cascade-consume-rd2d-c0.md（+ RD2d-c0A 補正）/ CEO RD2d-c 実装 GO（2026-06-14・pure wrapper）
 *
 * 思想（wrapper は翻訳層・判断層でない）: cascade（heuristic/unresolved）出力を `RouteEtaProviderResultV0` に正規化して
 *   RD2d-b adapter に注入できる shape にするだけ。**能力判定（arrivalProjection/planning/leaveBy）は一切しない** —
 *   それは RD2d-b adapter + RD2d-a-B walker が DAG で行う。
 *
 * coordinate boundary（RD2d-c0A §12・核心安全則）:
 *   - public adapter-facing input（RouteEtaAdapterInputV0）= **opaque refs のみ**。
 *   - **wrapper は raw 座標を直接持たない**: private coordinate input は wrapper にとって **opaque ハンドル**で、実座標は
 *     注入された resolver/heuristic の内部に閉じる。wrapper は座標を route も serialize もできない（leak 構造的に不可能）。
 *   - private input が無い → no_route。localHeuristicAllowed=false → heuristic を呼ばない → no_route。
 *
 * 規律（CEO）: heuristicDistanceProvider/cascadeOrchestrator/Google Routes/external API/currentLocation/geolocation/
 *   weather/RC2a/MovementReality を **import しない**（cascade は依存注入）。heuristic を external/cached/user_confirmed に
 *   stamp しない。manual shell を user_confirmed にしない。unresolved → no_route。pure（IO・時刻・乱数なし・注入関数のみ await）。
 */

import {
  routeEtaProviderResultViolations,
  type RouteEtaAdapterInputV0,
  type RouteEtaProvider,
  type RouteEtaProviderResultV0,
} from "./routeEtaProviderAdapter";
import { deriveEndpointPairGate } from "./routeEtaCapability";

export const TRANSPORT_CASCADE_ROUTE_ETA_PROVIDER_VERSION = 0;

/** public adapter-facing input（opaque refs のみ・RouteEtaAdapterInputV0 と同一） */
export type TransportCascadeRouteEtaProviderInputV0 = RouteEtaAdapterInputV0;

/**
 * private coordinate-bearing input — **wrapper にとって opaque ハンドル**。実座標は注入 resolver/heuristic の内部に閉じ、
 * wrapper はこのハンドルを heuristic に渡すだけで中身（lat/lng）を見ない。server-only・非 client・非 loggable。
 */
export interface TransportCascadePrivateCoordinateInputV0 {
  readonly kind: "private_coordinate_bearing";
  readonly opaqueHandle: string;
}

export interface TransportCascadeProviderOptionsV0 {
  readonly providerVersion: string;
}

export type TransportCascadeStageV0 =
  | "heuristic_resolved"
  | "no_private_input"
  | "local_heuristic_blocked"
  | "heuristic_unresolved";

export interface TransportCascadeProviderTraceV0 {
  readonly stage: TransportCascadeStageV0;
  readonly opaqueRouteRef: string | null;
}

/** 注入 heuristic（Haversine 等）の出力（opaque・raw 座標/距離なし） */
export interface LocalHeuristicResultV0 {
  readonly durationSignalPresent: boolean;
  /** opaque route ref（raw 座標/polyline なし・RD2d-b の leak guard を通る形） */
  readonly opaqueRouteRef: string;
}

/**
 * 依存注入（cascade は wrapper の外側で wire・wrapper は import しない）:
 * - resolvePrivateCoordinates: opaque refs → private coordinate input（無ければ null）。named server-only resolver。
 * - runLocalHeuristic: private coordinate input → 所要 signal（opaque）。注入された heuristicDistanceProvider 相当。
 */
export interface TransportCascadeProviderDepsV0 {
  readonly resolvePrivateCoordinates: (
    input: TransportCascadeRouteEtaProviderInputV0,
  ) => Promise<TransportCascadePrivateCoordinateInputV0 | null> | TransportCascadePrivateCoordinateInputV0 | null;
  readonly runLocalHeuristic: (
    priv: TransportCascadePrivateCoordinateInputV0,
  ) => Promise<LocalHeuristicResultV0 | null> | LocalHeuristicResultV0 | null;
}

// ── normalize helpers ──────────────────────────────────────────────────────────────────────

function noRouteResult(): RouteEtaProviderResultV0 {
  return {
    status: "no_route",
    providerKind: "unresolved",
    providerVersion: "",
    durationBasis: "none",
    durationSignalPresent: false,
    durationScopeBounded: false,
    routeShapePresent: false,
    routeOptionPresent: false,
    conditionModelStatus: "unknown",
    opaqueRouteRef: null,
    freshnessStatus: "stale",
    freshnessBasisRef: null,
  };
}

function heuristicResult(
  input: TransportCascadeRouteEtaProviderInputV0,
  options: TransportCascadeProviderOptionsV0,
  h: LocalHeuristicResultV0,
): RouteEtaProviderResultV0 {
  return {
    status: "ok",
    providerKind: "heuristic_distance",
    providerVersion: options.providerVersion,
    durationBasis: "heuristic", // 正直 stamp（external/cached/user_confirmed に偽装しない）
    durationSignalPresent: true, // signal のみ（durationProjectionGradeOk(heuristic)=false ＝ projection 不可）
    durationScopeBounded: input.originRef !== null && input.destinationRef !== null,
    routeShapePresent: false, // straight-line は route shape でない
    routeOptionPresent: false,
    conditionModelStatus: "static_assumption", // traffic/schedule aware に偽装しない（coherence）
    opaqueRouteRef: h.opaqueRouteRef, // opaque（raw 座標なし）
    freshnessStatus: "stale", // 実 ETA でない（projection に上がらないので影響なし）
    freshnessBasisRef: null,
  };
}

/** local heuristic を使ってよいか（pairExternalSendAllowed と直交・sensitive/current/home-work は false） */
function localHeuristicAllowedFor(input: TransportCascadeRouteEtaProviderInputV0): boolean {
  return deriveEndpointPairGate(input.pairPrivacyParts).localHeuristicAllowedDefault;
}

// ── wrapper 本体 ─────────────────────────────────────────────────────────────────────────

/**
 * resolveTransportCascadeProvider — 翻訳 + trace（pure・能力判定しない）。
 * localHeuristicAllowed gate → private coordinate 解決 → 注入 heuristic → heuristic 正規化。失敗は全て no_route。
 */
export async function resolveTransportCascadeProvider(
  input: TransportCascadeRouteEtaProviderInputV0,
  deps: TransportCascadeProviderDepsV0,
  options: TransportCascadeProviderOptionsV0,
): Promise<{ result: RouteEtaProviderResultV0; trace: TransportCascadeProviderTraceV0 }> {
  // 1. local heuristic gate（raw 座標を local でも消費してよいか）
  if (!localHeuristicAllowedFor(input)) {
    return { result: noRouteResult(), trace: { stage: "local_heuristic_blocked", opaqueRouteRef: null } };
  }
  // 2. private coordinate input（無ければ no_route・fixture へ fallback しない）
  const priv = await deps.resolvePrivateCoordinates(input);
  if (priv === null) {
    return { result: noRouteResult(), trace: { stage: "no_private_input", opaqueRouteRef: null } };
  }
  // 3. 注入 heuristic（wrapper は priv の中身[座標]を見ず handle を渡すだけ）
  const h = await deps.runLocalHeuristic(priv);
  if (h === null || !h.durationSignalPresent) {
    return { result: noRouteResult(), trace: { stage: "heuristic_unresolved", opaqueRouteRef: null } };
  }
  // 4. heuristic 正規化（durationBasis=heuristic・signal 止まり）
  return {
    result: heuristicResult(input, options, h),
    trace: { stage: "heuristic_resolved", opaqueRouteRef: h.opaqueRouteRef },
  };
}

/**
 * createTransportCascadeRouteEtaProvider — RD2d-b adapter の deps.provider に注入できる RouteEtaProvider を返す。
 */
export function createTransportCascadeRouteEtaProvider(
  deps: TransportCascadeProviderDepsV0,
  options: TransportCascadeProviderOptionsV0,
): RouteEtaProvider {
  return async (input) => (await resolveTransportCascadeProvider(input, deps, options)).result;
}

// ── violations（input/result の opaque 性・raw 不露出を検証） ────────────────────────────────

const FORBIDDEN_TOKENS: ReadonlyArray<string> = [
  "polyline",
  "encodedpolyline",
  "latitude",
  "longitude",
  "geometry",
  "coordinates",
  "waypoints",
  "address",
];
const COORD_PATTERN = /\d{1,3}\.\d{4,}/;
const COORD_PAIR_PATTERN = /-?\d{1,3}\.\d{2,}\s*[,;]\s*-?\d{1,3}\.\d{2,}/;

/** public input が opaque-only（raw 座標が混入していない）ことを検証（空 = 健全） */
export function transportCascadeProviderInputViolations(input: TransportCascadeRouteEtaProviderInputV0): string[] {
  let out: string[] = [];
  const json = JSON.stringify(input).toLowerCase();
  out = out.concat(FORBIDDEN_TOKENS.filter((t) => json.includes(t)).map((t) => `public input leaks raw token: ${t}`));
  if (COORD_PATTERN.test(json) || COORD_PAIR_PATTERN.test(json)) {
    out = out.concat(["public input contains raw coordinate pattern (opaque refs only)"]);
  }
  return out;
}

/**
 * wrapper result が RD2d-b の provider result 規律を通り、heuristic invariant を満たすことを検証（空 = 健全）。
 */
export function transportCascadeProviderResultViolations(result: RouteEtaProviderResultV0): string[] {
  let out: string[] = routeEtaProviderResultViolations(result).slice();
  const add = (cond: boolean, msg: string): void => {
    out = cond ? out.concat([msg]) : out;
  };
  // heuristic は signal 止まり（projection-grade にしない・route shape なし・condition は static/na/unknown）
  if (result.durationBasis === "heuristic") {
    add(result.routeShapePresent, "heuristic result must not claim routeShapePresent");
    add(
      result.conditionModelStatus === "traffic_aware" ||
        result.conditionModelStatus === "schedule_aware" ||
        result.conditionModelStatus === "weather_aware",
      "heuristic result must not claim a condition-modeled status",
    );
  }
  // no_route は durationSignal を持たない
  add(result.status === "no_route" && result.durationSignalPresent, "no_route result must not carry a duration signal");
  return out;
}
