/**
 * Reality Control OS — A1-5-7-0/1 Candidate Surface Contract（**pure presenter / mapper**・no-DB・no-visible・barrel 非 export・未配線）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.41
 *
 * 役割: captured seed consumption（A1-5-6-0/1）の結果を、**UI / route response に出してよい安全な DTO** へ変換する
 *   **candidate path の最後の redaction 境界**。visible integration（route/UI 接続）の **直前**で presentation contract を固定する。
 *
 * 厳守（redaction 境界・no-visible）:
 *   - **CandidateDraft は surface 入力にしない**: その id / itemId（"complete-{seedRef}"）/ sourceTraces.ref は **seedRef(UUID)** を持つ。
 *     surface は **consumption summary（counts・既に redacted）+ enriched SeedPlacement（seedRef を落とした安全 field）** のみから構成する。
 *     ＝ UUID 源を surface 境界に **到達させない**（最強 redaction）。
 *   - **raw / source_ref / UUID / prompt / response本文 / API key を絶対に surface しない**。DTO は enum / number / date(YYYY-MM-DD) / null のみ。
 *   - **prm_typical は surface 上も候補化しない**（grounding=weak）。`isSurfaceableCandidate` で seed_explicit / correction(high→strong) のみ通す（fail-closed）。
 *   - confidence は **band 化**（raw 0..1 を出さない）。
 *   - **"候補があります" 以上の断定をしない**: DTO は構造化 data のみ・prose / UI 文言を生成しない。status は has_candidate / none 止まり。
 *   - **route response を変えない**（載せる位置は docs 案のみ）。**UI / PlanClient に接続しない**。pure・DB / Supabase / route / UI import なし・barrel 非 export。
 */

import type { CapturedSeedConsumptionSummary } from "./captured-seed-consumption";
import type { SeedPlacement, TimeBand } from "../seed-placement";
import type { DurationEvidenceSource } from "../seed-placement-enrich";

/** surface 状態（"候補があります" / なし）。断定はここまで。 */
export type SurfaceStatus = "has_candidate" | "none";

/** 候補の duration 根拠ラベル（**prm_typical は surface しない**ので除外）。 */
export type EvidenceSourceLabel = Exclude<DurationEvidenceSource, "prm_typical">; // "seed_explicit" | "correction"

/** confidence の coarse band（raw 0..1 を出さない）。 */
export type ConfidenceBand = "high" | "medium" | "low";

/** 時間帯ラベル（display-safe・既存 TimeBand）。 */
export type TimeBandLabel = TimeBand; // "morning" | "afternoon" | "evening"

/** 候補 1 件（add 提案）の **display-safe** 構造化詳細。**seedRef / source_ref / raw / UUID を持たない**（handle は一方向 hash で seedRef ではない）。 */
export interface CandidateSurfaceItem {
  /** 所要時間（分）。 */
  readonly durationMin: number;
  /** duration 根拠（seed_explicit=ユーザー明示 / correction=修正学習・**enum・raw でない**）。 */
  readonly evidenceSource: EvidenceSourceLabel;
  /** 希望日（YYYY-MM-DD / 不明 null・raw でない）。 */
  readonly date: string | null;
  /** 希望時間帯（morning/afternoon/evening / 帯なし null）。 */
  readonly band: TimeBandLabel | null;
  /** 確からしさ band（raw 0..1 を出さない）。 */
  readonly confidenceBand: ConfidenceBand;
  /**
   * A1-6-2: **opaque candidate handle**（一方向 hash `"c1:"+sha256(seedRef)`・**seedRef を出さない** action 用参照）。
   *   `deriveHandle` 注入時のみ付与（未注入＝既存 surface と完全不変）。client はこれを action request に載せる（seedRef を持たない・偽造不能）。
   */
  readonly handle?: string;
}

