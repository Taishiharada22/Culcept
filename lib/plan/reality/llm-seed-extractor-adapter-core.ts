/**
 * Reality Control OS — A1-5-5d-1 LLM Seed Extractor Adapter Core（SDK-free・network-free・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.29/§8.30
 *
 * 役割: `SeedExtractor`（§8.27）の **env-free / SDK-free core**。LLM（Gemini REST 形）を **fetchImpl DI** 経由で呼び、
 *   structured 出力を `ExtractorResult` に map する。**実 SDK import なし**（REST のみ）。env は host（5d-2 `.server`）が解決。
 *   mirror: `lib/plan/shift/draftExtractionGeminiAdapterCore.ts`（env-free core・fetchImpl/sleep DI・safe error mapping）。
 *
 * 重要差分（capture 固有・厳守）:
 *   - **throw しない**: capture は chat と並走する background ゆえ、全 error（auth/network/timeout/rate-limit/parse/model）→
 *     **no_intent fail-safe**（chat を壊さない）。`extract` は決して throw しない。
 *   - **durationKind を保守的に map**: `kind==="explicit"` のみ high（evidence）/ それ以外（inferred/欠落/不明）→ low（weak・evidence 化されない）。
 *     range 検証は **validateExtractorOutput（§8.27 単一ソース）に委譲**（本 core は range を見ない）。
 *   - **raw を出力に持ち込まない**: extracted.raw は contract フィールドのみ明示構築（LLM 余剰フィールドは drop）。
 *     sourceRef は **input から注入**（LLM 出力でない opaque id）。utterance/prompt/response 本文は result/observation に出さない。
 *
 * 制約: process.env 非依存・実 SDK 非 import・実 DB / Supabase / runtime / route / UI なし。barrel 非 export。
 *   server-only marker は付けない（test 可能・client bundle 混入防止は将来 `.server` host の責務）。
 */

import type {
  SeedExtractor,
  CaptureExtractionInput,
  ExtractorResult,
  ExtractorStructuredOutput,
} from "./seed-extractor-contract";

const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TIMEOUT_MS = 8_000; // background ゆえ短め
const DEFAULT_MAX_RETRY = 2;
const DEFAULT_RETRY_BACKOFF_MS = 1_000;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.5; // 全体 confidence < 閾値 → no_intent

/** adapter core config（**全 DI・process.env 非依存**・env は host が解決）。 */
export interface LlmSeedExtractorAdapterConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs?: number;
  readonly maxRetry?: number;
  readonly retryBackoffMs?: number;
  /** 全体 extraction confidence の下限（未満は no_intent）。既定 0.5。 */
  readonly confidenceThreshold?: number;
  readonly endpointBase?: string;
  /** test 用 fetch 注入（未指定なら globalThis.fetch）。 */
  readonly fetchImpl?: typeof globalThis.fetch;
  /** test 用 sleep 注入（retry backoff）。 */
  readonly sleep?: (ms: number) => Promise<void>;
  /** test 用 clock 注入（latency 計測）。 */
  readonly now?: () => number;
  /** redacted observation（raw を含めない）。 */
  readonly onObservation?: (obs: RedactedExtractionObservation) => void;
}

/** extraction の reason code（redacted・raw なし）。 */
export type ExtractionReason =
  | "ok"
  | "auth_missing"
  | "config_error"
  | "network_error"
  | "timeout"
  | "rate_limited"
  | "model_error"
  | "invalid_response"
  | "parse_fail"
  | "no_actionable_intent"
  | "low_confidence";

/** redacted observation（**prompt/response/raw を含まない**）。 */
export interface RedactedExtractionObservation {
  readonly outcome: "extracted" | "no_intent";
  readonly reason: ExtractionReason;
  readonly attempts: number;
  readonly tokenUsage?: number;
  readonly latencyMs?: number;
}

