/**
 * A-4-b Display-apply Reflection Preview Harness（pure・fixture・no-write）unit。
 *   R5-2 draft → A-2 prepare → A-1 precondition → A-4-a reflect の **full pure chain** を fixture で通す。
 *   **apply/write/persist なし**・Plan 本線非接続・未反映時は入力 DraftPlan 同一参照。
 *
 * 設計: docs/reality-apply-target-decision-a4-0.md（A-4-b）。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { buildReflectionPreview, type ReflectionPreviewInput } from "@/lib/plan/reality/permission/display-apply-preview";
import { proposalToChangeSetDraft } from "@/lib/plan/reality/permission/changeset-draft";
import { worldStateApplySignature } from "@/lib/plan/reality/permission/apply-precondition";
import type { IdMintPort } from "@/lib/plan/reality/permission/apply-draft-prepare";
import type { ChangeSet } from "@/lib/plan/reality/change-set";
import type { EmptyDayProposal } from "@/lib/plan/reality/empty-day/empty-day-generator";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";
import type { DraftPlan, DraftPlanItem } from "@/lib/plan/draft-plan";
import type { SourceTrace } from "@/lib/plan/reality/source-trace";

// `title` は DraftPlanItem の正当な field 名ゆえ除外（値の abstract 性は個別 assert）。
const FORBIDDEN = /seed_?ref|utterance|personality|trait|location|@[a-z]|\b\d{10,}\b/i;
// summary は DraftPlan を含まない＝`title` という語も出てはならない（より厳格）。
const SUMMARY_FORBIDDEN = /seed_?ref|utterance|personality|trait|title|location|@[a-z]|\b\d{10,}\b/i;

const DATE = "2026-06-20";
const cleanTrace: SourceTrace = { kind: "prm", ref: "prm:evening", reason: "夕方は活動が少なめの傾向", confidence: 0.6 };
const mint: IdMintPort = { mintRealId: (s) => s.replace(/^draft:/, "display:") };

/** R5-2 実物 mapper で作る draft（synthetic id・sourceTraces 空＝pipeline が出す形そのもの）。 */
function r52Draft(): ChangeSet {
  const proposal = {
    tier: "protect",
    activeMinutes: 120,
    restMinutes: 180,
    strain: "low",
    blocks: [
      { kind: "focus_work", startMinute: 600, endMinute: 660 },
      { kind: "recovery", startMinute: 720, endMinute: 780 },
    ],
  } as unknown as EmptyDayProposal;
  return proposalToChangeSetDraft(proposal, DATE);
}

function ws(): WorldState {
  return {
    date: DATE,
    nowMinute: 540,
    todaySchedule: [],
    availableWindows: [{ startMinute: 540, endMinute: 840, meaning: null }],
    context: null,
    mobility: null,
    permissionLevel: 3,
  };
}

function draftPlan(items: DraftPlanItem[] = []): DraftPlan {
  return {
    id: "dp:1",
    userId: "u:1",
    date: DATE,
    level: "candidate",
    items,
    generatedAt: "2026-06-20T00:00:00Z",
    generatedBy: "rule",
    basedOn: { anchorIds: [], seedIds: [] },
    status: "pending",
  };
}

/** 完全に安全な chain 入力（draft@level3・fresh・no-conflict・provenance・snapshot）。 */
function safeInput(over: Partial<ReflectionPreviewInput> = {}): ReflectionPreviewInput {
  const world = over.liveWorldState ?? ws();
  return {
    draft: r52Draft(),
    draftPlan: draftPlan(),
    liveWorldState: world,
    idMint: mint,
    provenance: [cleanTrace],
    level: 3,
    applyAction: "draft",
    flags: [],
    baseVersion: worldStateApplySignature(world),
    computedAtMs: 1_000_000,
    nowMs: 1_001_000,
    appliedSnapshot: { appliedChangeSetIds: [] },
    changeSetDate: DATE,
    ...over,
  };
}

describe("A-4-b full pure chain（safe fixture succeeds）", () => {
  it("R5-2 draft → prepare → precondition(can_apply) → reflect → DraftPlan preview", () => {
    const r = buildReflectionPreview(safeInput());
    expect(r.reflected).toBe(true);
    expect(r.summary.stage).toBe("done");
    expect(r.summary.preconditionVerdict).toBe("can_apply");
    expect(r.summary.reflectedItemCount).toBe(2);
    expect(r.draftPlan.items.length).toBe(2);
  });
  it("反映 item は display id（mint 結果）+ origin/rigidity が A-4-a 既定", () => {
    const r = buildReflectionPreview(safeInput());
    expect(r.draftPlan.items.every((i) => i.id.startsWith("display:emptyday:"))).toBe(true);
    expect(r.draftPlan.items.every((i) => i.origin === "rhythm_inferred" && i.rigidity === "suggestion")).toBe(true);
  });
});

describe("A-4-b HH:MM preservation", () => {
  it("reflected DraftPlanItem が exact time を保持（600→10:00 / 780→13:00）", () => {
    const r = buildReflectionPreview(safeInput());
    expect(r.draftPlan.items[0].startTime).toBe("10:00");
    expect(r.draftPlan.items[0].endTime).toBe("11:00");
    expect(r.draftPlan.items[1].startTime).toBe("12:00");
    expect(r.draftPlan.items[1].endTime).toBe("13:00");
  });
});