/** captured seed consumption → **UI / route response に出してよい安全 DTO**（redacted）。 */
export interface CandidateSurfaceDTO {
  /** 候補があるか（= summary.candidateCount > 0）。 */
  readonly hasCandidate: boolean;
  /** 候補 change-set 数（generateComplete は multi-add 1 件 or 0 → 0/1）。 */
  readonly candidateCount: number;
  /** surface 状態（断定はここまで）。 */
  readonly status: SurfaceStatus;
  /** 候補の add 提案詳細（placements 未提供 / 非 surfaceable は []）。 */
  readonly items: readonly CandidateSurfaceItem[];
}

/** confidence(0..1) → band（**raw 数値を出さない**）。閾値は seed-placement の WEAK 閾値(0.5)/high(0.8) と整合。 */
export function confidenceBand(confidence: number): ConfidenceBand {
  if (!Number.isFinite(confidence)) return "low";
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

/**
 * placement が surface 可能な candidate-grade か（**fail-closed**）。
 *   = duration 既知(>0) ∧ grounding=strong ∧ durationSource ∈ {seed_explicit, correction} ∧ dispositionHint=place。
 * **prm_typical / weak / unknown / skip / tentative を除外**（generateComplete の候補化条件と整合・surface も同基準）。
 */
export function isSurfaceableCandidate(p: SeedPlacement): boolean {
  return (
    p.durationMin !== null &&
    p.durationMin > 0 &&
    p.grounding === "strong" &&
    (p.durationSource === "seed_explicit" || p.durationSource === "correction") &&
    p.dispositionHint === "place"
  );
}

/**
 * enriched placement → **safe surface item**（**seedRef を落とす**・safe field のみ）。surfaceable 前提。
 *   `deriveHandle`（A1-6-2・server-side で注入）があれば **opaque handle**（一方向 hash）を付与する（seedRef は item に出さない）。
 *   未注入なら handle 無（既存 surface と完全不変）。本関数自体は **crypto を import しない**（pure 維持・derive は注入）。
 */
export function toCandidateSurfaceItem(
  p: SeedPlacement,
  deriveHandle?: (seedRef: string) => string
): CandidateSurfaceItem {
  const item: CandidateSurfaceItem = {
    durationMin: p.durationMin as number, // surfaceable ゆえ non-null
    evidenceSource: p.durationSource as EvidenceSourceLabel, // seed_explicit | correction
    date: p.date ?? null,
    band: p.window?.band ?? null,
    confidenceBand: confidenceBand(p.confidence),
  };
  return deriveHandle ? { ...item, handle: deriveHandle(p.seedRef) } : item;
}

/**
 * A1-5-7-0/1: captured seed consumption → **CandidateSurfaceDTO**（**pure・redacted・断定は "候補があります" まで**）。
 *   - candidateCount=0 → `{ hasCandidate:false, candidateCount:0, status:"none", items:[] }`（no surface）。
 *   - candidateCount>0 → items = candidatePlacements を `isSurfaceableCandidate` で filter（prm_typical/weak 除外）→ `toCandidateSurfaceItem`（seedRef drop）。
 *     placements 未提供なら items=[]（count-level surface・"候補があります" のみ）。
 *   **CandidateDraft は入力にしない**（UUID 源を境界に入れない）。route response / UI には接続しない。
 *   A1-6-2: `deriveHandle`（server-side で注入・一方向 hash）があれば各 item に **opaque handle** を付与（seedRef は出さない）。
 *     未注入なら handle 無（既存 surface 不変）。crypto は **注入**（本 module は pure 維持・server-only にしない）。
 */
export function presentCandidateSurface(
  input: {
    readonly summary: CapturedSeedConsumptionSummary;
    readonly candidatePlacements?: readonly SeedPlacement[];
  },
  deriveHandle?: (seedRef: string) => string
): CandidateSurfaceDTO {
  if (input.summary.candidateCount <= 0) {
    return { hasCandidate: false, candidateCount: 0, status: "none", items: [] };
  }
  const items = (input.candidatePlacements ?? [])
    .filter(isSurfaceableCandidate)
    .map((p) => toCandidateSurfaceItem(p, deriveHandle));
  return {
    hasCandidate: true,
    candidateCount: input.summary.candidateCount,
    status: "has_candidate",
    items,
  };
}
