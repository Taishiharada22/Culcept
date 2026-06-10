/**
 * 横 R2 — Life Ops × Empty-day 3案 Compose（**pure・R2 本体無改変**・barrel 非 export）
 *
 * 設計: docs/life-ops-empty-day-compose-mini-design.md
 *
 * 役割: placement 済み Life Ops 候補（`LifeOpsPlacementResult`）を、既存 R2 の 3 案（守る/楽/攻める・
 *   `EmptyDayProposalSet`）に **pure に混ぜる**。tier ごとに lane を**累積包含**（protect⊆easy⊆push）し、
 *   tier の **flexible 容量**（open/buffer/light_task block + 窓の未充填分）に urgency 順で充当する。
 *   placement の窓が当該 tier で塞がっていても **同 tier の他窓へ refit**（refit_in_tier・30 分の期限タスクが
 *   180 分の open を横目に溢れない）。**A-4-c4: pool は full**（raw 窓で未着席の候補も per-tier で着席試行=seated_in_tier・
 *   tier 別 flexible 容量が正）。それでも容量不足は **honest overflow**（黙って詰め込まない・R2 block を削らない・tier 差分情報）。
 *
 * 厳守:
 *   - `generateEmptyDay` / proposal / blocks は **無改変・同一参照**（R2 の責務を壊さない）。
 *   - focus_work / recovery は tier の意図（集中・回復）＝**奪わない**（flexible に数えない）。
 *   - **deadline（protect lane）は 3 案すべてに現れる**（tier 選択で期限が消えない）。
 *   - window / dueReason / placeQuery / riskFlags を**欠落させない**（R4 Moment Trigger・Morning Briefing の素材）。
 *   - pure（IO/DB/fetch/Date.now なし）・summary は counts のみ（redaction-trivial）。
 *   - 本 slice は構造のみ（文言化は presenter／UI・通知・本線接続は別 gate）。
 */

import type { EmptyDayBlockKind, EmptyDayProposal, EmptyDayProposalSet, EmptyDayTier } from "../empty-day/empty-day-generator";
import { lifeOpsUrgencyRank, type LifeOpsPlacementResult, type LifeOpsPlanLane, type PlacedLifeOpsCandidate } from "./lifeops-placement";
import { TIER_FITTING_CAP, OVERFLOW_RETAINED_CAP } from "./lifeops-pool-cap";

/** tier ごとの lane 累積包含（§1: 守る日でも deadline は落とさない）。 */
const TIER_INCLUDES: Record<EmptyDayTier, ReadonlySet<LifeOpsPlanLane>> = {
  protect: new Set<LifeOpsPlanLane>(["protect"]),
  easy: new Set<LifeOpsPlanLane>(["protect", "easy"]),
  push: new Set<LifeOpsPlanLane>(["protect", "easy", "push"]),
};

/** lifeops が充当してよい block kind（light_task=「軽い用事」は意味的に lifeops の置き場）。 */
const FLEXIBLE_KINDS: ReadonlySet<EmptyDayBlockKind> = new Set<EmptyDayBlockKind>(["open", "buffer", "light_task"]);

export interface ComposedTierLifeOps {
  /** flexible 容量に収まった候補（urgency 順・window/coarseMinutes 保持・**≤ tierFittingCap**）。 */
  readonly fitting: readonly PlacedLifeOpsCandidate[];
  /** lane 的には tier に属するが容量/体験上限で入らない候補（honest・**保持は ≤ overflowRetainedCap**）。 */
  readonly overflow: readonly PlacedLifeOpsCandidate[];
  /** overflow の**総数**（A-4-c7・保持 cap で配列を絞っても line は総数を言う=嘘をつかない）。省略時=overflow.length。 */
  readonly overflowTotalCount?: number;
}

export interface ComposedDayProposal {
  readonly tier: EmptyDayTier;
  /** 既存 R2 proposal（**無改変・同一参照**）。 */
  readonly proposal: EmptyDayProposal;
  readonly lifeOps: ComposedTierLifeOps;
}

