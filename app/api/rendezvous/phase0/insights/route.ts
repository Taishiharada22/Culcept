import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildInitialMatchingVector } from "@/lib/rendezvous/onboardingOrchestrator";
import { generateStructuredInsight } from "@/lib/rendezvous/phase0/generatePairInsight";
import { translateToNarrative } from "@/lib/rendezvous/phase0/narrativeTranslator";
import { loadUserFullProfile } from "@/lib/rendezvous/phase0/enrichedDataLoader";
import { deriveAttachmentProfile, classifyAttachment } from "@/lib/rendezvous/attachmentProfile";
import { deriveSDTProfile } from "@/lib/rendezvous/sdtAxes";

/**
 * Phase 0: 既知ペア関係性インサイト生成 API（全Aneurasyncデータ統合版）
 *
 * 取得データ:
 *   - Stargazer 45軸（3テーブル集約）
 *   - パーソナリティ12軸
 *   - アーキタイプ
 *   - Alter判断パターン（ForceBalance/ActionShape/ドメイン分布）
 *   - Alter成長状態（核心的恐れ/価値観）
 *   - 矛盾検出（二面性）
 *   - Alter対人関係図
 *   - Origin価値観・情熱シグナル
 *   - 愛着スタイル（導出）
 *   - SDT欲求充足（導出）
 */
export async function GET(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const partnerEmail = url.searchParams.get("partnerEmail");

  if (!partnerEmail) {
    return NextResponse.json({ error: "partnerEmail is required" }, { status: 400 });
  }

  // 1. パートナーのuser_id取得
  const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
  const partnerUser = userList?.users?.find((u) => u.email === partnerEmail);

  if (!partnerUser) {
    return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  }

  const partnerUserId = partnerUser.id;

  // 2. 両者の全Aneurasyncデータを一括取得
  const [selfProfile, partnerProfile] = await Promise.all([
    loadUserFullProfile(user.id),
    loadUserFullProfile(partnerUserId),
  ]);

  if (selfProfile.axisCount < 5 || partnerProfile.axisCount < 5) {
    return NextResponse.json(
      {
        error: "Insufficient Stargazer data",
        selfAxisCount: selfProfile.axisCount,
        partnerAxisCount: partnerProfile.axisCount,
        message: "両者とも最低5軸の観測データが必要です。Stargazerで観測を進めてください。",
      },
      { status: 422 },
    );
  }

  // 3. MatchingVector構築
  const vectorA = buildInitialMatchingVector({ stargazerScores: selfProfile.axisScores });
  const vectorB = buildInitialMatchingVector({ stargazerScores: partnerProfile.axisScores });

  // 4. 心理学プロファイル導出
  const selfAttachment = deriveAttachmentProfile({ matchingVector: vectorA, stargazerScores: selfProfile.axisScores });
  const partnerAttachment = deriveAttachmentProfile({ matchingVector: vectorB, stargazerScores: partnerProfile.axisScores });
  const selfSDT = deriveSDTProfile({ stargazerScores: selfProfile.axisScores, matchingVector: vectorA });
  const partnerSDT = deriveSDTProfile({ stargazerScores: partnerProfile.axisScores, matchingVector: vectorB });

  // 5. 構造化インサイト生成（全enrichedデータ付き）
  const structuredInsight = generateStructuredInsight({
    vectorA,
    vectorB,
    axisCountA: selfProfile.axisCount,
    axisCountB: partnerProfile.axisCount,
    enriched: {
      selfAttachment,
      partnerAttachment,
      selfSDT,
      partnerSDT,
      selfPersonality: selfProfile.personality,
      partnerPersonality: partnerProfile.personality,
      selfOrigin: selfProfile.origin,
      partnerOrigin: partnerProfile.origin,
      selfArchetype: selfProfile.archetype,
      partnerArchetype: partnerProfile.archetype,
      selfAlterPatterns: selfProfile.alterPatterns,
      partnerAlterPatterns: partnerProfile.alterPatterns,
      selfAlterGrowth: selfProfile.alterGrowth,
      partnerAlterGrowth: partnerProfile.alterGrowth,
      selfContradictions: selfProfile.contradictions,
      partnerContradictions: partnerProfile.contradictions,
      selfPersonMap: selfProfile.personMap,
      partnerPersonMap: partnerProfile.personMap,
    },
  });

  // 6. LLM翻訳（全データをコンテキストに）
  const translation = await translateToNarrative(structuredInsight, user.id, {
    selfAttachmentStyle: classifyAttachment(selfAttachment),
    partnerAttachmentStyle: classifyAttachment(partnerAttachment),
    selfSDT,
    partnerSDT,
    selfPersonality: selfProfile.personality,
    partnerPersonality: partnerProfile.personality,
    selfOrigin: selfProfile.origin,
    partnerOrigin: partnerProfile.origin,
    selfArchetype: selfProfile.archetype,
    partnerArchetype: partnerProfile.archetype,
    selfAlterPatterns: selfProfile.alterPatterns,
    partnerAlterPatterns: partnerProfile.alterPatterns,
    selfContradictions: selfProfile.contradictions,
    partnerContradictions: partnerProfile.contradictions,
  });

  // 7. 結果返却
  const finalInsight = {
    narrative: translation.narrative,
    resonancePoints: structuredInsight.resonancePoints.map((point, i) => ({
      ...point,
      description: translation.resonanceDescriptions[i] ?? point.description,
    })),
    unobservedPoint: structuredInsight.unobservedPoint
      ? {
          ...structuredInsight.unobservedPoint,
          description: translation.unobservedDescription ?? structuredInsight.unobservedPoint.description,
        }
      : null,
    confidence: structuredInsight.confidence,
    bestCategory: structuredInsight.bestCategory,
    overallScore: structuredInsight.overallScore,
    usedLLM: translation.usedLLM,
    dataUsed: {
      stargazerAxes: { self: selfProfile.axisCount, partner: partnerProfile.axisCount },
      attachment: { self: classifyAttachment(selfAttachment), partner: classifyAttachment(partnerAttachment) },
      personality: { self: !!selfProfile.personality, partner: !!partnerProfile.personality },
      origin: { self: selfProfile.origin?.entryCount ?? 0, partner: partnerProfile.origin?.entryCount ?? 0 },
      archetype: { self: selfProfile.archetype, partner: partnerProfile.archetype },
      alterJudgments: { self: selfProfile.alterPatterns?.totalJudgments ?? 0, partner: partnerProfile.alterPatterns?.totalJudgments ?? 0 },
      contradictions: { self: selfProfile.contradictions?.dualAxes.length ?? 0, partner: partnerProfile.contradictions?.dualAxes.length ?? 0 },
      personMap: { self: selfProfile.personMap?.length ?? 0, partner: partnerProfile.personMap?.length ?? 0 },
    },
    pairKey: [user.id, partnerUserId].sort().join("_"),
    _snapshot: {
      selfAxisCount: selfProfile.axisCount,
      partnerAxisCount: partnerProfile.axisCount,
      vectorA,
      vectorB,
      reasonCodes: structuredInsight._raw.reasonCodes,
      cautionCodes: structuredInsight._raw.cautionCodes,
    },
  };

  return NextResponse.json(finalInsight);
}

