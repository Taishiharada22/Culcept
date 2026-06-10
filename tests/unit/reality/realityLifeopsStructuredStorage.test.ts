/**
 * A-4-c27 — Structured Source Storage Contract / Migration Draft（pure + fake reader・**apply なし・実 DB read 0**）unit。
 *   GPT 14 lock: ①migration に forbidden column なし ②deadline due_at 必須 CHECK ③cadence 整合 CHECK
 *   ④source_type/status/confidence CHECK ⑤RLS owner scope ⑥reader DTO に user_id/id/raw/source_ref なし
 *   ⑦unknown category/menu は normalizer drop ⑧invalid ISO drop ⑨⑩c26 DTO へ変換可
 *   ⑪free text/calendar title/placeQuery 不使用 ⑫default OFF→query 0 ⑬production flag ON→query 0 ⑭suite/tsc（suite 側）。
 *
 * 設計: docs/life-ops-structured-storage-a4-c27-mini-design.md。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  rowsToStructuredSources,
  isLifeOpsStructuredSourceReadAllowed,
  LIFEOPS_STRUCTURED_SOURCE_COLUMNS_SQL,
  LIFEOPS_STRUCTURED_SOURCES_TABLE,
  type LifeOpsStructuredSourceRow,
} from "@/lib/plan/reality/lifeops/lifeops-structured-storage";
import {
  createLifeOpsStructuredSourceReadonlySource,
  type LifeOpsStructuredSourceReadClient,
} from "@/lib/plan/reality/lifeops/lifeops-structured-storage-readonly-source";
import { structuredDeadlinesToObservations, structuredCadenceToObservations } from "@/lib/plan/reality/lifeops/lifeops-structured-source";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const MIGRATION = "supabase/migrations/20260611130000_create_lifeops_structured_sources.sql";
const FORBIDDEN_COLUMNS = [
  "free_text", "title", "note", "memo", "description", "place_query", "url", "raw",
  "source_ref", "calendar_title", "event_name", "store_name", "location_name",
];
const FORBIDDEN = /seed_?ref|utterance|personality|trait|user_id|"id"|source_ref|@[a-z]|\b\d{10,}\b|[0-9a-f]{8}-[0-9a-f]{4}/i;

const row = (over: Partial<LifeOpsStructuredSourceRow> = {}): LifeOpsStructuredSourceRow => ({
  source_type: "deadline",
  category_id: "tax_filing",
  menu: null,
  due_at: "2026-06-20T00:00:00+09:00",
  last_completed_at: null,
  typical_interval_days: null,
  occurrence_key: null,
  confidence: "high",
  status: "active",
  ...over,
});
const cadenceRow = (over: Partial<LifeOpsStructuredSourceRow> = {}): LifeOpsStructuredSourceRow =>
  row({ source_type: "cadence", category_id: "beauty_salon", menu: "cut", due_at: null, last_completed_at: "2026-04-11T00:00:00+09:00", ...over });

describe("c27 — migration draft static（①②③④⑤⑪）", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), MIGRATION), "utf8");
  const code = sql.replace(/--.*$/gm, ""); // comment 除外（方針文中の語を誤検出しない）
  it("①forbidden column が列として存在しない", () => {
    for (const col of FORBIDDEN_COLUMNS) {
      expect(code).not.toMatch(new RegExp(`^\\s*${col}\\s+(TEXT|VARCHAR|JSONB?)`, "im")); // 列定義として不在
    }
    expect(code.toLowerCase()).not.toContain("free_text");
    expect(code.toLowerCase()).not.toContain("place_query");
    expect(code.toLowerCase()).not.toContain("calendar_title");
  });
  it("②deadline shape CHECK（due_at 必須 ∧ cadence 列 NULL）③cadence shape CHECK（完了日 or 周期）", () => {
    expect(code).toContain("lifeops_structured_sources_deadline_shape");
    expect(code).toMatch(/source_type <> 'deadline' OR \(due_at IS NOT NULL AND last_completed_at IS NULL AND typical_interval_days IS NULL\)/);
    expect(code).toContain("lifeops_structured_sources_cadence_shape");
    expect(code).toMatch(/source_type <> 'cadence' OR \(due_at IS NULL AND \(last_completed_at IS NOT NULL OR typical_interval_days IS NOT NULL\)\)/);
  });
  it("④source_type/status/confidence/menu/interval 範囲の CHECK", () => {
    expect(code).toMatch(/source_type IN \('deadline', 'cadence'\)/);
    expect(code).toMatch(/status IN \('active', 'archived'\)/);
    expect(code).toMatch(/confidence IN \('high', 'medium', 'low'\)/);
    expect(code).toMatch(/menu IS NULL OR menu IN \('cut', 'color', 'treatment'\)/);
    expect(code).toMatch(/typical_interval_days > 0 AND typical_interval_days <= 730/);
  });
  it("⑤RLS owner scope（ENABLE RLS + select/insert/update/delete の auth.uid() policy）", () => {
    expect(code).toContain("ENABLE ROW LEVEL SECURITY");
    for (const op of ["select", "insert", "update", "delete"]) {
      expect(code).toContain(`lifeops_structured_sources_owner_${op}`);
    }
    expect((code.match(/auth\.uid\(\) = user_id/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
  it("⑪apply 禁止注記 + rollback SQL が同梱されている（draft 契約）", () => {
    expect(sql).toContain("未 apply");
    expect(sql).toContain("DROP TABLE IF EXISTS lifeops_structured_sources");
  });
});

describe("c27 — row → c26 DTO（⑥⑦⑧⑨⑩）", () => {
  it("⑨deadline row → c26 deadline DTO → DeadlineObservation（normalizer 接続）", () => {
    const split = rowsToStructuredSources([row()]);
    expect(split.deadlines.length).toBe(1);
    expect(split.deadlines[0].sourceKind).toBe("user_structured_deadline");
    const obs = structuredDeadlinesToObservations(split.deadlines);
    expect(obs).toEqual([{ categoryId: "tax_filing", deadlineISO: "2026-06-20T00:00:00+09:00" }]);
  });
  it("⑩cadence row → c26 cadence DTO → CadenceObservation（interval のみの row も通る）", () => {
    const split = rowsToStructuredSources([cadenceRow(), cadenceRow({ last_completed_at: null, typical_interval_days: 30, menu: null, category_id: "eyebrow" })]);
    expect(split.cadences.length).toBe(2);
    const obs = structuredCadenceToObservations(split.cadences);
    expect(obs[0]).toEqual({ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-04-11T00:00:00+09:00" });
    expect(obs[1]).toEqual({ categoryId: "eyebrow", menu: null, lastCompletedAtISO: null }); // interval は L-9 予約（未消費）
  });
  it("⑦unknown category は normalizer で drop・enum 外 menu/未知 source_type/archived は adapter で drop", () => {
    const split = rowsToStructuredSources([
      row({ category_id: "massage_parlor" }), // adapter は通す → normalizer が drop
      row({ status: "archived" }), // drop
      row({ source_type: "mystery" }), // drop
      cadenceRow({ menu: "perm" }), // enum 外 menu → drop
    ]);
    expect(split.deadlines.length).toBe(1); // massage_parlor のみ残る（DTO 層）
    expect(structuredDeadlinesToObservations(split.deadlines)).toEqual([]); // ⑦normalizer が最終 drop
    expect(split.cadences.length).toBe(0);
  });
  it("⑧invalid ISO は normalizer で drop・shape 違反 row は adapter で drop", () => {
    const split = rowsToStructuredSources([
      row({ due_at: "broken-date" }),
      row({ due_at: null }), // deadline due_at なし → adapter drop
      cadenceRow({ last_completed_at: null, typical_interval_days: null }), // cadence 両方なし → drop
    ]);
    expect(split.deadlines.length).toBe(1);
    expect(structuredDeadlinesToObservations(split.deadlines)).toEqual([]); // 不正 ISO drop
    expect(split.cadences.length).toBe(0);
  });
  it("⑥DTO/列定義に user_id/id/raw/source_ref が出ない（偽装混入も透過しない）", () => {
    const cols = LIFEOPS_STRUCTURED_SOURCE_COLUMNS_SQL.split(",").map((c) => c.trim());
    expect(cols).not.toContain("user_id");
    expect(cols).not.toContain("id");
    const sneaky = { ...row(), user_id: "u-1", id: "11111111-2222-3333-4444-555555555555", raw: "x" } as unknown as LifeOpsStructuredSourceRow;
    const json = JSON.stringify(rowsToStructuredSources([sneaky]));
    expect(json).not.toMatch(FORBIDDEN);
  });
});

describe("c27 — gate / reader（⑫⑬・consumer 0）", () => {
  function fakeClient(rows: LifeOpsStructuredSourceRow[], counter: { queries: number }): LifeOpsStructuredSourceReadClient {
    const chain = {
      eq: () => chain,
      order: () => chain,
      limit: async () => {
        counter.queries++;
        return { data: rows as unknown as Record<string, unknown>[], error: null };
      },
    };
    return { from: () => ({ select: () => chain }) } as unknown as LifeOpsStructuredSourceReadClient;
  }
  it("⑫flags default OFF → gate false・reader は query 0 で空", async () => {
    expect(PLAN_FLAGS.lifeopsStructuredSourceReadonly).toBe(false);
    const counter = { queries: 0 };
    const src = createLifeOpsStructuredSourceReadonlySource(fakeClient([row()], counter), "user-1", {
      master: PLAN_FLAGS.lifeopsRealdataReadonly,
      structured: PLAN_FLAGS.lifeopsStructuredSourceReadonly,
      supabaseUrl: STAGING_URL,
    });
    expect(await src.readSources()).toEqual({ deadlines: [], cadences: [] });
    expect(counter.queries).toBe(0);
  });
  it("⑬production は flag ON でも gate false → query 0／staging+flags のみ read", async () => {
    expect(isLifeOpsStructuredSourceReadAllowed({ master: true, structured: true, supabaseUrl: PROD_URL })).toBe(false);
    const counter = { queries: 0 };
    const prodSrc = createLifeOpsStructuredSourceReadonlySource(fakeClient([row()], counter), "u", { master: true, structured: true, supabaseUrl: PROD_URL });
    await prodSrc.readSources();
    expect(counter.queries).toBe(0);
    const stagingSrc = createLifeOpsStructuredSourceReadonlySource(fakeClient([row()], counter), "u", { master: true, structured: true, supabaseUrl: STAGING_URL });
    const split = await stagingSrc.readSources();
    expect(counter.queries).toBe(1);
    expect(split.deadlines.length).toBe(1);
  });
  it("consumer 0（dormant）: app/ から reader/flag への参照なし・barrel 非 export・write 0", () => {
    const offenders: string[] = [];
    for (const rel of fs.readdirSync(path.join(process.cwd(), "app"), { recursive: true }) as string[]) {
      const s = rel.toString();
      if (!/\.(ts|tsx)$/.test(s)) continue;
      const src = fs.readFileSync(path.join(process.cwd(), "app", s), "utf8");
      if (src.includes("lifeops-structured-storage") || src.includes("lifeopsStructuredSourceReadonly")) offenders.push(s);
    }
    expect(offenders).toEqual([]); // 接続は staging apply 後の別 slice（CEO GO）
    expect(fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8")).not.toContain("lifeops-structured-storage");
    const readerCode = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/lifeops/lifeops-structured-storage-readonly-source.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    for (const banned of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc(", "createClient", "service_role", "notification"]) {
      expect(readerCode).not.toContain(banned);
    }
  });
});
