/**
 * C Tier1-A — Safe Travel Link tests（inert metadata のみ・href/生成/fetch なし・eligibility）
 *
 * 設計正本: docs/t11-c-tier1-safe-links-maps-url-design.md（§12）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSafeTravelLinkIntent } from "@/lib/shared/travel/safe-link";

const base = { inertUrl: "https://example.com/x", source: "user_provided" as const, label: "外部で確認する" };

describe("1. eligibility（confirmed のみ eligible）", () => {
  it("confirmed destination + valid url → eligible inert intent", () => {
    const r = buildSafeTravelLinkIntent({ ...base, destinationStatus: "confirmed" });
    expect(r).not.toBeNull();
    expect(r!.eligibility).toBe("eligible");
    expect(r!.inert).toBe(true);
    expect(r!.actionable).toBe(false);
    expect(r!.rendered).toBe(false);
    expect(r!.fetched).toBe(false);
    expect(r!.externalReference).toEqual({ kind: "url", value: "https://example.com/x", inert: true });
  });
  it("entityConfirmed → eligible（destination 未 confirmed でも）", () => {
    expect(buildSafeTravelLinkIntent({ ...base, destinationStatus: "unconfirmed", entityConfirmed: true })!.eligibility).toBe("eligible");
  });
  it("unconfirmed destination → ineligible_unconfirmed（eligible でない）", () => {
    expect(buildSafeTravelLinkIntent({ ...base, destinationStatus: "unconfirmed" })!.eligibility).toBe("ineligible_unconfirmed");
  });
  it("missing destination → ineligible_no_destination", () => {
    expect(buildSafeTravelLinkIntent({ ...base, destinationStatus: "missing" })!.eligibility).toBe("ineligible_no_destination");
  });
});

describe("2. URL syntactic（fetch/生成なし）", () => {
  it("空/whitespace → null", () => {
    expect(buildSafeTravelLinkIntent({ ...base, inertUrl: "   ", destinationStatus: "confirmed" })).toBeNull();
  });
  it("非文字列 → null", () => {
    // @ts-expect-error 不正入力（runtime guard 検証）
    expect(buildSafeTravelLinkIntent({ ...base, inertUrl: 123, destinationStatus: "confirmed" })).toBeNull();
  });
  it("非 http(s)（javascript:/ftp:/非URL）→ invalid_url（inert carry・href にしない）", () => {
    for (const u of ["javascript:alert(1)", "ftp://x", "notaurl", "http://has space.com"]) {
      const r = buildSafeTravelLinkIntent({ ...base, inertUrl: u, destinationStatus: "confirmed" });
      expect(r!.eligibility).toBe("invalid_url");
      expect(r!.actionable).toBe(false);
      expect(r!.rendered).toBe(false);
    }
  });
});

describe("3. inert・href/生成/private を持たない", () => {
  it("intent に href / generatedUrl / booking / private / userId / m2 field が無い", () => {
    const json = JSON.stringify(buildSafeTravelLinkIntent({ ...base, destinationStatus: "confirmed" }));
    for (const f of ["href", "generatedUrl", "booking", "calendar", "redLine", "red_line", "preference", "userId", "user_id", "m2", "stargazer", "livePrice", "availability"]) {
      expect(json).not.toContain(f);
    }
  });
});

describe("4. source-contract（helper 純度）", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/safe-link.ts"), "utf8"));
  it("URL を fetch/read/scrape/正規化しない・Maps 生成/href しない", () => {
    for (const f of ["fetch(", "XMLHttpRequest", "scrape", "new URL(", "href", "generatedUrl", "encodeURIComponent", "maps.google", "googleapis"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("private/userId/m2/route-weather-place を URL 構築に入れない（そもそも構築しない）", () => {
    for (const f of ["red_line", "redLine", "preference", "userId", "user_id", "stargazer", "personalization", "weather", "route("]) {
      expect(SRC).not.toContain(f);
    }
    expect(SRC).not.toMatch(/\bm2\b/i);
  });
  it("fetch/API/DB/Supabase/Maps・Places/web search/CoAlter/talk/app・UI を import しない", () => {
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\/api\//);
    expect(SRC).not.toMatch(/useCoAlter|\/talk|coalter/i);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/)/i);
  });
});
