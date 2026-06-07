/**
 * A1-6-7 Consumed Seed → MorningPlan Reflection — pure/no-run tests（fake seeds / fake repository・no real DB）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.12
 *
 * 検証:
 *   consumedSeedToMorningPlanItem（consumed∧duration>0 のみ PlanItem・active/rejected/expired/duration 欠落は null・id=handle・what=null・seedRef 非出）/
 *   reflectConsumedSeedsIntoMorningPlan（additive・同日のみ・dup guard・no-op 同一参照・consumed のみ item 化）/
 *   loadConsumedReflectedMorningPlan（fake repository read→merge）/
 *   resolveConsumedReflectedMorningPlan（flag off=default → plan 同一参照・read 0・dormant）。実 DB 0。
 */
import { describe, it, expect } from "vitest";
import {
  consumedSeedToMorningPlanItem,
  reflectConsumedSeedsIntoMorningPlan,
  loadConsumedReflectedMorningPlan,
} from "@/lib/plan/reality/consumed-seed-morning-reflection";
import { resolveConsumedReflectedMorningPlan } from "@/lib/plan/reality/integration/morning-consumed-reflection.server";
import type { ReflectableConsumedSeed, ConsumedSeedRepository } from "@/lib/plan/reality/consumed-seed-merge";
import type { PlanSeedStatus } from "@/lib/plan/plan-seed";
import type { MorningPlan, PlanItem } from "@/lib/alter-morning/types";
import { deriveCandidateHandle } from "@/lib/plan/reality/integration/candidate-action-handle";

const DATE = "2099-12-31";
const OTHER_DATE = "2099-12-30";
const SEED_A = "11111111-1111-4111-8111-111111111111";
const SEED_B = "22222222-2222-4222-8222-222222222222";
const USER = "99999999-9999-4999-8999-999999999999";
const HANDLE_A = deriveCandidateHandle(SEED_A);
const HANDLE_B = deriveCandidateHandle(SEED_B);

function consumedSeed(
  handle: string,
  date: string | null,
  over: Partial<ReflectableConsumedSeed> = {}
): ReflectableConsumedSeed {
  return { status: "consumed", durationMin: 60, date, band: "afternoon", handle, ...over };
}

function existingItem(id: string): PlanItem {
  return {
    id,
    kind: "fixed",
    text: "既存の予定",
    what: null,
    durationMin: 60,
    fixedStart: true,
    orderHint: 0,
    sourceTurnIndex: 0,
    completed: false,
  };
}

function makePlan(date: string, items: PlanItem[]): MorningPlan {
  // merge は date + items のみ参照（他 field は spread 保持）。test 用 minimal cast。
  return { date, items } as unknown as MorningPlan;
}

function fakeRepo(seeds: readonly ReflectableConsumedSeed[]): ConsumedSeedRepository {
  return {
    async readReflectableConsumedSeeds() {
      return seeds;
    },
  };
}

