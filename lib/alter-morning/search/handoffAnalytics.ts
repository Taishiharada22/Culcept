import "server-only";

/**
 * Handoff / Shadow 観測イベントの emit helper — W3-PR-12.5 Stage 1
 *
 * 位置づけ:
 *   Wave 3 (DialogState v2 + Places Search) の canary 観測のため、
 *   既存 console.info ログ (`[dialog-state-v2:shadow]` / `[places-handoff:*]`) に対応する
 *   構造化イベントを `stargazer_analytics` テーブルに非同期で流す。
 *
 * 設計:
 *   - fire-and-forget: `trackStargazerEvent` の Promise は await しない
 *   - flag_source で canary 対象 user のみ emit（resolveXxxFlagSource が null なら no-op）
 *   - schema_version を metadata に必ず入れる（CEO 方針）
 *   - console log と metadata が 1:1 対応（SQL で既存 Vercel log と cross-ref 可能）
 *
 * 参照:
 *   - docs/alter-morning-pr12-production-rollout-plan.md §2 Stage 2 観測項目
 *   - lib/alter-morning/dialog/flags.ts (resolveDialogStateV2FlagSource / resolvePlacesSearchFlagSource)
 *   - lib/stargazer/analytics.ts (trackStargazerEvent)
 */

import { trackStargazerEvent } from "@/lib/stargazer/analytics";
import {
  resolveDialogStateV2FlagSource,
  resolvePlacesSearchFlagSource,
} from "@/lib/alter-morning/dialog/flags";
import type { HandoffOrchestrationOutcome } from "./placesHandoffOrchestrator";

/**
 * metadata schema の version。
 * shape を破壊的に変える場合は必ず bump する（SQL 側の解釈を分離するため）。
 */
const SCHEMA_VERSION = "2026-04-24";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// emitShadowStateEvent — `alter_morning_shadow_state`
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ShadowStateEventArgs {
  userId: string;
  /** MorningSession.sessionId（event join の主キー） */
  sessionId: string | null;
  targetEventId: string | null;
  eventChanged: boolean;
  /** DialogState.conversationStatus (next state) */
  shadowStatus: string;
  narrowStep: number | null;
  readyForHandoff: boolean;
  /** selectShadowTargetEventId の reason */
  targetSelectionReason: string;
}

/**
 * 「[dialog-state-v2:shadow]」相当の構造化イベントを emit する。
 * flag_source=null（canary 外）の場合は no-op。失敗しても throw しない。
 */
export function emitShadowStateEvent(args: ShadowStateEventArgs): void {
  const flagSource = resolveDialogStateV2FlagSource(args.userId);
  if (flagSource === null) return;

  void trackStargazerEvent({
    userId: args.userId,
    event: "alter_morning_shadow_state",
    feature: "alter_morning",
    metadata: {
      schema_version: SCHEMA_VERSION,
      flag_source: flagSource,
      session_id: args.sessionId,
      target_event_id: args.targetEventId,
      event_changed: args.eventChanged,
      shadow_status: args.shadowStatus,
      narrow_step: args.narrowStep,
      ready_for_handoff: args.readyForHandoff,
      target_selection_reason: args.targetSelectionReason,
    },
    timestamp: new Date().toISOString(),
  }).catch(() => {
    /* emit path は絶対に壊さない（route 本体へ throw しない） */
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// emitHandoffOutcomeEvent — `alter_morning_handoff_outcome`
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface HandoffOutcomeEventArgs {
  userId: string;
  sessionId: string | null;
  outcome: HandoffOrchestrationOutcome;
  /** orchestratePlacesHandoff の start-end 差分（ms） */
  latencyMs: number;
}

/**
 * 「[places-handoff:*]」相当の構造化イベントを emit する。
 * outcome.kind ごとに metadata を条件分岐（kind, fingerprint は常に入る）。
 */
export function emitHandoffOutcomeEvent(args: HandoffOutcomeEventArgs): void {
  const flagSource = resolvePlacesSearchFlagSource(args.userId);
  if (flagSource === null) return;

  const oc = args.outcome;
  const metadata: Record<string, unknown> = {
    schema_version: SCHEMA_VERSION,
    flag_source: flagSource,
    session_id: args.sessionId,
    outcome_kind: oc.kind,
    fingerprint: oc.fingerprint,
    latency_ms: args.latencyMs,
  };

  if (oc.kind === "presented_from_api" || oc.kind === "presented_from_cache") {
    metadata.candidate_count = oc.candidateCount;
  } else if (oc.kind === "error") {
    metadata.provider_reason = oc.reason;
    metadata.log_class = oc.logClass;
  } else if (oc.kind === "skip_gate") {
    metadata.skip_reason = oc.reason;
  }

  void trackStargazerEvent({
    userId: args.userId,
    event: "alter_morning_handoff_outcome",
    feature: "alter_morning",
    metadata,
    timestamp: new Date().toISOString(),
  }).catch(() => {
    /* emit path は絶対に壊さない */
  });
}
