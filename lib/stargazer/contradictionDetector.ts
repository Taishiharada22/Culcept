// lib/stargazer/contradictionDetector.ts
// 矛盾検出エンジン — 4種類の矛盾を検出し、それぞれに探索質問を生成する
//
// 既存の contradictionMap.ts は「三面鏡のズレ」を扱う。
// このファイルはより広範な矛盾を扱う:
// 1. 時間的矛盾: 同じ質問に日によって違う答え
// 2. 軸間矛盾: 論理的に矛盾する軸スコアの組み合わせ
// 3. 自己申告 vs 行動: 言っていることとやっていることが違う
// 4. 主張 vs 選択: シナリオで「こうする」と言いながら行動パターンが逆
//
// 矛盾は欠陥ではない。矛盾は人間の複雑さの証拠であり、
// 「なぜ矛盾するのか」を追いかけることが最も深い自己理解につながる。

/**
 * Academic References & Theoretical Foundation:
 *
 * This module detects single-system (intra-Stargazer) contradictions across
 * four dimensions: temporal instability, cross-axis logical conflicts,
 * self-report vs. behavioral signals, and stated preferences vs. scenario
 * choices. Each detection type is grounded in specific psychological theory.
 *
 * Core Theoretical Frameworks:
 *
 * - Swann, W. B., Jr. (1983). "Self-verification: Bringing social reality
 *   into harmony with the self." In J. Suls & A. G. Greenwald (Eds.),
 *   Psychological Perspectives on the Self (Vol. 2, pp. 33-66). Erlbaum.
 *   Self-verification theory predicts that people actively seek confirmation
 *   of their existing self-views, even when those views are negative. When
 *   our detector finds that a person's self-report contradicts their behavior,
 *   it may indicate self-verification processes at work: the person maintains
 *   a self-concept that their actions do not support, because changing that
 *   concept would be psychologically destabilizing.
 *
 * - Higgins, E. T. (1987). "Self-discrepancy: A theory relating self and
 *   affect." Psychological Review, 94(3), 319-340.
 *   Self-discrepancy theory identifies three self-domains (actual, ideal,
 *   ought) and predicts specific emotional consequences when they diverge:
 *   actual-ideal discrepancies produce dejection (sadness, disappointment),
 *   while actual-ought discrepancies produce agitation (anxiety, guilt).
 *   Our cross-axis and stated-vs-chosen contradictions often surface these
 *   discrepancies, and the emotional tone of the user's response to the
 *   contradiction can indicate which discrepancy type is active.
 *
 * - Mischel, W., & Shoda, Y. (1995). "A cognitive-affective system theory
 *   of personality: Reconceptualizing situations, dispositions, dynamics, and
 *   invariance in personality structure." Psychological Review, 102(2),
 *   246-268.
 *   The CAPS (Cognitive-Affective Personality System) model argues that
 *   behavioral variability across situations is not noise but a stable
 *   individual signature. Our temporal contradiction detector identifies
 *   these "if...then..." behavioral signatures, treating score instability
 *   not as measurement error but as meaningful context-sensitivity.
 *
 * - Strack, F., & Deutsch, R. (2004). "Reflective and impulsive
 *   determinants of social behavior." Personality and Social Psychology
 *   Review, 8(3), 220-247.
 *   The reflective-impulsive model explains why stated preferences (produced
 *   by the reflective system) diverge from scenario choices (driven more by
 *   the impulsive system). Our stated-vs-chosen detector captures exactly
 *   this dual-system dissociation.
 *
 * Threshold Calibration:
 *   The 0.3-0.4 thresholds used in cross-axis rules correspond to
 *   approximately one standard deviation on the bipolar (-1 to +1) scale,
 *   aligning with the |r| > 0.3 threshold commonly used in Big Five factor
 *   correlation research (Costa & McCrae, 1992) and the interpersonal
 *   circumplex model (Wiggins, 1995) for identifying meaningful associations.
 */

import { TRAIT_AXES, getAxisLabels, type TraitAxisKey } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ContradictionType =
  | "temporal"
  | "cross_axis"
  | "self_report_vs_behavior"
  | "stated_vs_chosen";

export interface ContradictionResult {
  /** 矛盾の主軸 */
  axisA: string;
  /** 矛盾の副軸 (cross_axis のみ。他のタイプでは axisA と同じ) */
  axisB: string;
  /** 矛盾のタイプ */
  type: ContradictionType;
  /** 深刻度 (0-1, 高いほど大きな矛盾) */
  severity: number;
  /** 矛盾の説明 (日本語) */
  description: string;
  /** この矛盾が明かす可能性のある深層 */
  insightPotential: string;
  /** 掘り下げるためのフォローアップ質問 */
  probeQuestion: string;
}

