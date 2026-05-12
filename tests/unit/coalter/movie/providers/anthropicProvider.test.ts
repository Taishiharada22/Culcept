/**
 * D-2-e3-a1b anthropicProvider 単体テスト (mock-only、extractTheaters 構造化抽出を追加)。
 *
 * a1-impl-1a (PR #112) からの差分:
 *   - parseResponse signature: (message, latencyMs) → (message, input, latencyMs)
 *     (P2 fallback で `input.area` を必須 area field として使用するため)
 *   - extractTheaters: 空配列 scaffold → P1 (JSON parse) + P2 (conservative regex fallback)
 *
 * 検証軸 (PR #111 §2.1 / §3.6.2 + a1-impl-1b 追加):
 *
 * constructor / DI / buildWebSearchTool / buildPrompt / retrieve / safeProviderCall:
 *   PR #112 と同等 (signature 変更を反映)
 *
 * parseResponse (citations + diagnostics, PR #112 から継承):
 *   - citations 抽出: text block の web_search_result_location 経由
 *   - web_search_result_location 以外 (page_location 等) を skip
 *   - text block 以外の content block (server_tool_use 等) は skip
 *   - title null の citation → url を title に fallback
 *   - rawDiagnostics: usage.input_tokens / output_tokens / server_tool_use.web_search_requests
 *
 * extractTheaters P1 (JSON 強制 prompt + JSON.parse、a1-impl-1b 追加):
 *   - ```json ... ``` code block 内 JSON parse → TheaterListing[]
 *   - ``` ... ``` 言語 hint なし fence の場合も parse
 *   - code block なし、自由 text 中の balanced brace から JSON 抽出
 *   - theaterName / area 必須、不足 item を skip
 *   - showtimes / officialUrl optional handling
 *   - theaters 空配列 → 空配列 (P2 fallback しない、LLM の「該当なし」明示を尊重)
 *   - invalid JSON → P2 fallback
 *
 * extractTheaters P2 (conservative regex fallback、a1-impl-1b 追加):
 *   - 明示 label (映画館 / cinema / シネマ / シアター 等) を含む行のみ抽出
 *   - input.area を必須 area として使用 (自由文から area 推測しない)
 *   - input.area 空 → 空配列 (area 推測なし、hallucination 防御)
 *   - label なし行 → 空配列
 *   - label 単独行 (theaterName 推測不能) → reject
 *   - 同 theaterName 重複 → dedup
 *   - 連結名 (ヒューマントラストシネマ渋谷) を救う trailing 拡張
 *
 * D-2-e3-a1b scope:
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

/**
 * 任意 text を text block に含む Anthropic Message を生成する fixture (a1-impl-1b 追加)。
 *
 *   P1 (JSON parse) / P2 (conservative regex) の入力 text を制御するために使用。
 */
