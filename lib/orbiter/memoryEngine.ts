// ============================================================
// Orbiter Memory Engine
// 「覚えている存在」の核心 — 内的独白の生成・蓄積・想起
//
// 人間のセラピストがセッション後にノートを書くように、
// Orbiter は毎訪問後に「メモ」を残す。
//
// これにより:
// - 前回言ったことを踏まえた発言ができる
// - 仮説を立て、検証し、修正する「成長」が生まれる
// - 「ああ、覚えてくれているんだ」というユーザー体験
// - revision intent が実際に発火する条件が生まれる
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OrbiterMemo,
  OrbiterMemoType,
  OrbiterMemoryState,
  OrbiterContext,
  FrictionForecast,
  AttractionProfile,
  TrajectoryForecast,
  SelfStateReport,
  TemporalPulse,
  OrbiterMilestone,
  OrbiterMilestoneType,
} from "./types";

// ── Memory Loading ──

/**
 * 特定の候補者に関するOrbiterのメモリ状態をロードする。
 * 最新20件のメモを取得し、構造化する。
 */
export async function loadMemoryState(
  supabase: SupabaseClient,
  userId: string,
  candidateId: string,
): Promise<OrbiterMemoryState> {
  const { data: memos } = await supabase
    .from("orbiter_memos")
    .select("*")
    .eq("user_id", userId)
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(20);

  const typedMemos: OrbiterMemo[] = (memos ?? []).map((m) => ({
    id: m.id,
    userId: m.user_id,
    candidateId: m.candidate_id,
    memoType: m.memo_type as OrbiterMemoType,
    content: m.content,
    confidence: m.confidence ?? 0.5,
    linkedMemoId: m.linked_memo_id ?? null,
    metadata: (m.metadata as Record<string, unknown>) ?? {},
    createdAt: m.created_at,
  }));

  const latestHypothesis =
    typedMemos.find((m) => m.memoType === "hypothesis") ?? null;
  const pendingQuestion =
    typedMemos.find((m) => m.memoType === "question") ?? null;
  const milestoneCount = typedMemos.filter(
    (m) => m.memoType === "milestone",
  ).length;
  const revisionCount = typedMemos.filter(
    (m) => m.memoType === "revision",
  ).length;

  return {
    memos: typedMemos,
    latestHypothesis,
    pendingQuestion,
    milestoneCount,
    revisionCount,
  };
}

// ── Memo Generation ──

interface MemoGenerationInput {
  context: OrbiterContext;
  memory: OrbiterMemoryState;
  friction: FrictionForecast | null;
  attraction: AttractionProfile | null;
  trajectory: TrajectoryForecast | null;
  selfState: SelfStateReport | null;
}

/**
 * 今回の訪問で Orbiter が「思ったこと」をメモとして生成する。
 * 0〜3件のメモを返す。呼び出し元で fire-and-forget で保存。
 */
export function generateMemos(input: MemoGenerationInput): Omit<OrbiterMemo, "id" | "userId" | "candidateId" | "createdAt">[] {
  const { context, memory, friction, attraction, trajectory, selfState } = input;
  const memos: Omit<OrbiterMemo, "id" | "userId" | "candidateId" | "createdAt">[] = [];

  // ── Milestone detection ──
  const milestone = detectMilestone(context, memory);
  if (milestone) {
    memos.push({
      memoType: "milestone",
      content: milestone.narrative,
      confidence: milestone.significance,
      linkedMemoId: null,
      metadata: {
        visitCount: context.visitCount,
        triggerSignal: milestone.type,
      },
    });
  }

  // ── Observation: 行動から読み取れる事実 ──
  const observation = generateObservation(context, memory, friction);
  if (observation) {
    memos.push(observation);
  }

  // ── Hypothesis: 観察から立てる仮説 ──
  const hypothesis = generateHypothesis(
    context, memory, friction, attraction, trajectory, selfState,
  );
  if (hypothesis) {
    memos.push(hypothesis);
  }

  // ── Revision: 過去の仮説を修正 ──
  const revision = checkForRevision(context, memory, friction, attraction);
  if (revision) {
    memos.push(revision);
  }

  // ── Question: 次に確かめたいこと ──
  const question = generateQuestion(context, memory, trajectory, friction);
  if (question) {
    memos.push(question);
  }

  return memos;
}

/**
 * 生成されたメモをDBに保存する (fire-and-forget)
 */
