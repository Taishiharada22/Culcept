/**
 * Reality Control OS — R2-2 Empty-day Candidate Generator（**pure・no-DB/UI/route**・barrel 非 export）
 *
 * 設計: docs/r2-empty-day-asset-audit-and-boundary.md / docs/reality-secretary-os-unbuilt-roadmap.md（R2）
 *
 * 役割: `EmptyDayInput` から **守る/楽/攻める の 3 案**を pure に生成する。生成するのは **抽象 day skeleton**
 *   （汎用 block kind）であり、**PlanCandidate 正本型でも Life Ops カテゴリでもない**（どちらも stop gate）。
 *
 * モデル（budget + desirability）:
 *   - 各 tier は **active 時間 budget** を持つ（easy<protect<push）。energy で budget を scale（low energy→小＝**詰めすぎない**）。
 *   - **memory は重み付けのみ**: band 一致 leaning が window の desirability を決め、**budget を高 desirability の window から充当**。
 *     ＝memory は「どの枠を active にするか」を寄せるが、tier の負荷量（budget）は上書きしない。
 *   - **hard constraints 最優先**: available windows のみ埋める（hard constraint 時間に触れない）。
 *   - gap meaning(recovery/dangerous_tight 等) は **active より優先**で rest/buffer 固定。
 *
 * 厳守: 偽数値を作らない（strain は粗い 3 段）・certainty/trait を持ち込まない・available windows 外を埋めない・pure。
 */

import { bandFromHour, type DecisionBand } from "../learning/prm-alter-bridge";
import type { MemoryLeaning } from "../learning/memory-model";
import { normalizeEmptyDayInput, type AvailableWindow, type EmptyDayInput } from "./empty-day-input";

export type EmptyDayTier = "protect" | "easy" | "push";
export type EmptyDayBlockKind = "focus_work" | "light_task" | "recovery" | "open" | "buffer";

/** 1 ブロック（抽象 skeleton・具体行動でない）。 */
export interface EmptyDayBlock {
  readonly startMinute: number;
  readonly endMinute: number;
  readonly kind: EmptyDayBlockKind;
  readonly band: DecisionBand;
  /** この block の kind に影響した memory leaning（null=影響なし）。R2-3 が reason に使う。 */
  readonly memoryLeaning: MemoryLeaning | null;
}

export interface EmptyDayProposal {
  readonly tier: EmptyDayTier;
  readonly blocks: readonly EmptyDayBlock[];
  readonly activeMinutes: number;
  readonly restMinutes: number;
  readonly strain: "low" | "medium" | "high";
}

export interface EmptyDayProposalSet {
  readonly date: string;
  /** 常に 3 案（protect/easy/push の順）。 */
  readonly proposals: readonly EmptyDayProposal[];
  /** おすすめ（userIntent 優先・なければ energy から）。R2-3 が理由を作る。 */
  readonly recommended: EmptyDayTier | null;
}

const TIERS: readonly EmptyDayTier[] = ["protect", "easy", "push"];
const LOAD_FRACTION: Record<EmptyDayTier, number> = { easy: 0.25, protect: 0.5, push: 0.8 };
const NEUTRAL_ENERGY = 0.6;
const ACTIVE_KINDS = new Set<EmptyDayBlockKind>(["focus_work", "light_task"]);

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
/** energy → budget 倍率（low energy で縮小＝詰めすぎない）。 */
function energyScale(energy: number): number {
  return clamp(0.4 + energy, 0.3, 1.4);
}
/** memory leaning → window の active desirability（高いほど先に active 充当）。 */
function desirability(leaning: MemoryLeaning | null): number {
  if (leaning === "toward_adopting") return 0.8;
  if (leaning === "toward_declining") return 0.1;
  if (leaning === "toward_deferring") return 0.4;
  return 0.5;
}
/** gap meaning が rest/buffer を強制するか（active より優先）。 */
function gapForcesRest(meaning: AvailableWindow["meaning"]): "recovery" | "buffer" | null {
  if (meaning === "recovery") return "recovery";
  if (meaning === "dangerous_tight" || meaning === "travel_buffer" || meaning === "waiting") return "buffer";
  return null;
}