function makeMessageWithText(
  text: string,
  citations: Array<{
    type: string;
    url?: string;
    title?: string | null;
    cited_text?: string;
    encrypted_index?: string;
  }> = [],
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
        text,
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
    const result = provider.parseResponse(message, makeInput(), 100);
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
    const result = provider.parseResponse(message, makeInput(), 100);
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
    const result = provider.parseResponse(message, makeInput(), 100);
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
    const result = provider.parseResponse(message, makeInput(), 100);
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
    const result = provider.parseResponse(message, makeInput(), 100);
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
    const result = provider.parseResponse(message, makeInput(), 100);
    expect(result.rawDiagnostics).toEqual({
      tokenInput: 10,
      tokenOutput: 5,
    });
    expect(result.rawDiagnostics?.searchCallCount).toBeUndefined();
  });

  it("extractTheaters: label なし / JSON なし → 空配列 (citation の cited_text は theater extraction に使われない)", () => {
    const { provider } = makeProvider();
    // text block の text は "test response" (makeAnthropicMessageWithCitations の default)、label なし
    // citation の cited_text に "TOHO 渋谷で上映" があるが、これは theater extraction の入力ではない (text block の text のみ)
    const message = makeAnthropicMessageWithCitations([
      {
        type: "web_search_result_location",
        url: "https://eiga.com/x/",
        title: "X",
        cited_text: "TOHO 渋谷で上映",
        encrypted_index: "i",
      },
    ]);
    const result = provider.parseResponse(message, makeInput(), 100);
    expect(result.theaters).toEqual([]);
  });

  it("providerId / latencyMs が正しく設定", () => {
    const { provider } = makeProvider();
    const message = makeAnthropicMessageWithCitations([]);
    const result = provider.parseResponse(message, makeInput(), 1234);
    expect(result.providerId).toBe("anthropic");
    expect(result.latencyMs).toBe(1234);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// extractTheaters — P1: JSON 強制 prompt + JSON.parse (a1-impl-1b 追加)
// ═══════════════════════════════════════════════════════════════════════════

describe("extractTheaters — P1 JSON parse", () => {
  it("```json``` code block 内の theaters[] が parse される (full fields)", () => {
    const { provider } = makeProvider();
    const text = [
      "結果は以下の通りです:",
      "```json",
      "{",
      '  "theaters": [',
      "    {",
      '      "theaterName": "TOHO シネマズ 渋谷",',
      '      "area": "渋谷",',
      '      "showtimes": ["19:00", "21:30"],',
      '      "officialUrl": "https://hlo.tohotheater.jp/net/schedule/035/TNPI2000J01.do"',
      "    }",
      "  ]",
      "}",
      "```",
    ].join("\n");
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput(), 100);
    expect(result.theaters).toHaveLength(1);
    expect(result.theaters[0]).toEqual({
      theaterName: "TOHO シネマズ 渋谷",
      area: "渋谷",
      showtimes: ["19:00", "21:30"],
      officialUrl:
        "https://hlo.tohotheater.jp/net/schedule/035/TNPI2000J01.do",
    });
  });

  it("``` (言語 hint なし) fence でも JSON parse される", () => {
    const { provider } = makeProvider();
    const text = [
      "```",
      '{"theaters":[{"theaterName":"渋谷シネクイント","area":"渋谷"}]}',
      "```",
    ].join("\n");
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput(), 100);
    expect(result.theaters).toHaveLength(1);
    expect(result.theaters[0].theaterName).toBe("渋谷シネクイント");
    expect(result.theaters[0].area).toBe("渋谷");
  });

  it("code block fence なし、balanced brace で自由 text 中の JSON 抽出", () => {
    const { provider } = makeProvider();
    const text =
      '結果: {"theaters":[{"theaterName":"新宿ピカデリー","area":"新宿"}]} 以上です。';
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput(), 100);
    expect(result.theaters).toHaveLength(1);
    expect(result.theaters[0].theaterName).toBe("新宿ピカデリー");
  });

  it("複数 theaters が parse される (順序保持)", () => {
    const { provider } = makeProvider();
    const text = [
      "```json",
      "{",
      '  "theaters": [',
      '    {"theaterName": "A シネマ", "area": "渋谷"},',
      '    {"theaterName": "B シネマ", "area": "新宿"},',
      '    {"theaterName": "C シネマ", "area": "池袋"}',
      "  ]",
      "}",
      "```",
    ].join("\n");
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput(), 100);
    expect(result.theaters.map((t) => t.theaterName)).toEqual([
      "A シネマ",
      "B シネマ",
      "C シネマ",
    ]);
  });

  it("theaterName 不足 → 該当 item を skip (他 item は残る)", () => {
    const { provider } = makeProvider();
    const text = [
      "```json",
      "{",
      '  "theaters": [',
      '    {"area": "渋谷"},',
      '    {"theaterName": "OK シネマ", "area": "渋谷"}',
      "  ]",
      "}",
      "```",
    ].join("\n");
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput(), 100);
    expect(result.theaters).toHaveLength(1);
    expect(result.theaters[0].theaterName).toBe("OK シネマ");
  });

  it("area 不足 → 該当 item を skip", () => {
    const { provider } = makeProvider();
    const text = [
      "```json",
      '{"theaters":[{"theaterName":"X シネマ"}]}',
      "```",
    ].join("\n");
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput(), 100);
    expect(result.theaters).toEqual([]);
  });

  it("theaters 空配列 → 空配列 (P2 fallback しない、LLM の「該当なし」明示を尊重)", () => {
    const { provider } = makeProvider();
    // text に label を含めて、もし P2 へ fallback された場合に [] と区別できるようにする
    const text = [
      "該当なし: TOHO シネマズ 渋谷 では上映されていません。",
      "```json",
      '{"theaters":[]}',
      "```",
    ].join("\n");
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput({ area: "渋谷" }), 100);
    // P1 が `theaters: []` で success → P2 へ fallback せず、空配列 return
    expect(result.theaters).toEqual([]);
  });

  it("invalid JSON (parse error) → P2 fallback (自由 text 中 label から extract)", () => {
    const { provider } = makeProvider();
    // ```json``` 内が unquoted keys で JSON.parse 失敗、自由 text に label 含む行あり
    const text = [
      "```json",
      "{theaters: [{theaterName: TOHO, area: 渋谷}]}",
      "```",
      "TOHO シネマズ 渋谷 で上映中。",
    ].join("\n");
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput({ area: "渋谷" }), 100);
    expect(result.theaters.length).toBeGreaterThanOrEqual(1);
    expect(result.theaters[0].theaterName).toContain("シネマ");
    expect(result.theaters[0].area).toBe("渋谷");
  });

  it("showtimes / officialUrl 省略時の optional 処理 (undefined / null)", () => {
    const { provider } = makeProvider();
    const text = [
      "```json",
      '{"theaters":[{"theaterName":"X シネマ","area":"渋谷"}]}',
      "```",
    ].join("\n");
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput(), 100);
    expect(result.theaters[0]).toEqual({
      theaterName: "X シネマ",
      area: "渋谷",
    });
    expect(result.theaters[0].showtimes).toBeUndefined();
    expect(result.theaters[0].officialUrl).toBeUndefined();
  });

  it("showtimes に非 string 要素混在 → string のみ抽出", () => {
    const { provider } = makeProvider();
    const text = [
      "```json",
      '{"theaters":[{"theaterName":"X","area":"渋谷","showtimes":["19:00",null,"21:30",123]}]}',
      "```",
    ].join("\n");
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput(), 100);
    expect(result.theaters[0].showtimes).toEqual(["19:00", "21:30"]);
  });

  it("officialUrl 空文字 → null に正規化", () => {
    const { provider } = makeProvider();
    const text = [
      "```json",
      '{"theaters":[{"theaterName":"X","area":"渋谷","officialUrl":""}]}',
      "```",
    ].join("\n");
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput(), 100);
    expect(result.theaters[0].officialUrl).toBeNull();
  });

  it("theaters key 不在 → P2 fallback", () => {
    const { provider } = makeProvider();
    const text = [
      "```json",
      '{"result":"none"}',
      "```",
      "TOHO シネマズ 渋谷 で上映中。",
    ].join("\n");
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput({ area: "渋谷" }), 100);
    // theaters key なし → P1 が null 返却 → P2 fallback
    expect(result.theaters.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// extractTheaters — P2: conservative regex fallback (a1-impl-1b 追加)
// ═══════════════════════════════════════════════════════════════════════════

describe("extractTheaters — P2 conservative regex fallback", () => {
  it("明示 label (シネマ) + input.area → extract", () => {
    const { provider } = makeProvider();
    // JSON parse 失敗するように、JSON 構造なしの自由文
    const text = "TOHO シネマズ 渋谷 で上映中です。";
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput({ area: "渋谷" }), 100);
    expect(result.theaters).toHaveLength(1);
    expect(result.theaters[0].theaterName).toContain("シネマ");
    expect(result.theaters[0].area).toBe("渋谷");
  });

  it("明示 label (映画館) + input.area → extract", () => {
    const { provider } = makeProvider();
    const text = "渋谷東宝映画館 にて上映。";
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput({ area: "渋谷" }), 100);
    expect(result.theaters).toHaveLength(1);
    expect(result.theaters[0].theaterName).toBe("渋谷東宝映画館");
    expect(result.theaters[0].area).toBe("渋谷");
  });

  it("連結名 (label の前後で連続するアジア文字) → trailing も保持", () => {
    const { provider } = makeProvider();
    const text = "ヒューマントラストシネマ渋谷 で上映中。";
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput({ area: "渋谷" }), 100);
    expect(result.theaters).toHaveLength(1);
    // trailing 「渋谷」が保持される
    expect(result.theaters[0].theaterName).toBe("ヒューマントラストシネマ渋谷");
  });

  it("label なし行 → 空配列 (hallucination 防御、自由文から area / 名前を推測しない)", () => {
    const { provider } = makeProvider();
    const text = "君の名は。が渋谷で上映中です。";
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput({ area: "渋谷" }), 100);
    expect(result.theaters).toEqual([]);
  });

  it("input.area 空文字 → 空配列 (area 推測なし)", () => {
    const { provider } = makeProvider();
    const text = "TOHO シネマズ 渋谷 で上映中。";
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput({ area: "" }), 100);
    expect(result.theaters).toEqual([]);
  });

  it("input.area が whitespace のみ → 空配列", () => {
    const { provider } = makeProvider();
    const text = "TOHO シネマズ 渋谷 で上映中。";
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput({ area: "   " }), 100);
    expect(result.theaters).toEqual([]);
  });

  it("label 単体行 (theaterName 推測不能) → reject", () => {
    const { provider } = makeProvider();
    const text = "映画館\nシネマ\nシアター\ntheater";
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput({ area: "渋谷" }), 100);
    expect(result.theaters).toEqual([]);
  });

  it("bullet 付き label 単体 (・シネマ 等) → reject", () => {
    const { provider } = makeProvider();
    const text = "・シネマ\n- 映画館\n  シアター";
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput({ area: "渋谷" }), 100);
    expect(result.theaters).toEqual([]);
  });

  it("複数行 + 同 theaterName 重複 → dedup", () => {
    const { provider } = makeProvider();
    const text = [
      "TOHO シネマズ 渋谷 で上映中。",
      "TOHO シネマズ 渋谷 の 19:00 の回が空席あり。",
    ].join("\n");
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput({ area: "渋谷" }), 100);
    expect(result.theaters).toHaveLength(1);
  });

  it("複数 unique theaters → 複数件 extract", () => {
    const { provider } = makeProvider();
    const text = [
      "ヒューマントラストシネマ渋谷 で上映。",
      "渋谷東宝映画館 でも上映。",
    ].join("\n");
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput({ area: "渋谷" }), 100);
    expect(result.theaters).toHaveLength(2);
    const names = result.theaters.map((t) => t.theaterName);
    expect(names).toContain("ヒューマントラストシネマ渋谷");
    expect(names).toContain("渋谷東宝映画館");
  });

  it("英語 label (cinema / theater) + 半角空白 → extract", () => {
    const { provider } = makeProvider();
    const text = "TOHO Cinemas Shibuya で上映中。";
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput({ area: "渋谷" }), 100);
    expect(result.theaters).toHaveLength(1);
    // "cinema" が含まれる token として extract される (trailing 's' は保持)
    expect(result.theaters[0].theaterName.toLowerCase()).toContain("cinema");
    expect(result.theaters[0].area).toBe("渋谷");
  });

  it("text 完全に空 → 空配列", () => {
    const { provider } = makeProvider();
    const message = makeMessageWithText("");
    const result = provider.parseResponse(message, makeInput({ area: "渋谷" }), 100);
    expect(result.theaters).toEqual([]);
  });

  it("showtimes / officialUrl は P2 では設定されない (conservative、optional は P1 でのみ充填)", () => {
    const { provider } = makeProvider();
    const text = "TOHO シネマズ 渋谷 で上映中。19:00 の回。";
    const message = makeMessageWithText(text);
    const result = provider.parseResponse(message, makeInput({ area: "渋谷" }), 100);
    expect(result.theaters).toHaveLength(1);
    expect(result.theaters[0].showtimes).toBeUndefined();
    expect(result.theaters[0].officialUrl).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// extractTheaters — text block 集約 (a1-impl-1b 追加)
// ═══════════════════════════════════════════════════════════════════════════

describe("extractTheaters — text block 集約", () => {
  it("複数 text block の text が結合され、JSON / regex extraction に使われる", () => {
    const { provider } = makeProvider();
    const message: Anthropic.Messages.Message = {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-opus-4-7",
      content: [
        { type: "text", text: "前置き: 結果は以下のとおりです。", citations: null },
        {
          type: "text",
          text: '```json\n{"theaters":[{"theaterName":"X","area":"渋谷"}]}\n```',
          citations: null,
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
    const result = provider.parseResponse(message, makeInput({ area: "渋谷" }), 100);
    expect(result.theaters).toHaveLength(1);
    expect(result.theaters[0].theaterName).toBe("X");
  });

  it("text block 以外 (server_tool_use / web_search_tool_result) は extraction 対象外", () => {
    const { provider } = makeProvider();
    const message: Anthropic.Messages.Message = {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-opus-4-7",
      content: [
        {
          type: "server_tool_use",
          id: "srv_1",
          name: "web_search",
          input: { query: "TOHO シネマズ 渋谷" },
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
    const result = provider.parseResponse(message, makeInput({ area: "渋谷" }), 100);
    expect(result.theaters).toEqual([]);
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
