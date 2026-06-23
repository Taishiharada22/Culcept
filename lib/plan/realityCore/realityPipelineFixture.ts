/**
 * Reality OS pipeline の deterministic fixture（P3-1・test/dogfood 専用・production 入力でない）
 *
 * current / protect / easy / push の 4 scenario を固定値で供給。実ユーザー資産・DB・fetch なし。
 * feasibility/collapse は injected summary（deep-graph 実呼びは P3-1b）。
 */

import type { RealityPipelineInputV0, RealityPipelineScenarioInputV0 } from "./realityPipelineSurface";
import type { WorkOverrunRiskInputV0 } from "./workOverrunRisk";
import type { MinimalProgressCandidateInputV0 } from "./taskMinimalProgress";

const overrun = (estimatedMinutes: number, plannedMinutes: number): WorkOverrunRiskInputV0 => ({
  estimatedMinutes,
  plannedMinutes,
  flexibility: "flexible",
  cognitiveLoad: 0.5,
  energyFit: "medium",
  hasMinimalProgress: true,
  priorOverruns: 0,
  sourceKind: "fixture",
  evidenceRefs: ["fixture:overrun"],
});

const mpCandidate = (text: string, userConfirmed = false): MinimalProgressCandidateInputV0 => ({
  text,
  sourceKind: userConfirmed ? "user_confirmed" : "llm",
  evidenceRefs: userConfirmed ? ["user:tap"] : ["llm:gpt"],
});

const CURRENT: RealityPipelineScenarioInputV0 = {
  scenarioId: "current",
  scenarioKind: "current",
  feasibilityStatus: "feasible_with_risk",
  collapseRiskLevel: "elevated",
  overrunInput: overrun(55, 60), // 枠付近=medium（push の high を worse として検出するための baseline）
  minimalProgressCandidates: [],
  minimalProgressContext: { taskText: "資料を作成する", canSplit: true },
  permissionBoundary: 2,
  realityDiffSummary: null,
  dayRehearsalSummary: "夜帯に作業集中・余白薄め",
  reasonCodes: [],
  evidence: ["fixture:current"],
  confidence: 0.5,
};

/** 守る = 締切/他人/最低限の前進を保護（成立↑・崩れ↓・超過↓） */
const PROTECT: RealityPipelineScenarioInputV0 = {
  scenarioId: "protect",
  scenarioKind: "protect",
  feasibilityStatus: "feasible",
  collapseRiskLevel: "low",
  overrunInput: overrun(30, 60), // 余裕
  minimalProgressCandidates: [mpCandidate("資料の構成を3行で書く", true)],
  minimalProgressContext: { taskText: "資料を作成する", canSplit: true },
  permissionBoundary: 2,
  realityDiffSummary: { added: 0, removed: 0, changed: 1, resolved: 1, collapsed: 0 },
  dayRehearsalSummary: "会議後に30分だけ前進",
  reasonCodes: ["proposal:protect"],
  evidence: ["fixture:protect"],
  confidence: 0.5,
};

/** 楽 = 回復優先・翌日成立（崩れ↓・超過↓・成立は据え置き） */
const EASY: RealityPipelineScenarioInputV0 = {
  scenarioId: "easy",
  scenarioKind: "easy",
  feasibilityStatus: "feasible_with_risk",
  collapseRiskLevel: "low",
  overrunInput: overrun(20, 90),
  minimalProgressCandidates: [mpCandidate("明日の午前に回す準備を1つ", true)],
  minimalProgressContext: { taskText: "資料を作成する", canSplit: true },
  permissionBoundary: 2,
  realityDiffSummary: { added: 1, removed: 0, changed: 0, resolved: 0, collapsed: 0 },
  dayRehearsalSummary: "今日は着手のみ",
  reasonCodes: ["proposal:easy"],
  evidence: ["fixture:easy"],
  confidence: 0.5,
};

/** 攻める = 前倒し（成立は据え置きだが超過↑・崩れ↑の可能性） */
const PUSH: RealityPipelineScenarioInputV0 = {
  scenarioId: "push",
  scenarioKind: "push",
  feasibilityStatus: "feasible_with_risk",
  collapseRiskLevel: "high",
  overrunInput: overrun(95, 60), // 強い超過
  minimalProgressCandidates: [mpCandidate("今夜25分だけ着手")], // LLM 提案（未採用）
  minimalProgressContext: { taskText: "資料を作成する", canSplit: true },
  permissionBoundary: 2,
  realityDiffSummary: { added: 0, removed: 0, changed: 2, resolved: 0, collapsed: 1 },
  dayRehearsalSummary: "今夜前倒し・疲労リスク",
  reasonCodes: ["proposal:push"],
  evidence: ["fixture:push"],
  confidence: 0.5,
};

export const REALITY_PIPELINE_FIXTURE: RealityPipelineInputV0 = {
  current: CURRENT,
  scenarios: [PROTECT, EASY, PUSH],
};

/** unknown 入力 fixture（honest-unknown 検証用） */
export const REALITY_PIPELINE_FIXTURE_UNKNOWN: RealityPipelineInputV0 = {
  current: { ...CURRENT, feasibilityStatus: "unknown" },
  scenarios: [PROTECT],
};
