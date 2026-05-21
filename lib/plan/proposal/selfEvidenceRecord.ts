/**
 * Self-Evidence Record — Phase 3 Invariant 21。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §2.3 Self-Direction invariant 21 / §3.1 J-1b
 *
 * 役割:
 *   proposal を支える 「内部 evidence record」 (= UI 非可視)。
 *   user 自身の観測のみを記録 (= Invariant 17 Internal data disclosure only)。
 *   Phase 3-M で Counter-Factual / Analogical Pattern Bridging の入力 source として使用。
 *
 * 形式 (= docs §2.3 Invariant 21): { signalType, observation, timestamp }
 *   - signalType: ProposalReason
 *   - observation: signal 種類別の構造化 record
 *   - timestamp: ISO 8601
 *
 * 不変原則:
 *   - UI 非可視 (= 直接的に user に見せない、 文体で間接表現のみ)
 *   - sensitive 除外 (= sensitive anchor は signal source にしない、 ProposalIntegrityContract sensitiveExcluded)
 *   - localStorage 保存も Phase 3 では非実装 (= 30 日 retention は Phase 3-M で)
 */

import type { ProposalReason } from "./proposalTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Observation 形式 — signal 種類別 discriminated union
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * pattern_repeat 観測 — 直近 4 週内の反復パターン
 */
export interface PatternRepeatObservation {
  readonly kind: "pattern_repeat";
  /** 反復回数 (= 直近 4 週、 同 weekday / 同時刻 / 同 category) */
  readonly repetitionCount: number;
  /** 観測 window 週数 (= 通常 4) */
  readonly weekWindow: number;
  /** 一致 feature (= 例: "monday_morning_cafe") */
  readonly matchingFeature: string;
}

/**
 * lived_geography 観測 — Phase 2-G fallback の中心
 */
export interface LivedGeographyObservation {
  readonly kind: "lived_geography";
  /** sample 数 */
  readonly sampleCount: number;
  /** 重心から最遠 sample までの距離 km */
  readonly maxDistanceKm: number;
  /** 重心 lat */
  readonly centroidLat: number;
  /** 重心 lng */
  readonly centroidLng: number;
}

/**
 * day_pattern 観測 — 曜日別パターン
 */
export interface DayPatternObservation {
  readonly kind: "day_pattern";
  /** 曜日 (= "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun") */
  readonly weekday: string;
  /** 直近 4 週で当該パターンを観測した日数 */
  readonly observedDays: number;
}

/**
 * unconfirmed_place_hint 観測 — 場所未確定 anchor への補完
 */
export interface UnconfirmedPlaceObservation {
  readonly kind: "unconfirmed_place";
  /** 対象 anchor id (= ExternalAnchor.id 参照、 mutate しない) */
  readonly anchorId: string;
  /** 補完場所 (= 例: "新宿") */
  readonly suggestedLocation: string;
}

export type SelfEvidenceObservation =
  | PatternRepeatObservation
  | LivedGeographyObservation
  | DayPatternObservation
  | UnconfirmedPlaceObservation;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SelfEvidenceRecord — 全 observation の wrapper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SelfEvidenceRecord {
  /** signal の種類 */
  readonly signalType: ProposalReason;
  /** 観測内容 (= signal 種別) */
  readonly observation: SelfEvidenceObservation;
  /** 観測時刻 (= ISO 8601) */
  readonly timestamp: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Observation から evidence count を抽出 (= ProposalSource.evidenceCount との整合用)。
 *
 * pattern_repeat   → repetitionCount
 * lived_geography  → sampleCount
 * day_pattern      → observedDays
 * unconfirmed_place → 1 (= 単一 anchor の hint)
 */
export function evidenceCountOf(observation: SelfEvidenceObservation): number {
  switch (observation.kind) {
    case "pattern_repeat":
      return observation.repetitionCount;
    case "lived_geography":
      return observation.sampleCount;
    case "day_pattern":
      return observation.observedDays;
    case "unconfirmed_place":
      return 1;
  }
}
