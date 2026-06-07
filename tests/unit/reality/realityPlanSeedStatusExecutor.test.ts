/**
 * A1-6-5d Plan Seed Status-only Executor — pure/no-run tests（mock client・no real DB）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.9
 *
 * real executor の query 構築を mock client で検証（status-only・from=active guard・fail-closed）:
 *   accept→UPDATE status=consumed WHERE id AND status=active / dismiss→rejected / 0 rows→ok=false / error→ok=false。
 *   status 列のみ（generateComplete/anchor なし）。実 DB write 0（mock）。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { createStatusOnlyExecutor, type PlanSeedStatusUpdateClient } from "@/lib/plan/reality/integration/plan-seed-status-executor";

const SEED = "11111111-1111-4111-8111-111111111111";

/** mock client: query（table/values/eqs/select）を記録 + canned rows を返す（実 DB なし）。 */
function mockClient(opts: { rows?: { id: string }[]; error?: string } = {}) {
  const q: { table?: string; values?: unknown; eqs: [string, string][]; select?: string } = { eqs: [] };
  const chain = {
    eq(col: string, val: string) {
      q.eqs.push([col, val]);
      return chain;
    },
    async select(cols: string) {
      q.select = cols;
      return { data: opts.error ? null : (opts.rows ?? []), error: opts.error ? { message: opts.error } : null };
    },
  };
  const client: PlanSeedStatusUpdateClient = {
    from(table: string) {
      q.table = table;
      return {
        update(values: { status: string }) {
          q.values = values;
          return chain;
        },
      };
    },
  };
  return { client, q };
}

describe("A1-6-5d createStatusOnlyExecutor — 条件付き UPDATE（from=active guard・status-only）", () => {
  it("accept(active→consumed): plan_seeds SET status=consumed WHERE id AND status=active・1 row→ok", async () => {
    const { client, q } = mockClient({ rows: [{ id: SEED }] });
    const r = await createStatusOnlyExecutor(client).applyStatusTransition(SEED, "active", "consumed");
    expect(r.ok).toBe(true);
    expect(q.table).toBe("plan_seeds");
    expect(q.values).toEqual({ status: "consumed" }); // status 列のみ（generateComplete/anchor なし）
    expect(q.eqs).toEqual([["id", SEED], ["status", "active"]]); // from=active guard
    expect(q.select).toBe("id");
  });
  it("dismiss(active→rejected): status=rejected・from=active guard", async () => {
    const { client, q } = mockClient({ rows: [{ id: SEED }] });
    const r = await createStatusOnlyExecutor(client).applyStatusTransition(SEED, "active", "rejected");
    expect(r.ok).toBe(true);
    expect(q.values).toEqual({ status: "rejected" });
    expect(q.eqs).toEqual([["id", SEED], ["status", "active"]]);
  });
  it("0 rows（from=active guard fail・並行 consume / non-active / duplicate）→ ok=false（fail-closed）", async () => {
    const { client } = mockClient({ rows: [] });
    expect((await createStatusOnlyExecutor(client).applyStatusTransition(SEED, "active", "consumed")).ok).toBe(false);
  });
  it("DB error → ok=false（fail-closed）", async () => {
    const { client } = mockClient({ error: "db error" });
    expect((await createStatusOnlyExecutor(client).applyStatusTransition(SEED, "active", "consumed")).ok).toBe(false);
  });
});

describe("A1-6-5d 静的安全（server-only・status-only・no generateComplete/anchor/insert/delete）", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/plan-seed-status-executor.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  it("server-only 宣言 + generateComplete/anchor/external_anchor/createClient/service_role/.insert/.delete を持たない", () => {
    expect(code).toContain("server-only");
    for (const t of ["generateComplete", "external_anchor", "create_external_anchor_bundle", "createClient", "service_role", ".insert(", ".delete(", ".upsert("]) {
      expect(code).not.toContain(t);
    }
  });
  it("barrel(integration/index.ts) が plan-seed-status-executor を再 export しない", () => {
    const idx = fs.readFileSync(path.join(process.cwd(), "lib/plan/reality/integration/index.ts"), "utf8");
    expect(idx).not.toContain("plan-seed-status-executor");
  });
});