function buildBandLeaning(input: EmptyDayInput): Map<DecisionBand, MemoryLeaning> {
  const m = new Map<DecisionBand, MemoryLeaning>();
  for (const c of input.memoryUsableContexts) {
    if (c.context.dimension === "band" && c.context.value && c.leaning) m.set(c.context.value as DecisionBand, c.leaning);
  }
  return m;
}

interface ScoredWindow {
  readonly w: AvailableWindow;
  readonly idx: number;
  readonly band: DecisionBand;
  readonly leaning: MemoryLeaning | null;
  readonly forced: "recovery" | "buffer" | null;
}

function buildProposal(tier: EmptyDayTier, scored: readonly ScoredWindow[], energy: number): EmptyDayProposal {
  const total = scored.reduce((s, x) => s + (x.w.endMinute - x.w.startMinute), 0);
  const activeBudget = Math.min(total, Math.round(total * LOAD_FRACTION[tier] * energyScale(energy)));

  // budget を **高 desirability の非 forced window から**充当（memory が「どの枠か」を寄せる）
  const order = scored
    .filter((s) => s.forced === null)
    .map((s) => s) // copy
    .sort((a, b) => desirability(b.leaning) - desirability(a.leaning) || a.idx - b.idx);
  const activeIdx = new Set<number>();
  let used = 0;
  for (const s of order) {
    const dur = s.w.endMinute - s.w.startMinute;
    if (used + dur <= activeBudget) {
      activeIdx.add(s.idx);
      used += dur;
    }
  }

  const blocks: EmptyDayBlock[] = scored.map((s) => {
    let kind: EmptyDayBlockKind;
    if (s.forced === "recovery") kind = "recovery";
    else if (s.forced === "buffer") kind = "buffer";
    else if (activeIdx.has(s.idx)) kind = tier === "easy" || s.leaning === "toward_deferring" ? "light_task" : "focus_work";
    else kind = energy < 0.4 ? "recovery" : "open";
    return { startMinute: s.w.startMinute, endMinute: s.w.endMinute, kind, band: s.band, memoryLeaning: s.leaning };
  });

  let activeMinutes = 0;
  let restMinutes = 0;
  for (const b of blocks) {
    const dur = b.endMinute - b.startMinute;
    if (ACTIVE_KINDS.has(b.kind)) activeMinutes += dur;
    else restMinutes += dur;
  }
  const denom = activeMinutes + restMinutes;
  const score = (denom > 0 ? activeMinutes / denom : 0) * (1.2 - energy * 0.4);
  const strain: EmptyDayProposal["strain"] = score > 0.55 ? "high" : score > 0.3 ? "medium" : "low";
  return { tier, blocks, activeMinutes, restMinutes, strain };
}

function recommendByEnergy(energy: number): EmptyDayTier {
  return energy < 0.4 ? "easy" : energy > 0.7 ? "push" : "protect";
}

/**
 * R2-2: EmptyDayInput → 3 案（守る/楽/攻める）。pure。Plan 本線非接続。
 */
export function generateEmptyDay(rawInput: EmptyDayInput): EmptyDayProposalSet {
  const input = normalizeEmptyDayInput(rawInput);
  const energy = input.energy ?? NEUTRAL_ENERGY;
  const bandLeaning = buildBandLeaning(input);
  const windows = [...input.availableWindows].sort((a, b) => a.startMinute - b.startMinute);
  const scored: ScoredWindow[] = windows.map((w, idx) => {
    const band = bandFromHour(Math.floor(w.startMinute / 60));
    return { w, idx, band, leaning: bandLeaning.get(band) ?? null, forced: gapForcesRest(w.meaning) };
  });

  const proposals = TIERS.map((tier) => buildProposal(tier, scored, energy));
  const recommended = input.userIntent ?? recommendByEnergy(energy);
  return { date: input.date, proposals, recommended };
}
