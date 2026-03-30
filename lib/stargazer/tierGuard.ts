// lib/stargazer/tierGuard.ts
// ──────────────────────────────────────────────────────────────────────
// Stargazer API ルート用のティアチェックミドルウェアヘルパー
//
// API ルートで import して、リクエスト処理前にティアを検証する。
// ──────────────────────────────────────────────────────────────────────
import "server-only";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { V4Feature } from "@/lib/stargazer/depthPhaseController";
import {
  getStargazerTier,
  isFeatureAvailable,
  getFeatureLimits,
  type StargazerTier,
} from "@/lib/stargazer/subscriptionTier";
import { isBetaTesterEmail } from "@/lib/auth/betaTesters";

export interface TierCheckResult {
  /** 認証済みユーザーID */
  userId: string;
  /** ユーザーのティア */
  tier: StargazerTier;
  /** 機能が利用可能か */
  allowed: boolean;
  /** ベータテスターかどうか（データ不足バイパス用） */
  isBetaTester?: boolean;
}

/**
 * API ルートで使うティアチェックヘルパー。
 *
 * 使い方:
 * ```ts
 * const check = await checkStargazerTier("alter");
 * if (check instanceof NextResponse) return check; // 403 or 401
 * const { userId, tier } = check;
 * ```
 */
export async function checkStargazerTier(
  feature: V4Feature,
): Promise<TierCheckResult | NextResponse> {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "認証が必要です" },
      { status: 401 },
    );
  }

  const betaTester = isBetaTesterEmail(user.email);
  const tier = await getStargazerTier(user.id, supabase, betaTester);
  const allowed = isFeatureAvailable(tier, feature);

  if (!allowed) {
    const limits = getFeatureLimits(tier, feature);
    return NextResponse.json(
      {
        error: "premium_required",
        message: limits.upgradePrompt || "この機能はプレミアムプランが必要です",
        tier: tier.level,
        feature,
      },
      { status: 403 },
    );
  }

  return { userId: user.id, tier, allowed: true, isBetaTester: betaTester };
}

/**
 * ティア情報のみ取得する（ゲーティングなし）。
 * プロフィールや一覧画面など、ティアに応じて表示を変える場合に使う。
 */
export async function getAuthenticatedTier(): Promise<
  { userId: string; tier: StargazerTier; isBetaTester?: boolean } | NextResponse
> {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "認証が必要です" },
      { status: 401 },
    );
  }

  const betaTester = isBetaTesterEmail(user.email);
  const tier = await getStargazerTier(user.id, supabase, betaTester);
  return { userId: user.id, tier, isBetaTester: betaTester };
}
