/**
 * A1-5-11 Candidate Lifecycle / Duplicate / Stale Guard — fake/no-run tests
 *   pure guard（DB/network/Date.now なし）+ 上流 isSurfaceableCandidate（prm_typical/low 除外）参照。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  selectSurfaceableCandidates,
  candidateDedupKey,
  isFreshCandidate,
  isExpiredCandidate,
  CANDIDATE_FRESHNESS_MS_DEFAULT,
  type CandidateLifecycleEntry,
} from "@/lib/plan/reality/integration/candidate-lifecycle-guard";
import { isSurfaceableCandidate } from "@/lib/plan/reality/integration/candidate-surface";
import type { SeedPlacement } from "@/lib/plan/reality/seed-placement";

const NOW = 1_700_000_000_000; // 固定 epoch ms（Date.now 不使用＝deterministic）
const DAY = 24 * 60 * 60 * 1000;
const CTX = { nowMs: NOW, freshnessMs: CANDIDATE_FRESHNESS_MS_DEFAULT };

function entry(p: Partial<CandidateLifecycleEntry> = {}): CandidateLifecycleEntry {
  return {
    seedRef: "11111111-1111-4111-8111-111111111111",
    status: "active",
    capturedAtMs: NOW - 60_000, // 1 分前＝fresh
    expiresAtMs: null,
    actionShape: "full_go",
    desiredDate: null,
    desiredTimeHint: null,
    durationMin: 60,
    confidence: 0.9,
    ...p,
  };
}

describe("A1-5-11 selectSurfaceableCandidates — active fresh → candidate", () => {
  it("active fresh（high evidence 由来）→ surfaceable 1・dropped 0", () => {
    const r = selectSurfaceableCandidates([entry()], CTX);
    expect(r.surfaceable).toHaveLength(1);
    expect(r.droppedCounts).toEqual({ not_active: 0, expired: 0, stale: 0, duplicate: 0 });
  });
  it("空入力 → surfaceable 0（no candidate・既存 response/UI 不変）", () => {
    expect(selectSurfaceableCandidates([], CTX).surfaceable).toHaveLength(0);
  });
});

describe("A1-5-11 duplicate suppression", () => {
  it("同 dedup 構造キー 2 件 → 1 候補に抑制・duplicate=1", () => {
    const a = entry({ seedRef: "aaaaaaaa-1111-4111-8111-111111111111", capturedAtMs: NOW - 5 * DAY });
    const b = entry({ seedRef: "bbbbbbbb-1111-4111-8111-111111111111", capturedAtMs: NOW - 1 * DAY }); // 新しい
    const r = selectSurfaceableCandidates([a, b], CTX);
    expect(r.surfaceable).toHaveLength(1);
    expect(r.droppedCounts.duplicate).toBe(1);
    expect(r.surfaceable[0].seedRef).toBe(b.seedRef); // 最新 capture を残す
  });
  it("dedup key は actionShape|date|timeHint|durationMin（構造のみ）", () => {
    expect(candidateDedupKey(entry({ actionShape: "full_go", durationMin: 60 }))).toBe("full_go|_|_|60");
    expect(candidateDedupKey(entry({ actionShape: "bounded_go", durationMin: 60 }))).not.toBe("full_go|_|_|60");
  });
  it("duration が違えば別候補（dedup されない）", () => {
    const a = entry({ seedRef: "a0000000-1111-4111-8111-111111111111", durationMin: 60 });
    const b = entry({ seedRef: "b0000000-1111-4111-8111-111111111111", durationMin: 120 });
    expect(selectSurfaceableCandidates([a, b], CTX).surfaceable).toHaveLength(2);
  });
});

describe("A1-5-11 stale guard", () => {
  it("capture が freshness 窓より古い → no candidate・stale=1", () => {
    const r = selectSurfaceableCandidates([entry({ capturedAtMs: NOW - 15 * DAY })], CTX);
    expect(r.surfaceable).toHaveLength(0);
    expect(r.droppedCounts.stale).toBe(1);
  });
  it("窓ちょうど内は fresh / 窓超は stale", () => {
    expect(isFreshCandidate(entry({ capturedAtMs: NOW - CANDIDATE_FRESHNESS_MS_DEFAULT }), CTX)).toBe(true);
    expect(isFreshCandidate(entry({ capturedAtMs: NOW - CANDIDATE_FRESHNESS_MS_DEFAULT - 1 }), CTX)).toBe(false);
  });
});

describe("A1-5-11 expired guard", () => {
  it("expiresAt 経過 → no candidate・expired=1", () => {
    const r = selectSurfaceableCandidates([entry({ expiresAtMs: NOW - 1000 })], CTX);
    expect(r.surfaceable).toHaveLength(0);
    expect(r.droppedCounts.expired).toBe(1);
  });
  it("expiresAt null / 未来 → expired でない", () => {
    expect(isExpiredCandidate(entry({ expiresAtMs: null }), CTX)).toBe(false);
    expect(isExpiredCandidate(entry({ expiresAtMs: NOW + 1000 }), CTX)).toBe(false);
    expect(isExpiredCandidate(entry({ expiresAtMs: NOW }), CTX)).toBe(true); // 同時刻=失効
  });
});

describe("A1-5-11 status guard（dismissed/consumed/expired 相当）", () => {
  it("consumed / rejected / expired status → no candidate・not_active", () => {
    for (const s of ["consumed", "rejected", "expired"] as const) {
      const r = selectSurfaceableCandidates([entry({ status: s })], CTX);
      expect(r.surfaceable).toHaveLength(0);
      expect(r.droppedCounts.not_active).toBe(1);
    }
  });
});

describe("A1-5-11 上流 isSurfaceableCandidate（low evidence / prm_typical 除外・既存挙動）", () => {
  function placement(p: Partial<SeedPlacement> = {}): SeedPlacement {
    return { seedRef: "11111111-1111-4111-8111-111111111111", date: undefined, window: undefined, durationMin: 60, durationSource: "seed_explicit", dispositionHint: "place", confidence: 0.9, grounding: "strong", ...p } as SeedPlacement;
  }
  it("seed_explicit strong place duration>0 → surfaceable=true", () => {
    expect(isSurfaceableCandidate(placement())).toBe(true);
  });
  it("prm_typical → false（surface しない）", () => {
    expect(isSurfaceableCandidate(placement({ durationSource: "prm_typical", grounding: "weak" }))).toBe(false);
  });
  it("low/no duration → false（duration 不明は placeable でない）", () => {
    expect(isSurfaceableCandidate(placement({ durationMin: null }))).toBe(false);
  });
  it("weak grounding → false", () => {
    expect(isSurfaceableCandidate(placement({ grounding: "weak" }))).toBe(false);
  });
});

describe("A1-5-11 非 surface / deterministic / 静的安全", () => {
  it("複合: active fresh + dup + stale + expired + consumed → surfaceable 1・dropped 各 1", () => {
    const entries = [
      entry({ seedRef: "10000000-1111-4111-8111-111111111111", capturedAtMs: NOW - 1 * DAY }),
      entry({ seedRef: "20000000-1111-4111-8111-111111111111", capturedAtMs: NOW - 2 * DAY }), // dup of #1
      entry({ seedRef: "30000000-1111-4111-8111-111111111111", capturedAtMs: NOW - 15 * DAY }), // stale
      entry({ seedRef: "40000000-1111-4111-8111-111111111111", expiresAtMs: NOW - 1000, durationMin: 90 }), // expired
      entry({ seedRef: "50000000-1111-4111-8111-111111111111", status: "consumed", durationMin: 30 }), // not_active
    ];
    const r = selectSurfaceableCandidates(entries, CTX);
    expect(r.surfaceable).toHaveLength(1);
    expect(r.droppedCounts).toEqual({ not_active: 1, expired: 1, stale: 1, duplicate: 1 });
  });
  it("dropped 出力に UUID / source_ref / raw を出さない（件数のみ）", () => {
    const r = selectSurfaceableCandidates([entry({ status: "rejected" })], CTX);
    const json = JSON.stringify(r.droppedCounts);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    for (const leak of ["source_ref", "signal", "desired_action", "seedRef"]) expect(json).not.toContain(leak);
  });
  it("entry 型は raw/source_ref を持たない（surfaceable 出力に signal/desired_action/source_ref なし）", () => {
    const r = selectSurfaceableCandidates([entry()], CTX);
    const json = JSON.stringify(r.surfaceable);
    for (const leak of ["source_ref", "signal", "desired_action"]) expect(json).not.toContain(leak);
  });
  it("deterministic（同一入力→同一出力）", () => {
    const inp = [entry({ seedRef: "a0000000-1111-4111-8111-111111111111" }), entry({ seedRef: "b0000000-1111-4111-8111-111111111111", durationMin: 30 })];
    expect(selectSurfaceableCandidates(inp, CTX)).toEqual(selectSurfaceableCandidates(inp, CTX));
  });
  it("pure（DB/Supabase/route/Date.now/fetch/react を持たない）", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/candidate-lifecycle-guard.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    // 注: Array.from は legit JS ゆえ DB アクセスは `.from("`（テーブル文字列）で検出
    for (const t of ["createClient", "@supabase", '.from("', ".rpc(", ".insert(", "fetch(", "Date.now", 'from "next/', 'from "@/app/', 'from "react"', "supabaseServer", "process.env"]) {
      expect(code).not.toContain(t);
    }
  });
  it("barrel(integration/index.ts) が candidate-lifecycle-guard を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("candidate-lifecycle-guard");
  });
});
