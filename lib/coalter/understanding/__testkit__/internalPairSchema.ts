/**
 * CoAlter Stage 1 Understand — internal-pair export の JSON schema
 *
 * [CEO lock 2026-04-20 M0-6B]
 *   - この schema は `scripts/coalter/export-internal-pair.ts` の出力と
 *     `scripts/coalter/shadow-real-api.ts` の入力として共有する。
 *   - 含めてよいもの: pairHash / 集約 signal (CompressedTodayInput) / 事前計算
 *     された rule-based snapshot (mode / budget / counts のみ)
 *   - 含めてはいけないもの: userId / displayName / email / turns.body / 生 narrative。
 *     `_EXPORT_GUARD` が compile-time に禁止フィールドの混入を塞ぐ。
 */

import crypto from "node:crypto";
import type {
  CompressedTodayInput,
} from "../compressTodayInput";
import type { IsoTimestamp, TodayMode } from "../types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. rule-based snapshot — raw string を持たない集約形のみ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * export 時点で rule-based reader を流した結果の要約。
 * latentNeeds / implicitIntent / narrative は一切含めない（count のみ）。
 */
export type RuleSnapshot = {
  mode: TodayMode;
  energyBudget: "high" | "mid" | "low";
  timeBudget: "ample" | "limited" | "tight";
  confidence: number;
  latentNeedsCount: number;
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. internal-pair JSON — v1 schema
// ═══════════════════════════════════════════════════════════════════════════

export type InternalPairCase = {
  caseId: string;
  compressedInput: CompressedTodayInput;
  ruleSnapshot: RuleSnapshot;
};

export type InternalPairExportV1 = {
  schemaVersion: "coalter.internal_pair.v1";
  pairHash: string;
  extractedAt: IsoTimestamp;
  sessionCount: number;
  cases: InternalPairCase[];
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. Compile-time guard — 禁止フィールドが schema に混入しないことを型で塞ぐ
// ═══════════════════════════════════════════════════════════════════════════

type _ForbiddenInExport =
  | "userId"
  | "displayName"
  | "email"
  | "turns"
  | "recentNarratives"
  | "sharedHistory";

type _AssertCaseNoForbidden = Extract<
  keyof InternalPairCase,
  _ForbiddenInExport
> extends never
  ? true
  : never;

type _AssertExportNoForbidden = Extract<
  keyof InternalPairExportV1,
  _ForbiddenInExport
> extends never
  ? true
  : never;

export const _EXPORT_CASE_GUARD: _AssertCaseNoForbidden = true;
export const _EXPORT_DOC_GUARD: _AssertExportNoForbidden = true;

// ═══════════════════════════════════════════════════════════════════════════
// 4. runtime assert — JSON.stringify に禁止 key が現れないことを検証
// ═══════════════════════════════════════════════════════════════════════════

const FORBIDDEN_KEYS_IN_SERIALIZED = [
  '"userId"',
  '"displayName"',
  '"email"',
  '"body"',
  '"recentNarratives"',
  '"sharedHistory"',
] as const;

export type AnonymizationViolation = {
  key: string;
  index: number;
};

/**
 * `doc` を JSON 文字列化し、禁止 key token が含まれていないことを確認する。
 * 違反があれば `{key, index}` の配列を返す。空配列なら PASS。
 */
export function findAnonymizationViolations(
  doc: InternalPairExportV1,
): AnonymizationViolation[] {
  const serialized = JSON.stringify(doc);
  const hits: AnonymizationViolation[] = [];
  for (const key of FORBIDDEN_KEYS_IN_SERIALIZED) {
    const idx = serialized.indexOf(key);
    if (idx >= 0) {
      hits.push({ key, index: idx });
    }
  }
  return hits;
}

export function assertAnonymized(doc: InternalPairExportV1): void {
  const violations = findAnonymizationViolations(doc);
  if (violations.length > 0) {
    const keys = violations.map((v) => v.key).join(", ");
    throw new Error(
      `coalter/internal-pair: anonymization violation (${keys})`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. pairHash — sha256(sorted(userIdA, userIdB) + ":" + pepper)[0..16]
// ═══════════════════════════════════════════════════════════════════════════

export function computePairHash(
  userIdA: string,
  userIdB: string,
  pepper: string,
): string {
  const [lo, hi] = userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
  const digest = crypto
    .createHash("sha256")
    .update(`${lo}:${hi}:${pepper}`, "utf8")
    .digest("hex");
  return digest.slice(0, 16);
}
