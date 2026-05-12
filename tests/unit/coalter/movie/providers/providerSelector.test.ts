/**
 * D-2-e3-a0 providerSelector 単体テスト (pure foundation、mock provider のみ)。
 *
 * 検証軸 (PR #109 §3):
 *   1. Primary success → "provider_success" 即返却 (Secondary 呼ばれない)
 *   2. Primary throw + Secondary success → Secondary result
 *   3. Primary throw + Secondary throw + Tertiary success → Tertiary result
 *   4. 全 provider throw → "quaternary" reason "all_providers_failed" + attemptedCount
 *   5. 全 provider disabled → "quaternary" reason "all_providers_disabled" + attemptedCount=0
 *   6. Primary disabled + Secondary success → Secondary
 *   7. Secondary null → chain skip Secondary
 *   8. Tertiary null → chain skip Tertiary
 *   9. 入力 input は各 provider に同じ object で渡される
 *  10. fail-open: caller は本関数の reject を受けない (常に resolve)
 *
 * D-2-e3-a0 scope: 実 provider client / 実 API 接続なし、全 mock provider。
 */

import { describe, it, expect, vi } from "vitest";
import {
  selectAndRetrieve,
  type ProviderChainConfig,
} from "@/lib/coalter/movie/providers/providerSelector";
import type {
  MovieRetrievalProvider,
  ProviderId,
  ProviderRetrievalInput,
  ProviderRetrievalResult,
} from "@/lib/coalter/movie/providers/types";

// ═══════════════════════════════════════════════════════════════════════════
// fixture builders
// ═══════════════════════════════════════════════════════════════════════════

function makeResult(id: ProviderId): ProviderRetrievalResult {
  return {
    theaters: [{ theaterName: `${id} 劇場`, area: "渋谷" }],
    citations: [{ url: `https://${id}.test/page`, title: `${id} 出典` }],
    providerId: id,
    latencyMs: 0,
  };
}

