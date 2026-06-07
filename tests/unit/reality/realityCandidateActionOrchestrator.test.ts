/**
 * A1-6-3 Candidate Action Server Orchestrator / No-write Plan — pure/no-run tests
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.3
 *
 * accept/dismiss/later → server operation plan（**実行はしない**・redacted）:
 *   A1-6-5a: accept→[status(active→consumed)]+reflectsToPlan / dismiss→[status(active→rejected)] / later→[]+deferred（plan_reflection は削除）。
 *   非 active・unresolved→fail-closed。output に seedRef/UUID/raw/draft を出さない。DB write 0 / execution 0。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  planCandidateActionOperations,
  planCandidateActionFromResolution,
} from "@/lib/plan/reality/candidate-action-orchestrator";
import { decideCandidateAction } from "@/lib/plan/reality/candidate-action";
import { resolveAndDecideAction, deriveCandidateHandle } from "@/lib/plan/reality/integration/candidate-action-handle";
import type { PlanSeedStatus } from "@/lib/plan/plan-seed";

const SEED_A = "11111111-1111-4111-8111-111111111111";
const HANDLE_A = deriveCandidateHandle(SEED_A);
const active = (seedRef: string) => ({ seedRef, status: "active" as const });

describe("A1-6-3 planCandidateActionOperations — accept/dismiss/later の op plan", () => {
  it("accept(active) → [status_transition(active→consumed)] のみ・reflectsToPlan true・deferred false（A1-6-5a: plan_reflection 削除）", () => {
    const plan = planCandidateActionOperations(decideCandidateAction("accept", "active"));
    expect(plan.accepted).toBe(true);
    expect(plan.deferred).toBe(false);
    expect(plan.reflectsToPlan).toBe(true);
    expect(plan.operations).toEqual([{ kind: "status_transition", from: "active", to: "consumed" }]);
  });
  it("dismiss(active) → [status_transition(active→rejected)]・reflectsToPlan false・deferred false", () => {
    const plan = planCandidateActionOperations(decideCandidateAction("dismiss", "active"));
    expect(plan.accepted).toBe(true);
    expect(plan.deferred).toBe(false);
    expect(plan.reflectsToPlan).toBe(false);
    expect(plan.operations).toEqual([{ kind: "status_transition", from: "active", to: "rejected" }]);
  });
  it("later(active) → []（status 変更なし・active 維持）・reflectsToPlan false・deferred true", () => {
    const plan = planCandidateActionOperations(decideCandidateAction("later", "active"));
    expect(plan.accepted).toBe(true);
    expect(plan.operations).toEqual([]);
    expect(plan.reflectsToPlan).toBe(false);
    expect(plan.deferred).toBe(true);
  });
});

describe("A1-6-3 planCandidateActionOperations — 非 active は fail-closed（no-op plan）", () => {
  const NON_ACTIVE: PlanSeedStatus[] = ["consumed", "rejected", "expired"];
  it("consumed/rejected/expired への accept/dismiss/later → accepted false・operations []・not_active", () => {
    for (const status of NON_ACTIVE) {
      for (const action of ["accept", "dismiss", "later"] as const) {
        const plan = planCandidateActionOperations(decideCandidateAction(action, status));
        expect(plan.accepted).toBe(false);
        expect(plan.reason).toBe("not_active");
        expect(plan.operations).toEqual([]);
        expect(plan.reflectsToPlan).toBe(false);
        expect(plan.deferred).toBe(false);
      }
    }
  });
});

describe("A1-6-3 planCandidateActionFromResolution — A1-6-1 resolution → plan（seedRef 非露出）", () => {
  it("resolved accept → accept plan（operations あり）", () => {
    const plan = planCandidateActionFromResolution(resolveAndDecideAction({ handle: HANDLE_A, action: "accept" }, [active(SEED_A)]));
    expect(plan.accepted).toBe(true);
    expect(plan.reflectsToPlan).toBe(true);
    expect(plan.operations).toEqual([{ kind: "status_transition", from: "active", to: "consumed" }]);
  });
  it("resolved dismiss / later", () => {
    expect(planCandidateActionFromResolution(resolveAndDecideAction({ handle: HANDLE_A, action: "dismiss" }, [active(SEED_A)])).operations).toEqual([
      { kind: "status_transition", from: "active", to: "rejected" },
    ]);
    const later = planCandidateActionFromResolution(resolveAndDecideAction({ handle: HANDLE_A, action: "later" }, [active(SEED_A)]));
    expect(later.operations).toEqual([]);
    expect(later.deferred).toBe(true);
  });
  it("unresolved（surfaceable 外＝stale/expired/consumed）→ fail-closed plan（accepted false・operations []）", () => {
    const plan = planCandidateActionFromResolution(resolveAndDecideAction({ handle: HANDLE_A, action: "accept" }, []));
    expect(plan.accepted).toBe(false);
    expect(plan.reason).toBe("unresolved");
    expect(plan.operations).toEqual([]);
  });
  it("malformed request / 非 active surfaceable → fail-closed plan", () => {
    expect(planCandidateActionFromResolution(resolveAndDecideAction({ handle: "bad", action: "accept" }, [active(SEED_A)]))).toEqual({ accepted: false, reason: "invalid_handle", operations: [], reflectsToPlan: false, deferred: false });
    expect(planCandidateActionFromResolution(resolveAndDecideAction({ handle: HANDLE_A, action: "accept" }, [{ seedRef: SEED_A, status: "consumed" }]))).toEqual({ accepted: false, reason: "not_actionable", operations: [], reflectsToPlan: false, deferred: false });
  });
});

describe("A1-6-3 redaction / determinism", () => {
  it("plan に seedRef / UUID / raw / source_ref / draft を出さない", () => {
    const json = JSON.stringify(planCandidateActionFromResolution(resolveAndDecideAction({ handle: HANDLE_A, action: "accept" }, [active(SEED_A)])));
    for (const leak of [SEED_A, "seedRef", "source_ref", "complete-", "draft", "raw", "external_anchor", "plan_reflection"]) expect(json).not.toContain(leak);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
  it("deterministic（同一入力→同一出力）", () => {
    expect(planCandidateActionOperations(decideCandidateAction("accept", "active"))).toEqual(planCandidateActionOperations(decideCandidateAction("accept", "active")));
  });
});

describe("A1-6-3 静的安全（pure・no-DB・no-execution）", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/candidate-action-orchestrator.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  it("DB/Supabase/network/execution（generateComplete・anchor RPC）を持たない", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert(", ".update(", "fetch(", "Date.now", "generateComplete", "create_external_anchor_bundle", "process.env"]) {
      expect(code).not.toContain(t);
    }
  });
  it("barrel(reality/index.ts) が candidate-action-orchestrator を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/index.ts"), "utf8");
    expect(idx).not.toContain("candidate-action-orchestrator");
  });
});
