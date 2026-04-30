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
 * L1.1 Comprehension の LLM 抽出を抽象化する interface。
 *
 * 実装:
 *   - stub:  test 用 deterministic provider（`createStubComprehensionProvider`）
 *   - llm:   実 LLM provider（別ファイル `llmComprehensionProvider.ts` で定義）
 *
 * 失敗時は `null` を返す（throw しない）。orchestrator が gracefully fail する。
 */
export interface ComprehensionProvider {
  extract(
    utterance: string,
    hints: RulePreParseHints,
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

/**
 * W3 Commit 16.1-T: pipeline 内部の trace metadata（runtime path 証明用）。
 *
 * orchestrator が観測できる範囲の事実のみを記録する。CEO 修正条件:
 *   - 取れない値は null（0 / 空文字 で偽装しない）
 *   - 推測 / 補正 を含まない
 *   - 副作用ゼロ（既存挙動を一切変えない、optional 戻り値）
 */
export interface MorningPipelineTraceMetadata {
  /** 関数が呼ばれた事実（true 固定。本オブジェクトが存在する = 呼ばれた） */
  pipelineCalled: true;
  /** pipeline 終了時の status */
  pipelineStatus: MorningPipelineStatus;
  /** priorEvents モード（answerBinder 経路 = Branch A）か */
  priorEventsMode: boolean;
  /** comprehension provider.extract() が実際に呼ばれたか */
  comprehensionProviderCalled: boolean;
  /**
   * provider が呼ばれなかった理由（呼ばれた場合は null）。
   * 例: "prior_events_mode"
   */
  providerSkipReason: string | null;
  /** provider が null を返したか raw を返したか（呼ばれなかった場合 null） */
  providerSuccess: boolean | null;
  /** provider 呼び出しの latency（呼ばれなかった場合 null） */
  providerLatencyMs: number | null;
  /** raw.events.length（provider が null を返した場合 null） */
  rawEventCount: number | null;
  /** L1Pipeline 通過後の events.length */
  eventsAfterNormalizationCount: number;
  /** raw.targetDate / comprehension.targetDate（provider が null を返した場合 null） */
  targetDateExtracted: string | null;
  /**
   * targetDate が決まった経路。
   * "llm" (raw.targetDate from provider) / "input_hint" / "fallback_today" / null
   */
  targetDateSource: string | null;
}

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
  /**
   * W3 Commit 16.1-T: trace metadata (optional, additive).
   * 既存 caller は無視可能。route.ts が trace 構築時に参照する。
   */
  _pipelineTrace?: MorningPipelineTraceMetadata;
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

  // ── W3 Commit 16.1-T: trace metadata 収集 ──
  // 各分岐点で実値を記録、推測 / 再計算なし。
  const priorEventsMode = priorEvents !== undefined;
  const comprehensionProviderCalled = !priorEventsMode;
  const providerSkipReason: string | null = priorEventsMode
    ? "prior_events_mode"
    : null;
  let providerSuccess: boolean | null = null;
  let providerLatencyMs: number | null = null;

  // L1.1 — LLM Structured Outputs 抽出
  //   priorEvents モード: answerBinder 経路では LLM を呼ばず既存 events をそのまま流す。
  //   targetDate は CEO 修正条件 (W3 P1.5):
  //     input.targetDateHint > todayYmd() の優先順位で決める。
  //     priorEvents 経路で hint が渡されない場合のみ today fallback。
  //     これにより「明日の…」で始まった session が answerBinder turn で
  //     today に degrade することを防ぐ (CEO 実機 trace 2026-05-01 で確定)。
  let raw: L1PipelineInput["raw"] | null;
  if (priorEventsMode) {
    raw = {
      targetDate: input.targetDateHint ?? todayYmd(),
      events: [],
      startPoint: null,
      departureTime: null,
      goOut: null,
    } satisfies L1PipelineInput["raw"];
  } else {
    const providerStart = Date.now();
    try {
      raw = await providers.comprehension.extract(utterance, hints);
      providerLatencyMs = Date.now() - providerStart;
      providerSuccess = raw !== null;
    } catch (err) {
      // 契約上 provider は throw しないが、防御的に catch して trace に反映
      providerLatencyMs = Date.now() - providerStart;
      providerSuccess = false;
      raw = null;
      // err は orchestrator が握り潰さない方針 (上位 try/catch で吸収)
      throw err;
    }
  }

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
      _pipelineTrace: {
        pipelineCalled: true,
        pipelineStatus: "comprehension_failed",
        priorEventsMode,
        comprehensionProviderCalled,
        providerSkipReason,
        providerSuccess,
        providerLatencyMs,
        rawEventCount: null, // raw=null のため取れない
        eventsAfterNormalizationCount: 0,
        targetDateExtracted: null,
        targetDateSource: null,
      },
    };
  }

  // L1.2 — Slot & Provenance checker（runL1Pipeline 内部で実行）
  //   priorEvents があれば checker は走らない（bind 時に再計算済み）
  const comprehension = runL1Pipeline({ raw, utterance, priorEvents });
  const events = comprehension.events;

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

  // ── W3 Commit 16.1-T + P1.5: targetDate 経路を実値で記録 ──
  // priorEventsMode かつ hint あり → "input_hint" (= 前 turn の plan.date 等)
  // priorEventsMode かつ hint なし → "fallback_today"
  // priorEventsMode=false → "llm" (provider 由来)
  const targetDateSource: string = priorEventsMode
    ? input.targetDateHint != null
      ? "input_hint"
      : "fallback_today"
    : "llm";

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
    _pipelineTrace: {
      pipelineCalled: true,
      pipelineStatus: "ok",
      priorEventsMode,
      comprehensionProviderCalled,
      providerSkipReason,
      providerSuccess,
      providerLatencyMs,
      rawEventCount: raw.events.length,
      eventsAfterNormalizationCount: events.length,
      targetDateExtracted: comprehension.targetDate,
      targetDateSource,
    },
  };
}