/** 時間的矛盾検出のための入力 */
export interface TemporalScoreEntry {
  axisId: string;
  score: number;
  date: string; // ISO date string
}

/** 行動信号入力 */
export interface BehaviorSignalInput {
  axisId: string;
  /** 応答時間比率 (1.0 = 平均) */
  responseTimeRatio: number;
  /** 回答変更回数 */
  answerChangeCount: number;
  /** 戻り操作回数 */
  backNavigationCount: number;
  /** 質問数 */
  totalQuestions: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cross-Axis Contradiction Rules
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 論理的に矛盾しうる軸の組み合わせを定義。
 *
 * 例: 「独立性が非常に高い」のに「安心確認を強く求める」のは矛盾。
 * ただし、「矛盾 = 間違い」ではない。この矛盾自体が深い洞察の源泉。
 */
interface CrossAxisRule {
  axisA: TraitAxisKey;
  axisB: TraitAxisKey;
  /** axisA のスコアがこの方向で axisB のスコアがこの方向なら矛盾 */
  conflictCondition: (scoreA: number, scoreB: number) => boolean;
  /** 矛盾が見つかった時のインサイト */
  insightTemplate: string;
  /** 探索のための質問 */
  probeTemplate: string;
}

/**
 * 閾値の理論的根拠:
 * - 0.3-0.4 の閾値は、-1〜+1 の双極スケールにおいて約1標準偏差に相当
 * - Big Five 因子間相関研究 (Costa & McCrae, 1992) で |r| > 0.3 が「有意な関連」と判断される水準に対応
 * - 閾値が低すぎると偽陽性が増え、高すぎると有意な矛盾を見逃すトレードオフを考慮
 * - 各ルールの方向性は対人関係円環モデル (Wiggins, 1995) と Big Five の因子構造に基づく
 */
const CROSS_AXIS_RULES: CrossAxisRule[] = [
  {
    axisA: "independence_vs_harmony",
    axisB: "reassurance_need",
    conflictCondition: (a, b) => a < -0.4 && b > 0.4,
    insightTemplate: "「独立」を重視するのに、安心確認を強く求めている。独立は理想であり、心の深い部分では安心を必要としている可能性がある。",
    probeTemplate: "「一人でいたい」と「誰かに確認したい」が同居している。どんな場面で後者が強くなる？",
  },
  {
    axisA: "cautious_vs_bold",
    axisB: "plan_vs_spontaneous",
    conflictCondition: (a, b) => a > 0.4 && b < -0.4,
    insightTemplate: "「大胆」と自覚しながら「計画的」でもある。大胆さは表面的なスタンスで、実際には綿密に準備してから動くタイプかもしれない。",
    probeTemplate: "「大胆に見えるけど実は用意周到」と言われたことはある？ それとも本当に衝動で動く？",
  },
  {
    axisA: "direct_vs_diplomatic",
    axisB: "public_private_gap",
    conflictCondition: (a, b) => a < -0.4 && b > 0.4,
    insightTemplate: "「率直」を自覚しているのに、表と裏にギャップがある。本音を言っているようで、実は場面によって使い分けている。",
    probeTemplate: "率直でいるつもりでも、実は言えていないことがある？ 誰に対してが一番それが出る？",
  },
  {
    axisA: "introvert_vs_extrovert",
    axisB: "social_initiative",
    conflictCondition: (a, b) => a < -0.4 && b > 0.4,
    insightTemplate: "内向的なのに自分から距離を縮める。「本当は一人が好きだけど、孤立が怖い」パターンかもしれない。",
    probeTemplate: "自分から声をかけた後、疲れを感じることが多い？ それとも充実感がある？",
  },
  {
    axisA: "emotional_variability",
    axisB: "emotional_regulation",
    conflictCondition: (a, b) => a > 0.4 && b > 0.4,
    insightTemplate: "感情が変わりやすいのに調整できていると感じている。実は「感情を抑えること」を「調整」と混同している可能性がある。",
    probeTemplate: "感情が揺れた時、「落ち着かせる」のと「感じないようにする」のは違う。あなたはどちらが多い？",
  },
  {
    axisA: "change_embrace_vs_resist",
    axisB: "tradition_vs_novelty",
    conflictCondition: (a, b) => a < -0.3 && b < -0.3,
    insightTemplate: "変化を歓迎すると言いながら、伝統的なものを好む。変化への好奇心と、守りたい安定の間で揺れている。",
    probeTemplate: "「新しいもの好き」と「変わらないものが好き」の両方がある？ どの領域で使い分けている？",
  },
  {
    axisA: "quality_vs_quantity",
    axisB: "perfectionist_vs_pragmatic",
    conflictCondition: (a, b) => a < -0.4 && b > 0.4,
    insightTemplate: "質を深く追求したいのに実用・前進を重視している。時間に追われて妥協している自覚はあるかもしれないが、本当に求めているのは「じっくり」のほう。",
    probeTemplate: "時間が無限にあったら、今のペースで進みたい？ それとももっとゆっくりやりたい？",
  },
  {
    axisA: "boundary_awareness",
    axisB: "intimacy_pace",
    conflictCondition: (a, b) => a > 0.4 && b > 0.4,
    insightTemplate: "境界を明確に意識しているのに、距離を早く縮めたがる。「ルールを知っているからこそ攻めてもいい」という自信がある一方、相手の境界を見落とすリスクもある。",
    probeTemplate: "距離を縮めるスピードに、相手がついてきていないと感じたことはある？",
  },
  {
    axisA: "control_tendency",
    axisB: "rejection_response_maturity",
    conflictCondition: (a, b) => a > 0.3 && b < -0.3,
    insightTemplate: "コントロール欲が高く、拒否への耐性が低い。相手を管理しようとして、断られると過剰に反応するパターンの可能性がある。",
    probeTemplate: "自分の提案を断られた時、「仕方ない」と思える？ それとも何か引きずるものがある？",
  },
  {
    axisA: "plan_vs_spontaneous",
    axisB: "emotional_variability",
    conflictCondition: (a, b) => a > 0.3 && b > 0.4,
    insightTemplate: "「即興的」で「感情が変わりやすい」。衝動的な反応パターンと、計画的な自分を使い分けている可能性がある。感情に振り回されている自覚はあるか。",
    probeTemplate: "衝動的に動いた後、「やっぱり考えてから動けばよかった」と思うことはどれくらいある？",
  },
  {
    axisA: "minimal_vs_maximal",
    axisB: "quality_vs_quantity",
    conflictCondition: (a, b) => a < -0.3 && b < -0.4,
    insightTemplate: "「ミニマル」を好むのに「質を深く追求」する。完璧主義的ミニマリズム——少ないものにこだわりすぎて、実は選択に苦しんでいるかもしれない。",
    probeTemplate: "「少なくていいもの」を選ぶとき、選ぶこと自体に時間がかかりすぎることはない？",
  },
  {
    axisA: "consent_maturity",
    axisB: "social_initiative",
    conflictCondition: (a, b) => a > 0.4 && b > 0.4,
    insightTemplate: "合意を重視しつつ、自分から積極的に距離を縮める。「ルールを理解しているからこそ攻めてよい」という高度な自信と、相手のペースを無視するリスクが共存している。",
    probeTemplate: "「相手の了解を得ている」と思っていたのに、実は相手が断りにくい状況を作っていた経験はある？",
  },
  {
    axisA: "stress_isolation_vs_social",
    axisB: "reassurance_need",
    conflictCondition: (a, b) => a < -0.3 && b > 0.4,
    insightTemplate: "ストレス時は一人でいたいのに、安心確認は求める。「放っておいて。でも見捨てないで」——この矛盾自体が、あなたの愛着スタイルの核心。",
    probeTemplate: "一人になりたいとき、相手が本当にいなくなったらどう感じる？ 安心する？ それとも不安になる？",
  },
  {
    axisA: "relationship_mode_split",
    axisB: "intent_stability",
    conflictCondition: (a, b) => a > 0.3 && b > 0.3,
    insightTemplate: "関係モードが文脈で変わるのに、意図は一貫している。戦略的に自分を使い分けている——「本音は一つだが、見せ方を変える」タイプ。",
    probeTemplate: "友人、恋人、同僚に見せている自分は違う。でも「本当の自分」はどれ？ それとも全部本当？",
  },
  {
    axisA: "classic_vs_trendy",
    axisB: "change_embrace_vs_resist",
    conflictCondition: (a, b) => a > 0.3 && b > 0.3,
    insightTemplate: "トレンドを追いかけるが、根本的な変化には抵抗する。表面的な新しさは好きだが、自分の根っこが変わることは怖い——新奇性追求と保守性の二層構造。",
    probeTemplate: "流行りのものに飛びつくけど、自分の考え方や価値観は昔からあまり変わっていない？",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function axisLabel(axisId: string): string {
  const labels = getAxisLabels(axisId as TraitAxisKey);
  if (!labels) return axisId;
  return `${labels.left}/${labels.right}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Temporal Contradictions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 同じ軸に対する時間的矛盾を検出する。
 * 日によってスコアが大きく異なる場合、「状況による変動」か「成長/変化」を示唆。
 */
export function detectTemporalContradictions(
  scoreHistory: TemporalScoreEntry[],
): ContradictionResult[] {
  if (scoreHistory.length < 4) return [];

  const results: ContradictionResult[] = [];

  // 軸ごとにグループ化
  const byAxis: Record<string, TemporalScoreEntry[]> = {};
  for (const entry of scoreHistory) {
    if (!byAxis[entry.axisId]) byAxis[entry.axisId] = [];
    byAxis[entry.axisId].push(entry);
  }

  for (const [axisId, entries] of Object.entries(byAxis)) {
    if (entries.length < 3) continue;

    // 時系列順にソート
    const sorted = [...entries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const scores = sorted.map(e => e.score);
    const sd = stdDev(scores);
    const m = mean(scores);

    // 標準偏差が大きい = スコアがばらついている
    if (sd < 0.3) continue;

    // 方向転換を検出
    let directionChanges = 0;
    for (let i = 2; i < scores.length; i++) {
      const prevDir = scores[i - 1] - scores[i - 2];
      const currDir = scores[i] - scores[i - 1];
      if (prevDir * currDir < 0 && Math.abs(currDir) > 0.2) {
        directionChanges++;
      }
    }

    // 最新と最古のスコア差
    const firstScore = scores[0];
    const lastScore = scores[scores.length - 1];
    const overallShift = lastScore - firstScore;

    const label = axisLabel(axisId);
    const severity = Math.min(1.0, sd / 0.6);

    if (directionChanges >= 2) {
      // 揺れ動いている
      results.push({
        axisA: axisId,
        axisB: axisId,
        type: "temporal",
        severity,
        description: `「${label}」のスコアが観測ごとに揺れ動いている（標準偏差${Math.round(sd * 100) / 100}）。この領域は状況や気分に強く影響される不安定な領域。`,
        insightPotential: "状況依存的な自己像。「どちらの自分も本物」だが、どの条件で切り替わるかのパターンに手がかりがある",
        probeQuestion: `「${label}」について、答えが変わりやすい。どんな日は一方に寄り、どんな日は逆に寄る？ パターンに心当たりはある？`,
      });
    } else if (Math.abs(overallShift) > 0.5) {
      // 一方向への変化
      const direction = overallShift > 0
        ? (getAxisLabels(axisId as TraitAxisKey)?.right ?? "正方向")
        : (getAxisLabels(axisId as TraitAxisKey)?.left ?? "負方向");
      results.push({
        axisA: axisId,
        axisB: axisId,
        type: "temporal",
        severity: Math.min(1.0, Math.abs(overallShift) / 1.0),
        description: `「${label}」のスコアが「${direction}」方向に一貫して変化している（変化幅${Math.round(Math.abs(overallShift) * 100) / 100}）。成長あるいは環境変化の反映。`,
        insightPotential: "変化の自覚度。本人が気づいている変化か、無自覚な変化かで意味が異なる",
        probeQuestion: `「${label}」の傾向が以前と変わってきている。自分でもそう感じる？ 何がきっかけ？`,
      });
    }
  }

  return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Cross-Axis Contradictions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 論理的に矛盾する軸スコアの組み合わせを検出する。
 * CROSS_AXIS_RULES に定義されたルールに基づく。
 */
export function detectCrossAxisContradictions(
  axisScores: Record<string, number>,
): ContradictionResult[] {
  const results: ContradictionResult[] = [];

  for (const rule of CROSS_AXIS_RULES) {
    const scoreA = axisScores[rule.axisA];
    const scoreB = axisScores[rule.axisB];

    if (scoreA === undefined || scoreB === undefined) continue;

    if (rule.conflictCondition(scoreA, scoreB)) {
      // 矛盾の深刻度: 両スコアの絶対値の平均
      const severity = Math.min(1.0,
        (Math.abs(scoreA) + Math.abs(scoreB)) / 1.5
      );

      results.push({
        axisA: rule.axisA,
        axisB: rule.axisB,
        type: "cross_axis",
        severity,
        description: rule.insightTemplate,
        insightPotential: `「${axisLabel(rule.axisA)}」と「${axisLabel(rule.axisB)}」の間にある無自覚な葛藤パターン`,
        probeQuestion: rule.probeTemplate,
      });
    }
  }

  // 深刻度順
  results.sort((a, b) => b.severity - a.severity);
  return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Self-Report vs Behavior
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 自己申告スコアと行動信号を比較して矛盾を検出する。
 *
 * 例: 「大胆」とスコアしているが応答に常に長時間かかる
 * 例: 「決断力がある」が回答変更が多い
 */
export function detectSelfReportVsBehavior(
  axisScores: Record<string, number>,
  behaviorSignals: BehaviorSignalInput[],
): ContradictionResult[] {
  const results: ContradictionResult[] = [];

  for (const signal of behaviorSignals) {
    const score = axisScores[signal.axisId];
    if (score === undefined) continue;

    const label = axisLabel(signal.axisId);
    const labels = getAxisLabels(signal.axisId as TraitAxisKey);
    if (!labels) continue;

    // パターン: 極端なスコア + 長い応答時間
    if (Math.abs(score) > 0.5 && signal.responseTimeRatio > 2.0) {
      const statedSide = score > 0 ? labels.right : labels.left;

      results.push({
        axisA: signal.axisId,
        axisB: signal.axisId,
        type: "self_report_vs_behavior",
        severity: Math.min(1.0,
          Math.abs(score) * (signal.responseTimeRatio - 1) / 2
        ),
        description: `「${statedSide}」と強く自覚しているが、この領域の質問に平均の${Math.round(signal.responseTimeRatio * 10) / 10}倍の時間がかかっている。確信的な自己像の裏に迷いがある。`,
        insightPotential: `「${statedSide}でありたい」という願望と、実際の判断プロセスの乖離`,
        probeQuestion: `「${label}」について、自分は「${statedSide}」寄りだと思う。でも、この質問に答えるのに時間がかかった。すぐに答えられない理由は何だと思う？`,
      });
    }

    // パターン: 「決断力」系のスコアが高いが回答変更が多い
    if (
      (signal.axisId === "cautious_vs_bold" || signal.axisId === "plan_vs_spontaneous") &&
      score > 0.3 &&
      signal.totalQuestions > 0
    ) {
      const changeRate = signal.answerChangeCount / signal.totalQuestions;
      if (changeRate > 0.3) {
        results.push({
          axisA: signal.axisId,
          axisB: signal.axisId,
          type: "self_report_vs_behavior",
          severity: Math.min(1.0, changeRate * Math.abs(score)),
          description: `「${labels.right}」寄りと答えながら、回答の${Math.round(changeRate * 100)}%で選択を変えている。行動は言葉より正直だ。`,
          insightPotential: "自己イメージと実際の行動パターンの乖離。社会的に望ましい自分を演じている可能性",
          probeQuestion: `回答を変える瞬間、何が頭をよぎった？ 最初の直感と、変えた後の答え、どちらが「本当の自分」？`,
        });
      }
    }
  }

  return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Stated vs Chosen
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** シナリオ回答データ */
export interface ScenarioResponse {
  scenarioId: string;
  /** シナリオのテーマ軸 */
  axisId: string;
  /** ユーザーの選択 (-1 ~ +1) */
  chosenScore: number;
}

/**
 * シナリオ質問での選択と、通常の自己申告スコアの乖離を検出する。
 *
 * 通常の質問では「大胆」と答えるが、具体的なシナリオでは慎重な選択をする
 * → 「頭では大胆だと思っているが、実際の判断は慎重」
 */
export function detectStatedVsChosen(
  axisScores: Record<string, number>,
  scenarioResponses: ScenarioResponse[],
): ContradictionResult[] {
  if (scenarioResponses.length < 2) return [];

  const results: ContradictionResult[] = [];

  // 軸ごとにシナリオ回答を集計
  const byAxis: Record<string, number[]> = {};
  for (const response of scenarioResponses) {
    if (!byAxis[response.axisId]) byAxis[response.axisId] = [];
    byAxis[response.axisId].push(response.chosenScore);
  }

  for (const [axisId, chosenScores] of Object.entries(byAxis)) {
    if (chosenScores.length < 2) continue;

    const statedScore = axisScores[axisId];
    if (statedScore === undefined) continue;

    const avgChosen = mean(chosenScores);
    const gap = statedScore - avgChosen;

    // 有意な乖離: 0.4以上の差
    if (Math.abs(gap) < 0.4) continue;

    const label = axisLabel(axisId);
    const labels = getAxisLabels(axisId as TraitAxisKey);
    if (!labels) continue;

    const statedSide = statedScore > 0 ? labels.right : labels.left;
    const chosenSide = avgChosen > 0 ? labels.right : labels.left;

    const severity = Math.min(1.0, Math.abs(gap) / 1.2);

    if (statedSide !== chosenSide) {
      // 完全に逆方向
      results.push({
        axisA: axisId,
        axisB: axisId,
        type: "stated_vs_chosen",
        severity,
        description: `自己認識では「${statedSide}」だが、具体的な場面では「${chosenSide}」を選ぶ傾向がある。抽象的な自己像と実際の判断が逆方向。`,
        insightPotential: `「${statedSide}でありたい自分」と「${chosenSide}で動く実際の自分」の二重構造`,
        probeQuestion: `「${label}」について、質問には「${statedSide}」と答えたけど、実際のシナリオでは「${chosenSide}」を選んでいる。どっちが本当だと思う？`,
      });
    } else {
      // 同方向だが程度が違う
      const stronger = Math.abs(statedScore) > Math.abs(avgChosen) ? "自覚" : "行動";
      results.push({
        axisA: axisId,
        axisB: axisId,
        type: "stated_vs_chosen",
        severity: severity * 0.7,
        description: `「${label}」で${stronger}のほうがより極端（自覚: ${Math.round(statedScore * 100) / 100}, シナリオ選択: ${Math.round(avgChosen * 100) / 100}）。`,
        insightPotential: "自己認識の精度。自分をどれだけ正確に把握しているか",
        probeQuestion: `「${label}」について、自覚と実際の選択に差がある。どちらの数値が「本当の自分」に近いと感じる？`,
      });
    }
  }

  return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Full Detection Orchestrator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ContradictionDetectorInput {
  /** 現在の軸スコア */
  axisScores: Record<string, number>;
  /** スコア履歴 (時間的矛盾の検出用) */
  scoreHistory: TemporalScoreEntry[];
  /** 行動信号 (自己申告 vs 行動の検出用) */
  behaviorSignals: BehaviorSignalInput[];
  /** シナリオ回答 (主張 vs 選択の検出用) */
  scenarioResponses: ScenarioResponse[];
}

/**
 * 4種類の矛盾検出を一括実行し、深刻度順に上位10件を返す。
 *
 * 使い方:
 * 1. セッション終了時に呼ぶ
 * 2. severity >= 0.4 の矛盾をユーザーに提示
 * 3. probeQuestion を次のセッションの質問候補として活用
 */
export function runContradictionDetection(
  input: ContradictionDetectorInput,
): ContradictionResult[] {
  const all: ContradictionResult[] = [
    ...detectTemporalContradictions(input.scoreHistory),
    ...detectCrossAxisContradictions(input.axisScores),
    ...detectSelfReportVsBehavior(input.axisScores, input.behaviorSignals),
    ...detectStatedVsChosen(input.axisScores, input.scenarioResponses),
  ];

  // 同じ軸ペア + 同じタイプの重複を排除
  const deduped = new Map<string, ContradictionResult>();
  for (const result of all) {
    const key = `${result.type}:${[result.axisA, result.axisB].sort().join(":")}`;
    const existing = deduped.get(key);
    if (!existing || existing.severity < result.severity) {
      deduped.set(key, result);
    }
  }

  return [...deduped.values()]
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 10);
}

/**
 * 矛盾結果から次のセッションで優先すべき軸のリストを返す。
 * 矛盾が多い軸ほど深く掘る価値がある。
 */
export function prioritizeContradictionAxes(
  contradictions: ContradictionResult[],
): { axisId: string; totalSeverity: number; contradictionCount: number }[] {
  const axisSeverity: Record<string, { total: number; count: number }> = {};

  for (const c of contradictions) {
    for (const axisId of [c.axisA, c.axisB]) {
      if (!axisSeverity[axisId]) axisSeverity[axisId] = { total: 0, count: 0 };
      axisSeverity[axisId].total += c.severity;
      axisSeverity[axisId].count++;
    }
  }

  return Object.entries(axisSeverity)
    .map(([axisId, { total, count }]) => ({
      axisId,
      totalSeverity: Math.round(total * 100) / 100,
      contradictionCount: count,
    }))
    .sort((a, b) => b.totalSeverity - a.totalSeverity);
}
