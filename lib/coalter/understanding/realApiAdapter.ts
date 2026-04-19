/**
 * CoAlter Stage 1 Understand — 実 LLM adapter (Anthropic ZDR)
 *
 * [CEO lock 2026-04-20 M0-6B] fail-fast 保護の骨格:
 *   - `zdrVerified !== true` または api key 空 → 起動時 throw（実 API を叩かない）
 *   - Supabase / analytics / logger への書込経路なし
 *   - catch 節は error kind のみ throw。body / schema 断片は error message に混ぜない
 *   - 出力は `LLMReadingCandidate` （narration UI と同じ validated shape）のみ
 *
 * 設計ノート:
 *   - 呼び出し元は shadow-real-api.ts。実稼働前提の ZDR evidence が
 *     docs/coalter-m0-6b-zdr-evidence.md にある
 *   - `zdrVerified` は env / config から明示的に渡す。adapter は自動判定しない
 *   - 本 adapter 内部には `prompt` / `rawOutput` / `rawRationale` 識別子を
 *     置かない（Gate E-6 への準拠）
 *   - `implicitIntent` は LLMReadingCandidate の必須 field のため、
 *     本ファイルは leakAudit.test.ts の E-7 allowlist に加える
 */

import type { CompressedTodayInput } from "./compressTodayInput";
import type {
  LLMReadingCandidate,
  TodayReaderLLMClient,
} from "./todayReaderLLM";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Options
// ═══════════════════════════════════════════════════════════════════════════

export type RealApiAdapterOptions = {
  apiKey: string;
  /** CEO が Anthropic Console で ZDR enrollment を確認したことを示す boolean。 */
  zdrVerified: boolean;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
};

const DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_TOKENS = 512;
const ANTHROPIC_VERSION = "2023-06-01";

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public factory — fail-fast startup
// ═══════════════════════════════════════════════════════════════════════════

export function createRealApiAdapter(
  opts: RealApiAdapterOptions,
): TodayReaderLLMClient {
  if (typeof opts.apiKey !== "string" || opts.apiKey.length === 0) {
    throw new Error("coalter/realApiAdapter: api_key_missing");
  }
  if (opts.zdrVerified !== true) {
    const suffix = maskSuffix(opts.apiKey);
    throw new Error(
      `coalter/realApiAdapter: zdr_unverified (key_suffix=${suffix})`,
    );
  }

  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const model = opts.model ?? DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const apiKey = opts.apiKey;

  return {
    async infer(input: CompressedTodayInput): Promise<LLMReadingCandidate> {
      const body = buildInferenceRequest(input, model);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("coalter/realApiAdapter: timeout");
        }
        throw new Error("coalter/realApiAdapter: http_error");
      }
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(
          `coalter/realApiAdapter: http_status_${response.status}`,
        );
      }

      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new Error("coalter/realApiAdapter: json_parse_error");
      }

      const candidate = extractCandidate(raw);
      if (candidate === null) {
        throw new Error("coalter/realApiAdapter: shape_error");
      }
      return candidate;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. request builder — 構造化 signal のみを LLM に渡す
// ═══════════════════════════════════════════════════════════════════════════

export function buildInferenceRequest(
  input: CompressedTodayInput,
  model: string,
): Record<string, unknown> {
  const systemInstruction = SYSTEM_INSTRUCTION;
  const userContent = JSON.stringify(input);
  return {
    model,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: systemInstruction,
    messages: [{ role: "user", content: userContent }],
  };
}

const SYSTEM_INSTRUCTION = [
  "You are CoAlter Stage 1 Understand today-reader.",
  "Input is a JSON object of structural signals for a two-person relationship today.",
  "Output strict JSON with the following shape and no surrounding commentary:",
  "{",
  '  "mode": "recover" | "celebrate" | "connect" | "challenge" | "maintain",',
  '  "energyBudget": "high" | "mid" | "low",',
  '  "timeBudget": "ample" | "limited" | "tight",',
  '  "implicitIntent": "<short phrase, max 40 chars>",',
  '  "latentNeeds": ["<short phrase>", ...],',
  '  "confidence": number in [0, 1]',
  "}",
  "Return only the JSON object.",
].join("\n");

// ═══════════════════════════════════════════════════════════════════════════
// 4. response parser — Anthropic Messages API の content[0].text を取る
// ═══════════════════════════════════════════════════════════════════════════

function extractCandidate(raw: unknown): LLMReadingCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const content = obj.content;
  if (!Array.isArray(content) || content.length === 0) return null;
  const first = content[0] as Record<string, unknown>;
  const text = first.text;
  if (typeof text !== "string") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;

  const mode = p.mode;
  const energyBudget = p.energyBudget;
  const timeBudget = p.timeBudget;
  const intent = p.implicitIntent;
  const needs = p.latentNeeds;
  const confidence = p.confidence;

  if (typeof mode !== "string") return null;
  if (typeof energyBudget !== "string") return null;
  if (typeof timeBudget !== "string") return null;
  if (typeof intent !== "string") return null;
  if (!Array.isArray(needs)) return null;
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null;

  return {
    mode: mode as LLMReadingCandidate["mode"],
    energyBudget: energyBudget as LLMReadingCandidate["energyBudget"],
    timeBudget: timeBudget as LLMReadingCandidate["timeBudget"],
    implicitIntent: intent,
    latentNeeds: needs.filter((n): n is string => typeof n === "string"),
    confidence,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. 小さなヘルパ
// ═══════════════════════════════════════════════════════════════════════════

function maskSuffix(key: string): string {
  if (key.length >= 4) return key.slice(-4);
  return "****";
}
