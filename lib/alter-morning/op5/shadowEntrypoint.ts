/**
 * shadowEntrypoint — OP-5.3.2 (CEO 2026-05-06)
 *
 * 将来の OP-5.3.3 で morningPipeline 1 箇所から呼ばれる **接続インフラ**。
 * shadow 起動 → legacy snapshot 抽出 → comparison → redaction passthrough まで
 * 完結する void 関数。
 *
 * 設計の核 (OP-5.3 = 接続インフラ + redaction passthrough のみ):
 *   - **return void**: caller には何も返さない (= type-level boundary)
 *   - **observation 出力なし**: console.log / Sentry / DB / telemetry なし (OP-5.4 で別途)
 *   - **silent ignore**: 内部 throw を caller に伝播しない、 raw error 出さない
 *   - **redaction passthrough**: redactShadowResult を必ず通す (= OP-5.4 で観測手段を
 *     追加する際に boundary が既に確立されている構造を OP-5.3 で固める)
 *
 * 起動条件 (= 全 AND):
 *   1. shouldRunShadow(flags, userId) === true (= shadowEnabled AND allowlist 内)
 *   2. それ以上の gate なし (= LOG_LEVEL は redaction の中で gate、 NODE_ENV check 不要)
 *
 * 起動しない条件:
 *   - shadowEnabled false → 即 return
 *   - allowlist 外 → 即 return
 *   - userId null/undefined → 即 return
 *   - 上記 case では factories / dispatcher / redaction を一切呼ばない
 *
 * OP-5.3 規律:
 *   - **runtime に接続しない** (= morningPipeline / route / legacyAdapter から
 *     呼ばれない、 OP-5.3.3 で初めて接続される予定)
 *   - **PlanState に書き込まない** (= read-only)
 *   - flags.ts / shadowOrchestrator.ts / redaction.ts / shadowComparator.ts /
 *     extractLegacySnapshot.ts の **既存 file は変更しない**
 *   - 既存 OP-3 系 factory 群 / OP-4 dispatcher 不変
 *   - PR #75 系 module 参照なし
 *   - DB migration / telemetry table なし
 *
 * 注意 (= "0ms" / "完全不変" 表現を避ける、 CEO 2026-05-06 補正):
 *   flag off / allowlist 外でも import / helper 呼び出し / env reading のコストは
 *   ゼロではない可能性がある。 「behavior no-op」 (= factories / dispatcher / redaction
 *   が起動しない、 PlanState / response / UI / telemetry に影響なし) と表現する。
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
//   Sentry に明示 emit する pure helper。 raw error は emit に渡せない型設計。
import { emitShadowError } from "./errorTelemetry";

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

  // OP-5.3 では observation 出力なし。
  // redacted / comparison は計算するが外に出さない。
  // OP-5.4.2 で success observation の出し方を別レビュー予定 (= 本 PR scope 外)。
  void redacted;
  void comparison;
}
