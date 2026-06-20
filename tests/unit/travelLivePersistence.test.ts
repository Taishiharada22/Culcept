/**
 * D — Travel live best-effort persistence helper tests（injected-only・display-without-save・no real DB）
 *
 * 設計正本: docs/t11-server-action-persistence-wiring-preflight.md（§7-11）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { persistTravelLiveIntentIfAvailable } from "@/lib/server/travel/travel-live-persistence";
import { createInMemoryTravelSessionRepositoryHarness } from "@/lib/shared/travel/travel-session-repository-harness";
import type { TravelSessionRepositoryContract, TravelSessionPersistenceWriteInput } from "@/lib/shared/travel/travel-session-persistence-types";
import type { SessionSurfaceEvent } from "@/lib/shared/travel/travel-session-binding-types";

const strip = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const SRC = strip(readFileSync(resolve(process.cwd(), "lib/server/travel/travel-live-persistence.ts"), "utf8"));

const READY: SessionSurfaceEvent[] = [
  { kind: "destination_input", areaText: "京都", surface: "form_input" },
  { kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } },
];
const MISSING_DEST: SessionSurfaceEvent[] = [{ kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } }];

/** save 呼び出しと write input を capture する mock repo。 */
function capturingRepo(over: { ok?: boolean; throws?: boolean } = {}) {
  const calls: string[] = [];
  let captured: TravelSessionPersistenceWriteInput | null = null;
  const repo: TravelSessionRepositoryContract = {
    async saveTravelSessionIntent(wi) {
      calls.push("save");
      captured = wi;
      if (over.throws) throw new Error("DB exploded: secret detail");
      return over.ok === false ? { ok: false, error: "invalid_input" } : { ok: true, bundle: { session: { id: "s1", ownerUserId: wi.ownerUserId, status: wi.status, visibility: wi.visibility, createdAt: "T", updatedAt: "T" }, inputs: [], links: [] } };
    },
    async loadTravelSessionIntent() { calls.push("load"); return null; },
    async listTravelSessionIntents() { calls.push("list"); return []; },
    async deleteTravelSessionIntent() { calls.push("delete"); return { ok: false }; },
  };
  return { repo, calls, getCaptured: () => captured };
}

describe("1. 注入なし → display-without-save（repository unavailable）", () => {
  it("注入なし + ready → unavailable（save しない・display を壊さない）", async () => {
    expect(await persistTravelLiveIntentIfAvailable({ events: READY, ownerUserId: "u1" })).toEqual({ status: "unavailable" });
  });
});

describe("2. provider not-ready → repository を呼ばない（not_attempted）", () => {
  it("missing destination → not_attempted・save 未呼出", async () => {
    const { repo, calls } = capturingRepo();
    const r = await persistTravelLiveIntentIfAvailable({ events: MISSING_DEST, ownerUserId: "u1", injectedRepository: repo });
    expect(r).toEqual({ status: "not_attempted" });
    expect(calls).toEqual([]); // repository を呼ばない
  });
});

describe("3. injected repo + ready → save（confirmed structured intent のみ）", () => {
  it("save 呼出・saved・write input は session/inputs/links のみ・forbidden なし", async () => {
    const { repo, calls, getCaptured } = capturingRepo();
    const r = await persistTravelLiveIntentIfAvailable({ events: [...READY, { kind: "budget_input", value: { lo: 5000, hi: 20000, confidence: 1, currency: "JPY" }, surface: "form_input" }], ownerUserId: "u1", injectedRepository: repo });
    expect(r).toEqual({ status: "saved" });
    expect(calls).toEqual(["save"]);
    const wi = getCaptured()!;
    expect(Object.keys(wi).sort()).toEqual(["inputs", "links", "ownerUserId", "status", "visibility"]);
    expect(wi.ownerUserId).toBe("u1");
    expect(wi.links).toEqual([]);
    expect(wi.inputs.map((i) => i.slotKey).sort()).toEqual(["budget_band", "date_or_range", "destination_area"]);
    const json = JSON.stringify(wi);
    for (const f of ["DisplayPacketForClient", "projection", "cues", "packet", "authoritative", "executionAuthority", "diagnostics", "href", "generatedUrl", "generated_maps_search", "availability", "price", "booking"]) {
      expect(json).not.toContain(f);
    }
  });
  it("in-memory harness 注入 → saved・harness に永続（round-trip）", async () => {
    const harness = createInMemoryTravelSessionRepositoryHarness();
    expect((await persistTravelLiveIntentIfAvailable({ events: READY, ownerUserId: "u1", injectedRepository: harness })).status).toBe("saved");
    expect(harness.size()).toBe(1);
  });
});

describe("4. failure は中立 status のみ（raw diag/session id を出さない）", () => {
  it("save {ok:false} → not_saved", async () => {
    const { repo } = capturingRepo({ ok: false });
    expect(await persistTravelLiveIntentIfAvailable({ events: READY, ownerUserId: "u1", injectedRepository: repo })).toEqual({ status: "not_saved" });
  });
  it("repository throws → not_saved（raw error を leak しない・result は status のみ）", async () => {
    const { repo } = capturingRepo({ throws: true });
    const r = await persistTravelLiveIntentIfAvailable({ events: READY, ownerUserId: "u1", injectedRepository: repo });
    expect(r).toEqual({ status: "not_saved" });
    expect(Object.keys(r)).toEqual(["status"]); // session id / bundle / raw error なし
    expect(JSON.stringify(r)).not.toContain("secret detail");
  });
});

describe("5. source-contract（server-only・no Supabase/service_role/DB direct/外部）", () => {
  it('import "server-only" を持つ', () => {
    expect(readFileSync(resolve(process.cwd(), "lib/server/travel/travel-live-persistence.ts"), "utf8")).toMatch(/import "server-only";/);
  });
  it("Supabase port/createClient/supabaseServer/service_role/generated types/DB direct を import/構築しない", () => {
    expect(SRC).not.toContain("createSupabaseTravelSessionDbPort");
    expect(SRC).not.toContain("createClient");
    expect(SRC).not.toContain("supabaseServer");
    expect(SRC).not.toMatch(/service_role|serviceRole/);
    expect(SRC).not.toMatch(/@supabase\/|database\.types|Database\b/);
    expect(SRC).not.toMatch(/\.from\(|\.insert\(|\.rpc\(/);
    expect(SRC).not.toMatch(/\bfetch\(/);
  });
  it("engine/display/booking/Maps/M2/CoAlter/talk/app・UI を呼ばない", () => {
    for (const f of ["runTravelPlanEngine", "buildTravelPlanDisplayResult", "buildPlanIntelligenceProjection", "buildGeneratedMapsSearchIntent", "booking", "calendar", "googleapis"]) {
      expect(SRC).not.toContain(f);
    }
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/|_actions)/);
    expect(SRC).not.toMatch(/useCoAlter|\/talk|coalter/i);
    expect(SRC).not.toMatch(/\bm2\b/i);
  });
});
