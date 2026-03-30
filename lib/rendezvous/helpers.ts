import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RendezvousCandidate,
  RendezvousUserStateRow,
  RendezvousProfile,
  RendezvousCategory,
} from "./types";
import type { ContextType } from "./questions/types";

/**
 * candidateからもう片方のuser_idを返す
 */
export function getCounterpartId(
  candidate: Pick<RendezvousCandidate, "user_a" | "user_b">,
  myUserId: string,
): string {
  return candidate.user_a === myUserId ? candidate.user_b : candidate.user_a;
}

/**
 * suppression用のペアキーを正規化（user_low < user_high）
 */
export function normalizeUserPair(
  a: string,
  b: string,
): [userLow: string, userHigh: string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * 通知delay_modeに基づいてscheduled_atを生成
 */
export function buildScheduledAt(profile: RendezvousProfile): Date {
  const minMs = profile.notification_delay_min_minutes * 60_000;
  const maxMs = profile.notification_delay_max_minutes * 60_000;
  const delayMs = minMs + Math.random() * (maxMs - minMs);
  return new Date(Date.now() + delayMs);
}

/**
 * 有効期限: 7日後
 */
export function buildExpiryAt(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

/**
 * ブロックしたユーザーIDの一覧を取得
 */
export async function getBlockedUserIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("rendezvous_blocks")
    .select("blocked_user_id")
    .eq("blocker_user_id", userId);
  return new Set((data ?? []).map((r: any) => r.blocked_user_id));
}

/**
 * candidateが自分に関係するか検証し、自分のuserState + 相手のprofileを返す
 */
export async function verifyCandidateBelongsToUser(
  supabase: SupabaseClient,
  candidateId: string,
  userId: string,
): Promise<{
  candidate: RendezvousCandidate;
  myState: RendezvousUserStateRow;
  counterpartProfile: RendezvousProfile;
} | null> {
  // fetch candidate
  const { data: candidate, error: candErr } = await supabase
    .from("rendezvous_candidates")
    .select("*")
    .eq("id", candidateId)
    .single();

  if (candErr || !candidate) return null;

  // verify user belongs
  if (candidate.user_a !== userId && candidate.user_b !== userId) return null;

  const counterpartId = getCounterpartId(candidate, userId);

  // fetch my user state
  const { data: myState, error: stateErr } = await supabase
    .from("rendezvous_user_states")
    .select("*")
    .eq("candidate_id", candidateId)
    .eq("user_id", userId)
    .single();

  if (stateErr || !myState) return null;

  // fetch counterpart profile
  const { data: counterpartProfile, error: profErr } = await supabase
    .from("rendezvous_profiles")
    .select("*")
    .eq("user_id", counterpartId)
    .single();

  if (profErr || !counterpartProfile) return null;

  return {
    candidate: candidate as RendezvousCandidate,
    myState: myState as RendezvousUserStateRow,
    counterpartProfile: counterpartProfile as RendezvousProfile,
  };
}

/**
 * 旧カテゴリ → 新文脈への後方互換フォールバック
 *
 * ⚠ 主判定ではなく、candidate.contextLens.bestContext が存在しない
 *   旧データへの後方互換マッピングとしてのみ使用すること。
 *
 * romantic → romance, friendship → friend はそのまま。
 * cocreation → cocreation (一致)。
 * community → 4主文脈のどれにも完全には収まらないため、
 *   最も近い "friend" にフォールバック（コミュニティ的つながりは友達的接続に最も近い）。
 */
export function mapCategoryToContext(
  category: RendezvousCategory,
): ContextType {
  switch (category) {
    case "romantic":
      return "romance";
    case "friendship":
      return "friend";
    case "cocreation":
      return "cocreation";
    case "community":
      return "friend"; // community は主文脈外。意味を崩さず友達的接続にフォールバック
    default:
      return "friend";
  }
}
