import "server-only";

import {
  AIProviderError,
  type AIProviderRequest,
  type AIProviderResponse,
} from "../types";

/**
 * Student Provider — v2 LoRA (Qwen2.5-7B-Instruct + LoRA) on RunPod Serverless
 *
 * Generation-only。requireJson: true のリクエストは受け付けない。
 * RunPod Serverless の vLLM-compatible エンドポイントを OpenAI Chat Completions
 * フォーマットで呼び出す。
 *
 * 環境変数:
 *   STUDENT_PROVIDER_ENDPOINT — RunPod Serverless endpoint URL
 *   STUDENT_PROVIDER_API_KEY  — RunPod API key
 *   STUDENT_PROVIDER_MODEL    — モデル名 (default: "qwen2.5-7b-instruct-lora-v2")
 *   STUDENT_PROVIDER_TIMEOUT_MS — タイムアウト (default: 30000)
 */

function getEndpoint(): string {
  return (process.env.STUDENT_PROVIDER_ENDPOINT ?? "").trim();
}

function getApiKey(): string {
  return (process.env.STUDENT_PROVIDER_API_KEY ?? "").trim();
}

function getModel(): string {
  return (
    process.env.STUDENT_PROVIDER_MODEL ?? "qwen2.5-7b-instruct-lora-v2"
  ).trim();
}

function getTimeoutMs(): number {
  const raw = (process.env.STUDENT_PROVIDER_TIMEOUT_MS ?? "").trim();
  if (!raw) return 30_000;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 30_000;
  return value;
}

/** Student provider が利用可能かチェック */
export function isStudentProviderAvailable(): boolean {
  return getEndpoint().length > 0 && getApiKey().length > 0;
}

/**
 * v2 LoRA inference via RunPod Serverless (vLLM OpenAI-compatible API)
 *
 * リクエスト形式: OpenAI Chat Completions API
 * レスポンス形式: { choices: [{ message: { content: string } }] }
 */
