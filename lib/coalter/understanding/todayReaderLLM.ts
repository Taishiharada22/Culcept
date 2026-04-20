/**
 * CoAlter Stage 1 Understand — TodayReader LLM 版（shadow）
 *
 * [CEO lock 2026-04-20 M0-4 #1] rule-based todayReader を置き換えず並立する。
 * [CEO lock 2026-04-20 M0-4 #2] デフォルトは rule-based。LLM 版は shadow 比較専用。
 * [CEO lock 2026-04-20 M0-4 #4] 入力は CompressedTodayInput のみ。ObservationBundle を触らない。
 *
 * 内部 API は rule-based と同じ: TodayReading を返す。比較器 (compareTodayReaders)
 * が両者の出力から集約メトリクスを生成する。
 *
 * LLM クライアントは dependency injection:
 *   - 本番 (M0-5 以降): OpenAI / Claude adapter を差し込む
 *   - 単体 test: deterministic stub を差し込む
 *   - 未注入時: "error" outcome で graceful fallback（rule-based は独立なので影響なし）
 */

import type { CompressedTodayInput } from "./compressTodayInput";
import type { TodayMode, TodayReading } from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. LLM client interface
// ═══════════════════════════════════════════════════════════════════════════

/**
 * JSON-only LLM adapter。prompt string は adapter 側で構築する（本モジュール外）。
 * 返り値は LLM の生テキストではなく、parsed & validated な TodayReading shape のみ。
 * これにより diagnostics への raw output 漏洩経路が型で塞がれる。
 */
export interface TodayReaderLLMClient {
  infer(input: CompressedTodayInput): Promise<LLMReadingCandidate>;
}

/**
 * LLM からの返却候補。TodayReading のうち narration-sensitive 要素のみ。
 * rule-based と同じ type contract。latency は caller 側で計測する。
 */
export type LLMReadingCandidate = {
  mode: TodayMode;
  energyBudget: "high" | "mid" | "low";
  timeBudget: "ample" | "limited" | "tight";
  implicitIntent: string;
  latentNeeds: string[];
  confidence: number;
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. Validation — LLM が出せる値を許可リストに固定
// ═══════════════════════════════════════════════════════════════════════════

const VALID_MODES: readonly TodayMode[] = [
  "recover",
  "celebrate",
  "connect",
  "challenge",
  "maintain",
];
const VALID_ENERGY: readonly ("high" | "mid" | "low")[] = ["high", "mid", "low"];
const VALID_TIME: readonly ("ample" | "limited" | "tight")[] = [
  "ample",
  "limited",
  "tight",
];

/**
 * LLM 出力を型安全な TodayReading に昇格する。
 * invalid なら null を返し、caller 側で "fallback" 扱いにする。
 */
export function validateLLMReading(
  candidate: unknown,
): TodayReading | null {
  if (!candidate || typeof candidate !== "object") return null;
  const c = candidate as Record<string, unknown>;

  if (typeof c.mode !== "string" || !VALID_MODES.includes(c.mode as TodayMode)) return null;
  if (typeof c.energyBudget !== "string" || !VALID_ENERGY.includes(c.energyBudget as "high" | "mid" | "low")) return null;
  if (typeof c.timeBudget !== "string" || !VALID_TIME.includes(c.timeBudget as "ample" | "limited" | "tight")) return null;
  if (typeof c.implicitIntent !== "string") return null;
  if (!Array.isArray(c.latentNeeds)) return null;
  if (c.latentNeeds.some((n) => typeof n !== "string")) return null;
  if (typeof c.confidence !== "number") return null;
  if (!Number.isFinite(c.confidence)) return null;

  // clamp
  const confidence = Math.min(1, Math.max(0, c.confidence));
  // 小数 3 桁に丸め（rule-based と同じ丸め方、比較の決定性確保）
  const rounded = Math.round(confidence * 1000) / 1000;

  const needs = (c.latentNeeds as string[])
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .slice(0, 3);

  return {
    mode: c.mode as TodayMode,
    energyBudget: c.energyBudget as "high" | "mid" | "low",
    timeBudget: c.timeBudget as "ample" | "limited" | "tight",
    implicitIntent: c.implicitIntent.trim(),
    latentNeeds: needs,
    confidence: rounded,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Public API — LLM 経路
// ═══════════════════════════════════════════════════════════════════════════

export type LLMReaderOutcome = "ok" | "fallback" | "error";

export type LLMReaderResult =
  | { outcome: "ok"; reading: TodayReading }
  | { outcome: "fallback"; reading: null; reason: "invalid_shape" | "empty" }
  | { outcome: "error"; reading: null; reason: "exception" | "no_client" };

/**
 * @param input 圧縮済み入力（CompressedTodayInput）
 * @param client DI された LLM client。undefined なら "no_client" error を返す
 */
export async function readTodayLLM(
  input: CompressedTodayInput,
  client: TodayReaderLLMClient | undefined,
): Promise<LLMReaderResult> {
  if (!client) {
    return { outcome: "error", reading: null, reason: "no_client" };
  }

  let candidate: LLMReadingCandidate | null = null;
  try {
    candidate = await client.infer(input);
  } catch {
    return { outcome: "error", reading: null, reason: "exception" };
  }

  if (!candidate) {
    return { outcome: "fallback", reading: null, reason: "empty" };
  }

  const validated = validateLLMReading(candidate);
  if (!validated) {
    return { outcome: "fallback", reading: null, reason: "invalid_shape" };
  }

  return { outcome: "ok", reading: validated };
}
