/**
 * Gemini draft extraction adapter — env-free core（SR B1b-2C-4-c-2）
 *
 * 役割: B1b-2C-4-c-1 の DraftExtractionAdapter interface の **Gemini REST 実装**。
 *
 * env 非依存（CEO 補正・2026-06-01）:
 *   - 本 module は **process.env を一切読まない**。
 *   - apiKey / model / timeoutMs / maxRetry / retryBackoffMs / fetchImpl / sleep は
 *     すべて config 引数で受け取る。
 *   - env を読むのは将来の host（server action）の責務。本 module は test 容易性のため env 非依存。
 *
 * server-only 注: 本 core は server-only marker を付けない（test 可能にするため）。
 *   client bundle に混入させないために `draftExtractionGeminiAdapter.server.ts` 経由で
 *   import する規約。core 自体は Node 環境（Buffer 利用）を前提とする。
 *
 * base64 の扱い:
 *   - Blob → temporary base64 は **adapter 関数 local の変数のみ**。
 *   - return / state / props / localStorage / DB / log に **載せない**（test で固定）。
 *   - 使用後は `null` 代入（GC ヒント・完全消去保証ではない）。
 *
 * safe error mapping:
 *   - DraftExtractionError(kind, message) で throw。message は safe copy。
 *   - **raw Gemini response / API key / stack trace を message に含めない**。
 *   - raw body / API key / raw JSON を console / log にも出さない。
 *
 * retry:
 *   - 429 / 503 のみ retry（既存 b1b-1-run-chunked.ts 踏襲）。
 *   - backoff: retryBackoffMs * (attempt + 1)。test では retryBackoffMs=0 + sleep 注入で実時間ゼロ。
 *   - timeout: AbortController + setTimeout。clearTimeout を全 path で呼ぶ。
 */

import {
  DraftExtractionError,
  type DraftExtractionAdapter,
  type DraftExtractionChunkInput,
} from "./draftExtractionAdapter";
import {
  validateDayKeyedCells,
  type DayKeyedShiftCell,
} from "./shiftExtractionContract";

export interface GeminiDraftExtractionAdapterConfig {
  /** Gemini API key。env を読むのは host 側。 */
  apiKey: string;
  /** モデル名（既定なし・必須）。例: "gemini-2.5-pro"。host が `B1B_VLM_MODEL` 等を解決する。 */
  model: string;
  /** call ごとの timeout（既定 30s）。 */
  timeoutMs?: number;
  /** retry 上限（初回を含まない・既定 3）。 */
  maxRetry?: number;
  /** retry backoff 基数（既定 4000ms）。test では 0 を渡せる。 */
  retryBackoffMs?: number;
  /** test 用 fetch 注入。未指定なら globalThis.fetch。 */
  fetchImpl?: typeof globalThis.fetch;
  /** test 用 sleep 注入。未指定なら setTimeout ベース。 */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRY = 3;
const DEFAULT_RETRY_BACKOFF_MS = 4_000;

const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** safe copy（user-facing 文言・error/wrong/失敗 寄りを避け「読み取り」「お試し」基調）。 */
const SAFE_MESSAGES: Record<
  | "timeout"
  | "rate_limited"
  | "model_error"
  | "invalid_response"
  | "auth_missing"
  | "unknown",
  string
> = {
  timeout: "読み取りに時間がかかっています。もう一度お試しください。",
  rate_limited: "読み取りが混み合っています。しばらくしてからお試しください。",
  model_error: "読み取りサービスが応答していません。しばらくしてからお試しください。",
  invalid_response: "読み取り結果を解析できませんでした。もう一度お試しください。",
  auth_missing: "読み取り認証が設定されていません。設定をご確認ください。",
  unknown: "読み取りに失敗しました。原稿をご確認の上もう一度お試しください。",
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Blob → base64（adapter 関数 local 用・Node Buffer 前提）。 */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}

interface GeminiResponseShape {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

/** parsed text（JSON）から DayKeyedShiftCell[] 候補の array を取り出す（既存 runner と整合）。 */
function unwrapArrayCandidate(parsed: unknown): unknown {
  if (Array.isArray(parsed)) return parsed;
  if (parsed !== null && typeof parsed === "object") {
    const found = Object.values(parsed as Record<string, unknown>).find((v) =>
      Array.isArray(v)
    );
    if (found) return found;
  }
  return parsed;
}

/** Gemini default adapter を作る（env 非依存・test では config を直渡し）。 */
export function createGeminiDraftExtractionAdapterCore(
  config: GeminiDraftExtractionAdapterConfig
): DraftExtractionAdapter {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const sleep = config.sleep ?? defaultSleep;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetry = config.maxRetry ?? DEFAULT_MAX_RETRY;
  const retryBackoffMs = config.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;

  return {
    async extractChunk(input: DraftExtractionChunkInput): Promise<DayKeyedShiftCell[]> {
      // auth gate（fetch しない）
      if (typeof config.apiKey !== "string" || config.apiKey.trim() === "") {
        throw new DraftExtractionError("auth_missing", SAFE_MESSAGES.auth_missing);
      }
      if (typeof config.model !== "string" || config.model.trim() === "") {
        // model 未設定は invalid_response 相当ではないが、auth_missing にも該当しない。
        // host バグ扱い → unknown（safe copy）で fail-hard。
        throw new DraftExtractionError("unknown", SAFE_MESSAGES.unknown);
      }

      // Blob → temporary base64（return / log / state / props に載せない）
      // mode で parts 数を切り替える: combined=2 parts（text + 1 image）/ split=3 parts。
      let imageParts: Array<{ inline_data: { mime_type: string; data: string } }> = [];
      let b64A: string | null = null;
      let b64B: string | null = null;
      if (input.mode === "combined") {
        b64A = await blobToBase64(input.combinedBlob);
        imageParts = [
          { inline_data: { mime_type: "image/png", data: b64A } },
        ];
      } else {
        b64A = await blobToBase64(input.headerBlob);
        b64B = await blobToBase64(input.personRowBlob);
        imageParts = [
          { inline_data: { mime_type: "image/png", data: b64A } },
          { inline_data: { mime_type: "image/png", data: b64B } },
        ];
      }

      // body を組み立てたら base64 参照を切る（GC ヒント。完全消去保証ではない）
      const body = JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: input.prompt }, ...imageParts],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      });
      imageParts = [];
      b64A = null;
      b64B = null;