/** Morning Briefing 用 summary（**counts のみ**・redaction-trivial）。 */
export interface LifeOpsDayComposeSummary {
  readonly date: string;
  readonly perTier: readonly { readonly tier: EmptyDayTier; readonly fittingCount: number; readonly overflowCount: number }[];
  readonly alsoAvailableCount: number;
}

export interface LifeOpsDayCompose {
  readonly composed: readonly ComposedDayProposal[];
  /** R2 の recommended を透過（compose は推奨を変えない）。 */
  readonly recommended: EmptyDayTier | null;
  /** placement 段階の未配置（cap_exceeded / no_window_fits）をそのまま透過＝「他にも候補あり」素材。 */
  readonly alsoAvailable: readonly PlacedLifeOpsCandidate[];
  readonly summary: LifeOpsDayComposeSummary;
}

export interface LifeOpsComposeInput {
  readonly proposalSet: EmptyDayProposalSet;
  readonly placement: LifeOpsPlacementResult;
  /**
   * その日の全窓（WorldState.availableWindows）。**tier 内 window refit** に使う＝placement の窓が当該 tier で
   * 塞がっていても、同 tier の他窓の flexible 残量に収め直す（30 分の期限タスクが 180 分の open を横目に溢れない）。
   * 省略時は placements が知る窓のみ（後方互換・未使用窓は発見できない）。
   */
  readonly dayWindows?: readonly { readonly startMinute: number; readonly endMinute: number }[];
  /** A-4-c7: per-tier fitting の体験上限（既定 5・urgency 順処理ゆえ deadline が cap で落ちることは構造的に無い）。 */
  readonly tierFittingCap?: number;
  /** A-4-c7: overflow 配列の保持上限（既定 5・総数は overflowTotalCount が持つ＝line は嘘をつかない）。 */
  readonly overflowRetainedCap?: number;
}

/** tier×window の flexible 容量（分）= open/buffer/light_task block 分 + 窓の未充填分。 */
function flexibleCapacity(proposal: EmptyDayProposal, windowStart: number, windowEnd: number): number {
  const inWindow = proposal.blocks.filter((b) => b.startMinute >= windowStart && b.endMinute <= windowEnd);
  const flexibleBlockMin = inWindow.filter((b) => FLEXIBLE_KINDS.has(b.kind)).reduce((acc, b) => acc + (b.endMinute - b.startMinute), 0);
  const allBlockMin = inWindow.reduce((acc, b) => acc + (b.endMinute - b.startMinute), 0);
  const unfilled = Math.max(0, windowEnd - windowStart - allBlockMin);
  return flexibleBlockMin + unfilled;
}

/**
 * placement 済み候補を 3 案へ compose（§設計 doc・pure・R2 無改変）。
 *   tier ごとに lane 包含 → window 別 flexible 残量に urgency 順（placement の placed 順）で充当 → 不足は overflow。
 */
