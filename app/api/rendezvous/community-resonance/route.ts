import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { findResonanceGroups } from "@/lib/rendezvous/communityResonance";
import type { MatchingVector, RendezvousCategory } from "@/lib/rendezvous/types";

// ============================================================
// GET /api/rendezvous/community-resonance?maxGroups=3
// ユーザーの接続プールからグループ共鳴を発見する
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = auth.user.id;
    const url = new URL(request.url);
    const maxGroups = Math.min(
      Math.max(parseInt(url.searchParams.get("maxGroups") ?? "3", 10), 1),
      10,
    );

    // 相互マッチした候補を取得（chat_opened 以上の関係）
    const { data: candidates, error: candErr } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, category, state")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .in("state", ["mutual_liked", "chat_opened"]);

    if (candErr) {
      console.error("[community-resonance] candidates fetch error:", candErr);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch connections" },
        { status: 500 },
      );
    }

    if (!candidates || candidates.length < 2) {
      return NextResponse.json({
        ok: true,
        groups: [],
        reason: "insufficient_connections",
      });
    }

    // 接続先ユーザーIDを収集
    const connectedUserIds = new Set<string>();
    const candidateCategoryMap = new Map<string, RendezvousCategory>();

    for (const c of candidates) {
      const otherId = c.user_a === userId ? c.user_b : c.user_a;
      connectedUserIds.add(otherId);
      candidateCategoryMap.set(otherId, c.category as RendezvousCategory);
    }

    const otherIds = [...connectedUserIds];

    // 各ユーザーのプロフィールとベクトルを取得
    const { data: profiles } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("user_id, display_name, avatar_asset_url")
      .in("user_id", otherIds);

    const { data: preferences } = await supabaseAdmin
      .from("rendezvous_preferences")
      .select("user_id, matching_vector")
      .in("user_id", otherIds);

    if (!profiles || !preferences) {
      return NextResponse.json({
        ok: true,
        groups: [],
        reason: "missing_profile_data",
      });
    }

    // プロフィールマップを構築
    const profileMap = new Map(
      profiles.map((p) => [p.user_id, p]),
    );
    const vectorMap = new Map(
      preferences
        .filter((p) => p.matching_vector)
        .map((p) => [p.user_id, p.matching_vector as MatchingVector]),
    );

    // 接続情報を構築
    const connections = otherIds
      .filter((id) => vectorMap.has(id) && profileMap.has(id))
      .map((id) => {
        const profile = profileMap.get(id)!;
        return {
          userId: id,
          displayName: profile.display_name ?? "Unknown",
          avatarUrl: profile.avatar_asset_url ?? null,
          vector: vectorMap.get(id)!,
          category: candidateCategoryMap.get(id) ?? ("friendship" as RendezvousCategory),
        };
      });

    if (connections.length < 2) {
      return NextResponse.json({
        ok: true,
        groups: [],
        reason: "insufficient_vector_data",
      });
    }

    // グループ共鳴を発見
    const groups = findResonanceGroups(userId, connections, maxGroups);

    // 発見したグループをDBに保存（キャッシュ目的）
    for (const group of groups) {
      const memberIds = group.members.map((m) => m.userId);
      const memberRoles = Object.fromEntries(
        group.members.map((m) => [m.userId, m.role]),
      );

      await supabaseAdmin.from("rendezvous_resonance_groups").upsert(
        {
          id: group.id,
          created_by: userId,
          member_ids: memberIds,
          member_roles: memberRoles,
          emergent_type: group.emergentDynamic.type,
          group_score: group.groupResonanceScore,
          narrative: group.narrative,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    }

    return NextResponse.json({
      ok: true,
      groups,
    });
  } catch (err) {
    console.error("[community-resonance GET]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