/** LLM が返すべき出力スキーマ（prompt 埋め込み用・const）。raw 本文を値に含めない構造化のみ。 */
export const SEED_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    hasActionableIntent: { type: "boolean" },
    desiredDate: { type: ["string", "null"], description: "YYYY-MM-DD（相対表現は基準時刻で解決）or null" },
    desiredTimeHint: { type: ["string", "null"], enum: ["morning", "afternoon", "evening", "anytime", null] },
    actionShape: {
      type: ["string", "null"],
      enum: ["full_go", "bounded_go", "prepare_then_go", "trial_then_decide", "observe_first", "delegate_or_request", "defer_with_trigger", "skip", null],
    },
    confidence: { type: "number", description: "抽出全体の自信度 0..1" },
    duration: {
      type: ["object", "null"],
      properties: {
        durationMin: { type: "number" },
        kind: { type: "string", enum: ["explicit", "inferred"], description: "explicit=ユーザーが明示 / inferred=文脈推測" },
      },
    },
  },
  required: ["hasActionableIntent", "confidence"],
} as const;

/** pure prompt builder（raw utterance を LLM に渡すための transient prompt・永続化しない）。 */
export function buildSeedExtractionPrompt(input: { utterance: string; nowIso: string }): string {
  return [
    "あなたは予定意図の抽出器です。ユーザーの発話から、予定・行動の意図を構造化して JSON のみで返してください。",
    `基準時刻: ${input.nowIso}（「明日」「来週」等の相対表現はこれを基準に YYYY-MM-DD に解決）。`,
    "actionable な予定/行動の意図が無ければ hasActionableIntent=false。",
    "duration: ユーザーが時間を明示的に述べた場合のみ kind='explicit'。文脈から推測した場合は kind='inferred'。述べていなければ null。",
    "raw な発話本文・個人特定情報を JSON の値に含めないこと（構造化フィールドのみ）。",
    "出力スキーマ:",
    JSON.stringify(SEED_EXTRACTION_JSON_SCHEMA),
    "発話:",
    input.utterance,
  ].join("\n");
}

interface GeminiResponseShape {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { totalTokenCount?: number };
}

/** duration を保守的に map: explicit のみ high（evidence）/ それ以外（inferred/欠落/不明）→ low（weak）。range は検証側。 */
function mapDuration(d: unknown): { readonly durationMin: number; readonly confidence: "high" | "low" } | undefined {
  if (d === null || typeof d !== "object") return undefined;
  const dd = d as Record<string, unknown>;
  if (typeof dd.durationMin !== "number") return undefined;
  return { durationMin: dd.durationMin, confidence: dd.kind === "explicit" ? "high" : "low" };
}

/** LLM 構造化出力 → contract raw（**contract フィールドのみ明示構築**・raw 余剰 drop・sourceRef は input 注入）。confidence は呼出側で number 検証済を渡す。 */
function buildExtractorRaw(o: Record<string, unknown>, input: CaptureExtractionInput, confidence: number): ExtractorStructuredOutput {
  const dur = mapDuration(o.duration);
  return {
    confidence,
    source: "chat",
    ...(typeof o.desiredDate === "string" ? { desiredDate: o.desiredDate } : {}),
    ...(typeof o.desiredTimeHint === "string" ? { desiredTimeHint: o.desiredTimeHint } : {}),
    ...(typeof o.actionShape === "string" ? { actionShape: o.actionShape } : {}),
    ...(typeof input.sourceRef === "string" ? { sourceRef: input.sourceRef } : {}), // opaque id を input から注入
    ...(dur ? { explicitDuration: dur } : {}),
  };
}

/**
 * A1-5-5d-1: env-free / SDK-free LLM seed extractor adapter core（**fetchImpl DI・throw しない**）。
 *   extract: prompt → fetchImpl(Gemini REST) → parse → map → ExtractorResult。全 error → no_intent fail-safe。
 */
