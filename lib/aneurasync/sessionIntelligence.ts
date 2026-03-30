// lib/aneurasync/sessionIntelligence.ts
// セッション内知性エンジン: 回答の文脈を読み、矛盾を検出し、途中洞察を生成する

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

export interface SessionAnswer {
  questionId: string;
  category: string;
  robotLine: string;       // The question text
  answerLabel: string;     // What the user chose
  value: number;           // 1-5 score
  responseTimeMs: number;
  axisMapping?: { axis: TraitAxisKey; delta: number }[];
}

export interface SessionContradiction {
  /** 矛盾する2つの回答 */
  answerA: { robotLine: string; answerLabel: string; value: number };
  answerB: { robotLine: string; answerLabel: string; value: number };
  /** 矛盾の解釈 */
  insight: string;
  /** 関連する軸 */
  axis?: TraitAxisKey;
}

export interface MidSessionInsight {
  /** ロボットが途中で言う洞察 */
  text: string;
  /** トリガーの種類 */
  trigger: "contradiction" | "pattern" | "energy_shift" | "consistency";
}

export interface ContextualReactionOverride {
  /** テンプレート反応を上書きする文脈的反応 */
  reaction: string;
  /** なぜこの反応が生成されたか */
  reason: string;
}

/* ═══════════════════════════════════════════════
   Session Memory — tracks answers within session
   ═══════════════════════════════════════════════ */

const sessionMemory: SessionAnswer[] = [];

export function recordSessionAnswer(answer: SessionAnswer): void {
  sessionMemory.push(answer);
}

export function getSessionMemory(): SessionAnswer[] {
  return [...sessionMemory];
}

export function clearSessionMemory(): void {
  sessionMemory.length = 0;
}

/* ═══════════════════════════════════════════════
   1. Contextual Reaction — 前の回答を踏まえた反応
   今の回答だけでなく、セッション全体の流れで反応する
   ═══════════════════════════════════════════════ */

export function generateContextualReaction(
  currentAnswer: SessionAnswer,
  templateReaction: string,
): ContextualReactionOverride | null {
  const memory = getSessionMemory();
  if (memory.length < 2) return null; // Need context

  const prev = memory[memory.length - 2]; // Previous answer (current is last)

  // Pattern 1: 感情の急変 — 前の回答がポジティブで今がネガティブ（またはその逆）
  if (prev.value >= 4 && currentAnswer.value <= 2) {
    return {
      reaction: `さっき「${prev.answerLabel}」って答えてくれたのに、ここでは違うんだ。その落差の中に、何かある気がする。`,
      reason: "emotional_shift",
    };
  }
  if (prev.value <= 2 && currentAnswer.value >= 4) {
    return {
      reaction: `さっきは少し重かったけど、ここでは明るいね。場面によって、あなたの中のスイッチが切り替わるんだ。`,
      reason: "emotional_recovery",
    };
  }

  // Pattern 2: 同じカテゴリでの一貫性
  const sameCategoryAnswers = memory.filter(a => a.category === currentAnswer.category);
  if (sameCategoryAnswers.length >= 2) {
    const allHigh = sameCategoryAnswers.every(a => a.value >= 4);
    const allLow = sameCategoryAnswers.every(a => a.value <= 2);
    if (allHigh) {
      return {
        reaction: `この領域、一貫して充実してるね。ここがあなたの安定域かもしれない。`,
        reason: "category_consistency_high",
      };
    }
    if (allLow) {
      return {
        reaction: `ここはずっと重いね。この領域が今、あなたにとって一番エネルギーを使う場所なのかも。`,
        reason: "category_consistency_low",
      };
    }
  }

  // Pattern 3: 全体的な回答速度の変化
  const avgTime = memory.reduce((s, a) => s + a.responseTimeMs, 0) / memory.length;
  if (currentAnswer.responseTimeMs > avgTime * 2 && currentAnswer.responseTimeMs > 4000) {
    return {
      reaction: `${templateReaction} …ここは他の質問より時間がかかったね。触れにくいテーマだった？`,
      reason: "hesitation_spike",
    };
  }
  if (memory.length >= 4 && currentAnswer.responseTimeMs < avgTime * 0.4) {
    return {
      reaction: `${templateReaction} 即答だった。この判断は、あなたの中でもう固まってるんだね。`,
      reason: "instant_certainty",
    };
  }

  return null;
}

/* ═══════════════════════════════════════════════
   2. Contradiction Detection — 矛盾検出
   セッション内の回答から矛盾するペアを見つける
   ═══════════════════════════════════════════════ */

