/**
 * Reality Control OS — Complete Generator（A1-4-2a fill-only add の最小 generator）
 *
 * 親設計: docs/aneurasync-reality-candidate-generator-design.md §4h/§4i（A1-4-0/A1-4-1）
 *
 * 役割: A1-4-1 の `SeedPlacement`（配置可能材料）を **当日の空き時間(gap)に add する
 *   Complete 候補（CandidateDraft）** に変換する generator（A1-4-2a=1 件 / A1-4-2b=厳格に複数 add）。
 *   Complete 本体ではない。
 *
 * 【重要な拘束（CEO 明示）】:
 *   `isPlaceable` は「duration が既知か」だけの判定で「置いてよい」ではない。**isPlaceable 単独で
 *   候補化しない**。candidate にするには duration に加えて
 *   **durationSource(≠unknown) / grounding(strong) / disposition(place) / date / window / gap 一意性**
 *   の **結合条件** を満たすこと。
 *
 * 【安全原則（独立分析）】:
 *   - 実 seed は duration が無い（durationMin=null）→ isPlaceable=false → 候補 0（捏造の床を維持）。
 *   - **default duration を付与しない**・**raw text(signal/desiredAction)を読まない**（SeedPlacement のみ使用）。
 *   - **clock 数値をハードコードしない**: active window / band→clock は caller 提供（無ければ no candidate）。
 *   - 各 placement は一意 gap のときだけ配置（複数 gap=曖昧・不足=置けない・競合=配置区間の重なり→ no candidate）。
 *     **all-or-nothing**（1 つでも不適格/曖昧/不足/競合があれば全体 null）。多重配置は window 分割で曖昧なく成立。
 *   - 生成物は metrics を持たない `CandidateDraft`。安全性は evaluator + Gate-first が独立判定する。
 *
 * 制約: 純関数のみ。LLM / PRM 実接続 / DB / UI / route / runtime / dispatcher 配線なし。barrel 未追加。
 */

import { isPlaceable, type SeedPlacement, type TimeBand } from "./seed-placement";
import type { GovernedNode } from "./candidate-generator";
import type { PlanItemGovernance } from "./authority";
import type { ChangeSet, ChangeOp, PlanItemSnapshot } from "./change-set";
import type { SourceTrace } from "./source-trace";
import type { CandidateDraft } from "./candidate-evaluator";

/** 1 日の上限（分）。evaluator と同じ保守的基準。 */
const MAX_DAY_MIN = 24 * 60;

/** 構造化短定型の trace reason（seed 自由文を持ち込まない）。 */
const COMPLETE_TRACE_REASON = "空き時間に配置(complete)";

export interface Interval {
  readonly startMin: number;
  readonly endMin: number;
}

/** Complete 生成の入力（SeedPlacement 材料 + 当日の既存 node + 任意の day/band 境界）。 */
export interface CompleteInput {
  /** 配置候補となる材料（buildSeedPlacements 由来） */
  readonly placements: readonly SeedPlacement[];
  /** 当日の既存 node（gap 計算 + id 衝突回避に使う） */
  readonly existing: readonly GovernedNode[];
  /** 当日の active window（caller 提供・clock をハードコードしない）。既定 [0, MAX_DAY_MIN]。 */
  readonly activeWindow?: Interval;
  /** 当日の日付（YYYY-MM-DD）。placement.date 照合に使う。 */
  readonly date?: string;
  /** band→clock 境界（caller 提供・active window/PRM 由来）。未提供なら banded placement は no candidate。 */
  readonly bandBounds?: Readonly<Partial<Record<TimeBand, Interval>>>;
  /**
   * ★INV-17（空白は埋めない・意味づけする）: add 禁止区間（recovery / free_time gap など・分単位）。
   * busy に merge され freeGaps から除外される＝Complete(add) がこの区間を埋めない。
   * additive・任意（**未指定/空なら既存挙動完全不変**）。restrict-only（add 候補を狭めるのみ・fail-safe）。
   * 将来 Day Rehearsal の GapRecoveryAssertion を map して渡す想定（注入は別 slice・flag 裏）。
   */
  readonly protectedGaps?: readonly Interval[];
}

