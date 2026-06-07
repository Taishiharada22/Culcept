/**
 * A1-6-6 Candidate Action Route Support — pure/no-run tests（fake executor / mock client・no real DB）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.11
 *
 * route core を検証:
 *   runCandidateActionRoute（{ok,data} envelope・accept/dismiss/later・invalid/unresolved/non-active fail-closed・seedRef 非出）/
 *   loadSurfaceableForAction（surface 同一 pipeline で active surfaceable を再 read → SurfaceableCandidate[]）。実 DB 0。
 */
import { describe, it, expect } from "vitest";
import {
  runCandidateActionRoute,
  loadSurfaceableForAction,
} from "@/lib/plan/reality/integration/candidate-action-route-support";
import type { CandidateActionExecutor } from "@/lib/plan/reality/integration/candidate-action-executor";
import type { PendingCapturedRowsReadClient } from "@/lib/plan/reality/integration/morning-capture-surface.server";
import { deriveCandidateHandle } from "@/lib/plan/reality/integration/candidate-action-handle";

const SEED_A = "11111111-1111-4111-8111-111111111111";
const USER = "99999999-9999-4999-8999-999999999999";
const HANDLE_A = deriveCandidateHandle(SEED_A);
const active = (seedRef: string) => ({ seedRef, status: "active" as const });

function fakeExecutor(ok = true) {
  const calls: string[] = [];
  const exec: CandidateActionExecutor = {
    async applyStatusTransition(seedRef, from, to) {
      calls.push(`${from}->${to}:${seedRef}`);
      return { ok };
    },
  };
  return { exec, calls };
}

describe("A1-6-6 runCandidateActionRoute — {ok,data} envelope・fail-closed・seedRef 非出", () => {
  it("accept（surfaceable active）→ ok:true・data.accepted:true・status active→consumed・seedRef 非出", async () => {
    const { exec, calls } = fakeExecutor();
    const res = await runCandidateActionRoute({ handle: HANDLE_A, action: "accept" }, [active(SEED_A)], exec);
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ accepted: true, reason: "ok", reflectsToPlan: true, deferred: false });
    expect(calls).toEqual([`active->consumed:${SEED_A}`]);
    expect(JSON.stringify(res)).not.toContain(SEED_A); // seedRef 非出
    expect(JSON.stringify(res)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
  it("dismiss → status active→rejected・accepted:true・reflectsToPlan:false", async () => {
    const { exec, calls } = fakeExecutor();
    const res = await runCandidateActionRoute({ handle: HANDLE_A, action: "dismiss" }, [active(SEED_A)], exec);
    expect(res.data).toEqual({ accepted: true, reason: "ok", reflectsToPlan: false, deferred: false });
    expect(calls).toEqual([`active->rejected:${SEED_A}`]);
  });
  it("later → executor 呼ばない・deferred:true", async () => {
    const { exec, calls } = fakeExecutor();
    const res = await runCandidateActionRoute({ handle: HANDLE_A, action: "later" }, [active(SEED_A)], exec);
    expect(res.data).toEqual({ accepted: true, reason: "ok", reflectsToPlan: false, deferred: true });
    expect(calls).toEqual([]);
  });
  it("invalid handle → ok:true・accepted:false・invalid_handle（executor 呼ばない・fail-closed）", async () => {
    const { exec, calls } = fakeExecutor();
    const res = await runCandidateActionRoute({ handle: "bad", action: "accept" }, [active(SEED_A)], exec);
    expect(res.ok).toBe(true);
    expect(res.data.accepted).toBe(false);
    expect(res.data.reason).toBe("invalid_handle");
    expect(calls).toEqual([]);
  });
  it("invalid action → accepted:false・invalid_action", async () => {
    const { exec } = fakeExecutor();
    const res = await runCandidateActionRoute({ handle: HANDLE_A, action: "snooze" }, [active(SEED_A)], exec);
    expect(res.data.accepted).toBe(false);
    expect(res.data.reason).toBe("invalid_action");
  });
  it("no candidate（surfaceable 外）→ accepted:false・unresolved（executor 呼ばない）", async () => {
    const { exec, calls } = fakeExecutor();
    const res = await runCandidateActionRoute({ handle: HANDLE_A, action: "accept" }, [], exec);
    expect(res.data.accepted).toBe(false);
    expect(res.data.reason).toBe("unresolved");
    expect(calls).toEqual([]);
  });
  it("non-active surfaceable（consumed）→ accepted:false・not_actionable（executor 呼ばない）", async () => {
    const { exec, calls } = fakeExecutor();
    const res = await runCandidateActionRoute({ handle: HANDLE_A, action: "accept" }, [{ seedRef: SEED_A, status: "consumed" }], exec);
    expect(res.data.accepted).toBe(false);
    expect(res.data.reason).toBe("not_actionable");
    expect(calls).toEqual([]);
  });
  it("status_conflict（executor 0 rows）→ accepted:false・status_conflict", async () => {
    const { exec } = fakeExecutor(false); // 0 rows
    const res = await runCandidateActionRoute({ handle: HANDLE_A, action: "accept" }, [active(SEED_A)], exec);
    expect(res.data.accepted).toBe(false);
    expect(res.data.reason).toBe("status_conflict");
  });
});

describe("A1-6-6 loadSurfaceableForAction — surface 同一 pipeline で active surfaceable を再 read", () => {
  const NOW = 1780000000000;
  type Row = Record<string, unknown>;
  function mockReadClient(byTable: Record<string, Row[]>): PendingCapturedRowsReadClient {
    const client = {
      from(table: string) {
        const chain = {
          eq() { return chain; },
          in() { return chain; },
          or() { return chain; },
          async limit() { return { data: byTable[table] ?? [], error: null }; },
        };
        return { select() { return chain; } };
      },
    };
    return client as unknown as PendingCapturedRowsReadClient;
  }

  it("active・fresh seed → surfaceable candidate（seedRef + active）", async () => {
    const seedRows = [
      { id: SEED_A, user_id: USER, desired_date: null, desired_time_hint: "afternoon", action_shape: "full_go", confidence: 0.9, status: "active", captured_at: new Date(NOW).toISOString(), expires_at: null },
    ];
    const surfaceable = await loadSurfaceableForAction(mockReadClient({ plan_seeds: seedRows, plan_seed_duration_evidences: [] }), USER, NOW);
    expect(surfaceable).toEqual([{ seedRef: SEED_A, status: "active" }]);
  });

  it("seed なし → []（fail-closed: handle 解決不能）", async () => {
    const surfaceable = await loadSurfaceableForAction(mockReadClient({ plan_seeds: [], plan_seed_duration_evidences: [] }), USER, NOW);
    expect(surfaceable).toEqual([]);
  });

  it("stale seed（capture が freshness 窓より古い）→ surfaceable から除外", async () => {
    const oldMs = NOW - 30 * 24 * 60 * 60 * 1000; // 30 日前（14d 窓外）
    const seedRows = [
      { id: SEED_A, user_id: USER, desired_date: null, desired_time_hint: "afternoon", action_shape: "full_go", confidence: 0.9, status: "active", captured_at: new Date(oldMs).toISOString(), expires_at: null },
    ];
    const surfaceable = await loadSurfaceableForAction(mockReadClient({ plan_seeds: seedRows, plan_seed_duration_evidences: [] }), USER, NOW);
    expect(surfaceable).toEqual([]); // stale → drop（active 全件でなく surfaceable のみ）
  });
});
