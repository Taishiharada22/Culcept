import "server-only";
/**
 * Reality Control OS — A1-5-1a Complete Shadow Orchestration Skeleton（server-only・**no call-site**）
 *
 * 親設計: docs/aneurasync-reality-control-os-connection-design.md §8（A1-5-0 audit）
 *
 * 役割: A1-4 の Complete candidate pipeline（generateCandidates→evaluate→runShadow）を、既存
 *   shadow/dev 足場へ渡せる **最小 server-only orchestration**。**route/UI/PlanClient/runtime から
 *   呼ばない（no call-site）**。実ユーザーデータを読まない（依存注入）。
 *
 * 【A1-5-1a の安全境界（厳守）】:
 *   - **空入力**: CompleteDispatchInput は seedPlacements=[] / durationEvidences=[] → **候補 0**。
 *   - **flag-off / no-op**: flag は **注入 boolean**（PLAN_FLAGS を追加・読まない）。off→no-op(flag_off)。
 *   - **fail-closed**: redaction-guard を通らない summary は破棄し no-op code を返す（raw を返さない）。
 *   - 実データ読取 / DB / Supabase / PRM / correction / route / UI / push / raw parse / default duration なし。
 *   - **barrel（integration/index.ts）非 export**（本番 import 経路を作らない）。
 *
 * 制約: 純オーケストレーション + 依存注入。server-only。runtime call-site なし。
 */

import { generateCandidates, buildGenerationContext, type CompleteDispatchInput } from "../candidate-generator";
import { evaluateCandidate } from "../candidate-evaluator";
import { runShadow, type ShadowSummary } from "./shadow-runner";
import { assertShadowSummaryRedacted } from "./redaction-guard";
import type { RealityInput } from "./input-adapter";
import type { Interval } from "../complete-generator";
import type { TimeBand } from "../seed-placement";

/** no-op 区分（flag off / redaction 失敗）。raw を含まない code のみ。 */
export type CompleteShadowNoopCode = "flag_off" | "redaction_failed";

/** orchestration の結果（成功＝redacted summary / no-op＝code）。 */
export type CompleteShadowOutcome =
  | { readonly ok: true; readonly summary: ShadowSummary }
  | { readonly ok: false; readonly code: CompleteShadowNoopCode };

/** 当日の構造化 descriptor（空入力ゆえ候補に影響しないが skeleton 形のため受ける）。 */
export interface CompleteShadowDay {
  readonly activeWindow?: Interval;
  readonly date?: string;
  readonly bandBounds?: Readonly<Partial<Record<TimeBand, Interval>>>;
}

export interface CompleteShadowDeps {
  /** 注入 flag（PLAN_FLAGS を読まない）。off→no-op。 */
  readonly flag: boolean;
  /** adapter 由来の日構造入力（**依存注入**・本 module は実データを読まない） */
  readonly realityInput: RealityInput;
  /** 当日 descriptor（任意） */
  readonly day?: CompleteShadowDay;
  /** redaction チェック（**DI**・既定は assertShadowSummaryRedacted。fail-closed を試験可能にする） */
  readonly redactionCheck?: (summary: ShadowSummary) => boolean;
}

/** flag-off/no-op 判定の pure helper。 */
export function isCompleteShadowEnabled(flag: boolean): boolean {
  return flag === true;
}

/** A1-5-1a: **空** CompleteDispatchInput（seedPlacements=[] / durationEvidences=[]）。 */
export function emptyCompleteDispatchInput(day?: CompleteShadowDay): CompleteDispatchInput {
  return {
    seedPlacements: [],
    durationEvidences: [],
    activeWindow: day?.activeWindow,
    date: day?.date,
    bandBounds: day?.bandBounds,
  };
}

/** 既定の redaction チェック（ShadowSummary が redaction-guard を通るか）。 */
function defaultRedactionCheck(summary: ShadowSummary): boolean {
  return assertShadowSummaryRedacted(summary).clean;
}

/**
 * A1-5-1a Complete shadow orchestration（**no call-site**・依存注入・実データ読まない）。
 *   - flag off → no-op(flag_off)。
 *   - flag on → **空 CompleteDispatchInput** で generateCandidates→evaluate→runShadow→redaction gate。
 *   - redaction 失敗 → **fail-closed** no-op(redaction_failed)。成功 → redacted ShadowSummary。
 *
 * 空入力ゆえ候補 0（candidateCount=0）。raw を一切出さない・default duration を置かない・PRM/DB を読まない。
 */
export function runCompleteShadow(deps: CompleteShadowDeps): CompleteShadowOutcome {
  if (!isCompleteShadowEnabled(deps.flag)) return { ok: false, code: "flag_off" };

  const completeInput = emptyCompleteDispatchInput(deps.day);
  const drafts = generateCandidates(deps.realityInput, undefined, completeInput);
  const ctx = buildGenerationContext(deps.realityInput);
  const candidates = drafts.map((d) => evaluateCandidate(d, ctx));

  const summary = runShadow({
    input: deps.realityInput,
    candidates,
    intervened: false,
    conditionPresent: false,
  });

  const check = deps.redactionCheck ?? defaultRedactionCheck;
  if (!check(summary)) return { ok: false, code: "redaction_failed" }; // fail-closed
  return { ok: true, summary };
}