/** 生成提案ノードの governance（AI 生成・proposed・movable・tentative＝最弱・上書き自由）。 */
const COMPLETE_ITEM_GOVERNANCE: PlanItemGovernance = {
  origin: "alter_generated",
  authority: "proposed",
  flexibility: "movable",
  protectionReasons: ["tentative"],
};

/**
 * date 照合: undated は any 日 OK / dated は当日一致必須。
 * placement が日指定ありで当日 date 不明なら照合不能 → false（推測しない・保守）。
 */
function dateCompatible(p: SeedPlacement, date: string | undefined): boolean {
  if (p.date === undefined) return true;
  if (date === undefined) return false;
  return p.date === date;
}

/**
 * A1-4-2a が候補化を許す **結合条件**（isPlaceable は必要条件・十分条件にしない）。
 *   isPlaceable(duration 既知>0) ∧ durationSource≠unknown ∧ grounding=strong ∧ disposition=place ∧ date 照合。
 *   ＝ weak grounding / tentative / skip / unknown-source / date 不一致 は **候補化しない**。
 */
function isCandidateEligible(p: SeedPlacement, date: string | undefined): boolean {
  return (
    isPlaceable(p) &&
    p.durationSource !== "unknown" &&
    p.grounding === "strong" && // weak を除外
    p.dispositionHint === "place" && // tentative / skip を除外
    dateCompatible(p, date)
  );
}

/**
 * placement の配置許容領域（window 解決）。
 *   window なし → active window 全体。
 *   banded → active ∩ bandBounds[band]（bounds 無 / 空集合は null＝no candidate・推測しない）。
 */
function resolveRegion(
  p: SeedPlacement,
  active: Interval,
  bandBounds: Readonly<Partial<Record<TimeBand, Interval>>> | undefined
): Interval | null {
  if (p.window === undefined) return active;
  const b = bandBounds?.[p.window.band];
  if (!b) return null;
  const startMin = Math.max(active.startMin, b.startMin);
  const endMin = Math.min(active.endMin, b.endMin);
  return endMin > startMin ? { startMin, endMin } : null;
}

/** region 内の free gap（busy を除いた空き区間）を昇順で返す純関数。busy の overlap は merge 済として扱う。 */
function freeGaps(region: Interval, busy: readonly Interval[]): Interval[] {
  const clipped = busy
    .map((b) => ({ startMin: Math.max(b.startMin, region.startMin), endMin: Math.min(b.endMin, region.endMin) }))
    .filter((b) => b.endMin > b.startMin)
    .sort((a, b) => a.startMin - b.startMin);
  const merged: Interval[] = [];
  for (const b of clipped) {
    const last = merged[merged.length - 1];
    if (last && b.startMin <= last.endMin) {
      merged[merged.length - 1] = { startMin: last.startMin, endMin: Math.max(last.endMin, b.endMin) };
    } else {
      merged.push({ startMin: b.startMin, endMin: b.endMin });
    }
  }
  const gaps: Interval[] = [];
  let cursor = region.startMin;
  for (const b of merged) {
    if (b.startMin > cursor) gaps.push({ startMin: cursor, endMin: b.startMin });
    cursor = Math.max(cursor, b.endMin);
  }
  if (cursor < region.endMin) gaps.push({ startMin: cursor, endMin: region.endMin });
  return gaps;
}

/**
 * A1-4-2b: SeedPlacement[] → **fill-only multi-add candidate**（Complete mode・複数配置対応）。
 *
 * A1-4-2a（1 placement・1 gap）を **厳格条件つきで複数 placement** に拡張。曖昧な割当・競合・
 *   推測配置はしない（**all-or-nothing**: 1 つでも不適格/曖昧/不足/競合があれば全体 no candidate）。
 *
 * 手順:
 *   1. **全 placement** が結合条件（isCandidateEligible: isPlaceable ∧ source≠unknown ∧ strong ∧
 *      place ∧ date）を満たすこと。1 つでも不適格（skip/tentative/weak/unknown/date 不一致）→ null。
 *   2. **各 placement** を window→region 解決（banded で bounds 無→null・clock を推測しない）し、region 内
 *      free gap のうち duration が入るものが **ちょうど 1 つ** のときだけ一意 gap に割当（0=不足 / >1=曖昧→ null）。
 *   3. **競合**: 配置区間が placement 間で重なる（同一 gap・region 重複）→ null。
 *   4. id 衝突（既存 or placement 間）→ null。**add op を placement ごとに 1 つ**持つ
 *      **単一 CandidateDraft**（multi-add・metrics なし）。各 op は add のみ。生成 item は raw text を持たない。
 *
 * 戻り: 全 placement が一意 gap に競合なく入れば multi-add CandidateDraft、それ以外は null。
 * **安全性の最終判定は evaluator + Gate-first**（本関数は self-certify しない）。
 */
