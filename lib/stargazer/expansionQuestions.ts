// lib/stargazer/expansionQuestions.ts
// P4 Phase D: 拡張軸専用の質問18問（6軸×3問）
// CEO条件:
//   1. 1日最大1問の原則を守る
//   2. 発見済み軸（解放条件に近い / 輪郭が出始めた / 矛盾の再確認が必要）にだけ出す
//   3. archetype / core 45軸へは逆流させない
//
// 質問は SemanticDifferential 形式（5段階スライダー）
// 各質問は対象の expansion 軸のみを更新し、core 軸には一切影響しない

import type { TraitAxisKey } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ExpansionQuestion {
  /** 一意ID: "exp_{軸名}_{番号}" */
  id: string;
  /** 対象の拡張軸（1軸のみ。core軸を含まない） */
  axisId: TraitAxisKey;
  /** 質問文（日本語） */
  questionText: string;
  /** 左端ラベル（-1方向） */
  leftLabel: string;
  /** 右端ラベル（+1方向） */
  rightLabel: string;
  /** 5段階スケール */
  scale: 5;
  /** 観測角度 */
  angle: "self_reflection" | "scenario" | "past_recall" | "hypothetical";
  /** 質問の深さ（1=表層, 2=中間, 3=深層） */
  depth: 1 | 2 | 3;
  /** 逆転スコアリング */
  invert?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 18 Questions (6 axes × 3 questions)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const EXPANSION_QUESTIONS: ExpansionQuestion[] = [
  // ── energy_rhythm: 静かに充電する ↔ 活発に消費する ──
  {
    id: "exp_energy_rhythm_1",
    axisId: "energy_rhythm",
    questionText: "休日に予定がない日、あなたはどう過ごしますか？",
    leftLabel: "静かに一人で充電する",
    rightLabel: "外に出て刺激を求める",
    scale: 5,
    angle: "self_reflection",
    depth: 1,
  },
  {
    id: "exp_energy_rhythm_2",
    axisId: "energy_rhythm",
    questionText: "忙しい1週間の後、エネルギーを回復するために何をしますか？",
    leftLabel: "誰にも会わず静かに過ごす",
    rightLabel: "人と会って発散する",
    scale: 5,
    angle: "past_recall",
    depth: 2,
  },
  {
    id: "exp_energy_rhythm_3",
    axisId: "energy_rhythm",
    questionText: "もし毎日のエネルギー配分を自由に設計できるなら？",
    leftLabel: "少量を大切に使う",
    rightLabel: "大量に使い切る",
    scale: 5,
    angle: "hypothetical",
    depth: 3,
  },

  // ── conflict_style: 距離を取って守る ↔ 正面から向き合う ──
  {
    id: "exp_conflict_style_1",
    axisId: "conflict_style",
    questionText: "友人と意見が食い違ったとき、あなたはどうしますか？",
    leftLabel: "しばらく距離を置く",
    rightLabel: "その場で話し合う",
    scale: 5,
    angle: "self_reflection",
    depth: 1,
  },
  {
    id: "exp_conflict_style_2",
    axisId: "conflict_style",
    questionText: "職場でチームメンバーの対応に不満を感じたとき、どうしますか？",
    leftLabel: "自分の中で処理する",
    rightLabel: "率直に伝える",
    scale: 5,
    angle: "scenario",
    depth: 2,
  },
  {
    id: "exp_conflict_style_3",
    axisId: "conflict_style",
    questionText: "大切な人との間に溝を感じたとき、あなたの最初の反応は？",
    leftLabel: "一人で考えて整理する",
    rightLabel: "相手と直接向き合う",
    scale: 5,
    angle: "past_recall",
    depth: 3,
  },

  // ── novelty_threshold: 慣れた範囲が安心 ↔ 未知の領域も平気 ──
  {
    id: "exp_novelty_threshold_1",
    axisId: "novelty_threshold",
    questionText: "旅行先で、行ったことのない場所と好きな場所のどちらを選びますか？",
    leftLabel: "気に入った場所をリピート",
    rightLabel: "行ったことのない場所を開拓",
    scale: 5,
    angle: "self_reflection",
    depth: 1,
  },
  {
    id: "exp_novelty_threshold_2",
    axisId: "novelty_threshold",
    questionText: "「やったことがない」ことへの誘いを受けたとき、最初に感じるのは？",
    leftLabel: "不安や警戒",
    rightLabel: "ワクワクや好奇心",
    scale: 5,
    angle: "scenario",
    depth: 2,
  },
  {
    id: "exp_novelty_threshold_3",
    axisId: "novelty_threshold",
    questionText: "生活のルーティンが崩れたとき、あなたの心はどう動きますか？",
    leftLabel: "早く元に戻したい",
    rightLabel: "新しい流れに乗ってみる",
    scale: 5,
    angle: "past_recall",
    depth: 3,
  },

  // ── self_disclosure_depth: 核心は見せない ↔ 深くまで開く ──
  {
    id: "exp_self_disclosure_depth_1",
    axisId: "self_disclosure_depth",
    questionText: "初めて会う人と話すとき、自分のことをどこまで話しますか？",
    leftLabel: "表面的な話にとどめる",
    rightLabel: "わりと深い話もする",
    scale: 5,
    angle: "self_reflection",
    depth: 1,
  },
  {
    id: "exp_self_disclosure_depth_2",
    axisId: "self_disclosure_depth",
    questionText: "信頼している友人に、自分の弱さや不安を見せることは？",
    leftLabel: "なるべく避ける",
    rightLabel: "自然にできる",
    scale: 5,
    angle: "self_reflection",
    depth: 2,
  },
  {
    id: "exp_self_disclosure_depth_3",
    axisId: "self_disclosure_depth",
    questionText: "「本当の自分」を誰かに完全に理解されることについて、どう感じますか？",
    leftLabel: "怖さや抵抗を感じる",
    rightLabel: "安心感を覚える",
    scale: 5,
    angle: "hypothetical",
    depth: 3,
  },

  // ── decision_regret: 決めたら振り返らない ↔ 決めた後も考え続ける ──
  {
    id: "exp_decision_regret_1",
    axisId: "decision_regret",
    questionText: "大きな買い物をした後、あなたはどうなりますか？",
    leftLabel: "すぐに忘れて次に進む",
    rightLabel: "他の選択肢を調べ直す",
    scale: 5,
    angle: "self_reflection",
    depth: 1,
  },
  {
    id: "exp_decision_regret_2",
    axisId: "decision_regret",
    questionText: "人生の分岐点での選択を、後から思い出すことはありますか？",
    leftLabel: "ほとんど振り返らない",
    rightLabel: "何度も反芻する",
    scale: 5,
    angle: "past_recall",
    depth: 2,
  },
  {
    id: "exp_decision_regret_3",
    axisId: "decision_regret",
    questionText: "「あのとき別の道を選んでいたら」と考えるとき、その感情は？",
    leftLabel: "軽い好奇心程度",
    rightLabel: "深い感情を伴う",
    scale: 5,
    angle: "hypothetical",
    depth: 3,
  },

  // ── relational_investment: 広く薄くつながる ↔ 狭く深くつながる ──
  {
    id: "exp_relational_investment_1",
    axisId: "relational_investment",
    questionText: "友人関係で、あなたが自然に感じるスタイルは？",
    leftLabel: "多くの人と軽くつながる",
    rightLabel: "少数の人と深く関わる",
    scale: 5,
    angle: "self_reflection",
    depth: 1,
  },
  {
    id: "exp_relational_investment_2",
    axisId: "relational_investment",
    questionText: "新しい人間関係が増えるとき、あなたはどう感じますか？",
    leftLabel: "嬉しい、もっと広げたい",
    rightLabel: "今の関係を大切にしたい",
    scale: 5,
    angle: "scenario",
    depth: 2,
    invert: true,
  },
  {
    id: "exp_relational_investment_3",
    axisId: "relational_investment",
    questionText: "もし関係を1つだけ深められるとしたら、どんな関係を選びますか？",
    leftLabel: "新しい可能性のある関係",
    rightLabel: "すでに築いた信頼のある関係",
    scale: 5,
    angle: "hypothetical",
    depth: 3,
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 軸IDで質問を取得 */
export function getExpansionQuestionsForAxis(
  axisId: TraitAxisKey,
): ExpansionQuestion[] {
  return EXPANSION_QUESTIONS.filter((q) => q.axisId === axisId);
}

/** IDで質問を取得 */
export function getExpansionQuestionById(
  id: string,
): ExpansionQuestion | undefined {
  return EXPANSION_QUESTIONS.find((q) => q.id === id);
}

/** 全拡張軸IDのセット */
export const EXPANSION_QUESTION_AXIS_IDS = new Set(
  EXPANSION_QUESTIONS.map((q) => q.axisId),
);
