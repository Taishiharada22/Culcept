import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  ALLOWED_SEED_COLUMNS,
  FORBIDDEN_SEED_COLUMNS,
  projectSeedRowsToPlacements,
  type ColumnRestrictedSeedRow,
} from "@/lib/plan/reality/integration/seed-column-restricted";
import type { ActionShape } from "@/lib/stargazer/alterHomeAdapter";

const MIGRATION_PATH = path.join(process.cwd(), "supabase/migrations/20260605100000_plan_seeds_structured_only.sql");
const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
// SQL 行コメント（-- …）を除去 → schema 本体のみで検査（コメント語が誤検出されないように）
const code = sql
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");
const codeLower = code.toLowerCase();
const has = (token: string) => new RegExp(`\\b${token}\\b`).test(codeLower);
const hasQuoted = (v: string) => codeLower.includes(`'${v}'`);

describe("A1-5-2-2-1 plan_seeds migration — structured-only / raw 不在", () => {
  it("raw 列（signal/desired_action/raw_text/title/location）が migration に存在しない", () => {
    for (const raw of ["signal", "desired_action", "raw_text", "title", "location"]) {
      expect(has(raw)).toBe(false);
    }
  });

  it("plan_seeds は structured columns のみ（ALLOWED_SEED_COLUMNS 全て + source/captured_at/expires_at/source_ref）", () => {
    for (const col of ALLOWED_SEED_COLUMNS) expect(has(col)).toBe(true);
    for (const col of ["source", "captured_at", "expires_at", "source_ref"]) expect(has(col)).toBe(true);
  });

  it("FORBIDDEN_SEED_COLUMNS（signal/desired_action）が migration に存在しない", () => {
    for (const col of FORBIDDEN_SEED_COLUMNS) expect(has(col)).toBe(false);
    expect([...FORBIDDEN_SEED_COLUMNS]).toContain("signal");
    expect([...FORBIDDEN_SEED_COLUMNS]).toContain("desired_action");
  });

  it("source_ref は opaque（Complete projection の ALLOWED_SEED_COLUMNS に含めない）", () => {
    expect(ALLOWED_SEED_COLUMNS as readonly string[]).not.toContain("source_ref");
  });
});

describe("A1-5-2-2-1 plan_seeds migration — CHECK constraints（既存型と一致）", () => {
  it("confidence は 0..1 check", () => {
    expect(codeLower).toMatch(/confidence\s*>=\s*0/);
    expect(codeLower).toMatch(/confidence\s*<=\s*1/);
  });

  it("status は active/consumed/expired/rejected に制限", () => {
    for (const s of ["active", "consumed", "expired", "rejected"]) expect(hasQuoted(s)).toBe(true);
  });

  it("action_shape は ActionShape union（8 値）と一致", () => {
    const SHAPES: ActionShape[] = [
      "full_go",
      "bounded_go",
      "prepare_then_go",
      "trial_then_decide",
      "observe_first",
      "delegate_or_request",
      "defer_with_trigger",
      "skip",
    ];
    for (const s of SHAPES) expect(hasQuoted(s)).toBe(true);
  });

  it("desired_time_hint は PlanSeedTimeHint（morning/afternoon/evening/anytime）", () => {
    for (const h of ["morning", "afternoon", "evening", "anytime"]) expect(hasQuoted(h)).toBe(true);
  });

  it("source は chat/manual に制限", () => {
    expect(hasQuoted("chat")).toBe(true);
    expect(hasQuoted("manual")).toBe(true);
  });
});

describe("A1-5-2-2-1 plan_seeds migration — RLS owner-only（service_role 非前提）", () => {
  it("RLS enabled", () => {
    expect(codeLower).toContain("enable row level security");
  });

  it("SELECT/INSERT/UPDATE/DELETE policy が存在し auth.uid() = user_id を含む", () => {
    for (const op of ["select", "insert", "update", "delete"]) {
      expect(codeLower).toMatch(new RegExp(`for\\s+${op}`));
    }
    const ownerChecks = codeLower.match(/auth\.uid\(\)\s*=\s*user_id/g) ?? [];
    expect(ownerChecks.length).toBeGreaterThanOrEqual(4); // select/insert/update/delete 各 policy
  });

  it("service_role 前提の policy にしない", () => {
    expect(codeLower).not.toContain("service_role");
    expect(codeLower).not.toContain("service role");
  });
});

describe("A1-5-2-2-1 plan_seeds migration — 追加のみ / projection 整合", () => {
  it("migration は plan_seeds を CREATE する追加のみ（DROP TABLE しない）", () => {
    expect(codeLower).toContain("create table");
    expect(codeLower).toContain("plan_seeds");
    expect(codeLower).not.toMatch(/drop\s+table\s+(if\s+exists\s+)?plan_seeds/);
  });

  it("updated_at 列を持つなら trigger も持つ（CEO 条件）", () => {
    if (codeLower.includes("updated_at")) {
      expect(codeLower).toMatch(/create\s+trigger/);
      expect(codeLower).toMatch(/before\s+update\s+on\s+plan_seeds/);
    }
  });

  it("anytime は projection 側で no-window（band なし）扱いになる", () => {
    const row: ColumnRestrictedSeedRow = {
      id: "s1",
      user_id: "u1",
      desired_date: null,
      desired_time_hint: "anytime",
      action_shape: "full_go",
      confidence: 0.9,
      status: "active",
    };
    const [p] = projectSeedRowsToPlacements([row]);
    expect(p.window).toBeUndefined(); // anytime → no-window
  });
});
