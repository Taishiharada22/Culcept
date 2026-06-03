import { describe, it, expect, vi } from "vitest";

import {
  runComposeSave,
  type ComposeSaveDeps,
  type ComposeSaveGuard,
} from "@/lib/plan/compose/composeSaveRunner";
import type { ComposeDraftState } from "@/lib/plan/compose/composeDraft";

const DATE = "2026-06-03";

function placedDraft(id: string, editingAnchorId?: string): ComposeDraftState {
  const d: ComposeDraftState = {
    id,
    core: { title: "テスト予定", locationText: "渋谷オフィス", rigidity: "soft" },
    time: { mode: "both", startMin: 540, endMin: 600 },
    placement: {
      status: "placed",
      startMin: 540,
      endMin: 600,
      crossesMidnight: false,
      edgeClamped: false,
    },
  };
  if (editingAnchorId) d.editingAnchorId = editingAnchorId;
  return d;
}

function makeGuard(): ComposeSaveGuard {
  let inFlight = false;
  return {
    isInFlight: () => inFlight,
    setInFlight: (v) => {
      inFlight = v;
    },
  };
}

const okUpdate = () => vi.fn(async () => ({ ok: true }));
const okCreate = () => vi.fn(async () => ({ ok: true }));

describe("composeSaveRunner — double-submit guard（GPT 必須テスト）", () => {
  it("1. 同時2回呼んでも createAnchorBundle は1回だけ（in-flight ガード）", async () => {
    const create = vi.fn(async () => {
      await Promise.resolve();
      return { ok: true };
    });
    const deps: ComposeSaveDeps = { updateAnchor: okUpdate(), createAnchorBundle: create };
    const guard = makeGuard();
    const drafts = [placedDraft("d1")];
    const p1 = runComposeSave(drafts, DATE, deps, guard); // 1回目
    const p2 = runComposeSave(drafts, DATE, deps, guard); // 同tick の2回目
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(create).toHaveBeenCalledTimes(1); // ★ POST は1回だけ
    expect([r1.status, r2.status].sort()).toEqual(["busy", "saved"]);
  });

  it("3. 保存成功後はガード解除され、次の保存が可能", async () => {
    const create = okCreate();
    const deps: ComposeSaveDeps = { updateAnchor: okUpdate(), createAnchorBundle: create };
    const guard = makeGuard();
    const drafts = [placedDraft("d1")];
    await runComposeSave(drafts, DATE, deps, guard);
    await runComposeSave(drafts, DATE, deps, guard); // 逐次（待ってから）→ 通る
    expect(create).toHaveBeenCalledTimes(2);
    expect(guard.isInFlight()).toBe(false); // 解除済み
  });

  it("4. 保存失敗後もガード解除され、再試行可能", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "x" })
      .mockResolvedValueOnce({ ok: true });
    const deps: ComposeSaveDeps = { updateAnchor: okUpdate(), createAnchorBundle: create };
    const guard = makeGuard();
    const drafts = [placedDraft("d1")];
    const r1 = await runComposeSave(drafts, DATE, deps, guard);
    expect(r1.status).toBe("error");
    expect(guard.isInFlight()).toBe(false); // 失敗でも解除
    const r2 = await runComposeSave(drafts, DATE, deps, guard);
    expect(r2.status).toBe("saved");
  });

  it("5. edit mode（editingAnchorId）は PATCH のみ・POST を呼ばない", async () => {
    const update = okUpdate();
    const create = okCreate();
    const deps: ComposeSaveDeps = { updateAnchor: update, createAnchorBundle: create };
    const r = await runComposeSave([placedDraft("e1", "anchor-1")], DATE, deps, makeGuard());
    expect(r.status).toBe("saved");
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("anchor-1", expect.anything());
    expect(create).not.toHaveBeenCalled(); // ★ POST しない
  });

  it("6. create mode（新規）は POST のみ・PATCH を呼ばない", async () => {
    const update = okUpdate();
    const create = okCreate();
    const deps: ComposeSaveDeps = { updateAnchor: update, createAnchorBundle: create };
    const r = await runComposeSave([placedDraft("n1")], DATE, deps, makeGuard());
    expect(r.status).toBe("saved");
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled(); // ★ PATCH しない
  });

  it("配置なし → nothing（POST/PATCH を呼ばない）", async () => {
    const update = okUpdate();
    const create = okCreate();
    const deps: ComposeSaveDeps = { updateAnchor: update, createAnchorBundle: create };
    const r = await runComposeSave([], DATE, deps, makeGuard());
    expect(r.status).toBe("nothing");
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("edit + new 混在 → PATCH と POST が1回ずつ（重複なし）", async () => {
    const update = okUpdate();
    const create = okCreate();
    const deps: ComposeSaveDeps = { updateAnchor: update, createAnchorBundle: create };
    const r = await runComposeSave(
      [placedDraft("e1", "anchor-1"), placedDraft("n1")],
      DATE,
      deps,
      makeGuard(),
    );
    expect(r.status).toBe("saved");
    expect(update).toHaveBeenCalledTimes(1); // 編集1件 PATCH
    expect(create).toHaveBeenCalledTimes(1); // 新規1件 POST（1 bundle）
  });
});
