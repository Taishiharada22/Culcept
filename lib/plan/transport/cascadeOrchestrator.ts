/**
 * Phase 3-L-3a (pure) — Cascade Orchestrator
 *
 * 役割 (= 1 transition について cascade を実行する pure function):
 *   provider 配列を順に試行し、 最初に成功した provider の segment を返す。
 *   全 provider 失敗時は unresolved を返す。 exception は per-provider で catch。
 *
 * 思想 (= Mobility Truth Layer の観測パイプライン):
 *   - cascade orchestrator は単なる「resolve 試行ループ」 ではなく、 **「観測する順序」** を表現する。
 *   - 各 provider は「観測する手段」、 cascade 順序は「優先する観測信号」。
 *   - 「移動が確定したか / されていないか」 を観測する layer であり、 推奨 / 最適化はしない。
 *
 * Per-transition pure 設計 (= 自律補強 A):
 *   - cascade orchestrator は **単一 transition** の resolve を扱う
 *   - 「複数 transitions の並列実行 + isolation」 は overlay 層 (L-3b) の責務
 *   - これにより:
 *     (1) cascade のテストが単純化 (= single transition の test だけで網羅可能)
 *     (2) overlay の per-transition isolation が自然に成立 (= Promise.allSettled で実装可能)
 *     (3) future parallel execution への path が確保される
 *
 * GPT 補正 6 件の組み込み:
 *   1. **Manual override gate** (= 補正 1): manual_user provider は manualOverride が input に存在する場合のみ試行。
 *      undefined なら **構造的に skip** (= 空 manual provider が常勝しない)。
 *   2. **Missing coords は unresolved** (= 補正 2): caller が coords を渡さなければ provider 内 guard で unresolved。
 *      cascade は geocode を呼ばない (= L-3 範囲外)。
 *   3. **sensitive (= adjacent / both 両方) は unresolved** (= 補正 3 + L-3c post-audit 強化):
 *      `sensitive_both` **および** `sensitive_adjacent` の両方を early-exit で unresolved 確定。
 *      片側 sensitive でも duration / mode を resolve しない (= privacy-first、 「移動」 以上の情報を出さない)。
 *      heuristic / routes_api を呼ばない。
 *   4. **mutation なし**: cascade は input を mutate せず、 新 object を返す。
 *   5. **PII 含まない**: trace / result に raw title / locationText を含めない。 provider id 列のみ。
 *   6. **Per-provider exception catch** (= 補正 6): exception は cascade を落とさず "api_error" として記録、 次の provider へ。
 *
 * 自律補強 (= GPT 案を超える人間超越設計):
 *   - A. Per-transition pure 分離 (= 上述)
 *   - E. Cascade trace (= debug 観測、 provider id 列 + 最終 decider)
 *   - F. Forward compatibility hooks (= tracingId は overlay 層で提供、 cascade 自身は持たない)
 *
 * L-3a-pure scope (= 2026-05-22 CEO + GPT 承認):
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用
 *   - DB / env / package / dependency 変更 0
 *   - UI 変更 0
 *   - K phase 既存 file 変更 0 (= 純追加)
 *
 * 参照:
 *   - docs/alter-plan-phase3-l-3-readiness-audit.md §2.1 / §2.2 / §3
 *   - lib/plan/transport/transportTypes.ts (= L-1 型契約)
 *   - lib/plan/transport/heuristicDistanceProvider.ts (= L-2)
 *   - lib/plan/transport/unresolvedProvider.ts (= L-2)
 *   - lib/plan/transport/manualUserProvider.ts (= L-2、 shell only)
 */

import type {
  MovementResolutionInput,
  MovementResolutionResult,
  MovementSegmentResolved,
  MovementUnresolvedReason,
  TransportMode,
  TransportProvider,
  TransportResolutionProvider,
} from "./transportTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input / Output types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * User-explicit override 情報。 GPT 補正 1 の構造的解決:
 *   - 本 field が input に存在する transition のみ、 manual_user provider が試行可能
 *   - 存在しない transition では cascade は manual_user provider を **構造的に skip**
 *
 * `userDurationMin` は finite + non-negative number (= manual_user provider 側で validate)。
 */
export interface ManualOverride {
  readonly userDurationMin: number;
  readonly userMode?: TransportMode;
}

