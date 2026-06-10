/**
 * 横 R2 — Life Ops Candidate Pure Placement（**pure・no-DB・no-fetch・no-UI・no-notification**・barrel 非 export）
 *
 * 設計: docs/life-ops-r2-placement-mini-design.md / docs/life-ops-r2-integration-contract.md
 *
 * 役割: 縦（Life Ops）の `LifeOpsCandidate[]`（**何を**）を、横 R2 の WorldState（空き窓・予定・移動 placeholder・now）から
 *   **いつ（window）・どの構え（守る/楽/攻める lane）** に置くかだけを決める pure placement。
 *   縦の単一出口 `collectLifeOpsCandidates` の出力を caller が渡す（横は候補生成を再実装しない）。
 *
 * 厳守:
 *   - **LifeOpsCandidate を再定義しない**（縦 `candidate-types.ts` が正本・wrapper `PlacedLifeOpsCandidate` のみ）。
 *   - 縦の個別経路（L-3/L-4/deadline engine）を import しない（型と L-1 辞書 lookup のみ）。
 *   - **pure・deterministic**（IO/DB/fetch/Date.now なし・now は WorldState.nowMinute）・候補は embedded 無改変。
 *   - 配置は permission/riskFlags と独立（保持して透過・CTA/実行 gate は L-7+R5 の責務）。
 *   - 捏造しない: 窓が無ければ window=null + 理由コード（詰め込まない・cap 超過も保持して返す）。
 *   - 所要時間は**粗い見積り**（在宅 30 分/外出 60 分+往復 buffer）であることを `coarse_duration` で明示。
 */

import type { LifeOpsCandidate } from "../../../lifeops/candidate-types";
import { LIFE_OPS_CATEGORY_MODEL } from "../../../lifeops/category-model";
import type { AvailableWindow } from "../empty-day/empty-day-input";
import type { WorldState } from "../world-state/world-state";

/** 横 R2 の 3 案 lane（既存 EmptyDayTier と同語彙・型は placement 文脈で独立）。 */
export type LifeOpsPlanLane = "protect" | "easy" | "push";

/** CEO 指定 wrapper（candidate は **embedded 無改変**・横で縦型を再定義しない）。 */
export interface PlacedLifeOpsCandidate {
  readonly candidate: LifeOpsCandidate;
  /** 確定した窓（null=未配置: cap 超過 / 窓不足）。 */
  readonly window: AvailableWindow | null;
  /** 安定コードの配置理由（redacted・raw なし）。 */
  readonly placementReason: readonly string[];
  readonly planLane: LifeOpsPlanLane;
  /** placement が見積もった粗い必要分（在宅 30/外出 60+往復・compose が同じ値を使い再計算ドリフトを防ぐ）。 */
  readonly coarseMinutes: number;
}

export interface LifeOpsPlacementResult {
  /** placed（window あり）→ unplaced（window=null）の順・各群は urgency 順。 */
  readonly placements: readonly PlacedLifeOpsCandidate[];
  readonly placedCount: number;
  readonly unplacedCount: number;
}

export interface LifeOpsPlacementInput {
  /** 縦の単一出口 `collectLifeOpsCandidates` の出力（caller が呼ぶ）。 */
  readonly candidates: readonly LifeOpsCandidate[];
  readonly worldState: WorldState;
  /** 1 日の配置上限（既定 3・過剰に埋めない）。 */
  readonly maxPlacements?: number;
}

/** 在宅タスクの必要窓（分・粗い見積り）。 */
export const HOME_TASK_MIN = 30;
/** 外出タスクの基礎滞在（分・粗い見積り）。 */
export const OUTING_BASE_MIN = 60;
/** 片道移動 buffer 既定（分・mobility placeholder 不在時）。 */
export const DEFAULT_TRAVEL_BUFFER_MIN = 15;
/** 既定の 1 日配置上限。 */
export const DEFAULT_MAX_PLACEMENTS = 3;

/** cycle phase の緊急度（小さいほど先）。 */
const PHASE_RANK: Record<string, number> = { well_beyond: 0, beyond_typical: 1, nearing: 2, within_typical: 3, unknown: 4 };

/** §2: urgencyRank（昇順=先に配置）。deadline(overdue 最優先) < event_prep < cycle。 */
function urgencyRank(c: LifeOpsCandidate): number {
  const d = c.dueReason;
  if (d.kind === "deadline") return d.overdue ? -1000 : d.daysUntilDeadline;
  if (d.kind === "event_prep") return 100 + d.daysUntilEvent;
  return 200 + (PHASE_RANK[d.phase] ?? 4);
}

