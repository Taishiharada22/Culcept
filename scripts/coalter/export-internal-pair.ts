/**
 * CoAlter Stage 1 Understand — 内部ペア匿名化 export CLI
 *
 * 実行: `npx tsx scripts/coalter/export-internal-pair.ts`
 *
 * [CEO lock 2026-04-20 M0-6B] 出力ファイル:
 *   - `scripts/coalter/internal-pairs/internal-pair-<pairHash>.json`
 *   - chmod 600（.gitignore 済み）
 *
 * 含めてよいもの: pairHash / 集約 signal (CompressedTodayInput) / rule snapshot（集約形）
 * 含めてはいけないもの: userId / displayName / email / turns.body / 生 narrative
 * → `assertAnonymized` が JSON.stringify の結果を検査して違反があれば throw。
 *
 * 現時点の実装範囲（M0-6B 実装着手承認 = commit df496b17 時点）:
 *   - schema / anonymization assert / ファイル出力経路 は完成
 *   - Supabase からの session 取得 + ObservationBundle 組み立てには `loadSessionsFromSupabase`
 *     を **shadow 実行承認時** に接続する（ZDR 確認 + key 発行 + code-review PASS の後）
 *   - 現在は env `COALTER_EXPORT_INPUT` に指定した synthetic JSON 入力を
 *     そのまま export するモードのみ提供（smoke test 用）
 */

import fs from "node:fs";
import path from "node:path";
import {
  assertAnonymized,
  computePairHash,
  type InternalPairCase,
  type InternalPairExportV1,
} from "@/lib/coalter/understanding/__testkit__/internalPairSchema";

// ═══════════════════════════════════════════════════════════════════════════
// 1. CLI entry
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const userA = requiredEnv("COALTER_EXPORT_PAIR_USER_A");
  const userB = requiredEnv("COALTER_EXPORT_PAIR_USER_B");
  const pepper = requiredEnv("COALTER_EXPORT_PAIR_PEPPER");
  const outDir =
    process.env.COALTER_EXPORT_OUT_DIR ?? "scripts/coalter/internal-pairs";

  const pairHash = computePairHash(userA, userB, pepper);

  const cases = await loadCases();

  const doc: InternalPairExportV1 = {
    schemaVersion: "coalter.internal_pair.v1",
    pairHash,
    extractedAt: new Date().toISOString(),
    sessionCount: cases.length,
    cases,
  };

  assertAnonymized(doc);

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `internal-pair-${pairHash}.json`);
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2), "utf8");
  fs.chmodSync(outPath, 0o600);

  // 集約値のみ。case id 以外は出さない。
  console.log(
    `[coalter/export] pairHash=${pairHash} sessionCount=${cases.length} out=${outPath}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. helpers
// ═══════════════════════════════════════════════════════════════════════════

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`[coalter/export] env ${name} is required`);
  }
  return v;
}

/**
 * M0-6B shadow 実行承認時に Supabase client 接続を追加する想定の skeleton。
 * 現在は env `COALTER_EXPORT_INPUT` の JSON ファイル（既に匿名化済みの
 * InternalPairCase[] 形式）を読み取るモードのみ提供する。
 */
async function loadCases(): Promise<InternalPairCase[]> {
  const input = process.env.COALTER_EXPORT_INPUT;
  if (typeof input === "string" && input.length > 0) {
    const raw = fs.readFileSync(input, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("[coalter/export] COALTER_EXPORT_INPUT must be array");
    }
    return parsed as InternalPairCase[];
  }
  return loadSessionsFromSupabase();
}

/**
 * shadow 実行承認時に接続する予定の Supabase アダプタ。
 * 現時点では未接続（空配列を返す）。
 * 接続時の責務: public.dialogues を user_id IN (A, B) で取得し、
 *   ObservationBundle を組み立て → rule-based readToday を走らせて
 *   RuleSnapshot を作成 → compressForTodayReader で匿名化 →
 *   InternalPairCase[] を返す。
 * 実装ファイル名も本ファイル内でのみ扱い、prod runtime からは参照しない。
 */
async function loadSessionsFromSupabase(): Promise<InternalPairCase[]> {
  return [];
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[coalter/export] fatal: ${msg}`);
  process.exit(1);
});
