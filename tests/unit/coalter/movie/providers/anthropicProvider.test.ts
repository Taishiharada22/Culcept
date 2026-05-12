/**
 * D-2-e3-a1a anthropicProvider 単体テスト (mock-only scaffold)。
 *
 * 検証軸 (PR #111 §2.1 / §3.6.2):
 *
 * constructor / DI:
 *   1. options.enabled が enabled field に反映
 *   2. options.client が DI される (mock client が retrieve で使われる)
 *
 * buildWebSearchTool:
 *   3. default: type / name / max_uses の最小構成
 *   4. allowedDomains 指定時に allowed_domains が tool に含まれる
 *   5. blockedDomains 指定時に blocked_domains が tool に含まれる
 *   6. allowedDomains + blockedDomains 両指定 → allowed 優先 (Anthropic SDK 排他制約)
 *   7. deriveUserLocation default (area name + JP/Asia/Tokyo)
 *   8. deriveUserLocation custom override
 *   9. area 空文字 → user_location undefined
 *
 * buildPrompt:
 *  10. input.title / input.area が prompt に含まれる
 *  11. sourceHint (officialUrl / distributor) が hint として embed
 *  12. sourceHint なし → hint 行なし
 *  13. maxResults 指定で「最大 N 件まで」に反映
 *
 * parseResponse:
 *  14. citations 抽出: text block の web_search_result_location 経由
 *  15. citations は web_search_result_location 以外 (page_location 等) を skip
 *  16. text block 以外の content block (server_tool_use 等) は skip
 *  17. title null の citation → url を title に fallback
 *  18. rawDiagnostics: usage.input_tokens / output_tokens / server_tool_use.web_search_requests
 *  19. extractTheaters scaffold → 常に空配列
 *
 * retrieve (executeRetrieve + safeProviderCall):
 *  20. happy path: client.messages.create が tools + messages で呼ばれ、結果が parse される
 *  21. 5xx-like error → safeProviderCall の retry policy で 2 回試行
 *  22. timeout → ProviderCallTimeoutError throw
 *  23. budget exceeded → ProviderBudgetExceededError throw、client.messages.create 呼ばれず
 *
 * D-2-e3-a1a scope:
 *   - mock client only、実 Anthropic API call なし
 *   - process.env / ANTHROPIC_API_KEY 参照なし
 *   - SDK type は @anthropic-ai/sdk v0.91.1 既存、import OK
 */

import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  ANTHROPIC_DEFAULTS,
  AnthropicMovieRetrievalProvider,
  type AnthropicProviderOptions,
} from "@/lib/coalter/movie/providers/anthropicProvider";
import {
  ProviderBudgetExceededError,
  ProviderCallTimeoutError,
  type BudgetUsageProvider,
} from "@/lib/coalter/movie/providers/safeProviderCall";
import type { ProviderRetrievalInput } from "@/lib/coalter/movie/providers/types";

// ═══════════════════════════════════════════════════════════════════════════
// fixture builders
// ═══════════════════════════════════════════════════════════════════════════

type MockMessagesCreate = ReturnType<typeof vi.fn>;

function makeMockClient(messagesCreate: MockMessagesCreate): Anthropic {
  // structural typing で Anthropic の必須 sub-API のみ提供。
  // 本 phase は messages.create のみ使用、他は呼ばれない。
  return {
    messages: { create: messagesCreate },
  } as unknown as Anthropic;
}

function makeProvider(
  overrides: Partial<AnthropicProviderOptions> = {},
  messagesCreate?: MockMessagesCreate,
): {
  provider: AnthropicMovieRetrievalProvider;
  client: Anthropic;
  messagesCreate: MockMessagesCreate;
} {
  const fn = messagesCreate ?? vi.fn();
  const client = makeMockClient(fn);
  const provider = new AnthropicMovieRetrievalProvider({
    client,
    enabled: true,
    ...overrides,
  });
  return { provider, client, messagesCreate: fn };
}

function makeInput(
  overrides: Partial<ProviderRetrievalInput> = {},
): ProviderRetrievalInput {
  return {
    title: "テスト作品",
    area: "渋谷",
    ...overrides,
  };
}

function makeAnthropicMessageWithCitations(
  citations: Array<{
    type: string;
    url?: string;
    title?: string | null;
    cited_text?: string;
    encrypted_index?: string;
  }>,
  usage?: Partial<Anthropic.Messages.Usage>,
): Anthropic.Messages.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-7",
    content: [
      {
        type: "text",
        text: "test response",
        citations: citations as Anthropic.Messages.TextCitation[] | null,
      },
    ],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      server_tool_use: null,
      service_tier: null,
      ...usage,
    } as Anthropic.Messages.Usage,
  } as Anthropic.Messages.Message;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1-2. constructor / DI
