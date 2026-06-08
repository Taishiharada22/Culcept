/**
 * Reality Control OS — R1–R5 Pure Orchestration Pipeline（**pure・no-apply・redacted**・barrel 非 export）
 *
 * 設計: docs/reality-secretary-os-unbuilt-roadmap.md / R1–R5 各 slice
 *
 * 役割: 個別完成した R1〜R5 を **実介入なしで 1 本の pure pipeline** に接続し、
 *   「記憶 → 空白の日 → 現実状態 → trigger → permission gate → ChangeSet draft」が破綻なく流れることを検証する。
 *   出力は **observation 用 redacted envelope**（raw/seedRef/PII/具体 item を出さない）。
 *
 * 厳守（CEO 必須条件）: ChangeSet は draft のみ・**apply しない**・allowed でも実行しない・**高リスクは confirm/blocked**・
 *   insufficient context は捏造せず止める・suppressed memory は使わない（synthesize/derive が保証）・confidence high 禁止・
 *   trait/fixed/liked-disliked 禁止・**return/log は redacted**・silence-by-default 維持・pure・Date.now なし（nowMs を渡す）。
 */

import { synthesizeMemory } from "../learning/memory-synthesis";
import type { MemoryItem } from "../learning/memory-model";
import { assessWorldState } from "../world-state/world-state-readiness";
import { deriveEmptyDayInput } from "../world-state/world-state-derive";
import type { WorldState } from "../world-state/world-state";
import { generateEmptyDay, type EmptyDayProposal, type EmptyDayTier } from "../empty-day/empty-day-generator";
import { buildAllReasoning } from "../empty-day/empty-day-reasoning";
import type { EmptyDayIntent } from "../empty-day/empty-day-input";
import { evaluateTriggers } from "../triggers/trigger-evaluator";
import { buildTriggerContent } from "../triggers/trigger-content";
import { gateTriggers } from "../triggers/trigger-gating";
import type { TriggerKind } from "../triggers/trigger-model";
import { proposalToChangeSetDraft } from "../permission/changeset-draft";
import { evaluatePermission } from "../permission/permission-gate";
import type { ActionKind, PermissionLevel, RiskCategory, RiskFlag } from "../permission/permission-model";
import type { PermissionVerdict } from "../permission/permission-gate";

export interface RealityPipelineInput {
  readonly memoryItems: readonly MemoryItem[];
  readonly worldState: WorldState;
  readonly permissionLevel: PermissionLevel;
  readonly nowMs: number; // synthesizeMemory recency 用（pure: caller が渡す）
  readonly userIntent?: EmptyDayIntent | null;
  /** gate に問う action（既定 = 提案を surface する propose・low risk）。 */
  readonly requestedAction?: { readonly action: ActionKind; readonly flags: readonly RiskFlag[] };
}

/** observation 用 **redacted** envelope（raw/PII/具体 item を出さない）。 */
export interface RealityPipelineEnvelope {
  readonly date: string;
  readonly worldReadiness: "ready" | "partial" | "insufficient";
  /** 推奨案の **要約のみ**（tier + 分量 + strain・raw なし）。null=組めない。 */
  readonly recommended: { readonly tier: EmptyDayTier; readonly activeMinutes: number; readonly restMinutes: number; readonly strain: "low" | "medium" | "high" } | null;
  /** 推奨案の reasoning **要約**（fits + confidence + readiness）。 */
  readonly reasoning: { readonly fits: { readonly time: string; readonly energy: string; readonly weather: string; readonly mobility: string }; readonly confidence: "low" | "tentative"; readonly readiness: "draft" | "ready_to_show" } | null;
  /** surface された単一 trigger（silence-by-default・cap 1）。null=沈黙。 */
  readonly surfacedTrigger: { readonly kind: TriggerKind; readonly headline: string } | null;
  readonly silencedTriggerCount: number;
  /** requestedAction の permission 判定（verdict + risk・reason は redacted）。 */
  readonly permission: { readonly verdict: PermissionVerdict; readonly risk: RiskCategory; readonly reason: string };
  /** ChangeSet draft **要約のみ**（id + op 数・**apply しない**・item 内容は出さない）。 */
  readonly changeSetDraft: { readonly id: string; readonly opCount: number } | null;
  /** 停止理由 / 欠損 signal（非断定・捏造しない）。 */
  readonly stopReasons: readonly string[];
}

