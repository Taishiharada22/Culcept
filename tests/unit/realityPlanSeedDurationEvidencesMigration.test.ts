import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const MIGRATION_PATH = path.join(process.cwd(), "supabase/migrations/20260605110000_plan_seed_duration_evidences.sql");
const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
// SQL 行コメント（-- …）除去 → schema 本体のみ検査（コメント語の誤検出防止）
const code = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const codeLower = code.toLowerCase();
const has = (token: string) => new RegExp(`\\b${token}\\b`).test(codeLower);

describe("A1-5-3b-1 plan_seed_duration_evidences migration — structured-only / raw 不在", () => {
  it("raw 列（signal/desired_action/raw_text/title/location）が存在しない", () => {
    for (const raw of ["signal", "desired_action", "raw_text", "title", "location"]) {
      expect(has(raw)).toBe(false);
    }
  });
  it("structured 列を持つ（duration_min/source/confidence/source_ref/seed_id/user_id/observed_at/expires_at）", () => {
    for (const col of ["duration_min", "source", "confidence", "source_ref", "seed_id", "user_id", "observed_at", "expires_at"]) {
      expect(has(col)).toBe(true);
    }
  });
});

describe("A1-5-3b-1 — CHECK / UNIQUE（enrich 一致 + 補正1）", () => {
  it("補正1: duration_min は > 1 AND <= 1440（>=1 ではない・enrich isValidEvidenceDuration 一致）", () => {
    expect(codeLower).toMatch(/duration_min\s*>\s*1\b/);
    expect(codeLower).toMatch(/duration_min\s*<=\s*1440/);
    expect(codeLower).not.toMatch(/duration_min\s*>=\s*1\b/);
  });
  it("source check が seed_explicit / correction / prm_typical", () => {
    for (const s of ["seed_explicit", "correction", "prm_typical"]) expect(codeLower).toContain(`'${s}'`);
  });
  it("confidence check が high / low", () => {
    for (const c of ["high", "low"]) expect(codeLower).toContain(`'${c}'`);
  });
  it("UNIQUE(seed_id, source) がある", () => {
    expect(codeLower).toMatch(/unique\s*\(\s*seed_id\s*,\s*source\s*\)/);
  });
});

describe("A1-5-3b-1 — seed owner integrity（補正2・DB 制約）", () => {
  it("composite FK (seed_id, user_id) REFERENCES plan_seeds(id, user_id)", () => {
    expect(codeLower).toMatch(/foreign key\s*\(\s*seed_id\s*,\s*user_id\s*\)\s*references\s*plan_seeds\s*\(\s*id\s*,\s*user_id\s*\)/);
  });
  it("composite FK は ON DELETE CASCADE（seed 削除で evidence cascade）", () => {
    expect(codeLower).toMatch(/references\s*plan_seeds\s*\(\s*id\s*,\s*user_id\s*\)\s*on delete cascade/);
  });
  it("composite FK 参照先 plan_seeds(id, user_id) に UNIQUE を追加（ALTER・additive）", () => {
    expect(codeLower).toMatch(/add constraint\s+\w+\s+unique\s*\(\s*id\s*,\s*user_id\s*\)/);
  });
});

describe("A1-5-3b-1 — RLS owner-only（service_role 非前提）", () => {
  it("RLS enabled", () => {
    expect(codeLower).toContain("enable row level security");
  });
  it("SELECT/INSERT/UPDATE/DELETE policy が存在し auth.uid() = user_id（owner-only ×4）", () => {
    for (const op of ["select", "insert", "update", "delete"]) {
      expect(codeLower).toMatch(new RegExp(`for\\s+${op}`));
    }
    const owner = codeLower.match(/auth\.uid\(\)\s*=\s*user_id/g) ?? [];
    expect(owner.length).toBeGreaterThanOrEqual(4);
  });
  it("service_role 前提にしない", () => {
    expect(codeLower).not.toContain("service_role");
    expect(codeLower).not.toContain("service role");
  });
});

describe("A1-5-3b-1 — 追加のみ / trigger / source_ref opaque 固定", () => {
  it("CREATE TABLE 追加のみ（plan_seed_duration_evidences を DROP しない）", () => {
    expect(codeLower).toContain("create table");
    expect(codeLower).toContain("plan_seed_duration_evidences");
    expect(codeLower).not.toMatch(/drop\s+table\s+(if\s+exists\s+)?plan_seed_duration_evidences/);
  });
  it("updated_at trigger を持つ", () => {
    expect(codeLower).toMatch(/create\s+trigger/);
    expect(codeLower).toMatch(/before\s+update\s+on\s+plan_seed_duration_evidences/);
  });
  it("source_ref は opaque で read path allowed columns に載せない方針が docs §8.13/§8.14 で固定", () => {
    const doc = fs.readFileSync(path.join(process.cwd(), "docs/aneurasync-reality-control-os-connection-design.md"), "utf8");
    expect(doc).toContain("ALLOWED_EVIDENCE_COLUMNS"); // read allowed columns（source_ref/raw を含まない）
    expect(doc).toContain("source_ref/raw を select しない");
  });
});
