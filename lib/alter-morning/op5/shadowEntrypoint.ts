/**
 * shadowEntrypoint — OP-5.3.2 + OP-5.4.1 + OP-5.4.2.2 (CEO 2026-05-07)
 *
 * morningPipeline / route.ts から呼ばれる **接続インフラ**。 shadow 起動 →
 * legacy snapshot 抽出 → comparison → redaction → success observation emit まで
 * 完結する void 関数。
 *
 * 設計の核:
 *   - **return void**: caller には何も返さない (= type-level boundary)
 *   - **silent ignore on caller side**: 内部 throw を caller に伝播しない
 *   - **redaction passthrough**: redactShadowResult を必ず通す
 *   - **success observation emit** (OP-5.4.2.2): redaction 後に observationSink へ
 *     side-effect として 1 回 emit する (= aggregator + emit caller、 wiring 責任)
 *   - **observation_error fallback** (OP-5.4.2.2): aggregator throw 時は
 *     emitShadowError({ category: "observation_error" }) を呼ぶ (= silent failure 防止)
 *
 * 起動条件 (= 全 AND):
 *   1. shouldRunShadow(flags, userId) === true (= shadowEnabled AND allowlist 内)
 *
 * 起動しない条件:
 *   - shadowEnabled false → 即 return
 *   - allowlist 外 → 即 return
 *   - userId null/undefined → 即 return
 *   - 上記 case では factories / dispatcher / redaction / aggregator / emit を
 *     一切呼ばない
 *
 * log_level との関係 (OP-5.4.2.2 案A 明文化、 CEO 2026-05-07):
 *   - **`shadowLogLevel` は success observation の verbosity だけを制御する**
 *   - **error telemetry は `shadowEnabled + allowlist` で gate され、 `shadowLogLevel`
 *     の影響を受けない** (= log_level=none でも step throw 時に error event は出る)
 *   - log_level=none → redactShadowResult が null を返す → success observation skip
 *   - log_level=summary/verbose → emit される event の level / tags 集合が変わる
 *
 * OP-5 規律:
 *   - **PlanState / response / UI に書き込まない** (= read-only)
 *   - flags.ts / shadowOrchestrator.ts / redaction.ts / shadowComparator.ts /
 *     extractLegacySnapshot.ts / observationSink.ts の **behavior は変更しない**
 *   - 既存 OP-3 系 factory 群 / OP-4 dispatcher 不変
 *   - PR #75 系 module 参照なし
 *   - DB migration / telemetry table なし
 *   - 副作用は Sentry.captureMessage のみ (= console.* / fetch / DB / Vercel stdout
 *     を呼ばない)
 *
 * 注意 (= "0ms" / "完全不変" 表現を避ける、 CEO 2026-05-06 補正):
 *   flag off / allowlist 外でも import / helper 呼び出し / env reading のコストは
 *   ゼロではない可能性がある。 「behavior no-op」 (= factories / dispatcher / redaction
 *   が起動しない、 PlanState / response / UI に影響なし) と表現する。
 *   ただし success observation emit は flag on + allowlist 内 + log_level !== "none"
 *   でのみ発生する副作用 (= OP-5.4.2.2 で導入)。
 */

import type { MorningPlan } from "../types";
import type { Provenance } from "../comprehension/eventSchema";
import type { HomeAnchor } from "../planning/transportContext";

import { runShadowOrchestrator } from "./shadowOrchestrator";
import { redactShadowResult } from "./redaction";
import { compareShadowVsLegacy } from "./shadowComparator";
import { readOp5Flags, shouldRunShadow } from "./flags";
import { extractLegacySnapshot } from "./extractLegacySnapshot";
// OP-5.4.1 (CEO 2026-05-07): shadow path internal error を category enum に丸めて
//   Sentry に明示 emit する helper。 raw error は emit に渡せない型設計。
import { emitShadowError } from "./errorTelemetry";
// OP-5.4.2.2 (CEO 2026-05-07): success path で集計 → observationSink へ emit する
//   wiring。 buildShadowObservationInput は pure aggregator、 emitShadowObservation は
//   side-effect が Sentry.captureMessage のみに限定された sink。
import { buildShadowObservationInput } from "./observationAggregator";
import { emitShadowObservation } from "./observationSink";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public input
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * shadow path への全入力。
 *
 * 規律: 全 field は caller (= 将来の OP-5.3.3 morningPipeline) が事前取得する。
 * 本 module 内で fetch / Supabase / Places / browser API を **一切呼ばない**
 * (= OP-5.1 shadowOrchestrator 規律踏襲)。
 */
export interface ShadowEntrypointInput {
  // ─── 既存 runtime の出力 ───
  /** 既存 runtime が確定した plan (= legacy snapshot 抽出元) */
  legacyPlan: MorningPlan | null | undefined;

  // ─── allowlist 判定 ───
  /** shadow 起動可否を allowlist で判定する user_id */
  userId: string | null | undefined;

  // ─── 全 factory 共通 ───
  utterance: string;
  /** 抽出 turn (= trace 用) */
  sourceTurnIndex?: number;
  /** dispatcher で system_default 生成時の基準日 ("YYYY-MM-DD") */
  actualToday: string;

