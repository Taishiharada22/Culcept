import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { serializeDetail } from "@/lib/rendezvous/serializer";
import { verifyCandidateBelongsToUser, getCounterpartId } from "@/lib/rendezvous/helpers";
import { buildMyStyleContextLens, loadMyStyleProfileMap } from "@/lib/rendezvous/myStyleLens";
import { computeRelationalIntelligence } from "@/lib/relational";
import { computeOrbiterFull } from "@/lib/orbiter/orchestrator";
import { loadLikeHistory, loadBreakpointTriggers } from "@/lib/orbiter/signalAccumulator";
import { loadMemoryState, persistMemos } from "@/lib/orbiter/memoryEngine";
import { loadDecisionHistory, detectCrossPatterns } from "@/lib/orbiter/crossPatternEngine";
import { loadPreviousSnapshot, persistSnapshot, buildCurrentSnapshot } from "@/lib/orbiter/deltaEngine";
import { loadAnomalies, persistAnomaly } from "@/lib/orbiter/anomalyEngine";
import { loadEraSnapshots, persistEraSnapshot } from "@/lib/orbiter/stratigraphyEngine";
import { loadPreviousDigest, persistDigest } from "@/lib/orbiter/existentialDigest";
import { refreshOrbiterMemorySummary } from "@/lib/orbiter/memorySummary";
import { computeAxisDistribution } from "@/lib/stargazer/fluctuationEngine";
import { TRAIT_AXIS_KEYS } from "@/lib/stargazer/traitAxes";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { CautionCode } from "@/lib/rendezvous/types";
import {
  evaluateSafetySignals,
  determineAction,
  type SafetySignal,
} from "@/lib/rendezvous/safetySignals";

/** 最新スナップショットを軸ごとの最新スコアに集約 (session_date降順前提) */
function toAxisMap(
  rows: { axis_id: string; score: number }[] | null,
): Partial<Record<TraitAxisKey, number>> {
  if (!rows) return {};
  const map: Record<string, number> = {};
  for (const row of rows) {
    if (!(row.axis_id in map)) map[row.axis_id] = row.score;
  }
  return map as Partial<Record<TraitAxisKey, number>>;
}

