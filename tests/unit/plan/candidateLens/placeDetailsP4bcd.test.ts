import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FORBIDDEN_FIELDS,
  PLACE_DETAILS_FIELD_MASK,
  PHOTO_MAX_WIDTH_PX,
  resolveEnrichment,
  shouldFetchEnrichment,
} from "@/lib/plan/candidateLens/placeDetailsEnrichment";
import { GooglePlaceDetailsAdapter } from "@/lib/plan/candidateLens/googlePlaceDetailsAdapter";
import {
  checkAndIncrementEnrichmentBudget,
  resetEnrichmentBudget,
  ENRICHMENT_BUDGET_CAP,
} from "@/lib/plan/candidateLens/enrichmentBudgetGuard";
import { validatePlaceId, enrichmentGate } from "@/lib/plan/candidateLens/enrichmentEndpointPolicy";

// ───────────────────────── fetch mock ─────────────────────────
const calls: { url: string; init: RequestInit }[] = [];
function res(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => data } as unknown as Response;
}
function installFetch(handler: (url: string) => Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return handler(String(url));
    }),
  );
}
function maskHeader(init: RequestInit): string | undefined {
  return (init.headers as Record<string, string> | undefined)?.["X-Goog-FieldMask"];
}

const TEST_KEY = "TEST_KEY_doNotLeak_123456789012345678";
const DETAILS_WITH_PHOTO = {
  id: "ChIJtest",
  photos: [{ name: "places/ChIJtest/photos/REF", widthPx: 1600, heightPx: 1200, authorAttributions: [{ displayName: "Taro", uri: "https://maps.google.com/u/taro", photoUri: "https://lh3.googleusercontent.com/u/taro" }] }],
  regularOpeningHours: { openNow: true, weekdayDescriptions: ["月曜日: 9時00分～18時00分"] },
};
const MEDIA_OK = { name: "places/ChIJtest/photos/REF/media", photoUri: "https://lh3.googleusercontent.com/p/REF=s400" };

beforeEach(() => {
  calls.length = 0;
  vi.stubEnv("GOOGLE_MAPS_API_KEY", TEST_KEY);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetEnrichmentBudget();
});

