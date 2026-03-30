// lib/stargazer/reactionPatternEngine.ts
// 反応パターン言い当てエンジン — ユーザーの軸データ・矛盾マップ・三面鏡のズレから
// 「その人にしか当てはまらない」反応パターンの言い当て文章を生成する
//
// 設計思想:
// - LLM 呼び出しなし。テンプレートリテラル + 具体的データポイントで個人化
// - 「占いっぽい汎用文」を排除し、必ず軸スコア・ギャップ値等に基づく記述
// - 6 カテゴリの検出ロジックそれぞれが独立した候補を生成し、
//   最終的に confidence × novelty でランキング
//
// 参考:
// - Higgins (1987) — Self-discrepancy theory (理想自己と現実自己のギャップ)
// - Nisbett & Wilson (1977) — 内省の限界
// - Greenwald & Banaji (1995) — 暗黙態度と明示態度の乖離

import { TRAIT_AXES, type TraitAxisKey } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 型定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type PatternCategory =
  | "self_deception"   // 自己欺瞞（自己イメージと実際のギャップ）
  | "hidden_trigger"   // 隠れたトリガー（本人が気づいていない反応の引き金）
  | "defense_pattern"  // 防衛パターン（無意識の防衛行動）
  | "contradiction"    // 矛盾（言動の不一致）
  | "blind_spot"       // 盲点（三面鏡のズレ）
  | "cycle";           // 繰り返しサイクル（同じパターンの反復）

export interface PatternEvidence {
  primaryAxes: { axis: string; score: number; label: string }[];
  contradictionPair?: { axis1: string; axis2: string; tension: number };
  mirrorGap?: { axis: string; selfScore: number; footprintScore: number; gap: number };
  responseTimeAnomaly?: { axis: string; avgTime: number; anomalyTime: number };
}

export interface ReactionPattern {
  id: string;
  category: PatternCategory;
  /** どんな場面で */
  situation: string;
  /** どう反応するか */
  reaction: string;
  /** 本人が気づいていない理由 */
  hiddenReason: string;
  /** 本人はこう思っている */
  selfImage: string;
  /** 根拠データ */
  evidence: PatternEvidence;
  /** 0-1 */
  confidence: number;
  /** 0-1（既出パターンとの差分） */
  novelty: number;
}

