/**
 * PredictionLedger 型契約（RC2a-1・**型のみ・runtime なし**）
 *
 * 正本: docs/reality-graph-identity-hardening-rg06b.md §5-6 / RG0.6 §9
 *
 * 不変性（RG0.6a §3 / RG0.6b §6）:
 *  - predictedValue / predictedAt は immutable。T_freeze 後の userCorrection は予測を変更しない
 *  - T_freeze 後 correction の身分 = intervention evidence / calibration candidate（actual ではない —
 *    actual は NightCheck dayFelt のみ）
 *  - 凍結値 source が user_confirmed の field は headline match 率から除外（isHeadlineEligible 実装済み）
 *
 * 既存実装との対応（v0 = 部分集合）: predictedAt/Value = estimatesFrozen / actual = NightCheck /
 *  gradingFunction = gradeNightCheck 系 / learningCandidate = nextDayPriorAdjustments。
 *  ledger 形への保存正規化は SSC と同じ gate（保存形式の変更）。
 */

import type { ConfidentValue } from "@/lib/stargazer/alterHomeAdapter";
import type { GradeVerdict } from "@/lib/plan/dayState/dayStateTypes";
import type { RealityAttribute } from "./realityAttribute";
import type { DerivationVersionSet, InputRevisionSet } from "./graphIdentity";
import type { RealityInstant } from "./realityInstant";

export type PredictionHorizon = "day" | "evening" | "event";
export type PredictionTargetNodeKind = "day" | "event" | "movement";

/** 「誰が何で予測したか」を後から追えるようにする（RC2a-1b §7 — predictedBy 単一文字列を廃止） */
export interface PredictionPredictor {
  readonly kind: "heuristic" | "model" | "user_confirmed" | "mixed";
  readonly version: string; // 例: "dayState@v0"
  readonly modelId: string | null; // LLM/model 使用時のみ
  readonly calibrationSource: string | null; // B1 補正が効いている場合の出所
}

export interface PredictionEntryV0 {
  /** `pred:<subjectiveDate>:<targetNodeId>:<field>:<horizon>:<inputRevisionHash>` — 再凍結・event horizon でも一意 */
  readonly predictionId: string;
  readonly predictionSchemaVersion: 0;

  // ── 何に対する予測か（RG0.6b §5） ──
  readonly targetNodeKind: PredictionTargetNodeKind;
  readonly targetNodeId: string; // record date / ern:… / mv:…
  readonly targetField: string; // 例: "energyLevel" / "recoveryNeed" / "dayFeasibility"
  readonly horizon: PredictionHorizon; // v0 は "day" のみ

  // ── どの入力・どのモデル・どの時点の Graph から出たか ──
  readonly frozenSnapshotId: string;
  readonly graphBaseId: string;
  /** 凍結時点の複製（後から入力が変わっても予測の出自は不変）。
   *  hash は短縮 key にすぎない — 永続 identity は full payload を保持（RC2a-1b §2） */
  readonly inputRevisionSet: InputRevisionSet;
  /** derive version manifest の全複製（hash でなく full — collision 時に別入力を同一予測と誤認しない） */
  readonly derivationVersions: DerivationVersionSet;
  readonly predictor: PredictionPredictor;
  readonly predictedAt: RealityInstant;

  // ── 予測と実績（裸値禁止） ──
  readonly predictedValue: ConfidentValue<unknown> | RealityAttribute<unknown>;
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly actualValue: ConfidentValue<unknown> | RealityAttribute<unknown> | null;
  readonly observedAt: RealityInstant | null;
  /** T_freeze 後の本人補正（actual ではなく separate intervention — RG0.6b §6）。
   *  kind="self_report" = 「今の実感」の観測（grading actual には使わない・calibration には使える・
   *  UI 即時反映は既実装 — RC2a-1b §8） */
  readonly interventions: ReadonlyArray<{
    readonly at: string; // "HH:MM"
    readonly field: string;
    readonly kind: "self_report" | "other";
    readonly evidenceRefs: ReadonlyArray<string>;
  }>;

  // ── 採点（再現性のためバージョン参照） ──
  readonly gradingFunction: string; // 例: "gradeEnergyLevel"
  readonly gradingFunctionVersion: string; // 例: "v0"（REALITY_DERIVATION_VERSIONS.predictionGrading と対応）
  readonly verdict: GradeVerdict | null;
  /** B1 消費候補か + 過学習防止の品質指標（RG0.6b §14） */
  readonly learningCandidate: {
    readonly eligible: boolean;
    readonly evidenceQuality: "high" | "medium" | "low";
    readonly sampleSize: number;
    readonly recencyDays: number;
  } | null;
}