export async function runStudent(
  request: AIProviderRequest,
  options?: { model?: string },
): Promise<AIProviderResponse> {
  const endpoint = getEndpoint();
  const apiKey = getApiKey();
  const model = options?.model || getModel();
  const timeoutMs = getTimeoutMs();

  if (!endpoint) {
    throw new AIProviderError({
      provider: "student",
      code: "endpoint_not_configured",
      message: "STUDENT_PROVIDER_ENDPOINT is not set",
      retryable: false,
    });
  }

  if (!apiKey) {
    throw new AIProviderError({
      provider: "student",
      code: "api_key_missing",
      message: "STUDENT_PROVIDER_API_KEY is not set",
      retryable: false,
    });
  }

  // Student provider は Generation-only — JSON 出力要求は拒否
  if (request.requireJson) {
    throw new AIProviderError({
      provider: "student",
      code: "json_not_supported",
      message: "Student provider does not support requireJson (Generation-only)",
      retryable: false,
    });
  }

  // メッセージ構築 (OpenAI Chat Completions format)
  const messages: Array<{ role: string; content: string }> = [];

  if (request.systemPrompt) {
    messages.push({ role: "system", content: request.systemPrompt });
  }

  messages.push({ role: "user", content: request.prompt });

  const body = {
    model,
    messages,
    temperature: request.temperature ?? 0.4,
    max_tokens: request.maxOutputTokens ?? 384,
    top_p: 0.9,
    repetition_penalty: 1.15,
    // vLLM の LoRA adapter 指定 (RunPod Serverless 設定による)
    // adapter が base model に統合済みなら不要
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = endpoint.endsWith("/")
      ? `${endpoint}v1/chat/completions`
      : `${endpoint}/v1/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new AIProviderError({
        provider: "student",
        code: `http_${response.status}`,
        message: `Student provider returned ${response.status}: ${errorText.slice(0, 200)}`,
        retryable: response.status >= 500,
        status: response.status,
        responseText: errorText || null,
      });
    }

    const json = await response.json();

    // vLLM / RunPod Serverless は OpenAI-compatible format で返す
    const choice = json?.choices?.[0];
    const text = choice?.message?.content ?? "";
    const usage = json?.usage;

    if (!text.trim()) {
      throw new AIProviderError({
        provider: "student",
        code: "empty_output",
        message: "Student provider returned empty output",
        retryable: true,
        responseText: JSON.stringify(json).slice(0, 500),
      });
    }

    // Output validation: 最低限の品質チェック
    const validationResult = validateStudentOutput(text);
    if (validationResult.valid === false) {
      throw new AIProviderError({
        provider: "student",
        code: "output_validation_failed",
        message: `Student output failed validation: ${validationResult.reason}`,
        retryable: false,
        responseText: text,
        metadata: { validationReason: validationResult.reason },
      });
    }

    return {
      provider: "student",
      model,
      text,
      structured: null, // Generation-only — structured は常に null
      inputTokens: usage?.prompt_tokens ?? null,
      outputTokens: usage?.completion_tokens ?? null,
      confidence: null,
    };
  } catch (error) {
    if (error instanceof AIProviderError) throw error;

    const isTimeout =
      error instanceof Error && error.name === "AbortError";

    throw new AIProviderError({
      provider: "student",
      code: isTimeout ? "timeout" : "network_error",
      message: isTimeout
        ? `Student provider timed out after ${timeoutMs}ms`
        : `Student provider network error: ${error instanceof Error ? error.message : "unknown"}`,
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Output Validation ───────────────────────────────────────

export type ValidationResult = { valid: true } | { valid: false; reason: string };

/** v2 LoRA の generic opening pattern (v1 で generic rate 8.5% まで悪化した原因) */
const GENERIC_OPENING_PATTERNS = [
  /^はい[、。\s]/,
  /^了解[しで][まし][たす][、。\s!！]/,
  /^承知[いし]?[たま]?[しで]?[まし]?[たす]?[、。\s]/,
  /^わかりました[、。\s!！]/,
  /^もちろん[、。\sでですす！!]/,
  /^お答えします[、。\s]/,
  /^ご質問ありがとう/,
];

/**
 * Student output の品質ゲート
 *
 * v2 LoRA の既知の失敗モードを検出:
 * - too_short          : 短すぎる応答 → generic 化の兆候 (v1/v2 共通)
 * - too_long           : 長すぎる応答 → 訓練 max 800字超過、推論時崩壊
 * - chinese_contamination : 中国語混入 → Qwen bilingual base の漏出 (v2で8/198観測)
 * - generic_opening    : 定型挨拶で始まる → Alter voice 崩壊 (v1で9/118観測)
 * - excessive_empty_lines : 空行だらけ → 生成トークン崩壊
 *
 * 注意: must_include / must_avoid のような task 固有制約は caller 側で
 *       validate する (例: validateDailyGuidanceResponse)。
 *       ここは provider 共通の失敗モードに限定する。
 */
export function validateStudentOutput(text: string): ValidationResult {
  const trimmed = text.trim();

  // 最小長チェック
  if (trimmed.length < 30) {
    return { valid: false, reason: `too_short_${trimmed.length}` };
  }

  // 最大長チェック (v2 訓練データ max 800 chars、ハードキャップ 1200)
  if (trimmed.length > 1200) {
    return { valid: false, reason: `too_long_${trimmed.length}` };
  }

  // 中国語混入チェック (連続した中国語文字が 5 文字以上、かつ日本語仮名なし)
  const chineseRun = /[\u4e00-\u9fff]{5,}/;
  if (chineseRun.test(trimmed)) {
    const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff]/.test(trimmed);
    if (!hasJapanese) {
      return { valid: false, reason: "chinese_contamination" };
    }
  }

  // Generic opening チェック (定型挨拶から入る = Alter voice 崩壊)
  for (const pattern of GENERIC_OPENING_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, reason: "generic_opening" };
    }
  }

  // 空行過多チェック
  const lines = trimmed.split("\n");
  const emptyLines = lines.filter((l) => l.trim() === "").length;
  if (lines.length > 3 && emptyLines / lines.length > 0.5) {
    return { valid: false, reason: "excessive_empty_lines" };
  }

  return { valid: true };
}
