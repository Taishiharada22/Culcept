/**
 * lib/plan/mobility/movementToleranceReasonUi.ts
 *   — Movement Tolerance UI: 移動手段カードの **reason-only / read-only** 1 行補助（pure core + flag）
 *
 * ★目的（CEO 2026-06-09 承認・reason-only）: 移動耐性の観測を **本人に見える 1 行**で控えめに添える。
 *   ranking / scoring / Day Rehearsal friction には **反映しない**（読むだけ）。
 *
 * ★表示規律（CEO 制約）:
 *   - **dogfood 有効化（2026-06-09 CEO 判断）で flag=true**。gate `process.env.NODE_ENV !== "production"` により
 *     **dev/dogfood のみ ON・production は hard block**（flag=true でも production 挙動は不変・露出は別 CEO 判断）。
 *   - ★**1 行のみ**。優先順 = 条件一致の conditional（weather>timeband>weekday）> global corroboration（fallback）。
 *     各行は自立し **融合しない**（条件が自己申告で裏づいたと誤読させない＝HONESTY 制約）。
 *   - 条件一致 = 今の文脈（今日の天気/この leg の timeband/曜日）が tolerance signal に一致した時のみ → 出すぎ防止・沈黙デフォルト。
 *   - sparse（not_enough）/ 一致 signal なし / 非corroborate → null（沈黙）。
 *   - sensitive / redacted / readOnly は **呼び側が沈黙**（本 module は呼ばれた観測だけ読む）。
 *   - raw count / score / confidence / 内部値は出さない（reason 文字列のみ）。trait / 人格診断にしない。
 */
import { isAneuraReadoutProdEnabled } from "@/lib/plan/aneuraReadoutGate";
import type { MobilityObservation, Timeband, WeekdayBucket } from "@/lib/plan/mobility/mobilityObservationStore";
import type { HypothesisFeedbackStore } from "@/lib/plan/mobility/hypothesisFeedbackStore";
import type { WeatherKind } from "@/lib/plan/context/contextModifier";
import {
  buildMovementTolerance,
  movementToleranceReasonLine,
  type ToleranceDimension,
} from "@/lib/plan/mobility/movementTolerance";
import { buildMovementToleranceCorroboration } from "@/lib/plan/mobility/movementToleranceCorroboration";

/**
 * ★Movement Tolerance reason-only UI flag。**dogfood 有効化（2026-06-09 CEO 判断）で true**。
 * gate の `process.env.NODE_ENV !== "production"` により **dev/dogfood のみ ON・production は hard block**。
 * ★ranking / scoring / Day Rehearsal friction には影響しない（reason 表示のみ・read-only）。rollback=`=false` 1 行。
 */
export const MOVEMENT_TOLERANCE_REASON_UI_ENABLED = true;

/** 移動耐性 reason を出してよいか（flag ON ∧ 非 production・default OFF）。 */
export function isMovementToleranceReasonUiEnabled(): boolean {
  return (MOVEMENT_TOLERANCE_REASON_UI_ENABLED && process.env.NODE_ENV !== "production") || isAneuraReadoutProdEnabled(); // master flag で本番解放（default OFF）
}

/** 今の文脈（条件一致用）。null は「その次元では一致判定しない」。 */
export interface MovementToleranceUiContext {
  readonly weather?: WeatherKind | null;
  readonly timeband?: Timeband | null;
  readonly weekday?: WeekdayBucket | null;
}

/** ★global self-report corroboration の UI 文言（CEO 例準拠・hedge 付き＝過悲観回避・条件に言及しない）。 */
export const MOVEMENT_TOLERANCE_CORROBORATION_UI_LINE =
  "自己申告でも、疲れによる移動負荷の回避が少し見えています。";

/** 条件一致を見る次元の優先順（weather>timeband>weekday）。 */
const DIMENSION_PRIORITY: readonly { dim: ToleranceDimension; value: (ctx: MovementToleranceUiContext) => string | null | undefined }[] = [
  { dim: "weather", value: (c) => c.weather },
  { dim: "timeband", value: (c) => c.timeband },
  { dim: "weekday", value: (c) => c.weekday },
];

/**
 * ★移動耐性の **1 行**を文脈優先で選ぶ（pure・read-only）。
 *   ①今の条件に一致する conditional signal（weather>timeband>weekday）→ その reason 行。
 *   ②無ければ global corroboration が立つ時のみ corroboration 行（fallback）。
 *   ③どちらも無ければ null（沈黙）。
 * ★呼び側が sensitive/readOnly/flag OFF で null を渡す/呼ばないことで沈黙する（本 module は判定しない）。
 */
export function movementToleranceReasonForContext(
  observations: readonly MobilityObservation[],
  feedback: HypothesisFeedbackStore,
  ctx: MovementToleranceUiContext,
): string | null {
  // ① 条件一致 conditional（優先順）
  const readiness = buildMovementTolerance(observations);
  if (readiness.status === "ready") {
    for (const { dim, value } of DIMENSION_PRIORITY) {
      const v = value(ctx);
      if (v == null) continue;
      const signal = readiness.signals.find((s) => s.condition.dimension === dim && s.condition.value === v);
      if (signal) {
        const line = movementToleranceReasonLine(signal);
        if (line) return line; // 条件一致を最優先（最も「今」に関連）
      }
    }
  }
  // ② fallback: global self-report corroboration（条件に言及しない・融合しない）
  const corroboration = buildMovementToleranceCorroboration(feedback);
  if (corroboration.status === "ready" && corroboration.corroboratesLoadAvoidance) {
    return MOVEMENT_TOLERANCE_CORROBORATION_UI_LINE;
  }
  // ③ 沈黙
  return null;
}
