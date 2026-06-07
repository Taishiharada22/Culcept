/**
 * A1-6-0 Candidate → Plan Action — pure/no-run tests
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.0
 *
 * surfaced candidate への action（accept/dismiss/later）→ seed status 遷移 + plan 反映意図。
 *   pure（DB/network/Date.now なし）・idempotency（active のみ作用）・raw 非搬送。
 *   実 status update / 実 plan 反映 / route は別 slice の live path（本 test は決定 logic のみ）。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  decideCandidateAction,
  isActionableStatus,
  isValidActionKind,
  CANDIDATE_ACTION_KINDS,
  type CandidateActionKind,
} from "@/lib/plan/reality/candidate-action";
import type { PlanSeedStatus } from "@/lib/plan/plan-seed";

const NON_ACTIVE: PlanSeedStatus[] = ["consumed", "rejected", "expired"];

describe("A1-6-0 decideCandidateAction — active candidate（valid 操作）", () => {
  it("accept（active）→ consumed・reflectsToPlan true", () => {
    expect(decideCandidateAction("accept", "active")).toEqual({
      valid: true, reason: "ok", nextStatus: "consumed", reflectsToPlan: true, deferred: false,
    });
  });
  it("dismiss（active）→ rejected・reflectsToPlan false", () => {
    expect(decideCandidateAction("dismiss", "active")).toEqual({
      valid: true, reason: "ok", nextStatus: "rejected", reflectsToPlan: false, deferred: false,
    });
  });
  it("later（active）→ 変更なし（nextStatus null）・deferred true・active のまま（再 surface）", () => {
    expect(decideCandidateAction("later", "active")).toEqual({
      valid: true, reason: "ok", nextStatus: null, reflectsToPlan: false, deferred: true,
    });
  });
});

describe("A1-6-0 decideCandidateAction — idempotency（非 active は no-op）", () => {
  it("consumed / rejected / expired への accept/dismiss/later → invalid・not_active・no-op", () => {
    for (const status of NON_ACTIVE) {
      for (const action of CANDIDATE_ACTION_KINDS) {
        const r = decideCandidateAction(action, status);
        expect(r.valid).toBe(false);
        expect(r.reason).toBe("not_active");
        expect(r.nextStatus).toBeNull();
        expect(r.reflectsToPlan).toBe(false);
      }
    }
  });
  it("二重 accept 防止: accept(consumed) → not_active（既に組み込み済を再反映しない）", () => {
    expect(decideCandidateAction("accept", "consumed").valid).toBe(false);
  });
  it("棄却後の操作防止: later(rejected) → not_active", () => {
    expect(decideCandidateAction("later", "rejected").valid).toBe(false);
  });
});

describe("A1-6-0 decideCandidateAction — runtime malformed action（fail-closed）", () => {
  it("未知 action → invalid・unknown_action", () => {
    const r = decideCandidateAction("snooze" as CandidateActionKind, "active");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("unknown_action");
    expect(r.nextStatus).toBeNull();
  });
});

describe("A1-6-0 helpers", () => {
  it("isActionableStatus: active → true / consumed·rejected·expired → false", () => {
    expect(isActionableStatus("active")).toBe(true);
    for (const s of NON_ACTIVE) expect(isActionableStatus(s)).toBe(false);
  });
  it("isValidActionKind: accept/dismiss/later → true / 他 → false", () => {
    for (const a of CANDIDATE_ACTION_KINDS) expect(isValidActionKind(a)).toBe(true);
    for (const a of ["snooze", "", "ACCEPT", "delete"]) expect(isValidActionKind(a)).toBe(false);
  });
  it("CANDIDATE_ACTION_KINDS = [accept, dismiss, later]", () => {
    expect(CANDIDATE_ACTION_KINDS).toEqual(["accept", "dismiss", "later"]);
  });
});

describe("A1-6-0 redaction / determinism", () => {
  it("outcome に raw / seedRef / UUID / source_ref を持たない（enum + boolean のみ）", () => {
    const json = JSON.stringify(decideCandidateAction("accept", "active"));
    for (const leak of ["seedRef", "source_ref", "signal", "userId", "desired_action"]) expect(json).not.toContain(leak);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(Object.keys(decideCandidateAction("accept", "active")).sort()).toEqual(["deferred", "nextStatus", "reason", "reflectsToPlan", "valid"]);
  });
  it("deterministic（同一入力→同一出力）", () => {
    expect(decideCandidateAction("accept", "active")).toEqual(decideCandidateAction("accept", "active"));
    expect(decideCandidateAction("later", "active")).toEqual(decideCandidateAction("later", "active"));
  });
});

describe("A1-6-0 静的安全（pure・no-DB・no-run）", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/candidate-action.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  it("DB/Supabase/network/Date.now/route/UI を持たない", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert(", ".update(", "fetch(", "Date.now", 'from "next/', 'from "@/app/', 'from "react"', "process.env"]) {
      expect(code).not.toContain(t);
    }
  });
  it("barrel(reality/index.ts) が candidate-action を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/index.ts"), "utf8");
    expect(idx).not.toContain("candidate-action");
  });
});
