/**
 * A1-6-4 Candidate Action Executor / Route Contract Skeleton — pure/no-run tests（fake executor・no real DB）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.4
 *
 * operation plan（A1-6-3）を fake executor で実行し semantics を検証:
 *   accept=reflection→status の順・fail-stop（reflection 失敗→status しない）・status_conflict（from=active guard）/
 *   dismiss=status のみ / later=no-op / 非 active・unresolved=fail-closed（executor 呼ばない）/ response redacted（seedRef 非出）。
 *   request は {handle, action} のみ。DB write 0 / execution 0（executor は fake）。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  executeCandidateOperationPlan,
  handleCandidateActionRequest,
  type CandidateActionExecutor,
} from "@/lib/plan/reality/integration/candidate-action-executor";
import type { CandidateOperationPlan } from "@/lib/plan/reality/candidate-action-orchestrator";
import { deriveCandidateHandle } from "@/lib/plan/reality/integration/candidate-action-handle";

const SEED_A = "11111111-1111-4111-8111-111111111111";
const HANDLE_A = deriveCandidateHandle(SEED_A);
const active = (seedRef: string) => ({ seedRef, status: "active" as const });

/** fake executor: call 順を記録 + ok を simulate（real DB なし）。 */
function fakeExecutor(opts: { reflection?: boolean; status?: boolean } = {}) {
  const calls: string[] = [];
  const exec: CandidateActionExecutor = {
    async applyPlanReflection(seedRef) {
      calls.push(`reflection:${seedRef}`);
      return { ok: opts.reflection ?? true };
    },
    async applyStatusTransition(seedRef, from, to) {
      calls.push(`status:${from}->${to}:${seedRef}`);
      return { ok: opts.status ?? true };
    },
  };
  return { exec, calls };
}

const acceptReq = { handle: HANDLE_A, action: "accept" };
const dismissReq = { handle: HANDLE_A, action: "dismiss" };
const laterReq = { handle: HANDLE_A, action: "later" };

describe("A1-6-4 handleCandidateActionRequest — accept（reflection→status の順・成功）", () => {
  it("accept 全 step ok → accepted・reflectsToPlan・reflection が status より先", async () => {
    const { exec, calls } = fakeExecutor();
    const res = await handleCandidateActionRequest(acceptReq, [active(SEED_A)], exec);
    expect(res).toEqual({ accepted: true, reason: "ok", reflectsToPlan: true, deferred: false });
    expect(calls).toEqual([`reflection:${SEED_A}`, `status:active->consumed:${SEED_A}`]); // 順序: reflection 先
  });
});

describe("A1-6-4 fail-stop — reflection 失敗時に status transition しない", () => {
  it("reflection ok=false → reflection_failed・status 未 call（停止）・seed consume されない", async () => {
    const { exec, calls } = fakeExecutor({ reflection: false });
    const res = await handleCandidateActionRequest(acceptReq, [active(SEED_A)], exec);
    expect(res).toEqual({ accepted: false, reason: "reflection_failed", reflectsToPlan: false, deferred: false });
    expect(calls).toEqual([`reflection:${SEED_A}`]); // status は呼ばれない（fail-stop）
  });
});

describe("A1-6-4 status_conflict — from=active guard（duplicate submit / 並行 consume）", () => {
  it("reflection ok・status ok=false（0 rows）→ status_conflict・reflectsToPlan true", async () => {
    const { exec, calls } = fakeExecutor({ status: false });
    const res = await handleCandidateActionRequest(acceptReq, [active(SEED_A)], exec);
    expect(res).toEqual({ accepted: false, reason: "status_conflict", reflectsToPlan: true, deferred: false });
    expect(calls).toEqual([`reflection:${SEED_A}`, `status:active->consumed:${SEED_A}`]);
  });
});