export function createLlmSeedExtractorAdapterCore(config: LlmSeedExtractorAdapterConfig): SeedExtractor {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const sleep = config.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = config.now ?? (() => Date.now());
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetry = config.maxRetry ?? DEFAULT_MAX_RETRY;
  const retryBackoffMs = config.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
  const threshold = config.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const endpointBase = config.endpointBase ?? GEMINI_ENDPOINT_BASE;

  return {
    async extract(input: CaptureExtractionInput): Promise<ExtractorResult> {
      const start = now();
      const observe = (outcome: "extracted" | "no_intent", reason: ExtractionReason, attempts: number, tokenUsage?: number): void => {
        config.onObservation?.({ outcome, reason, attempts, tokenUsage, latencyMs: now() - start });
      };
      const noIntent = (reason: ExtractionReason, attempts: number, tokenUsage?: number): ExtractorResult => {
        observe("no_intent", reason, attempts, tokenUsage);
        return { kind: "no_intent" };
      };

      // auth/config gate（fetch しない）
      if (typeof config.apiKey !== "string" || config.apiKey.trim() === "") return noIntent("auth_missing", 0);
      if (typeof config.model !== "string" || config.model.trim() === "") return noIntent("config_error", 0);

      const prompt = buildSeedExtractionPrompt({ utterance: input.utterance, nowIso: input.nowIso });
      const body = JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: "application/json" },
      });
      const url = `${endpointBase}/${encodeURIComponent(config.model)}:generateContent`;

      for (let attempt = 0; attempt <= maxRetry; attempt++) {
        const controller = new AbortController();
        const timeoutHandle: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), timeoutMs);
        let res: Response;
        try {
          res = await fetchImpl(url, {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey }, // API key は header（URL/log に出さない）
            body,
          });
        } catch (e: unknown) {
          clearTimeout(timeoutHandle);
          if (e instanceof Error && e.name === "AbortError") return noIntent("timeout", attempt + 1);
          return noIntent("network_error", attempt + 1); // raw error は載せない
        }
        clearTimeout(timeoutHandle);

        if (res.ok) {
          let parsedRes: GeminiResponseShape;
          try {
            parsedRes = (await res.json()) as GeminiResponseShape;
          } catch {
            return noIntent("invalid_response", attempt + 1); // raw body を読まない
          }
          const tokenUsage = typeof parsedRes.usageMetadata?.totalTokenCount === "number" ? parsedRes.usageMetadata.totalTokenCount : undefined;
          const text = parsedRes.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
          if (text === "") return noIntent("invalid_response", attempt + 1, tokenUsage);
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            return noIntent("parse_fail", attempt + 1, tokenUsage);
          }
          // map（hasActionableIntent / confidence 閾値 / durationKind）
          if (parsed === null || typeof parsed !== "object") return noIntent("no_actionable_intent", attempt + 1, tokenUsage);
          const o = parsed as Record<string, unknown>;
          if (o.hasActionableIntent !== true) return noIntent("no_actionable_intent", attempt + 1, tokenUsage);
          if (typeof o.confidence !== "number" || !Number.isFinite(o.confidence) || o.confidence < threshold) {
            return noIntent("low_confidence", attempt + 1, tokenUsage);
          }
          const raw = buildExtractorRaw(o, input, o.confidence); // o.confidence は上で number 検証済
          observe("extracted", "ok", attempt + 1, tokenUsage);
          return { kind: "extracted", raw };
        }

        // !res.ok — raw body を読まない
        if (res.status === 429 || res.status === 503) {
          if (attempt < maxRetry) {
            await sleep(retryBackoffMs * (attempt + 1));
            continue;
          }
          return noIntent(res.status === 429 ? "rate_limited" : "model_error", attempt + 1);
        }
        return noIntent("model_error", attempt + 1);
      }
      return noIntent("model_error", maxRetry + 1); // loop 終端（到達しない・TS のため）
    },
  };
}