export function persistMemos(
  supabase: SupabaseClient,
  userId: string,
  candidateId: string,
  memos: Omit<OrbiterMemo, "id" | "userId" | "candidateId" | "createdAt">[],
): void {
  if (memos.length === 0) return;

  const rows = memos.map((m) => ({
    user_id: userId,
    candidate_id: candidateId,
    memo_type: m.memoType,
    content: m.content,
    confidence: m.confidence,
    linked_memo_id: m.linkedMemoId,
    metadata: m.metadata,
  }));

  // Fire-and-forget
  void (async () => {
    const { error } = await supabase.from("orbiter_memos").insert(rows);
    if (error) {
      console.error("[orbiter/memory] failed to persist memos:", error);
    }
  })();
}

// ── Temporal Pulse ──

/**
 * 時間に関する知覚を計算する。
 * Orbiter が「今」をどう感じているかを返す。
 */
export function computeTemporalPulse(
  context: OrbiterContext,
  memory: OrbiterMemoryState,
): TemporalPulse {
  // ── Urgency ──
  let urgency = 0;
  if (context.daysUntilExpiry != null) {
    if (context.daysUntilExpiry <= 1) urgency = 1.0;
    else if (context.daysUntilExpiry <= 3) urgency = 0.7;
    else if (context.daysUntilExpiry <= 7) urgency = 0.3;
    else urgency = 0.1;
  }

  // ── Visit Rhythm ──
  let visitRhythm: TemporalPulse["visitRhythm"] = "first";
  if (context.visitCount <= 1) {
    visitRhythm = "first";
  } else if (context.visitCount >= 6) {
    visitRhythm = "obsessive";
  } else if (
    context.hoursSinceLastVisit != null &&
    context.hoursSinceLastVisit > 48
  ) {
    visitRhythm = "returning_after_gap";
  } else {
    visitRhythm = "regular";
  }

  // ── Milestone ──
  const milestone = detectMilestone(context, memory);

  return { urgency, visitRhythm, milestone };
}

// ── Internal Helpers ──

function detectMilestone(
  context: OrbiterContext,
  memory: OrbiterMemoryState,
): OrbiterMilestone | null {
  const existingTypes = new Set(
    memory.memos
      .filter((m) => m.memoType === "milestone")
      .map((m) => m.metadata.triggerSignal),
  );

  // 初めてのview
  if (context.visitCount === 1 && !existingTypes.has("first_view")) {
    return {
      type: "first_view",
      narrative: "初めての出会い。まだ何もわからないが、ここから始まる。",
      significance: 0.5,
    };
  }

  // 初めての再訪問
  if (context.visitCount === 2 && !existingTypes.has("first_revisit")) {
    return {
      type: "first_revisit",
      narrative: "戻ってきた。何かが引っかかっている。",
      significance: 0.6,
    };
  }

  // 初めてのマッチ
  if (
    (context.candidateState === "mutual_liked" ||
      context.candidateState === "chat_opened") &&
    !existingTypes.has("first_mutual")
  ) {
    return {
      type: "first_mutual",
      narrative: "繋がりが成立した。ここからが本当の観察の始まり。",
      significance: 0.8,
    };
  }

  // リフレクション提出
  if (context.hasReflection && !existingTypes.has("reflection_given")) {
    return {
      type: "reflection_given",
      narrative: "自分自身を振り返った。この内省が次の精度を上げる。",
      significance: 0.7,
    };
  }

  // 期限間近
  if (
    context.daysUntilExpiry != null &&
    context.daysUntilExpiry <= 2 &&
    !existingTypes.has("decision_point")
  ) {
    return {
      type: "decision_point",
      narrative: "期限が近づいている。決断の時。",
      significance: 0.9,
    };
  }

  return null;
}

