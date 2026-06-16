/**
 * D(C-option) — In-Memory Travel Session Intent Harness tests（contract harness・not real persistence）
 *
 * 設計正本: docs/t11-d-durable-travel-state-persistence-preflight.md（§12）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInMemoryTravelSessionHarness } from "@/lib/shared/travel/travel-session-intent-harness";
import { buildTravelPlanDisplayResult } from "@/lib/shared/travel/travel-plan-display-adapter";
import { buildSafeTravelLinkIntent } from "@/lib/shared/travel/safe-link";
import type { TravelSessionIntentRecordInput } from "@/lib/shared/travel/travel-session-intent-harness-types";
import type { SessionSurfaceEvent } from "@/lib/shared/travel/travel-session-binding-types";

const sharedEvents: SessionSurfaceEvent[] = [
  { kind: "destination_input", areaText: "京都", surface: "form_input" },
  { kind: "selected_plan_window", window: { kind: "single_day", date: "2026-07-01" } },
];
const privateDescriptor: SessionSurfaceEvent = {
  kind: "descriptor_input",
  slotKey: "red_line",
  value: { descriptorKey: "avoid", descriptorValue: "crowd" },
  surface: "form_input",
  visibility: "private",
  participantId: "u1",
};
const baseInput = (over: Partial<TravelSessionIntentRecordInput> = {}): TravelSessionIntentRecordInput => ({
  ownerUserId: "u1",
  events: sharedEvents,
  ...over,
});

describe("1. store / read（shared / private）", () => {
  it("shared intent を保存・server read で取得", () => {
    const h = createInMemoryTravelSessionHarness();
    const r = h.store(baseInput());
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const got = h.getServerInternal(r.record.id);
    expect(got?.events.map((e) => e.kind)).toContain("destination_input");
  });
  it("private red_line は server read に含まれ、display-safe read では除去される", () => {
    const h = createInMemoryTravelSessionHarness();
    const r = h.store(baseInput({ events: [...sharedEvents, privateDescriptor] }));
    if (!r.ok) throw new Error("unreachable");
    const server = h.getServerInternal(r.record.id)!;
    const display = h.getDisplaySafe(r.record.id)!;
    expect(server.events.some((e) => e.kind === "descriptor_input")).toBe(true); // private 含む
    expect(display.events.some((e) => e.kind === "descriptor_input" && e.visibility === "private")).toBe(false); // 除去
  });
});

describe("2. forbidden 形を拒否", () => {
  const reject = (extra: object) => {
    const h = createInMemoryTravelSessionHarness();
    // 不正 forbidden 形を意図注入（extra:object なので型 error は出ず・runtime guard が拒否することを検証）
    return h.store({ ...baseInput(), ...extra } as TravelSessionIntentRecordInput);
  };
  it("authoritative packet 形 → forbidden_field", () => {
    expect(reject({ authoritative: true })).toEqual({ ok: false, error: "forbidden_field" });
  });
  it("raw engine output 形（diagnostics）→ forbidden_field", () => {
    expect(reject({ diagnostics: {} })).toEqual({ ok: false, error: "forbidden_field" });
  });
  it("executionAuthority → forbidden_field", () => {
    expect(reject({ executionAuthority: true })).toEqual({ ok: false, error: "forbidden_field" });
  });
  it("booking/calendar/href → forbidden_field", () => {
    for (const e of [{ booking: 1 }, { calendar: 1 }, { href: "x" }, { generatedUrl: "x" }, { projection: {} }, { cues: [] }]) {
      expect(reject(e)).toEqual({ ok: false, error: "forbidden_field" });
    }
  });
});

describe("3. SafeTravelLinkIntent は inert のまま", () => {
  it("inert safe-link を保存・read 後も inert・href/generatedUrl を付与しない", () => {
    const h = createInMemoryTravelSessionHarness();
    const link = buildSafeTravelLinkIntent({ inertUrl: "https://example.com/x", source: "user_provided", label: "外部で確認する", destinationStatus: "confirmed" })!;
    const r = h.store(baseInput({ safeLinks: [link] }));
    if (!r.ok) throw new Error("unreachable");
    const got = h.getServerInternal(r.record.id)!;
    expect(got.safeLinks[0].inert).toBe(true);
    const json = JSON.stringify(got);
    expect(json).not.toContain("href");
    expect(json).not.toContain("generatedUrl");
  });
  it("inert:true でない safe-link → non_inert_safe_link", () => {
    const h = createInMemoryTravelSessionHarness();
    // @ts-expect-error inert でない link を注入
    expect(h.store(baseInput({ safeLinks: [{ source: "user_provided", label: "x", externalReference: { kind: "url", value: "https://x", inert: false }, eligibility: "eligible", inert: false, actionable: false, rendered: false, fetched: false }] }))).toEqual({ ok: false, error: "non_inert_safe_link" });
  });
});

describe("4. recompute は ephemeral（保存しない）", () => {
  it("注入 recomputeFn で display を recompute・record に display を保存しない", () => {
    const h = createInMemoryTravelSessionHarness();
    const r = h.store(baseInput());
    if (!r.ok) throw new Error("unreachable");
    // 注入: adapter（harness は import しない・test が渡す）
    const out = h.recompute(r.record.id, (intent) =>
      buildTravelPlanDisplayResult({ events: intent.events, participantIds: intent.participantIds, viewerId: intent.participantIds[0] }, { fixtureAllowed: false }),
    );
    expect(out?.status).toBe("ready");
    // ★ 保存 record は events/safeLinks のみ（display/projection を保存していない）
    const stored = h.getServerInternal(r.record.id)!;
    expect(Object.keys(stored).sort()).toEqual(["events", "id", "ownerUserId", "safeLinks"]);
    expect(JSON.stringify(stored)).not.toContain("projection");
  });
});

describe("5. source-contract（harness 純度・not real persistence）", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/travel-session-intent-harness.ts"), "utf8"));
  it("DB/Supabase/fetch/API/process.env/Date.now/Math.random を使わない", () => {
    for (const f of ["supabase", "fetch(", "/api/", "process.env", "Date.now", "Math.random", ".insert(", ".update(", "from("]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("engine/adapter を import しない（recompute は注入）", () => {
    for (const f of ["runTravelPlanEngine", "buildTravelPlanDisplayResult", "getProductionTravelInput", "bindTravelSessionIntake"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("app/UI/M2/CoAlter/talk を import しない", () => {
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/)/i);
    expect(SRC).not.toMatch(/m2|personalization|useCoAlter|\/talk/i);
  });
});
