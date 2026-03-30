import { NextResponse } from "next/server";
import { trackCronRun } from "@/lib/ceo/withSkillTelemetry";
import { authorizeInternalRequest } from "@/lib/ai/internalAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluatePair } from "@/lib/rendezvous/evaluate";
import { computeBidirectionalCategoryScores } from "@/lib/rendezvous/evaluateDirection";
import { batchLoadEnrichedData, composeEnrichedPair } from "@/lib/rendezvous/enrichedDataLoader";
import { normalizeUserPair } from "@/lib/rendezvous/helpers";
import { getExperimentWeights, type WeightExperiment } from "@/lib/rendezvous/abTesting";
import { getCategoryWeights } from "@/lib/rendezvous/categoryWeights";
import { computeMatchingSignals, getFriendMatchRecommendation } from "@/lib/stargazer/matchingIntegration";
import { deriveSDTProfile } from "@/lib/rendezvous/sdtAxes";
import { computeAttachmentCompatibility, deriveAttachmentProfile } from "@/lib/rendezvous/attachmentProfile";
import { computeLifePlanProfile } from "@/lib/rendezvous/lifePlanVector";
import type { LifePlanProfile, LifePlanResponse } from "@/lib/rendezvous/lifePlanVector";
import type { PartnerEvaluationInput } from "@/lib/rendezvous/partnerScoring";
import type {
  MatchingVector,
  RendezvousCategory,
  RendezvousProfile,
  RendezvousPreferences,
  DealbreakerProfile,
  CategoryWeights,
} from "@/lib/rendezvous/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/cron/rendezvous-candidate-generation
 *
 * Cronジョブ: オンボーディング完了ユーザー同士をペア評価し、
 * 相互成立した候補を rendezvous_candidates に生成する。
 *
 * ロジック:
 * 1. is_enabled=true かつ onboarding_completed_at IS NOT NULL のプロフィールを取得
 * 2. 各ペアを evaluatePair() で評価
 * 3. mutual=true のペアを rendezvous_candidates に挿入
 * 4. 既存候補・ブロック・抑制をスキップ
 */