// Contradiction rules: category pairs that conflict at extreme values
const CONTRADICTION_RULES: {
  categoryA: string;
  highA: boolean;  // true = value >= 4
  categoryB: string;
  highB: boolean;
  insight: string;
}[] = [
  {
    categoryA: "outfit",
    highA: true,     // コーデに自信がある
    categoryB: "impression",
    highB: false,    // 人前では不安
    insight: "見た目には自信があるのに、それが人前での安心に繋がっていない。外見と内面の自信は、別物なのかもしれない。",
  },
  {
    categoryA: "partner",
    highA: true,     // 人との関わりは良い
    categoryB: "care",
    highB: false,    // 自分のケアはできていない
    insight: "人との時間は充実してるのに、自分自身のケアは後回しにしてる。他人のために自分を消耗してない？",
  },
  {
    categoryA: "preparation",
    highA: true,     // 準備はしっかりしている
    categoryB: "impression",
    highB: false,    // でも結果に満足していない
    insight: "準備はしてるのに、結果に納得できていない。準備の方向が、本当に自分の求めるものとズレているのかも。",
  },
  {
    categoryA: "care",
    highA: true,     // 自分のケアはできている
    categoryB: "partner",
    highB: false,    // でも人との関わりは辛い
    insight: "自分を整える力はあるのに、人との場面でそれが発揮できない。一人の自分と、誰かといる自分の間にギャップがある。",
  },
  {
    categoryA: "outfit",
    highA: false,    // コーデに無関心
    categoryB: "impression",
    highB: true,     // でも印象は気になる
    insight: "見た目にはこだわらないのに、人からの印象は気になる。本当は「どう見られているか」を意識してるんだね。",
  },
];

export function detectContradictions(): SessionContradiction[] {
  const memory = getSessionMemory();
  if (memory.length < 3) return [];

  const contradictions: SessionContradiction[] = [];

  for (const rule of CONTRADICTION_RULES) {
    const answerA = memory.find(
      a => a.category === rule.categoryA && (rule.highA ? a.value >= 4 : a.value <= 2)
    );
    const answerB = memory.find(
      a => a.category === rule.categoryB && (rule.highB ? a.value >= 4 : a.value <= 2)
    );

    if (answerA && answerB) {
      contradictions.push({
        answerA: { robotLine: answerA.robotLine, answerLabel: answerA.answerLabel, value: answerA.value },
        answerB: { robotLine: answerB.robotLine, answerLabel: answerB.answerLabel, value: answerB.value },
        insight: rule.insight,
      });
    }
  }

  return contradictions;
}

/* ═══════════════════════════════════════════════
   3. Mid-Session Insight — セッション途中の気づき
   5問ごとにチェックし、気づきがあれば返す
   ═══════════════════════════════════════════════ */

export function checkMidSessionInsight(totalAnswered: number): MidSessionInsight | null {
  // Only trigger at specific intervals
  if (totalAnswered < 4 || totalAnswered % 3 !== 0) return null;

  const memory = getSessionMemory();
  if (memory.length < 3) return null;

  // Check 1: Contradiction detected
  const contradictions = detectContradictions();
  if (contradictions.length > 0) {
    const c = contradictions[0];
    return {
      text: `ちょっと待って。「${c.answerA.answerLabel}」と「${c.answerB.answerLabel}」の間に、面白い矛盾がある。${c.insight}`,
      trigger: "contradiction",
    };
  }

  // Check 2: Energy shift — response times getting longer (fatigue)
  if (memory.length >= 6) {
    const firstHalf = memory.slice(0, Math.floor(memory.length / 2));
    const secondHalf = memory.slice(Math.floor(memory.length / 2));
    const avgFirst = firstHalf.reduce((s, a) => s + a.responseTimeMs, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, a) => s + a.responseTimeMs, 0) / secondHalf.length;

    if (avgSecond > avgFirst * 1.5 && avgSecond > 4000) {
      return {
        text: "少し疲れてきた？答えるのに時間がかかり始めてる。無理しないでね。でも、疲れた時の答えの方が、本音に近いことがある。",
        trigger: "energy_shift",
      };
    }
  }

  // Check 3: All answers very consistent (everything 3-4)
  const allMiddle = memory.every(a => a.value >= 3 && a.value <= 4);
  if (allMiddle && memory.length >= 5) {
    return {
      text: "全体的にバランスが取れてるね。…でも、極端な答えがないのは、まだ本当の気持ちを隠してる可能性もある。次の質問、もう少し踏み込んでいい？",
      trigger: "consistency",
    };
  }

  // Check 4: Pattern — same category keeps showing up with low scores
  const categoryScores = new Map<string, number[]>();
  for (const a of memory) {
    const scores = categoryScores.get(a.category) ?? [];
    scores.push(a.value);
    categoryScores.set(a.category, scores);
  }
  for (const [cat, scores] of categoryScores) {
    if (scores.length >= 2 && scores.every(s => s <= 2)) {
      const categoryNames: Record<string, string> = {
        partner: "人との関わり",
        outfit: "見た目・コーデ",
        care: "自分のケア",
        preparation: "準備・段取り",
        impression: "印象・振り返り",
      };
      const name = categoryNames[cat] ?? cat;
      return {
        text: `「${name}」のスコアがずっと低い。今、ここが一番重い場所なんだね。もう少し聞かせて。`,
        trigger: "pattern",
      };
    }
  }

  return null;
}

