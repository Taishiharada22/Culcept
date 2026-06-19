/**
 * Tier1-C A+B — Generated Maps 検索 hand-off intent + helper
 *   confirmed shared-safe ラベルのみ生成・未確定/private/空→null・固定 base + label encode のみ・
 *   外部 API/fetch/place 解決なし・生成と manual を構造的に区別・既存 ladder 不変。
 *
 * 設計正本: docs/t11-tier1-c-maps-url-generation-design.md（§14）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildGeneratedMapsSearchIntent,
  MAPS_SEARCH_HANDOFF_BASE,
  type BuildGeneratedMapsSearchInput,
} from "@/lib/shared/travel/generated-maps-search";
import { buildSafeTravelLinkIntent } from "@/lib/shared/travel/safe-link";
import { buildSafeTravelLinkHrefModel } from "@/lib/shared/travel/safe-link-href";

const base = (over: Partial<BuildGeneratedMapsSearchInput> = {}): BuildGeneratedMapsSearchInput => ({
  query: "京都",
  destinationStatus: "confirmed",
  visibility: "shared",
  label: "地図で検索する",
  ...over,
});

describe("1. confirmed shared-safe → 生成", () => {
  it("confirmed destination ラベル → generated_maps_search intent", () => {
    const i = buildGeneratedMapsSearchIntent(base())!;
    expect(i).not.toBeNull();
    expect(i.source).toBe("generated_maps_search");
    expect(i.generated).toBe(true);
    expect(i.eligibility).toBe("eligible");
  });
  it("confirmed entity ラベル（destination 未確定でも entityConfirmed）→ 生成", () => {
    const i = buildGeneratedMapsSearchIntent(base({ destinationStatus: "unconfirmed", entityConfirmed: true }))!;
    expect(i).not.toBeNull();
    expect(i.source).toBe("generated_maps_search");
    expect(i.generated).toBe(true);
  });
  it("生成 intent は inert / actionable false / rendered false / fetched false", () => {
    const i = buildGeneratedMapsSearchIntent(base())!;
    expect(i.inert).toBe(true);
    expect(i.actionable).toBe(false);
    expect(i.rendered).toBe(false);
    expect(i.fetched).toBe(false);
    expect(i.externalReference).toEqual({ kind: "url", value: i.externalReference.value, inert: true });
  });
});

describe("2. 未確定 / private / 空 → null（URL を捏造しない）", () => {
  it("proposed(=unconfirmed) destination → null", () => {
    expect(buildGeneratedMapsSearchIntent(base({ destinationStatus: "unconfirmed" }))).toBeNull();
  });
  it("missing destination → null", () => {
    expect(buildGeneratedMapsSearchIntent(base({ destinationStatus: "missing" }))).toBeNull();
  });
  it("空ラベル → null", () => {
    expect(buildGeneratedMapsSearchIntent(base({ query: "   " }))).toBeNull();
  });
  it("private label（visibility private）→ null", () => {
    expect(buildGeneratedMapsSearchIntent(base({ visibility: "private" }))).toBeNull();
  });
  it("★ M2/Stargazer 由来想定（confirmed でない normalized + private）→ null", () => {
    // M2(profile_prior) は surface 上 status=normalized + visibility=private しか産まない＝両 gate で落ちる
    expect(buildGeneratedMapsSearchIntent(base({ destinationStatus: "unconfirmed", visibility: "private" }))).toBeNull();
  });
});

describe("3. URL は固定 base + shared-safe label のみ（private/userId/M2/budget/tracking/key なし）", () => {
  it("value === MAPS_SEARCH_HANDOFF_BASE + encodeURIComponent(label)", () => {
    const i = buildGeneratedMapsSearchIntent(base({ query: "京都 五条" }))!;
    expect(i.externalReference.value).toBe(MAPS_SEARCH_HANDOFF_BASE + encodeURIComponent("京都 五条"));
    expect(i.externalReference.value.startsWith(MAPS_SEARCH_HANDOFF_BASE)).toBe(true);
  });
  it("label のみ encode（query 以外の混入なし）", () => {
    const i = buildGeneratedMapsSearchIntent(base({ query: "京都" }))!;
    const tail = i.externalReference.value.slice(MAPS_SEARCH_HANDOFF_BASE.length);
    expect(tail).toBe(encodeURIComponent("京都")); // base 以降は encode 済 label のみ
  });
  it("tracking param / query string / API key を含まない", () => {
    const v = buildGeneratedMapsSearchIntent(base())!.externalReference.value;
    expect(v).not.toContain("?"); // path 形式＝query string なし＝tracking 不能
    for (const f of ["utm_", "key=", "&", "userId", "user_id", "red_line", "preference", "budget", "pace", "mobility", "stargazer", "m2="]) {
      expect(v).not.toContain(f);
    }
    expect(v).not.toMatch(/AIza/); // Google API key prefix なし
  });
  it("private red_line / userId / M2 / budget をラベルに混ぜても URL は label-encode のみ（caller 責務だが二重に確認）", () => {
    // private なラベルは visibility private で弾く想定。ここでは shared-safe 前提で「URL は label そのもの」を確認
    const i = buildGeneratedMapsSearchIntent(base({ query: "嵐山" }))!;
    expect(i.externalReference.value).toBe(MAPS_SEARCH_HANDOFF_BASE + encodeURIComponent("嵐山"));
  });
});

describe("4. 既存 manual link ladder 不変（additive）", () => {
  it("manual builder は generated を set しない（absent）", () => {
    const m = buildSafeTravelLinkIntent({ inertUrl: "https://example.com/x", source: "user_provided", label: "外部で確認する", destinationStatus: "confirmed" })!;
    expect(m.generated).toBeUndefined();
    expect(m.source).toBe("user_provided");
    expect(m.eligibility).toBe("eligible");
  });
  it("生成 intent も Tier1-B helper で href model 化できる（ladder 再利用・source 非依存）", () => {
    const gen = buildGeneratedMapsSearchIntent(base())!;
    const model = buildSafeTravelLinkHrefModel(gen)!;
    expect(model).not.toBeNull();
    expect(model.kind).toBe("external_handoff");
    expect(model.handoffUrl).toBe(gen.externalReference.value); // unchanged
    expect(model.rendered).toBe(false);
  });
});

describe("5. source-contract（helper 純度・外部 API/fetch/place 解決なし）", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/generated-maps-search.ts"), "utf8"));
  it("fetch/scrape/place 解決/Maps・Places API/web search なし", () => {
    for (const f of ["fetch(", "XMLHttpRequest", "axios", "scrape", "PlacesService", "googleapis", "places.google", "geocode", "placeId", "placeRefId", "webSearch", "web_search"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("API key を持たない", () => {
    for (const f of ["key=", "apiKey", "API_KEY", "AIza", "process.env"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("DB/Supabase/app-UI/CoAlter/talk を import しない", () => {
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\/api\//);
    expect(SRC).not.toMatch(/useCoAlter|\/talk|coalter/i);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/)/i);
  });
  it("private/booking/action field を構築しない", () => {
    for (const f of ["booking", "calendar", "availability", "livePrice", "executionAuthority", "red_line", "redLine", "stargazer"]) {
      expect(SRC).not.toContain(f);
    }
    expect(SRC).not.toMatch(/\bm2\b/i);
  });
  it("禁止 copy を持たない", () => {
    for (const f of ["ここに行く", "この場所にする", "予約する", "空きあり", "最安", "スケジュールに追加", "今すぐ行く", "この案で決定"]) {
      expect(SRC).not.toContain(f);
    }
  });
});