const FIT = (f: string): string => f;

/**
 * R1–R5 を 1 本の pure pipeline で走らせ、redacted envelope を返す。**apply しない**。
 */
export function runRealityPipeline(input: RealityPipelineInput): RealityPipelineEnvelope {
  const { worldState, permissionLevel, nowMs } = input;
  const date = worldState.date;

  // ── R1: 記憶を統合 ──
  const synthesis = synthesizeMemory(input.memoryItems, nowMs);
  // ── R3: 現実状態 readiness + R2 入力導出（suppressed→excluded・usable のみ） ──
  const readiness = assessWorldState(worldState);
  const emptyDayInput = deriveEmptyDayInput(worldState, synthesis, { userIntent: input.userIntent ?? null });
  // ── R2: 空白の日を組む（3 案）+ reasoning ──
  const proposalSet = generateEmptyDay(emptyDayInput);
  const reasonings = buildAllReasoning(emptyDayInput, proposalSet);
  const recTier = proposalSet.recommended;
  const recProposal: EmptyDayProposal | null = recTier ? proposalSet.proposals.find((p) => p.tier === recTier) ?? null : null;
  const recReasoning = recTier ? reasonings.find((r) => r.tier === recTier) ?? null : null;

  // ── R4: trigger 発火 → content → gating（silence-by-default） ──
  const triggerCtx = { worldState, emptyDay: proposalSet };
  const fired = evaluateTriggers(triggerCtx);
  const surface = gateTriggers(fired);
  const surfacedTrigger = surface.surfaced[0]
    ? { kind: surface.surfaced[0].kind, headline: buildTriggerContent(surface.surfaced[0], triggerCtx).headline }
    : null;

  // ── R5: ChangeSet draft（候補・apply しない）+ permission gate ──
  const changeSetDraft = recProposal && recProposal.blocks.length > 0 ? proposalToChangeSetDraft(recProposal, date) : null;
  const req = input.requestedAction ?? { action: "propose" as ActionKind, flags: [] as readonly RiskFlag[] };
  const contextComplete = readiness.overall !== "insufficient"; // 文脈不足は捏造せず止める
  const verdict = evaluatePermission({ action: req.action, flags: req.flags, level: permissionLevel, governance: null, contextComplete });

  // ── 停止理由 / 欠損 signal（非断定・redacted） ──
  const stopReasons: string[] = [...readiness.notes];
  if (verdict.verdict !== "allowed") stopReasons.push(verdict.reason);
  if (recProposal && recProposal.blocks.length === 0) stopReasons.push("組める空き時間が見当たりません");

  return {
    date,
    worldReadiness: readiness.overall,
    recommended: recProposal ? { tier: recProposal.tier, activeMinutes: recProposal.activeMinutes, restMinutes: recProposal.restMinutes, strain: recProposal.strain } : null,
    reasoning: recReasoning
      ? { fits: { time: FIT(recReasoning.fits.time), energy: FIT(recReasoning.fits.energy), weather: FIT(recReasoning.fits.weather), mobility: FIT(recReasoning.fits.mobility) }, confidence: recReasoning.confidence, readiness: recReasoning.readiness }
      : null,
    surfacedTrigger,
    silencedTriggerCount: surface.silencedCount,
    permission: { verdict: verdict.verdict, risk: verdict.risk, reason: verdict.reason },
    changeSetDraft: changeSetDraft ? { id: changeSetDraft.id, opCount: changeSetDraft.ops.length } : null,
    stopReasons,
  };
}