export function composeLifeOpsIntoDayProposals(input: LifeOpsComposeInput): LifeOpsDayCompose {
  const { proposalSet, placement } = input;
  // A-4-c4: **full pool**（window 有無を問わず）を per-tier 着席させる。raw 窓の placement は仮置き・tier 別 flexible 容量が正。
  const pool = placement.placements
    .map((p, i) => ({ p, i }))
    .sort((a, b) => lifeOpsUrgencyRank(a.p.candidate) - lifeOpsUrgencyRank(b.p.candidate) || a.i - b.i) // global urgency（deadline が常に先＝3 案から消えない）
    .map((x) => x.p);
  const placedOnly = pool.filter((p) => p.window !== null);

  // 着席に使う窓の宇宙（dayWindows 優先・なければ placements が知る窓のみ）。
  const knownWindows = (input.dayWindows ?? [...new Map(placedOnly.map((p) => [`${p.window!.startMinute}-${p.window!.endMinute}`, p.window!])).values()])
    .slice()
    .sort((a, b) => a.startMinute - b.startMinute);

  const composed: ComposedDayProposal[] = proposalSet.proposals.map((proposal) => {
    const include = TIER_INCLUDES[proposal.tier];
    const eligible = pool.filter((p) => include.has(p.planLane));
    // window 別 flexible 残量（同一窓の多重充当は残量内のみ・tier ごとに独立）。
    const remainingByWindow = new Map<string, number>();
    const remainingOf = (w: { startMinute: number; endMinute: number }): number => {
      const key = `${w.startMinute}-${w.endMinute}`;
      const r = remainingByWindow.get(key);
      return r ?? flexibleCapacity(proposal, w.startMinute, w.endMinute);
    };
    const consume = (w: { startMinute: number; endMinute: number }, min: number): void => {
      remainingByWindow.set(`${w.startMinute}-${w.endMinute}`, remainingOf(w) - min);
    };
    const fitting: PlacedLifeOpsCandidate[] = [];
    const overflow: PlacedLifeOpsCandidate[] = [];
    const fittingCap = input.tierFittingCap ?? TIER_FITTING_CAP; // A-4-c7 ③: 体験上限（容量とは別）
    for (const p of eligible) {
      const placedW = p.window;
      if (fitting.length >= fittingCap) {
        // urgency 順処理ゆえ cap で落ちるのは常に末尾（deadline は先頭群＝構造的に落ちない）。
        overflow.push({ ...p, placementReason: [...p.placementReason, "tier_fitting_cap"] });
        continue;
      }
      // ① placement の窓を優先（親和性）→ ② 塞がっていれば/窓なしなら 同 tier の他窓へ（早い順）。
      if (placedW && remainingOf(placedW) >= p.coarseMinutes) {
        consume(placedW, p.coarseMinutes);
        fitting.push(p);
        continue;
      }
      const alt = knownWindows.find(
        (w) => !(placedW && w.startMinute === placedW.startMinute && w.endMinute === placedW.endMinute) && remainingOf(w) >= p.coarseMinutes,
      );
      if (alt) {
        consume(alt, p.coarseMinutes);
        // wrapper のみ差替（candidate は embedded 同一参照のまま）・理由コードで明示（refit=窓移動 / seated=pool 未着席→tier で着席）。
        const code = placedW ? "refit_in_tier" : "seated_in_tier";
        fitting.push({ ...p, window: { startMinute: alt.startMinute, endMinute: alt.endMinute, meaning: null }, placementReason: [...p.placementReason, code] });
        continue;
      }
      overflow.push(p); // honest（R2 block を削らない・黙って詰め込まない）＝「この案では入りきらない」（tier 差分情報）
    }
    // A-4-c7 ⑤: overflow は総数を保持しつつ、配列は上位 N 件のみ retained（R4/詳細素材・line は総数）。
    const retainedCap = input.overflowRetainedCap ?? OVERFLOW_RETAINED_CAP;
    const overflowTotalCount = overflow.length;
    return { tier: proposal.tier, proposal, lifeOps: { fitting, overflow: overflow.slice(0, retainedCap), overflowTotalCount } };
  });

  // A-4-c4: 全候補は最低 push tier の eligible になるため「どの tier にも載らない候補」は構造的に存在しない。
  //   旧 alsoAvailable（placement 段階の leftovers）の情報は **tier 別 overflow に移住**。field は互換のため残置（常に []）。
  const alsoAvailable: readonly PlacedLifeOpsCandidate[] = [];

  return {
    composed,
    recommended: proposalSet.recommended,
    alsoAvailable,
    summary: {
      date: proposalSet.date,
      perTier: composed.map((c) => ({ tier: c.tier, fittingCount: c.lifeOps.fitting.length, overflowCount: c.lifeOps.overflowTotalCount ?? c.lifeOps.overflow.length })),
      alsoAvailableCount: alsoAvailable.length,
    },
  };
}
