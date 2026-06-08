/**
 * lib/plan/mobility/personalPaceDogfoodReadiness.ts — A1-11: dogfood activation の前チェックを集約判定（pure）
 *
 * ★目的: 「いま本人 dogfood で実反映(flag ON)してよいか」を、A1-7 readiness / A1-8-9 shadow report /
 *   A1-10 per-group gating / pace-capture opt-in / capture 品質 を **まとめて structured に判定**する。
 *   runbook の「ONにしてよい条件 / 撤退条件 / 観測項目」をコードと docs に固定する。
 *
 * ★安全境界（CEO 方針）:
 *   - sparse を activation 可にしない（activation_ready_groups は ready_for_activation の存在を要求）。
 *   - shadow で懸念があれば ready にしない（shadow_confirmed_safe）。
 *   - raw 数値（pace ratio / friction / GPS 座標）を出さない（件数・boolean・status のみ）。
 *   - 実反映はしない（本 helper は判定のみ・flag は別）。calibration 値を触らない。
 *   - pure / Date 不使用 / DB・network 不使用。
 */
import type { PaceActivationReadiness } from "@/lib/plan/mobility/paceActivationReadiness";
import type { PaceShadowActivationReport } from "@/lib/plan/mobility/paceShadowActivation";
import type { MovementEventStore } from "@/lib/plan/mobility/movementEventStore";
import type { LocationOptInState } from "@/lib/alter-morning/journey/locationOptIn";

/** capture データの健全性サマリ（pure・件数のみ・raw pace 値なし）。 */
export interface CaptureQualitySummary {
  readonly totalEvents: number;
  /** mode tag 付き（A1-4 ratio に使える）件数。 */
  readonly taggedEvents: number;
  /** confidence が low でない（high+medium）件数。 */
  readonly nonLowConfidence: number;
  readonly bySource: { readonly manual: number; readonly gps: number; readonly inferred: number };
}

/** store から capture 品質を集約（pure）。 */
export function summarizeCaptureQuality(store: MovementEventStore): CaptureQualitySummary {
  let totalEvents = 0;
  let taggedEvents = 0;
  let nonLowConfidence = 0;
  const bySource = { manual: 0, gps: 0, inferred: 0 };
  for (const legs of Object.values(store.byDay)) {
    for (const ev of Object.values(legs)) {
      totalEvents += 1;
      if (ev.mode !== undefined) taggedEvents += 1;
      if (ev.confidence !== "low") nonLowConfidence += 1;
      bySource[ev.source] += 1;
    }
  }
  return { totalEvents, taggedEvents, nonLowConfidence, bySource };
}

export type DogfoodCheckKey = "opt_in" | "activation_ready_groups" | "shadow_confirmed_safe" | "capture_quality";

export interface DogfoodActivationCheck {
  readonly key: DogfoodCheckKey;
  readonly label: string;
  readonly passed: boolean;
  /** 件数等の qualitative detail（★raw pace 値なし）。 */
  readonly detail: string;
}

export type DogfoodOverall = "not_ready" | "ready_for_dogfood";

export interface PersonalPaceDogfoodReadiness {
  readonly checks: readonly DogfoodActivationCheck[];
  readonly overall: DogfoodOverall;
  /** 失敗した check の label（ONにできない理由）。 */
  readonly blockers: readonly string[];
  /** dogfood 中に観測する項目（runbook・固定）。 */
  readonly watchItems: readonly string[];
  /** 撤退条件（runbook・固定）。 */
  readonly rollbackConditions: readonly string[];
}

/** ★runbook: dogfood 中に観測する項目（固定）。 */
export const DOGFOOD_WATCH_ITEMS: readonly string[] = [
  "過悲観（holds→breaks への誤反転）",
  "誤検出 prompt の多発",
  "電池の悪化",
  "自分の感覚とのペースの違和感",
];

/** ★runbook: 撤退条件（固定・撤退は flag OFF・calibration はいじらない）。 */
export const DOGFOOD_ROLLBACK_CONDITIONS: readonly string[] = [
  "過悲観が複数日続く → flag OFF",
  "誤検出 prompt が頻発 → flag OFF",
  "電池が悪化 → flag OFF",
  "shadow の懸念が継続 → flag OFF（原因を観測してから再設計・calibration は変えない）",
];

export interface DogfoodReadinessConfig {
  /** capture 品質 check に必要な tag 付き件数。 */
  readonly minTaggedEvents: number;
}

export const DEFAULT_DOGFOOD_READINESS_CONFIG: DogfoodReadinessConfig = {
  minTaggedEvents: 8,
};

/**
 * dogfood activation の前チェックを集約判定（pure）。
 * 4 check が全て pass のときだけ ready_for_dogfood。1 つでも fail なら not_ready + blockers。
 */
export function buildPersonalPaceDogfoodReadiness(input: {
  readonly readiness: PaceActivationReadiness;
  readonly shadowReport: PaceShadowActivationReport | null;
  readonly optInState: LocationOptInState;
  readonly captureQuality: CaptureQualitySummary;
  readonly config?: DogfoodReadinessConfig;
}): PersonalPaceDogfoodReadiness {
  const config = input.config ?? DEFAULT_DOGFOOD_READINESS_CONFIG;
  const { readiness, shadowReport, optInState, captureQuality } = input;

  const shadowSafe = shadowReport != null && shadowReport.ran && !shadowReport.anyConcern;

  const checks: DogfoodActivationCheck[] = [
    {
      key: "opt_in",
      label: "移動記録の opt-in",
      passed: optInState === "granted",
      detail: optInState === "granted" ? "許可済" : `未許可（${optInState}）`,
    },
    {
      key: "activation_ready_groups",
      label: "反映できる区間（ready_for_activation）",
      passed: readiness.readyForActivationCount >= 1,
      detail: `ready_for_activation: ${readiness.readyForActivationCount} 区間 / shadow可: ${readiness.readyForShadowCount}`,
    },
    {
      key: "shadow_confirmed_safe",
      label: "shadow で懸念なし",
      passed: shadowSafe,
      detail: shadowReport == null
        ? "shadow 未実行（flag OFF / 未観測）"
        : !shadowReport.ran
          ? "観測不足（shadow 走らず）"
          : shadowReport.anyConcern
            ? "懸念あり（過悲観/marker/診断悪化/過変化のいずれか）"
            : "懸念なし",
    },
    {
      key: "capture_quality",
      label: "記録データの質",
      passed: captureQuality.taggedEvents >= config.minTaggedEvents && captureQuality.nonLowConfidence > 0,
      detail: `tag付 ${captureQuality.taggedEvents} 件 / 非低信頼 ${captureQuality.nonLowConfidence} 件（手動 ${captureQuality.bySource.manual}・GPS ${captureQuality.bySource.gps}）`,
    },
  ];

  const overall: DogfoodOverall = checks.every((c) => c.passed) ? "ready_for_dogfood" : "not_ready";
  const blockers = checks.filter((c) => !c.passed).map((c) => c.label);

  return {
    checks,
    overall,
    blockers,
    watchItems: DOGFOOD_WATCH_ITEMS,
    rollbackConditions: DOGFOOD_ROLLBACK_CONDITIONS,
  };
}
