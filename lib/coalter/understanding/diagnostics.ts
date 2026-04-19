/**
 * CoAlter Stage 1 Understand — diagnostics emitter（shape + stub）
 *
 * 位置づけ: docs/coalter-movie-three-stage-design.md §12.3 + CEO lock A 準拠。
 *
 * M0-1 scope:
 *   - diagnostics の shape を TypeScript 型 + sample value で固定する。
 *   - 本ファイルは **emit しない** stub。console / analytics への書き出しは
 *     M0-3 以降で追加（kill switch 経由、shadow で先に形式確定させる）。
 *   - sample value は unit test と KPI SQL 設計のリファレンスを兼ねる。
 *
 * [CEO lock 2026-04-20 A] 許可フィールド:
 *   - outcome, lensVersion, understanding_confidence
 *   - completeness（BundleCompleteness 数値のみ）
 *   - source_coverage（カウントのみ）
 *   - latency_ms（数値のみ）
 *   - missing_domains（DataGapSection enum 名のみ）
 *   - computedAt, pairHash（匿名化済み）
 *
 *   禁止: quote / summary / body / implicitMood / displayName / userId / 生テキスト。
 *   型レベルで UnderstandingDiagnostics のみ受理し、lens / bundle 生データに access できない。
 */

import type {
  BundleCompleteness,
  DataGapSection,
  LatencyBreakdown,
  LensVersion,
  SourceCoverage,
  UnderstandingDiagnostics,
  UnderstandingOutcome,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Diagnostics emitter signature（stub）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stage 1 Understand の診断ログを発火する関数シグネチャ。
 * M0-1 では本体なし（shape 固定のみ）。M0-3 以降で:
 *   - `[CoAlter] understanding.diagnostics` prefix で console.info
 *   - kill switch: `COALTER_UNDERSTANDING_DIAGNOSTICS` (default on in preview)
 *   - analytics event: `coalter.understanding.diagnostics.v1`
 *   を裏で実装する。
 *
 * [CEO lock A] 入力型は `UnderstandingDiagnostics` 限定。
 *   `TwoPersonLensToday` / `ObservationBundle` を受け取らないことで
 *   生テキスト経路を型レベルで遮断する。
 */
export type EmitUnderstandingDiagnostics = (
  diagnostics: UnderstandingDiagnostics,
) => void;

/** M0-1 の no-op 実装。M0-3 で console / analytics 書き出しに差し替え。 */
export const emitUnderstandingDiagnostics: EmitUnderstandingDiagnostics = (_d) => {
  // intentionally empty — shadow stage, no write path yet
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. Sample values — 型契約の reference + unit test / KPI SQL 設計用
// ═══════════════════════════════════════════════════════════════════════════

/** success ケース: 観測がほぼ揃った成熟ペア。 */
export const DIAGNOSTICS_SAMPLE_SUCCESS: UnderstandingDiagnostics = {
  outcome: "success" satisfies UnderstandingOutcome,
  lensVersion: "1.0.0" satisfies LensVersion,
  understanding_confidence: 0.78,
  completeness: {
    personA: { stargazer: 0.82, alter: 0.8, behavioral: 0.66, context: 1.0 },
    personB: { stargazer: 0.75, alter: 0.6, behavioral: 0.33, context: 0.66 },
    relationship: 0.72,
    conversation: 0.8,
    environmental: 1.0,
  } satisfies BundleCompleteness,
  source_coverage: {
    a: { stargazerCount: 7, alterCount: 4, behavioralCount: 5 },
    b: { stargazerCount: 5, alterCount: 3, behavioralCount: 2 },
  } satisfies SourceCoverage,
  latency_ms: {
    total: 3420,
    collect: 850,
    fusion: 1680,
    todayReader: 720,
    fairness: 170,
  } satisfies LatencyBreakdown,
  missing_domains: [],
  computedAt: "2026-04-20T14:22:10.412Z",
  pairHash: "p_8f2a1c7d",
};

/** degraded ケース: Alter 観測 / 行動観測が一部欠損、narration は出せるが confidence 低。 */
export const DIAGNOSTICS_SAMPLE_DEGRADED: UnderstandingDiagnostics = {
  outcome: "degraded",
  lensVersion: "1.0.0",
  understanding_confidence: 0.42,
  completeness: {
    personA: { stargazer: 0.55, alter: 0.2, behavioral: 0.0, context: 0.33 },
    personB: { stargazer: 0.3, alter: 0.4, behavioral: 0.33, context: 0.33 },
    relationship: 0.3,
    conversation: 0.6,
    environmental: 0.6,
  },
  source_coverage: {
    a: { stargazerCount: 3, alterCount: 1, behavioralCount: 0 },
    b: { stargazerCount: 2, alterCount: 1, behavioralCount: 1 },
  },
  latency_ms: {
    total: 2910,
    collect: 420,
    fusion: 1980,
    todayReader: 450,
    fairness: 60,
  },
  missing_domains: [
    "personA.behavioral",
    "relationship.sharedHistory",
    "relationship.fairnessLedger",
  ] satisfies DataGapSection[],
  computedAt: "2026-04-20T14:25:44.001Z",
  pairHash: "p_3c9b2f10",
};

/** failed ケース: 致命的欠損（Stargazer 両者なし等）。Stage 2 を走らせない判断の根拠。 */
export const DIAGNOSTICS_SAMPLE_FAILED: UnderstandingDiagnostics = {
  outcome: "failed",
  lensVersion: "1.0.0",
  understanding_confidence: 0.08,
  completeness: {
    personA: { stargazer: 0.0, alter: 0.0, behavioral: 0.0, context: 0.0 },
    personB: { stargazer: 0.0, alter: 0.0, behavioral: 0.0, context: 0.0 },
    relationship: 0.0,
    conversation: 0.4,
    environmental: 0.6,
  },
  source_coverage: {
    a: { stargazerCount: 0, alterCount: 0, behavioralCount: 0 },
    b: { stargazerCount: 0, alterCount: 0, behavioralCount: 0 },
  },
  latency_ms: {
    total: 210,
    collect: 180,
    fusion: 0,
    todayReader: 0,
    fairness: 30,
  },
  missing_domains: [
    "personA.stargazer",
    "personA.alter",
    "personA.behavioral",
    "personA.context",
    "personB.stargazer",
    "personB.alter",
    "personB.behavioral",
    "personB.context",
    "relationship.sharedHistory",
    "relationship.fairnessLedger",
    "relationship.rupturesAndRepairs",
  ] satisfies DataGapSection[],
  computedAt: "2026-04-20T14:30:01.900Z",
  pairHash: "p_new_1a2b",
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. Type-level guard — 生テキスト経路が絶対に通らないことを compiler で強制
// ═══════════════════════════════════════════════════════════════════════════

/**
 * [CEO lock A] コンパイル時 assertion:
 *   UnderstandingDiagnostics に以下のキーが存在しないこと。
 *   もし将来 types.ts に quote / summary / body 等が混入したら tsc が fail する。
 */
type _ForbiddenKeys =
  | "quote"
  | "summary"
  | "body"
  | "implicitMood"
  | "narrative"
  | "displayName"
  | "userId";

// keyof UnderstandingDiagnostics に _ForbiddenKeys と重なるキーがないことを確認。
type _Assert_NoForbiddenKeys = Extract<
  keyof UnderstandingDiagnostics,
  _ForbiddenKeys
> extends never
  ? true
  : never;

// コンパイル時にのみ参照される const。値としては使わない。
export const _DIAGNOSTICS_GUARD: _Assert_NoForbiddenKeys = true;