      // API key は URL に乗せず header に置く（URL ログ漏洩リスク回避）
      const url = `${GEMINI_ENDPOINT_BASE}/${encodeURIComponent(config.model)}:generateContent`;

      for (let attempt = 0; attempt <= maxRetry; attempt++) {
        const controller = new AbortController();
        const timeoutHandle: ReturnType<typeof setTimeout> = setTimeout(
          () => controller.abort(),
          timeoutMs
        );

        let res: Response;
        try {
          res = await fetchImpl(url, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": config.apiKey,
            },
            body,
          });
        } catch (e: unknown) {
          clearTimeout(timeoutHandle);
          // AbortError → timeout。他は unknown（raw error は message に載せない）
          if (e instanceof Error && e.name === "AbortError") {
            throw new DraftExtractionError("timeout", SAFE_MESSAGES.timeout);
          }
          throw new DraftExtractionError("unknown", SAFE_MESSAGES.unknown);
        }
        clearTimeout(timeoutHandle);

        if (res.ok) {
          let raw: GeminiResponseShape;
          try {
            raw = (await res.json()) as GeminiResponseShape;
          } catch {
            // raw body を読まない（API key 漏洩・raw 露出回避）
            throw new DraftExtractionError(
              "invalid_response",
              SAFE_MESSAGES.invalid_response
            );
          }
          const text =
            raw.candidates?.[0]?.content?.parts
              ?.map((p) => p.text ?? "")
              .join("")
              .trim() ?? "";
          if (text === "") {
            throw new DraftExtractionError(
              "invalid_response",
              SAFE_MESSAGES.invalid_response
            );
          }
          let parsedText: unknown;
          try {
            parsedText = JSON.parse(text);
          } catch {
            throw new DraftExtractionError(
              "invalid_response",
              SAFE_MESSAGES.invalid_response
            );
          }
          const arrayCandidate = unwrapArrayCandidate(parsedText);
          const { cells } = validateDayKeyedCells(arrayCandidate, input.daysInMonth);
          return cells;
        }

        // !res.ok — raw body を読まない（safe error mapping）
        if (res.status === 429 || res.status === 503) {
          if (attempt < maxRetry) {
            await sleep(retryBackoffMs * (attempt + 1));
            continue;
          }
          throw new DraftExtractionError(
            res.status === 429 ? "rate_limited" : "model_error",
            res.status === 429 ? SAFE_MESSAGES.rate_limited : SAFE_MESSAGES.model_error
          );
        }
        // 4xx / 5xx（429/503 以外）→ 即 throw（retry なし）
        throw new DraftExtractionError("model_error", SAFE_MESSAGES.model_error);
      }
      // loop 終端（attempt = maxRetry + 1）に到達するパスはないが、TS のため
      throw new DraftExtractionError("unknown", SAFE_MESSAGES.unknown);
    },
  };
}