export interface ReactionPatternInput {
  axisScores: Record<string, number>;
  axisPrecisions?: Record<string, number>;
  contradictionMap?: Record<
    string,
    {
      mean: number;
      variance: number;
      bimodalityCoeff: number;
      isDual: boolean;
      contradictionStrength: number;
    }
  >;
  mirrorScores?: Record<
    string,
    { selfPortrait: number; footprint: number; shadowPlay: number }
  >;
  responseTimeProfile?: Record<string, number>;
  archetypeCode?: string;
  /** 既出パターンのID（重複回避） */
  recentPatternIds?: string[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 内部ユーティリティ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 軸 ID からラベル (left/right) を取得 */
function getLabels(axisId: string): { left: string; right: string } | null {
  const def = TRAIT_AXES.find((a) => a.id === axisId);
  return def ? { left: def.labelLeft, right: def.labelRight } : null;
}

/** スコアに基づいてどちら寄りかのラベルを返す */
function scoreSideLabel(axisId: string, score: number): string {
  const labels = getLabels(axisId);
  if (!labels) return axisId;
  return score < 0 ? labels.left : labels.right;
}

/** スコアに基づいて反対側のラベルを返す */
function scoreOppositeSideLabel(axisId: string, score: number): string {
  const labels = getLabels(axisId);
  if (!labels) return axisId;
  return score < 0 ? labels.right : labels.left;
}

/** スコアの強度を日本語で表現 */
function intensityWord(absScore: number): string {
  if (absScore >= 0.8) return "強く";
  if (absScore >= 0.6) return "かなり";
  if (absScore >= 0.4) return "やや";
  return "わずかに";
}

/** 一意なパターン ID を生成 */
function patternId(category: PatternCategory, ...keys: string[]): string {
  return `${category}:${keys.join("+")}`;
}

/** responseTimeProfile からユーザーの平均回答時間を算出 */
function computeAverageResponseTime(
  profile: Record<string, number>,
): number {
  const values = Object.values(profile);
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// カテゴリ別パターン検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1. self_deception — 自己欺瞞パターン
 * 三面鏡の selfPortrait vs footprint のギャップが大きい軸を検出
 */
function detectSelfDeception(input: ReactionPatternInput): ReactionPattern[] {
  const patterns: ReactionPattern[] = [];
  const mirrors = input.mirrorScores;
  if (!mirrors) return patterns;

  const candidates: {
    axis: string;
    gap: number;
    selfScore: number;
    footprintScore: number;
    overEstimate: boolean;
  }[] = [];

  for (const [axis, scores] of Object.entries(mirrors)) {
    const gap = Math.abs(scores.selfPortrait - scores.footprint);
    if (gap > 0.3) {
      candidates.push({
        axis,
        gap,
        selfScore: scores.selfPortrait,
        footprintScore: scores.footprint,
        overEstimate: scores.selfPortrait > scores.footprint,
      });
    }
  }

  // ギャップが大きい順
  candidates.sort((a, b) => b.gap - a.gap);

  for (const c of candidates.slice(0, 2)) {
    const labels = getLabels(c.axis);
    if (!labels) continue;

    const selfSideLabel = scoreSideLabel(c.axis, c.selfScore);
    const actualSideLabel = scoreSideLabel(c.axis, c.footprintScore);
    const gapPct = Math.round(c.gap * 100);

    if (c.overEstimate) {
      // 自分を過大評価
      patterns.push({
        id: patternId("self_deception", c.axis, "overestimate"),
        category: "self_deception",
        situation: `自分の「${selfSideLabel}」な面が試される場面`,
        reaction: `実際の行動は「${actualSideLabel}」寄りになる（ギャップ ${gapPct}%）`,
        hiddenReason: `自己イメージの「${selfSideLabel}」は理想像であり、無意識の行動パターンは${intensityWord(Math.abs(c.footprintScore))}「${actualSideLabel}」を選んでいる`,
        selfImage: `自分は「${selfSideLabel}」な人間だと信じている`,
        evidence: {
          primaryAxes: [
            { axis: c.axis, score: c.selfScore, label: `自画像: ${selfSideLabel}` },
            { axis: c.axis, score: c.footprintScore, label: `足跡: ${actualSideLabel}` },
          ],
          mirrorGap: {
            axis: c.axis,
            selfScore: c.selfScore,
            footprintScore: c.footprintScore,
            gap: c.gap,
          },
        },
        confidence: Math.min(0.95, 0.5 + c.gap * 0.5),
        novelty: 1.0,
      });
    } else {
      // 自分を過小評価
      patterns.push({
        id: patternId("self_deception", c.axis, "underestimate"),
        category: "self_deception",
        situation: `「${actualSideLabel}」が求められる場面`,
        reaction: `周囲が見ているほど自分を「${actualSideLabel}」だと認められず、遠慮してしまう`,
        hiddenReason: `行動データは${intensityWord(Math.abs(c.footprintScore))}「${actualSideLabel}」を示しているのに、自己評価だけが低い。過去の経験が自己認識を歪めている可能性がある`,
        selfImage: `自分はそこまで「${actualSideLabel}」ではないと思っている`,
        evidence: {
          primaryAxes: [
            { axis: c.axis, score: c.selfScore, label: `自画像: ${selfSideLabel}` },
            { axis: c.axis, score: c.footprintScore, label: `足跡: ${actualSideLabel}` },
          ],
          mirrorGap: {
            axis: c.axis,
            selfScore: c.selfScore,
            footprintScore: c.footprintScore,
            gap: c.gap,
          },
        },
        confidence: Math.min(0.95, 0.5 + c.gap * 0.5),
        novelty: 1.0,
      });
    }
  }

  return patterns;
}

/**
 * 2. hidden_trigger — 隠れたトリガーパターン
 * 回答時間が著しく遅い軸を検出（内的葛藤のシグナル）
 */
function detectHiddenTrigger(input: ReactionPatternInput): ReactionPattern[] {
  const patterns: ReactionPattern[] = [];
  const rtProfile = input.responseTimeProfile;
  if (!rtProfile) return patterns;

  const avgTime = computeAverageResponseTime(rtProfile);
  if (avgTime <= 0) return patterns;

  const threshold = avgTime * 1.5;

  const candidates: { axis: string; time: number; ratio: number }[] = [];
  for (const [axis, time] of Object.entries(rtProfile)) {
    if (time > threshold) {
      candidates.push({ axis, time, ratio: time / avgTime });
    }
  }

  // 遅延が大きい順
  candidates.sort((a, b) => b.ratio - a.ratio);

  for (const c of candidates.slice(0, 2)) {
    const labels = getLabels(c.axis);
    if (!labels) continue;

    const score = input.axisScores[c.axis] ?? 0;
    const chosenSide = scoreSideLabel(c.axis, score);
    const rejectedSide = scoreOppositeSideLabel(c.axis, score);
    const ratioStr = c.ratio.toFixed(1);

    patterns.push({
      id: patternId("hidden_trigger", c.axis),
      category: "hidden_trigger",
      situation: `「${labels.left}」か「${labels.right}」かを迫られる場面`,
      reaction: `最終的に「${chosenSide}」を選ぶが、通常の${ratioStr}倍の時間をかけて葛藤する`,
      hiddenReason: `この軸は表面的な選好とは別に、「${rejectedSide}」への未解決の引力がある。回答時間の異常（平均 ${Math.round(avgTime)}ms に対し ${Math.round(c.time)}ms）がそれを裏付けている`,
      selfImage: `自分は迷わず「${chosenSide}」を選ぶタイプだと思っている`,
      evidence: {
        primaryAxes: [
          { axis: c.axis, score, label: chosenSide },
        ],
        responseTimeAnomaly: {
          axis: c.axis,
          avgTime: Math.round(avgTime),
          anomalyTime: Math.round(c.time),
        },
      },
      confidence: Math.min(0.90, 0.4 + (c.ratio - 1.5) * 0.3),
      novelty: 1.0,
    });
  }

  return patterns;
}

/**
 * 3. defense_pattern — 防衛パターン
 * 矛盾マップの中で contradictionStrength > 0.5 のペアを検出
 * ミラーデータがあれば抑圧側を特定する
 */
function detectDefensePattern(input: ReactionPatternInput): ReactionPattern[] {
  const patterns: ReactionPattern[] = [];
  const cMap = input.contradictionMap;
  if (!cMap) return patterns;

  const candidates: {
    axis: string;
    strength: number;
    mean: number;
  }[] = [];

  for (const [axis, stats] of Object.entries(cMap)) {
    if (stats.contradictionStrength > 0.5) {
      candidates.push({ axis, strength: stats.contradictionStrength, mean: stats.mean });
    }
  }

  candidates.sort((a, b) => b.strength - a.strength);

  for (const c of candidates.slice(0, 2)) {
    const labels = getLabels(c.axis);
    if (!labels) continue;

    // ミラーデータがあれば、自画像と足跡で抑圧側を特定
    const mirrors = input.mirrorScores?.[c.axis];
    let suppressedSide: string;
    let expressedSide: string;
    let detail: string;

    if (mirrors && Math.abs(mirrors.selfPortrait - mirrors.footprint) > 0.2) {
      // 自画像が否定しているが足跡が示す側 = 抑圧されている側
      const footprintSide = scoreSideLabel(c.axis, mirrors.footprint);
      const selfSide = scoreSideLabel(c.axis, mirrors.selfPortrait);
      suppressedSide = footprintSide;
      expressedSide = selfSide;
      detail = `自画像は「${selfSide}」を主張するが、足跡は「${footprintSide}」を示している`;
    } else {
      // ミラーなし: 矛盾の強さだけで推定
      suppressedSide = c.mean >= 0 ? labels.left : labels.right;
      expressedSide = c.mean >= 0 ? labels.right : labels.left;
      detail = `矛盾強度 ${Math.round(c.strength * 100)}% — 一方の傾向を意識的に抑え込んでいる可能性`;
    }

    const strengthPct = Math.round(c.strength * 100);

    patterns.push({
      id: patternId("defense_pattern", c.axis),
      category: "defense_pattern",
      situation: `「${suppressedSide}」な自分が出そうになる場面`,
      reaction: `反射的に「${expressedSide}」的な振る舞いで上書きする（矛盾強度 ${strengthPct}%）`,
      hiddenReason: `「${suppressedSide}」側の自分を認めることに抵抗がある。${detail}`,
      selfImage: `自分は一貫して「${expressedSide}」な人間だと思っている`,
      evidence: {
        primaryAxes: [
          { axis: c.axis, score: c.mean, label: `平均: ${scoreSideLabel(c.axis, c.mean)}` },
        ],
        contradictionPair: {
          axis1: c.axis,
          axis2: c.axis,
          tension: c.strength,
        },
        ...(mirrors
          ? {
              mirrorGap: {
                axis: c.axis,
                selfScore: mirrors.selfPortrait,
                footprintScore: mirrors.footprint,
                gap: Math.abs(mirrors.selfPortrait - mirrors.footprint),
              },
            }
          : {}),
      },
      confidence: Math.min(0.95, 0.5 + c.strength * 0.4),
      novelty: 1.0,
    });
  }

  return patterns;
}

/**
 * 4. contradiction — 矛盾パターン
 * bimodalityCoeff が高い（isDual = true）軸を検出
 * 2つの自分が存在するパターンを記述
 */
function detectContradiction(input: ReactionPatternInput): ReactionPattern[] {
  const patterns: ReactionPattern[] = [];
  const cMap = input.contradictionMap;
  if (!cMap) return patterns;

  const candidates: {
    axis: string;
    bc: number;
    mean: number;
    variance: number;
  }[] = [];

  for (const [axis, stats] of Object.entries(cMap)) {
    if (stats.isDual) {
      candidates.push({
        axis,
        bc: stats.bimodalityCoeff,
        mean: stats.mean,
        variance: stats.variance,
      });
    }
  }

  candidates.sort((a, b) => b.bc - a.bc);

  for (const c of candidates.slice(0, 2)) {
    const labels = getLabels(c.axis);
    if (!labels) continue;

    const bcPct = Math.round(c.bc * 100);

    patterns.push({
      id: patternId("contradiction", c.axis),
      category: "contradiction",
      situation: `「${labels.left}」と「${labels.right}」のどちらかを選ぶ場面`,
      reaction: `ある時は「${labels.left}」、別の時は「${labels.right}」と、一貫しない反応を示す（二峰性係数 ${bcPct}%）`,
      hiddenReason: `この軸にはあなたの中に2つの判断基準が共存している。状況・相手・精神状態によって、どちらの自分が前に出るかが切り替わる`,
      selfImage: `自分の中の揺れに気づいていないか、「状況に応じて柔軟に対応している」と解釈している`,
      evidence: {
        primaryAxes: [
          { axis: c.axis, score: c.mean, label: `二面性あり (BC=${bcPct}%)` },
        ],
        contradictionPair: {
          axis1: c.axis,
          axis2: c.axis,
          tension: c.bc,
        },
      },
      confidence: Math.min(0.90, 0.4 + c.bc * 0.5),
      novelty: 1.0,
    });
  }

  return patterns;
}

/**
 * 5. blind_spot — 盲点パターン
 * 三面鏡の3ソース全てがズレている軸を検出
 */
function detectBlindSpot(input: ReactionPatternInput): ReactionPattern[] {
  const patterns: ReactionPattern[] = [];
  const mirrors = input.mirrorScores;
  if (!mirrors) return patterns;

  const candidates: {
    axis: string;
    stdDev: number;
    selfPortrait: number;
    footprint: number;
    shadowPlay: number;
  }[] = [];

  for (const [axis, scores] of Object.entries(mirrors)) {
    const vals = [scores.selfPortrait, scores.footprint, scores.shadowPlay];
    const mean = vals.reduce((a, b) => a + b, 0) / 3;
    const variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / 3;
    const stdDev = Math.sqrt(variance);

    // 標準偏差が 0.25 以上 → 3ソースに有意なズレ
    if (stdDev > 0.25) {
      candidates.push({
        axis,
        stdDev,
        selfPortrait: scores.selfPortrait,
        footprint: scores.footprint,
        shadowPlay: scores.shadowPlay,
      });
    }
  }

  candidates.sort((a, b) => b.stdDev - a.stdDev);

  for (const c of candidates.slice(0, 2)) {
    const labels = getLabels(c.axis);
    if (!labels) continue;

    // 最もズレているペアを特定
    const gaps = [
      { pair: "自画像と足跡", gap: Math.abs(c.selfPortrait - c.footprint) },
      { pair: "自画像と影絵", gap: Math.abs(c.selfPortrait - c.shadowPlay) },
      { pair: "足跡と影絵", gap: Math.abs(c.footprint - c.shadowPlay) },
    ].sort((a, b) => b.gap - a.gap);

    const biggest = gaps[0];
    const stdDevPct = Math.round(c.stdDev * 100);

    // 各ミラーの方向を言語化
    const selfLabel = scoreSideLabel(c.axis, c.selfPortrait);
    const footLabel = scoreSideLabel(c.axis, c.footprint);
    const shadowLabel = scoreSideLabel(c.axis, c.shadowPlay);

    patterns.push({
      id: patternId("blind_spot", c.axis),
      category: "blind_spot",
      situation: `「${labels.left}」か「${labels.right}」かが問われる場面`,
      reaction: `自画像は「${selfLabel}」、行動は「${footLabel}」、投影は「${shadowLabel}」と、3つの鏡が異なる答えを示す（ズレ幅 ${stdDevPct}%）`,
      hiddenReason: `この軸では自己認識・無意識の行動・深層心理がそれぞれ異なる方向を向いている。最大のズレは${biggest.pair}の間にあり、ここに本人が気づいていない自己像の断裂がある`,
      selfImage: `この軸について、自分の立ち位置は明確だと感じている`,
      evidence: {
        primaryAxes: [
          { axis: c.axis, score: c.selfPortrait, label: `自画像: ${selfLabel}` },
          { axis: c.axis, score: c.footprint, label: `足跡: ${footLabel}` },
          { axis: c.axis, score: c.shadowPlay, label: `影絵: ${shadowLabel}` },
        ],
        mirrorGap: {
          axis: c.axis,
          selfScore: c.selfPortrait,
          footprintScore: c.footprint,
          gap: Math.abs(c.selfPortrait - c.footprint),
        },
      },
      confidence: Math.min(0.90, 0.4 + c.stdDev * 1.5),
      novelty: 1.0,
    });
  }

  return patterns;
}

/**
 * 6. cycle — 繰り返しサイクルパターン
 * recentPatternIds に同じ軸のパターンが存在する場合、cycleとして検出
 */
function detectCycle(
  input: ReactionPatternInput,
  freshPatterns: ReactionPattern[],
): ReactionPattern[] {
  const patterns: ReactionPattern[] = [];
  const recent = input.recentPatternIds;
  if (!recent || recent.length === 0) return patterns;

  const recentSet = new Set(recent);

  for (const p of freshPatterns) {
    // 同じIDが既出ならサイクル扱い
    if (recentSet.has(p.id)) {
      // 元のパターンの軸を抽出
      const axisId = p.evidence.primaryAxes[0]?.axis;
      if (!axisId) continue;

      const labels = getLabels(axisId);
      if (!labels) continue;

      patterns.push({
        id: patternId("cycle", p.id),
        category: "cycle",
        situation: p.situation,
        reaction: `前回と同じ反応パターンが再び現れている`,
        hiddenReason: `この「${labels.left} vs ${labels.right}」の葛藤は一時的なものではなく、繰り返し現れる構造的なパターン。一度の気づきでは解消されず、あなたの判断の根底に組み込まれている`,
        selfImage: `前回の気づきで解決したと思っている、もしくはこのパターンに気づいていない`,
        evidence: p.evidence,
        confidence: Math.min(0.95, p.confidence + 0.1),
        novelty: 0.3, // 既出なので novelty は低い
      });
    }
  }

  return patterns;
}

/**
 * 極端値パターン（補助）
 * 軸スコアが |score| > 0.7 の極端な値を検出
 */
function detectExtremeValues(input: ReactionPatternInput): ReactionPattern[] {
  const patterns: ReactionPattern[] = [];

  const candidates: { axis: string; score: number; absScore: number }[] = [];
  for (const [axis, score] of Object.entries(input.axisScores)) {
    const absScore = Math.abs(score);
    if (absScore > 0.7) {
      candidates.push({ axis, score, absScore });
    }
  }

  // 極端な順
  candidates.sort((a, b) => b.absScore - a.absScore);

  // 極端値だけでは弱い根拠なので、他の検出と組み合わさる時のみ価値がある
  // confidence を低めに設定
  for (const c of candidates.slice(0, 2)) {
    const labels = getLabels(c.axis);
    if (!labels) continue;

    const strongSide = scoreSideLabel(c.axis, c.score);
    const weakSide = scoreOppositeSideLabel(c.axis, c.score);
    const pct = Math.round(c.absScore * 100);

    // precision が高い（確信がある）場合のみ confidence を上げる
    const precision = input.axisPrecisions?.[c.axis] ?? 0;
    const precisionBonus = precision > 10 ? 0.15 : 0;

    patterns.push({
      id: patternId("hidden_trigger", c.axis, "extreme"),
      category: "hidden_trigger",
      situation: `「${weakSide}」的な対応が求められる場面`,
      reaction: `${intensityWord(c.absScore)}「${strongSide}」寄りの判断をする（偏り ${pct}%）`,
      hiddenReason: `この軸で「${weakSide}」側を選ぶことに無意識の抵抗がある。「${strongSide}」が安全基地になっており、そこから離れることに不安を感じている`,
      selfImage: `バランスよく判断しているつもり、もしくは「${strongSide}」であることに問題を感じていない`,
      evidence: {
        primaryAxes: [
          { axis: c.axis, score: c.score, label: `${strongSide} (${pct}%)` },
        ],
      },
      confidence: Math.min(0.80, 0.3 + c.absScore * 0.3 + precisionBonus),
      novelty: 0.7,
    });
  }

  return patterns;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン関数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 入力データから最大5つの反応パターンを生成
 *
 * 優先順位: 矛盾強度 > 三面鏡ズレ > 回答時間異常 > 軸の極端値
 * 各パターンに confidence と novelty を付与
 * recentPatternIds と重複するものは除外（ただし cycle として再検出可能）
 */
export function generateReactionPatterns(
  input: ReactionPatternInput,
): ReactionPattern[] {
  // 各カテゴリから候補を生成
  const selfDeception = detectSelfDeception(input);
  const hiddenTrigger = detectHiddenTrigger(input);
  const defensePattern = detectDefensePattern(input);
  const contradiction = detectContradiction(input);
  const blindSpot = detectBlindSpot(input);
  const extremeValues = detectExtremeValues(input);

  // 全候補を集約
  let allCandidates = [
    ...defensePattern,      // 防衛パターン (矛盾強度ベース)
    ...contradiction,       // 矛盾 (二面性ベース)
    ...selfDeception,       // 自己欺瞞 (三面鏡ベース)
    ...blindSpot,           // 盲点 (三面鏡ベース)
    ...hiddenTrigger,       // 隠れたトリガー (回答時間ベース)
    ...extremeValues,       // 極端値 (補助)
  ];

  // 既出パターンの novelty を下げる
  const recentSet = new Set(input.recentPatternIds ?? []);
  allCandidates = allCandidates.map((p) => {
    if (recentSet.has(p.id)) {
      return { ...p, novelty: Math.max(0.1, p.novelty * 0.3) };
    }
    return p;
  });

  // cycle 検出（既出パターンの繰り返し）
  const cycles = detectCycle(input, allCandidates);

  // 既出パターンを除外し、cycle を追加
  const nonDuplicate = allCandidates.filter((p) => !recentSet.has(p.id));
  const combined = [...nonDuplicate, ...cycles];

  // confidence × novelty でソートし、上位5つを返す
  combined.sort((a, b) => {
    const scoreA = a.confidence * a.novelty;
    const scoreB = b.confidence * b.novelty;
    return scoreB - scoreA;
  });

  // 同じ軸の重複を避ける（1軸1パターン）
  const usedAxes = new Set<string>();
  const result: ReactionPattern[] = [];

  for (const p of combined) {
    if (result.length >= 5) break;

    const primaryAxis = p.evidence.primaryAxes[0]?.axis;
    if (primaryAxis && usedAxes.has(primaryAxis)) continue;

    if (primaryAxis) usedAxes.add(primaryAxis);
    result.push(p);
  }

  return result;
}

/**
 * 生成されたパターンから1日1つを選択
 * confidence x novelty のスコアが最も高いものを選ぶ
 */
export function selectDailyPattern(
  patterns: ReactionPattern[],
): ReactionPattern | null {
  if (patterns.length === 0) return null;

  let best = patterns[0];
  let bestScore = best.confidence * best.novelty;

  for (let i = 1; i < patterns.length; i++) {
    const score = patterns[i].confidence * patterns[i].novelty;
    if (score > bestScore) {
      best = patterns[i];
      bestScore = score;
    }
  }

  return best;
}

/**
 * ReactionPattern を人間が読める日本語テキストに変換
 *
 * フォーマット:
 * 「あなたは〇〇な場面で、△△する。
 *   自分では□□だと思っているだろうけど、
 *   本当は■■だからだ。」
 *
 * 汎用的な文章を生成しない — 必ずデータポイントに基づく記述にする
 */
export function formatPatternAsInsight(pattern: ReactionPattern): string {
  return (
    `あなたは${pattern.situation}で、${pattern.reaction}。\n` +
    `自分では${pattern.selfImage}だろうけど、\n` +
    `本当は${pattern.hiddenReason}。`
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// カテゴリラベル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const PATTERN_CATEGORY_LABELS: Record<PatternCategory, { ja: string; emoji: string }> = {
  self_deception: { ja: "自己欺瞞", emoji: "🪞" },
  hidden_trigger: { ja: "隠れたトリガー", emoji: "⚡" },
  defense_pattern: { ja: "防衛パターン", emoji: "🛡️" },
  contradiction: { ja: "矛盾", emoji: "🔀" },
  blind_spot: { ja: "盲点", emoji: "👁️" },
  cycle: { ja: "繰り返しサイクル", emoji: "🔄" },
};
