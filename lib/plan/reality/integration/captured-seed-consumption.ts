import "server-only";
/**
 * Reality Control OS — A1-5-6-0/1 Captured Seed Consumption Shadow Runner（server-only・pure-logic・DI・no-run・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.39
 *
 * 役割: capture pipeline が書いた `plan_seeds` + `plan_seed_duration_evidences`（**A1-5-5g-4 で実 staging write 実証済**）を、
 *   reality candidate 側で **安全に消費する入口**を固める shadow runner。captured row（allowed column DTO）を DI で受け、
 *   既存 read seam projection → enrich → generateComplete を **canonical 1 経路**で合成し、**redacted summary** を返す。
 *   ＝「書いた seed/evidence がどう candidate 化するか」を runtime visible behavior を変えずに固定する段階。
 *
 * 厳守（no-write / no-visible-behavior / consumption 境界）:
 *   - **DB write しない・実 DB read しない**（row は DI・fake/no-run）。実 read smoke は別 GO。
 *   - **route response / UI / PlanClient / RealityInput 本接続 / generateCandidates runtime に触れない**。
 *   - **allowed columns のみ扱う**: 入口で **allowlist 再構築**（`pickAllowed*`）し raw 列（signal / desired_action / source_ref / raw_text 等）を drop（ignore fail-closed）。
 *   - **source_ref は candidate path に載せない**（read seam が既に非 select・本 runner も保持しない）。
 *   - **evidence 規則は既存 enrich を再利用**: high seed_explicit / correction → strong → 候補化可 / prm_typical → weak → 候補化不可 / low → map に入らない / 範囲外・不正 source → 除外。
 *   - **result は redacted summary のみ**（counts + boolean + reason code・id / source_ref / raw なし）。
 *   - **deterministic / pure**（Date.now / random なし）。server-only / barrel 非 export。
 */

import {
  projectSeedRowsToPlacements,
  ALLOWED_SEED_COLUMNS,
  type ColumnRestrictedSeedRow,
} from "./seed-column-restricted";
import {
  projectDurationEvidenceRowsToMap,
  ALLOWED_DURATION_EVIDENCE_COLUMNS,
  type ColumnRestrictedDurationEvidenceRow,
} from "./duration-evidence-source";
import { enrichSeedPlacementsFromEvidences, type DurationEvidence } from "../seed-placement-enrich";
import { generateComplete, type Interval } from "../complete-generator";
import type { TimeBand, SeedPlacement } from "../seed-placement";
import type { GovernedNode } from "../candidate-generator";

/** consumption の day context（generateComplete の placements 以外・caller/未来 runtime 提供・shadow では DI fake）。 */
export interface SeedConsumptionContext {
  /** 当日の日付（YYYY-MM-DD）。placement.date 照合に使う（不一致は候補化しない）。 */
  readonly date?: string;
  /** 当日の active window（clock をハードコードしない・既定 [0,1440]）。 */
  readonly activeWindow?: Interval;
  /** band→clock 境界（banded placement に必要・無ければ banded は候補化しない）。 */
  readonly bandBounds?: Readonly<Partial<Record<TimeBand, Interval>>>;
  /** 当日の既存 node（gap 計算・既定 []）。 */
  readonly existing?: readonly GovernedNode[];
}

/** shadow runner 入力（**captured row は DI**・allowed column DTO）。 */
export interface CapturedSeedConsumptionInput {
  readonly seedRows: readonly ColumnRestrictedSeedRow[];
  readonly evidenceRows: readonly ColumnRestrictedDurationEvidenceRow[];
  readonly context?: SeedConsumptionContext;
}

/** consumption 結果の coarse reason（redacted）。 */
export type ConsumptionReason = "candidate" | "no_seed" | "no_candidate";

/** consumption の **redacted summary**（counts + boolean + reason code のみ・id / source_ref / raw なし）。 */
export interface CapturedSeedConsumptionSummary {
  /** active seed placement 数（status=active のみ）。 */
  readonly seedCount: number;
  /** adoptable evidence 数（high ∧ valid・projection map 由来）。 */
  readonly adoptableEvidenceCount: number;
  /** 候補数（generateComplete は multi-add 1 件 or null → 0/1）。 */
  readonly candidateCount: number;
  /** 候補化するか（candidateCount > 0）。 */
  readonly wouldCandidate: boolean;
  /** coarse reason（candidate / no_seed / no_candidate）。 */
  readonly reason: ConsumptionReason;
}

/** seed row を allowed column のみで再構築（**raw 列 drop・ignore fail-closed**）。extra key（signal/desired_action/source_ref）は写さない。 */
export function pickAllowedSeedColumns(row: ColumnRestrictedSeedRow): ColumnRestrictedSeedRow {
  return {
    id: row.id,
    user_id: row.user_id,
    desired_date: row.desired_date,
    desired_time_hint: row.desired_time_hint,
    action_shape: row.action_shape,
    confidence: row.confidence,
    status: row.status,
    // A1-5-11-2: lifecycle metadata（allowlist・raw でない）を保持（row 経路 sanitize でも落とさない）。
    captured_at: row.captured_at,
    expires_at: row.expires_at,
  };
}

