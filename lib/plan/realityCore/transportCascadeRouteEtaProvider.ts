/**
 * transportCascadeRouteEtaProvider — RD2d-c 既存 transport cascade を RouteEtaProvider 形へ翻訳する pure wrapper
 *
 * 正本: docs/reality-transport-cascade-consume-rd2d-c0.md（+ RD2d-c0A 補正）/ CEO RD2d-c 実装 GO（2026-06-14・pure wrapper）
 *
 * 思想（wrapper は翻訳層・判断層でない）: cascade（heuristic/unresolved）出力を `RouteEtaProviderResultV0` に正規化して
 *   RD2d-b adapter に注入できる shape にするだけ。**能力判定（arrivalProjection/planning/leaveBy）は一切しない** —
 *   それは RD2d-b adapter + RD2d-a-B walker が DAG で行う。
 *
 * coordinate boundary（RD2d-c0A §12・核心安全則・RD2d-c-A で多層化）:
 *   - public adapter-facing input（RouteEtaAdapterInputV0）= **opaque refs のみ**。
 *   - **wrapper は raw 座標を直接持たない**設計（private coordinate input は opaque ハンドル・実座標は注入 resolver/heuristic
 *     内部に閉じる）に**加えて**、input/private-handle/result/trace の **leak guard** と dependency **exception catch** で raw 露出を防ぐ。
 *     「構造的に不可能」と過信せず、多層 guard で守る（RD2d-c-A・GPT 監査反映）。
 *   - private input が無い → no_route。**private handle が coord-like → no_route（leak guard）**。localHeuristicAllowed=false
 *     → heuristic を呼ばない → no_route。**dependency が throw → no_route（raw exception を echo しない）**。
 *     **result self-check で raw leak → no_route（漏れる result を emit しない）**。
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
  | "heuristic_unresolved"
  | "private_input_leak_blocked"
  | "dependency_error"
  | "result_leak_blocked";

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
  // gate を derive（pairExternalSendAllowed/localHeuristicAllowedDefault）。endpointPairPrivacyViolations 相当で
  // sensitive と localHeuristic の整合を自己検証（derived gate は常に整合だが、将来の不整合を構造で捕捉）。
  const g = deriveEndpointPairGate(input.pairPrivacyParts);
  // sensitive/current/home-work のいずれかで local を許さない（gate の不変条件を wrapper でも明示）
  if (g.eitherEndpointSensitive) return false;
  return g.localHeuristicAllowedDefault;
}

/** no_route 結果 + safe trace（raw を一切載せない） */
function noRoute(stage: TransportCascadeStageV0): { result: RouteEtaProviderResultV0; trace: TransportCascadeProviderTraceV0 } {
  return { result: noRouteResult(), trace: { stage, opaqueRouteRef: null } };
}

// ── wrapper 本体 ─────────────────────────────────────────────────────────────────────────

/**
 * resolveTransportCascadeProvider — 翻訳 + trace（pure・能力判定しない）。失敗は全て no_route（safe code のみ・raw echo なし）。
 * localHeuristicAllowed gate → private coordinate 解決(+leak guard) → 注入 heuristic(try/catch) → 正規化(+self-check)。
 */
