// revealGenerator.ts
// マイクロ・リヴィールの動的メッセージ生成
// 途中のaxisスコアから、段階的に深くなるインサイトを生成
// + アーキタイプのほのめかし（40問目以降）

import { calculateAxisScores, type QuestionAnswer } from "@/lib/stargazer/typeResolver";
import type { RevealPhase } from "./MicroRevealCard";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";
import {
  COGNITION_DEFS,
  EMOTION_DEFS,
  ARCHETYPE_DEFS,
  type ArchetypeCode,
  type CognitionCode,
  type EmotionCode,
} from "@/lib/stargazer/archetypeTypes";

// ── 軸スコアから傾向を読む ──

interface AxisTendency {
  key: string;
  value: number; // -1 to +1 or 1 to 5
  label: string;
}

function getTopTendencies(answers: QuestionAnswer[]): AxisTendency[] {
  // 回答の平均値を計算（3が中立、<3で左寄り、>3で右寄り）
  if (answers.length === 0) return [];

  const avgValue = answers.reduce((s, a) => s + a.value, 0) / answers.length;
  const recentAnswers = answers.slice(-5);
  const recentAvg = recentAnswers.reduce((s, a) => s + a.value, 0) / recentAnswers.length;

  const tendencies: AxisTendency[] = [];

  // 全体傾向
  if (avgValue < 2.5) {
    tendencies.push({ key: "overall", value: avgValue, label: "慎重で内向的" });
  } else if (avgValue > 3.5) {
    tendencies.push({ key: "overall", value: avgValue, label: "積極的で外向的" });
  }

  // 直近の傾向変化
  if (Math.abs(recentAvg - avgValue) > 0.5) {
    tendencies.push({
      key: "drift",
      value: recentAvg - avgValue,
      label: recentAvg > avgValue ? "最近の回答が積極的に変化" : "最近の回答が慎重に変化",
    });
  }

  // 速度傾向
  const avgTime = answers.reduce((s, a) => s + (a.responseTimeMs ?? 5000), 0) / answers.length;
  if (avgTime < 3000) {
    tendencies.push({ key: "speed", value: avgTime, label: "直感的な判断が多い" });
  } else if (avgTime > 8000) {
    tendencies.push({ key: "speed", value: avgTime, label: "熟考型の判断パターン" });
  }

  return tendencies;
}

// ── 矛盾の検出 ──