/** §3: lane（既存信号のみ: kind / daysUntilEvent / cyclePhase / L-1 group / health_sensitive / phase）。 */
function laneOf(c: LifeOpsCandidate): LifeOpsPlanLane {
  const d = c.dueReason;
  if (d.kind === "deadline") return "protect";
  if (d.kind === "event_prep") {
    if (d.daysUntilEvent <= 2) return "protect"; // 直前=落とせない準備
    if (d.cyclePhase !== undefined) return "push"; // 美容前倒し=未来価値
    return "easy"; // one-shot 準備・余裕あり
  }
  // cycle: 生活/健康の防衛か、整える攻めか
  const spec = LIFE_OPS_CATEGORY_MODEL[c.category];
  const lifeOrHealth = spec.group === "daily_upkeep" || spec.typicalRiskFlags.includes("health_sensitive");
  if (lifeOrHealth) return d.phase === "well_beyond" ? "protect" : "easy";
  return "push";
}

/** §4: 必要窓（分）。外出は往復 buffer 込み・粗い見積り。 */
function requiredMinutes(c: LifeOpsCandidate, travelBufferMin: number): number {
  if (c.placeQuery === null) return HOME_TASK_MIN;
  return OUTING_BASE_MIN + 2 * travelBufferMin;
}

/** lane 理由コード（redacted）。 */
function laneReason(c: LifeOpsCandidate, lane: LifeOpsPlanLane): string {
  const d = c.dueReason;
  if (d.kind === "deadline") return d.overdue ? "deadline_overdue" : "deadline_near";
  if (d.kind === "event_prep") return d.daysUntilEvent <= 2 ? "event_prep_imminent" : d.cyclePhase !== undefined ? "event_prep_beauty_lead" : "event_prep_lead";
  return lane === "protect" ? "cycle_life_protect" : lane === "easy" ? "cycle_upkeep" : "cycle_refresh";
}

/**
 * 縦候補を 1 日に pure 配置（§設計 doc）。窓は早い順・残量 tracking・過去窓 skip・cap 超過/窓不足は window=null で保持。
 */
export function placeLifeOpsCandidatesForDay(input: LifeOpsPlacementInput): LifeOpsPlacementResult {
  const { worldState } = input;
  const cap = input.maxPlacements ?? DEFAULT_MAX_PLACEMENTS;
  const travel = worldState.mobility?.typicalTravelBufferMin ?? DEFAULT_TRAVEL_BUFFER_MIN;
  const now = worldState.nowMinute;

  // 窓の残量 tracking（過去窓は skip・進行中窓は now 以降を有効残量に）。元 window 参照は保持（wrapper に載せる）。
  const slots = worldState.availableWindows
    .map((w) => {
      const effStart = now !== null ? Math.max(w.startMinute, now) : w.startMinute;
      return { window: w, remaining: Math.max(0, w.endMinute - effStart) };
    })
    .filter((s) => s.remaining > 0)
    .sort((a, b) => a.window.startMinute - b.window.startMinute);

  // urgency 安定 sort（同 rank は collector の dedup 済み順を保持）。
  const ordered = input.candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => urgencyRank(a.c) - urgencyRank(b.c) || a.i - b.i)
    .map((x) => x.c);

  const placed: PlacedLifeOpsCandidate[] = [];
  const unplaced: PlacedLifeOpsCandidate[] = [];
  for (const c of ordered) {
    const lane = laneOf(c);
    const need = requiredMinutes(c, travel); // 全経路で coarseMinutes として保持（compose が同じ値を使う）
    const reasons: string[] = [laneReason(c, lane)];
    if (placed.length >= cap) {
      unplaced.push({ candidate: c, window: null, placementReason: [...reasons, "cap_exceeded"], planLane: lane, coarseMinutes: need });
      continue;
    }
    reasons.push(c.placeQuery === null ? "home_doable" : "needs_outing_window", "coarse_duration");
    const slot = slots.find((s) => s.remaining >= need);
    if (!slot) {
      unplaced.push({ candidate: c, window: null, placementReason: [...reasons, "no_window_fits"], planLane: lane, coarseMinutes: need });
      continue;
    }
    slot.remaining -= need; // 同一窓は残量内のみ多重配置可
    placed.push({ candidate: c, window: slot.window, placementReason: reasons, planLane: lane, coarseMinutes: need });
  }

  return {
    placements: [...placed, ...unplaced],
    placedCount: placed.length,
    unplacedCount: unplaced.length,
  };
}