/**
 * Segment base 情報 (= MovementTransition 由来 field の transport 拡張版)。
 * 全 provider が共通で使う、 raw title 等の PII は含まない。
 */
export interface CascadeSegmentBase {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  /**
   * sensitive proximity の場合は overlay 層で undefined に redact 済を期待。
   * 本 cascade は redact 処理を行わず、 caller の責務。
   */
  readonly fromLocationText?: string;
  readonly toLocationText?: string;
  readonly sensitiveProximity: boolean;
}

/**
 * Cascade input (= single transition、 provider に渡す情報の packed form)。
 *
 * 設計判断:
 *   - L-1 `MovementResolutionInput` を直接渡さず、 cascade 専用の input を持つ
 *   - cascade 内部で provider に渡す際は `MovementResolutionInput` + provider 拡張 input を組み立てる
 *   - これにより L-1 の interface 不変、 cascade は L-1 の thin wrapper として動く
 */
export interface CascadeInput {
  /** L-1 base input (= privacy class / coords / preferredMode) */
  readonly resolution: MovementResolutionInput;
  /** segment base 情報 (= 全 provider に転写される) */
  readonly segmentBase: CascadeSegmentBase;
  /**
   * Manual override (= optional)。
   * 存在する場合のみ manual_user provider が試行される。
   * undefined なら manual_user provider は **構造的に skip** (= GPT 補正 1)。
   */
  readonly manualOverride?: ManualOverride;
}

/**
 * Cascade trace — debug / observation 用、 PII を含まない。
 *
 * 設計判断 (= 自律補強 E):
 *   - raw value は持たない、 provider id literal のみ
 *   - L-4+ telemetry sink で集計に使える形 (= structural)
 *   - test の deterministic assertion で活用可能
 */
export interface CascadeTrace {
  /** 試行された provider id 列 (= 順序付き、 skip された provider は含まない) */
  readonly attemptedProviders: ReadonlyArray<TransportProvider>;
  /** 最終的に決定した provider (= unresolved の場合は "none") */
  readonly decidedBy: TransportProvider;
  /** Early-exit が発火した場合の reason (= provider 試行に入らずに決定) */
  readonly earlyExitReason?: MovementUnresolvedReason;
}

/**
 * Cascade result — discriminated union (= ok / fail)。
 * 各 branch に trace が必ず付く (= debug 必須情報)。
 */
export type CascadeResult =
  | {
      readonly ok: true;
      readonly segment: MovementSegmentResolved;
      readonly trace: CascadeTrace;
    }
  | {
      readonly ok: false;
      readonly reason: MovementUnresolvedReason;
      readonly trace: CascadeTrace;
    };

/**
 * Cascade options (= provider 配列を含む、 caller が deterministic 順序を決定)。
 */