export async function resolveTransportCascadeProvider(
  input: TransportCascadeRouteEtaProviderInputV0,
  deps: TransportCascadeProviderDepsV0,
  options: TransportCascadeProviderOptionsV0,
): Promise<{ result: RouteEtaProviderResultV0; trace: TransportCascadeProviderTraceV0 }> {
  // 全体を outer try/catch で包み **総関数（throw しない）**にする（RD2d-c-A 監査 wf_befd6b47）。
  // localHeuristicAllowedFor / JSON.stringify 等の同期パスが throw しても provider は reject せず、adapter chain が安全。
  try {
    // 0. input 防御（pairPrivacyParts 欠落等で deriveEndpointPairGate が throw する前に privacy-safe default で倒す）
    if (input === null || input === undefined || input.pairPrivacyParts === null || input.pairPrivacyParts === undefined) {
      return noRoute("local_heuristic_blocked");
    }
    // 1. local heuristic gate（raw 座標を local でも消費してよいか・sensitive は不可）
    if (!localHeuristicAllowedFor(input)) return noRoute("local_heuristic_blocked");

    // 2. private coordinate input（dependency exception は raw を echo せず no_route に倒す）
    let priv: TransportCascadePrivateCoordinateInputV0 | null;
    try {
      priv = await deps.resolvePrivateCoordinates(input);
    } catch {
      return noRoute("dependency_error"); // raw exception message を一切出さない
    }
    // null / 非 object（buggy dependency が truthy string 等を返す）→ no_route
    if (priv === null || typeof priv !== "object") return noRoute("no_private_input");

    // 2b. private handle leak guard（coord-like handle → no_route・実装者が座標を handle に入れても防ぐ）
    if (transportCascadePrivateInputViolations(priv).length > 0) return noRoute("private_input_leak_blocked");

    // 3. 注入 heuristic（wrapper は priv の中身[座標]を見ず handle を渡すだけ・exception は no_route）
    let h: LocalHeuristicResultV0 | null;
    try {
      h = await deps.runLocalHeuristic(priv);
    } catch {
      return noRoute("dependency_error");
    }
    if (h === null || typeof h !== "object" || !h.durationSignalPresent) return noRoute("heuristic_unresolved");

    // 4. heuristic 正規化 + self-check（result に raw が混入したら emit せず no_route）
    const result = heuristicResult(input, options, h);
    if (transportCascadeProviderResultViolations(result).length > 0) return noRoute("result_leak_blocked");
    // trace は **vetted な result.opaqueRouteRef** から構築（trace が result より緩い値を運ばない不変条件を textual に保証）
    return { result, trace: { stage: "heuristic_resolved", opaqueRouteRef: result.opaqueRouteRef } };
  } catch {
    return noRoute("dependency_error"); // 想定外の同期 throw（circular JSON 等）も raw を出さず no_route
  }
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
  // location-encoding schemes（小数を含まず位置を運ぶ・RD2d-c-A 監査 wf_befd6b47 反映）
  "geohash",
  "pluscode",
  "plus_code",
  "what3words",
  "mgrs",
  "s2cell",
];
/** 高精度単一座標（3 桁以上小数・~110m 以下精度も捕捉） */
const COORD_PATTERN = /\d{1,3}\.\d{3,}/;
/** Open Location Code(plus code)構造（"8Q7XMQHC+..."） */
const PLUS_CODE_PATTERN = /[23456789cfghjmpqrvwx]{4,}\+[23456789cfghjmpqrvwx]{2,}/i;

/**
 * coordinate-shaped pair を magnitude bound で検出（RD2d-c-A 監査反映）。
 * "35.68 139.76"(空白)/"35.6,139.7"(1 桁)/"35,139"(整数)等の evasive form も、lat∈[-90,90]∧lng∈[-180,180] の
 * 範囲なら座標と判定（範囲外の任意の整数ペアは誤検出しない）。delimiter は , ; / | 空白。
 */
function containsCoordinatePair(s: string): boolean {
  const re = /(-?\d{1,3}(?:\.\d+)?)\s*[ ,;/|]\s*(-?\d{1,3}(?:\.\d+)?)/g;
  let m: RegExpExecArray | null = re.exec(s);
  while (m !== null) {
    const a = Math.abs(parseFloat(m[1]));
    const b = Math.abs(parseFloat(m[2]));
    const hasDecimal = m[1].indexOf(".") >= 0 || m[2].indexOf(".") >= 0;
    // 小数ありで lat/lng 範囲、または非ゼロ整数ペアで lat/lng 範囲 → 座標とみなす（fail-closed）
    if (a <= 90 && b <= 180 && (hasDecimal || (a > 0 && b > 0))) return true;
    m = re.exec(s);
  }
  return false;
}

/** serialized 文字列に raw 座標/位置 encoding が含まれるか（token + 単一高精度 + ペア + plus code） */
function containsRawLocation(jsonLower: string): boolean {
  return (
    FORBIDDEN_TOKENS.some((t) => jsonLower.includes(t)) ||
    COORD_PATTERN.test(jsonLower) ||
    PLUS_CODE_PATTERN.test(jsonLower) ||
    containsCoordinatePair(jsonLower)
  );
}

/** public input が opaque-only（raw 座標/位置 encoding が混入していない）ことを検証（空 = 健全・message は定数のみ） */
export function transportCascadeProviderInputViolations(input: TransportCascadeRouteEtaProviderInputV0): string[] {
  const json = JSON.stringify(input).toLowerCase();
  return containsRawLocation(json) ? ["public input contains raw location (coordinate/encoding) — opaque refs only"] : [];
}

/**
 * transportCascadePrivateInputViolations — private coordinate handle が **opaque token のみ**で raw 座標/位置 encoding を
 * 含まないことを検証。実装者が handle に座標("35.68,139.76"・"35,139"・geohash 等)を入れても検出 → wrapper が no_route に倒す。
 */
export function transportCascadePrivateInputViolations(priv: TransportCascadePrivateCoordinateInputV0): string[] {
  let out: string[] = [];
  if (priv.kind !== "private_coordinate_bearing") out = out.concat(["invalid private input kind"]);
  const json = JSON.stringify(priv).toLowerCase();
  if (containsRawLocation(json)) out = out.concat(["private input handle contains coordinate/location encoding (must be opaque token)"]);
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
  // wrapper 独自の強化 raw-location scan（adapter の scan より広く・evasive coord/geohash/plus code を捕捉）
  if (containsRawLocation(JSON.stringify(result).toLowerCase())) {
    out = out.concat(["result contains raw location (coordinate/encoding) — opaque refs only"]);
  }
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