// ═══════════════ P4-b: GooglePlaceDetailsAdapter（mocked fetch・実 API 不叩き） ═══════════════
describe("P4-b GooglePlaceDetailsAdapter", () => {
  it("★Details の field mask は定数 id,photos,regularOpeningHours のみ（逸脱なし・禁止フィールド非含有）", async () => {
    installFetch((url) => (url.includes("/media") ? res(MEDIA_OK) : res(DETAILS_WITH_PHOTO)));
    await new GooglePlaceDetailsAdapter().fetchDetails("ChIJtest");
    const detailsCall = calls.find((c) => !c.url.includes("/media"))!;
    const mask = maskHeader(detailsCall.init);
    expect(mask).toBe(PLACE_DETAILS_FIELD_MASK);
    expect(mask).toBe("id,photos,regularOpeningHours");
    const fields = (mask ?? "").split(",");
    for (const f of FORBIDDEN_FIELDS) expect(fields).not.toContain(f);
  });

  it("★写真ありで Details 1 + Photo media 1 の計 2 回・photoUri は lh3 でキー非露出", async () => {
    installFetch((url) => (url.includes("/media") ? res(MEDIA_OK) : res(DETAILS_WITH_PHOTO)));
    const e = await new GooglePlaceDetailsAdapter().fetchDetails("ChIJtest");
    expect(calls.length).toBe(2); // ★1候補=Details1+Photo1（2回以上叩かない）
    expect(e.photo?.photoUri).toMatch(/^https:\/\/lh3\.googleusercontent\.com\//);
    expect(e.photo?.photoUri).not.toContain(TEST_KEY); // ★photoUri にキー非露出
    expect(e.hours?.openState).toBe("open");
    expect(resolveEnrichment(e).photoDisplayable).toBe(true);
    // media URL に maxWidthPx 上限と skipHttpRedirect、キーは URL でなくヘッダ
    const mediaCall = calls.find((c) => c.url.includes("/media"))!;
    expect(mediaCall.url).toContain(`maxWidthPx=${PHOTO_MAX_WIDTH_PX}`);
    expect(mediaCall.url).toContain("skipHttpRedirect=true");
    for (const c of calls) expect(c.url).not.toContain(TEST_KEY); // ★URL にキーを載せない
  });

  it("★写真なしは Details 1 回のみ（Photo を叩かない）", async () => {
    installFetch(() => res({ id: "x", regularOpeningHours: { openNow: false, weekdayDescriptions: ["日曜日: 定休日"] } }));
    const e = await new GooglePlaceDetailsAdapter().fetchDetails("x");
    expect(calls.length).toBe(1);
    expect(e.photo).toBeNull();
    expect(e.hours?.openState).toBe("closed");
  });

  it("★Details HTTP エラー → fail-open(error/http)・Photo 叩かない・throw しない", async () => {
    installFetch(() => res({}, false, 500));
    const e = await new GooglePlaceDetailsAdapter().fetchDetails("x");
    expect(e.fetchStatus).toBe("error");
    expect(e.error?.kind).toBe("http");
    expect(calls.length).toBe(1);
    expect(resolveEnrichment(e).photoDisplayable).toBe(false);
  });

  it("★timeout(AbortError) → fail-open(error/timeout)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { const err = new Error("aborted"); err.name = "AbortError"; throw err; }));
    const e = await new GooglePlaceDetailsAdapter().fetchDetails("x");
    expect(e.fetchStatus).toBe("error");
    expect(e.error?.kind).toBe("timeout");
  });

  it("★Photo media 失敗 → photoUri=null → 写真は abstract fallback（hours は生存）", async () => {
    installFetch((url) => (url.includes("/media") ? res({}, false, 500) : res(DETAILS_WITH_PHOTO)));
    const e = await new GooglePlaceDetailsAdapter().fetchDetails("ChIJtest");
    expect(e.photo).not.toBeNull();
    expect(e.photo?.photoUri).toBeNull();
    expect(resolveEnrichment(e).photoDisplayable).toBe(false); // 写真は出さない
    expect(e.hours?.openState).toBe("open"); // 営業時間は生きる
  });

  it("★API key 不在 → skipped・fetch 0 回（課金ゼロ）", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    installFetch(() => res(DETAILS_WITH_PHOTO));
    const e = await new GooglePlaceDetailsAdapter().fetchDetails("x");
    expect(e.fetchStatus).toBe("skipped");
    expect(calls.length).toBe(0);
  });

  it("★enrichment にキーが含まれない（応答に key 非露出）", async () => {
    installFetch((url) => (url.includes("/media") ? res(MEDIA_OK) : res(DETAILS_WITH_PHOTO)));
    const e = await new GooglePlaceDetailsAdapter().fetchDetails("ChIJtest");
    expect(JSON.stringify(e)).not.toContain(TEST_KEY);
  });
});

// ═══════════════ P4-b: budget guard ═══════════════
describe("P4-b enrichmentBudgetGuard", () => {
  it("★上限内は allowed・increment、perMinute 超過で block", () => {
    for (let i = 0; i < ENRICHMENT_BUDGET_CAP.perMinute; i++) {
      expect(checkAndIncrementEnrichmentBudget(1000).allowed).toBe(true);
    }
    const over = checkAndIncrementEnrichmentBudget(1000);
    expect(over.allowed).toBe(false);
    expect(over.reason).toBe("minute");
  });

  it("★minute window roll で復活・day は継続（perDay 超過で block）", () => {
    let now = 0;
    let allowedCount = 0;
    // 各 call で 1 分進め minute をロールさせ続ける → day が累積し perDay でブロック
    for (let i = 0; i < ENRICHMENT_BUDGET_CAP.perDay; i++) {
      const d = checkAndIncrementEnrichmentBudget(now);
      if (d.allowed) allowedCount++;
      now += 60_000;
    }
    expect(allowedCount).toBe(ENRICHMENT_BUDGET_CAP.perDay);
    const over = checkAndIncrementEnrichmentBudget(now);
    expect(over.allowed).toBe(false);
    expect(over.reason).toBe("day"); // minute はロールしてるので day で止まる
  });
});

