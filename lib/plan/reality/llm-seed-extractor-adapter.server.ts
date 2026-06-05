import "server-only";
/**
 * Reality Control OS — A1-5-5d-2a LLM Seed Extractor Adapter Host / Env Resolver（server-only・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.29/§8.31
 *
 * 役割: SDK-free core（§8.30 `createLlmSeedExtractorAdapterCore`）に **env 境界**を付ける server-only host。
 *   process.env から apiKey/model/timeout/retry/confidenceThreshold を読み、`fetchImpl=globalThis.fetch` を注入して
 *   `SeedExtractor` を組み立てる。**env 不備時は fail-closed の no-op extractor**（fetch しない・secret なし）。
 *
 * 厳守（A1-5-5d-2a）:
 *   - **実 LLM API call / real network しない**（adapter を組むだけ・extract は呼ばない）。SDK 非 import（core も REST のみ）。
 *   - **secret（apiKey）を result / error / observation に出さない**（result/observation 型は redacted・5d-1 既定）。host は apiKey を log/throw しない。
 *   - **core 本体は不変**（本 host は core を呼ぶだけ）。
 *   - `server-only` / barrel 非 export / route·UI·PlanClient·runtime から呼ばない（A1-5-5g まで）。
 */

import {
  createLlmSeedExtractorAdapterCore,
  type LlmSeedExtractorAdapterConfig,
  type RedactedExtractionObservation,
} from "./llm-seed-extractor-adapter-core";
import type { SeedExtractor } from "./seed-extractor-contract";

/** capture LLM の env 名（server-side のみ・NEXT_PUBLIC なし）。 */
export const CAPTURE_LLM_ENV = {
  apiKey: "REALITY_CAPTURE_LLM_API_KEY",
  model: "REALITY_CAPTURE_LLM_MODEL",
  timeoutMs: "REALITY_CAPTURE_LLM_TIMEOUT_MS",
  maxRetry: "REALITY_CAPTURE_LLM_MAX_RETRY",
  confidenceThreshold: "REALITY_CAPTURE_LLM_CONFIDENCE_THRESHOLD",
} as const;

/** env から解決した config（apiKey/model 必須・optional は env にあれば反映・fetchImpl 等は host が注入）。 */
export interface CaptureLlmResolvedConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs?: number;
  readonly maxRetry?: number;
  readonly confidenceThreshold?: number;
}

type EnvLike = Record<string, string | undefined>;

/** 非負整数（不正/未設定→undefined=core 既定）。 */
function parseNonNegInt(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}
/** [0,1] の float（不正/未設定→undefined=core 既定）。 */
function parseUnitFloat(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : undefined;
}

/**
 * env → CaptureLlmResolvedConfig（**pure・fail-closed**）。apiKey/model が無ければ **null**（→ no-op extractor）。
 *   optional（timeout/retry/confidenceThreshold）は env にあり妥当なら反映、それ以外は core 既定（undefined）。
 *   throw しない・apiKey を log しない。
 */
export function resolveCaptureLlmConfig(env: EnvLike): CaptureLlmResolvedConfig | null {
  const apiKey = env[CAPTURE_LLM_ENV.apiKey];
  const model = env[CAPTURE_LLM_ENV.model];
  if (typeof apiKey !== "string" || apiKey.trim() === "") return null; // 鍵なし → fail-closed
  if (typeof model !== "string" || model.trim() === "") return null; // model なし → fail-closed
  const timeoutMs = parseNonNegInt(env[CAPTURE_LLM_ENV.timeoutMs]);
  const maxRetry = parseNonNegInt(env[CAPTURE_LLM_ENV.maxRetry]);
  const confidenceThreshold = parseUnitFloat(env[CAPTURE_LLM_ENV.confidenceThreshold]);
  return {
    apiKey,
    model,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(maxRetry !== undefined ? { maxRetry } : {}),
    ...(confidenceThreshold !== undefined ? { confidenceThreshold } : {}),
  };
}

/** env 不備時の fail-closed no-op extractor（常に no_intent・**fetch しない・secret なし**）。 */
export function createUnavailableSeedExtractor(): SeedExtractor {
  return {
    async extract() {
      return { kind: "no_intent" };
    },
  };
}

/**
 * env + fetchImpl から SeedExtractor を組み立てる（**pure-ish**・テスト容易）。
 *   env 不備 → no-op extractor。揃っていれば core に config + fetchImpl + onObservation を注入。
 *   **本関数は extract を呼ばない**（組むだけ・実 LLM call しない）。
 */
export function buildServerLlmSeedExtractor(
  env: EnvLike,
  fetchImpl: typeof globalThis.fetch,
  onObservation?: (obs: RedactedExtractionObservation) => void
): SeedExtractor {
  const cfg = resolveCaptureLlmConfig(env);
  if (cfg === null) return createUnavailableSeedExtractor(); // fail-closed
  const coreConfig: LlmSeedExtractorAdapterConfig = { ...cfg, fetchImpl, onObservation };
  return createLlmSeedExtractorAdapterCore(coreConfig);
}

/**
 * A1-5-5d-2a: server-only host。**process.env + globalThis.fetch** を注入して SeedExtractor を返す。
 *   env 不備 → no-op。**adapter を組むだけ**（実 LLM API call は呼出側が extract した時のみ＝A1-5-5d-2b 以降）。
 */
export function createServerLlmSeedExtractor(
  onObservation?: (obs: RedactedExtractionObservation) => void
): SeedExtractor {
  return buildServerLlmSeedExtractor(process.env, globalThis.fetch, onObservation);
}
