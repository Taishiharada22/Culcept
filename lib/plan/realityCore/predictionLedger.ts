/**
 * PredictionLedger pure runtime（RC2a-1 runtime・P2-1）
 *
 * predictionLedgerTypes.ts は「型のみ・runtime なし」だった。本ファイルは、その型の
 * 不変条件（RG0.6a §3 / RG0.6b §6）を **実行時に強制**する pure runtime helper を追加する。
 *
 * 不変条件:
 *  1. predictedValue / predictedAt / predictionId は immutable — どの transition も変更しない。
 *  2. T_freeze 後の本人補正は予測を変更しない。intervention(kind="self_report") として記録され、
 *     actual にはならない（actual は NightCheck のみ）。
 *  3. actual は NightCheck 入口（recordNightCheckActual）でのみ入る。set-once（再観測は不可）。
 *
 * 規律: pure・no-IO・no-Date（RealityInstant を注入）。DB / Supabase / UI / ranking 非接続。
 *   既存型（predictionLedgerTypes.ts）は不変更。
 */

import type { ConfidentValue } from "@/lib/stargazer/alterHomeAdapter";
import type { RealityInstant } from "./realityInstant";
import type { RealityAttribute } from "./realityAttribute";
import type { PredictionEntryV0 } from "./predictionLedgerTypes";

/** 不変条件違反を表す runtime error（fail-closed・誤学習の温床を実行時に塞ぐ） */
export class PredictionLedgerInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PredictionLedgerInvariantError";
  }
}

/**
 * freeze 入力 = prediction 側フィールドのみ。actual / intervention / verdict / learningCandidate は
 * runtime が初期化する（凍結時点では actual 未観測・補正なし）。
 */
export type PredictionFreezeInputV0 = Omit<
  PredictionEntryV0,
  "actualValue" | "actualSourceKind" | "observedAt" | "interventions" | "verdict" | "learningCandidate"
> & {
  readonly verdict?: PredictionEntryV0["verdict"];
  readonly learningCandidate?: PredictionEntryV0["learningCandidate"];
};

/**
 * 予測を凍結して PredictionEntryV0 を生成する。actual=null / interventions=[] で開始。
 * 返り値は Object.freeze（浅い不変化・予測の差し替えを構造的に防ぐ第一の壁）。
 */
export function buildPredictionEntry(input: PredictionFreezeInputV0): PredictionEntryV0 {
  const entry: PredictionEntryV0 = {
    ...input,
    actualValue: null,
    actualSourceKind: null,
    observedAt: null,
    interventions: [],
    verdict: input.verdict ?? null,
    learningCandidate: input.learningCandidate ?? null,
  };
  return Object.freeze(entry);
}

/**
 * 不変条件1の機械検証: predictionId / predictedValue / predictedAt が一致することを保証。
 * transition helper 内で after を検査し、予測が漏れなく不変であることを実行時に証明する。
 */
export function assertPredictionImmutable(before: PredictionEntryV0, after: PredictionEntryV0): void {
  if (
    before.predictionId !== after.predictionId ||
    before.predictedValue !== after.predictedValue ||
    before.predictedAt !== after.predictedAt ||
    before.predictionSchemaVersion !== after.predictionSchemaVersion
  ) {
    throw new PredictionLedgerInvariantError(
      `prediction immutability violated for ${before.predictionId}`,
    );
  }
}

/**
 * 不変条件2+3: actual は NightCheck 入口でのみ入る・set-once・予測は不変。
 * actual がすでに観測済なら拒否（再観測禁止）。actualSourceKind は "night_check" 固定。
 */
export function recordNightCheckActual(
  entry: PredictionEntryV0,
  actual: ConfidentValue<unknown> | RealityAttribute<unknown>,
  observedAt: RealityInstant,
  verdict: PredictionEntryV0["verdict"] = null,
): PredictionEntryV0 {
  if (entry.actualValue !== null) {
    throw new PredictionLedgerInvariantError(
      `actual already observed for ${entry.predictionId} (set-once)`,
    );
  }
  const next: PredictionEntryV0 = {
    ...entry,
    actualValue: actual,
    actualSourceKind: "night_check",
    observedAt,
    verdict: verdict ?? entry.verdict,
  };
  assertPredictionImmutable(entry, next);
  return Object.freeze(next);
}

/**
 * 不変条件2: T_freeze 後の本人補正。intervention(kind="self_report") として追記するのみ。
 * 予測も actual も変更しない（actual は NightCheck のみ・補正は calibration candidate）。
 */
export function recordPostFreezeCorrection(
  entry: PredictionEntryV0,
  correction: { readonly at: string; readonly field: string; readonly evidenceRefs: ReadonlyArray<string> },
): PredictionEntryV0 {
  const next: PredictionEntryV0 = {
    ...entry,
    interventions: [
      ...entry.interventions,
      {
        at: correction.at,
        field: correction.field,
        kind: "self_report",
        evidenceRefs: correction.evidenceRefs,
      },
    ],
  };
  assertPredictionImmutable(entry, next);
  if (next.actualValue !== entry.actualValue || next.actualSourceKind !== entry.actualSourceKind) {
    throw new PredictionLedgerInvariantError(
      `post-freeze correction must not set actual for ${entry.predictionId}`,
    );
  }
  return Object.freeze(next);
}

/**
 * headline match 率の対象か。凍結 source が user_confirmed の予測は除外
 * （本人が確定させた値を「予測が当たった」に数えない — RG0.6b §6）。
 */
export function isHeadlineEligible(entry: PredictionEntryV0): boolean {
  return entry.predictor.kind !== "user_confirmed";
}