// ═══════════════ P4-b: endpoint policy（pure） ═══════════════
describe("P4-b enrichmentEndpointPolicy", () => {
  it("★validatePlaceId: 正常な placeId のみ受理", () => {
    expect(validatePlaceId({ placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4" })).toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");
    expect(validatePlaceId({ placeId: "ChIJ-abc_123" })).toBe("ChIJ-abc_123");
  });
  it("★validatePlaceId: 不正(非string/空/短/記号/別field) → null", () => {
    expect(validatePlaceId({ placeId: 123 })).toBeNull();
    expect(validatePlaceId({ placeId: "" })).toBeNull();
    expect(validatePlaceId({ placeId: "ab" })).toBeNull();
    expect(validatePlaceId({ placeId: "ChIJ has space" })).toBeNull();
    expect(validatePlaceId({ placeId: "ChIJ/../etc" })).toBeNull();
    expect(validatePlaceId({ other: "x" })).toBeNull();
    expect(validatePlaceId(null)).toBeNull();
  });
  it("★enrichmentGate: 全条件 true で proceed・いずれか false で skipped", () => {
    expect(enrichmentGate({ fetchEnabled: true, apiAvailable: true, budgetAllowed: true })).toBe("proceed");
    expect(enrichmentGate({ fetchEnabled: false, apiAvailable: true, budgetAllowed: true })).toBe("skipped");
    expect(enrichmentGate({ fetchEnabled: true, apiAvailable: false, budgetAllowed: true })).toBe("skipped");
    expect(enrichmentGate({ fetchEnabled: true, apiAvailable: true, budgetAllowed: false })).toBe("skipped");
  });
});

// ═══════════════ P4-d: client は Google/key に触れない（源コード grep） ═══════════════
describe("P4-d client は API key / Google adapter に触れない", () => {
  const root = process.cwd();
  const clientFiles = [
    "app/(culcept)/plan/components/usePlaceDetailsEnrichment.ts",
    "app/(culcept)/plan/components/CandidateLensPanel.tsx",
  ];
  it("★client が googlePlaceDetailsAdapter / GOOGLE_MAPS_API_KEY を import/参照しない", () => {
    for (const rel of clientFiles) {
      const src = readFileSync(resolve(root, rel), "utf8");
      expect(src).not.toContain("googlePlaceDetailsAdapter");
      expect(src).not.toContain("GOOGLE_MAPS_API_KEY");
    }
  });
  it("★client は Google を直叩きせず自前 endpoint を POST する", () => {
    const hook = readFileSync(resolve(root, "app/(culcept)/plan/components/usePlaceDetailsEnrichment.ts"), "utf8");
    expect(hook).toContain("/api/plan/places/details");
    expect(hook).not.toContain("places.googleapis.com");
  });
});

// ═══════════════ P4-d: shouldFetchEnrichment（browse中/memo hit/flag OFF で fetch しない） ═══════════════
describe("P4-d shouldFetchEnrichment", () => {
  it("★active=false（flag OFF/browse 非対象）→ false", () => {
    expect(shouldFetchEnrichment("p1", false, false)).toBe(false);
  });
  it("★memo hit（alreadyKnown=true）→ false（再 fetch しない）", () => {
    expect(shouldFetchEnrichment("p1", true, true)).toBe(false);
  });
  it("★active かつ未取得かつ placeId あり → true", () => {
    expect(shouldFetchEnrichment("p1", false, true)).toBe(true);
  });
  it("★placeId 空/null → false", () => {
    expect(shouldFetchEnrichment("", false, true)).toBe(false);
    expect(shouldFetchEnrichment(null, false, true)).toBe(false);
  });
});
