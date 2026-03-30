// ============================================================
// Orbiter Branching Reflection Flows
// 文脈に応じた分岐型の観測対話
//
// 固定6問 → 回答が次の質問を決める (最大3-4ステップ)
// 質問 = アンケートではなく観測の入口
//
// 5つの文脈:
// - post_like: likeした直後 → 決め手を掘る
// - post_pass: passした直後 → 回避の理由を掘る
// - revisit_hesitation: 3回以上見て未行動 → 何が引っかかっているか
// - mutual_liked: マッチ成立 → 期待と不安
// - post_chat: チャット後 → 実感との差分
// ============================================================

import type {
  ReflectionFlow,
  ReflectionNode,
  ReflectionTriggerContext,
  OrbiterContext,
  OrbiterMaturity,
  OrbiterMemoryState,
} from "./types";

// ── Flow Definitions ──

const NODE_REGISTRY: Record<string, ReflectionNode> = {
  // ── post_like flow ──
  "pl_q1": {
    id: "pl_q1",
    question: "この人のどこが決め手だった？",
    inputType: "choice",
    options: [
      { label: "直感", value: "intuition", nextNodeId: "pl_q2_intuition" },
      { label: "性格の軸が合いそう", value: "axis_match", nextNodeId: "pl_q2_axis" },
      { label: "消去法", value: "elimination", nextNodeId: "pl_q2_elim" },
    ],
  },
  "pl_q2_intuition": {
    id: "pl_q2_intuition",
    question: "その直感、いつもと同じ感覚？",
    inputType: "choice",
    options: [
      { label: "いつも通り", value: "same" },
      { label: "今回は違う", value: "different" },
    ],
    isTerminal: true,
  },
  "pl_q2_axis": {
    id: "pl_q2_axis",
    question: "それは普段も重視してる軸？",
    inputType: "choice",
    options: [
      { label: "はい", value: "yes", nextNodeId: "pl_q3_stable" },
      { label: "いいえ", value: "no", nextNodeId: "pl_q3_new" },
    ],
  },
  "pl_q3_stable": {
    id: "pl_q3_stable",
    question: "好みは安定してる。自信を持っていい。",
    inputType: "scale",
    scaleRange: { min: 1, max: 5, labels: ["まだ自信ない", "確信がある"] },
    isTerminal: true,
  },
  "pl_q3_new": {
    id: "pl_q3_new",
    question: "今回は何が違った？",
    inputType: "freetext",
    isTerminal: true,
  },
  "pl_q2_elim": {
    id: "pl_q2_elim",
    question: "他の人を外した理由の方が強い？",
    inputType: "choice",
    options: [
      { label: "そう、他が合わなかった", value: "others_bad" },
      { label: "いや、この人にも惹かれた", value: "attracted_too" },
    ],
    isTerminal: true,
  },

  // ── post_pass flow ──
  "pp_q1": {
    id: "pp_q1",
    question: "passした理由で一番大きいのは？",
    inputType: "choice",
    options: [
      { label: "リスクが気になった", value: "risk", nextNodeId: "pp_q2_risk" },
      { label: "ピンとこなかった", value: "no_spark", nextNodeId: "pp_q2_spark" },
      { label: "今じゃない気がした", value: "timing", nextNodeId: "pp_q2_timing" },
    ],
  },
  "pp_q2_risk": {
    id: "pp_q2_risk",
    question: "どのリスクが一番気になった？",
    inputType: "freetext",
    isTerminal: true,
  },
  "pp_q2_spark": {
    id: "pp_q2_spark",
    question: "ピンとこないのは、いつものこと？",
    inputType: "choice",
    options: [
      { label: "最近そうかも", value: "lately" },
      { label: "この人だけ", value: "this_one" },
    ],
    isTerminal: true,
  },
  "pp_q2_timing": {
    id: "pp_q2_timing",
    question: "時間があったら違う判断をした？",
    inputType: "choice",
    options: [
      { label: "多分", value: "maybe" },
      { label: "いいえ、やっぱりpass", value: "still_pass" },
    ],
    isTerminal: true,
  },

  // ── revisit_hesitation flow ──
  "rh_q1": {
    id: "rh_q1",
    question: "何が引っかかってる？",
    inputType: "choice",
    options: [
      { label: "リスクが気になる", value: "risk", nextNodeId: "rh_q2_risk" },
      { label: "もう少し知りたい", value: "more_info", nextNodeId: "rh_q2_info" },
      { label: "決められない", value: "cant_decide", nextNodeId: "rh_q2_decide" },
    ],
  },
  "rh_q2_risk": {
    id: "rh_q2_risk",
    question: "リスクを取ってでも会いたい？",
    inputType: "choice",
    options: [
      { label: "会いたい", value: "yes" },
      { label: "やめておく", value: "no" },
    ],
    isTerminal: true,
  },
  "rh_q2_info": {
    id: "rh_q2_info",
    question: "何を知れば決められる？",
    inputType: "freetext",
    isTerminal: true,
  },
  "rh_q2_decide": {
    id: "rh_q2_decide",
    question: "どっちに転んでも後悔しそう？",
    inputType: "choice",
    options: [
      { label: "はい", value: "yes", nextNodeId: "rh_q3_regret" },
      { label: "いいえ", value: "no", nextNodeId: "rh_q3_missing" },
    ],
  },
  "rh_q3_regret": {
    id: "rh_q3_regret",
    question: "後悔が少ない方はどっち？",
    inputType: "choice",
    options: [
      { label: "like", value: "like" },
      { label: "pass", value: "pass" },
    ],
    isTerminal: true,
  },
  "rh_q3_missing": {
    id: "rh_q3_missing",
    question: "何が足りない？",
    inputType: "freetext",
    isTerminal: true,
  },

  // ── mutual_liked flow ──
  "ml_q1": {
    id: "ml_q1",
    question: "繋がった今、どんな気持ち？",
    inputType: "choice",
    options: [
      { label: "嬉しい", value: "happy", nextNodeId: "ml_q2_happy" },
      { label: "不安もある", value: "anxious", nextNodeId: "ml_q2_anxious" },
      { label: "まだ実感がない", value: "numb", nextNodeId: "ml_q2_numb" },
    ],
  },
  "ml_q2_happy": {
    id: "ml_q2_happy",
    question: "最初に何を伝えたい？",
    inputType: "freetext",
    isTerminal: true,
  },
  "ml_q2_anxious": {
    id: "ml_q2_anxious",
    question: "不安の正体は？",
    inputType: "choice",
    options: [
      { label: "期待外れだったら", value: "disappointment" },
      { label: "自分をうまく出せるか", value: "self_expression" },
    ],
    isTerminal: true,
  },
  "ml_q2_numb": {
    id: "ml_q2_numb",
    question: "それはいつもそう？",
    inputType: "choice",
    options: [
      { label: "いつもそう", value: "always" },
      { label: "今回だけ", value: "this_time" },
    ],
    isTerminal: true,
  },

  // ── post_chat flow ──
  "pc_q1": {
    id: "pc_q1",
    question: "実際に話してみて、印象は変わった？",
    inputType: "choice",
    options: [
      { label: "良い方に変わった", value: "better", nextNodeId: "pc_q2_better" },
      { label: "変わらない", value: "same", nextNodeId: "pc_q2_same" },
      { label: "少し違った", value: "different", nextNodeId: "pc_q2_diff" },
    ],
  },
  "pc_q2_better": {
    id: "pc_q2_better",
    question: "何が予想と違った？",
    inputType: "freetext",
    isTerminal: true,
  },
  "pc_q2_same": {
    id: "pc_q2_same",
    question: "自然体でいられた？",
    inputType: "scale",
    scaleRange: { min: 1, max: 5, labels: ["無理してた", "完全に自然体"] },
    isTerminal: true,
  },
  "pc_q2_diff": {
    id: "pc_q2_diff",
    question: "何が違った？",
    inputType: "freetext",
    isTerminal: true,
  },
};

