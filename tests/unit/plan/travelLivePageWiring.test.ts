/**
 * B2-disp C — production /plan page → TravelLivePanel wiring source-contract。
 *   gate は server 計算（isPlanTravelLiveAllowed）・visible prop で渡す・client は flag を判定しない。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const PAGE = strip(readFileSync(resolve(process.cwd(), "app/(culcept)/plan/page.tsx"), "utf8"));

describe("1. page → TravelLivePanel wiring（server gate）", () => {
  it("isPlanTravelLiveAllowed + TravelLivePanel を import", () => {
    expect(PAGE).toContain("isPlanTravelLiveAllowed");
    expect(PAGE).toContain("TravelLivePanel");
  });
  it("gate は server-only flag（PLAN_FLAGS.travelLive/planRouteLive）+ supabaseUrl(env) で計算", () => {
    expect(PAGE).toMatch(/isPlanTravelLiveAllowed\(\{/);
    expect(PAGE).toContain("travelLive: PLAN_FLAGS.travelLive");
    expect(PAGE).toContain("planRouteLive: PLAN_FLAGS.planRouteLive");
    expect(PAGE).toMatch(/process\.env\.NEXT_PUBLIC_SUPABASE_URL\s*\?\?\s*process\.env\.SUPABASE_URL/);
  });
  it("visible は gate 結果（travelLiveAllowed）で渡す・searchParams 由来でない", () => {
    expect(PAGE).toMatch(/<TravelLivePanel\s+visible=\{travelLiveAllowed\}/);
    expect(PAGE).not.toMatch(/visible=\{[^}]*searchParams/);
    expect(PAGE).not.toMatch(/visible=\{[^}]*sp\b/);
  });
});
