/**
 * CoAlter Stage 1 Understand — LLM stub 戦略群（M0-5 shadow bootstrap 用）
 *
 * [CEO lock 2026-04-20 M0-5]
 *   - 決定論（Math.random 禁止）
 *   - prod 接続禁止（test / script 限定）
 *   - rule-based と意図的に食い違う戦略を 1 つ以上含める
 *     → modeAgreement が 1.0 にならないことで比較指標の信号を確認する
 *
 * strategy:
 *   copycat            : rule-based と同じ mode を返す（上限 sanity check）
 *   shifted-energy     : energyBudget を low→mid→high にずらす
 *   celebrate-bias     : conversationArc=expanding を全て celebrate と判定
 *   recover-bias       : fatigueSignal>=some を全て recover と判定
 *   random-deterministic : 入力 hash で 5 mode を決定論的に回転
 *
 * これら複数戦略の分布で shadow 集計の解釈力を先に検証する。
 */

import type { CompressedTodayInput } from "../compressTodayInput";
import type {
  LLMReadingCandidate,
  TodayReaderLLMClient,
} from "../todayReaderLLM";
import type { TodayMode } from "../types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. rule-based の mode 分岐を stub で再現（copycat 用）
//    本体 todayReader と同じロジックを CompressedTodayInput 側で再計算する。
// ═══════════════════════════════════════════════════════════════════════════

function modeFromCompressed(input: CompressedTodayInput): TodayMode {
  if (input.energyLevel === "low") return "recover";
  if (input.fatigueSignal === "strong") return "recover";
  if (input.fatigueSignal === "some") {
    // rule-based: turn 1 本だけ fatigue hit でも recover に倒す
    // （hit=1 → bothFatigued true → recover）
    return "recover";
  }
  if (input.celebrationSignal) return "celebrate";
  if (input.conversationArc === "expanding" && input.renLeaning.a && input.renLeaning.b) {
    return "challenge";
  }
  const caringGap = Math.abs(input.caringIntensity.a - input.caringIntensity.b);
  if (caringGap >= 0.2) return "connect";
  return "maintain";
}

function confidenceFromCompressed(input: CompressedTodayInput): number {
  const c = input.completeness;
  const personScore =
    (avgFour(c.personA.stargazer, c.personA.alter, c.personA.behavioral, c.personA.context) +
      avgFour(c.personB.stargazer, c.personB.alter, c.personB.behavioral, c.personB.context)) /
    2;
  const score =
    0.4 * personScore +
    0.2 * c.relationship +
    0.25 * c.conversation +
    0.15 * c.environmental;
  return Math.round(score * 1000) / 1000;
}

function avgFour(a: number, b: number, c: number, d: number): number {
  return (a + b + c + d) / 4;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. 決定論 hash（FNV-1a 32bit）— random-deterministic 戦略で使用
// ═══════════════════════════════════════════════════════════════════════════

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Strategy 実装
// ═══════════════════════════════════════════════════════════════════════════

export type StubStrategy =
  | "copycat"
  | "shifted-energy"
  | "celebrate-bias"
  | "recover-bias"
  | "random-deterministic";

export const STUB_STRATEGIES: readonly StubStrategy[] = [
  "copycat",
  "shifted-energy",
  "celebrate-bias",
  "recover-bias",
  "random-deterministic",
];

export function makeStubClient(strategy: StubStrategy): TodayReaderLLMClient {
  return {
    infer: async (input) => buildCandidate(strategy, input),
  };
}

function buildCandidate(
  strategy: StubStrategy,
  input: CompressedTodayInput,
): LLMReadingCandidate {
  const baseMode = modeFromCompressed(input);
  const baseConf = confidenceFromCompressed(input);

  let mode: TodayMode = baseMode;
  let confidence = baseConf;
  let energyBudget: "high" | "mid" | "low" = input.energyLevel;

  switch (strategy) {
    case "copycat":
      // そのまま、但し LLM 側の気持ち confidence は微妙にずらす（0.05 下）
      confidence = clamp(baseConf - 0.05);
      break;
    case "shifted-energy":
      // energy を 1 段ずらす（low↔mid↔high）
      if (input.energyLevel === "low") energyBudget = "mid";
      else if (input.energyLevel === "mid") energyBudget = "high";
      else energyBudget = "mid";
      confidence = clamp(baseConf + 0.03);
      break;
    case "celebrate-bias":
      if (input.conversationArc === "expanding") mode = "celebrate";
      confidence = clamp(baseConf + 0.08);
      break;
    case "recover-bias":
      if (input.fatigueSignal !== "none") mode = "recover";
      confidence = clamp(baseConf - 0.1);
      break;
    case "random-deterministic": {
      const h = fnv1a(JSON.stringify(input));
      const modes: TodayMode[] = ["recover", "celebrate", "connect", "challenge", "maintain"];
      mode = modes[h % 5];
      confidence = clamp(((h % 40) + 30) / 100); // 0.30 〜 0.69
      break;
    }
  }

  return {
    mode,
    energyBudget,
    timeBudget: "limited",
    implicitIntent: "", // stub では narration 文生成しない（漏洩リスク 0）
    latentNeeds: input.unspokenDesires.slice(0, 2),
    confidence,
  };
}

function clamp(v: number): number {
  return Math.min(1, Math.max(0, Math.round(v * 1000) / 1000));
}
