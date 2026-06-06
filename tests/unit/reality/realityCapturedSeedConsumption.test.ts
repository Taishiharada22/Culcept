import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  runCapturedSeedConsumptionShadow,
  pickAllowedSeedColumns,
  pickAllowedDurationEvidenceColumns,
  CONSUMPTION_ALLOWED_SEED_COLUMNS,
  CONSUMPTION_ALLOWED_EVIDENCE_COLUMNS,
  type CapturedSeedConsumptionInput,
} from "@/lib/plan/reality/integration/captured-seed-consumption";
import type { ColumnRestrictedSeedRow } from "@/lib/plan/reality/integration/seed-column-restricted";
import type { ColumnRestrictedDurationEvidenceRow } from "@/lib/plan/reality/integration/duration-evidence-source";
import { collectStringValues } from "@/lib/plan/reality/integration/redaction-guard";

const SEED_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const EV_ID = "33333333-3333-4333-8333-333333333333";

// 候補化可能な seed（active / confidence≥0.5=strong / full_go=place / undated time hint=activeWindow gap）
function seed(p: Partial<ColumnRestrictedSeedRow> = {}): ColumnRestrictedSeedRow {
  return { id: SEED_ID, user_id: USER_ID, desired_date: "2026-06-07", desired_time_hint: null, action_shape: "full_go", confidence: 0.9, status: "active", ...p };
}
function evidence(p: Partial<ColumnRestrictedDurationEvidenceRow> = {}): ColumnRestrictedDurationEvidenceRow {
  return { id: EV_ID, user_id: USER_ID, seed_id: SEED_ID, duration_min: 60, source: "seed_explicit", confidence: "high", ...p };
}
const CTX = { date: "2026-06-07", activeWindow: { startMin: 0, endMin: 1440 }, existing: [] };
function run(seedRows: ColumnRestrictedSeedRow[], evidenceRows: ColumnRestrictedDurationEvidenceRow[]) {
  return runCapturedSeedConsumptionShadow({ seedRows, evidenceRows, context: CTX } as CapturedSeedConsumptionInput);
}

const SRC = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/captured-seed-consumption.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-5-6-0/1 consumption — evidence source 規則（既存 enrich 再利用）", () => {
  it("seed + high seed_explicit → candidateCount > 0", () => {
    const r = run([seed()], [evidence({ source: "seed_explicit" })]);
    expect(r.candidateCount).toBe(1);
    expect(r.wouldCandidate).toBe(true);
    expect(r.reason).toBe("candidate");
    expect(r.seedCount).toBe(1);
    expect(r.adoptableEvidenceCount).toBe(1);
  });
  it("seed + high correction → candidateCount > 0", () => {
    const r = run([seed()], [evidence({ source: "correction" })]);
    expect(r.candidateCount).toBe(1);
    expect(r.reason).toBe("candidate");
  });
  it("seed + prm_typical → candidateCount = 0（weak grounding・候補化しない）", () => {
    const r = run([seed()], [evidence({ source: "prm_typical" })]);
    expect(r.candidateCount).toBe(0);
    expect(r.adoptableEvidenceCount).toBe(1); // adoptable だが weak → 非候補
    expect(r.reason).toBe("no_candidate");
  });
  it("seed + no evidence → candidateCount = 0（durationMin=null=not placeable）", () => {
    const r = run([seed()], []);
    expect(r.candidateCount).toBe(0);
    expect(r.adoptableEvidenceCount).toBe(0);
    expect(r.reason).toBe("no_candidate");
  });
  it("low confidence evidence → candidateCount = 0（map に surface しない）", () => {
    const r = run([seed()], [evidence({ confidence: "low" })]);
    expect(r.candidateCount).toBe(0);
    expect(r.adoptableEvidenceCount).toBe(0);
  });
  it("範囲外 duration evidence → candidateCount = 0", () => {
    const r = run([seed()], [evidence({ duration_min: 99999 })]);
    expect(r.candidateCount).toBe(0);
  });
});

describe("A1-5-6-0/1 consumption — seed lifecycle / disposition / grounding", () => {
  it("seedRows 空 → no_seed", () => {
    const r = run([], []);
    expect(r.seedCount).toBe(0);
    expect(r.candidateCount).toBe(0);
    expect(r.reason).toBe("no_seed");
  });
  it("非 active seed → 除外（seedCount 0 / no_seed）", () => {
    const r = run([seed({ status: "consumed" })], [evidence()]);
    expect(r.seedCount).toBe(0);
    expect(r.candidateCount).toBe(0);
    expect(r.reason).toBe("no_seed");
  });
  it("weak seed confidence(<0.5) → grounding weak → 候補化しない", () => {
    const r = run([seed({ confidence: 0.3 })], [evidence()]);
    expect(r.seedCount).toBe(1);
    expect(r.candidateCount).toBe(0);
    expect(r.reason).toBe("no_candidate");
  });
  it("skip actionShape → dispositionHint skip → 候補化しない", () => {
    const r = run([seed({ action_shape: "skip" })], [evidence()]);
    expect(r.candidateCount).toBe(0);
  });
  it("date 不一致 → 候補化しない", () => {
    const r = runCapturedSeedConsumptionShadow({ seedRows: [seed()], evidenceRows: [evidence()], context: { ...CTX, date: "2099-01-01" } });
    expect(r.candidateCount).toBe(0);
  });
});

