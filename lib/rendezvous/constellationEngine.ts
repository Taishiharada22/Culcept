import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { RendezvousCategory } from "./types";

// ============================================================
// 星座形成エンジン (Feature G)
// 3-5人の化学反応が起きそうなグループを自動マッチング
// 24時間限定の匿名グループチャット
// ============================================================

const CONSTELLATION_DURATION_MS = 24 * 60 * 60 * 1000; // 24時間
const MIN_MEMBERS = 3;
const MAX_MEMBERS = 5;

export type ConstellationState = "forming" | "active" | "expired" | "kept";

/**
 * 星座形成を試みる
 * 同カテゴリの待機ユーザーが十分集まったらグループ作成
 */
export async function tryFormConstellation(params: {
  userId: string;
  category: RendezvousCategory;
}): Promise<
  | { status: "joined"; constellationId: string }
  | { status: "waiting"; position: number }
> {
  const { userId, category } = params;

  // 既にアクティブな星座に参加しているか
  const { data: active } = await supabaseAdmin
    .from("rendezvous_constellations")
    .select("id, member_ids")
    .in("state", ["forming", "active"])
    .eq("category", category)
    .order("created_at", { ascending: false });

  const alreadyIn = (active ?? []).find((c) =>
    (c.member_ids as string[]).includes(userId),
  );
  if (alreadyIn) {
    return { status: "joined", constellationId: alreadyIn.id };
  }

  // forming状態の星座に空きがあるか
  const forming = (active ?? []).find(
    (c) =>
      c.member_ids &&
      (c.member_ids as string[]).length < MAX_MEMBERS &&
      !(c.member_ids as string[]).includes(userId),
  );

  if (forming) {
    const members = [...(forming.member_ids as string[]), userId];

    if (members.length >= MIN_MEMBERS) {
      // 最低人数到達 → アクティブ化
      const expiresAt = new Date(Date.now() + CONSTELLATION_DURATION_MS);
      await supabaseAdmin
        .from("rendezvous_constellations")
        .update({
          member_ids: members,
          state: "active",
          expires_at: expiresAt.toISOString(),
        })
        .eq("id", forming.id);
    } else {
      // まだ足りない → メンバー追加のみ
      await supabaseAdmin
        .from("rendezvous_constellations")
        .update({ member_ids: members })
        .eq("id", forming.id);
    }

    return { status: "joined", constellationId: forming.id };
  }

  // forming状態の星座がない → 新規作成
  const expiresAt = new Date(Date.now() + CONSTELLATION_DURATION_MS);
  const { data: created, error } = await supabaseAdmin
    .from("rendezvous_constellations")
    .insert({
      category,
      state: "forming",
      member_ids: [userId],
      expires_at: expiresAt.toISOString(),
      mission_payload: generateGroupMission(category),
    })
    .select("id")
    .single();

  if (error || !created) {
    return { status: "waiting", position: 1 };
  }

  return { status: "joined", constellationId: created.id };
}

/**
 * グループミッションをカテゴリに応じて生成
 */
function generateGroupMission(category: RendezvousCategory): Record<string, unknown> {
  const missions: Record<RendezvousCategory, { title: string; description: string; icon: string }[]> = {
    romantic: [
      { title: "理想のデートプラン", description: "全員で理想のデートプランを1つ作り上げましょう。交互にアイデアを出して。", icon: "💕" },
      { title: "恋愛あるある選手権", description: "恋愛でよくある場面を出し合い、共感度で投票しましょう。", icon: "💘" },
    ],
    friendship: [
      { title: "架空の旅行計画", description: "全員で行きたい場所を出し合い、最高の旅程を組みましょう。", icon: "🌍" },
      { title: "ベストプレイリスト", description: "テーマを決めて、全員で1曲ずつプレイリストを作りましょう。", icon: "🎵" },
    ],
    cocreation: [
      { title: "スタートアップアイデア", description: "30分で架空のスタートアップを考えましょう。名前、プロダクト、ターゲット。", icon: "🚀" },
      { title: "課題解決ブレスト", description: "1つの社会課題を選び、全員でソリューションをブレストしましょう。", icon: "💡" },
    ],
    community: [
      { title: "理想のコミュニティ", description: "全員が参加したい理想のコミュニティを設計しましょう。ルール、文化、活動。", icon: "🏘️" },
      { title: "価値観マッピング", description: "全員の大事にしている価値観を出し合い、共通点と違いを見つけましょう。", icon: "🗺️" },
    ],
    partner: [
      { title: "パートナーシップの条件", description: "全員が考える「長く続く関係の条件」を出し合いましょう。", icon: "🤝" },
      { title: "困ったときの対処法", description: "関係で困ったときの対処法を共有し、ベストプラクティスを作りましょう。", icon: "🛟" },
    ],
  };

  const options = missions[category] ?? missions.friendship;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * 星座の判定を記録（24h後）
 */
export async function submitConstellationDecision(params: {
  constellationId: string;
  userId: string;
  keepGroup: boolean;
  keepIndividualIds: string[];
}): Promise<void> {
  await supabaseAdmin.from("rendezvous_constellation_decisions").upsert(
    {
      constellation_id: params.constellationId,
      user_id: params.userId,
      keep_group: params.keepGroup,
      keep_individual_ids: params.keepIndividualIds,
    },
    { onConflict: "constellation_id,user_id" },
  );
}
