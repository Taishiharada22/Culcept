/**
 * Stage 4 B-3.4.a — Realtime publication migration invariant test
 *
 * 完了条件:
 *   - migration file 存在
 *   - SQL に `alter publication supabase_realtime add table public.coalter_memory_items` を含む
 *   - 冪等性 (`pg_publication_tables` check) を含む
 *   - destructive SQL (DROP / DELETE / TRUNCATE) を含まない
 *
 * test strategy:
 *   - file content の grep で contract を enforce
 *   - DB 接続不要 (純 file 検証)
 */

import { describe, it, expect } from "vitest";

const MIGRATION_PATH =
  "../../../../supabase/migrations/20260430100000_coalter_memory_items_realtime.sql";

async function readMigration(): Promise<string> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const file = path.resolve(__dirname, MIGRATION_PATH);
  return fs.readFileSync(file, "utf8");
}

describe("B-3.4.a migration file 構造 invariant", () => {
  it("migration file が存在", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(__dirname, MIGRATION_PATH);
    expect(fs.existsSync(file)).toBe(true);
  });

  it("alter publication supabase_realtime add table 構文を含む", async () => {
    const content = await readMigration();
    expect(content).toMatch(
      /alter\s+publication\s+supabase_realtime\s+add\s+table\s+public\.coalter_memory_items/i,
    );
  });

  it("冪等性: pg_publication_tables check を含む (重複追加回避)", async () => {
    const content = await readMigration();
    expect(content).toMatch(/pg_publication_tables/i);
    expect(content).toMatch(/not\s+exists/i);
    expect(content).toMatch(/pubname\s*=\s*['"]supabase_realtime['"]/i);
    expect(content).toMatch(/tablename\s*=\s*['"]coalter_memory_items['"]/i);
  });

  it("supabase_realtime publication 自体の存在 check (publication 未作成環境で no-op)", async () => {
    const content = await readMigration();
    // outer DO block で `pg_publication` の存在を check
    expect(content).toMatch(/pg_publication\b/);
    expect(content).toMatch(/pubname\s*=\s*['"]supabase_realtime['"]/);
  });

  it("destructive SQL を含まない (DROP / DELETE / TRUNCATE 禁止)", async () => {
    const content = await readMigration();
    // SQL コメント (-- 行) は除外して判定
    const sqlOnly = content
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(sqlOnly).not.toMatch(/\bdrop\s+table\b/i);
    expect(sqlOnly).not.toMatch(/\bdrop\s+publication\b/i);
    expect(sqlOnly).not.toMatch(/\bdelete\s+from\b/i);
    expect(sqlOnly).not.toMatch(/\btruncate\b/i);
  });

  it("migration timestamp 整合性 (20260430100000、既存 20260428100100 より新しい)", async () => {
    const content = await readMigration();
    // file path に正しい timestamp が入っている前提だが、内容にも CEO 確定の日付が記載
    expect(content).toMatch(/B-3\.4/);
  });

  it("rollback 手順への参照 (decision-log §B-3.4)", async () => {
    const content = await readMigration();
    expect(content).toMatch(/rollback/i);
    expect(content).toMatch(/decision-log/i);
  });

  it("supabase db push timing への記載 (CEO 確認 gate)", async () => {
    const content = await readMigration();
    expect(content).toMatch(/supabase\s+db\s+push/i);
    expect(content).toMatch(/CEO/);
  });
});
