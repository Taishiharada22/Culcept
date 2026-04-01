// lib/auth/mergeAnonymousData.ts
// 後ログイン型: 匿名ユーザーデータの既存アカウントへの移管処理
// ケース2（既存アカウントへのログイン時）で使用
import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface MergeResult {
  success: boolean;
  /** 移管した観測レコード数 */
  mergedObservations: number;
  /** 競合して上書きしたレコード数 */
  conflictResolved: number;
  /** merge後の累計観測数 */
  totalObservations: number;
  /** エラーメッセージ（失敗時） */
  error?: string;
}

/**
 * 匿名ユーザーの観測データを既存ユーザーに移管する。
 * 冪等設計: 同じ anonymousUserId で2回呼んでも二重反映しない。
 *
 * 競合解決: answered_at が新しい方を優先。同時刻なら匿名側優先。
 */
export async function mergeAnonymousIntoExistingUser(
  existingUserId: string,
  anonymousUserId: string
): Promise<MergeResult> {
  // ── 0. 冪等チェック ──
  const { data: anonProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, is_merged")
    .eq("id", anonymousUserId)
    .maybeSingle();

  if (!anonProfile) {
    return {
      success: true,
      mergedObservations: 0,
      conflictResolved: 0,
      totalObservations: await countObservations(existingUserId),
      error: undefined,
    };
  }

  if (anonProfile.is_merged) {
    // すでにmerge済み — 何もしない
    return {
      success: true,
      mergedObservations: 0,
      conflictResolved: 0,
      totalObservations: await countObservations(existingUserId),
    };
  }

  // ── 1. 匿名ユーザーの observation を取得 ──
  const { data: anonObs, error: fetchErr } = await supabaseAdmin
    .from("stargazer_observations")
    .select("*")
    .eq("user_id", anonymousUserId);

  if (fetchErr) {
    return {
      success: false,
      mergedObservations: 0,
      conflictResolved: 0,
      totalObservations: 0,
      error: `Failed to fetch anonymous observations: ${fetchErr.message}`,
    };
  }

  if (!anonObs || anonObs.length === 0) {
    // 匿名データなし — merged フラグだけ立てて終了
    await markAsMerged(anonymousUserId);
    return {
      success: true,
      mergedObservations: 0,
      conflictResolved: 0,
      totalObservations: await countObservations(existingUserId),
    };
  }

  // ── 2. 既存ユーザーの observation を取得（競合解決用） ──
  const { data: existingObs } = await supabaseAdmin
    .from("stargazer_observations")
    .select("question_id, answered_at")
    .eq("user_id", existingUserId);

  const existingMap = new Map(
    (existingObs ?? []).map((o) => [o.question_id, o.answered_at])
  );

  // ── 3. 競合解決して移管 ──
  let mergedCount = 0;
  let conflictCount = 0;

  for (const obs of anonObs) {
    const existingAnsweredAt = existingMap.get(obs.question_id);

    if (!existingAnsweredAt) {
      // 既存に回答なし → 匿名の回答を移管（user_id を書き換え）
      await supabaseAdmin
        .from("stargazer_observations")
        .update({ user_id: existingUserId })
        .eq("id", obs.id);
      mergedCount++;
    } else {
      // 両方に回答あり → answered_at が新しい方を優先
      const anonTime = new Date(obs.answered_at).getTime();
      const existingTime = new Date(existingAnsweredAt).getTime();

      if (anonTime >= existingTime) {
        // 匿名の方が新しい（同時刻の場合も匿名優先）
        // 既存を削除して匿名を移管
        await supabaseAdmin
          .from("stargazer_observations")
          .delete()
          .eq("user_id", existingUserId)
          .eq("question_id", obs.question_id);

        await supabaseAdmin
          .from("stargazer_observations")
          .update({ user_id: existingUserId })
          .eq("id", obs.id);

        conflictCount++;
        mergedCount++;
      } else {
        // 既存の方が新しい → 匿名の回答を削除
        await supabaseAdmin
          .from("stargazer_observations")
          .delete()
          .eq("id", obs.id);
      }
    }
  }

  // ── 4. 関連テーブルの移管 ──
  // stargazer_profiles: 匿名のプロフィールは使わない（既存を維持）
  // ただし、既存にプロフィールがない場合は匿名のものを移管
  const { data: existingProfile } = await supabaseAdmin
    .from("stargazer_profiles")
    .select("user_id")
    .eq("user_id", existingUserId)
    .maybeSingle();

  if (!existingProfile) {
    await supabaseAdmin
      .from("stargazer_profiles")
      .update({ user_id: existingUserId })
      .eq("user_id", anonymousUserId);
  }

  // stargazer_axis_snapshots: 匿名のスナップショットを移管
  await supabaseAdmin
    .from("stargazer_axis_snapshots")
    .update({ user_id: existingUserId })
    .eq("user_id", anonymousUserId);

  // stargazer_context_profiles: 匿名のコンテキストプロフィールを移管
  await supabaseAdmin
    .from("stargazer_context_profiles")
    .update({ user_id: existingUserId })
    .eq("user_id", anonymousUserId);

  // ── 5. merged フラグを立てる ──
  await markAsMerged(anonymousUserId);

  // ── 6. 累計観測数を再集計 ──
  const totalObservations = await countObservations(existingUserId);

  // ── 7. プロフィールのaxis_scoresを再計算トリガー ──
  // (次回 /api/stargazer/profile アクセス時に自動再計算される)

  return {
    success: true,
    mergedObservations: mergedCount,
    conflictResolved: conflictCount,
    totalObservations,
  };
}

// ─── ヘルパー ─────────────────────────────────────

async function markAsMerged(anonymousUserId: string): Promise<void> {
  // profiles テーブルに is_merged カラムがない場合はメタデータで対応
  await supabaseAdmin
    .from("profiles")
    .update({ is_merged: true, merged_at: new Date().toISOString() })
    .eq("id", anonymousUserId);
}

async function countObservations(userId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("stargazer_observations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}
