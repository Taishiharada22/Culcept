/**
 * SR B1b-2C-4-c-2 — Gemini default adapter core の契約
 *
 * 検証する不変条件:
 *   - process.env を読まない（apiKey/model/timeoutMs/maxRetry を引数で受ける）
 *   - 200 OK: prompt + 2 inline_data(PNG base64) が body に含まれる / cells を返す
 *   - API key は header（x-goog-api-key）に置き、URL の query には乗らない
 *   - 429 / 503 のみ retry。それ以外は即 throw
 *   - retry の sleep / timeout は注入可能 → 実時間ゼロで検証
 *   - timeout は AbortController で発火し、DraftExtractionError(timeout)
 *   - JSON parse 失敗 / text 不在 → invalid_response
 *   - API key 未設定 → auth_missing（fetch しない）
 *   - error message に raw Gemini response / API key を含まない（safe copy のみ）
 *   - 出力 cells に base64 / dataURL / blob: が出ない
 *
 * 新依存ゼロ: vitest 標準のみ。実時間 sleep なし。
 */
import { describe, it, expect, vi } from "vitest";
import { createGeminiDraftExtractionAdapterCore } from "@/lib/plan/shift/draftExtractionGeminiAdapterCore";
import { DraftExtractionError } from "@/lib/plan/shift/draftExtractionAdapter";

// ── fixtures ──
const fakeBlob = (data: string): Blob =>
  ({
    arrayBuffer: async () => new TextEncoder().encode(data).buffer,
    size: data.length,
  }) as unknown as Blob;

const HEADER = fakeBlob("HEADER_BYTES");
const PERSON = fakeBlob("PERSON_BYTES");
const CHUNK = {
  headerBlob: HEADER,
  personRowBlob: PERSON,
  prompt: "test prompt content",
  daysInMonth: 30,
  dayRange: { from: 1, to: 15 },
};
const API_KEY = "test-key-secret-12345";
const MODEL = "gemini-2.5-pro";

function geminiText(text: string, status = 200): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
const buildCellsJson = (from: number, to: number) =>
  JSON.stringify(
    Array.from({ length: to - from + 1 }, (_, i) => ({
      day: from + i,
      rawCode: "H",
      rowLabel: "本人",
    }))
  );

function makeAdapter(
  over: Partial<Parameters<typeof createGeminiDraftExtractionAdapterCore>[0]> = {}
) {
  return createGeminiDraftExtractionAdapterCore({
    apiKey: API_KEY,
    model: MODEL,
    timeoutMs: 1000,
    maxRetry: 3,
    retryBackoffMs: 0,
    sleep: async () => {
      // no-op（実時間ゼロ）
    },
    ...over,
  });
}

// ─────────────────────────────────────────────────────────────
describe("Gemini adapter core — 200 系", () => {
  it("正常 200: prompt + 2 inline_data + cells を返す", async () => {
    const fetchImpl = vi.fn(async () => geminiText(buildCellsJson(1, 15)));
    const adapter = makeAdapter({ fetchImpl });
    const result = await adapter.extractChunk(CHUNK);
    expect(result).toHaveLength(15);
    expect(result[0]).toMatchObject({ day: 1, rawCode: "H" });
    expect(result[14].day).toBe(15);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const url = call[0];
    const init = call[1];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(url).toContain("gemini-2.5-pro:generateContent");
    expect(url).not.toMatch(/[?&]key=/i); // API key を URL に乗せない
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "x-goog-api-key": API_KEY,
    });

    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts).toHaveLength(3);
    expect(body.contents[0].parts[0].text).toBe("test prompt content");
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe("image/png");
    expect(body.contents[0].parts[2].inline_data.mime_type).toBe("image/png");
    expect(typeof body.contents[0].parts[1].inline_data.data).toBe("string");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.temperature).toBe(0);
  });

  it("array が object wrapper 内（{result: [...]}）でも cells を取り出す", async () => {
    const wrapped = JSON.stringify({ result: [{ day: 1, rawCode: "H", rowLabel: "本人" }] });
    const fetchImpl = vi.fn(async () => geminiText(wrapped));
    const adapter = makeAdapter({ fetchImpl });
    const result = await adapter.extractChunk({ ...CHUNK, dayRange: { from: 1, to: 1 } });
    expect(result).toHaveLength(1);
    expect(result[0].day).toBe(1);
  });

  it("output に base64 / dataURL / blob: を含まない", async () => {
    const fetchImpl = vi.fn(async () => geminiText(buildCellsJson(1, 1)));
    const adapter = makeAdapter({ fetchImpl });
    const result = await adapter.extractChunk({ ...CHUNK, dayRange: { from: 1, to: 1 } });
    expect(JSON.stringify(result)).not.toMatch(/base64|data:image|blob:|dataUri|dataURL/i);
  });
});

