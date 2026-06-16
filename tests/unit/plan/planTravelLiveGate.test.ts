/**
 * B2-disp A — Plan Travel Live Gate tests（pure gate・flag default OFF・server-only）
 *
 * 設計正本: docs/t11-production-plan-travel-live-gate-design.md（§4/§14）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isPlanTravelLiveAllowed } from "@/lib/plan/travel/plan-travel-live-gate";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";

const stagingUrl = `https://${STAGING_PROJECT_REF}.supabase.co`;
const prodUrl = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const base = { travelLive: true, planRouteLive: true, supabaseUrl: stagingUrl };

describe("1. gate（travelLive ∧ planRouteLive ∧ staging ∧ !production）", () => {
  it("全 true + staging url → true", () => {
    expect(isPlanTravelLiveAllowed(base)).toBe(true);
  });
  it("travelLive false → false", () => {
    expect(isPlanTravelLiveAllowed({ ...base, travelLive: false })).toBe(false);
  });
  it("planRouteLive false → false", () => {
    expect(isPlanTravelLiveAllowed({ ...base, planRouteLive: false })).toBe(false);
  });
  it("★ production url → false（travelLive ON でも deny）", () => {
    expect(isPlanTravelLiveAllowed({ ...base, supabaseUrl: prodUrl })).toBe(false);
  });
  it("staging でも production でもない url → false", () => {
    expect(isPlanTravelLiveAllowed({ ...base, supabaseUrl: "https://example.supabase.co" })).toBe(false);
  });
  it("url undefined → false", () => {
    expect(isPlanTravelLiveAllowed({ ...base, supabaseUrl: undefined })).toBe(false);
  });
});

describe("2. flag default OFF・server-only（NEXT_PUBLIC なし）", () => {
  it("PLAN_FLAGS.travelLive は env 未設定で false", () => {
    expect(PLAN_FLAGS.travelLive).toBe(false);
  });
  it("travelLive は PLAN_TRAVEL_LIVE 由来・NEXT_PUBLIC_PLAN_TRAVEL_LIVE は存在しない", () => {
    const flags = readFileSync(resolve(process.cwd(), "lib/plan/featureFlags.ts"), "utf8");
    expect(flags).toMatch(/travelLive:\s*process\.env\.PLAN_TRAVEL_LIVE\s*===\s*"true"/);
    expect(flags).not.toContain("NEXT_PUBLIC_PLAN_TRAVEL_LIVE");
  });
  it("gate helper は env/IO を読まない（pure・caller が env を渡す）", () => {
    const raw = readFileSync(resolve(process.cwd(), "lib/plan/travel/plan-travel-live-gate.ts"), "utf8");
    // comment は param 説明で SUPABASE_URL に言及するため strip（コードに env/IO が無いことを検証）
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    expect(src).not.toContain("process.env");
    expect(src).not.toMatch(/\bfetch\(/);
    // 注: `supabaseUrl` は param 名（caller が渡す）。supabase **client/import** が無いことを検証。
    expect(src).not.toMatch(/from ["'][^"']*supabase/i);
    expect(src).not.toContain("createClient");
    expect(src).not.toContain("supabaseServer");
  });
});
