/**
 * D — In-Memory Travel Session Repository Contract Harness tests（pure・DB なし）
 *
 * 設計正本: docs/t11-sql-rls-durable-travel-state-design.md（§15 + CEO 命名補正）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInMemoryTravelSessionRepositoryHarness } from "@/lib/shared/travel/travel-session-repository-harness";
import type { TravelSessionPersistenceWriteInput } from "@/lib/shared/travel/travel-session-persistence-types";

const strip = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/travel-session-repository-harness.ts"), "utf8"));

const writeInput = (over: Partial<TravelSessionPersistenceWriteInput> = {}): TravelSessionPersistenceWriteInput => ({
  ownerUserId: "u1",
  status: "draft",
  visibility: "shared",
  inputs: [
    {
      slotKey: "destination_area",
      value: { areaText: "京都" },
      slotStatus: "confirmed",
      fillState: "filled",
      owner: { kind: "shared" },
      visibility: "shared",
      provenance: { refIds: ["form:1"] },
    },
  ],
  links: [
    {
      source: "user_provided",
      externalReference: "https://a.com/1",
      generated: false,
      inert: true,
      eligibility: "eligible",
      visibility: "shared",
      provenance: { refIds: [] },
      renderable: true,
    },
  ],
  ...over,
});

describe("1. save/load roundtrip（許可 bundle のみ）", () => {
  it("valid bundle を save → load で同一 bundle（session/inputs/links のみ）", async () => {
    const repo = createInMemoryTravelSessionRepositoryHarness();
    const saved = await repo.saveTravelSessionIntent(writeInput());
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error("expected ok");
    const loaded = await repo.loadTravelSessionIntent(saved.bundle.session.id, "u1");
    expect(loaded).not.toBeNull();
    expect(Object.keys(loaded!).sort()).toEqual(["inputs", "links", "session"]);
    expect(loaded!.inputs[0].sessionId).toBe(saved.bundle.session.id);
    expect(loaded!.links[0].externalReference).toBe("https://a.com/1");
  });
  it("missing session → null", async () => {
    const repo = createInMemoryTravelSessionRepositoryHarness();
    expect(await repo.loadTravelSessionIntent("nope", "u1")).toBeNull();
  });
  it("owner 不一致 → null", async () => {
    const repo = createInMemoryTravelSessionRepositoryHarness();
    const saved = await repo.saveTravelSessionIntent(writeInput({ ownerUserId: "owner-a" }));
    if (!saved.ok) throw new Error("expected ok");
    expect(await repo.loadTravelSessionIntent(saved.bundle.session.id, "owner-b")).toBeNull();
    expect(await repo.loadTravelSessionIntent(saved.bundle.session.id, "owner-a")).not.toBeNull();
  });
  it("list は owner 所有のみ返す", async () => {
    const repo = createInMemoryTravelSessionRepositoryHarness();
    await repo.saveTravelSessionIntent(writeInput({ ownerUserId: "a" }));
    await repo.saveTravelSessionIntent(writeInput({ ownerUserId: "a" }));
    await repo.saveTravelSessionIntent(writeInput({ ownerUserId: "b" }));
    expect((await repo.listTravelSessionIntents("a")).length).toBe(2);
    expect((await repo.listTravelSessionIntents("b")).length).toBe(1);
    expect((await repo.listTravelSessionIntents("c")).length).toBe(0);
  });
  it("delete は owner gate（不一致は ok:false・一致で削除）", async () => {
    const repo = createInMemoryTravelSessionRepositoryHarness();
    const saved = await repo.saveTravelSessionIntent(writeInput({ ownerUserId: "a" }));
    if (!saved.ok) throw new Error("expected ok");
    expect((await repo.deleteTravelSessionIntent(saved.bundle.session.id, "b")).ok).toBe(false);
    expect((await repo.deleteTravelSessionIntent(saved.bundle.session.id, "a")).ok).toBe(true);
    expect(await repo.loadTravelSessionIntent(saved.bundle.session.id, "a")).toBeNull();
  });
});

describe("2. link は inert のまま・forbidden 付与なし", () => {
  it("link は save/load 後も inert・href/generatedUrl/availability/price を得ない", async () => {
    const repo = createInMemoryTravelSessionRepositoryHarness();
    const saved = await repo.saveTravelSessionIntent(writeInput());
    if (!saved.ok) throw new Error("expected ok");
    const loaded = await repo.loadTravelSessionIntent(saved.bundle.session.id, "u1");
    const link = loaded!.links[0];
    expect(link.inert).toBe(true);
    expect(link.generated).toBe(false);
    const json = JSON.stringify(loaded);
    for (const f of ['"href"', "generatedUrl", "fetched", "preview", "livePrice", "availability"]) {
      expect(json).not.toContain(f);
    }
  });
  it("display/projection/cues/authoritative/diagnostics は保存されない", async () => {
    const repo = createInMemoryTravelSessionRepositoryHarness();
    const saved = await repo.saveTravelSessionIntent(writeInput());
    if (!saved.ok) throw new Error("expected ok");
    const json = JSON.stringify(await repo.loadTravelSessionIntent(saved.bundle.session.id, "u1"));
    for (const f of ["projection", "cues", "packet", "authoritative", "executionAuthority", "diagnostics"]) {
      expect(json).not.toContain(f);
    }
  });
});

describe("3. forbidden 入力を reject", () => {
  it("forbidden field（authoritative/booking/href 等）を含む入力 → forbidden_field", async () => {
    const repo = createInMemoryTravelSessionRepositoryHarness();
    const bad = writeInput();
    // @ts-expect-error 不正な forbidden field を注入（runtime guard 検証）
    bad.links[0].href = "https://x";
    const r = await repo.saveTravelSessionIntent(bad);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected reject");
    expect(r.error).toBe("forbidden_field");
    expect(repo.size()).toBe(0); // 保存されない
  });
  it("booking field を含む入力 → forbidden_field", async () => {
    const repo = createInMemoryTravelSessionRepositoryHarness();
    const bad = writeInput();
    // @ts-expect-error booking を注入
    bad.inputs[0].booking = { when: "x" };
    expect((await repo.saveTravelSessionIntent(bad)).ok).toBe(false);
  });
  it("inert でない link → non_inert_link", async () => {
    const repo = createInMemoryTravelSessionRepositoryHarness();
    const bad = writeInput();
    // @ts-expect-error inert:false を注入
    bad.links[0].inert = false;
    const r = await repo.saveTravelSessionIntent(bad);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected reject");
    expect(r.error).toBe("non_inert_link");
  });
  it("非 object 入力 → invalid_input", async () => {
    const repo = createInMemoryTravelSessionRepositoryHarness();
    // @ts-expect-error 非 object
    expect((await repo.saveTravelSessionIntent(null)).ok).toBe(false);
  });
});

describe("4. 入力非破壊 / deterministic", () => {
  it("入力 write input を mutate しない", async () => {
    const repo = createInMemoryTravelSessionRepositoryHarness();
    const input = writeInput();
    const before = JSON.stringify(input);
    await repo.saveTravelSessionIntent(input);
    expect(JSON.stringify(input)).toBe(before); // 不変（sessionId は stored 側にのみ付与）
    expect(input.inputs[0]).not.toHaveProperty("sessionId");
  });
  it("注入 clock を使う（Date.now を使わない）", async () => {
    const repo = createInMemoryTravelSessionRepositoryHarness({ now: () => "2026-07-01T00:00:00.000Z" });
    const saved = await repo.saveTravelSessionIntent(writeInput());
    if (!saved.ok) throw new Error("expected ok");
    expect(saved.bundle.session.createdAt).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("5. source-contract（pure・DB/SQL/外部なし）", () => {
  it("contract を実装（save/load/list/delete）", () => {
    expect(SRC).toContain("saveTravelSessionIntent");
    expect(SRC).toContain("loadTravelSessionIntent");
    expect(SRC).toContain("listTravelSessionIntents");
    expect(SRC).toContain("deleteTravelSessionIntent");
    expect(SRC).toContain("new Map");
  });
  it("DB/Supabase/SQL/service_role/fetch/env/Date.now/Math.random を使わない", () => {
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/service_role|serviceRole/);
    expect(SRC).not.toMatch(/createClient|\.from\(|\.insert\(|\.rpc\(/);
    expect(SRC).not.toMatch(/\bfetch\(/);
    expect(SRC).not.toContain("process.env");
    expect(SRC).not.toContain("Date.now");
    expect(SRC).not.toContain("Math.random");
  });
  it("app/UI/engine/projection/M2/CoAlter/talk を import しない・display を生成しない", () => {
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/)/);
    expect(SRC).not.toContain("runTravelPlanEngine");
    expect(SRC).not.toContain("buildPlanIntelligenceProjection");
    expect(SRC).not.toContain("buildGeneratedMapsSearchIntent");
    expect(SRC).not.toMatch(/useCoAlter|\/talk|coalter/i);
    expect(SRC).not.toMatch(/\bm2\b/i);
  });
});
