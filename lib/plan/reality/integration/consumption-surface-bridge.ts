import "server-only";
/**
 * Reality Control OS — A1-5-7-4 Consumption Surface Bridge（**server-only・pure-logic・no-DB・no-visible**・barrel 非 export・未配線）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.44
 *
 * 役割: A1-5-7-3 smoke で発見したギャップ（surface items 用 enriched placements を harness 側で再算出＝drift risk）を **canonical module 側で解消**する bridge。
 *   `computeCapturedSeedConsumption`（consumption の canonical core・1 計算で summary + enriched placements）と
 *   `presentCandidateSurface`（surface redaction 境界・seedRef drop）を **1 本に束ね**、
 *   **candidateCount（summary）と surface items を同一 canonical 計算から導出**する（再算出 drift をなくす）。
 *
 * 厳守:
 *   - **candidateCount と surface items は同一 core 由来**（computeCapturedSeedConsumption 1 回）。route visible integration でも本 bridge を使えば再算出が起きない。
 *   - **redaction は `presentCandidateSurface` 1 箇所**: core の `enrichedCandidatePlacements`（seedRef 持つ内部値）を **bridge 内で redact** し、出力 `surface` は **seedRef / source_ref / UUID / raw を持たない**。
 *   - **既存 summary-only runner（runCapturedSeedConsumptionShadow）を壊さない**（同じ core を共有）。
 *   - **CandidateDraft を入力にしない**（UUID 源を境界に入れない）。pure・deterministic・DB / Supabase / route / UI import なし・barrel 非 export・route.ts 非接続。
 */

import {
  computeCapturedSeedConsumption,
  computeConsumptionFromProjected,
  type CapturedSeedConsumptionInput,
  type CapturedSeedConsumptionSummary,
  type SeedConsumptionContext,
} from "./captured-seed-consumption";
import { presentCandidateSurface, type CandidateSurfaceDTO } from "./candidate-surface";
import { selectSurfaceableCandidates, type CandidateLifecycleEntry } from "./candidate-lifecycle-guard";
import type { SeedLifecycleMeta } from "./seed-column-restricted";
import type { SeedPlacement } from "../seed-placement";
import { enrichSeedPlacementsFromEvidences, type DurationEvidence } from "../seed-placement-enrich";

/**
 * A1-5-11-2: surface read path の lifecycle guard 入力（**pure・raw 非搬送**・now は注入＝deterministic）。
 *   `metaBySeedRef`（read 由来 actionShape/capturedAtMs/expiresAtMs）+ `nowMs`（呼出側=server が Date.now 注入）+ freshness policy。
 */
export interface ConsumptionLifecycleGuard {
  readonly metaBySeedRef: ReadonlyMap<string, SeedLifecycleMeta>;
  readonly nowMs: number;
  readonly freshnessMs?: number;
}

/**
 * A1-5-11-2: **enriched placements を lifecycle guard で絞る**（pure）。durationMin は enrich 後ゆえ dedup 構造キーに有効。
 *   enriched + meta(seedRef) → `CandidateLifecycleEntry[]` → `selectSurfaceableCandidates`（active/fresh/非 expired/非 duplicate）→ 残った seedRef の enriched placement のみ返す。
 *   meta 欠落 seedRef は fail-open（capturedAtMs=nowMs=fresh / expiresAtMs=null）で残す（join miss で正当候補を落とさない）。raw/source_ref を出さない（entry は構造のみ）。
 */
