/**
 * Reality OS surface presenter（P3-5・pure・非 JSX）
 *
 * 凍結 surface 契約 `RealityOsSurfaceV0`(redacted) を **UI に渡しやすい表示VM** に変換する pure presenter。
 * P3-6（dev-reality-pipeline additive 表示）の前提。UI / JSX / PlanClient / API / DB には繋がない。
 *
 * redaction 維持:
 *  - presenter は surface に存在する field のみ読む。raw evidence / ledgerRefs / graph を**復元しない**。
 *  - evidenceCount は**件数表示のみ**。reasonCodes は **controlled prefix のみ**日本語化し、未知 code は **drop**
 *    （生文字列を表示に戻さない＝防御的 redaction）。
 *  - permissionBoundary は**緩めない**（値をそのまま capability 語にするだけ・改変しない）。
 *  - unknown / honestUnknown は**正直に「不明」表示**（断定しない）。
 *
 * 規律: pure・no Date・no IO・no fetch・no env・no DB・no LLM。additive（契約不変更）。
 */

import { PERMISSION_LEVEL_CAPABILITY, type PermissionLevel } from "@/lib/plan/reality/permission/permission-model";
import type { Shift } from "@/lib/plan/realityCore/futureSimulation";
import type { RealityOsSurfaceV0, RealityOsScenarioSurfaceV0 } from "./realityOsSurfaceContract";

export type ConfidenceBand = "低" | "中" | "高" | "不明";

export interface RealityOsScenarioDisplayV0 {
  readonly scenarioId: string;
  readonly kindLabel: string;
  readonly feasibilityLabel: string;
  readonly overrunLabel: string;
  readonly collapseLabel: string;
  readonly minimalProgressText: string | null;
  readonly permissionLabel: string;
  readonly confidenceBand: ConfidenceBand;
  readonly diffSummaryText: string | null;
  readonly evidenceText: string;
  readonly reasonText: ReadonlyArray<string>;
  /** この scenario が unknown を含む（正直表示用） */
  readonly isUnknown: boolean;
}

export interface RealityOsSurfaceDisplayV0 {
  readonly scenarios: ReadonlyArray<RealityOsScenarioDisplayV0>;
  /** honestUnknown=true の時のみ正直表示文・false は null */
  readonly honestUnknownLabel: string | null;
  readonly noteReasonText: ReadonlyArray<string>;
}

const KIND_LABEL: Record<string, string> = {
  current: "現在",
  protect: "守る",
  easy: "楽に",
  push: "攻める",
  custom: "その他",
};

// shift → 記述語（非指示形・current 比の変化のみ。指示・命令にしない）
const FEASIBILITY_LABEL: Record<Shift, string> = {
  better: "成立しやすくなる",
  same: "変わらない",
  worse: "成立しにくくなる",
  unknown: "まだ読めていません",
};
const OVERRUN_LABEL: Record<Shift, string> = {
  better: "時間超過しにくくなる",
  same: "変わらない",
  worse: "時間超過しやすくなる",
  unknown: "まだ読めていません",
};
const COLLAPSE_LABEL: Record<Shift, string> = {
  better: "崩れにくくなる",
  same: "変わらない",
  worse: "崩れやすくなる",
  unknown: "まだ読めていません",
};

// controlled reasonCode → 日本語文。*_shift: は label で既出なので変換せず drop（重複回避）。
function reasonCodeToText(code: string): string | null {
  if (code.startsWith("feasibility_shift:") || code.startsWith("overrun_shift:") || code.startsWith("collapse_shift:")) {
    return null; // label で表示済
  }
  switch (code) {
    case "proposal:protect":
      return "守る案として提示";
    case "proposal:easy":
      return "楽な案として提示";
    case "proposal:push":
      return "攻める案として提示";
    case "proposal_basis:diff_collapsed":
      return "崩れ箇所の差分にもとづく";
    case "proposal_basis:change_task":
      return "作業の変更にもとづく";
    case "proposal_basis:gradient_axis":
      return "傾向の軸にもとづく";
    case "proposal_unresolved":
      return "未確定の入力があり、確かさは低めです";
    case "current_incomplete":
      return "現在の状態にまだ読めていない部分があります";
    case "contains_unknown_shift":
      return "一部まだ読めていない項目があります";
    default:
      return null; // 未知 code は drop（生文字列を表示に戻さない＝redaction）
  }
}

function confidenceBand(confidence: number): ConfidenceBand {
  if (!Number.isFinite(confidence)) return "不明";
  if (confidence < 0.34) return "低";
  if (confidence < 0.67) return "中";
  return "高";
}

function diffSummaryText(d: RealityOsScenarioSurfaceV0["realityDiffSummary"]): string | null {
  if (!d) return null;
  return `追加${d.added}・変更${d.changed}・解消${d.resolved}・崩壊${d.collapsed}`;
}

function presentScenario(s: RealityOsScenarioSurfaceV0): RealityOsScenarioDisplayV0 {
  const isUnknown =
    s.feasibilityShift === "unknown" || s.overrunRiskShift === "unknown" || s.collapseRiskShift === "unknown";
  return {
    scenarioId: s.scenarioId,
    kindLabel: KIND_LABEL[s.scenarioKind] ?? "その他",
    feasibilityLabel: FEASIBILITY_LABEL[s.feasibilityShift],
    overrunLabel: OVERRUN_LABEL[s.overrunRiskShift],
    collapseLabel: COLLAPSE_LABEL[s.collapseRiskShift],
    minimalProgressText: s.minimalProgressText,
    permissionLabel: PERMISSION_LEVEL_CAPABILITY[s.permissionBoundary as PermissionLevel] ?? "不明",
    confidenceBand: confidenceBand(s.confidence),
    diffSummaryText: diffSummaryText(s.realityDiffSummary),
    evidenceText: s.evidenceCount === 0 ? "根拠なし" : `根拠${s.evidenceCount}件`,
    reasonText: s.reasonCodes.map(reasonCodeToText).filter((t): t is string => t !== null),
    isUnknown,
  };
}

/**
 * surface 契約 → 表示VM（pure・redaction 維持・honest-unknown 正直表示）。
 */
export function presentRealityOsSurface(surface: RealityOsSurfaceV0): RealityOsSurfaceDisplayV0 {
  return {
    scenarios: surface.scenarios.map(presentScenario),
    honestUnknownLabel: surface.honestUnknown ? "まだ確実には読めていない部分があります" : null,
    noteReasonText: surface.reasonCodes.map(reasonCodeToText).filter((t): t is string => t !== null),
  };
}
