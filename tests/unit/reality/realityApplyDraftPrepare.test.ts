/**
 * A-2 Draft → Real ID Mapping + SourceTrace Injection（pure・no-write）unit。
 *   synthetic `draft:` itemId を real id に置換し auditable provenance を注入。**元 draft 不変・undo 保持・apply しない**。
 *
 * 設計: docs/reality-apply-readiness-audit.md（§3 G1/G2 / §8 A-2）。
 */
import { describe, it, expect } from "vitest";
import { prepareApplyDraft, type IdMintPort } from "@/lib/plan/reality/permission/apply-draft-prepare";
import type { ChangeSet, ChangeOp } from "@/lib/plan/reality/change-set";
import { validateUndoability, invertChangeSet, affectedItemIds } from "@/lib/plan/reality/change-set";
import type { SourceTrace } from "@/lib/plan/reality/source-trace";
import type { PlanItemGovernance } from "@/lib/plan/reality/authority";
import { evaluateApplyPrecondition, worldStateApplySignature } from "@/lib/plan/reality/permission/apply-precondition";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";

const FORBIDDEN = /seed_?ref|utterance|personality|trait|title|location|@[a-z]|\b\d{10,}\b/i;
const PROPOSED: PlanItemGovernance = { origin: "alter_generated", authority: "proposed", flexibility: "droppable", protectionReasons: ["tentative"] };
const cleanTrace: SourceTrace = { kind: "prm", ref: "prm:evening", reason: "夕方は活動が少なめの傾向", confidence: 0.6 };
/** deterministic mint（`draft:` → `real:`・synthetic ごとに一意）。 */
const mint: IdMintPort = { mintRealId: (s) => s.replace(/^draft:/, "real:") };

/** synthetic 2 ブロック add の draft（**sourceTraces 空＝G1 未解消の状態**）。 */
function draftFix(over: { ops?: readonly ChangeOp[] } = {}): ChangeSet {
  const ops: readonly ChangeOp[] = over.ops ?? [
    { kind: "add", itemId: "draft:a", after: { itemId: "draft:a", startMin: 600, endMin: 660, title: "集中の時間", governance: PROPOSED } },
    { kind: "add", itemId: "draft:b", after: { itemId: "draft:b", startMin: 720, endMin: 780, title: "休息", governance: PROPOSED } },
  ];
  return { id: "draft:emptyday:2026-06-20:protect", ops, reason: "空白の日の組み方案（protect）", sourceTraces: [] };
}

describe("A-2 id mapping", () => {
  it("synthetic draft itemId が real id に置換される（op.itemId + snapshot.itemId）", () => {
    const r = prepareApplyDraft({ draft: draftFix(), idMint: mint, provenance: [cleanTrace] });
    expect(r.blockers).toEqual([]);
    expect(r.prepared).not.toBeNull();
    const op0 = r.prepared!.ops[0] as Extract<ChangeOp, { kind: "add" }>;
    expect(op0.itemId).toBe("real:a");
    expect(op0.after.itemId).toBe("real:a");
    expect(r.prepared!.ops.every((o) => !o.itemId.startsWith("draft:"))).toBe(true);
  });
  it("draftToRealIdMap が返る", () => {
    const r = prepareApplyDraft({ draft: draftFix(), idMint: mint, provenance: [cleanTrace] });
    expect(r.draftToRealIdMap).toEqual({ "draft:a": "real:a", "draft:b": "real:b" });
  });
  it("ChangeSet.id は据え置き（idempotency key）", () => {
    const r = prepareApplyDraft({ draft: draftFix(), idMint: mint, provenance: [cleanTrace] });
    expect(r.prepared!.id).toBe("draft:emptyday:2026-06-20:protect");
  });
});

describe("A-2 元 draft を mutation しない", () => {
  it("prepare 後も元 draft の itemId / sourceTraces は不変", () => {
    const d = draftFix();
    prepareApplyDraft({ draft: d, idMint: mint, provenance: [cleanTrace] });
    expect(d.ops[0].itemId).toBe("draft:a");
    expect((d.ops[0] as Extract<ChangeOp, { kind: "add" }>).after.itemId).toBe("draft:a");
    expect(d.sourceTraces).toEqual([]);
  });
});

