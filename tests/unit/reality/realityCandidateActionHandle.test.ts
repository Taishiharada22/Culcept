/**
 * A1-6-1 Candidate Action Handle / Request Contract — pure/no-run tests
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.1
 *
 * opaque handle（一方向 sha256）+ request contract + 解決（surfaceable のみ・fail-closed）+ redaction。
 *   client に seedRef を出さない・handle 偽造不能・stale/expired/consumed/invalid は fail-closed。
 *   surfaceable 集合は注入（実 read は別 slice）。DB write 0 / production 0。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  deriveCandidateHandle,
  validateActionRequest,
  resolveCandidateHandle,
  resolveAndDecideAction,
  redactResolutionForClient,
  CANDIDATE_HANDLE_RE,
  type SurfaceableCandidate,
} from "@/lib/plan/reality/integration/candidate-action-handle";

const SEED_A = "11111111-1111-4111-8111-111111111111";
const SEED_B = "22222222-2222-4222-8222-222222222222";
const HANDLE_A = deriveCandidateHandle(SEED_A);
const active = (seedRef: string): SurfaceableCandidate => ({ seedRef, status: "active" });

describe("A1-6-1 deriveCandidateHandle（opaque・一方向・determinstic）", () => {
  it("形式 = c1: + sha256 hex（CANDIDATE_HANDLE_RE 一致）", () => {
    expect(HANDLE_A).toMatch(CANDIDATE_HANDLE_RE);
    expect(HANDLE_A.startsWith("c1:")).toBe(true);
  });
  it("deterministic（同 seedRef → 同 handle）", () => {
    expect(deriveCandidateHandle(SEED_A)).toBe(deriveCandidateHandle(SEED_A));
  });
  it("異なる seedRef → 異なる handle", () => {
    expect(deriveCandidateHandle(SEED_A)).not.toBe(deriveCandidateHandle(SEED_B));
  });
  it("handle に seedRef(UUID) を含まない（一方向・client に seedRef を出さない）", () => {
    expect(HANDLE_A).not.toContain(SEED_A);
    expect(HANDLE_A).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i); // UUID 形を含まない
  });
});

describe("A1-6-1 validateActionRequest（fail-closed）", () => {
  it("valid { handle, action } → ok", () => {
    expect(validateActionRequest({ handle: HANDLE_A, action: "accept" })).toEqual({ ok: true, handle: HANDLE_A, action: "accept" });
  });
  it("非 object（null/undefined/string/number/boolean）→ not_object", () => {
    for (const raw of [null, undefined, "x", 1, true]) {
      expect(validateActionRequest(raw)).toEqual({ ok: false, reason: "not_object" });
    }
  });
  it("array（object だが handle field なし）→ invalid_handle", () => {
    const r = validateActionRequest([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_handle");
  });
  it("handle 形式不正 → invalid_handle", () => {
    for (const h of ["", "abc", SEED_A, "c1:xyz", "c2:" + "a".repeat(64), HANDLE_A + "x"]) {
      const r = validateActionRequest({ handle: h, action: "accept" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("invalid_handle");
    }
  });
  it("action 不正 → invalid_action", () => {
    for (const a of ["snooze", "", "ACCEPT", "delete", 1, null]) {
      const r = validateActionRequest({ handle: HANDLE_A, action: a });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("invalid_action");
    }
  });
});

describe("A1-6-1 resolveCandidateHandle（surfaceable のみ・fail-closed・race-safe）", () => {
  it("surfaceable に一致 → 解決", () => {
    expect(resolveCandidateHandle(HANDLE_A, [active(SEED_B), active(SEED_A)])).toEqual(active(SEED_A));
  });
  it("surfaceable に不在（stale/expired/consumed＝surface 外）→ null（fail-closed）", () => {
    expect(resolveCandidateHandle(HANDLE_A, [active(SEED_B)])).toBeNull();
  });
  it("surfaceable 空 → null", () => {
    expect(resolveCandidateHandle(HANDLE_A, [])).toBeNull();
  });
});

describe("A1-6-1 resolveAndDecideAction（validate→resolve→decide・fail-closed）", () => {
  const surf = [active(SEED_A)];
  it("accept（surfaceable active）→ resolved・seedRef・outcome consumed", () => {
    const r = resolveAndDecideAction({ handle: HANDLE_A, action: "accept" }, surf);
    expect(r).toEqual({ resolved: true, seedRef: SEED_A, outcome: { valid: true, reason: "ok", nextStatus: "consumed", reflectsToPlan: true, deferred: false } });
  });
  it("dismiss → rejected / later → deferred", () => {
    expect((resolveAndDecideAction({ handle: HANDLE_A, action: "dismiss" }, surf) as { outcome: { nextStatus: string } }).outcome.nextStatus).toBe("rejected");
    expect((resolveAndDecideAction({ handle: HANDLE_A, action: "later" }, surf) as { outcome: { deferred: boolean } }).outcome.deferred).toBe(true);
  });
  it("malformed request → not resolved", () => {
    expect(resolveAndDecideAction(null, surf)).toEqual({ resolved: false, reason: "not_object" });
    expect(resolveAndDecideAction({ handle: "bad", action: "accept" }, surf)).toEqual({ resolved: false, reason: "invalid_handle" });
    expect(resolveAndDecideAction({ handle: HANDLE_A, action: "x" }, surf)).toEqual({ resolved: false, reason: "invalid_action" });
  });
  it("未解決 handle（surfaceable 外＝stale/expired/consumed）→ unresolved（fail-closed）", () => {
    expect(resolveAndDecideAction({ handle: HANDLE_A, action: "accept" }, [active(SEED_B)])).toEqual({ resolved: false, reason: "unresolved" });
  });
  it("非 active な surfaceable（防御）→ not_actionable", () => {
    const r = resolveAndDecideAction({ handle: HANDLE_A, action: "accept" }, [{ seedRef: SEED_A, status: "consumed" }]);
    expect(r).toEqual({ resolved: false, reason: "not_actionable" });
  });
});

describe("A1-6-1 redactResolutionForClient（seedRef/nextStatus 非出）", () => {
  it("resolved accept → { accepted, reason, reflectsToPlan, deferred }・seedRef/nextStatus 出ない", () => {
    const resolution = resolveAndDecideAction({ handle: HANDLE_A, action: "accept" }, [active(SEED_A)]);
    const red = redactResolutionForClient(resolution);
    expect(red).toEqual({ accepted: true, reason: "ok", reflectsToPlan: true, deferred: false });
    const json = JSON.stringify(red);
    expect(json).not.toContain(SEED_A); // seedRef を client に出さない
    expect(json).not.toContain("nextStatus");
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
  it("not resolved → { accepted:false, reason }・seedRef なし", () => {
    expect(redactResolutionForClient({ resolved: false, reason: "unresolved" })).toEqual({ accepted: false, reason: "unresolved", reflectsToPlan: false, deferred: false });
  });
  it("full flow（request→resolution→redacted）で client surface に seedRef 非搬送", () => {
    const json = JSON.stringify(redactResolutionForClient(resolveAndDecideAction({ handle: HANDLE_A, action: "later" }, [active(SEED_A)])));
    for (const leak of [SEED_A, "seedRef", "source_ref", "nextStatus"]) expect(json).not.toContain(leak);
  });
});

describe("A1-6-1 静的安全（server-only・deterministic・no-DB）", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/candidate-action-handle.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  it("server-only 宣言 + 一方向 sha256（node:crypto・決定的）", () => {
    expect(code).toContain("server-only");
    expect(code).toContain("createHash");
    expect(code).toContain("sha256");
  });
  it("DB/Supabase/network/Date.now/random を持たない（sha256 createHash().update() は決定的 crypto ゆえ可）", () => {
    // DB write の実体は Supabase client（.from/.rpc/createClient/@supabase）。client が無ければ .insert/.update/.delete も DB write 不能。
    // 本 module は createHash(...).update(seedRef)（crypto・決定的）を使うため、client/network/time/random で判定する。
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".upsert(", "fetch(", "Date.now", "Math.random", "process.env"]) {
      expect(code).not.toContain(t);
    }
  });
  it("barrel(integration/index.ts) が candidate-action-handle を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("candidate-action-handle");
  });
});
