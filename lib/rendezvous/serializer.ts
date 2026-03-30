import type {
  RendezvousCandidate,
  RendezvousUserStateRow,
  RendezvousProfile,
  RendezvousCardDTO,
  RendezvousDetailDTO,
  ContextLensDetail,
  MatchingVector,
} from "./types";
import type { CategoryScores } from "./evaluateDirection";
import type { RelationalIntelligence } from "@/lib/relational/types";
import type { OrbiterIntelligence, OrbiterContext } from "@/lib/orbiter/types";
import { toSyncPercent } from "./buildLabel";
import { generateCorePhrase } from "./corePhrase";

/**
 * DB行からHome/List用のカードDTOを生成
 * 相手の内部スコアや片側状態は含めない
 */
export function serializeCard(params: {
  candidate: RendezvousCandidate;
  myState: RendezvousUserStateRow;
  counterpartProfile: RendezvousProfile;
  contextLens?: ContextLensDetail | null;
}): RendezvousCardDTO {
  const { candidate, myState, counterpartProfile, contextLens } = params;

  // Generate core phrase from matching vector (if available)
  const matchingVector = (candidate as any).matching_vector_b ?? (candidate as any).matching_vector_a ?? null;
  const corePhrase = matchingVector
    ? generateCorePhrase(matchingVector as Partial<MatchingVector>, candidate.category)
    : null;

  return {
    candidateId: candidate.id,
    state: myState.state,
    category: candidate.category,
    syncPercent: toSyncPercent(candidate.overall_score),
    label: contextLens?.scoreBreakdown?.[contextLens.bestContext]?.bandLabel ?? candidate.label ?? "",
    reasons: (contextLens?.alignmentPoints ?? (candidate.reason_texts as string[])).slice(0, 3),
    caution: contextLens?.cautionPoints?.[0] ?? (candidate.caution_texts as string[])[0] ?? null,
    counterpart: {
      displayName: counterpartProfile.display_name ?? "Unknown",
      avatarUrl: counterpartProfile.avatar_asset_url,
    },
    deliveredAt: candidate.delivered_at,
    contextLens: contextLens ?? undefined,
    corePhrase,
  };
}

/**
 * DB行から詳細画面用DTOを生成
 */
export function serializeDetail(params: {
  candidate: RendezvousCandidate;
  myState: RendezvousUserStateRow;
  counterpartProfile: RendezvousProfile;
  viewerUserId?: string;
  threadId?: string | null;
  contextLens?: ContextLensDetail | null;
  relationalIntelligence?: RelationalIntelligence | null;
  orbiterIntelligence?: OrbiterIntelligence | null;
  orbiterContext?: OrbiterContext | null;
}): RendezvousDetailDTO {
  const { candidate, myState, counterpartProfile, viewerUserId, threadId, contextLens, relationalIntelligence, orbiterIntelligence, orbiterContext } = params;

  const isMutual =
    candidate.state === "mutual_liked" || candidate.state === "chat_opened";

  const canAct =
    !isMutual &&
    myState.state !== "liked" &&
    myState.state !== "passed" &&
    myState.state !== "expired";

  // Resolve counterpart user ID
  const counterpartUserId = counterpartProfile.user_id;

  // Resolve bidirectional category scores based on viewer perspective
  const rawCandidate = candidate as any;
  let categoryScores: RendezvousDetailDTO["categoryScores"] = undefined;
  if (rawCandidate.category_scores_a_to_b && rawCandidate.category_scores_b_to_a) {
    const isViewerA = viewerUserId === candidate.user_a;
    categoryScores = {
      myView: isViewerA ? rawCandidate.category_scores_a_to_b : rawCandidate.category_scores_b_to_a,
      theirView: isViewerA ? rawCandidate.category_scores_b_to_a : rawCandidate.category_scores_a_to_b,
    };
  }

  return {
    candidateId: candidate.id,
    state: myState.state,
    candidateState: candidate.state,
    threadId: threadId ?? null,
    matchedAt: candidate.matched_at ?? null,
    counterpartUserId,
    category: candidate.category,
    syncPercent: toSyncPercent(candidate.overall_score),
    label: contextLens?.scoreBreakdown?.[contextLens.bestContext]?.bandLabel ?? candidate.label ?? "",
    reasons: (contextLens?.alignmentPoints ?? (candidate.reason_texts as string[])).slice(0, 4),
    caution: contextLens?.cautionPoints?.[0] ?? (candidate.caution_texts as string[])[0] ?? null,
    cautions: (contextLens?.cautionPoints ?? (candidate.caution_texts as string[])).slice(0, 2),
    counterpart: {
      displayName: counterpartProfile.display_name ?? "Unknown",
      avatarUrl: counterpartProfile.avatar_asset_url,
      publicMoodSummary: counterpartProfile.public_mood_summary,
      publicStyleSummary: counterpartProfile.public_style_summary,
    },
    deliveredAt: candidate.delivered_at,
    actions: {
      canLike: canAct && myState.state !== "liked",
      canPass: canAct,
      canSave: canAct,
      canMute: true,
      canBlock: true,
      canReport: true,
    },
    contextLens: contextLens ?? undefined,
    contextLensDetail: contextLens ?? undefined,
    relationalIntelligence: relationalIntelligence ?? undefined,
    orbiterIntelligence: orbiterIntelligence ?? undefined,
    orbiterContext: orbiterContext ?? undefined,
    categoryScores,
  };
}
