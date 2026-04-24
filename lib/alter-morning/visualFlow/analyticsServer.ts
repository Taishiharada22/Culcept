import "server-only";

/**
 * W3-PR-13 M4: Visual Flow server-side analytics wrapper.
 *
 * 本 module は "server-only" で、`trackStargazerEvent` 経由で
 * `stargazer_analytics` テーブルに insert する。
 *
 * 呼び出し場所:
 *   - app/(culcept)/page.tsx — visualFlowEnabled=true の時のみ emit
 *   - app/api/alter-morning/visual-flow/telemetry/route.ts — client relay
 *
 * fire-and-forget: 失敗しても呼び出し側の render / response を遅延させない。
 *
 * 設計書: docs/alter-morning-pr13-visual-flow-rollout-plan.md
 */

import { trackStargazerEvent } from "@/lib/stargazer/analytics";
import {
  VISUAL_FLOW_FEATURE,
  type VisualFlowClientEventPayload,
  type VisualFlowFlagEvaluatedMetadata,
} from "./analytics";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Server-side emit: visual_flow_flag_evaluated
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * visualFlowEnabled=true を解決したユーザーに対して 1 回 emit する。
 * 呼び出し側の責務として `visualFlowEnabled === true` を事前確認すること。
 * （CEO decision #3: enabled=false は emit しない。noise 回避）
 *
 * fire-and-forget: DB insert の成否は待たない（page.tsx render を遅延させない）。
 */
export function emitVisualFlowFlagEvaluated(args: {
  userId: string;
  metadata: VisualFlowFlagEvaluatedMetadata;
}): void {
  const { userId, metadata } = args;
  void trackStargazerEvent({
    userId,
    event: "visual_flow_flag_evaluated",
    feature: VISUAL_FLOW_FEATURE,
    // interface は暗黙の index signature を持たないため、
    // `Record<string, unknown>` へ明示的に narrow する。
    metadata: metadata as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  }).catch(() => {
    // swallow: trackStargazerEvent 内部で warn 済み
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Server-side relay: client payload → stargazer_analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * API route から呼ばれる。validate 済み payload + session.user.id を受けて insert。
 *
 * **必ず validate 済みの payload を渡すこと**（API route で
 * `validateVisualFlowClientPayload` を通したもの）。本関数は再検証しない。
 *
 * userId は API route で `session.user.id` から取得された値であり、
 * client 入力の user_id は信頼しない（server-side 上書き）。
 */
export async function emitVisualFlowClientEventFromServer(args: {
  userId: string;
  payload: VisualFlowClientEventPayload;
}): Promise<boolean> {
  const { userId, payload } = args;
  return trackStargazerEvent({
    userId,
    event: payload.event,
    feature: VISUAL_FLOW_FEATURE,
    metadata: payload.metadata as unknown as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  });
}
