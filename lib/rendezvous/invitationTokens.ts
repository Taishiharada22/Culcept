import "server-only";

import { supabaseServer } from "@/lib/supabase/server";

// ============================================================
// 招待トークン制（Part 2 §3）
//
// 設計思想:
//   「招待＝相手のためではなく、招待＝自分自身のため」
//   AがBを招待しても、AはBとの相性を見る義務はない。
//   招待によりポイントが付与され、使い方は自由。
//
// ポイント付与体系:
//   招待した相手が会員登録完了: 25pt
//   招待した相手がPhase 1到達:  25pt
//   招待した相手がPhase 2到達:  50pt
//   合計:                       100pt
//
// 招待送信上限: 月5人
//
// トークン変換レート:
//   100pt = Friendship相性トークン 1枚（既知ペア1回分）
//   200pt = Discovery preview 1枚（新しい出会いプレビュー1回分）
//
// Stage設計:
//   Stage 0: Stargazer単体（会員数不問）
//   Stage 1: 既知ペア関係理解（2人いれば機能）
//   Stage 2: 新しい出会い解放（母集団が臨界点）
//   Stage 3: Partner本格稼働（成功実績後）
// ============================================================

// ── 型定義 ──

export type TokenBalance = {
  points: number;
  friendshipTokens: number;
  discoveryTokens: number;
};

export type InvitationRecord = {
  id: string;
  inviterUserId: string;
  inviteeEmail: string | null;
  inviteCode: string;
  inviteeUserId: string | null;
  inviteeRegistered: boolean;
  inviteePhase1: boolean;
  inviteePhase2: boolean;
  createdAt: string;
};

export type ConversionType = "friendship" | "discovery";

// ── 定数 ──

const POINTS = {
  REGISTER: 25,
  PHASE_1: 25,
  PHASE_2: 50,
} as const;

const TOKEN_COST = {
  friendship: 100,
  discovery: 200,
} as const;

const MONTHLY_INVITE_LIMIT = 5;

// ── 公開API ──

/**
 * 招待コードを生成する。月5人上限チェック付き。
 */
export async function createInvitation(params: {
  inviterUserId: string;
  inviteeEmail?: string;
}): Promise<{ inviteCode: string; remaining: number }> {
  const supabase = await supabaseServer();
  const { inviterUserId, inviteeEmail } = params;

  // 月間上限チェック
  const monthStart = getMonthStart();
  const { count } = await supabase
    .from("rendezvous_invitations")
    .select("id", { count: "exact", head: true })
    .eq("inviter_user_id", inviterUserId)
    .gte("created_at", monthStart);

  const sentThisMonth = count ?? 0;
  if (sentThisMonth >= MONTHLY_INVITE_LIMIT) {
    throw new Error(
      `月間招待上限（${MONTHLY_INVITE_LIMIT}人）に達しています`,
    );
  }

  const inviteCode = generateInviteCode();

  const { error } = await supabase.from("rendezvous_invitations").insert({
    inviter_user_id: inviterUserId,
    invitee_email: inviteeEmail ?? null,
    invite_code: inviteCode,
  });

  if (error) {
    throw new Error(`Invitation creation failed: ${error.message}`);
  }

  return {
    inviteCode,
    remaining: MONTHLY_INVITE_LIMIT - sentThisMonth - 1,
  };
}

/**
 * 招待コードで登録されたことを記録し、ポイントを付与する。
 */
export async function recordInviteeRegistration(params: {
  inviteCode: string;
  inviteeUserId: string;
}): Promise<{ pointsAwarded: number }> {
  const supabase = await supabaseServer();

  const { data: invitation } = await supabase
    .from("rendezvous_invitations")
    .select("*")
    .eq("invite_code", params.inviteCode)
    .eq("invitee_registered", false)
    .maybeSingle();

  if (!invitation) {
    return { pointsAwarded: 0 };
  }

  // 招待レコードを更新
  await supabase
    .from("rendezvous_invitations")
    .update({
      invitee_user_id: params.inviteeUserId,
      invitee_registered: true,
      points_awarded_register: true,
    })
    .eq("id", invitation.id);

  // ポイント付与
  await addPoints(invitation.inviter_user_id, POINTS.REGISTER);

  return { pointsAwarded: POINTS.REGISTER };
}

