/**
 * A1-5-11-3 Write-side Accumulation Guard / TTL Policy — fake/no-run tests
 *   pure policy（DB/network/Date.now なし）。read-side dedup（candidate-lifecycle-guard）と同一キー/判定を再利用。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  decideCaptureWrite,
  computeCaptureExpiry,
  DEFAULT_SEED_TTL_DAYS,
} from "@/lib/plan/reality/integration/capture-write-policy";
import { CANDIDATE_FRESHNESS_MS_DEFAULT, type CandidateLifecycleEntry } from "@/lib/plan/reality/integration/candidate-lifecycle-guard";

const NOW = 1_700_000_000_000;
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

describe("A1-5-11-3 decideCaptureWrite — read-before-write dedup", () => {
  it("no existing active seed → write allowed（insert / no_duplicate）", () => {
    expect(decideCaptureWrite(entry(), [], CTX)).toEqual({ decision: "insert", reason: "no_duplicate" });
  });
  it("same structural active fresh seed exists → write suppressed（reuse）", () => {
    const r = decideCaptureWrite(entry(), [entry({ seedRef: "e1111111-1111-4111-8111-111111111111" })], CTX);
    expect(r.decision).toBe("suppress");
    expect(r.reason).toBe("duplicate_active_fresh");
  });
  it("stale existing same-structure seed → write allowed（insert / stale_or_expired）", () => {
    const r = decideCaptureWrite(entry(), [entry({ seedRef: "e1", capturedAtMs: NOW - 30 * DAY })], CTX);
    expect(r.decision).toBe("insert");
    expect(r.reason).toBe("duplicate_stale_or_expired");
  });
  it("expired existing same-structure seed → write allowed（insert）", () => {
    const r = decideCaptureWrite(entry(), [entry({ seedRef: "e1", expiresAtMs: NOW - 1000 })], CTX);
    expect(r.decision).toBe("insert");
    expect(r.reason).toBe("duplicate_stale_or_expired");
  });
  it("rejected / consumed / expired status の既存 → write allowed（status filter で重複扱いしない）", () => {
    for (const s of ["rejected", "consumed", "expired"] as const) {
      expect(decideCaptureWrite(entry(), [entry({ seedRef: "e1", status: s })], CTX)).toEqual({ decision: "insert", reason: "no_duplicate" });
    }
  });
  it("different date / time / duration / action shape → write allowed", () => {
    const base = entry();
    expect(decideCaptureWrite(entry({ durationMin: 120 }), [base], CTX).decision).toBe("insert");
    expect(decideCaptureWrite(entry({ actionShape: "bounded_go" }), [base], CTX).decision).toBe("insert");
    expect(decideCaptureWrite(entry({ desiredDate: "2026-06-08" }), [base], CTX).decision).toBe("insert");
    expect(decideCaptureWrite(entry({ desiredTimeHint: "morning" }), [base], CTX).decision).toBe("insert");
  });
  it("複数既存（fresh 含む）→ suppress / 全て stale → insert", () => {
    const fresh = entry({ seedRef: "f1" });
    const stale = entry({ seedRef: "s1", capturedAtMs: NOW - 30 * DAY });
    expect(decideCaptureWrite(entry(), [stale, fresh], CTX).decision).toBe("suppress"); // 1 つでも fresh → suppress
    expect(decideCaptureWrite(entry(), [stale], CTX).decision).toBe("insert"); // 全 stale → insert
  });
  it("policy 出力に raw / source_ref / UUID を出さない（decision/reason のみ）", () => {
    const json = JSON.stringify(decideCaptureWrite(entry(), [entry({ seedRef: "e1" })], CTX));
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    for (const leak of ["source_ref", "seedRef", "signal", "desired_action"]) expect(json).not.toContain(leak);
  });
  it("deterministic（同一入力→同一出力）", () => {
    const ex = [entry({ seedRef: "e1" })];
    expect(decideCaptureWrite(entry(), ex, CTX)).toEqual(decideCaptureWrite(entry(), ex, CTX));
  });
});

describe("A1-5-11-3 computeCaptureExpiry — TTL / expires_at policy", () => {
  it("DEFAULT_SEED_TTL_DAYS は read-side freshness 窓と整合（14 日）", () => {
    expect(DEFAULT_SEED_TTL_DAYS).toBe(14);
  });
  it("undated → now + TTL（14 日）", () => {
    expect(computeCaptureExpiry({ desiredDate: null }, NOW)).toBe(NOW + 14 * DAY);
  });
  it("dated → その日の終端（経過で expired）", () => {
    expect(computeCaptureExpiry({ desiredDate: "2026-06-10" }, NOW)).toBe(Date.parse("2026-06-10T23:59:59.999Z"));
  });
  it("明示 expiry → 尊重（上書きしない）", () => {
    expect(computeCaptureExpiry({ desiredDate: null, explicitExpiresAtMs: 12345 }, NOW)).toBe(12345);
    expect(computeCaptureExpiry({ desiredDate: "2026-06-10", explicitExpiresAtMs: 99 }, NOW)).toBe(99);
  });
  it("不正日付 → now + TTL fallback", () => {
    expect(computeCaptureExpiry({ desiredDate: "not-a-date" }, NOW)).toBe(NOW + 14 * DAY);
  });
  it("ttlDays override 可能", () => {
    expect(computeCaptureExpiry({ desiredDate: null }, NOW, 7)).toBe(NOW + 7 * DAY);
  });
  it("deterministic", () => {
    expect(computeCaptureExpiry({ desiredDate: null }, NOW)).toBe(computeCaptureExpiry({ desiredDate: null }, NOW));
  });
});

describe("A1-5-11-3 静的安全（pure・no-DB・no-run）", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/capture-write-policy.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  it("DB/Supabase/route/Date.now/network を持たない（Date.parse は決定的ゆえ可）", () => {
    for (const t of ["createClient", "@supabase", '.from("', ".rpc(", ".insert(", ".update(", "fetch(", "Date.now", 'from "next/', 'from "@/app/', 'from "react"', "supabaseServer", "process.env"]) {
      expect(code).not.toContain(t);
    }
  });
  it("barrel(integration/index.ts) が capture-write-policy を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("capture-write-policy");
  });
});
