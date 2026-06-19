/**
 * Tier1-B A/B — Safe Travel Link Href model tests（eligible のみ・unchanged・no UI/生成/fetch）
 *
 * 設計正本: docs/t11-tier1-b-safe-link-href-render-design.md（§14）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSafeTravelLinkHrefModel } from "@/lib/shared/travel/safe-link-href";
import { buildSafeTravelLinkIntent } from "@/lib/shared/travel/safe-link";
import type { SafeTravelLinkSource } from "@/lib/shared/travel/safe-link-types";

const URL = "https://example.com/x?a=1";
const intent = (over: { source?: SafeTravelLinkSource; destinationStatus?: "confirmed" | "unconfirmed" | "missing"; inertUrl?: string } = {}) =>
  buildSafeTravelLinkIntent({
    inertUrl: over.inertUrl ?? URL,
    source: over.source ?? "user_provided",
    label: "外部で確認する",
    destinationStatus: over.destinationStatus ?? "confirmed",
  })!;

describe("1. eligible → href model", () => {
  for (const source of ["user_provided", "manual_official", "manual_maps"] as const) {
    it(`eligible ${source} link → display-safe href model`, () => {
      const m = buildSafeTravelLinkHrefModel(intent({ source }));
      expect(m).not.toBeNull();
      expect(m!.kind).toBe("external_handoff");
      expect(m!.external).toBe(true);
      expect(m!.authoritative).toBe(false);
      expect(m!.rendered).toBe(false); // ★ rendered anchor でない
    });
  }
  it("handoffUrl === externalReference.value（unchanged・tracking 付与なし）", () => {
    const i = intent();
    const m = buildSafeTravelLinkHrefModel(i)!;
    expect(m.handoffUrl).toBe(URL);
    expect(m.handoffUrl).toBe(i.externalReference.value); // intent と同一
  });
});

describe("2. ineligible / invalid → null", () => {
  it("invalid_url → null", () => {
    expect(buildSafeTravelLinkHrefModel(intent({ inertUrl: "javascript:alert(1)" }))).toBeNull();
  });
  it("ineligible_unconfirmed → null", () => {
    expect(buildSafeTravelLinkHrefModel(intent({ destinationStatus: "unconfirmed" }))).toBeNull();
  });
  it("ineligible_no_destination → null", () => {
    expect(buildSafeTravelLinkHrefModel(intent({ destinationStatus: "missing" }))).toBeNull();
  });
});

describe("3. model に href/booking/price/private/userId/M2/generatedUrl を持たない", () => {
  it("禁止 field を含まない", () => {
    const json = JSON.stringify(buildSafeTravelLinkHrefModel(intent()));
    for (const f of ["\"href\"", "executionAuthority", "booking", "calendar", "livePrice", "availability", "cancellation", "generatedUrl", "redLine", "red_line", "preference", "userId", "user_id", "m2", "stargazer", "diagnostics"]) {
      expect(json).not.toContain(f);
    }
  });
});

describe("4. source-contract（helper 純度・no UI/生成/fetch）", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/safe-link-href.ts"), "utf8"));
  it("URL を生成/改変/fetch/scrape しない・<a href>/Maps を作らない", () => {
    for (const f of ["fetch(", "XMLHttpRequest", "scrape", "new URL(", "encodeURIComponent", "<a ", "href=", "maps.google", "googleapis", "generatedUrl"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("private/userId/m2 を URL に入れない・web search なし", () => {
    for (const f of ["red_line", "redLine", "preference", "userId", "user_id", "stargazer", "personalization", "webSearch", "search("]) {
      expect(SRC).not.toContain(f);
    }
    expect(SRC).not.toMatch(/\bm2\b/i);
  });
  it("DB/Supabase/app-UI/CoAlter/talk を import しない", () => {
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\/api\//);
    expect(SRC).not.toMatch(/useCoAlter|\/talk|coalter/i);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/)/i);
  });
  it("禁止 copy を含まない", () => {
    for (const f of ["予約する", "空きあり", "最安", "確定", "この場所にする", "スケジュールに追加", "今すぐ行く", "この案で決定"]) {
      expect(SRC).not.toContain(f);
    }
  });
});