/**
 * 被招待者のPhase到達を記録し、追加ポイントを付与する。
 */
export async function recordInviteePhaseReached(params: {
  inviteeUserId: string;
  phase: 1 | 2;
}): Promise<{ pointsAwarded: number }> {
  const supabase = await supabaseServer();
  const { inviteeUserId, phase } = params;

  const phaseField = phase === 1 ? "invitee_phase1" : "invitee_phase2";
  const awardedField =
    phase === 1 ? "points_awarded_phase1" : "points_awarded_phase2";
  const points = phase === 1 ? POINTS.PHASE_1 : POINTS.PHASE_2;

  // 未付与の招待レコードを取得
  const { data: invitations } = await supabase
    .from("rendezvous_invitations")
    .select("id, inviter_user_id")
    .eq("invitee_user_id", inviteeUserId)
    .eq(awardedField, false);

  if (!invitations || invitations.length === 0) {
    return { pointsAwarded: 0 };
  }

  let totalAwarded = 0;
  for (const inv of invitations) {
    await supabase
      .from("rendezvous_invitations")
      .update({
        [phaseField]: true,
        [awardedField]: true,
      })
      .eq("id", inv.id);

    await addPoints(inv.inviter_user_id, points);
    totalAwarded += points;
  }

  return { pointsAwarded: totalAwarded };
}

/**
 * トークン残高を取得する。
 */
export async function getTokenBalance(
  userId: string,
): Promise<TokenBalance> {
  const supabase = await supabaseServer();

  const { data } = await supabase
    .from("rendezvous_token_balances")
    .select("points, friendship_tokens, discovery_tokens")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    return { points: 0, friendshipTokens: 0, discoveryTokens: 0 };
  }

  return {
    points: data.points,
    friendshipTokens: data.friendship_tokens,
    discoveryTokens: data.discovery_tokens,
  };
}

/**
 * ポイントをトークンに変換する。
 */
export async function convertPointsToToken(
  userId: string,
  tokenType: ConversionType,
): Promise<TokenBalance> {
  const cost = TOKEN_COST[tokenType];
  const balance = await getTokenBalance(userId);

  if (balance.points < cost) {
    throw new Error(
      `ポイント不足: ${balance.points}pt / 必要: ${cost}pt`,
    );
  }

  const supabase = await supabaseServer();
  const tokenField =
    tokenType === "friendship" ? "friendship_tokens" : "discovery_tokens";
  const newPoints = balance.points - cost;
  const newTokens =
    (tokenType === "friendship"
      ? balance.friendshipTokens
      : balance.discoveryTokens) + 1;

  await supabase
    .from("rendezvous_token_balances")
    .update({
      points: newPoints,
      [tokenField]: newTokens,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return {
    ...balance,
    points: newPoints,
    ...(tokenType === "friendship"
      ? { friendshipTokens: newTokens }
      : { discoveryTokens: newTokens }),
  };
}

/**
 * 今月の招待残数を取得する。
 */
export async function getMonthlyInviteRemaining(
  userId: string,
): Promise<number> {
  const supabase = await supabaseServer();
  const monthStart = getMonthStart();

  const { count } = await supabase
    .from("rendezvous_invitations")
    .select("id", { count: "exact", head: true })
    .eq("inviter_user_id", userId)
    .gte("created_at", monthStart);

  return MONTHLY_INVITE_LIMIT - (count ?? 0);
}

// ── 内部ヘルパー ──

async function addPoints(userId: string, amount: number): Promise<void> {
  const supabase = await supabaseServer();

  const { data: existing } = await supabase
    .from("rendezvous_token_balances")
    .select("id, points")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("rendezvous_token_balances")
      .update({
        points: existing.points + amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("rendezvous_token_balances").insert({
      user_id: userId,
      points: amount,
    });
  }
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}
