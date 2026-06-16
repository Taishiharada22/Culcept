/**
 * B2-disp A/B — Travel Plan Display Adapter tests
 *
 * 設計正本: docs/t11-production-plan-travel-input-wiring-preflight.md（§6/§9/§14）
 *
 * 主眼: 5 状態（ready/not_ready_missing/not_ready_unconfirmed/unavailable/invalid）・
 *   not-ready は engine を呼ばない・ready は display-safe（packet authoritative:false/executionAuthority:false・
 *   projection/cues）・authoritative/raw input/raw output/diagnostics 非露出・cues に execute/book/send なし・純度。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildTravelPlanDisplayResult } from "@/lib/shared/travel/travel-plan-display-adapter";
import type { TravelPlanDisplayInput } from "@/lib/shared/travel/travel-plan-display-adapter-types";
import type { SessionSurfaceEvent } from "@/lib/shared/travel/travel-session-binding-types";

const PROD = { fixtureAllowed: false } as const;
const input = (events: SessionSurfaceEvent[], over: Partial<TravelPlanDisplayInput> = {}): TravelPlanDisplayInput => ({
  events,
  participantIds: ["P1"],
  viewerId: "P1",
  ...over,
});
const READY_EVENTS: SessionSurfaceEvent[] = [
  { kind: "destination_input", areaText: "京都", surface: "form_input" },
  { kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } },
];

// ── 1. ready → display-safe ────────────────────────────────────────────────────
describe("1. ready → display-safe", () => {
  it("confirmed payload → ready（packet/projection/cues・display のみ）", () => {
    const r = buildTravelPlanDisplayResult(input(READY_EVENTS), PROD);
    expect(r.status).toBe("ready");
    if (r.status !== "ready") throw new Error("unreachable");
    expect(r.display.packet).toBeTruthy();
    expect(r.display.projection).toBeTruthy();
    expect(Array.isArray(r.display.cues)).toBe(true);
  });
  it("display packet は authoritative:false / executionAuthority:false（brand 型）", () => {
    const r = buildTravelPlanDisplayResult(input(READY_EVENTS), PROD);
    if (r.status !== "ready") throw new Error("unreachable");
    expect(r.display.packet.authoritative).toBe(false);
    expect(r.display.packet.executionAuthority).toBe(false);
  });
  it("ready 結果に authoritative-tier / raw engine output / raw input / 生 diagnostics を含まない", () => {
    const r = buildTravelPlanDisplayResult(input(READY_EVENTS), PROD);
    if (r.status !== "ready") throw new Error("unreachable");
    const json = JSON.stringify(r);
    for (const f of ["\"server\"", "executionAuthority\":true", "TravelPlanEngineInput", "diagnostics", "provenance", "\"authoritative\":true"]) {
      expect(json).not.toContain(f);
    }
    // 出力 payload は packet/projection/cues のみ
    expect(Object.keys(r.display).sort()).toEqual(["cues", "packet", "projection"]);
  });
  it("cues に execute/book/schedule/send action が無い（display cue のみ）", () => {
    const r = buildTravelPlanDisplayResult(input(READY_EVENTS), PROD);
    if (r.status !== "ready") throw new Error("unreachable");
    for (const c of r.display.cues) {
      expect(["execute", "book", "schedule", "send", "reserve"]).not.toContain(c.action);
    }
  });
});

// ── 2. not-ready → engine を呼ばず中立 ─────────────────────────────────────────
describe("2. not-ready は engine を呼ばず display なし", () => {
  it("missing destination → not_ready_missing（display なし）", () => {
    const r = buildTravelPlanDisplayResult(input([{ kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } }]), PROD);
    expect(r.status).toBe("not_ready_missing");
    expect("display" in r).toBe(false); // engine 不実行（display を作らない）
    if (r.status === "not_ready_missing") expect(r.ask.some((a) => a.prerequisite === "destination")).toBe(true);
  });
  it("missing date → not_ready_missing（display なし）", () => {
    const r = buildTravelPlanDisplayResult(input([{ kind: "destination_input", areaText: "京都", surface: "form_input" }]), PROD);
    expect(r.status).toBe("not_ready_missing");
    expect("display" in r).toBe(false);
    if (r.status === "not_ready_missing") expect(r.ask.some((a) => a.prerequisite === "date_or_range")).toBe(true);
  });
  it("honesty firewall: explicit binding 経由では unconfirmed hard slot が生じ得ない（proposed 不在）", () => {
    // explicit surface（form/quick/adjustment→confirmed・selected→session_context normalized）のみ生成するため、
    // adapter 経由の結果は ready / missing / invalid / unavailable のいずれか。not_ready_unconfirmed は
    // proposed slot を直接供給する経路（provider 単体: productionTravelInput.test.ts）でのみ到達する。
    // ここでは「explicit な dest+date → ready（unconfirmed にならない）」を確認。
    const r = buildTravelPlanDisplayResult(input(READY_EVENTS), PROD);
    expect(r.status).toBe("ready");
    expect(r.status).not.toBe("not_ready_unconfirmed");
  });
  it("invalid participants（重複）→ invalid（display なし）", () => {
    const r = buildTravelPlanDisplayResult(input(READY_EVENTS, { participantIds: ["P1", "P1"] }), PROD);
    expect(r.status).toBe("invalid");
    expect("display" in r).toBe(false);
  });
  it("unavailable source → unavailable（display なし）", () => {
    // @ts-expect-error 不正入力（session source 不在を検証）
    const r = buildTravelPlanDisplayResult(null, PROD);
    expect(r.status).toBe("unavailable");
    expect("display" in r).toBe(false);
  });
  it("production gate が dev_fixture を拒否（fixtureAllowed:true）→ unavailable・fixture fallback なし", () => {
    const r = buildTravelPlanDisplayResult(input(READY_EVENTS), { fixtureAllowed: true });
    expect(r.status).toBe("unavailable");
    expect("display" in r).toBe(false);
  });
});

// ── 3. source-contract（adapter 純度・display-safe chain のみ）──────────────────
describe("3. adapter source-contract", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/travel-plan-display-adapter.ts"), "utf8"));
  const TYPES = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/travel-plan-display-adapter-types.ts"), "utf8"));

  it("display-safe chain を使う（bind/provider/engine/toDisplayPacket/projection/cues）", () => {
    for (const f of ["bindTravelSessionIntake", "getProductionTravelInput", "runTravelPlanEngine", "toDisplayPacket", "buildPlanIntelligenceProjection", "deriveCoAlterProjectionCues"]) {
      expect(SRC).toContain(f);
    }
  });
  it("toServerAuthoritativePacket / AuthoritativePacketForServer を使わない", () => {
    for (const f of ["toServerAuthoritativePacket", "AuthoritativePacketForServer"]) {
      expect(SRC).not.toContain(f);
      expect(TYPES).not.toContain(f);
    }
  });
  it("route wiring / server action / persistence / booking を持たない", () => {
    for (const src of [SRC, TYPES]) {
      for (const f of ['"use server"', "use client", "redirect", "revalidatePath", "booking", "calendar", "executionAuthority", "PlanClient"]) {
        expect(src).not.toContain(f);
      }
    }
  });
  it("fetch/API/DB/Supabase/M2/route-weather-place/外部/app/UI を import/呼出しない", () => {
    for (const src of [SRC, TYPES]) {
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/\/api\//);
      expect(src).not.toMatch(/googleapis|maps|weather/i);
      expect(src).not.toMatch(/m2|personalization|useCoAlter|\/talk/i);
      expect(src).not.toMatch(/from ["']next/);
      expect(src).not.toMatch(/from ["']react/);
      expect(src).not.toMatch(/from ["'][^"']*(components|app\/)/i);
    }
  });
});
