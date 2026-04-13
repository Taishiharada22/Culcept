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

  // ── 2.5. 並行実行ガード（is_merging フラグ） ──
  const { data: mergingCheck } = await supabaseAdmin
    .from("profiles")
    .select("is_merging")
    .eq("id", anonymousUserId)
    .maybeSingle();

  if (mergingCheck?.is_merging) {
    console.warn(`[mergeAnonymousData] merge already in progress for ${anonymousUserId}, skipping`);
    return {
      success: true,
      mergedObservations: 0,
      conflictResolved: 0,
      totalObservations: await countObservations(existingUserId),
      error: "Merge already in progress",
    };
  }

  // is_merging フラグを立てる
  const { error: lockErr } = await supabaseAdmin
    .from("profiles")
    .update({ is_merging: true })
    .eq("id", anonymousUserId);

  if (lockErr) {
    console.error(`[mergeAnonymousData] failed to set is_merging lock:`, lockErr.message);
  }

  // ── 2.6. 冪等再チェック: 匿名データがまだ存在するか確認 ──
  const { count: remainingAnonObs } = await supabaseAdmin
    .from("stargazer_observations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", anonymousUserId);

  if ((remainingAnonObs ?? 0) === 0 && anonObs.length > 0) {
    // 別プロセスが既にマージ完了している
    console.warn(`[mergeAnonymousData] anonymous observations already moved for ${anonymousUserId}`);
    await markAsMerged(anonymousUserId);
    return {
      success: true,
      mergedObservations: 0,
      conflictResolved: 0,
      totalObservations: await countObservations(existingUserId),
    };
  }

  // ── 3. 競合解決して移管 ──
  let mergedCount = 0;
  let conflictCount = 0;

  for (const obs of anonObs) {
    const existingAnsweredAt = existingMap.get(obs.question_id);

    if (!existingAnsweredAt) {
      // 既存に回答なし → 匿名の回答を移管（user_id を書き換え）
      const { error: updateErr, count: moveCount } = await supabaseAdmin
        .from("stargazer_observations")
        .update({ user_id: existingUserId })
        .eq("id", obs.id);
      if (updateErr) {
        console.error(`[mergeAnonymousData] failed to move observation ${obs.id}:`, updateErr.message);
      } else if (moveCount === 0) {
        console.warn(`[mergeAnonymousData] observation move matched 0 rows for id=${obs.id}`);
      } else {
        mergedCount++;
      }
    } else {
      // 両方に回答あり → answered_at が新しい方を優先
      const anonTime = new Date(obs.answered_at).getTime();
      const existingTime = new Date(existingAnsweredAt).getTime();

      if (anonTime >= existingTime) {
        // 匿名の方が新しい（同時刻の場合も匿名優先）
        // 既存を削除して匿名を移管
        const { error: delErr } = await supabaseAdmin
          .from("stargazer_observations")
          .delete()
          .eq("user_id", existingUserId)
          .eq("question_id", obs.question_id);
        if (delErr) {
          console.error(`[mergeAnonymousData] failed to delete existing observation for question ${obs.question_id}:`, delErr.message);
          continue;
        }

        const { error: moveErr, count: conflictMoveCount } = await supabaseAdmin
          .from("stargazer_observations")
          .update({ user_id: existingUserId })
          .eq("id", obs.id);
        if (moveErr) {
          console.error(`[mergeAnonymousData] failed to move conflicting observation ${obs.id}:`, moveErr.message);
        } else if (conflictMoveCount === 0) {
          console.warn(`[mergeAnonymousData] conflict observation move matched 0 rows for id=${obs.id}`);
        } else {
          conflictCount++;
          mergedCount++;
        }
      } else {
        // 既存の方が新しい → 匿名の回答を削除
        const { error: delErr } = await supabaseAdmin
          .from("stargazer_observations")
          .delete()
          .eq("id", obs.id);
        if (delErr) {
          console.error(`[mergeAnonymousData] failed to delete stale observation ${obs.id}:`, delErr.message);
        }
      }
    }
  }

  // ── 4. 関連テーブルの移管 ──
  // stargazer_profiles: 既存profileがなければ丸ごと移管。
  // 既存profileがある場合でも、匿名側の stage_progress をマージする
  // （18問/53問のオンボーディング進捗が匿名IDに紐づいているため）
  const { data: existingProfile } = await supabaseAdmin
    .from("stargazer_profiles")
    .select("user_id, stage_progress")
    .eq("user_id", existingUserId)
    .maybeSingle();

  if (!existingProfile) {
    // 既存profileなし → 匿名profileを丸ごと移管
    const { error: profileMoveErr, count: profileMoveCount } = await supabaseAdmin
      .from("stargazer_profiles")
      .update({ user_id: existingUserId })
      .eq("user_id", anonymousUserId);
    if (profileMoveErr) {
      console.error(`[mergeAnonymousData] failed to move stargazer_profiles:`, profileMoveErr.message);
    } else if (profileMoveCount === 0) {
      console.warn(`[mergeAnonymousData] stargazer_profiles move matched 0 rows for anon=${anonymousUserId}`);
    }
  } else {
    // 既存profileあり → 匿名側の stage_progress + dimensions をマージ
    const { data: anonStargazerProfile } = await supabaseAdmin
      .from("stargazer_profiles")
      .select("stage_progress, dimensions, archetype_code, confidence, tags")
      .eq("user_id", anonymousUserId)
      .maybeSingle();

    if (anonStargazerProfile) {
      const updatePayload: Record<string, unknown> = {};

      // stage_progress マージ
      if (anonStargazerProfile.stage_progress) {
        const anonProgress = anonStargazerProfile.stage_progress as Record<string, unknown>;
        const existingStageProgress = (existingProfile.stage_progress as Record<string, unknown>) ?? {};
        const mergedStageProgress: Record<string, unknown> = { ...existingStageProgress };
        for (const [key, anonValue] of Object.entries(anonProgress)) {
          const existingValue = existingStageProgress[key];
          if (
            existingValue &&
            typeof existingValue === "object" &&
            !Array.isArray(existingValue) &&
            anonValue &&
            typeof anonValue === "object" &&
            !Array.isArray(anonValue)
          ) {
            mergedStageProgress[key] = {
              ...(existingValue as Record<string, unknown>),
              ...(anonValue as Record<string, unknown>),
            };
          } else {
            mergedStageProgress[key] = anonValue;
          }
        }
        updatePayload.stage_progress = mergedStageProgress;
      }

      // dimensions マージ（匿名側にデータがあり、既存側が空の場合に上書き）
      const anonDims = anonStargazerProfile.dimensions as Record<string, number> | null;
      if (anonDims && Object.values(anonDims).some((v) => typeof v === "number" && Math.abs(v) > 0.001)) {
        updatePayload.dimensions = anonDims;
        if (anonStargazerProfile.archetype_code) {
          updatePayload.archetype_code = anonStargazerProfile.archetype_code;
        }
        if (anonStargazerProfile.confidence) {
          updatePayload.confidence = anonStargazerProfile.confidence;
        }
        if (anonStargazerProfile.tags) {
          updatePayload.tags = anonStargazerProfile.tags;
        }
      }

      if (Object.keys(updatePayload).length > 0) {
        const { error: mergeErr } = await supabaseAdmin
          .from("stargazer_profiles")
          .update(updatePayload)
          .eq("user_id", existingUserId);
        if (mergeErr) {
          console.error(`[mergeAnonymousData] failed to merge stargazer_profiles:`, mergeErr.message);
        }
      }
    }
    // 匿名のstargazer_profilesは削除（孤立防止）
    const { error: anonProfileDelErr } = await supabaseAdmin
      .from("stargazer_profiles")
      .delete()
      .eq("user_id", anonymousUserId);
    if (anonProfileDelErr) {
      console.error(`[mergeAnonymousData] failed to delete anon stargazer_profiles:`, anonProfileDelErr.message);
    }
  }

  // stargazer_star_maps: 匿名のスターマップを移管（アーキタイプ表示に必須）
  const { data: existingStarMap } = await supabaseAdmin
    .from("stargazer_star_maps")
    .select("user_id")
    .eq("user_id", existingUserId)
    .maybeSingle();

  if (!existingStarMap) {
    const { error: starMapErr } = await supabaseAdmin
      .from("stargazer_star_maps")
      .update({ user_id: existingUserId })
      .eq("user_id", anonymousUserId);
    if (starMapErr) {
      console.error(`[mergeAnonymousData] failed to move stargazer_star_maps:`, starMapErr.message);
    }
  } else {
    // 既存あり → 匿名側を削除（孤立防止）
    await supabaseAdmin
      .from("stargazer_star_maps")
      .delete()
      .eq("user_id", anonymousUserId);
  }

  // stargazer_resolved_types: 匿名のアーキタイプ結果を移管（archetype_code + axis_scores）
  const { data: existingResolvedType } = await supabaseAdmin
    .from("stargazer_resolved_types")
    .select("user_id")
    .eq("user_id", existingUserId)
    .maybeSingle();

  if (!existingResolvedType) {
    const { error: rtErr } = await supabaseAdmin
      .from("stargazer_resolved_types")
      .update({ user_id: existingUserId })
      .eq("user_id", anonymousUserId);
    if (rtErr) {
      console.error(`[mergeAnonymousData] failed to move stargazer_resolved_types:`, rtErr.message);
    }
  } else {
    await supabaseAdmin
      .from("stargazer_resolved_types")
      .delete()
      .eq("user_id", anonymousUserId);
  }

  // stargazer_personality_profile: 匿名のパーソナリティプロフィールを移管
  const { data: existingPersonality } = await supabaseAdmin
    .from("stargazer_personality_profile")
    .select("user_id")
    .eq("user_id", existingUserId)
    .maybeSingle();

  if (!existingPersonality) {
    const { error: ppErr } = await supabaseAdmin
      .from("stargazer_personality_profile")
      .update({ user_id: existingUserId })
      .eq("user_id", anonymousUserId);
    if (ppErr) {
      console.error(`[mergeAnonymousData] failed to move stargazer_personality_profile:`, ppErr.message);
    }
  } else {
    await supabaseAdmin
      .from("stargazer_personality_profile")
      .delete()
      .eq("user_id", anonymousUserId);
  }

  // stargazer_axis_snapshots: 匿名のスナップショットを移管
  const { error: snapshotErr, count: snapshotCount } = await supabaseAdmin
    .from("stargazer_axis_snapshots")
    .update({ user_id: existingUserId })
    .eq("user_id", anonymousUserId);
  if (snapshotErr) {
    console.error(`[mergeAnonymousData] failed to move stargazer_axis_snapshots:`, snapshotErr.message);
  } else if (snapshotCount === 0) {
    console.warn(`[mergeAnonymousData] stargazer_axis_snapshots move matched 0 rows for anon=${anonymousUserId}`);
  }

  // stargazer_context_profiles: 匿名のコンテキストプロフィールを移管
  const { error: contextErr, count: contextCount } = await supabaseAdmin
    .from("stargazer_context_profiles")
    .update({ user_id: existingUserId })
    .eq("user_id", anonymousUserId);
  if (contextErr) {
    console.error(`[mergeAnonymousData] failed to move stargazer_context_profiles:`, contextErr.message);
  } else if (contextCount === 0) {
    console.warn(`[mergeAnonymousData] stargazer_context_profiles move matched 0 rows for anon=${anonymousUserId}`);
  }

  // user_style_summary: ワードローブデータの移管（Calendar連携に必須）
  const { data: existingStyleSummary } = await supabaseAdmin
    .from("user_style_summary")
    .select("user_id")
    .eq("user_id", existingUserId)
    .maybeSingle();

  if (!existingStyleSummary) {
    const { error: ssErr } = await supabaseAdmin
      .from("user_style_summary")
      .update({ user_id: existingUserId })
      .eq("user_id", anonymousUserId);
    if (ssErr) {
      console.error(`[mergeAnonymousData] failed to move user_style_summary:`, ssErr.message);
    }
  } else {
    await supabaseAdmin
      .from("user_style_summary")
      .delete()
      .eq("user_id", anonymousUserId);
  }

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
  // is_merging を false に戻しつつ is_merged を true にする
  await supabaseAdmin
    .from("profiles")
    .update({ is_merged: true, is_merging: false, merged_at: new Date().toISOString() })
    .eq("id", anonymousUserId);
}

async function countObservations(userId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("stargazer_observations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}
