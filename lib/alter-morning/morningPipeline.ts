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

import type { ComprehensionResult } from "./comprehension/eventSchema";
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
  const { utterance } = input;
  const narrationProvider = providers.narration ?? stubNarrationProvider;
  const weatherProvider = providers.weather ?? null;

  // L1.0 — rule pre-parse（hint 化のみ。state は持たせない）
  const hints = preParseUtterance(utterance);

  // L1.1 — LLM Structured Outputs 抽出
  const raw = await providers.comprehension.extract(utterance, hints);

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
  const comprehension = runL1Pipeline({ raw, utterance });
  const events = comprehension.events;

  // L2 — Planning（純関数 3 つ）
  const timeline = solveTimeLine(events);
  const grounded = groundPlaces(events);
  const gapResolution = resolveGaps(events);

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
