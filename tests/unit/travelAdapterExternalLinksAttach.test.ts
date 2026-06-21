/**
 * C-E — adapter externalLinks attach（option 既定 OFF・confirmed shared-safe destination のみ・byte 等価）
 *
 * 設計正本: docs/t11-c-adapter-externallinks-attach-design.md（§12 + CEO option 名補正）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildTravelPlanDisplayResult } from "@/lib/shared/travel/travel-plan-display-adapter";
import { MAPS_SEARCH_HANDOFF_BASE } from "@/lib/shared/travel/generated-maps-search";
import type { SessionSurfaceEvent } from "@/lib/shared/travel/travel-session-binding-types";
import type { TravelPlanDisplayResult } from "@/lib/shared/travel/travel-plan-display-adapter-types";

const GATE = { fixtureAllowed: false } as const;

/** confirmed shared destination（form_input）+ 確定日 → provider ready。 */
const READY: SessionSurfaceEvent[] = [
  { kind: "destination_input", areaText: "京都", surface: "form_input" },
  { kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } },
];
const build = (events: SessionSurfaceEvent[], opt?: { includeExternalLinks?: boolean }) =>
  buildTravelPlanDisplayResult({ events, participantIds: ["P1"], viewerId: "P1" }, GATE, opt);
const ready = (r: TravelPlanDisplayResult) => {
  if (r.status !== "ready") throw new Error(`expected ready, got ${r.status}`);
  return r;
};

describe("1. option 既定 OFF → byte 等価", () => {
  it("option 不在 → externalLinks 不在・従来 display 形（packet/projection/cues のみ）", () => {
    const r = ready(build(READY));
    expect(r.display.externalLinks).toBeUndefined();
    expect(Object.keys(r.display).sort()).toEqual(["cues", "packet", "projection"]);
  });
  it("option false → externalLinks 不在", () => {
    expect(ready(build(READY, { includeExternalLinks: false })).display.externalLinks).toBeUndefined();
  });
  it("2 引数呼び出し（既存 caller）はそのまま valid", () => {
    expect(ready(buildTravelPlanDisplayResult({ events: READY, participantIds: ["P1"], viewerId: "P1" }, GATE)).display.externalLinks).toBeUndefined();
  });
});

describe("2. option true → confirmed shared destination のみ attach", () => {
  it("confirmed shared destination → generated Maps externalLink 1 本", () => {
    const r = ready(build(READY, { includeExternalLinks: true }));
    expect(r.display.externalLinks).toHaveLength(1);
    expect(r.display.externalLinks![0].handoffUrl).toBe(MAPS_SEARCH_HANDOFF_BASE + encodeURIComponent("京都"));
    expect(r.display.externalLinks![0].kind).toBe("external_handoff");
    expect(r.display.externalLinks![0].label).toBe("地図で検索する");
  });
});

describe("3. option true でも非 confirmed-shared は attach しない（field absent）", () => {
  // destination を session_context（normalized・hard-confirm 不可）にすると not_ready になり ready 自体に到達しない。
  // ready に到達しつつ destination が生成不適格なケースは現状の event 種別では作りにくいため、
  // 「ready かつ generated 不能」は extraction/Tier1-C の単体側で網羅済（本 suite は adapter 結線を検証）。
  it("確定日のみ（destination なし）→ not_ready_missing（display も externalLinks も無し）", () => {
    const r = build([{ kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } }], { includeExternalLinks: true });
    expect(r.status).not.toBe("ready");
    expect("display" in r).toBe(false);
  });
});

describe("4. not-ready / unavailable / invalid は externalLinks を運べない（構造）", () => {
  it("not_ready_missing（空入力）→ display なし", () => {
    const r = build([], { includeExternalLinks: true });
    expect(r.status === "not_ready_missing" || r.status === "not_ready_unconfirmed").toBe(true);
    expect("display" in r).toBe(false);
  });
  it("unavailable（payload 不正）→ display なし", () => {
    // @ts-expect-error 不正 payload runtime 防御
    const r = buildTravelPlanDisplayResult(null, GATE, { includeExternalLinks: true });
    expect(r.status).toBe("unavailable");
    expect("display" in r).toBe(false);
  });
  it("invalid（participant 構造違反）→ display なし", () => {
    const r = buildTravelPlanDisplayResult({ events: READY, participantIds: ["P1", "P2", "P3"], viewerId: "P1" }, GATE, { includeExternalLinks: true });
    expect(r.status).toBe("invalid");
    expect("display" in r).toBe(false);
  });
});

describe("5. source-contract（adapter は URL 構築せず helper 委譲・外部なし）", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/travel-plan-display-adapter.ts"), "utf8"));
  it("抽出 + preparation helper を import（委譲）", () => {
    expect(SRC).toContain("extractGeneratedLinkDestination");
    expect(SRC).toContain("prepareTravelExternalLinkHrefModels");
  });
  it("URL 構築 helper を直接 import しない・URL を作らない", () => {
    expect(SRC).not.toContain("buildGeneratedMapsSearchIntent");
    expect(SRC).not.toContain("buildSafeTravelLinkHrefModel");
    expect(SRC).not.toContain("MAPS_SEARCH_HANDOFF_BASE");
    for (const f of ["encodeURIComponent", "new URL(", "fetch(", "googleapis", "places.google"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("env/client flag を読まない", () => {
    expect(SRC).not.toContain("process.env");
    expect(SRC).not.toContain("NEXT_PUBLIC");
  });
  it("M2 runtime / CoAlter / talk / DB / booking なし", () => {
    // ★ UX-6a: 注入 soft personalization の pure enrich（m2-soft-enrichment / merge）は許可。
    //   禁止は M2 **runtime / DB read**（snapshotReader / snapshot 由来 derive を adapter が呼ばない）。
    expect(SRC).not.toMatch(/snapshotReader|getPersonalizationSnapshot|getPairPersonalizationContext|derivePlanParams|deriveTravelTraits/);
    expect(SRC).not.toMatch(/useCoAlter|\/talk/i);
    expect(SRC).not.toMatch(/booking|calendar/i);
  });
});