function findContradiction(answers: QuestionAnswer[]): string | null {
  if (answers.length < 10) return null;

  // 前半と後半で同じカテゴリの質問を比較
  const firstHalf = answers.slice(0, Math.floor(answers.length / 2));
  const secondHalf = answers.slice(Math.floor(answers.length / 2));

  const firstAvg = firstHalf.reduce((s, a) => s + a.value, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((s, a) => s + a.value, 0) / secondHalf.length;

  if (Math.abs(firstAvg - secondAvg) > 0.8) {
    if (secondAvg > firstAvg) {
      return "前半では慎重だったのに、後半になるほど大胆な選択が増えています — 場が温まると本音が出るタイプかもしれません";
    } else {
      return "前半は積極的でしたが、後半で慎重になっています — 深い質問ほど本来の自分に近づいている可能性があります";
    }
  }

  // 極端な回答（1 or 5）の後にすぐ逆方向の極端な回答
  for (let i = 1; i < answers.length; i++) {
    const prev = answers[i - 1].value;
    const curr = answers[i].value;
    if ((prev <= 1 && curr >= 5) || (prev >= 5 && curr <= 1)) {
      return "直前の質問と正反対の回答をしました。この揺れ自体が、あなたの中にある二面性を映しています";
    }
  }

  return null;
}

// ── リヴィールフェーズの決定 ──

export function getRevealPhase(answeredCount: number, totalQuestions: number): RevealPhase {
  const ratio = answeredCount / totalQuestions;
  if (ratio < 0.25) return "surface";
  if (ratio < 0.5) return "pattern";
  if (ratio < 0.75) return "contradiction";
  return "core";
}

// ── メインのリヴィール生成 ──

export interface RevealContent {
  message: string;
  phase: RevealPhase;
  archetypeHint: string | null;
}

export function generateReveal(
  answers: QuestionAnswer[],
  totalQuestions: number
): RevealContent {
  const phase = getRevealPhase(answers.length, totalQuestions);
  const tendencies = getTopTendencies(answers);
  const contradiction = findContradiction(answers);

  let message: string;

  switch (phase) {
    case "surface": {
      // 仮説・ふんわり
      const t = tendencies[0];
      if (t) {
        message = `あなたは${t.label}傾向があるようです`;
      } else {
        message = "あなたの傾向の輪郭が見え始めています";
      }
      break;
    }
    case "pattern": {
      // 確信・パターン発見
      const speedT = tendencies.find((t) => t.key === "speed");
      const overallT = tendencies.find((t) => t.key === "overall");
      if (speedT && overallT) {
        message = `判断の軸が見えてきました。あなたは${speedT.label}で、${overallT.label}な選択をする傾向があります`;
      } else if (overallT) {
        message = `パターンが浮かび上がっています — あなたの判断の軸は${overallT.label}方向にあるようです`;
      } else {
        message = "あなたの判断パターンが明確になってきました。一貫した軸が見えています";
      }
      break;
    }
    case "contradiction": {
      // 矛盾指摘
      if (contradiction) {
        message = contradiction;
      } else {
        const driftT = tendencies.find((t) => t.key === "drift");
        if (driftT) {
          message = `興味深い変化が。${driftT.label} — 質問が深くなるほど、あなたの別の面が見えてきます`;
        } else {
          message = "あなたの回答は驚くほど一貫しています。これ自体が強い信号です — 自分の軸が明確な人です";
        }
      }
      break;
    }
    case "core": {
      // 核心到達
      const avgValue = answers.reduce((s, a) => s + a.value, 0) / answers.length;
      const avgTime = answers.reduce((s, a) => s + (a.responseTimeMs ?? 5000), 0) / answers.length;
      const fastRatio = answers.filter((a) => (a.responseTimeMs ?? 5000) < 3000).length / answers.length;

      if (fastRatio > 0.6) {
        message = "あなたの深層パターンが見えました。直感を信じる力が強く、それが判断の速さに表れています。この速さは自信の表れです";
      } else if (avgValue < 2.3) {
        message = "核心に到達しました。あなたは内省と慎重さを強く持つ人です。外からは静かに見えますが、内側では常に深い思考が動いています";
      } else if (avgValue > 3.7) {
        message = "核心に到達しました。あなたは行動と表現を通じて自分を証明する人です。動くことで考える — それがあなたの本質です";
      } else {
        message = "核心に到達しました。あなたはバランスを取る力が強い人です。極端に振れないのは優柔不断ではなく、状況を見極める知性です";
      }
      break;
    }
  }

  // アーキタイプのほのめかし（進行度40%以降）
  const ratio = answers.length / totalQuestions;
  let archetypeHint: string | null = null;

  if (ratio >= 0.85) {
    // ほぼ確実
    const guess = guessArchetype(answers);
    if (guess) {
      const def = ARCHETYPE_DEFS.find((d) => d.code === guess);
      if (def) {
        archetypeHint = `ほぼ確実に — あなたは ${def.emoji} ${def.name}。ただし最後の観測で覆る可能性も…`;
      }
    }
  } else if (ratio >= 0.7) {
    // 候補2つ
    const guess = guessArchetype(answers);
    if (guess) {
      const def = ARCHETYPE_DEFS.find((d) => d.code === guess);
      const shadowDef = def ? ARCHETYPE_DEFS.find((d) => d.code === def.shadowCode) : null;
      if (def && shadowDef) {
        archetypeHint = `候補が2つに絞られました: ${def.emoji} ${def.name} と ${shadowDef.emoji} ${shadowDef.name}`;
      }
    }
  } else if (ratio >= 0.5) {
    // Layer1 + Layer2 ヒント
    const l1 = guessLayer1(answers);
    const l2 = guessLayer2(answers);
    if (l1 && l2) {
      archetypeHint = `あなたの傾向: ${COGNITION_DEFS[l1].label}を軸に、${EMOTION_DEFS[l2].label}タイプ`;
    }
  } else if (ratio >= 0.4) {
    // Layer1 だけ
    const l1 = guessLayer1(answers);
    if (l1) {
      archetypeHint = `あなたの傾向が見え始めました: ${COGNITION_DEFS[l1].label}`;
    }
  }

  return { message, phase, archetypeHint };
}

// ── アーキタイプ推定（正規パイプライン使用） ──
// 回答から軸スコアを計算し、正規のresolveArchetypeで判定する
// 簡易ヒューリスティックは排除 — 常に実際のスコアリングロジックと整合させる

function guessLayer1(answers: QuestionAnswer[]): CognitionCode | null {
  if (answers.length < 5) return null;
  try {
    const axisScores = calculateAxisScores(answers);
    const result = resolveArchetype(axisScores);
    return result.layer1.code;
  } catch {
    return null;
  }
}

function guessLayer2(answers: QuestionAnswer[]): EmotionCode | null {
  if (answers.length < 10) return null;
  try {
    const axisScores = calculateAxisScores(answers);
    const result = resolveArchetype(axisScores);
    return result.layer2.code;
  } catch {
    return null;
  }
}

function guessArchetype(answers: QuestionAnswer[]): ArchetypeCode | null {
  if (answers.length < 15) return null; // 最低15問ないと推定精度が低すぎる
  try {
    const axisScores = calculateAxisScores(answers);
    const result = resolveArchetype(axisScores);
    // confidence が低すぎる場合はnullを返す（「まだわからない」の方がブレより良い）
    if (result.confidence < 0.15) return null;
    return result.code;
  } catch {
    return null;
  }
}

// ── 鏡の問い用プロファイル生成 ──

export function generateMirrorProfile(answers: QuestionAnswer[]): string {
  const avg = answers.reduce((s, a) => s + a.value, 0) / answers.length;
  const avgTime = answers.reduce((s, a) => s + (a.responseTimeMs ?? 5000), 0) / answers.length;
  const fastRatio = answers.filter((a) => (a.responseTimeMs ?? 5000) < 3000).length / answers.length;
  const extremeRatio = answers.filter((a) => a.value === 1 || a.value === 5).length / answers.length;

  const traits: string[] = [];

  if (avg < 2.5) {
    traits.push("内省的で慎重");
  } else if (avg > 3.5) {
    traits.push("行動的で積極的");
  } else {
    traits.push("柔軟でバランス感覚がある");
  }

  if (fastRatio > 0.5) {
    traits.push("直感を信頼する");
  } else {
    traits.push("じっくり考えてから判断する");
  }

  if (extremeRatio > 0.4) {
    traits.push("はっきりとした軸を持っている");
  } else if (extremeRatio < 0.15) {
    traits.push("中立的で多角的に見る");
  }

  if (traits.length >= 2) {
    return `${traits[0]}タイプ。${traits[1]}人で、${traits[2] || "独自の判断基準を持つ"}`;
  }

  return "自分の中にしっかりとした判断軸を持ちながら、状況に応じて使い分けられる人";
}

// ── 観測タグの判定 ──

export interface ObservationTag {
  emoji: string;
  label: string;
}

export function getObservationTag(
  answer: QuestionAnswer,
  allAnswers: QuestionAnswer[]
): ObservationTag | null {
  // 極端に速い
  if ((answer.responseTimeMs ?? Infinity) < 1500) {
    return { emoji: "⚡", label: "即断" };
  }

  // 10問連続で速い
  if (allAnswers.length >= 10) {
    const last10 = allAnswers.slice(-10);
    if (last10.every((a) => (a.responseTimeMs ?? 5000) < 4000)) {
      return { emoji: "🌊", label: "フロー状態" };
    }
  }

  // 前の回答と正反対
  if (allAnswers.length >= 2) {
    const prev = allAnswers[allAnswers.length - 2];
    if (
      (prev.value <= 1 && answer.value >= 5) ||
      (prev.value >= 5 && answer.value <= 1)
    ) {
      return { emoji: "🔮", label: "新しい面" };
    }
  }

  // カテゴリ内一貫（直近5問が全て同方向）
  if (allAnswers.length >= 5) {
    const last5 = allAnswers.slice(-5);
    const allLeft = last5.every((a) => a.value <= 2);
    const allRight = last5.every((a) => a.value >= 4);
    if (allLeft || allRight) {
      return { emoji: "→", label: "軸が通っている" };
    }
  }

  return null;
}