function generateObservation(
  context: OrbiterContext,
  memory: OrbiterMemoryState,
  friction: FrictionForecast | null,
): Omit<OrbiterMemo, "id" | "userId" | "candidateId" | "createdAt"> | null {
  // 訪問パターンに基づく観察
  if (context.visitCount === 2) {
    return {
      memoType: "observation",
      content: "2回目の訪問。1回では判断しなかったことが、慎重さを示している。",
      confidence: 0.6,
      linkedMemoId: null,
      metadata: {
        visitCount: context.visitCount,
        triggerSignal: "revisit",
      },
    };
  }

  if (context.visitCount >= 4 && context.candidateState === "seen") {
    return {
      memoType: "observation",
      content: `${context.visitCount}回目の訪問だが行動に移していない。決断を避けているか、情報が足りないか、あるいは直感と理性が拮抗している。`,
      confidence: 0.7,
      linkedMemoId: null,
      metadata: {
        visitCount: context.visitCount,
        triggerSignal: "repeated_no_action",
      },
    };
  }

  // 間隔を空けて戻ってきた
  if (
    context.hoursSinceLastVisit != null &&
    context.hoursSinceLastVisit > 72 &&
    context.visitCount > 1
  ) {
    return {
      memoType: "observation",
      content: `${Math.floor(context.hoursSinceLastVisit / 24)}日ぶりに戻ってきた。一度離れてから戻ること自体が、無意識の関心の証拠。`,
      confidence: 0.65,
      linkedMemoId: null,
      metadata: {
        visitCount: context.visitCount,
        triggerSignal: "return_after_gap",
        hoursSinceLastVisit: context.hoursSinceLastVisit,
      },
    };
  }

  // high friction でも何度も見に来ている
  if (
    friction?.overallRisk === "high" &&
    context.visitCount >= 3
  ) {
    return {
      memoType: "observation",
      content: "すれ違いリスクが高いと提示したのに見に来ている。リスクを承知の上で惹かれているか、リスク自体に魅力を感じている可能性。",
      confidence: 0.55,
      linkedMemoId: null,
      metadata: {
        visitCount: context.visitCount,
        triggerSignal: "high_friction_revisit",
      },
    };
  }

  return null;
}

function generateHypothesis(
  context: OrbiterContext,
  memory: OrbiterMemoryState,
  friction: FrictionForecast | null,
  attraction: AttractionProfile | null,
  trajectory: TrajectoryForecast | null,
  selfState: SelfStateReport | null,
): Omit<OrbiterMemo, "id" | "userId" | "candidateId" | "createdAt"> | null {
  // すでに仮説がある場合は、訪問3回ごとに新しい仮説を立てる
  if (memory.latestHypothesis && context.visitCount % 3 !== 0) {
    return null;
  }

  // 魅力の乖離が見つかった
  if (attraction?.divergences && attraction.divergences.length > 0) {
    const div = attraction.divergences[0];
    return {
      memoType: "hypothesis",
      content: `この人の「好き」は自己認識とずれている。${div.axisLabel}について、言葉では${div.statedDirection > 0 ? "高い" : "低い"}方を好むと言っているが、行動パターンは逆を示している。本能が先に動いている可能性。`,
      confidence: attraction.instantAttraction?.confidence ?? 0.4,
      linkedMemoId: memory.latestHypothesis?.id ?? null,
      metadata: {
        visitCount: context.visitCount,
        triggerSignal: "attraction_divergence",
        relatedAxis: div.axis,
      },
    };
  }

  // 状態が悪い時に繰り返し訪問
  if (
    selfState?.decisionQualityHint !== "optimal" &&
    context.visitCount >= 2
  ) {
    return {
      memoType: "hypothesis",
      content: "コンディションが万全でない時にこの相手を見に来ている。疲れた時に安心を求めているのか、あるいは判断力が落ちた時に本能が動くタイプか。",
      confidence: 0.4,
      linkedMemoId: memory.latestHypothesis?.id ?? null,
      metadata: {
        visitCount: context.visitCount,
        triggerSignal: "suboptimal_state_visit",
        decisionQuality: selfState?.decisionQualityHint,
      },
    };
  }

  // 軌道タイプに基づく仮説
  if (trajectory && context.visitCount >= 2) {
    const hypothesisMap: Partial<Record<string, string>> = {
      fast_intense:
        "急速に深まる軌道を持つ相手。この人は強い感情を求めている可能性。冷静に見えても、本能では激しさを欲しているかもしれない。",
      oscillating:
        "揺れやすい関係の軌道。この人は安定より刺激に惹かれやすいが、同時に不安定さに疲れやすいタイプかもしれない。",
      creative_tension:
        "ぶつかり合いのある軌道。この人は「衝突＝愛情の証拠」と感じている可能性。過去の関係パターンが影響している。",
    };
    const hyp = hypothesisMap[trajectory.type];
    if (hyp) {
      return {
        memoType: "hypothesis",
        content: hyp,
        confidence: 0.45,
        linkedMemoId: memory.latestHypothesis?.id ?? null,
        metadata: {
          visitCount: context.visitCount,
          triggerSignal: "trajectory_pattern",
          trajectoryType: trajectory.type,
        },
      };
    }
  }

  return null;
}