// ── Flow Definitions (root nodes per context) ──

const FLOW_MAP: Record<ReflectionTriggerContext, string> = {
  post_like: "pl_q1",
  post_pass: "pp_q1",
  revisit_hesitation: "rh_q1",
  mutual_liked: "ml_q1",
  post_chat: "pc_q1",
};

// ── Public API ──

/**
 * 現在のコンテキストに最適なリフレクションフローを選択する。
 * witness段階では提示しない。
 * 同じ候補者で既にリフレクション済みの場合も提示しない。
 */
export function selectReflectionFlow(
  context: OrbiterContext,
  maturity: OrbiterMaturity,
  memory: OrbiterMemoryState,
): ReflectionFlow | null {
  // witness は観察のみ
  if (maturity.stage === "witness") return null;

  // すでにリフレクション済み
  if (context.hasReflection) return null;

  // 文脈の判定
  let triggerContext: ReflectionTriggerContext | null = null;

  if (
    context.candidateState === "seen" &&
    context.visitCount >= 3
  ) {
    triggerContext = "revisit_hesitation";
  } else if (context.candidateState === "mutual_liked") {
    triggerContext = "mutual_liked";
  } else if (context.candidateState === "chat_opened") {
    triggerContext = "post_chat";
  }

  // post_like / post_pass はアクション直後のみ (route 側で設定する想定)
  // ここでは revisit_hesitation, mutual_liked, post_chat のみ自動判定

  if (!triggerContext) return null;

  const rootNodeId = FLOW_MAP[triggerContext];
  const rootNode = NODE_REGISTRY[rootNodeId];

  if (!rootNode) return null;

  return {
    id: `flow_${triggerContext}_${Date.now()}`,
    triggerContext,
    rootNode,
  };
}

/**
 * ノードIDからReflectionNodeを取得する。
 * クライアント側で次のノードに遷移する時に使う。
 */
export function getReflectionNode(nodeId: string): ReflectionNode | null {
  return NODE_REGISTRY[nodeId] ?? null;
}
