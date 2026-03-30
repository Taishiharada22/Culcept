// lib/stargazer/stressResponseCascade.ts
// ストレス応答カスケード分析 — ストレス下でどの軸がどの順序で退行するか
// 心理学的根拠: Enneagram（ストレスの矢印）、IFS（パーツの活性化順序）、
// Yerkes-Dodson法則（適度なストレスは性能を上げるが、過度なストレスは崩壊させる）

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";

// ── Types ──

export interface StressCascadeStep {
  /** 退行する軸 */
  axis: TraitAxisKey;
  axisLabel: string;
  /** 退行の段階（1=最初に崩れる、2=次に崩れる、3=最後に崩れる） */
  stage: 1 | 2 | 3;
  /** 通常時のスコア */
  normalScore: number;
  /** ストレス下でスコアがどう変化するか（予測） */
  stressDirection: "regress_left" | "regress_right" | "amplify" | "freeze";
  /** 退行の説明 */
  description: string;
  /** 回復のヒント */
  recoveryHint: string;
}

export interface StressCascadeResult {
  /** カスケードの段階 */
  cascade: StressCascadeStep[];
  /** 全体的な説明 */
  summary: string;
  /** ストレス耐性の総合評価 */
  resilienceProfile: string;
  /** 早期警告サイン */
  earlyWarnings: string[];
  /** ストレスの「壁」— 最後まで崩れない軸 */
  lastStanding: {
    axis: TraitAxisKey;
    axisLabel: string;
    description: string;
  } | null;
}

// ── Analysis ──

/** ストレスに対する脆弱性を推定（高いほど脆弱） */
function estimateVulnerability(
  axis: TraitAxisKey,
  score: number,
  allScores: Partial<Record<TraitAxisKey, number>>,
): number {
  const abs = Math.abs(score);

  // 極端なスコアは脆弱（過剰に偏っているとストレスで反転しやすい）
  let vulnerability = abs * 0.4;

  // 感情系の軸は脆弱性が高い
  const def = TRAIT_AXES.find((a) => a.id === axis);
  if (def?.category === "emotional") vulnerability += 0.2;

  // 感情調整が低い場合、全ての軸が脆弱
  const regulation = allScores.emotional_regulation ?? 0;
  if (regulation < -0.3) vulnerability += 0.15;

  // 完璧主義が高い場合、core軸が脆弱
  const perfectionism = allScores.perfectionist_vs_pragmatic ?? 0;
  if (perfectionism < -0.3 && def?.category === "core") vulnerability += 0.1;

  return Math.min(1, vulnerability);
}

/** ストレス下での変化方向を推定 */
function predictStressDirection(
  axis: TraitAxisKey,
  score: number,
  allScores: Partial<Record<TraitAxisKey, number>>,
): StressCascadeStep["stressDirection"] {
  // ストレス下では極端な方向にさらに振れるか、反転するか
  const regulation = allScores.emotional_regulation ?? 0;
  const stressIsolation = allScores.stress_isolation_vs_social ?? 0;

  // 感情調整が低い場合、極端な方向に増幅されやすい
  if (regulation < -0.2 && Math.abs(score) > 0.3) {
    return "amplify";
  }

  // ストレス孤立型は内向方向に退行
  if (stressIsolation < -0.2) {
    // 社交系の軸は「凍結」する（動けなくなる）
    if (
      axis === "social_initiative" ||
      axis === "introvert_vs_extrovert" ||
      axis === "intimacy_pace"
    ) {
      return "freeze";
    }
  }

  // 極端に振れている軸は反対方向に退行する傾向
  if (Math.abs(score) > 0.5) {
    return score > 0 ? "regress_left" : "regress_right";
  }

  return "amplify";
}

function generateStressDescription(
  axis: TraitAxisKey,
  score: number,
  direction: StressCascadeStep["stressDirection"],
  stage: number,
): string {
  const def = TRAIT_AXES.find((a) => a.id === axis);
  if (!def) return "";

  const currentPole = score > 0 ? def.labelRight : def.labelLeft;
  const oppositePole = score > 0 ? def.labelLeft : def.labelRight;
  const stageLabel = stage === 1 ? "最初に" : stage === 2 ? "次に" : "最後に";

  switch (direction) {
    case "regress_left":
    case "regress_right": {
      const targetPole = direction === "regress_left" ? def.labelLeft : def.labelRight;
      return `${stageLabel}崩れるのがここ。普段は「${currentPole}」なあなたが、ストレス下では「${targetPole}」に引きずられる。自分でも「らしくない」と感じる行動が出始める。`;
    }
    case "amplify":
      return `${stageLabel}変化するのがここ。「${currentPole}」の傾向がさらに強まる。普段のあなたの極端版が表に出る。`;
    case "freeze":
      return `${stageLabel}影響を受けるのがここ。この領域が「凍結」する。判断も行動もできなくなり、ただ動けなくなる。`;
  }
}

