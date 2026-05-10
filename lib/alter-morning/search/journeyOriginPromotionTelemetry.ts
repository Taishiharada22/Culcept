/**
 * journeyOriginPromotionTelemetry — B-3c-2 Commit 4
 *
 * CEO/GPT 2026-05-03 B-3c-2 §4 (Telemetry, GPT 1st 補正反映):
 *   journey_origin promotion 経路の rollout 判断 input を `stargazer_analytics`
 *   に emit する pure helper 群 + emit wrapper。
 *
 * 規律 (= GPT 1st 補正 #1):
 *   - **PII 一切入れない** (= place name / address / raw label / lat/lng / placeId
 *     / raw user text / fingerprint 平文 を絶対に入れない)
 *   - 入れる metric: enum / count / boolean / hash のみ
 *   - schema_version で将来拡張時の互換性 marker
 *
 * 5 events (= §4.3):
 *   1. journey_origin_promotion_presented      (= candidate UI 表示時)
 *   2. journey_origin_promotion_succeeded      (= promotion + rebuild 成功時)
 *   3. journey_origin_promotion_blocked        (= GPT 2nd 補正対象、coords 不正 reject)
 *   4. journey_origin_promotion_provider_failure (= Places API 失敗)
 *   5. journey_origin_promotion_zero_candidates (= 候補ゼロ、reason 分離)
 *
 * 副作用:
 *   `trackStargazerEvent` を fire-and-forget で呼ぶ (= await しない、失敗を swallow)。
 *   route 経路を block しない。
 *
 * 注意:
 *   userId 未指定 (= test fixture) では emit しない (= 既存 transport_v2 と同パターン)。
 *   flag_source が null (= flag OFF) でも、debugging のため emit はする
 *   (= flag_source: null として残す。rollout 判断時 SQL で除外可能)。
 */

import type { FlagSource } from "../dialog/flags";
import type { ZeroCandidatesReason } from "./placesHandoffOrchestrator";

const SCHEMA_VERSION = "2026-05-03";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Event metadata schemas (= PII フリー、enum / count / bool のみ)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PresentedMetadata {
  schema_version: typeof SCHEMA_VERSION;
  target_kind: "journey_origin";
  flag_state: boolean;
  flag_source: FlagSource | null;
  candidate_count_before_filter: number;
  candidate_count_after_filter: number;
  invalid_coordinate_count: number;
  outcome: "presented_from_api" | "presented_from_cache";
}

export interface SucceededMetadata {
  schema_version: typeof SCHEMA_VERSION;
  target_kind: "journey_origin";
  flag_state: boolean;
  flag_source: FlagSource | null;
  candidate_count: number;
  segment_generated: boolean;
  active_presentation_cleared: true;
}

export interface BlockedMetadata {
  schema_version: typeof SCHEMA_VERSION;
  target_kind: "journey_origin";
  flag_state: boolean;
  flag_source: FlagSource | null;
  candidate_count: number;
  reject_reason: "missing_coordinates" | "invalid_state";
  active_presentation_cleared: false;
}

export interface ProviderFailureMetadata {
  schema_version: typeof SCHEMA_VERSION;
  target_kind: "journey_origin";
  log_class: string; // ProviderErrorLogClass enum
  reason: string; // ProviderErrorReason enum
  flag_state: boolean;
  flag_source: FlagSource | null;
}

export interface ZeroCandidatesMetadata {
  schema_version: typeof SCHEMA_VERSION;
  target_kind: "journey_origin";
  flag_state: boolean;
  flag_source: FlagSource | null;
  zero_reason: ZeroCandidatesReason;
  candidate_count_before_filter: number;
  candidate_count_after_filter: 0;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Emit helpers (= fire-and-forget)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 共通 emit wrapper (= fire-and-forget、test fixture では userId 未指定で skip)。
 *
 * test fixture でも emit したい場合は flagSource を強制 set すれば呼ばれる。
 * ただし unit test 通常は userId 未指定で skip される。
 */
function emit(
  userId: string | undefined,
  event: string,
  metadata: Record<string, unknown>,
): void {
  if (!userId) return; // test fixture skip
  void import("@/lib/stargazer/analytics")
    .then(({ trackStargazerEvent }) =>
      trackStargazerEvent({
        userId,
        event,
        feature: "alter_morning",
        metadata,
        timestamp: new Date().toISOString(),
      }),
    )
    .catch(() => {
      /* analytics must never block — swallow */
    });
}

export function emitPromotionPresented(
  userId: string | undefined,
  metadata: Omit<PresentedMetadata, "schema_version" | "target_kind">,
): void {
  emit(userId, "journey_origin_promotion_presented", {
    schema_version: SCHEMA_VERSION,
    target_kind: "journey_origin" as const,
    ...metadata,
  });
}

export function emitPromotionSucceeded(
  userId: string | undefined,
  metadata: Omit<
    SucceededMetadata,
    "schema_version" | "target_kind" | "active_presentation_cleared"
  >,
): void {
  emit(userId, "journey_origin_promotion_succeeded", {
    schema_version: SCHEMA_VERSION,
    target_kind: "journey_origin" as const,
    active_presentation_cleared: true as const,
    ...metadata,
  });
}

export function emitPromotionBlocked(
  userId: string | undefined,
  metadata: Omit<
    BlockedMetadata,
    "schema_version" | "target_kind" | "active_presentation_cleared"
  >,
): void {
  emit(userId, "journey_origin_promotion_blocked", {
    schema_version: SCHEMA_VERSION,
    target_kind: "journey_origin" as const,
    active_presentation_cleared: false as const,
    ...metadata,
  });
}

export function emitPromotionProviderFailure(
  userId: string | undefined,
  metadata: Omit<ProviderFailureMetadata, "schema_version" | "target_kind">,
): void {
  emit(userId, "journey_origin_promotion_provider_failure", {
    schema_version: SCHEMA_VERSION,
    target_kind: "journey_origin" as const,
    ...metadata,
  });
}

export function emitPromotionZeroCandidates(
  userId: string | undefined,
  metadata: Omit<ZeroCandidatesMetadata, "schema_version" | "target_kind">,
): void {
  emit(userId, "journey_origin_promotion_zero_candidates", {
    schema_version: SCHEMA_VERSION,
    target_kind: "journey_origin" as const,
    ...metadata,
  });
}
