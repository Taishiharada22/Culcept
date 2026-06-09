/**
 * A-4-a reflectChangeSetIntoDraftPlan（pure・no-write）unit。
 *   prepared ChangeSet の add op → DraftPlanItem を additive merge。**書かない・Plan 本線非接続・元 DraftPlan 不変**。
 *
 * 設計: docs/reality-apply-target-decision-a4-0.md（A-4-a）。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  reflectChangeSetIntoDraftPlan,
  REFLECT_DEFAULT_ORIGIN,
} from "@/lib/plan/reality/permission/reflect-change-set-into-draft-plan";
import type { ChangeSet, ChangeOp } from "@/lib/plan/reality/change-set";
import type { DraftPlan, DraftPlanItem } from "@/lib/plan/draft-plan";
import type { PlanItemGovernance } from "@/lib/plan/reality/authority";

const FORBIDDEN = /seed_?ref|utterance|personality|trait|location|@[a-z]|\b\d{10,}\b/i;
const PROPOSED: PlanItemGovernance = { origin: "alter_generated", authority: "proposed", flexibility: "droppable", protectionReasons: ["tentative"] };

/** real id（A-2 後）の 2 ブロック add ChangeSet。 */
function prepared(over: { ops?: readonly ChangeOp[] } = {}): ChangeSet {
  const ops: readonly ChangeOp[] = over.ops ?? [
    { kind: "add", itemId: "real:a", after: { itemId: "real:a", startMin: 600, endMin: 660, title: "集中の時間", governance: PROPOSED } },
    { kind: "add", itemId: "real:b", after: { itemId: "real:b", startMin: 720, endMin: 780, title: "休息", governance: PROPOSED } },
  ];
  return { id: "draft:emptyday:2026-06-20:protect", ops, reason: "空白の日の組み方案（protect）", sourceTraces: [{ kind: "prm", ref: "prm:1", reason: "観測根拠", confidence: 0.6 }] };
}

function draftPlan(over: { items?: DraftPlanItem[]; date?: string } = {}): DraftPlan {
  return {
    id: "dp:1",
    userId: "u:1",
    date: over.date ?? "2026-06-20",
    level: "candidate",
    items: over.items ?? [],
    generatedAt: "2026-06-20T00:00:00Z",
    generatedBy: "rule",
    basedOn: { anchorIds: [], seedIds: [] },
    status: "pending",
  };
}

const OPTS = { changeSetDate: "2026-06-20" };

describe("A-4-a additive merge / 反映", () => {
  it("add op が DraftPlanItem として反映される（origin=rhythm_inferred・rigidity=suggestion）", () => {
    const r = reflectChangeSetIntoDraftPlan(draftPlan(), prepared(), OPTS);
    expect(r.draftPlan.items.length).toBe(2);
    const it0 = r.draftPlan.items[0];
    expect(it0.origin).toBe(REFLECT_DEFAULT_ORIGIN);
    expect(it0.origin).toBe("rhythm_inferred");
    expect(it0.rigidity).toBe("suggestion");
    expect(it0.title).toBe("集中の時間");
  });
  it("既存 items の末尾に additive 追加（既存を壊さない）", () => {
    const existing: DraftPlanItem = { id: "anchor:x", startTime: "09:00", endTime: "09:30", title: "既存", origin: "anchor", rigidity: "hard", confidence: 1 };
    const r = reflectChangeSetIntoDraftPlan(draftPlan({ items: [existing] }), prepared(), OPTS);
    expect(r.draftPlan.items.length).toBe(3);
    expect(r.draftPlan.items[0]).toBe(existing); // 既存 item は同一参照で先頭に残る
  });
});

describe("A-4-a HH 時刻保持", () => {
  it("startMin/endMin → HH:MM（plan_seeds に寄せて落とさない）", () => {
    const r = reflectChangeSetIntoDraftPlan(draftPlan(), prepared(), OPTS);
    expect(r.draftPlan.items[0].startTime).toBe("10:00"); // 600
    expect(r.draftPlan.items[0].endTime).toBe("11:00"); // 660
    expect(r.draftPlan.items[1].startTime).toBe("12:00"); // 720
    expect(r.draftPlan.items[1].endTime).toBe("13:00"); // 780
  });
  it("時刻なし add は配置不能（missing_time warning・反映しない）", () => {
    const noTime: ChangeOp = { kind: "add", itemId: "real:c", after: { itemId: "real:c", title: "x", governance: PROPOSED } };
    const r = reflectChangeSetIntoDraftPlan(draftPlan(), prepared({ ops: [noTime] }), OPTS);
    expect(r.draftPlan.items.length).toBe(0);
    expect(r.warnings).toContain("missing_time");
  });
});

describe("A-4-a same-day filter", () => {
  it("changeSetDate ≠ draftPlan.date → 何も反映しない（date_mismatch・同一参照）", () => {
    const dp = draftPlan({ date: "2026-06-20" });
    const r = reflectChangeSetIntoDraftPlan(dp, prepared(), { changeSetDate: "2026-06-21" });
    expect(r.draftPlan).toBe(dp); // no-op・同一参照
    expect(r.warnings).toContain("date_mismatch");
  });
});

