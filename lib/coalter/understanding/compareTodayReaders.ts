/**
 * CoAlter Stage 1 Understand — todayReader 比較器（shadow）
 *
 * rule-based と LLM 版の出力を並列実行し、aggregated metrics だけを返す。
 *
 * [CEO lock 2026-04-20 M0-4 #3] 比較指標は以下に固定（変更したら test も更新）:
 *   - latency 差: rule / llm 各 ms
 *   - mode 一致率: modeAgreement (bool)
 *   - latentNeeds 情報量差: count のみ（raw string は載せない）
 *   - confidence 影響: confidenceDelta = llm - rule
 *   - degraded / failed 率の変化: outcome 側は caller 側で比較する。本関数は
 *     両者の confidence / mode だけを返し、outcome 判定は judgeOutcome() が担当。
 *
 * [CEO lock 2026-04-20 M0-4 #5] diagnostics に LLM 生出力を載せない。
 *   - 本関数の返り値には raw rationale / prompt 断片 / LLM 生 string を含めない
 *   - implicitIntent / latentNeeds の文字列は本関数から出力しない（count のみ）
 *   - 将来 diagnostics に入れる可能性があるフィールドも全て集約値に限定
 */

import { compressForTodayReader } from "./compressTodayInput";
import { readToday } from "./todayReader";
import {
  readTodayLLM,
  type LLMReaderOutcome,
  type TodayReaderLLMClient,
} from "./todayReaderLLM";
import type { IsoTimestamp, ObservationBundle, TodayMode } from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. 出力型 — すべて集約値。raw string は持たない
// ═══════════════════════════════════════════════════════════════════════════

/**
 * shadow 比較の集約結果。diagnostics 経由で外に出すのはここの値のみ。
 * implicitIntent / latentNeeds の raw string はここに出さない（count だけ）。
 */
export type TodayReaderComparison = {
  /** rule-based と LLM の mode が一致したか */
  modeAgreement: boolean;

  /** 参照用: rule / llm の mode（enum のみ、raw text ではない）。llm 側は fallback/error 時 null */
  ruleMode: TodayMode;
  llmMode: TodayMode | null;

  /** llm.confidence - rule.confidence（小数 3 桁）。llm fallback/error 時 null */
  confidenceDelta: number | null;

  /** rule / llm の confidence（参照用、raw text ではない） */
  ruleConfidence: number;
  llmConfidence: number | null;

  /** 測定 latency（ms）。llm 側は fallback/error 時でも所要時間を記録する */
  latencyMs: { rule: number; llm: number };

  /** latentNeeds の情報量差。raw string は載せない、count のみ */
  latentNeedsDelta: {
    ruleCount: number;
    llmCount: number;
    /** 両者に同一文字列が含まれる本数（count のみ、内容は出さない） */
    overlapCount: number;
  };

  /** LLM 経路の結果: ok / fallback / error */
  llmOutcome: LLMReaderOutcome;
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param bundle Stage 1 Understand の入力
 * @param now caller 注入の現在時刻（決定論維持、latency は Date.now を使う）
 * @param client LLM client（未指定なら llm 側は "error:no_client"）
 */
export async function compareTodayReaders(
  bundle: ObservationBundle,
  now: IsoTimestamp,
  client: TodayReaderLLMClient | undefined,
): Promise<TodayReaderComparison> {
  // ── rule-based ─────────────────────────────────────────────────────
  const ruleStart = Date.now();
  const rule = readToday(bundle);
  const ruleLatency = Math.max(0, Date.now() - ruleStart);

  // ── LLM 経路（圧縮入力） ──────────────────────────────────────────
  const compressed = compressForTodayReader(bundle);
  const llmStart = Date.now();
  const llm = await readTodayLLM(compressed, client);
  const llmLatency = Math.max(0, Date.now() - llmStart);

  // ── aggregated metrics ─────────────────────────────────────────────
  const llmReading = llm.outcome === "ok" ? llm.reading : null;

  const ruleNeeds = new Set(rule.latentNeeds);
  const llmNeeds = llmReading ? new Set(llmReading.latentNeeds) : new Set<string>();
  let overlap = 0;
  for (const n of ruleNeeds) {
    if (llmNeeds.has(n)) overlap += 1;
  }

  const confidenceDelta =
    llmReading === null
      ? null
      : Math.round((llmReading.confidence - rule.confidence) * 1000) / 1000;

  // `now` は決定論側の基準値（fusion latency 等と揃える）。compare latency は
  // Date.now ベースだが、caller は latency を別の目的（shadow パフォーマンス監視）
  // で使うため、ここは now を参照しなくてよい。
  void now;

  return {
    modeAgreement: llmReading ? rule.mode === llmReading.mode : false,
    ruleMode: rule.mode,
    llmMode: llmReading?.mode ?? null,
    confidenceDelta,
    ruleConfidence: rule.confidence,
    llmConfidence: llmReading?.confidence ?? null,
    latencyMs: { rule: ruleLatency, llm: llmLatency },
    latentNeedsDelta: {
      ruleCount: rule.latentNeeds.length,
      llmCount: llmReading ? llmReading.latentNeeds.length : 0,
      overlapCount: overlap,
    },
    llmOutcome: llm.outcome,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Compile-time guard — diagnostics 型契約
// ═══════════════════════════════════════════════════════════════════════════

type _ForbiddenComparisonKeys =
  | "implicitIntent"
  | "latentNeedsRule"
  | "latentNeedsLLM"
  | "rawRationale"
  | "prompt"
  | "rawOutput";

type _Assert_NoForbidden = Extract<
  keyof TodayReaderComparison,
  _ForbiddenComparisonKeys
> extends never
  ? true
  : never;

export const _COMPARE_GUARD: _Assert_NoForbidden = true;