// ═══════════════════════════════════════════════════════════════════════════

describe("AnthropicMovieRetrievalProvider — constructor / DI", () => {
  it("options.enabled が enabled field に反映 (true)", () => {
    const { provider } = makeProvider({ enabled: true });
    expect(provider.enabled).toBe(true);
    expect(provider.id).toBe("anthropic");
  });

  it("options.enabled が enabled field に反映 (false)", () => {
    const { provider } = makeProvider({ enabled: false });
    expect(provider.enabled).toBe(false);
  });

  it("options.client が DI 経由で retrieve に使われる", async () => {
    const messagesCreate = vi
      .fn()
      .mockResolvedValue(makeAnthropicMessageWithCitations([]));
    const { provider } = makeProvider({}, messagesCreate);
    await provider.retrieve(makeInput());
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3-9. buildWebSearchTool
// ═══════════════════════════════════════════════════════════════════════════

describe("buildWebSearchTool", () => {
  it("default: type='web_search_20250305' / name='web_search' / max_uses=5", () => {
    const { provider } = makeProvider();
    const tool = provider.buildWebSearchTool(makeInput());
    expect(tool.type).toBe(ANTHROPIC_DEFAULTS.WEB_SEARCH_TOOL_TYPE);
    expect(tool.name).toBe("web_search");
    expect(tool.max_uses).toBe(ANTHROPIC_DEFAULTS.MAX_USES);
    expect(tool.user_location).toEqual({
      type: "approximate",
      city: "渋谷",
      country: "JP",
      timezone: "Asia/Tokyo",
    });
  });

  it("maxUses override", () => {
    const { provider } = makeProvider({ maxUses: 3 });
    const tool = provider.buildWebSearchTool(makeInput());
    expect(tool.max_uses).toBe(3);
  });

  it("allowedDomains 指定時に tool に含まれる", () => {
    const { provider } = makeProvider({
      allowedDomains: ["eiga.com", "movies.yahoo.co.jp"],
    });
    const tool = provider.buildWebSearchTool(makeInput());
    expect(tool.allowed_domains).toEqual(["eiga.com", "movies.yahoo.co.jp"]);
    expect(tool.blocked_domains).toBeUndefined();
  });

  it("blockedDomains 指定時に tool に含まれる", () => {
    const { provider } = makeProvider({
      blockedDomains: ["spam.example.com"],
    });
    const tool = provider.buildWebSearchTool(makeInput());
    expect(tool.blocked_domains).toEqual(["spam.example.com"]);
    expect(tool.allowed_domains).toBeUndefined();
  });

  it("allowedDomains + blockedDomains 両指定 → allowed 優先 (排他制約)", () => {
    const { provider } = makeProvider({
      allowedDomains: ["eiga.com"],
      blockedDomains: ["spam.example.com"],
    });
    const tool = provider.buildWebSearchTool(makeInput());
    expect(tool.allowed_domains).toEqual(["eiga.com"]);
    expect(tool.blocked_domains).toBeUndefined();
  });

  it("deriveUserLocation default (area + JP/Asia/Tokyo)", () => {
    const { provider } = makeProvider();
    const tool = provider.buildWebSearchTool(makeInput({ area: "新宿" }));
    expect(tool.user_location).toEqual({
      type: "approximate",
      city: "新宿",
      country: "JP",
      timezone: "Asia/Tokyo",
    });
  });

  it("deriveUserLocation custom override", () => {
    const customDerive = vi.fn((area: string) => ({
      type: "approximate" as const,
      city: area,
      country: "US",
      timezone: "America/Los_Angeles",
    }));
    const { provider } = makeProvider({ deriveUserLocation: customDerive });
    const tool = provider.buildWebSearchTool(makeInput({ area: "Los Angeles" }));
    expect(customDerive).toHaveBeenCalledWith("Los Angeles");
    expect(tool.user_location).toEqual({
      type: "approximate",
      city: "Los Angeles",
      country: "US",
      timezone: "America/Los_Angeles",
    });
  });

  it("area 空文字 → user_location undefined (default 関数の判定)", () => {
    const { provider } = makeProvider();
    const tool = provider.buildWebSearchTool(makeInput({ area: "   " }));
    expect(tool.user_location).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10-13. buildPrompt
// ═══════════════════════════════════════════════════════════════════════════

describe("buildPrompt", () => {
  it("input.title / input.area が prompt に含まれる", () => {
    const { provider } = makeProvider();
    const prompt = provider.buildPrompt(makeInput({ title: "君の名は。", area: "渋谷" }));
    expect(prompt).toContain("君の名は。");
    expect(prompt).toContain("渋谷");
  });

  it("sourceHint.officialUrl + distributor が hint embed", () => {
    const { provider } = makeProvider();
    const prompt = provider.buildPrompt(
      makeInput({
        sourceHint: {
          officialUrl: "https://example.com/movie",
          distributor: "Sample Studio",
        },
      }),
    );
    expect(prompt).toContain("参考情報:");
    expect(prompt).toContain("https://example.com/movie");
    expect(prompt).toContain("Sample Studio");
  });

  it("sourceHint なし → hint 行なし", () => {
    const { provider } = makeProvider();
    const prompt = provider.buildPrompt(makeInput());
    expect(prompt).not.toContain("参考情報:");
  });

  it("maxResults 指定で「最大 N 件まで」が反映", () => {
    const { provider } = makeProvider();
    const prompt = provider.buildPrompt(makeInput({ maxResults: 3 }));
    expect(prompt).toContain("最大 3 件まで");
  });

  it("maxResults 未指定で default 5 件", () => {
    const { provider } = makeProvider();
    const prompt = provider.buildPrompt(makeInput());
    expect(prompt).toContain("最大 5 件まで");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14-19. parseResponse
// ═══════════════════════════════════════════════════════════════════════════

describe("parseResponse", () => {
  it("citations 抽出: web_search_result_location → canonical Citation", () => {
    const { provider } = makeProvider();
    const message = makeAnthropicMessageWithCitations([
      {
        type: "web_search_result_location",
        url: "https://eiga.com/movie/12345/",
        title: "作品 X - eiga.com",
        cited_text: "TOHO 渋谷で 19:00〜上映",
        encrypted_index: "enc-abc",
      },
    ]);
    const result = provider.parseResponse(message, 100);
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toEqual({
      url: "https://eiga.com/movie/12345/",
      title: "作品 X - eiga.com",
      citedText: "TOHO 渋谷で 19:00〜上映",
      sourceLocationHint: "enc-abc",
    });
  });

  it("web_search_result_location 以外 (page_location 等) は skip", () => {
    const { provider } = makeProvider();
    const message = makeAnthropicMessageWithCitations([
      {
        type: "page_location",
        url: "https://example.com/pdf",
        title: "PDF",
      },
      {
        type: "web_search_result_location",
        url: "https://eiga.com/movie/x/",
        title: "Web",
        cited_text: "snippet",
        encrypted_index: "idx",
      },
    ]);
    const result = provider.parseResponse(message, 100);
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].url).toBe("https://eiga.com/movie/x/");
  });

  it("text block 以外の content block (server_tool_use 等) は skip", () => {
    const { provider } = makeProvider();
    const message: Anthropic.Messages.Message = {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-opus-4-7",
      content: [
        {
          type: "server_tool_use",
          id: "srv_test",
          name: "web_search",
          input: { query: "test" },
        },
      ],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation: null,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        inference_geo: null,
        server_tool_use: null,
        service_tier: null,
      } as Anthropic.Messages.Usage,
    } as Anthropic.Messages.Message;
    const result = provider.parseResponse(message, 100);
    expect(result.citations).toEqual([]);
  });

  it("title null → url を title に fallback", () => {
    const { provider } = makeProvider();
    const message = makeAnthropicMessageWithCitations([
      {
        type: "web_search_result_location",
        url: "https://eiga.com/no-title/",
        title: null,
        cited_text: "x",
        encrypted_index: "i",
      },
    ]);
    const result = provider.parseResponse(message, 100);
    expect(result.citations[0].title).toBe("https://eiga.com/no-title/");
  });

  it("rawDiagnostics: token + server_tool_use.web_search_requests", () => {
    const { provider } = makeProvider();
    const message = makeAnthropicMessageWithCitations([], {
      input_tokens: 250,
      output_tokens: 120,
      server_tool_use: {
        web_fetch_requests: 0,
        web_search_requests: 2,
      } as Anthropic.Messages.ServerToolUsage,
    });
    const result = provider.parseResponse(message, 100);
    expect(result.rawDiagnostics).toEqual({
      tokenInput: 250,
      tokenOutput: 120,
      searchCallCount: 2,
    });
  });

  it("rawDiagnostics: server_tool_use null → searchCallCount 含まれず", () => {
    const { provider } = makeProvider();
    const message = makeAnthropicMessageWithCitations([], {
      input_tokens: 10,
      output_tokens: 5,
      server_tool_use: null,
    });
    const result = provider.parseResponse(message, 100);
    expect(result.rawDiagnostics).toEqual({
      tokenInput: 10,
      tokenOutput: 5,
    });
    expect(result.rawDiagnostics?.searchCallCount).toBeUndefined();
  });

  it("extractTheaters scaffold → 常に空配列", () => {
    const { provider } = makeProvider();
    const message = makeAnthropicMessageWithCitations([
      {
        type: "web_search_result_location",
        url: "https://eiga.com/x/",
        title: "X",
        cited_text: "TOHO 渋谷で上映",
        encrypted_index: "i",
      },
    ]);
    const result = provider.parseResponse(message, 100);
    expect(result.theaters).toEqual([]);
  });

  it("providerId / latencyMs が正しく設定", () => {
    const { provider } = makeProvider();
    const message = makeAnthropicMessageWithCitations([]);
    const result = provider.parseResponse(message, 1234);
    expect(result.providerId).toBe("anthropic");
    expect(result.latencyMs).toBe(1234);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 20-23. retrieve (executeRetrieve + safeProviderCall)
// ═══════════════════════════════════════════════════════════════════════════

describe("retrieve — integration with safeProviderCall", () => {
  it("happy path: client.messages.create が tools + messages 付きで呼ばれ、結果が parse される", async () => {
    const messagesCreate = vi.fn().mockResolvedValue(
      makeAnthropicMessageWithCitations([
        {
          type: "web_search_result_location",
          url: "https://eiga.com/movie/x/",
          title: "X",
          cited_text: "snippet",
          encrypted_index: "i",
        },
      ]),
    );
    const { provider } = makeProvider(
      { allowedDomains: ["eiga.com"] },
      messagesCreate,
    );
    const result = await provider.retrieve(makeInput());

    expect(messagesCreate).toHaveBeenCalledTimes(1);
    const call = messagesCreate.mock.calls[0][0];
    expect(call.model).toBe(ANTHROPIC_DEFAULTS.MODEL);
    expect(call.max_tokens).toBe(ANTHROPIC_DEFAULTS.MAX_OUTPUT_TOKENS);
    expect(call.messages).toEqual([
      { role: "user", content: expect.stringContaining("テスト作品") },
    ]);
    expect(call.tools).toHaveLength(1);
    expect(call.tools[0].type).toBe("web_search_20250305");
    expect(call.tools[0].allowed_domains).toEqual(["eiga.com"]);

    expect(result.providerId).toBe("anthropic");
    expect(result.citations).toHaveLength(1);
    expect(result.theaters).toEqual([]);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("5xx-like error → safeProviderCall の retry policy で 2 回試行 (maxRetries=1 default)", async () => {
    const messagesCreate = vi
      .fn()
      .mockRejectedValueOnce(new Error("server error 500"))
      .mockResolvedValueOnce(makeAnthropicMessageWithCitations([]));
    const { provider } = makeProvider(
      { retryBackoffMs: 1 }, // backoff 最小化 (test 高速化)
      messagesCreate,
    );
    const result = await provider.retrieve(makeInput());
    expect(messagesCreate).toHaveBeenCalledTimes(2);
    expect(result.providerId).toBe("anthropic");
  });

  it("timeout → ProviderCallTimeoutError throw (retry されない)", async () => {
    let callCount = 0;
    const messagesCreate = vi.fn(async () => {
      callCount++;
      return await new Promise<Anthropic.Messages.Message>(() => {
        /* pending、永遠に resolve しない */
      });
    });
    const { provider } = makeProvider(
      { timeoutMs: 50, maxRetries: 3 },
      messagesCreate,
    );
    await expect(provider.retrieve(makeInput())).rejects.toBeInstanceOf(
      ProviderCallTimeoutError,
    );
    expect(callCount).toBe(1);
  });

  it("budget exceeded → ProviderBudgetExceededError throw、client.messages.create 呼ばれず", async () => {
    const messagesCreate = vi.fn();
    const budgetUsage: BudgetUsageProvider = {
      getCurrentUsageUsd: vi.fn().mockResolvedValue(500),
    };
    const { provider } = makeProvider(
      { budgetUsage, budgetCheckUsd: 500 },
      messagesCreate,
    );
    await expect(provider.retrieve(makeInput())).rejects.toBeInstanceOf(
      ProviderBudgetExceededError,
    );
    expect(messagesCreate).not.toHaveBeenCalled();
    expect(budgetUsage.getCurrentUsageUsd).toHaveBeenCalledTimes(1);
  });

  it("budgetUsage 未指定 + budgetCheckUsd default → budget check skip、client.messages.create 呼ばれる", async () => {
    const messagesCreate = vi
      .fn()
      .mockResolvedValue(makeAnthropicMessageWithCitations([]));
    const { provider } = makeProvider({}, messagesCreate);
    await provider.retrieve(makeInput());
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });
});