describe("A-4-a duplicate guard（idempotent）", () => {
  it("既存 id と一致する add は再追加しない（duplicate_id）", () => {
    const existing: DraftPlanItem = { id: "real:a", startTime: "10:00", endTime: "11:00", title: "集中の時間", origin: "rhythm_inferred", rigidity: "suggestion", confidence: 0.3 };
    const r = reflectChangeSetIntoDraftPlan(draftPlan({ items: [existing] }), prepared(), OPTS);
    expect(r.draftPlan.items.filter((i) => i.id === "real:a").length).toBe(1); // 二重にならない
    expect(r.warnings).toContain("duplicate_id");
  });
  it("再実行しても同じ結果（idempotent re-merge）", () => {
    const once = reflectChangeSetIntoDraftPlan(draftPlan(), prepared(), OPTS);
    const twice = reflectChangeSetIntoDraftPlan(once.draftPlan, prepared(), OPTS);
    expect(twice.draftPlan.items.length).toBe(2); // 増えない
    expect(twice.draftPlan).toBe(once.draftPlan); // 反映なし→同一参照
  });
  it("別 id でも同一 time block（開始|終了|title）は二重追加しない（duplicate_slot）", () => {
    const dupSlot: ChangeOp = { kind: "add", itemId: "real:z", after: { itemId: "real:z", startMin: 600, endMin: 660, title: "集中の時間", governance: PROPOSED } };
    const r = reflectChangeSetIntoDraftPlan(draftPlan(), prepared({ ops: [prepared().ops[0], dupSlot] }), OPTS);
    expect(r.draftPlan.items.length).toBe(1); // 同一 slot は 1 つ
    expect(r.warnings).toContain("duplicate_slot");
  });
});

describe("A-4-a no-mutation / real id（undo 互換）", () => {
  it("元 DraftPlan / 元 items を mutation しない", () => {
    const dp = draftPlan();
    const before = dp.items;
    reflectChangeSetIntoDraftPlan(dp, prepared(), OPTS);
    expect(dp.items).toBe(before); // 配列参照不変
    expect(dp.items.length).toBe(0); // 元は空のまま
  });
  it("反映 item.id は prepared の real id（invertChangeSet remove op.itemId と一致＝undo 互換）", () => {
    const r = reflectChangeSetIntoDraftPlan(draftPlan(), prepared(), OPTS);
    expect(r.draftPlan.items.map((i) => i.id)).toEqual(["real:a", "real:b"]);
    expect(r.draftPlan.items.every((i) => i.id.startsWith("real:"))).toBe(true);
  });
});

describe("A-4-a remove/update は unsupported", () => {
  it("remove / update op は反映せず warning", () => {
    const ops: ChangeOp[] = [
      { kind: "remove", itemId: "real:x", before: { itemId: "real:x", startMin: 600, endMin: 660 } },
      { kind: "update", itemId: "real:y", before: { itemId: "real:y", startMin: 600, endMin: 660 }, after: { itemId: "real:y", startMin: 630, endMin: 690 } },
    ];
    const r = reflectChangeSetIntoDraftPlan(draftPlan(), prepared({ ops }), OPTS);
    expect(r.draftPlan.items.length).toBe(0);
    expect(r.warnings).toContain("unsupported_op:remove");
    expect(r.warnings).toContain("unsupported_op:update");
  });
});

describe("A-4-a redaction", () => {
  it("title が raw/PII を含む → generic に落とす（title_redacted・raw を echo しない）", () => {
    const leaky: ChangeOp = { kind: "add", itemId: "real:p", after: { itemId: "real:p", startMin: 600, endMin: 660, title: "歯医者@shibuya 09012345678", governance: PROPOSED } };
    const r = reflectChangeSetIntoDraftPlan(draftPlan(), prepared({ ops: [leaky] }), OPTS);
    expect(r.draftPlan.items[0].title).toBe("自由時間"); // generic fallback
    expect(r.warnings).toContain("title_redacted");
    const json = JSON.stringify(r);
    expect(json).not.toContain("shibuya");
    expect(json).not.toContain("09012345678");
  });
  it("clean な出力は FORBIDDEN に一致しない（reason/warning に raw なし）", () => {
    const r = reflectChangeSetIntoDraftPlan(draftPlan(), prepared(), OPTS);
    expect(JSON.stringify(r)).not.toMatch(FORBIDDEN);
  });
});

describe("A-4-a Plan 本線 / cross-track 不接触（source-contract）", () => {
  const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/permission/reflect-change-set-into-draft-plan.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  it("cross-track 所管ファイル / PlanClient / DB を import・接続しない", () => {
    expect(SRC).not.toContain("consumed-seed-merge");
    expect(SRC).not.toContain("plan-seed-status-executor");
    expect(SRC).not.toContain("PlanClient");
    expect(SRC).not.toContain("supabase");
    expect(SRC).not.toContain("fetch(");
    expect(SRC).not.toMatch(/\.insert\s*\(/);
    expect(SRC).not.toMatch(/\.update\s*\(/);
  });
  it("draft-plan は型のみ consume（type import）", () => {
    expect(SRC).toMatch(/import\s+type\s+\{[^}]*DraftPlan[^}]*\}\s+from\s+"\.\.\/\.\.\/draft-plan"/);
  });
});
