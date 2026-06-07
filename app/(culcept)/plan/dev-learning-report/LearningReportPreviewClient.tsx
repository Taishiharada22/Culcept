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
import { aggregateDryRunEvents, type TentativePattern } from "@/lib/plan/reality/learning/dry-run-aggregation";
import type { CandidateActionKind } from "@/lib/plan/reality/candidate-action";

const HANDLE = "c1:" + "f".repeat(64);
function ev(action: CandidateActionKind, over: Partial<CandidateActionContext>) {
  return toDryRunLearningEvent({ handle: HANDLE, date: "2026-06-15", band: "afternoon", confidenceBand: "medium", durationMin: 60, evidenceSource: "seed_explicit", ...over }, action);
}

/**
 * 代表 fixture（disambiguation/counter-evidence/certainty 上限を 1 画面で見せる）:
 *   - evening の dismiss 一貫 → band 次元で not_now（timing）
 *   - high-confidence の dismiss 一貫 → confidence 次元で mismatch_unknown（framing）= 同じ dismiss でも次元で分岐
 *   - morning の accept 一貫 → positive_signal
 *   - afternoon は割れ → mixed/low（counter-evidence demo）
 */
function fixtureEvents() {
  return [
    ev("dismiss", { band: "evening", confidenceBand: "high", durationMin: 60 }),
    ev("dismiss", { band: "evening", confidenceBand: "high", durationMin: 90 }),
    ev("dismiss", { band: "evening", confidenceBand: "high", durationMin: 45 }),
    ev("dismiss", { band: "afternoon", confidenceBand: "high", durationMin: 120 }),
    ev("accept", { band: "morning", confidenceBand: "low", durationMin: 20 }),
    ev("accept", { band: "morning", confidenceBand: "low", durationMin: 25 }),
    ev("accept", { band: "morning", confidenceBand: "low", durationMin: 30 }),
    ev("accept", { band: "afternoon", confidenceBand: "medium", durationMin: 60 }),
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

export function LearningReportPreviewClient() {
  const report = aggregateDryRunEvents(fixtureEvents());
  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-800" data-testid="learning-report">
      <h1 className="text-lg font-bold">Shadow Learning Report（dry-run）</h1>
      <p className="mt-1 text-[12px] text-gray-500">
        A1-7-2・dev/staging 限定・<b>render-only</b>。fixture dry-run events を <b>aggregateDryRunEvents</b> で集約した
        tentative pattern。<b>実 event / DB / persistence なし</b>。certainty は最大 <b>tentative</b>・counter-evidence と
        他仮説（stillPossible）を残す設計を目視確認（同じ dismiss でも band→timing / confidence→framing に分岐）。
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
    </div>
  );
}