export async function GET(request: Request) {
  const t = await trackCronRun("rendezvous-candidate-generation");
  const auth = authorizeInternalRequest(request);
  if (!auth.ok) {
    await t.finish({ ok: false, summary: "unauthorized" });
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  try {
    // 1. Fetch all active profiles with completed onboarding
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("user_id, is_enabled, is_paused, enabled_categories, primary_category")
      .eq("is_enabled", true)
      .eq("is_paused", false)
      .not("onboarding_completed_at", "is", null);

    if (profErr) {
      console.error("[candidate-gen] profiles error:", profErr);
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    if (!profiles || profiles.length < 2) {
      return NextResponse.json({
        ok: true,
        message: "Not enough active profiles",
        profileCount: profiles?.length ?? 0,
        candidatesGenerated: 0,
      });
    }

    // 2. Fetch all preferences (matching vectors)
    const userIds = profiles.map((p: any) => p.user_id);
    const { data: preferences, error: prefsErr } = await supabaseAdmin
      .from("rendezvous_preferences")
      .select("user_id, desired_relation_types, matching_vector, similarity_vs_complementarity")
      .in("user_id", userIds);

    if (prefsErr) {
      console.error("[candidate-gen] preferences error:", prefsErr);
      return NextResponse.json({ error: prefsErr.message }, { status: 500 });
    }

    // 2b. Fetch profile_details (dealbreaker data)
    const { data: profileDetails } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("user_id, profile_details")
      .in("user_id", userIds);

    const dealbreakerMap = new Map<string, DealbreakerProfile>();
    for (const pd of (profileDetails ?? []) as any[]) {
      if (pd.profile_details) {
        dealbreakerMap.set(pd.user_id, pd.profile_details as DealbreakerProfile);
      }
    }

    const profileMap = new Map<string, RendezvousProfile>();
    for (const p of profiles as any[]) {
      profileMap.set(p.user_id, p as RendezvousProfile);
    }

    const prefsMap = new Map<string, RendezvousPreferences>();
    for (const p of (preferences ?? []) as any[]) {
      prefsMap.set(p.user_id, {
        ...p,
        similarity_vs_complementarity: p.similarity_vs_complementarity ?? 0.2,
      } as RendezvousPreferences);
    }

    // 3. Fetch existing candidates to avoid duplicates
    const { data: existingCandidates } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("user_a, user_b")
      .not("state", "in", "(expired,dismissed)");

    const existingPairs = new Set<string>();
    for (const c of existingCandidates ?? []) {
      existingPairs.add(`${c.user_a}|${c.user_b}`);
    }

    // 4. Fetch blocks
    const { data: blocks } = await supabaseAdmin
      .from("rendezvous_blocks")
      .select("blocker_user_id, blocked_user_id");

    const blockedPairs = new Set<string>();
    for (const b of blocks ?? []) {
      const [low, high] = normalizeUserPair(b.blocker_user_id, b.blocked_user_id);
      blockedPairs.add(`${low}|${high}`);
    }

    // 4b. Fetch personalized weights for all users
    const { data: personalizedWeightsRows } = await supabaseAdmin
      .from("rendezvous_personalized_weights")
      .select("user_id, category, weights")
      .in("user_id", userIds);

    const personalizedWeightsMap = new Map<string, Partial<Record<RendezvousCategory, CategoryWeights>>>();
    for (const row of (personalizedWeightsRows ?? []) as any[]) {
      if (!personalizedWeightsMap.has(row.user_id)) {
        personalizedWeightsMap.set(row.user_id, {});
      }
      personalizedWeightsMap.get(row.user_id)![row.category as RendezvousCategory] = row.weights as CategoryWeights;
    }

    // 4c. Fetch active A/B experiments
    const { data: experimentRows } = await supabaseAdmin
      .from("rendezvous_experiments")
      .select("*")
      .eq("is_active", true);

    const activeExperiments: WeightExperiment[] = (experimentRows ?? []).map((e: any) => ({
      id: e.id,
      name: e.name,
      weightConfig: e.weight_config ?? {},
      samplePercent: e.sample_percent ?? 0,
      isActive: true,
    }));

    // A/Bテスト割当済みウェイトを統合（personalizedの上に重ねる）
    if (activeExperiments.length > 0) {
      for (const uid of userIds) {
        const categories: RendezvousCategory[] = ["romantic", "friendship", "cocreation", "community", "partner"];
        for (const cat of categories) {
          const baseW = personalizedWeightsMap.get(uid)?.[cat] ?? getCategoryWeights(cat);
          const { weights: expWeights, experimentId } = getExperimentWeights(uid, activeExperiments, baseW);
          if (experimentId) {
            if (!personalizedWeightsMap.has(uid)) personalizedWeightsMap.set(uid, {});
            personalizedWeightsMap.get(uid)![cat] = expWeights;
          }
        }
      }
    }

    // 4d. Batch-load enriched phenotype/stargazer/origin data for all users
    // カテゴリ横断で "romantic" をデフォルトとしてロード（各カテゴリ別に分割する場合は将来拡張）
    const enrichedDataMap = await batchLoadEnrichedData(userIds, "romantic").catch((err) => {
      console.warn("[candidate-gen] enrichedDataLoader failed, proceeding without enriched data:", err);
      return new Map<string, import("@/lib/rendezvous/enrichedDataLoader").UserEnrichedData>();
    });

    // 4e. Partner 枠用データ: Life Plan Profiles + Process Profiles をバッチロード
    // Partner カテゴリが enabled なユーザーがいる場合のみ取得
    const partnerEnabledUsers = profiles
      .filter((p: any) => (p.enabled_categories as string[]).includes("partner"))
      .map((p: any) => p.user_id);

    const lifePlanProfileMap = new Map<string, LifePlanProfile>();
    const processProfileMap = new Map<string, {
      fourHorsemenProfile: Record<string, number>;
      conflictStyleProfile: Record<string, unknown>;
      bidResponsiveness: number;
      growthVsDestiny: number;
    }>();

    if (partnerEnabledUsers.length > 0) {
      // Life Plan Profiles
      const { data: lpProfiles } = await supabaseAdmin
        .from("partner_life_plan_profiles")
        .select("user_id, vector, confidence, overall_confidence, response_count")
        .in("user_id", partnerEnabledUsers);

      for (const lp of (lpProfiles ?? []) as any[]) {
        if (lp.vector && lp.overall_confidence > 0) {
          lifePlanProfileMap.set(lp.user_id, {
            vector: lp.vector,
            confidence: lp.confidence,
            overallConfidence: lp.overall_confidence,
            updatedAt: "",
          });
        }
      }

      // Process Profiles
      const { data: ppProfiles } = await supabaseAdmin
        .from("partner_process_profiles")
        .select("user_id, four_horsemen_profile, conflict_style_profile, bid_responsiveness, growth_vs_destiny")
        .in("user_id", partnerEnabledUsers);

      for (const pp of (ppProfiles ?? []) as any[]) {
        processProfileMap.set(pp.user_id, {
          fourHorsemenProfile: pp.four_horsemen_profile,
          conflictStyleProfile: pp.conflict_style_profile,
          bidResponsiveness: pp.bid_responsiveness,
          growthVsDestiny: pp.growth_vs_destiny,
        });
      }

      console.log(
        `[candidate-gen] Partner data loaded: ${lifePlanProfileMap.size} life plans, ${processProfileMap.size} process profiles`,
      );
    }

    // 5. Evaluate pairs and generate candidates
    let candidatesGenerated = 0;
    let pairsEvaluated = 0;
    const MAX_CANDIDATES_PER_RUN = 50;
    const MAX_PAIRS_TO_EVALUATE = 500;

    const shuffled = [...userIds].sort(() => Math.random() - 0.5);

    for (let i = 0; i < shuffled.length && candidatesGenerated < MAX_CANDIDATES_PER_RUN; i++) {
      for (let j = i + 1; j < shuffled.length && candidatesGenerated < MAX_CANDIDATES_PER_RUN; j++) {
        if (pairsEvaluated >= MAX_PAIRS_TO_EVALUATE) break;

        const [userLow, userHigh] = normalizeUserPair(shuffled[i], shuffled[j]);
        const pairKey = `${userLow}|${userHigh}`;

        // Skip existing candidates
        if (existingPairs.has(pairKey)) continue;
        // Skip blocked pairs
        if (blockedPairs.has(pairKey)) continue;

        const profileA = profileMap.get(userLow);
        const profileB = profileMap.get(userHigh);
        const prefsA = prefsMap.get(userLow);
        const prefsB = prefsMap.get(userHigh);

        if (!profileA || !profileB || !prefsA || !prefsB) continue;

        const vectorA = prefsA.matching_vector as MatchingVector;
        const vectorB = prefsB.matching_vector as MatchingVector;
        if (!vectorA || !vectorB) continue;

        pairsEvaluated++;

        // Enriched phenotype/stargazer/origin データを構成
        const enrichedPair = composeEnrichedPair(enrichedDataMap, userLow, userHigh);

        // ── Safety Gate: Stargazer安全スコアによるフィルタ ──
        const dataLow = enrichedDataMap.get(userLow);
        const dataHigh = enrichedDataMap.get(userHigh);
        if (dataLow?.stargazerScores) {
          const signals = computeMatchingSignals(dataLow.stargazerScores as any);
          if (signals.safetyScore < 0.25) {
            // 極めてリスクが高い → 1対1マッチ除外
            continue;
          }
        }
        if (dataHigh?.stargazerScores) {
          const signals = computeMatchingSignals(dataHigh.stargazerScores as any);
          if (signals.safetyScore < 0.25) {
            continue;
          }
        }

        // ── SDT自動導出: Stargazerスコアがあれば心理学的深度を追加 ──
        if (dataLow?.stargazerScores && dataHigh?.stargazerScores) {
          enrichedPair.enrichedAB.selfSDTProfile = deriveSDTProfile({ stargazerScores: dataLow.stargazerScores });
          enrichedPair.enrichedAB.otherSDTProfile = deriveSDTProfile({ stargazerScores: dataHigh.stargazerScores });
          enrichedPair.enrichedBA.selfSDTProfile = deriveSDTProfile({ stargazerScores: dataHigh.stargazerScores });
          enrichedPair.enrichedBA.otherSDTProfile = deriveSDTProfile({ stargazerScores: dataLow.stargazerScores });
        }

        // ── Partner 3層統合: 両者が Partner enabled の場合に partnerInput を構築 ──
        let partnerInput: PartnerEvaluationInput | undefined;
        const bothPartner =
          (profileA.enabled_categories as string[]).includes("partner") &&
          (profileB.enabled_categories as string[]).includes("partner");

        if (bothPartner) {
          const aStargazer = dataLow?.stargazerScores ?? undefined;
          const bStargazer = dataHigh?.stargazerScores ?? undefined;

          // Attachment 互換性
          let attachmentFit: number | undefined;
          if (aStargazer && bStargazer) {
            try {
              const aAttach = deriveAttachmentProfile({
                matchingVector: vectorA,
                stargazerScores: aStargazer as Record<string, number>,
              });
              const bAttach = deriveAttachmentProfile({
                matchingVector: vectorB,
                stargazerScores: bStargazer as Record<string, number>,
              });
              attachmentFit = computeAttachmentCompatibility(aAttach, bAttach);
            } catch {
              // attachment computation failed, use default
            }
          }

          partnerInput = {
            aStargazerScores: aStargazer as Record<string, number> | undefined,
            bStargazerScores: bStargazer as Record<string, number> | undefined,
            attachmentFit,
            repairCapacity: undefined, // TODO: compute from conflictRepair when available
            aLifePlanProfile: lifePlanProfileMap.get(userLow),
            bLifePlanProfile: lifePlanProfileMap.get(userHigh),
          };
        }

        const result = evaluatePair({
          profileA,
          profileB,
          preferencesA: prefsA,
          preferencesB: prefsB,
          vectorA,
          vectorB,
          dealbreakerA: dealbreakerMap.get(userLow),
          dealbreakerB: dealbreakerMap.get(userHigh),
          personalizedWeightsA: personalizedWeightsMap.get(userLow),
          personalizedWeightsB: personalizedWeightsMap.get(userHigh),
          enrichedAB: enrichedPair.enrichedAB,
          enrichedBA: enrichedPair.enrichedBA,
          partnerInput,
        });

        if (!result.mutual || !result.bestCategory || !result.overallScore) continue;

        // Compute 4-category bidirectional scores
        const bidirectionalScores = computeBidirectionalCategoryScores(
          enrichedPair.enrichedAB,
          enrichedPair.enrichedBA,
          vectorA,
          vectorB,
        );

        // Insert candidate
        const { error: insertErr } = await supabaseAdmin
          .from("rendezvous_candidates")
          .insert({
            user_a: userLow,
            user_b: userHigh,
            category: result.bestCategory,
            overall_score: result.overallScore,
            reason_codes: result.reasonCodes,
            caution_codes: result.cautionCodes,
            label: result.label,
            state: "candidate_generated",
            matched_at: new Date().toISOString(),
            category_scores_a_to_b: bidirectionalScores.myView,
            category_scores_b_to_a: bidirectionalScores.theirView,
          });

        if (insertErr) {
          console.warn("[candidate-gen] insert error:", insertErr.message);
          continue;
        }

        // Insert user states for both users (unseen)
        await supabaseAdmin.from("rendezvous_user_states").insert([
          {
            candidate_id: undefined, // will need the id
            user_id: userLow,
            user_state: "unseen",
          },
          {
            candidate_id: undefined,
            user_id: userHigh,
            user_state: "unseen",
          },
        ]).then(() => {});

        // Re-fetch the inserted candidate to get its ID for user_states
        const { data: inserted } = await supabaseAdmin
          .from("rendezvous_candidates")
          .select("id")
          .eq("user_a", userLow)
          .eq("user_b", userHigh)
          .eq("category", result.bestCategory)
          .order("matched_at", { ascending: false })
          .limit(1)
          .single();

        if (inserted) {
          await supabaseAdmin.from("rendezvous_user_states").upsert([
            {
              candidate_id: inserted.id,
              user_id: userLow,
              user_state: "unseen",
            },
            {
              candidate_id: inserted.id,
              user_id: userHigh,
              user_state: "unseen",
            },
          ], { onConflict: "candidate_id,user_id" });

          existingPairs.add(pairKey);
          candidatesGenerated++;

          // Partner 候補の場合、3層スコアログを記録
          if (result.bestCategory === "partner" && result.partnerResult) {
            const { error: logErr } = await supabaseAdmin
              .from("partner_scoring_logs")
              .insert({
                candidate_id: inserted.id,
                user_a: userLow,
                user_b: userHigh,
                layer1_score: result.partnerResult.layer1Score,
                layer15_score: result.partnerResult.layer15Score,
                layer2_score: result.partnerResult.layer2Score,
                total_score: result.partnerResult.total,
                process_vector: result.partnerResult.processVector ?? null,
                life_plan_fit: result.partnerResult.lifePlanFit ?? null,
                guard_result: result.partnerResult.guardResult,
                partner_reason_codes: result.partnerResult.partnerReasonCodes,
                partner_caution_codes: result.partnerResult.partnerCautionCodes,
              });
            if (logErr) {
              console.warn("[candidate-gen] partner scoring log error:", logErr.message);
            }
          }
        }
      }
      if (pairsEvaluated >= MAX_PAIRS_TO_EVALUATE) break;
    }

    console.log(
      `[candidate-gen] Done: ${pairsEvaluated} pairs evaluated, ${candidatesGenerated} candidates generated`,
    );

    await t.finish({ ok: true, summary: `pairs=${pairsEvaluated}, candidates=${candidatesGenerated}` });
    return NextResponse.json({
      ok: true,
      profileCount: profiles.length,
      pairsEvaluated,
      candidatesGenerated,
    });
  } catch (err: any) {
    console.error("[candidate-gen] error:", err);
    await t.finish({ ok: false, summary: err.message ?? "fatal" });
    return NextResponse.json(
      { error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
