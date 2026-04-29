/**
 * Morning Pipeline Orchestrator — Comprehension-First v1.3+ Wave 3 (W3-PR-3)
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-design.md §7
 *
 * 責務:
 *   L1 Comprehension (rule pre-parse + LLM extract + checker)
 *   → L2 Planning (time solver, place grounder, gap resolver)
 *   → L2 Annotation (body / weather / party)
 *   → L3 Expression (narration + faithfulness checker + retry/fallback)
 *   を 1 本の純粋 async function で連結する。
 *
 * 設計原則（CEO 固定制約）:
 *   1. **唯一の配線点**。API route はここを呼ぶだけ（ロジック持たせない）
 *   2. plan graph は annotation で **絶対に書き換えない**（C-2）
 *   3. annotation は narration に **自動注入しない**（C-2）— narration 入力は
 *      comprehension / timeline / grounded の 3 つのみ
 *   4. LLM / 実 API は provider で差し替え可能（test は stub で閉じる）
 *   5. Feature flag の配線は route 側の責務。orchestrator は flag を見ない
 */

import type { ComprehensionResult, Event } from "./comprehension/eventSchema";
import type { L1PipelineInput } from "./comprehension/l1Pipeline";
import { runL1Pipeline } from "./comprehension/l1Pipeline";
import { preParseUtterance, type RulePreParseHints } from "./comprehension/rulePreParse";
import { validatePlanOperations } from "./comprehension/validateOperation";
import type { PendingClarify } from "./types";

import { solveTimeLine, type TimeLine } from "./planning/timeSolver";
import { groundPlaces, type GroundedPlace } from "./planning/placeGrounder";
import { resolveGaps, type GapResolution } from "./planning/gapResolver";
import {
  annotateParty,
  type PartyAnnotation,
  type PartyBaselineEntry,
} from "./planning/partyAnnotator";

import { annotateBody, type BodyAnnotation, type PhenotypeInput } from "./body/bodyAnnotator";
import {
  annotateWeather,
  type WeatherAnnotation,
  type WeatherContext,
  type WeatherForecastProvider,
} from "./weather/weatherAnnotator";

import { runL3Pipeline, type L3PipelineResult } from "./expression/pipeline";
import {
  stubNarrationProvider,
  type NarrationProvider,
} from "./expression/narration";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Provider interfaces
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * CEO 2026-04-28 PR #41a Layer 2: prior plan context for LLM modify/append 判別。
 *
 * 既存 plan の summary を簡略化して LLM に渡す。token 軽量化のため、
 * 完全 Event ではなく必要 field のみを抽出する（PII の lat/lng は含めない）。
 *
 * LLM はこの context を使って utterance を classify する:
 *   - 既存 plan が空 / context 渡されない → turn_mode="create" (既存挙動)
 *   - utterance が新時刻+新場所を述べる → turn_mode="append"、新 event_id
 *   - utterance が既存 event の slot 変更 → turn_mode="modify" + target_ref
 *
 * **絶対契約**:
 *   - LLM は priorContext を **再抽出してはいけない**（duplicate 防止）
 *   - LLM は今 turn の utterance から **新規 events のみ** 出力する
 */
export interface PriorEventContext {
  event_id: string;
  /** 「朝の予定」「ランチ」等の自然言語ヒント生成用 */
  startTime: string | null;
  place_ref: string | null;
  /** target_ref 解決の手がかり */
  activity: string;
}

/**
 * L1.1 Comprehension の LLM 抽出を抽象化する interface。
 *
 * 実装:
 *   - stub:  test 用 deterministic provider（`createStubComprehensionProvider`）
 *   - llm:   実 LLM provider（別ファイル `llmComprehensionProvider.ts` で定義）
 *
 * 失敗時は `null` を返す（throw しない）。orchestrator が gracefully fail する。
 *
 * priorContext (PR #41a Layer 2):
 *   省略時は既存挙動 (create-only)。
 *   渡された場合 LLM が turn_mode を 3-way (create/append/modify) で判別する。
 */