function applyLifecycleGuardToEnriched(
  enriched: readonly SeedPlacement[],
  guard: ConsumptionLifecycleGuard
): readonly SeedPlacement[] {
  const entries: CandidateLifecycleEntry[] = enriched.map((p) => {
    const meta = guard.metaBySeedRef.get(p.seedRef);
    return {
      seedRef: p.seedRef,
      status: "active", // read は status='active' のみ取得（defense-in-depth）
      capturedAtMs: meta?.capturedAtMs ?? guard.nowMs, // 欠落→fresh（fail-open keep）
      expiresAtMs: meta?.expiresAtMs ?? null,
      actionShape: meta?.actionShape ?? null,
      desiredDate: p.date ?? null,
      desiredTimeHint: p.window?.band ?? null,
      durationMin: p.durationMin, // enriched（dedup 構造キー）
      confidence: p.confidence,
    };
  });
  const refs = new Set(
    selectSurfaceableCandidates(entries, { nowMs: guard.nowMs, freshnessMs: guard.freshnessMs }).surfaceable.map((e) => e.seedRef)
  );
  return enriched.filter((p) => refs.has(p.seedRef));
}

/** bridge 出力（**redacted**）。summary（observability 用 counts）と surface（response/UI 用 DTO）を **同一 canonical 計算**から出す。 */
export interface CapturedSeedConsumptionSurfaceResult {
  /** consumption summary（counts + reason・redacted）。 */
  readonly summary: CapturedSeedConsumptionSummary;
  /** candidate surface DTO（**seedRef/source_ref/raw drop 済**・presentCandidateSurface 由来）。 */
  readonly surface: CandidateSurfaceDTO;
}

/**
 * A1-5-7-4: consumption → surface の **canonical bridge**（pure・redacted）。
 *   `computeCapturedSeedConsumption`（1 計算で summary + enriched candidate placements）→ `presentCandidateSurface`（seedRef drop）。
 *   **summary.candidateCount と surface（items/candidateCount）は同一 core 由来**（再算出なし＝drift なし）。
 *   surface は **fail-closed**（candidateCount=0 → hasCandidate=false・items=[] / prm_typical·weak は isSurfaceableCandidate で除外）。
 *   route response / UI には接続しない。visible route integration はこの surface を `appendCaptureCandidateToMorningResult` に渡す（別 GO）。
 */
export function runCapturedSeedConsumptionWithSurface(
  input: CapturedSeedConsumptionInput
): CapturedSeedConsumptionSurfaceResult {
  return surfaceFromComputation(computeCapturedSeedConsumption(input));
}

/**
 * A1-5-7-5: **projected data（placements + evidence map）からの canonical bridge**（pure・redacted）。
 *   route は **single-read-source 制約**ゆえ canonical read source（seed-source / duration-evidence-source）の projected 出力を本経路に流す。
 *   `computeConsumptionFromProjected`（row 経路と enrich/generateComplete/summary を共有＝drift なし）→ `presentCandidateSurface`（seedRef drop）。
 */
export function runConsumptionSurfaceFromProjected(
  placements: readonly SeedPlacement[],
  evidenceMap: Readonly<Record<string, readonly DurationEvidence[]>>,
  context?: SeedConsumptionContext,
  lifecycleGuard?: ConsumptionLifecycleGuard
): CapturedSeedConsumptionSurfaceResult {
  // A1-5-11-2: lifecycle guard（任意）。enrich→guard で stale/expired/duplicate を surface 直前に除外。
  //   core（computeConsumptionFromProjected）は guarded を **再 enrich（idempotent・durationMin 上書きなし）** ゆえ
  //   candidateCount(summary) と surface items は **同一 guarded 集合由来**（drift なし）。guard 不在時は既存挙動不変。
  const effective = lifecycleGuard
    ? applyLifecycleGuardToEnriched(enrichSeedPlacementsFromEvidences(placements, evidenceMap), lifecycleGuard)
    : placements;
  return surfaceFromComputation(computeConsumptionFromProjected(effective, evidenceMap, context));
}

/** computation → {summary, surface}（redaction 境界は presentCandidateSurface 1 箇所・seedRef drop）。 */
function surfaceFromComputation(computation: {
  summary: CapturedSeedConsumptionSummary;
  enrichedCandidatePlacements: readonly SeedPlacement[];
}): CapturedSeedConsumptionSurfaceResult {
  const surface = presentCandidateSurface({
    summary: computation.summary,
    candidatePlacements: computation.enrichedCandidatePlacements,
  });
  return { summary: computation.summary, surface };
}
