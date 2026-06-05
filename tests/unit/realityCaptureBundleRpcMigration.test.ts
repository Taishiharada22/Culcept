import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const MIGRATION_PATH = path.join(process.cwd(), "supabase/migrations/20260605120000_create_plan_seed_capture_bundle.sql");
const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
// SQL 行コメント（-- …）除去 → 関数本体のみ検査（コメント語の誤検出防止）
const code = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const codeLower = code.toLowerCase();
const has = (t: string) => new RegExp(`\\b${t}\\b`).test(codeLower);

describe("A1-5-4b-2 create_plan_seed_capture_bundle — raw 不在 / structured-only", () => {
  it("raw 引数 / raw column がない（signal/desired_action/raw_text/title/location）", () => {
    for (const raw of ["signal", "desired_action", "raw_text", "title", "location"]) {
      expect(has(raw)).toBe(false);
    }
  });
  it("source_ref を opaque text として透過（引数 jsonb から抽出）", () => {
    expect(codeLower).toContain("source_ref");
    expect(codeLower).toMatch(/p_seed->>'source_ref'/);
  });
});

describe("A1-5-4b-2 — SECURITY INVOKER / 認可", () => {
  it("function が SECURITY INVOKER", () => {
    expect(codeLower).toContain("security invoker");
    expect(codeLower).not.toContain("security definer");
  });
  it("auth.uid() check がある", () => {
    expect(codeLower).toContain("auth.uid()");
  });
  it("p_user_id = auth.uid() check がある（不一致で unauthorized）", () => {
    expect(codeLower).toMatch(/auth\.uid\(\)\s*<>\s*p_user_id/);
    expect(codeLower).toContain("unauthorized");
  });
  it("service_role 前提なし", () => {
    expect(codeLower).not.toContain("service_role");
    expect(codeLower).not.toContain("service role");
  });
});

describe("A1-5-4b-2 — atomic seed + optional evidence（同一 function）", () => {
  it("INSERT INTO plan_seeds がある", () => {
    expect(codeLower).toMatch(/insert into plan_seeds\b/);
  });
  it("optional INSERT INTO plan_seed_duration_evidences がある", () => {
    expect(codeLower).toMatch(/insert into plan_seed_duration_evidences\b/);
    expect(codeLower).toMatch(/if\s+p_evidence\s+is\s+not\s+null/); // optional 分岐
  });
  it("seed + evidence が同一 function 内（CREATE FUNCTION 1 つ・両 INSERT を含む）", () => {
    expect((codeLower.match(/create or replace function/g) ?? []).length).toBe(1);
    expect(codeLower).toMatch(/insert into plan_seeds\b/);
    expect(codeLower).toMatch(/insert into plan_seed_duration_evidences\b/);
  });
});

describe("A1-5-4b-2 — evidence guard（既存 table CHECK と一致）", () => {
  it("duration_min > 1 AND duration_min <= 1440", () => {
    expect(codeLower).toMatch(/duration_min\s*>\s*1\b/);
    expect(codeLower).toMatch(/duration_min\s*<=\s*1440/);
  });
  it("source は seed_explicit / correction / prm_typical", () => {
    for (const s of ["seed_explicit", "correction", "prm_typical"]) expect(codeLower).toContain(`'${s}'`);
  });
  it("confidence は high / low", () => {
    for (const c of ["high", "low"]) expect(codeLower).toContain(`'${c}'`);
  });
  it("owner / seed linkage 整合チェック（evidence.user_id = p_user_id ∧ evidence.seed_id = seed id）", () => {
    expect(codeLower).toMatch(/p_evidence->>'user_id'/);
    expect(codeLower).toMatch(/p_evidence->>'seed_id'/);
    expect(codeLower).toMatch(/v_seed\.id/);
  });
});

describe("A1-5-4b-2 — GRANT / REVOKE / 非破壊", () => {
  it("REVOKE ALL FROM PUBLIC", () => {
    expect(codeLower).toMatch(/revoke all on function/);
    expect(codeLower).toContain("from public");
  });
  it("GRANT EXECUTE TO authenticated", () => {
    expect(codeLower).toMatch(/grant execute on function/);
    expect(codeLower).toContain("to authenticated");
  });
  it("DROP / destructive なし（CREATE OR REPLACE 冪等）", () => {
    expect(codeLower).toContain("create or replace function");
    expect(codeLower).not.toMatch(/drop\s+table/);
    expect(codeLower).not.toMatch(/drop\s+function/);
    expect(codeLower).not.toContain("truncate");
    expect(codeLower).not.toMatch(/delete\s+from/);
  });
});
