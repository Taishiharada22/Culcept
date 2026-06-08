"use client";
/**
 * /plan/dev-learning-report — A1-7-2 Shadow Learning Preview（dev/staging 限定・render-only・**no-persist・no-route・no-DB**・fixtures のみ）
 *
 * 目的: A1-7-1 `aggregateDryRunEvents` の結果（tentative pattern report）を **fixture dry-run events** から描画し、
 *   PRM 永続化**前**に **学習品質・過断定防止・counter-evidence 表示** を目視検証する（shadow 観測）。
 *   実 event / DB / persistence / route 接続なし。pure 集約を render するだけ。
 *
 * 目視ポイント: certainty が最大 tentative（high なし）/ counter-evidence（counterCount）が見える / 他仮説（stillPossible）が残る /
 *   同じ dismiss でも文脈次元で favored hypothesis が分岐（band→timing / confidence→framing mismatch）。
 */

import { toDryRunLearningEvent, hypothesisLabel, type CandidateActionContext } from "@/lib/plan/reality/learning/dry-run-learning-event";
import { aggregateDryRunEvents, type TentativePattern, type TentativePatternReport } from "@/lib/plan/reality/learning/dry-run-aggregation";
import { projectPrmDryRun, blockedReasonLabel, type PrmDryRunProposal, type PrmDryRunProjection } from "@/lib/plan/reality/learning/prm-dry-run-projection";
import type { CandidateActionKind } from "@/lib/plan/reality/candidate-action";
import { ReviewButtons } from "./ReviewButtons";

const HANDLE = "c1:" + "f".repeat(64);
function ev(action: CandidateActionKind, over: Partial<CandidateActionContext>) {
  return toDryRunLearningEvent({ handle: HANDLE, date: "2026-06-15", band: "afternoon", confidenceBand: "medium", durationMin: 60, evidenceSource: "seed_explicit", ...over }, action);
}

/**
 * 代表 fixture（A1-7-2 pattern + A1-7-4 proposal candidate/blocked を 1 画面で見せる）:
 *   - evening の dismiss ×6（≥5・high-confidence）→ band/duration 次元 not_now（timing）+ confidence 次元 mismatch（framing）= **candidate**（同 dismiss が次元で分岐）
 *   - morning の accept ×3（<5）→ tentative だが evidence 不足 → **blocked(evidence_insufficient)**
 *   - afternoon は割れ → mixed/low → **blocked(certainty_low)**
 */
function fixtureEvents() {
  return [
    ev("dismiss", { band: "evening", confidenceBand: "high", durationMin: 60 }),
    ev("dismiss", { band: "evening", confidenceBand: "high", durationMin: 90 }),
    ev("dismiss", { band: "evening", confidenceBand: "high", durationMin: 45 }),
    ev("dismiss", { band: "evening", confidenceBand: "high", durationMin: 75 }),
    ev("dismiss", { band: "evening", confidenceBand: "high", durationMin: 50 }),
    ev("dismiss", { band: "evening", confidenceBand: "high", durationMin: 80 }),
    ev("accept", { band: "morning", confidenceBand: "low", durationMin: 20 }),
    ev("accept", { band: "morning", confidenceBand: "low", durationMin: 25 }),
    ev("accept", { band: "morning", confidenceBand: "low", durationMin: 30 }),
    ev("accept", { band: "afternoon", confidenceBand: "medium", durationMin: 60 }),
    ev("dismiss", { band: "afternoon", confidenceBand: "medium", durationMin: 100 }),
    ev("later", { band: "afternoon", confidenceBand: "medium", durationMin: 90 }),
  ];
}

const DIM_LABEL: Record<string, string> = { band: "時間帯", durationBucket: "所要時間", confidence: "確信度", source: "根拠" };
const ACTION_LABEL: Record<CandidateActionKind, string> = { accept: "採用", dismiss: "見送り", later: "あとで" };
const CONSISTENCY_LABEL: Record<string, string> = { mixed: "割れ", leaning: "やや", consistent: "一貫" };
const CERTAINTY_STYLE: Record<string, string> = {
  low: "bg-gray-100 text-gray-500",
  tentative: "bg-amber-50 text-amber-700 border border-amber-200",
};

