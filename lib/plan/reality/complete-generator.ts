/**
 * Reality Control OS — Complete Generator（A1-4-2a fill-only add の最小 generator）
 *
 * 親設計: docs/aneurasync-reality-candidate-generator-design.md §4h/§4i（A1-4-0/A1-4-1）
 *
 * 役割: A1-4-1 の `SeedPlacement`（配置可能材料）を **当日の空き時間(gap)に 1 件だけ add する
 *   Complete 候補（CandidateDraft）** に変換できるかの **最小土台**。Complete 本体ではない。
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
 *   - gap が一意のときだけ配置（複数 gap=曖昧・不足=置けない→ no candidate）。多重配置は A1-4-2b へ defer。
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
 * A1-4-2a: SeedPlacement[] → **fill-only add candidate**（最小 generator・Complete mode）。
 *
 * 手順:
 *   1. **結合条件**で候補対象を絞る（isCandidateEligible）。**ちょうど 1 件**のときだけ進む
 *      （0=候補なし / >1=多重配置は曖昧・A1-4-2b へ defer）。
 *   2. window を region に解決（banded で bounds 無→no candidate・clock を推測しない）。
 *   3. region 内 free gap のうち duration が入るものが **ちょうど 1 つ**のときだけ配置
 *      （0=gap 不足 / >1=複数 gap で曖昧→ no candidate）。gap 先頭に earliest-fit（決定的）。
 *   4. **add op 1 件**の CandidateDraft（metrics なし）。生成 item は raw text を持たない。
 *
 * 戻り: 候補が 1 件成立すれば CandidateDraft、それ以外は null。
 * **安全性の最終判定は evaluator + Gate-first**（本関数は self-certify しない）。
 */
export function generateComplete(input: CompleteInput): CandidateDraft | null {
  const active = input.activeWindow ?? { startMin: 0, endMin: MAX_DAY_MIN };

  const eligible = input.placements.filter((p) => isCandidateEligible(p, input.date));
  if (eligible.length !== 1) return null; // 0=候補なし / >1=多重配置は曖昧（defer A1-4-2b）
  const p = eligible[0];
  if (!p) return null;

  const duration = p.durationMin;
  if (duration === null || duration <= 0) return null; // 二重防御（isPlaceable 済だが型安全）

  const region = resolveRegion(p, active, input.bandBounds);
  if (!region) return null; // window 解決不能（banded で bounds 無）→ 推測しない

  const busy: Interval[] = input.existing.map((n) => ({ startMin: n.startMin, endMin: n.endMin }));
  const compatible = freeGaps(region, busy).filter((g) => g.endMin - g.startMin >= duration);
  if (compatible.length !== 1) return null; // 0=gap 不足 / >1=複数 gap で曖昧
  const gap = compatible[0];
  if (!gap) return null;

  const itemId = `complete-${p.seedRef}`;
  if (input.existing.some((n) => n.id === itemId)) return null; // id 衝突（保守的に no candidate）

  const after: PlanItemSnapshot = {
    itemId,
    startMin: gap.startMin, // earliest-fit（gap 先頭・決定的）
    endMin: gap.startMin + duration,
    governance: COMPLETE_ITEM_GOVERNANCE,
    // title / location / raw text は持ち込まない
  };
  const trace: SourceTrace = {
    kind: "seed",
    ref: p.seedRef, // 監査用 id（raw text でない）
    reason: COMPLETE_TRACE_REASON, // 構造化短定型（seed 自由文を持ち込まない）
    confidence: p.confidence,
  };
  const op: ChangeOp = { kind: "add", itemId, after };
  const changeSet: ChangeSet = {
    id: itemId,
    ops: [op],
    reason: "complete: place seed in free gap",
    sourceTraces: [trace],
  };
  return { id: itemId, changeSet, sourceTraces: [trace], proposedDisposition: "confirm" };
}