// ─────────────────────────────────────────────────────────────
describe("Gemini adapter core — auth", () => {
  it("API key 未設定 → auth_missing（fetch しない）", async () => {
    const fetchImpl = vi.fn();
    const adapter = makeAdapter({ apiKey: "", fetchImpl });
    const err = (await adapter.extractChunk(CHUNK).catch((e) => e)) as DraftExtractionError;
    expect(err).toBeInstanceOf(DraftExtractionError);
    expect(err.kind).toBe("auth_missing");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("API key 空白のみ → auth_missing", async () => {
    const fetchImpl = vi.fn();
    const adapter = makeAdapter({ apiKey: "   ", fetchImpl });
    await expect(adapter.extractChunk(CHUNK)).rejects.toMatchObject({ kind: "auth_missing" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
describe("Gemini adapter core — retry", () => {
  it("429 → 1 retry で成功（注入 sleep で実時間ゼロ）", async () => {
    let count = 0;
    const fetchImpl = vi.fn(async () => {
      count++;
      if (count === 1) return new Response("Rate limited", { status: 429 });
      return geminiText(buildCellsJson(1, 1));
    });
    const sleep = vi.fn(async () => {});
    const adapter = makeAdapter({ fetchImpl, sleep, maxRetry: 3, retryBackoffMs: 0 });
    const result = await adapter.extractChunk({ ...CHUNK, dayRange: { from: 1, to: 1 } });
    expect(result).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("503 retry 上限 → model_error（注入 sleep）", async () => {
    const fetchImpl = vi.fn(async () => new Response("Overloaded", { status: 503 }));
    const adapter = makeAdapter({ fetchImpl, maxRetry: 2, retryBackoffMs: 0 });
    const err = (await adapter.extractChunk(CHUNK).catch((e) => e)) as DraftExtractionError;
    expect(err.kind).toBe("model_error");
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("429 retry 上限 → rate_limited", async () => {
    const fetchImpl = vi.fn(async () => new Response("Rate limited", { status: 429 }));
    const adapter = makeAdapter({ fetchImpl, maxRetry: 1, retryBackoffMs: 0 });
    const err = (await adapter.extractChunk(CHUNK).catch((e) => e)) as DraftExtractionError;
    expect(err.kind).toBe("rate_limited");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("400 → 即 throw（retry なし）", async () => {
    const fetchImpl = vi.fn(async () => new Response("Bad request", { status: 400 }));
    const adapter = makeAdapter({ fetchImpl, maxRetry: 3, retryBackoffMs: 0 });
    await expect(adapter.extractChunk(CHUNK)).rejects.toMatchObject({ kind: "model_error" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("500（非 429/503）→ 即 throw（retry なし）", async () => {
    const fetchImpl = vi.fn(async () => new Response("Server error", { status: 500 }));
    const adapter = makeAdapter({ fetchImpl, maxRetry: 3, retryBackoffMs: 0 });
    await expect(adapter.extractChunk(CHUNK)).rejects.toMatchObject({ kind: "model_error" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retry の sleep が backoff*(attempt+1) で呼ばれる", async () => {
    const sleepCalls: number[] = [];
    const sleep = async (ms: number) => {
      sleepCalls.push(ms);
    };
    let count = 0;
    const fetchImpl = vi.fn(async () => {
      count++;
      if (count <= 2) return new Response("", { status: 503 });
      return geminiText(buildCellsJson(1, 1));
    });
    const adapter = makeAdapter({ fetchImpl, sleep, maxRetry: 3, retryBackoffMs: 100 });
    await adapter.extractChunk({ ...CHUNK, dayRange: { from: 1, to: 1 } });
    expect(sleepCalls).toEqual([100, 200]);
  });
});

// ─────────────────────────────────────────────────────────────
describe("Gemini adapter core — timeout（AbortController）", () => {
  it("timeoutMs 経過で AbortController が abort → DraftExtractionError(timeout)", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as unknown as typeof globalThis.fetch;
    const adapter = makeAdapter({
      fetchImpl,
      timeoutMs: 30, // 短く（< 1 秒）
      maxRetry: 0,
      retryBackoffMs: 0,
    });
    const err = (await adapter.extractChunk(CHUNK).catch((e) => e)) as DraftExtractionError;
    expect(err).toBeInstanceOf(DraftExtractionError);
    expect(err.kind).toBe("timeout");
  });
});

// ─────────────────────────────────────────────────────────────
describe("Gemini adapter core — invalid response", () => {
  it("res body が JSON でない → invalid_response", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>error</html>", { status: 200 }));
    const adapter = makeAdapter({ fetchImpl, maxRetry: 0 });
    await expect(adapter.extractChunk(CHUNK)).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("candidates が空 / text が無い → invalid_response", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [] } }] }), { status: 200 })
    );
    const adapter = makeAdapter({ fetchImpl, maxRetry: 0 });
    await expect(adapter.extractChunk(CHUNK)).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("text が JSON parse できない → invalid_response", async () => {
    const fetchImpl = vi.fn(async () => geminiText("not json"));
    const adapter = makeAdapter({ fetchImpl, maxRetry: 0 });
    await expect(adapter.extractChunk(CHUNK)).rejects.toMatchObject({ kind: "invalid_response" });
  });
});

// ─────────────────────────────────────────────────────────────
describe("Gemini adapter core — safe error mapping", () => {
  it("error message に raw Gemini body / API key を含まない（500 leaky body）", async () => {
    const leakyBody =
      "LEAK_PROMPT_INTERNAL test-key-secret-12345 connection: redis://x.y";
    const fetchImpl = vi.fn(async () => new Response(leakyBody, { status: 500 }));
    const adapter = makeAdapter({ fetchImpl, maxRetry: 0 });
    const err = (await adapter.extractChunk(CHUNK).catch((e) => e)) as DraftExtractionError;
    expect(err.message).not.toContain("LEAK_PROMPT_INTERNAL");
    expect(err.message).not.toContain(API_KEY);
    expect(err.message).not.toMatch(/redis:|connection:/);
    expect(err.message).toMatch(/読み取り|お試し/);
  });

  it("network throw → unknown（raw error message を user-facing に載せない）", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET_SENSITIVE_INFO database leaked");
    });
    const adapter = makeAdapter({ fetchImpl, maxRetry: 0 });
    const err = (await adapter.extractChunk(CHUNK).catch((e) => e)) as DraftExtractionError;
    expect(err.kind).toBe("unknown");
    expect(err.message).not.toContain("ECONNRESET");
    expect(err.message).not.toContain("database");
    expect(err.message).toMatch(/読み取り|お試し/);
  });

  it("error は DraftExtractionError 型（kind / name を持つ）", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 503 }));
    const adapter = makeAdapter({ fetchImpl, maxRetry: 0 });
    const err = (await adapter.extractChunk(CHUNK).catch((e) => e)) as DraftExtractionError;
    expect(err).toBeInstanceOf(DraftExtractionError);
    expect(err.name).toBe("DraftExtractionError");
    expect(err.kind).toBe("model_error");
  });
});

// ─────────────────────────────────────────────────────────────
describe("Gemini adapter core — env 非依存", () => {
  it("process.env を読まずに動作する（envを変更しても結果が変わらない）", async () => {
    const fetchImpl = vi.fn(async () => geminiText(buildCellsJson(1, 1)));
    // env を弄っても adapter は config 引数だけで動く
    const prevModel = process.env.B1B_VLM_MODEL;
    process.env.B1B_VLM_MODEL = "another-model-from-env";
    try {
      const adapter = makeAdapter({ fetchImpl, model: "passed-model-explicit" });
      await adapter.extractChunk({ ...CHUNK, dayRange: { from: 1, to: 1 } });
      const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      const url = call[0];
      expect(url).toContain("passed-model-explicit:generateContent");
      expect(url).not.toContain("another-model-from-env");
    } finally {
      if (prevModel === undefined) delete process.env.B1B_VLM_MODEL;
      else process.env.B1B_VLM_MODEL = prevModel;
    }
  });
});