export interface CascadeOptions {
  /**
   * provider 配列 (= 試行順序を表現)。
   *
   * 推奨順序 (= L-3 readiness audit §2.1):
   *   [manual_user, heuristic_distance, unresolved sentinel]
   *
   * 注: cascade は **順序を変えず、 配列順** で試行する (= deterministic)。
   *      caller (= overlay 層) が順序を決定する責務。
   */
  readonly providers: ReadonlyArray<TransportResolutionProvider>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Provider に渡す input を組み立てる。
 *
 * 設計判断:
 *   - L-1 `MovementResolutionInput` を base に、 provider 拡張 input を spread で追加
 *   - heuristic_distance / manual_user は segmentBase / userDurationMin 等を読む
 *   - unresolved sentinel は extension field を無視
 *   - 「provider 拡張 input は cast 経由」 という L-2 設計を継承
 */
function buildProviderInput(
  cascadeInput: CascadeInput,
  manualOverride: ManualOverride | undefined,
): MovementResolutionInput {
  const base: MovementResolutionInput & {
    segmentBase: CascadeSegmentBase;
    userDurationMin?: number;
    userMode?: TransportMode;
  } = {
    ...cascadeInput.resolution,
    segmentBase: cascadeInput.segmentBase,
  };
  if (manualOverride) {
    base.userDurationMin = manualOverride.userDurationMin;
    if (manualOverride.userMode !== undefined) {
      base.userMode = manualOverride.userMode;
    }
  }
  return base;
}

/**
 * Provider call を try/catch で wrap し、 exception を "api_error" として吸収する。
 *
 * GPT 補正 6 (= per-transition isolation) の構造的解決:
 *   - provider 内部 exception は cascade を落とさず、 次の provider へ伝搬
 *   - 但し本関数は **単一 provider call** の isolation のみ担当 (= 1 transition 全体の isolation は overlay 責務)
 */
async function callProviderSafely(
  provider: TransportResolutionProvider,
  input: MovementResolutionInput,
): Promise<MovementResolutionResult> {
  try {
    return await provider.resolveDuration(input);
  } catch {
    // 補正 6: exception は cascade を落とさず、 api_error として記録
    return { ok: false, reason: "api_error" };
  }
}

/**
 * Trace を組み立てる helper (= immutable / no PII)。
 */
function buildTrace(
  attempted: ReadonlyArray<TransportProvider>,
  decidedBy: TransportProvider,
  earlyExitReason?: MovementUnresolvedReason,
): CascadeTrace {
  return {
    attemptedProviders: attempted,
    decidedBy,
    ...(earlyExitReason !== undefined ? { earlyExitReason } : {}),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main: runCascade
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Single transition について cascade を実行する。
 *
 * Step (= 3 layer 構造、 readiness audit §2.2):
 *   (1) Early-exit gate
 *       - sensitive_both → unresolved "sensitive_proximity" (= 補正 3)
 *       - location_unknown → unresolved "location_unknown" (= 補正 2)
 *       - 全 provider down → unresolved "no_provider_available"
 *
 *   (2) Provider sequential try
 *       - 各 provider を input.options.providers 順に試行
 *       - provider が "manual_user" の場合、 manualOverride が undefined なら **skip** (= 補正 1)
 *       - 各 provider call を try/catch で wrap (= exception → "api_error"、 補正 6)
 *       - ok: true を見つけたら即 return (= early-resolve)
 *
 *   (3) Final fallback
 *       - 全 provider fail → unresolved "no_provider_available"
 *
 * 純度 (= invariants):
 *   - input mutation なし
 *   - cascade 自身は side-effect なし (= provider 自身が side effect を持つ場合の責務は provider 側)
 *   - trace に raw title / locationText / coords を含めない
 *   - returns Promise (= provider が async のため)
 */
export async function runCascade(
  input: CascadeInput,
  options: CascadeOptions,
): Promise<CascadeResult> {
  const { providers } = options;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // (1) Early-exit gate
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 補正 3 + L-3c post-audit 強化:
  // `sensitive_both` **および** `sensitive_adjacent` の両方を provider を呼ばずに unresolved。
  // 片側 sensitive でも duration / mode を resolve しない (= privacy-first、 「移動」 以上の情報を出さない)。
  if (
    input.resolution.privacyClass === "sensitive_both" ||
    input.resolution.privacyClass === "sensitive_adjacent"
  ) {
    return {
      ok: false,
      reason: "sensitive_proximity",
      trace: buildTrace([], "none", "sensitive_proximity"),
    };
  }

  // 補正 2: location_unknown も provider を呼ばずに unresolved
  if (input.resolution.privacyClass === "location_unknown") {
    return {
      ok: false,
      reason: "location_unknown",
      trace: buildTrace([], "none", "location_unknown"),
    };
  }

  // 全 provider down 検出 (= readiness audit §2.2)
  // 注: providers.length === 0 も同等扱い (= 何も試行できない)
  const usableProviders = providers.filter((p) => p.health !== "down");
  if (usableProviders.length === 0) {
    return {
      ok: false,
      reason: "no_provider_available",
      trace: buildTrace([], "none", "no_provider_available"),
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // (2) Provider sequential try
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const attempted: TransportProvider[] = [];

  for (const provider of usableProviders) {
    // 補正 1: manual_user は manualOverride が存在する場合のみ試行 (= 構造的 skip)
    if (provider.id === "manual_user" && input.manualOverride === undefined) {
      // 試行リストに含めない (= attempted から除外、 trace の clarity 確保)
      continue;
    }

    attempted.push(provider.id);

    const providerInput = buildProviderInput(input, input.manualOverride);
    const result = await callProviderSafely(provider, providerInput);

    if (result.ok) {
      return {
        ok: true,
        segment: result.segment,
        trace: buildTrace(attempted, provider.id),
      };
    }
    // 失敗時は次の provider へ continue (= cascade)
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // (3) Final fallback
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return {
    ok: false,
    reason: "no_provider_available",
    trace: buildTrace(attempted, "none"),
  };
}