  // ─── OP-3A LLM targetDate factory 用 ───
  llmTargetDate?: string | null;
  llmTargetDateProvenance?: Provenance | null;

  // ─── OP-3B history factory 用 ───
  priorPlan?: MorningPlan | null;
  samePlanDate?: boolean;
  previousDayPlan?: MorningPlan | null;

  // ─── OP-3B location factory 用 ───
  homeAnchor?: HomeAnchor | null;

  // ─── OP-3B UI origin answer factory 用 ───
  clarifyAnswer?: string;
  clarifySlot?:
    | "origin"
    | "end"
    | "where"
    | "when"
    | "what"
    | "transport"
    | "endpoint"
    | null;
  isOriginClarifyActive?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main entry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * shadow 起動 → legacy snapshot 抽出 → comparison → redaction passthrough。
 *
 * **return void**: caller には何も返さない。 raw も redacted も外に出ない。
 *
 * 起動条件:
 *   - shouldRunShadow(flags, userId) === true のときのみ shadow path 走行
 *   - それ以外は behavior no-op (= factories / dispatcher / redaction 起動しない)
 *
 * silent ignore:
 *   - 内部 throw を caller に伝播しない
 *   - raw error message を出さない (= console.log / console.error / Sentry なし)
 *   - error telemetry は OP-5.4 で別途設計 (= category enum + count 永続化想定)
 *
 * redaction passthrough:
 *   - shadow 起動時は必ず redactShadowResult を通す
 *   - OP-5.3 では redacted も comparison も外に出さない
 *   - OP-5.4 で観測手段 (= log / 永続化) を追加する際の **boundary は OP-5.3 で確立**
 *
 * @param input shadow path への全入力
 * @returns void
 */
export function runShadowAndCompare(input: ShadowEntrypointInput): void {
  // ─── flag / allowlist gate (= emit より前) ───
  // gate 通過前は error telemetry も emit しない (= production 99%+ 完全 no-op)
  let flags;
  try {
    flags = readOp5Flags();
  } catch {
    // env 読み込み失敗は silent ignore (= flag off と同等扱い)
    return;
  }
  if (!shouldRunShadow(flags, input.userId ?? null)) {
    // behavior no-op: factories / dispatcher / redaction 起動しない、 emit もなし
    return;
  }

  // ─── 各 step を個別 try / catch して category 識別 ───
  // OP-5.4.1 (CEO 2026-05-07): silent ignore を段階的に解除。
  //   各 step の throw を category enum に丸めて Sentry.captureMessage 経由で emit。
  //   raw error message / stack / cause は **絶対に渡さない** (= type 設計で boundary)。
  //   caller への throw 伝播は引き続きしない (= response / PlanState / UI 不変)。

  let result;
  try {
    result = runShadowOrchestrator({
      utterance: input.utterance,
      sourceTurnIndex: input.sourceTurnIndex,
      actualToday: input.actualToday,
      llmTargetDate: input.llmTargetDate,
      llmTargetDateProvenance: input.llmTargetDateProvenance,
      priorPlan: input.priorPlan,
      samePlanDate: input.samePlanDate,
      previousDayPlan: input.previousDayPlan,
      homeAnchor: input.homeAnchor,
      clarifyAnswer: input.clarifyAnswer,
      clarifySlot: input.clarifySlot,
      isOriginClarifyActive: input.isOriginClarifyActive,
    });
  } catch {
    emitShadowError({ category: "orchestrator_error" });
    return;
  }

  let legacy;
  try {
    legacy = extractLegacySnapshot(input.legacyPlan);
  } catch {
    emitShadowError({ category: "extractor_error" });
    return;
  }

  let comparison;
  try {
    comparison = compareShadowVsLegacy(legacy, result);
  } catch {
    emitShadowError({ category: "comparator_error" });
    return;
  }

  let redacted;
  try {
    redacted = redactShadowResult(result, { level: flags.shadowLogLevel });
  } catch {
    emitShadowError({ category: "redaction_error" });
    return;
  }

  // ─── OP-5.4.2.2: success observation emit wiring ───
  // log_level=none では redactShadowResult が null を返す。 自然 gate で emit skip。
  // (= log_level=none でも step throw 時の error telemetry は出る、 案A 案明文化)
  if (redacted === null) {
    return;
  }

  try {
    const observationInput = buildShadowObservationInput(
      result,
      comparison,
      redacted,
    );
    // observationSink: side-effect は Sentry.captureMessage のみに限定。
    // 内部 try/catch で silent ignore するため、 通常 throw しない (= OP-5.4.2.1 既設計)。
    emitShadowObservation(observationInput);
  } catch {
    // catch される唯一の経路 = aggregator throw (= 型整合崩れ等の極小 prob)。
    // 観測 wiring 障害を category event として Sentry に明示記録する (= silent
    //   failure 防止、 OP-5.4.1 の error telemetry 哲学を観測層にも拡張)。
    // emitShadowError 自体も内部 try/catch で silent ignore (= 二段階防御)。
    emitShadowError({ category: "observation_error" });
  }
}
