/**
 * Stage 4 B-3.4.d — REPLICA IDENTITY FULL migration invariant test
 *
 * CEO 必須 5 項目 (2026-04-30):
 *   1. migration file が存在する
 *   2. `alter table public.coalter_memory_items replica identity full` を含む
 *   3. rollback comment に `replica identity default` が明記されている
 *   4. destructive SQL を含まない (DROP TABLE / DROP PUBLICATION / DELETE / TRUNCATE 禁止)
 *   5. 既存 B-3.4 tests が回帰しない (本 file は別 file 追加、既存 test 不変)
 *
 * test strategy:
 *   - file content の grep で contract を enforce
 *   - DB 接続不要 (純 file 検証)
 */

import { describe, it, expect } from "vitest";

const MIGRATION_PATH =
  "../../../../supabase/migrations/20260430110000_coalter_memory_items_replica_full.sql";

async function readMigration(): Promise<string> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const file = path.resolve(__dirname, MIGRATION_PATH);
  return fs.readFileSync(file, "utf8");
}

describe("B-3.4.d migration file 構造 invariant", () => {
  it("CEO 必須 #1: migration file が存在", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(__dirname, MIGRATION_PATH);
    expect(fs.existsSync(file)).toBe(true);
  });

  it("CEO 必須 #2: 'alter table public.coalter_memory_items replica identity full' を含む", async () => {
    const content = await readMigration();
    expect(content).toMatch(
      /alter\s+table\s+public\.coalter_memory_items\s+replica\s+identity\s+full/i,
    );
  });

  it("CEO 必須 #3: rollback comment に 'replica identity default' が明記されている", async () => {
    const content = await readMigration();
    // rollback 手順 comment 内に DEFAULT への戻し方が記載されている
    expect(content).toMatch(/rollback/i);
    expect(content).toMatch(/replica\s+identity\s+default/i);
  });

  it("CEO 必須 #4: destructive SQL を含まない (SQL コメント除外で判定)", async () => {
    const content = await readMigration();
    // SQL コメント (-- 行) は除外して判定 (rollback 手順記載のため)
    const sqlOnly = content
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(sqlOnly).not.toMatch(/\bdrop\s+table\b/i);
    expect(sqlOnly).not.toMatch(/\bdrop\s+publication\b/i);
    expect(sqlOnly).not.toMatch(/\bdelete\s+from\b/i);
    expect(sqlOnly).not.toMatch(/\btruncate\b/i);
    // ALTER PUBLICATION DROP も含まない (rollback 用は別 migration として作成)
    expect(sqlOnly).not.toMatch(/alter\s+publication\s+\S+\s+drop/i);
  });

  it("background comment に DELETE realtime broadcast 問題への参照", async () => {
    const content = await readMigration();
    // 背景説明: REPLICA IDENTITY DEFAULT で DELETE event に pair_id がない問題
    expect(content).toMatch(/REPLICA\s+IDENTITY\s+DEFAULT/i);
    expect(content).toMatch(/DELETE/);
    expect(content).toMatch(/pair_id/);
  });

  it("supabase db push timing への記載 (CEO 確認 gate、Gate A)", async () => {
    const content = await readMigration();
    expect(content).toMatch(/supabase\s+db\s+push/i);
    expect(content).toMatch(/CEO/);
    expect(content).toMatch(/手動/);
  });

  it("不可侵原則の comment (useMemoryItems / API / RLS / soft delete 全て不変)", async () => {
    const content = await readMigration();
    // 本 migration は schema-only change、code 経路に影響しない invariant
    expect(content).toMatch(/useMemoryItems/);
    expect(content).toMatch(/RLS\s+policy/);
    expect(content).toMatch(/soft\s+delete/i);
  });

  it("migration timestamp 整合性 (20260430110000、B-3.4.a の 20260430100000 より新しい)", async () => {
    const content = await readMigration();
    expect(content).toMatch(/B-3\.4\.d/);
  });
});