describe("A-2 sourceTrace 注入（G1 解消）", () => {
  it("auditable provenance が prepared.sourceTraces に注入される", () => {
    const r = prepareApplyDraft({ draft: draftFix(), idMint: mint, provenance: [cleanTrace] });
    expect(r.prepared!.sourceTraces).toEqual([cleanTrace]);
  });
  it("provenance 空 → provenance_missing（blocker・prepared null）", () => {
    const r = prepareApplyDraft({ draft: draftFix(), idMint: mint, provenance: [] });
    expect(r.blockers).toContain("provenance_missing");
    expect(r.prepared).toBeNull();
  });
  it("auditable でない trace（entity kind で ref 欠落）→ drop + 残りなければ provenance_missing", () => {
    const noRef: SourceTrace = { kind: "prm", reason: "ref なし", confidence: 0.5 };
    const r = prepareApplyDraft({ draft: draftFix(), idMint: mint, provenance: [noRef] });
    expect(r.warnings).toContain("trace_dropped_unauditable");
    expect(r.blockers).toContain("provenance_missing");
    expect(r.prepared).toBeNull();
  });
});

describe("A-2 id collision は blocker", () => {
  it("mint が定数を返す（2 synthetic → 同一 real）→ id_collision（prepared null）", () => {
    const collide: IdMintPort = { mintRealId: () => "real:fixed" };
    const r = prepareApplyDraft({ draft: draftFix(), idMint: collide, provenance: [cleanTrace] });
    expect(r.blockers).toContain("id_collision");
    expect(r.prepared).toBeNull();
  });
  it("mint が空文字 → id_mint_failed", () => {
    const empty: IdMintPort = { mintRealId: () => "" };
    const r = prepareApplyDraft({ draft: draftFix(), idMint: empty, provenance: [cleanTrace] });
    expect(r.blockers).toContain("id_mint_failed");
    expect(r.prepared).toBeNull();
  });
});

describe("A-2 undo 可逆性を壊さない", () => {
  it("prepared は validateUndoability ok・invertChangeSet が real id で成立", () => {
    const r = prepareApplyDraft({ draft: draftFix(), idMint: mint, provenance: [cleanTrace] });
    const prepared = r.prepared!;
    expect(validateUndoability(prepared).ok).toBe(true);
    const inv = invertChangeSet(prepared);
    expect(affectedItemIds(inv).every((id) => id.startsWith("real:"))).toBe(true);
    expect(inv.ops.every((o) => o.kind === "remove")).toBe(true); // add の逆 = remove
  });
});

describe("A-2 + A-1 接続（provenance_missing が消える）", () => {
  const ws: WorldState = {
    date: "2026-06-20",
    nowMinute: 540,
    todaySchedule: [],
    availableWindows: [{ startMinute: 540, endMinute: 840, meaning: null }],
    context: null,
    mobility: null,
    permissionLevel: 3,
  };
  it("prepared を A-1 に渡すと provenance_missing が解消（他判定は A-1 が継続）", () => {
    const r = prepareApplyDraft({ draft: draftFix(), idMint: mint, provenance: [cleanTrace] });
    const a1 = evaluateApplyPrecondition({
      draft: r.prepared!,
      liveWorldState: ws,
      level: 3,
      applyAction: "draft",
      flags: [],
      baseVersion: worldStateApplySignature(ws),
      computedAtMs: 1000,
      nowMs: 2000,
      appliedSnapshot: { appliedChangeSetIds: [] },
    });
    expect(a1.blockers).not.toContain("provenance_missing");
    expect(a1.canApply).toBe(true);
  });
});

describe("A-2 redaction — raw/PII を注入しない", () => {
  it("PII を含む provenance → provenance_contains_raw（注入せず prepared null・raw を echo しない）", () => {
    const leaky: SourceTrace = { kind: "environment", reason: "歯医者@shibuya の予定", confidence: 0.5 };
    const r = prepareApplyDraft({ draft: draftFix(), idMint: mint, provenance: [leaky] });
    expect(r.blockers).toContain("provenance_contains_raw");
    expect(r.prepared).toBeNull();
    expect(JSON.stringify(r)).not.toContain("shibuya");
  });
  it("personality/trait/seedRef を含む trace は通さない", () => {
    for (const reason of ["personality が外向", "trait: 神経質", "seedRef=abc"]) {
      const t: SourceTrace = { kind: "environment", reason, confidence: 0.5 };
      const r = prepareApplyDraft({ draft: draftFix(), idMint: mint, provenance: [t] });
      expect(r.blockers).toContain("provenance_contains_raw");
    }
  });
  it("A-2 が注入する部分（sourceTraces + map + blockers）は FORBIDDEN に一致しない", () => {
    // 注: prepared.ops の `title` は upstream の抽象ラベル（KIND_LABEL）で A-2 の責務外。
    //   A-2 が *導入* する sourceTraces / id map / blockers のみを検査する。
    const r = prepareApplyDraft({ draft: draftFix(), idMint: mint, provenance: [cleanTrace] });
    const injected = JSON.stringify({ traces: r.prepared?.sourceTraces, map: r.draftToRealIdMap, blockers: r.blockers, warnings: r.warnings });
    expect(injected).not.toMatch(FORBIDDEN);
  });
});