/* ═══════════════════════════════════════════════
   4. Past Comparison — 過去との比較
   同じ質問に対する過去の回答との差分を検出
   ═══════════════════════════════════════════════ */

export interface PastComparison {
  questionId: string;
  pastValue: number;
  pastLabel: string;
  currentValue: number;
  daysDiff: number;
  insight: string;
}

export function compareToPast(
  currentAnswer: SessionAnswer,
  pastObservations: { date: string; answers: { theme: string; value: number }[] }[],
): PastComparison | null {
  // 1. Look for the exact same question in past observations
  for (let i = pastObservations.length - 1; i >= 0; i--) {
    const obs = pastObservations[i];
    const pastAnswer = obs.answers.find(a => a.theme === currentAnswer.questionId);
    if (!pastAnswer) continue;

    const daysDiff = Math.round(
      (new Date().getTime() - new Date(obs.date).getTime()) / 86400000
    );

    if (daysDiff < 1) continue; // Same day, skip

    const diff = currentAnswer.value - pastAnswer.value;
    if (Math.abs(diff) < 2) continue; // Not significant enough

    const daysLabel = daysDiff === 1 ? "昨日" : `${daysDiff}日前`;

    let insight: string;
    if (diff > 0) {
      insight = `${daysLabel}の同じ質問には低い答えだったのに、今日は上がってる。何が変わった？`;
    } else {
      insight = `${daysLabel}は良い答えだったのに、今日は下がってる。この間に何かあった？`;
    }

    return {
      questionId: currentAnswer.questionId,
      pastValue: pastAnswer.value,
      pastLabel: `${pastAnswer.value}`,
      currentValue: currentAnswer.value,
      daysDiff,
      insight,
    };
  }

  // 2. Fallback: look for same-category questions (cat_partner_xxx matches other cat_partner_yyy)
  const currentCat = extractCategory(currentAnswer.questionId);
  if (!currentCat) return null;

  for (let i = pastObservations.length - 1; i >= 0; i--) {
    const obs = pastObservations[i];
    // Find answers in the same category
    const sameCatAnswers = obs.answers.filter(a => extractCategory(a.theme) === currentCat);
    if (sameCatAnswers.length === 0) continue;

    const daysDiff = Math.round(
      (new Date().getTime() - new Date(obs.date).getTime()) / 86400000
    );
    if (daysDiff < 2) continue; // Need at least 2 days gap for category comparison

    // Use average of same-category answers from that day
    const pastAvg = sameCatAnswers.reduce((s, a) => s + a.value, 0) / sameCatAnswers.length;
    const diff = currentAnswer.value - pastAvg;
    if (Math.abs(diff) < 1.5) continue;

    const catNames: Record<string, string> = {
      partner: "人との関わり",
      outfit: "見た目",
      care: "ケア",
      preparation: "準備",
      impression: "印象",
    };
    const catLabel = catNames[currentCat] ?? currentCat;
    const daysLabel = daysDiff === 1 ? "昨日" : `${daysDiff}日前`;

    let insight: string;
    if (diff > 0) {
      insight = `${daysLabel}の「${catLabel}」系は低かったのに、今日は上向き。流れが変わってきてる？`;
    } else {
      insight = `${daysLabel}の「${catLabel}」系は良かったのに、今日は少し重い。何か引っかかることがある？`;
    }

    return {
      questionId: currentAnswer.questionId,
      pastValue: Math.round(pastAvg),
      pastLabel: `${Math.round(pastAvg)}`,
      currentValue: currentAnswer.value,
      daysDiff,
      insight,
    };
  }

  return null;
}

/** Extract category from question ID (cat_partner_xxx → partner) */
function extractCategory(theme: string): string | null {
  if (theme.startsWith("cat_")) {
    const parts = theme.slice(4).split("_");
    return parts[0] ?? null;
  }
  return null;
}