describe("A1-5-6-0/1 consumption — contamination fail-closed / raw-free / source_ref non-surface", () => {
  it("raw column 混入（signal/desired_action/source_ref/raw_text）→ ignore fail-closed（候補化は構造化値で成立・raw 非漏洩）", () => {
    const contaminatedSeed = { ...seed(), signal: "RAW_LEAK_SIGNAL", desired_action: "RAW_LEAK_ACTION", source_ref: "RAW_SEED_SOURCE_REF" } as unknown as ColumnRestrictedSeedRow;
    const contaminatedEv = { ...evidence(), source_ref: "RAW_EV_SOURCE_REF", raw_text: "RAW_TEXT", title: "RAW_TITLE" } as unknown as ColumnRestrictedDurationEvidenceRow;
    const r = run([contaminatedSeed], [contaminatedEv]);
    expect(r.candidateCount).toBe(1); // 構造化値で候補化・raw は drop
    const json = JSON.stringify(r);
    for (const leak of ["RAW_LEAK_SIGNAL", "RAW_LEAK_ACTION", "RAW_SEED_SOURCE_REF", "RAW_EV_SOURCE_REF", "RAW_TEXT", "RAW_TITLE", "signal", "desired_action", "source_ref"]) {
      expect(json).not.toContain(leak);
    }
  });
  it("summary の全 string 値は reason code のみ（id/source_ref/raw を surface しない）", () => {
    const r = run([seed()], [evidence()]);
    const strings = collectStringValues(r).map((l) => l.value);
    expect(strings).toEqual(["candidate"]);
    for (const s of strings) {
      expect(["candidate", "no_seed", "no_candidate"]).toContain(s);
      expect(s).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i); // UUID 非含有
    }
    const json = JSON.stringify(r);
    for (const leak of [SEED_ID, USER_ID, EV_ID, "source_ref", "seedRef", "signal"]) expect(json).not.toContain(leak);
  });
  it("source_ref / raw は candidate path に載らない（複数フィールド汚染でも summary clean）", () => {
    const r = run(
      [{ ...seed(), source_ref: "SREF", signal: "SIG", desired_action: "ACT" } as unknown as ColumnRestrictedSeedRow],
      [{ ...evidence(), source_ref: "EVREF" } as unknown as ColumnRestrictedDurationEvidenceRow]
    );
    const all = JSON.stringify(r);
    for (const leak of ["SREF", "SIG", "ACT", "EVREF"]) expect(all).not.toContain(leak);
  });
});

describe("A1-5-6-0/1 consumption — sanitize（allowlist 再構築）", () => {
  it("pickAllowedSeedColumns は allowed 列のみ写す（raw drop）", () => {
    const picked = pickAllowedSeedColumns({ ...seed(), signal: "X", desired_action: "Y", source_ref: "Z" } as unknown as ColumnRestrictedSeedRow);
    expect(Object.keys(picked).sort()).toEqual([...CONSUMPTION_ALLOWED_SEED_COLUMNS].sort());
    expect(JSON.stringify(picked)).not.toMatch(/signal|desired_action|source_ref|"X"|"Y"|"Z"/);
  });
  it("pickAllowedDurationEvidenceColumns は allowed 列のみ写す（source_ref/raw drop）", () => {
    const picked = pickAllowedDurationEvidenceColumns({ ...evidence(), source_ref: "Z", raw_text: "R" } as unknown as ColumnRestrictedDurationEvidenceRow);
    expect(Object.keys(picked).sort()).toEqual([...CONSUMPTION_ALLOWED_EVIDENCE_COLUMNS].sort());
    expect(JSON.stringify(picked)).not.toMatch(/source_ref|raw_text|"Z"|"R"/);
  });
});

describe("A1-5-6-0/1 consumption — deterministic", () => {
  it("同一入力 → 同一出力", () => {
    const input = { seedRows: [seed()], evidenceRows: [evidence()], context: CTX };
    expect(runCapturedSeedConsumptionShadow(input)).toEqual(runCapturedSeedConsumptionShadow(input));
  });
});

describe("A1-5-6-0/1 consumption — 静的安全（server-only・DB/route/UI 0・barrel 非 export）", () => {
  it("server-only 宣言", () => {
    expect(CODE).toContain("server-only");
  });
  it("DB / Supabase / route / UI / fetch を直接持たない", () => {
    for (const t of ["createClient", "@supabase", ".from(", ".rpc(", ".insert(", "fetch(", 'from "next/', 'from "@/app/', 'from "react"', "PlanClient", "supabaseServer", "process.env"]) {
      expect(CODE).not.toContain(t);
    }
  });
  it("raw 列名を扱わない（pick で再構築・signal/desired_action を読まない）", () => {
    // code 上 raw 列名はコメント以外に出ない（CODE はコメント除去済）
    expect(CODE).not.toContain('"signal"');
    expect(CODE).not.toContain('"desired_action"');
  });
  it("barrel(integration/index.ts) が captured-seed-consumption を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("captured-seed-consumption");
  });
});