describe("A-4-b A-1 blocker handling（can_apply でなければ reflect しない）", () => {
  it("level2（permission_blocked）→ 反映 0・blockers summary のみ・DraftPlan 同一参照", () => {
    const dp = draftPlan();
    const r = buildReflectionPreview(safeInput({ draftPlan: dp, level: 2, applyAction: "adjust_plan" }));
    expect(r.reflected).toBe(false);
    expect(r.summary.stage).toBe("precondition");
    expect(r.summary.preconditionBlockers).toContain("permission_blocked");
    expect(r.draftPlan).toBe(dp); // 同一参照（preview 不変）
    expect(r.summary.reflectedItemCount).toBe(0);
  });
  it("stale（baseVersion 不一致）→ verdict=stale・reflect しない", () => {
    const r = buildReflectionPreview(safeInput({ baseVersion: "STALE|s=|w=" }));
    expect(r.reflected).toBe(false);
    expect(r.summary.preconditionVerdict).toBe("stale");
  });
  it("high risk（book+confirms_booking@level5）→ confirm_required・reflect しない", () => {
    const r = buildReflectionPreview(safeInput({ applyAction: "book", flags: ["confirms_booking"], level: 5 }));
    expect(r.reflected).toBe(false);
    expect(r.summary.preconditionVerdict).toBe("confirm_required");
  });
});

describe("A-4-b A-2 blocker handling（prepare 失敗なら reflect しない）", () => {
  it("provenance 空 → stage=prepare・provenance_missing・preconditionVerdict=null・同一参照", () => {
    const dp = draftPlan();
    const r = buildReflectionPreview(safeInput({ draftPlan: dp, provenance: [] }));
    expect(r.reflected).toBe(false);
    expect(r.summary.stage).toBe("prepare");
    expect(r.summary.prepareBlockers).toContain("provenance_missing");
    expect(r.summary.preconditionVerdict).toBeNull();
    expect(r.draftPlan).toBe(dp);
  });
  it("raw 入り provenance → provenance_contains_raw・reflect しない・raw を echo しない", () => {
    const leaky: SourceTrace = { kind: "environment", reason: "歯医者@shibuya の予定", confidence: 0.5 };
    const r = buildReflectionPreview(safeInput({ provenance: [leaky] }));
    expect(r.reflected).toBe(false);
    expect(r.summary.prepareBlockers).toContain("provenance_contains_raw");
    expect(JSON.stringify(r)).not.toContain("shibuya");
  });
});

describe("A-4-b duplicate/idempotent preview", () => {
  it("同じ draft を再反映しても増えない（再実行は reflected=false・同一参照）", () => {
    const once = buildReflectionPreview(safeInput());
    const twice = buildReflectionPreview(safeInput({ draftPlan: once.draftPlan }));
    expect(twice.reflected).toBe(false);
    expect(twice.summary.stage).toBe("reflect");
    expect(twice.draftPlan.items.length).toBe(2); // 増えない
    expect(twice.draftPlan).toBe(once.draftPlan); // 同一参照
    expect(twice.summary.warnings).toContain("duplicate_id");
  });
});

describe("A-4-b redaction", () => {
  it("full result が FORBIDDEN に一致しない・title 値は abstract label のみ", () => {
    const r = buildReflectionPreview(safeInput());
    expect(JSON.stringify(r)).not.toMatch(FORBIDDEN);
    expect(r.draftPlan.items.map((i) => i.title)).toEqual(["集中の時間", "休息"]);
  });
  it("summary は安定コードのみ（SUMMARY_FORBIDDEN 不一致）", () => {
    for (const input of [safeInput(), safeInput({ provenance: [] }), safeInput({ level: 2 as const, applyAction: "adjust_plan" as const })]) {
      expect(JSON.stringify(buildReflectionPreview(input).summary)).not.toMatch(SUMMARY_FORBIDDEN);
    }
  });
});

describe("A-4-b source-contract（no-write / no cross-track）", () => {
  const SRC = fs
    .readFileSync(path.join(process.cwd(), "lib/plan/reality/permission/display-apply-preview.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  it("Supabase/fetch/insert/update/delete/upsert/PlanClient/server-only を持たない", () => {
    for (const banned of ["supabase", "fetch(", "PlanClient", "server-only", ".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(SRC).not.toContain(banned);
    }
  });
  it("cross-track（consumed-seed-merge / plan-seed-status-executor / capture RPC）を import しない", () => {
    expect(SRC).not.toContain("consumed-seed-merge");
    expect(SRC).not.toContain("plan-seed-status-executor");
    expect(SRC).not.toContain("capture_bundle");
  });
  it("draft-plan は型のみ consume（import type）", () => {
    expect(SRC).toMatch(/import\s+type\s+\{[^}]*DraftPlan[^}]*\}\s+from\s+"\.\.\/\.\.\/draft-plan"/);
  });
});
