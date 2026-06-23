/**
 * P6 — ◎-readiness freeze の不変条件ロック（横断 regression guard）。
 *
 * このセッションの全 readiness（UI dormant seam / asset adapter / persistence / surface contract /
 * flag / redaction / honest-unknown）を 1 箇所で固定する。将来 production 接続時に
 * 「flip すべきもの」以外が誤って動かないことを保証する回帰テスト。
 *
 * 触れない: DB / Supabase / API / fetch / LLM / real user assets。pure 検証のみ。
 */
import { describe, it, expect } from "vitest";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { buildRealityOsSurfaceFixtureDisplay } from "@/lib/plan/realityPipeline/realityOsSurfaceFixture";
import {
  createFixtureAssetSource,
  createLiveAssetSourceStub,
  composeRealityOsSurfaceFromSource,
} from "@/lib/plan/realityPipeline/realityOsAssetProviders";
import { surfaceContractViolations } from "@/lib/plan/realityPipeline/realityOsSurfaceContract";
import { toCanonicalTaskRow, canonicalTaskRowDryRunViolations } from "@/lib/plan/realityPipeline/canonicalTaskRow";
import type { CanonicalTaskV0 } from "@/lib/plan/realityCore/canonicalTask";

describe("P6 freeze invariants", () => {
  it("INV-1 surface flag は default OFF（env 未設定 = dormant）", () => {
    // test env で REALITY_OS_SURFACE_PROD は未設定 → false。production flip は env 点火のみ。
    expect(PLAN_FLAGS.realityOsSurfaceProd).toBe(false);
  });

  it("INV-2 fixture display に raw evidence/graph/ledger/raw reasonCode が漏れない（redaction）", () => {
    const json = JSON.stringify(buildRealityOsSurfaceFixtureDisplay());
    for (const banned of ["evidenceRefs", "ledger", "graph", "_shift", "asset:", "fixture:", "snapshot"]) {
      expect(json).not.toContain(banned);
    }
  });

  it("INV-3 asset source → surface は contract 適合（redacted）", () => {
    const r = composeRealityOsSurfaceFromSource(createFixtureAssetSource());
    expect("surface" in r).toBe(true);
    if ("surface" in r) expect(surfaceContractViolations(r.surface)).toEqual([]);
  });

  it("INV-4 live は stub のまま = unavailable（real asset 非接続）", () => {
    const r = composeRealityOsSurfaceFromSource(createLiveAssetSourceStub());
    expect("unavailable" in r).toBe(true);
    if ("unavailable" in r) {
      expect(r.unavailable).toEqual(expect.arrayContaining(["calendar_anchors", "task", "current_state"]));
    }
  });

  it("INV-5 persistence は dry-run/projection のまま（適合行 violations=[]・不正行は検出）", () => {
    const task: CanonicalTaskV0 = {
      schemaVersion: 0, taskId: "ot1", text: "資料を作成する", completed: false, completedAt: null,
      carriedFrom: null, carryCount: 0, dueDate: "2026-06-13", dueTime: "12:00", recurrence: null,
      motivation: "investment", completionFeel: null, tags: [], parentId: null, addedAt: "2026-06-12T03:00:00.000Z",
    };
    const ok = toCanonicalTaskRow(task, { userId: "u1", sourceKind: "daily_orbit" });
    expect(canonicalTaskRowDryRunViolations(ok)).toEqual([]);
    const bad = toCanonicalTaskRow({ ...task, completed: true }, { userId: "", sourceKind: "daily_orbit" });
    expect(canonicalTaskRowDryRunViolations(bad)).toEqual(
      expect.arrayContaining(["user_id_missing", "completed_without_completed_at"]),
    );
  });
});
