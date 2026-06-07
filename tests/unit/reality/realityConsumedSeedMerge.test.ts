/**
 * A1-6-5c Consumed Seed → DraftPlan Merge Skeleton — pure/no-run tests（fake repository・no real DB read）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.8
 *
 * consumed seed を DraftPlan に additive merge（pure・二層分離・consumed のみ）:
 *   consumed→DraftPlanItem（id=opaque handle・origin=seed）/ additive（既存不変）/ date filter / duplicate guard /
 *   active/expired/rejected を誤って混ぜない / output に seedRef/UUID/raw/source_ref を出さない。DB read 0 / write 0。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  consumedSeedToDraftPlanItem,
  mergeConsumedSeedsIntoDraftPlan,
  reflectConsumedSeedsIntoDraftPlan,
  type ReflectableConsumedSeed,
  type ConsumedSeedRepository,
} from "@/lib/plan/reality/consumed-seed-merge";
import type { DraftPlan, DraftPlanItem } from "@/lib/plan/draft-plan";

const HANDLE = "c1:" + "a".repeat(64);

const draftPlan = (over: Partial<DraftPlan> = {}): DraftPlan => ({
  id: "plan-1",
  userId: "user-1",
  date: "2026-06-07",
  level: "candidate",
  items: [],
  generatedAt: "2026-06-07T08:00:00Z",
  generatedBy: "rule",
  basedOn: { anchorIds: [], seedIds: [] },
  status: "pending",
  ...over,
});

const existingItem: DraftPlanItem = {
  id: "anchor-1",
  startTime: "10:00",
  endTime: "11:00",
  title: "既存予定",
  origin: "anchor",
  rigidity: "hard",
  confidence: 1,
};

const seed = (over: Partial<ReflectableConsumedSeed> = {}): ReflectableConsumedSeed => ({
  status: "consumed",
  durationMin: 60,
  date: "2026-06-07",
  band: "afternoon",
  handle: HANDLE,
  ...over,
});

const fakeRepo = (seeds: readonly ReflectableConsumedSeed[]): ConsumedSeedRepository => ({
  async readReflectableConsumedSeeds() {
    return seeds;
  },
});

describe("A1-6-5c consumedSeedToDraftPlanItem — consumed → DraftPlanItem（id=opaque handle・origin=seed）", () => {
  it("consumed → DraftPlanItem（id=handle・HH:MM・generic title・origin seed・rigidity suggestion）", () => {
    expect(consumedSeedToDraftPlanItem(seed({ band: "afternoon", durationMin: 60 }))).toEqual({
      id: HANDLE,
      startTime: "13:00",
      endTime: "14:00",
      title: "午後の予定（60分）",
      origin: "seed",
      rigidity: "suggestion",
      reason: "承認した予定",
      confidence: 0.7,
    });
  });
  it("非 consumed（active/expired/rejected）→ null（誤って item 化しない）", () => {
    for (const status of ["active", "expired", "rejected"] as const) {
      expect(consumedSeedToDraftPlanItem(seed({ status }))).toBeNull();
    }
  });
  it("duration 無 → null", () => {
    expect(consumedSeedToDraftPlanItem(seed({ durationMin: null }))).toBeNull();
  });
});

describe("A1-6-5c mergeConsumedSeedsIntoDraftPlan — additive（既存 DraftPlan を壊さない）", () => {
  it("既存 items 末尾に consumed item を追加・既存 item は不変", () => {
    const base = draftPlan({ items: [existingItem] });
    const merged = mergeConsumedSeedsIntoDraftPlan(base, [seed()]);
    expect(merged.items).toHaveLength(2);
    expect(merged.items[0]).toBe(existingItem); // 既存 item は同一参照（不変）
    expect(merged.items[1].id).toBe(HANDLE);
    expect(merged.items[1].origin).toBe("seed");
  });
  it("id / userId / basedOn / status 等の他 field は不変", () => {
    const base = draftPlan({ items: [existingItem] });
    const merged = mergeConsumedSeedsIntoDraftPlan(base, [seed()]);
    expect(merged.id).toBe(base.id);
    expect(merged.userId).toBe(base.userId);
    expect(merged.basedOn).toEqual({ anchorIds: [], seedIds: [] }); // seedRef を basedOn に足さない
    expect(merged.status).toBe(base.status);
  });
  it("merge 対象なし → 元 DraftPlan を完全不変で返す（同一参照）", () => {
    const base = draftPlan({ items: [existingItem] });
    expect(mergeConsumedSeedsIntoDraftPlan(base, [])).toBe(base);
  });
});

describe("A1-6-5c date filter / duplicate guard / 二層分離", () => {
  it("他日の consumed seed → 除外（混ぜない）", () => {
    const base = draftPlan({ date: "2026-06-07" });
    expect(mergeConsumedSeedsIntoDraftPlan(base, [seed({ date: "2026-06-08" })])).toBe(base);
  });
  it("undated（date null）→ 除外（特定日に置けない）", () => {
    const base = draftPlan({ date: "2026-06-07" });
    expect(mergeConsumedSeedsIntoDraftPlan(base, [seed({ date: null })])).toBe(base);
  });
  it("duplicate guard: 既存 item の id に一致する handle は再追加しない（idempotent）", () => {
    const base = draftPlan({ items: [{ ...existingItem, id: HANDLE }] });
    expect(mergeConsumedSeedsIntoDraftPlan(base, [seed({ handle: HANDLE })])).toBe(base);
  });
  it("混在入力 → consumed のみ item 化（active/expired/rejected 除外＝二層分離）", () => {
    const HANDLE_B = "c1:" + "b".repeat(64);
    const merged = mergeConsumedSeedsIntoDraftPlan(draftPlan(), [
      seed({ status: "active" }), // 候補・surface 側 → 除外
      seed({ status: "consumed", band: "morning", durationMin: 30, handle: HANDLE_B }),
      seed({ status: "rejected" }), // 除外
    ]);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].id).toBe(HANDLE_B);
    expect(merged.items[0].title).toBe("午前の予定（30分）");
  });
});

describe("A1-6-5c reflectConsumedSeedsIntoDraftPlan — repository 注入（read → merge）", () => {
  it("fake repository の consumed seeds を merge", async () => {
    const merged = await reflectConsumedSeedsIntoDraftPlan(draftPlan({ items: [existingItem] }), fakeRepo([seed()]));
    expect(merged.items).toHaveLength(2);
    expect(merged.items[1].id).toBe(HANDLE);
  });
  it("repository が空 → no-op（完全不変）", async () => {
    const base = draftPlan({ items: [existingItem] });
    expect(await reflectConsumedSeedsIntoDraftPlan(base, fakeRepo([]))).toBe(base);
  });
});

describe("A1-6-5c redaction — output に seedRef / UUID / raw / source_ref を出さない", () => {
  it("merge 後の DraftPlan JSON に seedRef/source_ref/raw・UUID 形を含まない（id は opaque handle）", () => {
    const merged = mergeConsumedSeedsIntoDraftPlan(draftPlan({ items: [existingItem] }), [seed()]);
    const json = JSON.stringify(merged);
    for (const leak of ["seedRef", "source_ref", "raw"]) expect(json).not.toContain(leak);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i); // UUID 形なし（handle はダッシュなし）
  });
});

describe("A1-6-5c 静的安全（pure・no-DB・repository 注入のみ）", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/consumed-seed-merge.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  it("DB/Supabase/network/server-only/raw/source_ref/external_anchor/generateComplete を持たない（repository 注入のみ）", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", "fetch(", "Date.now", "server-only", "source_ref", "external_anchor", "generateComplete", "process.env"]) {
      expect(code).not.toContain(t);
    }
  });
  it("barrel(reality/index.ts) が consumed-seed-merge を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/index.ts"), "utf8");
    expect(idx).not.toContain("consumed-seed-merge");
  });
});