export function generateComplete(input: CompleteInput): CandidateDraft | null {
  const active = input.activeWindow ?? { startMin: 0, endMin: MAX_DAY_MIN };
  const placements = input.placements;
  if (placements.length === 0) return null; // 配置するものがない

  // busy = 既存 node ∪ protectedGaps（INV-17: recovery/free_time gap を埋めない）。
  // freeGaps が busy を除外するため、protectedGaps 区間は add 候補にならない。default 空＝挙動不変。
  const busy: Interval[] = [
    ...input.existing.map((n) => ({ startMin: n.startMin, endMin: n.endMin })),
    ...(input.protectedGaps ?? []),
  ];

  // 各 placement を一意 gap に割当（**all-or-nothing**: 1 つでも不適格/曖昧/不足なら null）
  const assignments: { readonly p: SeedPlacement; readonly gap: Interval; readonly duration: number }[] = [];
  for (const p of placements) {
    if (!isCandidateEligible(p, input.date)) return null; // 不適格（skip/tentative/weak/unknown/date）
    const duration = p.durationMin;
    if (duration === null || duration <= 0) return null; // 二重防御（isPlaceable 済だが型安全）
    const region = resolveRegion(p, active, input.bandBounds);
    if (!region) return null; // banded で bounds 無 → 推測しない
    const compatible = freeGaps(region, busy).filter((g) => g.endMin - g.startMin >= duration);
    if (compatible.length !== 1) return null; // 0=gap 不足 / >1=複数 gap で曖昧
    const gap = compatible[0];
    if (!gap) return null;
    assignments.push({ p, gap, duration });
  }

  // 競合: 配置区間が placement 間で重なる → no candidate（同一 gap 競合 + region 重複の防御）
  const placed = assignments
    .map((a) => ({ startMin: a.gap.startMin, endMin: a.gap.startMin + a.duration }))
    .sort((x, y) => x.startMin - y.startMin);
  for (let i = 1; i < placed.length; i++) {
    if (placed[i].startMin < placed[i - 1].endMin) return null; // 重なり → 競合
  }

  // id 衝突回避 + multi-add op 構築（add op を placement ごとに 1 つ・単一 CandidateDraft）
  const usedIds = new Set<string>(input.existing.map((n) => n.id));
  const ops: ChangeOp[] = [];
  const traces: SourceTrace[] = [];
  for (const a of assignments) {
    const itemId = `complete-${a.p.seedRef}`;
    if (usedIds.has(itemId)) return null; // id 衝突（既存 or placement 間重複）→ no candidate
    usedIds.add(itemId);
    const after: PlanItemSnapshot = {
      itemId,
      startMin: a.gap.startMin, // earliest-fit（gap 先頭・決定的）
      endMin: a.gap.startMin + a.duration,
      governance: COMPLETE_ITEM_GOVERNANCE,
      // title / location / raw text は持ち込まない
    };
    ops.push({ kind: "add", itemId, after });
    traces.push({
      kind: "seed",
      ref: a.p.seedRef, // 監査用 id（raw text でない）
      reason: COMPLETE_TRACE_REASON, // 構造化短定型（seed 自由文を持ち込まない）
      confidence: a.p.confidence,
    });
  }

  const id = `complete-${assignments.map((a) => a.p.seedRef).join("-")}`;
  const changeSet: ChangeSet = {
    id,
    ops,
    reason: "complete: place seeds in free gaps",
    sourceTraces: traces,
  };
  return { id, changeSet, sourceTraces: traces, proposedDisposition: "confirm" };
}