export interface ComprehensionProvider {
  extract(
    utterance: string,
    hints: RulePreParseHints,
    priorContext?: PriorEventContext[],
  ): Promise<L1PipelineInput["raw"] | null>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pipeline I/O
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MorningPipelineInput {
  utterance: string;
  /** YYYY-MM-DD。weather annotation の target に使う。省略時は comprehension の targetDate を用いる */
  targetDateHint?: string;
  /** body annotation の phenotype。省略時は全 field 空扱い */
  phenotype?: PhenotypeInput;
  /** party annotation の baseline（頻繁共起者）。省略時は空配列 */
  partyBaseline?: PartyBaselineEntry[];
  /** weather annotation 用 context（officeCode 等）。省略時は officeCode=null / targetDate=今日 */
  weatherContext?: Partial<WeatherContext>;
  /**
   * W3-PR-7 Commit 2: answerBinder 経路専用。
   *
   * 指定されている場合:
   *   - LLM comprehension provider は呼ばない（extract は skip）
   *   - 提供された events をそのまま planner 以降に流す
   *   - utterance は narration 参考情報としてのみ使用
   *
   * 用途: route.ts の Branch A で bindAnswerToSlot の結果を pipeline に渡す。
   */
  priorEvents?: Event[];
  /**
   * CEO 2026-04-28 PR #41a Layer 2: LLM 呼び出し時の prior plan context。
   *
   * 指定されている場合:
   *   - LLM comprehension provider が呼ばれる (priorEvents === undefined 前提)
   *   - prior events を簡略化形 (PriorEventContext) で LLM に渡す
   *   - LLM は utterance を classify して turn_mode (create/append/modify) を出力
   *
   * priorEvents (LLM skip) と **別 field** にすることで両モード排他:
   *   - priorEvents !== undefined  → LLM skip (answerBinder bind path)
   *   - priorPlanForContext !== undefined → LLM 呼び出し with context (modify/append)
   *   - 両方 undefined → 既存 create-only 挙動
   *
   * 用途: route.ts の Branch B で「prior plan あり + 新 utterance」 → modify/append 判定。
   */
  priorPlanForContext?: Event[];

  /**
   * PR-50 Commit 4 (CEO 2026-04-30): operations 経路の answer operation を
   * validation 層で検証するための pendingClarify state。
   *
   * 用途:
   *   - validatePlanOperations の context.priorPendingClarify に流す
   *   - LLM が answer operation を出した場合、slot mismatch / no_pending_clarify
   *     を validation で検出して、矛盾なら events[] fallback に倒す
   *
   * 渡し方:
   *   - route.ts Branch B (LLM 経路): rawMorningSession.pendingClarify を渡す
   *   - route.ts Branch A (bind 経路): pipeline は priorEvents bypass モードで
   *     LLM を呼ばず operations は空のため、本 field の影響なし (流しても無害)
   *
   * **answer は secondary safety path** (CEO 2026-04-30):
   *   主経路は route.ts Branch A の bindAnswerToSlot。Branch A 成功時は LLM が
   *   呼ばれず operations は空。Branch B で LLM が answer operation を出した
   *   ケースのみ本 field 経由で operationDispatcher の bind に流れる。
   */
  priorPendingClarify?: PendingClarify | null;
}

export interface MorningPipelineProviders {
  comprehension: ComprehensionProvider;
  narration?: NarrationProvider;
  /** 省略時は forecast=null（condition="unknown"） */
  weather?: WeatherForecastProvider | null;
}

export interface MorningAnnotations {
  body: BodyAnnotation[];
  weather: WeatherAnnotation[];
  party: PartyAnnotation[];
}

export type MorningPipelineStatus =
  | "ok"
  | "comprehension_failed"; // L1 LLM 抽出が null を返した / 形式不正

export interface MorningPipelineResult {
  status: MorningPipelineStatus;
  /** L1 出力。comprehension_failed 時は null */
  comprehension: ComprehensionResult | null;
  timeline: TimeLine | null;
  grounded: GroundedPlace[];
  gapResolution: GapResolution | null;
  annotations: MorningAnnotations;
  /** L3 narration。comprehension_failed 時は null */
  narration: L3PipelineResult | null;
  /** 参考情報。debug / telemetry 用 */
  hints: RulePreParseHints;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stub comprehension provider (deterministic, for tests)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * test / dev 用 stub。常に固定の raw JSON を返す。
 * 実 LLM provider は `llmComprehensionProvider.ts` 側で定義。
 */
export function createStubComprehensionProvider(
  fixed: L1PipelineInput["raw"],
): ComprehensionProvider {
  return {
    async extract(): Promise<L1PipelineInput["raw"] | null> {
      return fixed;
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Entry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * runMorningPipeline — orchestrator 本体。
 *
 * 契約:
 *   1. 入力の utterance / phenotype / baseline / weatherContext を一切書き換えない
 *   2. annotation 生成は narration を **汚染しない**（narration に渡す input に
 *      annotation を入れない）
 *   3. comprehension が null の場合も throw しない。status="comprehension_failed"
 *      で早期 return（UI 側が「聞き直し」プロンプトを出せるように）
 *   4. narration が LLM error で空文字になっても L3 pipeline 内部で deterministic
 *      fallback に落ちるため、ここでは気にしない
 */
export async function runMorningPipeline(
  input: MorningPipelineInput,
  providers: MorningPipelineProviders,
): Promise<MorningPipelineResult> {
  const { utterance, priorEvents } = input;
  const narrationProvider = providers.narration ?? stubNarrationProvider;
  const weatherProvider = providers.weather ?? null;

  // L1.0 — rule pre-parse（hint 化のみ。state は持たせない）
  const hints = preParseUtterance(utterance);

  // L1.1 — LLM Structured Outputs 抽出
  //   priorEvents モード: answerBinder 経路では LLM を呼ばず既存 events をそのまま流す。
  //   targetDate 等のメタ情報は bind 経路では utterance 由来の today に倒す。
  //
  // CEO 2026-04-28 PR #41a Layer 2: priorPlanForContext を **LLM 呼び出し時** に渡す。
  //   priorEvents (answerBinder, LLM skip) と **別 field** にすることで、両モードを
  //   排他的に表現する:
  //     - priorEvents !== undefined  → LLM skip (answerBinder bind path)
  //     - priorPlanForContext !== undefined → LLM 呼び出し時に context として渡す
  //                                          (modify/append 判別用)
  //   両方が undefined なら create-only 既存挙動。
  //
  //   priorPlanForContext は完全 Event ではなく簡略化形 (PriorEventContext) で渡す。
  //   token 軽量化 + PII (lat/lng) 排除のため。
  const priorContextForLLM: PriorEventContext[] | undefined =
    input.priorPlanForContext !== undefined && input.priorPlanForContext.length > 0
      ? input.priorPlanForContext.map((ev) => ({
          event_id: ev.event_id,
          startTime: ev.when.startTime,
          place_ref: ev.where.place_ref,
          activity: ev.what.activity,
        }))
      : undefined;
  const raw =
    priorEvents !== undefined
      ? ({
          targetDate: todayYmd(),
          events: [],
          // PR-50 Commit 3: priorEvents bypass (answerBinder 経路) では LLM を
          //   呼ばないので operations は LLM 出力から得られない。空配列で渡す。
          //   下流の validatePlanOperations は length===0 → fallbackToEvents=true
          //   を立てるが、bypass モードでは元から既存 events を流す挙動なので整合する。
          operations: [],
          startPoint: null,
          departureTime: null,
          goOut: null,
        } satisfies L1PipelineInput["raw"])
      : await providers.comprehension.extract(
          utterance,
          hints,
          priorContextForLLM,
        );

  // empty annotations（comprehension_failed 時の既定値）
  const emptyAnnotations: MorningAnnotations = { body: [], weather: [], party: [] };

  if (!raw) {
    return {
      status: "comprehension_failed",
      comprehension: null,
      timeline: null,
      grounded: [],
      gapResolution: null,
      annotations: emptyAnnotations,
      narration: null,
      hints,
    };
  }

  // L1.2 — Slot & Provenance checker（runL1Pipeline 内部で実行）
  //   priorEvents があれば checker は走らない（bind 時に再計算済み）
  const comprehension = runL1Pipeline({ raw, utterance, priorEvents });
  const events = comprehension.events;

  // PR-50 Commit 3 (CEO 2026-04-30): operations 経路の validation を接続。
  //
  // 戦略:
  //   - LLM が出した operations (raw.operations) を validatePlanOperations で
  //     batch validate。priorEvents (modify target / answer event 解決用) は
  //     priorPlanForContext を流用 (modify/append 判別と同じ context)。
  //   - allAccepted=true かつ length>0 → fallbackToEvents=false (operations 経路)
  //   - それ以外 → fallbackToEvents=true (events[] fallback、legacy)
  //
  // 後段 (Commit 4 で実装される dispatch 層) は ComprehensionResult.fallbackToEvents
  // を見て経路選択する。Commit 3 では伝搬のみで dispatch はしない (既存 events[]
  // 経路の挙動が変わらないことが regression baseline 合格条件)。
  //
  // PR-50 Commit 4 (CEO 2026-04-30): priorPendingClarify を input から拾う。
  //   - Branch B (LLM 経路): route.ts は rawMorningSession.pendingClarify を渡す。
  //     answer operation を validation 層で正確に検証 (slot mismatch / no_pending
  //     を含む)。
  //   - Branch A (bind 経路): pipeline は priorEvents bypass で raw.operations が
  //     空のため、context は使われない (validation スキップ相当)。
  const operationsFromRaw = raw.operations ?? [];
  const operationContext = {
    priorEvents: input.priorPlanForContext ?? [],
    priorPendingClarify: input.priorPendingClarify ?? null,
  };
  const validation = validatePlanOperations(operationsFromRaw, operationContext);
  const useOperationsPath =
    operationsFromRaw.length > 0 && validation.allAccepted;
  comprehension.acceptedOperations = validation.acceptedOperations;
  comprehension.fallbackToEvents = !useOperationsPath;
  comprehension.operationRejections = validation.rejections;
  if (!useOperationsPath && operationsFromRaw.length > 0) {
    console.warn(
      "[alter-morning/morningPipeline] operations rejected, falling back to events[]",
      {
        received: operationsFromRaw.length,
        rejected: validation.rejections.length,
        reasons: validation.rejections.map((r) => r.reason),
      },
    );
  }

  // L2 — Planning（純関数 3 つ）
  // 注: resolveGaps は
  //   - Where 三層判定のため grounded を参照（W3-PR-6 Commit 2）
  //   - ユーザーの opt-out 宣言を尊重するため slot_opt_outs を参照（Commit 4）
  const timeline = solveTimeLine(events);
  const grounded = groundPlaces(events);
  const slotOptOuts = hints.slot_opt_outs.map((s) => s.value);
  const gapResolution = resolveGaps(events, { grounded, slotOptOuts });

  // L2 — Annotation 層（plan graph 非破壊、narration に渡さない）
  const bodyAnns = annotateBody(events, grounded, input.phenotype ?? {});
  const partyAnns = annotateParty(events, input.partyBaseline ?? []);

  const targetDate =
    input.weatherContext?.targetDate ??
    input.targetDateHint ??
    comprehension.targetDate;
  const officeCode = input.weatherContext?.officeCode ?? null;
  const weatherAnns = await annotateWeather(
    events,
    { officeCode, targetDate },
    weatherProvider,
  );

  // L3 — Narration（annotation は意図的に渡さない、C-2）
  const narration = await runL3Pipeline(
    { comprehension, timeline, grounded },
    narrationProvider,
  );

  return {
    status: "ok",
    comprehension,
    timeline,
    grounded,
    gapResolution,
    annotations: {
      body: bodyAnns,
      weather: weatherAnns,
      party: partyAnns,
    },
    narration,
    hints,
  };
}