/** evidence row を allowed column のみで再構築（**source_ref / raw 列 drop**）。 */
export function pickAllowedDurationEvidenceColumns(
  row: ColumnRestrictedDurationEvidenceRow
): ColumnRestrictedDurationEvidenceRow {
  return {
    id: row.id,
    user_id: row.user_id,
    seed_id: row.seed_id,
    duration_min: row.duration_min,
    source: row.source,
    confidence: row.confidence,
  };
}

/**
 * consumption の **canonical 計算結果**（A1-5-7-4・**内部**）。summary（redacted）と候補化した enriched placements を **1 計算**で出す。
 *   `enrichedCandidatePlacements` は **seedRef を持つ内部値**（candidateCount>0 のとき候補 placements・0 のとき []）。
 *   **surface 境界を越える前に `presentCandidateSurface` で redact（seedRef drop）必須**。本値を route response / UI に直接出さない。
 */
export interface ConsumptionComputation {
  readonly summary: CapturedSeedConsumptionSummary;
  /** 候補化した enriched placements（seedRef 持つ・内部のみ・surface 前に redact 必須）。candidateCount=0 のとき []。 */
  readonly enrichedCandidatePlacements: readonly SeedPlacement[];
}

/**
 * A1-5-7-4: consumption の **canonical core**（pure・DI・no-run）。summary と enriched candidate placements を **1 計算**で導出する。
 *   1. sanitize（allowlist 再構築・raw/source_ref drop）→ 2. project（read seam）→ 3. enrich（既存規則）→ 4. generateComplete（結合条件）。
 *   summary（counts・redacted）と enrichedCandidatePlacements（候補時のみ・内部）を返す。
 *   **candidateCount と surface items が同一計算から出る**よう、bridge（runCapturedSeedConsumptionWithSurface）と summary-only runner が本 core を共有（drift 防止）。
 */
export function computeCapturedSeedConsumption(
  input: CapturedSeedConsumptionInput
): ConsumptionComputation {
  // 1. sanitize（allowlist 再構築・raw / source_ref drop）
  const seedRows = input.seedRows.map(pickAllowedSeedColumns);
  const evidenceRows = input.evidenceRows.map(pickAllowedDurationEvidenceColumns);
  // 2. project（read seam・raw 非搬送）→ 3-5 は projected core 共有
  return computeConsumptionFromProjected(
    projectSeedRowsToPlacements(seedRows),
    projectDurationEvidenceRowsToMap(evidenceRows),
    input.context
  );
}

/**
 * A1-5-7-5: **projected data（placements + evidence map）からの consumption core**（pure・DI・no-run）。
 *   canonical read source（seed-source / duration-evidence-source）が **read+project 済**（placements / map）を受け、
 *   **enrich → generateComplete → summary** を行う（**reality tree の single-read-source 制約**ゆえ route は本経路を使う）。
 *   row 経路（computeCapturedSeedConsumption）と **enrich/generateComplete/summary を共有**（drift 防止）。
 *   placements は active のみ・map は adoptable(high) のみ前提（canonical source が保証）。
 */
export function computeConsumptionFromProjected(
  placements: readonly SeedPlacement[],
  evidenceMap: Readonly<Record<string, readonly DurationEvidence[]>>,
  context?: SeedConsumptionContext
): ConsumptionComputation {
  const adoptableEvidenceCount = Object.values(evidenceMap).reduce((n, arr) => n + arr.length, 0);

  // enrich（既存規則: high seed_explicit/correction→strong / prm_typical→weak）
  const enriched = enrichSeedPlacementsFromEvidences(placements, evidenceMap);

  // generateComplete（結合条件・grounding=strong のみ候補化）
  const candidate = generateComplete({
    placements: enriched,
    existing: context?.existing ?? [],
    activeWindow: context?.activeWindow,
    date: context?.date,
    bandBounds: context?.bandBounds,
  });
  const candidateCount = candidate ? 1 : 0;
  const seedCount = placements.length;
  const reason: ConsumptionReason =
    candidateCount > 0 ? "candidate" : seedCount === 0 ? "no_seed" : "no_candidate";

  return {
    summary: { seedCount, adoptableEvidenceCount, candidateCount, wouldCandidate: candidateCount > 0, reason },
    enrichedCandidatePlacements: candidateCount > 0 ? enriched : [],
  };
}

/**
 * A1-5-6-0/1: captured seed/evidence を candidate へ消費する **shadow runner**（pure・DI・no-run・**redacted summary-only**）。
 *   **既存 API 維持**: canonical core（computeCapturedSeedConsumption）の summary を返す（surface items を要らない caller 用）。
 *   surface（items 込み）が要るなら bridge `runCapturedSeedConsumptionWithSurface` を使う。
 */
export function runCapturedSeedConsumptionShadow(
  input: CapturedSeedConsumptionInput
): CapturedSeedConsumptionSummary {
  return computeCapturedSeedConsumption(input).summary;
}

/** sanitize が漏れなく allowed column を写すかの自己点検用（test が allowlist と照合）。 */
export const CONSUMPTION_ALLOWED_SEED_COLUMNS = ALLOWED_SEED_COLUMNS;
export const CONSUMPTION_ALLOWED_EVIDENCE_COLUMNS = ALLOWED_DURATION_EVIDENCE_COLUMNS;