function generateRecoveryHint(
  axis: TraitAxisKey,
  direction: StressCascadeStep["stressDirection"],
): string {
  const def = TRAIT_AXES.find((a) => a.id === axis);
  if (!def) return "自分のペースで回復する時間を確保する。";

  switch (direction) {
    case "regress_left":
    case "regress_right":
      return `「${def.labelLeft}↔${def.labelRight}」のバランスが崩れていることに気づいたら、それがストレスのサイン。まず気づくだけでいい。`;
    case "amplify":
      return `普段以上に極端になっている自分に気づいたら、意識的に反対側を少しだけ試してみる。小さなバランス調整が大きな回復につながる。`;
    case "freeze":
      return `動けなくなったら、それを「ダメな自分」と判断しない。凍結は脳が安全を確保するための防御反応。まず身体を動かす（散歩、ストレッチ）ことで凍結が解ける。`;
  }
}

/**
 * 軸スコアからストレス応答カスケードを分析する
 */
export function analyzeStressCascade(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): StressCascadeResult | null {
  const entries = Object.entries(axisScores) as [TraitAxisKey, number][];
  if (entries.length < 5) return null;

  // 脆弱性スコアを計算
  const vulnerabilities = entries
    .filter(([, s]) => s !== undefined)
    .map(([axis, score]) => ({
      axis,
      score,
      vulnerability: estimateVulnerability(axis, score, axisScores),
    }))
    .sort((a, b) => b.vulnerability - a.vulnerability);

  if (vulnerabilities.length < 3) return null;

  // カスケードの段階を構築
  const cascade: StressCascadeStep[] = [];

  for (let i = 0; i < Math.min(3, vulnerabilities.length); i++) {
    const { axis, score } = vulnerabilities[i];
    const def = TRAIT_AXES.find((a) => a.id === axis);
    const stage = (i + 1) as 1 | 2 | 3;
    const direction = predictStressDirection(axis, score, axisScores);

    cascade.push({
      axis,
      axisLabel: def ? `${def.labelLeft} ↔ ${def.labelRight}` : axis,
      stage,
      normalScore: score,
      stressDirection: direction,
      description: generateStressDescription(axis, score, direction, stage),
      recoveryHint: generateRecoveryHint(axis, direction),
    });
  }

  // 最後まで崩れない軸（脆弱性が最も低い）
  const strongest = vulnerabilities[vulnerabilities.length - 1];
  const strongDef = TRAIT_AXES.find((a) => a.id === strongest.axis);
  const lastStanding = strongDef
    ? {
        axis: strongest.axis,
        axisLabel: `${strongDef.labelLeft} ↔ ${strongDef.labelRight}`,
        description: `どんなにストレスがかかっても、ここだけは崩れない。「${strongest.score > 0 ? strongDef.labelRight : strongDef.labelLeft}」——これがあなたの最後の砦。全てが崩れた時、ここに立ち返ればいい。`,
      }
    : null;

  // 早期警告サイン
  const earlyWarnings: string[] = [];
  if (cascade[0]) {
    const firstDef = TRAIT_AXES.find((a) => a.id === cascade[0].axis);
    if (firstDef) {
      earlyWarnings.push(
        `「${firstDef.labelLeft}↔${firstDef.labelRight}」でいつもと違う判断をし始めたら、ストレスが溜まっているサイン`,
      );
    }
  }
  const regulation = axisScores.emotional_regulation ?? 0;
  if (regulation < -0.2) {
    earlyWarnings.push("感情の波が普段より大きくなったら、回復の時間を意識的に取る");
  }
  const stressStyle = axisScores.stress_isolation_vs_social ?? 0;
  if (stressStyle < -0.2) {
    earlyWarnings.push("「誰にも会いたくない」と感じ始めたら、まだ余裕があるうちに信頼できる人に声をかける");
  } else if (stressStyle > 0.2) {
    earlyWarnings.push("「ずっと誰かと一緒にいたい」と感じ始めたら、少しだけ一人の時間を作ってみる");
  }

  // レジリエンスプロファイル
  const avgVulnerability =
    vulnerabilities.reduce((s, v) => s + v.vulnerability, 0) / vulnerabilities.length;
  let resilienceProfile: string;
  if (avgVulnerability < 0.25) {
    resilienceProfile = "ストレス耐性が高い。多くの軸が安定しており、崩れにくい構造を持っている。ただし「崩れない」ことと「ストレスを感じていない」ことは別。内側で何が起きているかにも目を向ける。";
  } else if (avgVulnerability < 0.4) {
    resilienceProfile = "バランスの取れたストレス応答。いくつかの脆弱なポイントがあるが、それを知っていること自体が強み。自分の限界を知っている人は、限界の手前で対処できる。";
  } else {
    resilienceProfile = "ストレス下で複数の軸が同時に動きやすい。これは「弱い」のではなく「繊細」ということ。環境の影響を受けやすい分、良い環境では非常に高いパフォーマンスを発揮できる。";
  }

  const summary = `ストレスがかかると、まず「${cascade[0]?.axisLabel ?? ""}」が変化し${cascade[1] ? `、次に「${cascade[1].axisLabel}」が影響を受け` : ""}${cascade[2] ? `、最後に「${cascade[2].axisLabel}」まで到達する` : ""}。この順序を知っておくことで、早期に自分のストレス状態に気づける。`;

  return {
    cascade,
    summary,
    resilienceProfile,
    earlyWarnings,
    lastStanding,
  };
}