function PatternCard({ p }: { p: TentativePattern }) {
  return (
    <li className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px]" data-testid="pattern-card">
      <div className="flex items-center gap-2">
        <span className="font-medium text-gray-700">
          {DIM_LABEL[p.dimension] ?? p.dimension}「{p.value}」
        </span>
        <span className="text-gray-500">
          {ACTION_LABEL[p.dominantAction]}が{CONSISTENCY_LABEL[p.consistency] ?? p.consistency}
        </span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${CERTAINTY_STYLE[p.certainty] ?? ""}`}>
          {p.certainty}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-gray-500">
        {p.eventCount}件中 {p.dominantCount}（counter <b className="text-rose-500">{p.counterCount}</b>）
      </div>
      <div className="mt-1 text-[11px]">
        <span className="text-purple-700">仮説: {hypothesisLabel(p.favoredHypothesis)}</span>
        {p.stillPossible.length > 0 && (
          <span className="text-gray-400">（他に残す: {p.stillPossible.map(hypothesisLabel).join(" / ")}）</span>
        )}
      </div>
      <div className="mt-1 text-[11px] text-gray-600">{p.note}</div>
    </li>
  );
}

/** A1-7-4: PRM dry-run proposal（candidate=amber / blocked=gray・要 review）。A1-7-33: reviewEnabled で candidate に review ボタン。 */
function ProposalCard({ p, reviewEnabled }: { p: PrmDryRunProposal; reviewEnabled?: boolean }) {
  const isCandidate = p.status === "candidate";
  return (
    <li
      className={`rounded-lg border px-3 py-2 text-[12px] ${isCandidate ? "border-amber-300 bg-amber-50/50" : "border-gray-200 bg-gray-50/70"}`}
      data-testid="proposal-card"
    >
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${isCandidate ? "bg-amber-200 text-amber-900" : "bg-gray-200 text-gray-500"}`}
          data-testid={isCandidate ? "proposal-candidate" : "proposal-blocked"}
        >
          {p.status}
        </span>
        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] text-purple-600">要 review</span>
        <span className="ml-auto text-[10px] text-gray-400">{p.certainty}</span>
      </div>
      <div className={`mt-1 text-[11px] ${isCandidate ? "text-gray-700" : "text-gray-500"}`}>{p.tentativeInterpretation}</div>
      <div className="mt-1 text-[10px] text-gray-500">
        evidence {p.evidenceCount} / counter <b className="text-rose-500">{p.counterCount}</b>
        {p.stillPossible.length > 0 && <span> / 他に残す {p.stillPossible.length}件</span>}
      </div>
      {p.blockedReason && <div className="mt-1 text-[10px] text-gray-400">blocked: {blockedReasonLabel(p.blockedReason)}</div>}
      <div className="mt-1 text-[10px] text-gray-400">{p.whyProposalOnly}</div>
      {reviewEnabled && isCandidate && <ReviewButtons p={p} />}
    </li>
  );
}

export function LearningReportPreviewClient({
  report: reportProp,
  projection: projectionProp,
  live,
  reviewEnabled,
}: { report?: TentativePatternReport; projection?: PrmDryRunProjection; live?: boolean; reviewEnabled?: boolean } = {}) {
  // A1-7-28: props 指定（live=staging events から server 集約）なら使用・なければ fixture（既存挙動）。
  const report = reportProp ?? aggregateDryRunEvents(fixtureEvents());
  const projection = projectionProp ?? projectPrmDryRun(report); // A1-7-4: PRM 保存前の proposal projection（保存しない）
  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-800" data-testid="learning-report">
      <h1 className="text-lg font-bold">{live ? "Live Learning Observation（staging dogfood）" : "Shadow Learning Report（dry-run）"}</h1>
      <p className="mt-1 text-[12px] text-gray-500">
        A1-7-{live ? "28" : "2"}・dev/staging 限定・<b>render-only</b>。{live ? "あなたの staging learning events（owner-only）" : "fixture dry-run events"} を{" "}
        <b>aggregateDryRunEvents</b>（同日 dedup）で集約した tentative pattern。<b>{live ? "PRM 本体に保存しない・観測のみ" : "実 event / DB / persistence なし"}</b>。
        certainty は最大 <b>tentative</b>・counter-evidence と他仮説（stillPossible）を残す設計（同じ dismiss でも band→timing / confidence→framing に分岐）。
      </p>
      <div className="mt-2 text-[11px] text-gray-400">
        totalEvents: {report.totalEvents} / patterns: {report.patterns.length} / assertsPersonality:{" "}
        {String(report.assertsPersonality)} / kind: {report.kind}
      </div>
      <ul className="mt-3 space-y-2">
        {report.patterns.map((p, i) => (
          <PatternCard key={i} p={p} />
        ))}
      </ul>

      <h2 className="mt-6 text-[13px] font-semibold text-gray-700">PRM dry-run proposals（永続化前・要 review）</h2>
      <p className="mt-1 text-[11px] text-gray-500">
        上の pattern を A1-7-3 <b>projectPrmDryRun</b> で PRM 更新候補に投影。<b>PRM 本体に保存しない</b>（persisted: false）。
        tentative かつ evidence≥5 のみ <b>candidate</b>・それ以外は <b>blocked</b>（certainty_low / evidence_insufficient）。全提案 <b>要 review</b>。
      </p>
      <div className="mt-1 text-[11px] text-gray-400">
        candidates: <b className="text-amber-700">{projection.candidates.length}</b> / blocked: {projection.blocked.length} / persisted:{" "}
        {String(projection.persisted)} / assertsPersonality: {String(projection.assertsPersonality)} / kind: {projection.kind}
      </div>
      <ul className="mt-2 space-y-2" data-testid="proposal-list">
        {projection.proposals.map((p, i) => (
          <ProposalCard key={i} p={p} reviewEnabled={reviewEnabled} />
        ))}
      </ul>
    </div>
  );
}