describe("A1-6-4 dismiss / later", () => {
  it("dismiss → status(active→rejected) のみ・reflection なし・accepted", async () => {
    const { exec, calls } = fakeExecutor();
    const res = await handleCandidateActionRequest(dismissReq, [active(SEED_A)], exec);
    expect(res).toEqual({ accepted: true, reason: "ok", reflectsToPlan: false, deferred: false });
    expect(calls).toEqual([`status:active->rejected:${SEED_A}`]);
  });
  it("later → executor 呼ばない（no-op）・deferred", async () => {
    const { exec, calls } = fakeExecutor();
    const res = await handleCandidateActionRequest(laterReq, [active(SEED_A)], exec);
    expect(res).toEqual({ accepted: true, reason: "ok", reflectsToPlan: false, deferred: true });
    expect(calls).toEqual([]);
  });
});

describe("A1-6-4 fail-closed — 非 active / unresolved / malformed は executor を呼ばない", () => {
  it("unresolved（surfaceable 外）→ executor 呼ばず unresolved", async () => {
    const { exec, calls } = fakeExecutor();
    const res = await handleCandidateActionRequest(acceptReq, [], exec);
    expect(res).toEqual({ accepted: false, reason: "unresolved", reflectsToPlan: false, deferred: false });
    expect(calls).toEqual([]);
  });
  it("非 active surfaceable（consumed＝既処理 / duplicate）→ not_actionable・executor 呼ばない", async () => {
    const { exec, calls } = fakeExecutor();
    const res = await handleCandidateActionRequest(acceptReq, [{ seedRef: SEED_A, status: "consumed" }], exec);
    expect(res).toEqual({ accepted: false, reason: "not_actionable", reflectsToPlan: false, deferred: false });
    expect(calls).toEqual([]);
  });
  it("malformed handle → invalid_handle・executor 呼ばない", async () => {
    const { exec, calls } = fakeExecutor();
    const res = await handleCandidateActionRequest({ handle: "bad", action: "accept" }, [active(SEED_A)], exec);
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe("invalid_handle");
    expect(calls).toEqual([]);
  });
});

describe("A1-6-4 redaction — response に seedRef/UUID/raw を出さない（seedRef は executor へのみ）", () => {
  it("response JSON に seedRef/UUID/source_ref 非出（calls には seedRef あり＝server-side）", async () => {
    const { exec, calls } = fakeExecutor();
    const res = await handleCandidateActionRequest(acceptReq, [active(SEED_A)], exec);
    const json = JSON.stringify(res);
    for (const leak of [SEED_A, "seedRef", "source_ref"]) expect(json).not.toContain(leak);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(Object.keys(res).sort()).toEqual(["accepted", "deferred", "reason", "reflectsToPlan"]);
    expect(calls.join()).toContain(SEED_A); // executor は seedRef を受け取る（server-side・DB op 用）
  });
});

describe("A1-6-4 executeCandidateOperationPlan — harness 単体（not accepted plan は fail-closed）", () => {
  it("not accepted plan → executor 呼ばず fail-closed", async () => {
    const { exec, calls } = fakeExecutor();
    const failPlan: CandidateOperationPlan = { accepted: false, reason: "not_active", operations: [], deferred: false };
    const res = await executeCandidateOperationPlan(failPlan, SEED_A, exec);
    expect(res).toEqual({ accepted: false, reason: "not_active", reflectsToPlan: false, deferred: false });
    expect(calls).toEqual([]);
  });
});

describe("A1-6-4 静的安全（server-only・no-write・executor 注入）", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/candidate-action-executor.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  it("server-only 宣言 + 実 DB write / generateComplete / anchor RPC を持たない（executor 注入のみ）", () => {
    expect(code).toContain("server-only");
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert(", ".update(", "fetch(", "generateComplete", "create_external_anchor_bundle", "process.env"]) {
      expect(code).not.toContain(t);
    }
  });
  it("barrel(integration/index.ts) が candidate-action-executor を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("candidate-action-executor");
  });
});
