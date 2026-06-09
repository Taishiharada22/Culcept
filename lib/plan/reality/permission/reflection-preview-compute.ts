/**
 * Reality Control OS — A-4-c Reflection Preview Compute（**pure・no-IO・page から呼ぶ唯一の入口**・barrel 非 export）
 *
 * 設計: docs/reality-display-preview-contract-a4-c0.md（§6-2）/ A-4-b2 shadow と同一の pure chain。
 *
 * 役割: 既に read 済みの (world, memoryItems) から **新規 read なし**で
 *   `synthesize → deriveEmptyDayInput → generateEmptyDay → R5-2 draft → A-4-b buildReflectionPreview → DTO`
 *   を 1 関数で実行し、client に渡してよい `ReflectionPreviewClientDto` だけを返す。draft が組めない日は null（捏造しない）。
 *
 * 厳守: **pure（IO/DB/fetch/Date.now なし・nowMs は caller）**・fixture DraftPlan は内部生成（Plan 本線から取らない・
 *   real userId を持ち込まない）・mint は display:（実採番なし）・provenance は environment 観測 1 件（raw なし）・
 *   level/applyAction は **A-4-b2 shadow と同一の dev 観測パラメータ**（level 3 / draft・実権限付与ではない・書かない）。
 */

import { synthesizeMemory } from "../learning/memory-synthesis";
import { deriveEmptyDayInput } from "../world-state/world-state-derive";
import { generateEmptyDay, type EmptyDayProposal } from "../empty-day/empty-day-generator";
import { proposalToChangeSetDraft } from "./changeset-draft";
import { worldStateApplySignature } from "./apply-precondition";
import { buildReflectionPreview } from "./display-apply-preview";
import { toReflectionPreviewClientDto, type ReflectionPreviewClientDto } from "./reflection-preview-dto";
import type { WorldState } from "../world-state/world-state";
import type { MemoryItem } from "../learning/memory-model";
import type { DraftPlan } from "../../draft-plan";
import type { SourceTrace } from "../source-trace";

/** 観測専用 provenance（environment＝当日観測・ref 不要・raw なし）。 */
const OBSERVATION_PROVENANCE: readonly SourceTrace[] = [
  { kind: "environment", reason: "当日の空き時間と固定予定の観測に基づく候補", confidence: 0.5 },
];

export interface ReflectionPreviewComputeArgs {
  readonly world: WorldState;
  readonly memoryItems: readonly MemoryItem[];
  readonly date: string;
  readonly nowMs: number;
}

/**
 * A-4-c: (world, memoryItems) → ReflectionPreviewClientDto | null（**pure・新規 read なし・書かない**）。
 *   recommended proposal が無い／blocks 0 の日は null（honest stop・捏造しない）。
 */
export function computeReflectionPreviewDto(args: ReflectionPreviewComputeArgs): ReflectionPreviewClientDto | null {
  const { world, memoryItems, date, nowMs } = args;

  // A-4-b2 shadow と同一の pure 内部（envelope は opCount-only ゆえ draft はここで再導出する）。
  const synthesis = synthesizeMemory(memoryItems, nowMs);
  const edi = deriveEmptyDayInput(world, synthesis, { userIntent: null });
  const proposalSet = generateEmptyDay(edi);
  const rec: EmptyDayProposal | null = proposalSet.recommended
    ? proposalSet.proposals.find((p) => p.tier === proposalSet.recommended) ?? null
    : null;
  if (!rec || rec.blocks.length === 0) return null; // 組めない日（honest）

  const draft = proposalToChangeSetDraft(rec, date);

  // fixture DraftPlan（Plan 本線から取らない・real userId を持ち込まない・items 空）。
  const fixtureDraftPlan: DraftPlan = {
    id: "dp:reflection-preview",
    userId: "fixture",
    date,
    level: "candidate",
    items: [],
    generatedAt: new Date(nowMs).toISOString(),
    generatedBy: "rule",
    basedOn: { anchorIds: [], seedIds: [] },
    status: "pending",
  };

  const result = buildReflectionPreview({
    draft,
    draftPlan: fixtureDraftPlan,
    liveWorldState: world,
    idMint: { mintRealId: (s) => s.replace(/^draft:/, "display:") }, // 実採番なし（display 専用）
    provenance: OBSERVATION_PROVENANCE,
    level: 3, // dev 観測パラメータ（A-4-b2 shadow と同一・実権限付与ではない・書かない）
    applyAction: "draft",
    flags: [],
    baseVersion: worldStateApplySignature(world), // 同一 world から導出＝fresh
    computedAtMs: nowMs,
    nowMs,
    appliedSnapshot: { appliedChangeSetIds: [] }, // display preview は何も適用していない（honest）
    changeSetDate: date,
  });

  return toReflectionPreviewClientDto(result);
}