function makeProvider(
  id: ProviderId,
  opts: {
    enabled?: boolean;
    retrieve?: MovieRetrievalProvider["retrieve"];
  } = {},
): MovieRetrievalProvider {
  return {
    id,
    enabled: opts.enabled ?? true,
    retrieve:
      opts.retrieve ?? vi.fn().mockResolvedValue(makeResult(id)),
  };
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

// ═══════════════════════════════════════════════════════════════════════════
// 1. Primary success
// ═══════════════════════════════════════════════════════════════════════════

describe("selectAndRetrieve — Primary success", () => {
  it("Primary が成功 → result 返却、Secondary / Tertiary は呼ばれない (cost 削減)", async () => {
    const secondaryRetrieve = vi.fn();
    const tertiaryRetrieve = vi.fn();
    const config: ProviderChainConfig = {
      primary: makeProvider("anthropic"),
      secondary: makeProvider("openai", { retrieve: secondaryRetrieve }),
      tertiary: makeProvider("exa", { retrieve: tertiaryRetrieve }),
    };
    const result = await selectAndRetrieve(makeInput(), config);
    expect(result.kind).toBe("provider_success");
    if (result.kind === "provider_success") {
      expect(result.result.providerId).toBe("anthropic");
    }
    expect(secondaryRetrieve).not.toHaveBeenCalled();
    expect(tertiaryRetrieve).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Primary throw + Secondary success
// ═══════════════════════════════════════════════════════════════════════════

describe("selectAndRetrieve — Primary 失敗 + Secondary 成功", () => {
  it("Primary throw → Secondary 切替え → Secondary result 返却", async () => {
    const tertiaryRetrieve = vi.fn();
    const config: ProviderChainConfig = {
      primary: makeProvider("anthropic", {
        retrieve: vi.fn().mockRejectedValue(new Error("anthropic error")),
      }),
      secondary: makeProvider("openai"),
      tertiary: makeProvider("exa", { retrieve: tertiaryRetrieve }),
    };
    const result = await selectAndRetrieve(makeInput(), config);
    expect(result.kind).toBe("provider_success");
    if (result.kind === "provider_success") {
      expect(result.result.providerId).toBe("openai");
    }
    expect(tertiaryRetrieve).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Primary + Secondary throw + Tertiary success
// ═══════════════════════════════════════════════════════════════════════════

describe("selectAndRetrieve — Primary + Secondary 失敗 + Tertiary 成功", () => {
  it("Primary throw → Secondary throw → Tertiary success", async () => {
    const config: ProviderChainConfig = {
      primary: makeProvider("anthropic", {
        retrieve: vi.fn().mockRejectedValue(new Error("anthropic")),
      }),
      secondary: makeProvider("openai", {
        retrieve: vi.fn().mockRejectedValue(new Error("openai")),
      }),
      tertiary: makeProvider("exa"),
    };
    const result = await selectAndRetrieve(makeInput(), config);
    expect(result.kind).toBe("provider_success");
    if (result.kind === "provider_success") {
      expect(result.result.providerId).toBe("exa");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. 全 provider throw → quaternary all_providers_failed
// ═══════════════════════════════════════════════════════════════════════════

describe("selectAndRetrieve — 全 provider 失敗 → quaternary", () => {
  it("全 provider throw → 'quaternary' reason='all_providers_failed', attemptedCount=3", async () => {
    const config: ProviderChainConfig = {
      primary: makeProvider("anthropic", {
        retrieve: vi.fn().mockRejectedValue(new Error("a")),
      }),
      secondary: makeProvider("openai", {
        retrieve: vi.fn().mockRejectedValue(new Error("o")),
      }),
      tertiary: makeProvider("exa", {
        retrieve: vi.fn().mockRejectedValue(new Error("e")),
      }),
    };
    const result = await selectAndRetrieve(makeInput(), config);
    expect(result.kind).toBe("quaternary");
    if (result.kind === "quaternary") {
      expect(result.reason).toBe("all_providers_failed");
      expect(result.attemptedCount).toBe(3);
    }
  });

  it("Primary のみ enabled で throw → attemptedCount=1", async () => {
    const config: ProviderChainConfig = {
      primary: makeProvider("anthropic", {
        retrieve: vi.fn().mockRejectedValue(new Error("a")),
      }),
      secondary: makeProvider("openai", { enabled: false }),
      tertiary: makeProvider("exa", { enabled: false }),
    };
    const result = await selectAndRetrieve(makeInput(), config);
    expect(result.kind).toBe("quaternary");
    if (result.kind === "quaternary") {
      expect(result.reason).toBe("all_providers_failed");
      expect(result.attemptedCount).toBe(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. 全 disabled → quaternary all_providers_disabled
// ═══════════════════════════════════════════════════════════════════════════

describe("selectAndRetrieve — 全 disabled → quaternary 即返却", () => {
  it("全 provider disabled → 'quaternary' reason='all_providers_disabled', attemptedCount=0", async () => {
    const primaryRetrieve = vi.fn();
    const config: ProviderChainConfig = {
      primary: makeProvider("anthropic", {
        enabled: false,
        retrieve: primaryRetrieve,
      }),
      secondary: makeProvider("openai", { enabled: false }),
      tertiary: makeProvider("exa", { enabled: false }),
    };
    const result = await selectAndRetrieve(makeInput(), config);
    expect(result.kind).toBe("quaternary");
    if (result.kind === "quaternary") {
      expect(result.reason).toBe("all_providers_disabled");
      expect(result.attemptedCount).toBe(0);
    }
    // disabled provider の retrieve は呼ばれない
    expect(primaryRetrieve).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Primary disabled + Secondary success
// ═══════════════════════════════════════════════════════════════════════════

describe("selectAndRetrieve — Primary disabled + Secondary 成功", () => {
  it("Primary が disabled → skip → Secondary が稼働", async () => {
    const primaryRetrieve = vi.fn();
    const config: ProviderChainConfig = {
      primary: makeProvider("anthropic", {
        enabled: false,
        retrieve: primaryRetrieve,
      }),
      secondary: makeProvider("openai"),
      tertiary: null,
    };
    const result = await selectAndRetrieve(makeInput(), config);
    expect(result.kind).toBe("provider_success");
    if (result.kind === "provider_success") {
      expect(result.result.providerId).toBe("openai");
    }
    expect(primaryRetrieve).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7-8. null Secondary / Tertiary
// ═══════════════════════════════════════════════════════════════════════════

describe("selectAndRetrieve — null Secondary / Tertiary", () => {
  it("Secondary null + Tertiary null + Primary success → Primary result", async () => {
    const config: ProviderChainConfig = {
      primary: makeProvider("anthropic"),
      secondary: null,
      tertiary: null,
    };
    const result = await selectAndRetrieve(makeInput(), config);
    expect(result.kind).toBe("provider_success");
  });

  it("Secondary null + Primary throw → Tertiary 試行", async () => {
    const config: ProviderChainConfig = {
      primary: makeProvider("anthropic", {
        retrieve: vi.fn().mockRejectedValue(new Error("a")),
      }),
      secondary: null,
      tertiary: makeProvider("exa"),
    };
    const result = await selectAndRetrieve(makeInput(), config);
    expect(result.kind).toBe("provider_success");
    if (result.kind === "provider_success") {
      expect(result.result.providerId).toBe("exa");
    }
  });

  it("Secondary null + Tertiary null + Primary throw → quaternary", async () => {
    const config: ProviderChainConfig = {
      primary: makeProvider("anthropic", {
        retrieve: vi.fn().mockRejectedValue(new Error("a")),
      }),
      secondary: null,
      tertiary: null,
    };
    const result = await selectAndRetrieve(makeInput(), config);
    expect(result.kind).toBe("quaternary");
    if (result.kind === "quaternary") {
      expect(result.reason).toBe("all_providers_failed");
      expect(result.attemptedCount).toBe(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. 入力 input は各 provider に同 object で渡る
// ═══════════════════════════════════════════════════════════════════════════

describe("selectAndRetrieve — input propagation", () => {
  it("input は Primary throw 後 Secondary に同 reference で渡る", async () => {
    const input = makeInput({
      title: "渡る作品",
      area: "渋谷",
      sourceHint: { officialUrl: "https://example.com" },
    });
    const secondaryRetrieve = vi.fn().mockResolvedValue(makeResult("openai"));
    const config: ProviderChainConfig = {
      primary: makeProvider("anthropic", {
        retrieve: vi.fn().mockRejectedValue(new Error("a")),
      }),
      secondary: makeProvider("openai", { retrieve: secondaryRetrieve }),
      tertiary: null,
    };
    await selectAndRetrieve(input, config);
    expect(secondaryRetrieve).toHaveBeenCalledTimes(1);
    expect(secondaryRetrieve).toHaveBeenCalledWith(input);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. fail-open (caller は reject を受けない)
// ═══════════════════════════════════════════════════════════════════════════

describe("selectAndRetrieve — fail-open (caller は常に resolve)", () => {
  it("全 provider throw でも本関数は throw せず quaternary resolve", async () => {
    const config: ProviderChainConfig = {
      primary: makeProvider("anthropic", {
        retrieve: vi.fn().mockRejectedValue(new Error("network down")),
      }),
      secondary: makeProvider("openai", {
        retrieve: vi.fn().mockRejectedValue(new TypeError("type")),
      }),
      tertiary: makeProvider("exa", {
        retrieve: vi.fn().mockRejectedValue("string error"),
      }),
    };
    await expect(selectAndRetrieve(makeInput(), config)).resolves.toMatchObject(
      { kind: "quaternary", reason: "all_providers_failed" },
    );
  });
});
