import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeUserPair } from "./helpers";
import type { EncounterTriggerType } from "./types";

/**
 * encounter_eventsに新しいイベントを挿入するユーティリティ。
 * ペア正規化、重複チェック、suppression/blockチェックを行う。
 *
 * 呼び出し例:
 *   - Battle投票で同じエントリーに投票した2ユーザー → trigger_type='event_overlap'
 *   - 同じTribeに所属する2ユーザー → trigger_type='community_overlap'
 *   - コラボセッションの参加者同士 → trigger_type='community_overlap'
 *   - 管理者による手動シード → trigger_type='manual_seed'
 */
export async function createEncounterIfEligible(
  supabase: SupabaseClient,
  userIdA: string,
  userIdB: string,
  triggerType: EncounterTriggerType,
  opts?: {
    contextType?: string;
    coarseContext?: string;
    rawSignalScore?: number;
  },
): Promise<{ created: boolean; reason?: string; eventId?: string }> {
  if (userIdA === userIdB) {
    return { created: false, reason: "same_user" };
  }

  const [userLow, userHigh] = normalizeUserPair(userIdA, userIdB);

  // 1. Check blocks (both directions)
  const { data: blocks } = await supabase
    .from("rendezvous_blocks")
    .select("id")
    .or(
      `and(blocker_user_id.eq.${userLow},blocked_user_id.eq.${userHigh}),and(blocker_user_id.eq.${userHigh},blocked_user_id.eq.${userLow})`,
    )
    .limit(1);

  if (blocks && blocks.length > 0) {
    return { created: false, reason: "blocked" };
  }

  // 2. Check active suppressions
  const { data: suppressions } = await supabase
    .from("rendezvous_suppressions")
    .select("id, until_at")
    .eq("user_low", userLow)
    .eq("user_high", userHigh)
    .limit(10);

  if (suppressions && suppressions.length > 0) {
    const now = new Date();
    const active = suppressions.some(
      (s: any) => s.until_at === null || new Date(s.until_at) > now,
    );
    if (active) {
      return { created: false, reason: "suppressed" };
    }
  }

  // 3. Check for recent pending/evaluating encounter (dedup within 24h)
  const recentCutoff = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: recent } = await supabase
    .from("encounter_events")
    .select("id")
    .eq("user_a", userLow)
    .eq("user_b", userHigh)
    .gte("created_at", recentCutoff)
    .in("evaluation_status", ["pending", "evaluating", "candidate_created"])
    .limit(1);

  if (recent && recent.length > 0) {
    return { created: false, reason: "duplicate_recent" };
  }

  // 4. Check both users have enabled profiles
  const { data: profiles } = await supabase
    .from("rendezvous_profiles")
    .select("user_id, is_enabled, is_paused")
    .in("user_id", [userLow, userHigh]);

  if (!profiles || profiles.length < 2) {
    return { created: false, reason: "missing_profile" };
  }

  const bothEnabled = profiles.every(
    (p: any) => p.is_enabled && !p.is_paused,
  );
  if (!bothEnabled) {
    return { created: false, reason: "profile_disabled" };
  }

  // 5. Insert encounter event
  const { data: inserted, error } = await supabase
    .from("encounter_events")
    .insert({
      user_a: userLow,
      user_b: userHigh,
      trigger_type: triggerType,
      context_type: opts?.contextType ?? null,
      coarse_context: opts?.coarseContext ?? null,
      raw_signal_score: opts?.rawSignalScore ?? null,
      evaluation_status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[createEncounterIfEligible] insert error:", error);
    return { created: false, reason: "insert_error" };
  }

  return { created: true, eventId: inserted.id };
}