function checkForRevision(
  context: OrbiterContext,
  memory: OrbiterMemoryState,
  friction: FrictionForecast | null,
  attraction: AttractionProfile | null,
): Omit<OrbiterMemo, "id" | "userId" | "candidateId" | "createdAt"> | null {
  if (!memory.latestHypothesis) return null;

  const prevHyp = memory.latestHypothesis;

  // 前回「行動しない」と観察したのに、mutual_liked になった
  if (
    prevHyp.metadata.triggerSignal === "repeated_no_action" &&
    (context.candidateState === "mutual_liked" ||
      context.candidateState === "chat_opened")
  ) {
    return {
      memoType: "revision",
      content: `前に「決断を避けている」と思ったが、実際には十分な時間をかけて判断したということだった。この人の慎重さは弱さではなく、丁寧さ。`,
      confidence: 0.7,
      linkedMemoId: prevHyp.id,
      metadata: {
        visitCount: context.visitCount,
        triggerSignal: "action_taken_after_hesitation",
        previousContent: prevHyp.content,
      },
    };
  }

  // 前回「リスク承知で惹かれている」と仮説したのに、pass した場合
  // (candidateState が dismissed などになっていれば)
  if (
    prevHyp.metadata.triggerSignal === "high_friction_revisit" &&
    context.candidateState === "dismissed"
  ) {
    return {
      memoType: "revision",
      content: `リスクに魅力を感じていると思ったが、最終的には理性が勝った。この人は本能に引っ張られにくいタイプかもしれない。`,
      confidence: 0.6,
      linkedMemoId: prevHyp.id,
      metadata: {
        visitCount: context.visitCount,
        triggerSignal: "rational_rejection",
        previousContent: prevHyp.content,
      },
    };
  }

  // 前回「乖離がある」と仮説したのに、attractionのconfidenceが下がった
  if (
    prevHyp.metadata.triggerSignal === "attraction_divergence" &&
    attraction &&
    attraction.divergences.length === 0 &&
    (attraction.instantAttraction?.confidence ?? 0) > 0.5
  ) {
    return {
      memoType: "revision",
      content: `以前は「好き」の自己認識にズレがあると思ったが、データが増えた結果、ズレは解消された。この人の自己理解は正確だった。`,
      confidence: 0.55,
      linkedMemoId: prevHyp.id,
      metadata: {
        visitCount: context.visitCount,
        triggerSignal: "divergence_resolved",
        previousContent: prevHyp.content,
      },
    };
  }

  return null;
}

function generateQuestion(
  context: OrbiterContext,
  memory: OrbiterMemoryState,
  trajectory: TrajectoryForecast | null,
  friction: FrictionForecast | null,
): Omit<OrbiterMemo, "id" | "userId" | "candidateId" | "createdAt"> | null {
  // すでに未検証の質問がある場合はスキップ
  if (memory.pendingQuestion) return null;

  // 3回以上の訪問で行動なし → 何が引っかかっているかを知りたい
  if (context.visitCount >= 3 && context.candidateState === "seen") {
    return {
      memoType: "question",
      content: "次の観察ポイント: この人がlikeかpassか、どちらを選ぶか。そしてその決断にかかる時間。迷いの深さが、魅力の質を示す。",
      confidence: 0.5,
      linkedMemoId: null,
      metadata: {
        visitCount: context.visitCount,
        triggerSignal: "indecision_inquiry",
      },
    };
  }

  // mutual_liked 後 → 最初のコミュニケーションがどうなるか
  if (context.candidateState === "mutual_liked") {
    return {
      memoType: "question",
      content: "次の観察ポイント: 最初のメッセージの温度感。軌道予測と合致するか。相手との実際のやり取りが、理論値からどれだけズレるか。",
      confidence: 0.5,
      linkedMemoId: null,
      metadata: {
        visitCount: context.visitCount,
        triggerSignal: "post_match_inquiry",
        trajectoryType: trajectory?.type,
      },
    };
  }

  // 高リスク摩擦 + リフレクション未提出
  if (
    friction?.overallRisk === "high" &&
    !context.hasReflection
  ) {
    return {
      memoType: "question",
      content: "リフレクションを促したい。この人がすれ違いポイントをどう捉えているか、本人の言葉で聞けると予測精度が劇的に上がる。",
      confidence: 0.6,
      linkedMemoId: null,
      metadata: {
        visitCount: context.visitCount,
        triggerSignal: "reflection_needed",
      },
    };
  }

  return null;
}