function toConfidenceMap(
  rows: { axis_id: string; confidence: number | null }[] | null,
): Partial<Record<TraitAxisKey, number>> {
  if (!rows) return {};
  const map: Record<string, number> = {};
  for (const row of rows) {
    if (!(row.axis_id in map)) map[row.axis_id] = row.confidence ?? 0.5;
  }
  return map as Partial<Record<TraitAxisKey, number>>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    // Auth via supabaseServer (user-scoped)
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );

    const { candidateId } = await params;
    const userId = auth.user.id;

    // Use supabaseAdmin for all DB operations (cross-user reads bypass RLS)
    const result = await verifyCandidateBelongsToUser(
      supabaseAdmin,
      candidateId,
      userId,
    );

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Candidate not found" },
        { status: 404 },
      );
    }

    const { candidate, myState, counterpartProfile } = result;
    const counterpartId = getCounterpartId(candidate, userId);

    // ── 全データを最大限に並列取得 ──
    const fourteenDaysAgo = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Chat thread lookup は条件付きだが、Promiseで統一して並列化
    const needsChat =
      candidate.state === "mutual_liked" ||
      candidate.state === "chat_opened";

    const [
      myStyleProfileMap,
      selfAxisData,
      counterpartAxisData,
      likeHistory,
      breakpointTriggers,
      prefsResult,
      obsStateResult,
      recentSnapshotsResult,
      priorViewsResult,
      chatResult,
      reflectionExistsResult,
      memoryState,
      decisionHistory,
      previousDeltaSnapshot,
      // Phase 4
      storedAnomalies,
      storedEras,
      // Phase 5
      previousDigest,
    ] = await Promise.all([
      loadMyStyleProfileMap(supabaseAdmin, [userId, counterpartId]),
      supabaseAdmin
        .from("stargazer_axis_snapshots")
        .select("axis_id, score, confidence")
        .eq("user_id", userId)
        .order("session_date", { ascending: false }),
      supabaseAdmin
        .from("stargazer_axis_snapshots")
        .select("axis_id, score, confidence")
        .eq("user_id", counterpartId)
        .order("session_date", { ascending: false }),
      loadLikeHistory(supabaseAdmin, userId),
      loadBreakpointTriggers(supabaseAdmin, userId),
      supabaseAdmin
        .from("rendezvous_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("stargazer_sessions")
        .select("observation_state")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("stargazer_axis_snapshots")
        .select("axis_id, score, session_date")
        .eq("user_id", userId)
        .gte("session_date", fourteenDaysAgo)
        .order("session_date", { ascending: false }),
      // Signal count for revisit detection (now parallel)
      supabaseAdmin
        .from("orbiter_signals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("candidate_id", candidateId)
        .eq("signal_type", "detail_view"),
      // Chat thread lookup (now parallel, returns null if not needed)
      needsChat
        ? supabaseAdmin
            .from("rendezvous_chats")
            .select("id")
            .eq("candidate_id", candidate.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // Reflection existence check (parallel)
      supabaseAdmin
        .from("orbiter_reflections")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("candidate_id", candidateId),
      // Memory state: Orbiter's internal monologue (parallel)
      loadMemoryState(supabaseAdmin, userId, candidateId),
      // Cross-candidate decision history (parallel)
      loadDecisionHistory(supabaseAdmin, userId),
      // Delta: previous snapshot for change detection (parallel)
      loadPreviousSnapshot(supabaseAdmin, userId),
      // Phase 4: stored anomalies (parallel)
      loadAnomalies(supabaseAdmin, userId),
      // Phase 4: stored era snapshots (parallel)
      loadEraSnapshots(supabaseAdmin, userId),
      // Phase 5: previous existential digest (parallel)
      loadPreviousDigest(supabaseAdmin, userId),
    ]);

    const threadId = chatResult.data?.id ?? null;

    // ── Fire-and-forget: signal insert + seen update (don't await results) ──
    const priorViews = priorViewsResult.count ?? 0;
    const viewSignalType = priorViews > 0 ? "revisit" : "detail_view";

    // Signal insert — truly fire-and-forget (no await, wrapped in void)
    void (async () => {
      await supabaseAdmin.from("orbiter_signals").insert({
        user_id: userId,
        candidate_id: candidateId,
        signal_type: viewSignalType,
        payload:
          viewSignalType === "revisit"
            ? { visitNumber: priorViews + 1 }
            : {},
      });
    })();

    // If unseen, mark as seen (fire-and-forget)
    if (myState.state === "unseen") {
      const now = new Date().toISOString();
      myState.state = "seen";
      myState.seen_at = now;
      void (async () => {
        const { error: updateErr } = await supabaseAdmin
          .from("rendezvous_user_states")
          .update({ state: "seen", seen_at: now })
          .eq("id", myState.id);
        if (updateErr) {
          console.error(
            "[rendezvous/detail] failed to update state to seen:",
            updateErr,
          );
        }
      })();
    }

    // Relational Intelligence 計算
    const selfAxisScores = toAxisMap(selfAxisData.data);
    const counterpartAxisScores = toAxisMap(counterpartAxisData.data);
    const cautionCodes = (candidate.caution_codes ?? []) as CautionCode[];

    const relationalIntelligence = computeRelationalIntelligence({
      selfAxisScores,
      counterpartAxisScores,
      selfAxisConfidence: toConfidenceMap(selfAxisData.data),
      cautionCodes,
      counterpartMoodSummary: counterpartProfile.public_mood_summary,
      counterpartStyleSummary: counterpartProfile.public_style_summary,
    });

    // Orbiter Intelligence 計算 (Phase 2)
    const obsState = obsStateResult.data?.observation_state;
    const recentSnapshots = recentSnapshotsResult.data ?? [];

    // AxisDistribution を計算
    const snapshotsByAxis = new Map<string, typeof recentSnapshots>();
    for (const snap of recentSnapshots) {
      const arr = snapshotsByAxis.get(snap.axis_id) ?? [];
      arr.push(snap);
      snapshotsByAxis.set(snap.axis_id, arr);
    }
    const selfDistributions = [];
    for (const axisId of TRAIT_AXIS_KEYS) {
      const axisSnapshots = snapshotsByAxis.get(axisId);
      if (!axisSnapshots || axisSnapshots.length < 2) continue;
      const dist = computeAxisDistribution(
        axisId as TraitAxisKey,
        axisSnapshots.map((s) => ({
          axis_id: s.axis_id as TraitAxisKey,
          score: s.score,
          session_date: s.session_date,
        })),
      );
      if (dist) selfDistributions.push(dist);
    }

    // Orbiter Context: 訪問回数 + 候補者状態 + 時間情報
    const daysSinceDelivery = candidate.created_at
      ? Math.floor(
          (Date.now() - new Date(candidate.created_at).getTime()) /
            (24 * 60 * 60 * 1000),
        )
      : 0;

    // Compute daysUntilExpiry and hoursSinceLastVisit for temporal awareness
    const daysUntilExpiry = candidate.expires_at
      ? Math.max(0, Math.floor(
          (new Date(candidate.expires_at).getTime() - Date.now()) /
            (24 * 60 * 60 * 1000),
        ))
      : null;

    // hoursSinceLastVisit: from the latest detail_view signal timestamp
    const lastViewSignal = memoryState.memos.length > 0
      ? memoryState.memos[0]
      : null;
    const hoursSinceLastVisit = lastViewSignal?.createdAt
      ? (Date.now() - new Date(lastViewSignal.createdAt).getTime()) / (60 * 60 * 1000)
      : null;

    const orbiterCtx = {
      visitCount: priorViews + 1,
      candidateState: candidate.state,
      category: candidate.category,
      hasReflection: (reflectionExistsResult.count ?? 0) > 0,
      daysSinceDelivery,
      daysUntilExpiry,
      hoursSinceLastVisit,
    };

    // Build judgment profile and delta snapshots
    const judgmentProfile = detectCrossPatterns(decisionHistory);

    // Compute average visit count for delta snapshot
    const avgVisitCount = decisionHistory.length > 0
      ? decisionHistory.reduce((sum, d) => sum + d.visitCount, 0) / decisionHistory.length
      : 1;
    const currentDeltaSnapshot = buildCurrentSnapshot(
      userId, judgmentProfile, avgVisitCount,
    );

    // Phase 4: extract latest decision for this candidate
    const latestForCandidate = likeHistory.find((h) => h.candidateId === candidateId);
    const latestDecision = latestForCandidate
      ? { decision: latestForCandidate.decision, timeToDecisionMs: latestForCandidate.timeToDecisionMs }
      : null;

    const orbiterResult = computeOrbiterFull({
      relationalIntelligence,
      selfAxisScores,
      counterpartAxisScores,
      likeHistory,
      statedPreferences: prefsResult.data ?? null,
      breakpointTriggers,
      category: candidate.category,
      cautionCodes,
      selfDistributions,
      currentObservationState: obsState
        ? {
            energy: obsState.energy ?? "moderate",
            emotion: obsState.emotion ?? "neutral",
            social: obsState.social ?? "neutral",
          }
        : null,
      recentSnapshots,
      orbiterContext: orbiterCtx,
      memoryState,
      judgmentProfile,
      previousDeltaSnapshot,
      currentDeltaSnapshot,
      // Phase 4
      storedAnomalies,
      storedEras,
      latestDecision,
      decisionHistory,
      // Phase 5
      previousDigest,
    });

    const orbiterIntelligence = orbiterResult.intelligence;

    // Persist new memos — fire-and-forget
    persistMemos(supabaseAdmin, userId, candidateId, orbiterResult.newMemos);

    // Persist delta snapshot — fire-and-forget (only if enough data)
    if (currentDeltaSnapshot.decisionCount >= 3) {
      persistSnapshot(supabaseAdmin, currentDeltaSnapshot);
    }

    // Phase 4: Persist anomalies — fire-and-forget
    if (orbiterResult.newAnomalies?.length) {
      for (const a of orbiterResult.newAnomalies) {
        void persistAnomaly(supabaseAdmin, {
          ...a,
          userId: a.userId || userId,
          candidateId: a.candidateId || candidateId,
        });
      }
    }

    // Phase 4: Persist era snapshot — fire-and-forget
    if (orbiterResult.eraSnapshot) {
      void persistEraSnapshot(supabaseAdmin, {
        ...orbiterResult.eraSnapshot,
        userId: orbiterResult.eraSnapshot.userId || userId,
      });
    }

    // Phase 5: Persist existential digest — fire-and-forget
    if (orbiterResult.newDigest) {
      persistDigest(supabaseAdmin, {
        ...orbiterResult.newDigest,
        userId: orbiterResult.newDigest.userId || userId,
      });
    }

    if (orbiterResult.newMemos.length > 0 || orbiterResult.newDigest) {
      void refreshOrbiterMemorySummary({
        supabase: supabaseAdmin,
        userId,
        candidateId,
        memoryState,
        newMemos: orbiterResult.newMemos,
        orbiterContext: orbiterCtx,
        orbiterIntelligence,
        currentDigest: orbiterResult.newDigest ?? previousDigest,
        sessionId: threadId ?? candidateId,
      });
    }

    const detail = serializeDetail({
      candidate,
      myState,
      counterpartProfile,
      threadId,
      contextLens: buildMyStyleContextLens({
        selfProfile: myStyleProfileMap.get(userId),
        counterpartProfile: myStyleProfileMap.get(counterpartId),
      }),
      relationalIntelligence,
      orbiterIntelligence,
      orbiterContext: orbiterCtx,
    });

    // Safety signals evaluation for counterpart (fire-and-forget enrichment)
    let safetyStatus: { action: string; signalCount: number } | null = null;
    try {
      const { count: reportCount } = await supabaseAdmin
        .from("rendezvous_reports")
        .select("id", { count: "exact", head: true })
        .eq("target_user_id", counterpartId);
      const { count: reporterCount } = await supabaseAdmin
        .from("rendezvous_reports")
        .select("reporter_user_id", { count: "exact", head: true })
        .eq("target_user_id", counterpartId);

      const signals = evaluateSafetySignals(counterpartId, {
        likeCount24h: 0,
        passCount24h: 0,
        totalSwipes24h: 0,
        messageCountPerCandidate: {},
        reportCount: reportCount ?? 0,
        reporterCount: reporterCount ?? 0,
        mutualLikeCount: 0,
        chatOpenedCount: 0,
        chatRespondedCount: 0,
      });
      const action = determineAction(signals);
      safetyStatus = { action, signalCount: signals.length };
    } catch (e) {
      console.warn("[rendezvous/detail] safety signal eval failed:", e);
    }

    return NextResponse.json({ ok: true, detail, safetyStatus });
  } catch (err: any) {
    console.error("[rendezvous/detail] error:", err);
    return NextResponse.json(
      { ok: false, error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