// ============================================================
// POST: フィードバック保存
// ============================================================

export async function POST(request: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const {
      pairKey, accuracyScore, discoveryScore, actionIntentScore,
      nonDestructiveScore, revisitScore, narrativeScore, resonanceScore,
      unobservedScore, freeText, insightSnapshot,
    } = body;

    if (!pairKey || !insightSnapshot) {
      return NextResponse.json({ error: "pairKey and insightSnapshot are required" }, { status: 400 });
    }

    const feedbackData = {
      userId: user.id, pairKey, accuracyScore, discoveryScore,
      actionIntentScore, nonDestructiveScore, revisitScore,
      narrativeScore, resonanceScore, unobservedScore, freeText,
    };
    console.log("[phase0] Feedback received:", JSON.stringify(feedbackData));

    const { data, error } = await supabaseAdmin
      .from("rendezvous_phase0_feedback")
      .insert({
        user_id: user.id, pair_key: pairKey,
        accuracy_score: accuracyScore || null, discovery_score: discoveryScore || null,
        action_intent_score: actionIntentScore || null, non_destructive_score: nonDestructiveScore || null,
        revisit_score: revisitScore || null, narrative_score: narrativeScore || null,
        resonance_score: resonanceScore || null, unobserved_score: unobservedScore || null,
        free_text: freeText || null, insight_snapshot: insightSnapshot,
      })
      .select("id")
      .single();

    if (error) {
      console.warn("[phase0] DB save failed:", error.message);
      return NextResponse.json({ id: "logged-to-console", saved: false, note: "フィードバックはサーバーログに記録しました。" });
    }

    return NextResponse.json({ id: data.id, saved: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[phase0] POST error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