describe("A1-6-7 consumedSeedToMorningPlanItem — consumed→PlanItem mapper（guard・display-safe）", () => {
  it("consumed + duration>0 → PlanItem（id=handle・kind=todo・what=null・fixedStart=false・startTime=band 既定）", () => {
    const item = consumedSeedToMorningPlanItem(consumedSeed(HANDLE_A, DATE));
    expect(item).not.toBeNull();
    expect(item!.id).toBe(HANDLE_A); // opaque handle（seedRef でない）
    expect(item!.kind).toBe("todo"); // band-level 柔軟タスク
    expect(item!.what).toBeNull(); // 活動内容は断定しない
    expect(item!.fixedStart).toBe(false); // 明示時刻でない
    expect(item!.completed).toBe(false);
    expect(item!.startTime).toBe("13:00"); // afternoon 既定 780 分
    expect(item!.durationMin).toBe(60);
    expect(item!.text).toContain("予定"); // generic 非断定 label
  });
  it("seedRef を一切含まない（id=handle・JSON 全体に UUID なし）", () => {
    const item = consumedSeedToMorningPlanItem(consumedSeed(HANDLE_A, DATE));
    expect(JSON.stringify(item)).not.toContain(SEED_A);
    expect(JSON.stringify(item)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });
  it("active seed → null（consumed 以外は item 化しない）", () => {
    expect(consumedSeedToMorningPlanItem(consumedSeed(HANDLE_A, DATE, { status: "active" as PlanSeedStatus }))).toBeNull();
  });
  it("rejected seed → null", () => {
    expect(consumedSeedToMorningPlanItem(consumedSeed(HANDLE_A, DATE, { status: "rejected" as PlanSeedStatus }))).toBeNull();
  });
  it("expired seed → null", () => {
    expect(consumedSeedToMorningPlanItem(consumedSeed(HANDLE_A, DATE, { status: "expired" as PlanSeedStatus }))).toBeNull();
  });
  it("duration null → null（確定 item に >0 必須）", () => {
    expect(consumedSeedToMorningPlanItem(consumedSeed(HANDLE_A, DATE, { durationMin: null }))).toBeNull();
  });
  it("duration 0 → null", () => {
    expect(consumedSeedToMorningPlanItem(consumedSeed(HANDLE_A, DATE, { durationMin: 0 }))).toBeNull();
  });
});

describe("A1-6-7 reflectConsumedSeedsIntoMorningPlan — additive merge（同日・dup guard・no-op）", () => {
  it("consumed（同日）→ 既存 items を保持しつつ consumed item を append（additive）", () => {
    const plan = makePlan(DATE, [existingItem("existing-1")]);
    const out = reflectConsumedSeedsIntoMorningPlan(plan, [consumedSeed(HANDLE_A, DATE)]);
    expect(out.items).toHaveLength(2);
    expect(out.items[0].id).toBe("existing-1"); // 既存を壊さない
    expect(out.items[1].id).toBe(HANDLE_A); // consumed を末尾追加
  });
  it("別日 consumed → 除外（同日のみ）", () => {
    const plan = makePlan(DATE, [existingItem("existing-1")]);
    const out = reflectConsumedSeedsIntoMorningPlan(plan, [consumedSeed(HANDLE_A, OTHER_DATE)]);
    expect(out.items).toHaveLength(1);
    expect(out).toBe(plan); // 追加 0 → 同一参照
  });
  it("undated（date=null）consumed → 除外", () => {
    const plan = makePlan(DATE, []);
    const out = reflectConsumedSeedsIntoMorningPlan(plan, [consumedSeed(HANDLE_A, null)]);
    expect(out.items).toHaveLength(0);
  });
  it("handle が既存 item id と重複 → skip（dup guard・冪等）", () => {
    const plan = makePlan(DATE, [existingItem(HANDLE_A)]);
    const out = reflectConsumedSeedsIntoMorningPlan(plan, [consumedSeed(HANDLE_A, DATE)]);
    expect(out.items).toHaveLength(1);
    expect(out).toBe(plan); // 追加 0 → 同一参照
  });
  it("active/rejected/consumed 混在 → consumed のみ item 化", () => {
    const plan = makePlan(DATE, []);
    const out = reflectConsumedSeedsIntoMorningPlan(plan, [
      consumedSeed(HANDLE_A, DATE, { status: "active" as PlanSeedStatus }),
      consumedSeed(HANDLE_B, DATE), // consumed
    ]);
    expect(out.items).toHaveLength(1);
    expect(out.items[0].id).toBe(HANDLE_B);
  });
  it("追加 0（consumed なし）→ 同一参照（no-op）", () => {
    const plan = makePlan(DATE, [existingItem("existing-1")]);
    const out = reflectConsumedSeedsIntoMorningPlan(plan, []);
    expect(out).toBe(plan);
  });
  it("merge 結果に seedRef を含まない", () => {
    const plan = makePlan(DATE, [existingItem("existing-1")]);
    const out = reflectConsumedSeedsIntoMorningPlan(plan, [consumedSeed(HANDLE_A, DATE)]);
    expect(JSON.stringify(out)).not.toContain(SEED_A);
  });
});

describe("A1-6-7 loadConsumedReflectedMorningPlan — composer（fake repository）", () => {
  it("repository read → 同日 consumed を merge", async () => {
    const plan = makePlan(DATE, [existingItem("existing-1")]);
    const out = await loadConsumedReflectedMorningPlan(plan, fakeRepo([consumedSeed(HANDLE_A, DATE)]));
    expect(out.items).toHaveLength(2);
    expect(out.items[1].id).toBe(HANDLE_A);
  });
  it("repository empty → plan 不変（同一参照）", async () => {
    const plan = makePlan(DATE, [existingItem("existing-1")]);
    const out = await loadConsumedReflectedMorningPlan(plan, fakeRepo([]));
    expect(out).toBe(plan);
  });
});

describe("A1-6-7 resolveConsumedReflectedMorningPlan — flag-gated route support（default off=dormant）", () => {
  it("flag off（default）→ plan 同一参照（read 0・本番デフォルト）", async () => {
    const plan = makePlan(DATE, [existingItem("existing-1")]);
    // REALITY_CONSUMED_REFLECTION 未設定 → flag off → reader を呼ばず plan を返す（dummy client は使われない）
    const out = await resolveConsumedReflectedMorningPlan(plan, {} as never, USER);
    expect(out).toBe(plan);
  });
  it("plan null → null（read 0）", async () => {
    const out = await resolveConsumedReflectedMorningPlan(null, {} as never, USER);
    expect(out).toBeNull();
  });
});
