// lib/stargazer/crossSystemBridge.ts
// Stargazer 45軸 → 他システム変換ブリッジ
// Genome / Rendezvous / Origin / Presence の各システムとの双方向接続

import type { TraitAxisKey } from "./traitAxes";
import type { MatchingVector } from "@/lib/rendezvous/types";
import type { DnaAxisKey } from "@/lib/genome/types";

// ═══════════════════════════════════════════════════════════
// 1. Stargazer → Rendezvous MatchingVector 変換
// ═══════════════════════════════════════════════════════════

/**
 * Stargazerの軸スコア(-1〜+1)からRendezvousのMatchingVector(0〜1)を生成
 * MatchingVectorは相手との相性計算に使用される10次元ベクトル
 */
export function convertToMatchingVector(
  axisScores: Partial<Record<TraitAxisKey, number>>
): MatchingVector {
  const get = (key: TraitAxisKey) => axisScores[key] ?? 0;
  const norm = (v: number) => Math.max(0, Math.min(1, (v + 1) / 2));

  return {
    // 会話の温度感: 外向的 + ストレス時に人と回復 → 高い
    conversation_temperature: norm(
      get("introvert_vs_extrovert") * 0.5 +
      get("stress_isolation_vs_social") * 0.3 +
      get("social_initiative") * 0.2
    ),

    // 距離のニーズ: intimacy_pace遅い + boundary意識高い → 距離が必要
    distance_need: norm(
      -get("intimacy_pace") * 0.4 +
      get("boundary_awareness") * 0.3 +
      -get("social_initiative") * 0.3
    ),

    // 深さの速度: intimacy早い + 大胆 → 深さが早い
    depth_speed: norm(
      get("intimacy_pace") * 0.5 +
      get("cautious_vs_bold") * 0.3 +
      get("direct_vs_diplomatic") * -0.2
    ),

    // 安定ニーズ: 変化抵抗 + 計画的 + 感情安定 → 安定が必要
    stability_need: norm(
      get("change_embrace_vs_resist") * 0.4 +
      -get("plan_vs_spontaneous") * 0.3 +
      -get("emotional_variability") * 0.3
    ),

    // 刺激ニーズ: 変化歓迎 + 大胆 + 即興的 → 刺激が必要
    stimulation_need: norm(
      -get("change_embrace_vs_resist") * 0.3 +
      get("cautious_vs_bold") * 0.3 +
      get("plan_vs_spontaneous") * 0.2 +
      get("tradition_vs_novelty") * 0.2
    ),

    // 主導性: social_initiative高い + 直接的 + 独立的 → 主導的
    initiative: norm(
      get("social_initiative") * 0.4 +
      -get("direct_vs_diplomatic") * 0.3 +
      -get("independence_vs_harmony") * 0.3
    ),

    // 感情オープンさ: public_private_gap低い + emotional_variability高い
    emotional_openness: norm(
      -get("public_private_gap") * 0.4 +
      get("emotional_variability") * 0.2 +
      -get("direct_vs_diplomatic") * 0.2 +
      get("reassurance_need") * 0.2
    ),

    // 対立時の率直さ: 直接的 + 独立的 → 率直
    conflict_directness: norm(
      -get("direct_vs_diplomatic") * 0.5 +
      -get("independence_vs_harmony") * 0.3 +
      get("emotional_regulation") * 0.2
    ),

    // 社交エネルギー: 外向的 + 社会的 → エネルギー高い
    social_energy: norm(
      get("introvert_vs_extrovert") * 0.4 +
      get("individual_vs_social") * 0.3 +
      get("social_initiative") * 0.3
    ),

    // 構造志向: 計画的 + 分析的 + 完璧主義 → 構造が好き
    structure_preference: norm(
      -get("plan_vs_spontaneous") * 0.4 +
      -get("analytical_vs_intuitive") * 0.3 +
      -get("perfectionist_vs_pragmatic") * 0.3
    ),
  };
}

// ═══════════════════════════════════════════════════════════
// 2. Stargazer → Genome DNA軸 スコア変換
// ═══════════════════════════════════════════════════════════

export interface GenomeAxisContribution {
  axis: DnaAxisKey;
  score: number;       // 0-100
  confidence: number;  // 0-1
  contributingAxes: { key: TraitAxisKey; weight: number; value: number }[];
}

/**
 * Stargazer軸スコアからGenome4軸のスコアを算出
 * Genomeの各DNA軸に対して、Stargazerの関連軸から寄与度を計算
 */
export function convertToGenomeAxes(
  axisScores: Partial<Record<TraitAxisKey, number>>
): GenomeAxisContribution[] {
  const get = (key: TraitAxisKey) => axisScores[key];

  const GENOME_MAPPING: Record<DnaAxisKey, { key: TraitAxisKey; weight: number }[]> = {
    // personality軸: コア性格特性
    personality: [
      { key: "introvert_vs_extrovert", weight: 0.2 },
      { key: "analytical_vs_intuitive", weight: 0.15 },
      { key: "cautious_vs_bold", weight: 0.15 },
      { key: "emotional_variability", weight: 0.15 },
      { key: "emotional_regulation", weight: 0.15 },
      { key: "change_embrace_vs_resist", weight: 0.1 },
      { key: "plan_vs_spontaneous", weight: 0.1 },
    ],
    // behavior軸: 行動パターン
    behavior: [
      { key: "social_initiative", weight: 0.2 },
      { key: "direct_vs_diplomatic", weight: 0.15 },
      { key: "independence_vs_harmony", weight: 0.15 },
      { key: "stress_isolation_vs_social", weight: 0.15 },
      { key: "function_vs_expression", weight: 0.1 },
      { key: "minimal_vs_maximal", weight: 0.1 },
      { key: "perfectionist_vs_pragmatic", weight: 0.15 },
    ],
    // social軸: 対人関係パターン
    social: [
      { key: "intimacy_pace", weight: 0.15 },
      { key: "boundary_awareness", weight: 0.15 },
      { key: "public_private_gap", weight: 0.1 },
      { key: "relationship_mode_split", weight: 0.1 },
      { key: "reassurance_need", weight: 0.15 },
      { key: "consent_maturity", weight: 0.1 },
      { key: "friend_mode_fit", weight: 0.1 },
      { key: "control_tendency", weight: 0.15 },
    ],
    // physical軸: Stargazerは直接関与しないが、行動パターンから推測
    physical: [
      { key: "function_vs_expression", weight: 0.25 },
      { key: "minimal_vs_maximal", weight: 0.25 },
      { key: "classic_vs_trendy", weight: 0.25 },
      { key: "quality_vs_quantity", weight: 0.25 },
    ],
  };

  return (Object.entries(GENOME_MAPPING) as [DnaAxisKey, typeof GENOME_MAPPING.personality][]).map(
    ([axis, mappings]) => {
      const contributions = mappings
        .map((m) => {
          const val = get(m.key);
          return val !== undefined
            ? { key: m.key, weight: m.weight, value: val }
            : null;
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

      const totalWeight = contributions.reduce((s, c) => s + c.weight, 0);
      const weightedSum = contributions.reduce(
        (s, c) => s + Math.abs(c.value) * c.weight,
        0
      );

      const score =
        totalWeight > 0
          ? Math.round(Math.min((weightedSum / totalWeight) * 100, 100))
          : 0;

      const confidence = Math.min(contributions.length / mappings.length, 1);

      return { axis, score, confidence, contributingAxes: contributions };
    }
  );
}

// ═══════════════════════════════════════════════════════════
// 3. Stargazer → Origin 記憶チャプター接続ヒント
// ═══════════════════════════════════════════════════════════

export interface OriginConnectionHint {
  axisKey: TraitAxisKey;
  direction: "positive" | "negative";
  strength: number;    // 0-1
  narrative: string;   // "この傾向は過去の経験に根ざしているかもしれない"
  originPrompt: string; // Origin記憶探索の入口質問
}

/**
 * Stargazerの顕著な軸スコアから、Origin(記憶)との接続ヒントを生成
 * 「なぜこの性格になったのか？」を Origin の記憶探索に繋げる
 */
export function generateOriginHints(
  axisScores: Partial<Record<TraitAxisKey, number>>
): OriginConnectionHint[] {
  const hints: OriginConnectionHint[] = [];

  const ORIGIN_NARRATIVES: {
    key: TraitAxisKey;
    threshold: number;
    positive: { narrative: string; prompt: string };
    negative: { narrative: string; prompt: string };
  }[] = [
    {
      key: "cautious_vs_bold",
      threshold: 0.4,
      positive: {
        narrative: "大胆に動ける今のあなた — その勇気はどこから来た？",
        prompt: "「思い切って行動して良かった」と思えた過去の出来事はある？",
      },
      negative: {
        narrative: "慎重さは過去の経験から学んだ知恵かもしれない",
        prompt: "慎重になるようになったきっかけの出来事は？",
      },
    },
    {
      key: "intimacy_pace",
      threshold: 0.35,
      positive: {
        narrative: "距離を縮めるのが得意なあなた — 人との出会いが良かったのかも",
        prompt: "人と素早く打ち解けられた成功体験はある？",
      },
      negative: {
        narrative: "距離を慎重に詰めるのは、自分を守る知恵",
        prompt: "「もっとゆっくり距離を縮めたかった」と感じた経験は？",
      },
    },
    {
      key: "reassurance_need",
      threshold: 0.4,
      positive: {
        narrative: "安心を求めるのは、大切にされたい気持ちの表れ",
        prompt: "誰かに「大丈夫」と言われて救われた経験はある？",
      },
      negative: {
        narrative: "自分で安心を作れる強さ — それはどう育ったんだろう",
        prompt: "自分一人で乗り越えた経験が自信になってることはある？",
      },
    },
    {
      key: "emotional_regulation",
      threshold: 0.35,
      positive: {
        narrative: "感情のコントロールが上手い — いつからそうなれた？",
        prompt: "感情をうまく扱えるようになったターニングポイントは？",
      },
      negative: {
        narrative: "感情が動きやすいのは、感受性の豊かさの証",
        prompt: "感情に振り回されて困った過去の経験を教えて",
      },
    },
    {
      key: "public_private_gap",
      threshold: 0.35,
      positive: {
        narrative: "外の顔と本音のギャップ — いつからそうなった？",
        prompt: "「本当の自分を出せない」と感じ始めた時期はある？",
      },
      negative: {
        narrative: "表と裏が一致するあなた — 安全な環境で育ったのかも",
        prompt: "ありのままの自分でいられた環境や人はいた？",
      },
    },
    {
      key: "independence_vs_harmony",
      threshold: 0.4,
      positive: {
        narrative: "調和を大切にする姿勢 — その価値観はどこから？",
        prompt: "「みんなが心地よくいること」を大切にするようになったきっかけは？",
      },
      negative: {
        narrative: "独立心の強さ — 自分の道を歩く決意はいつ芽生えた？",
        prompt: "「自分は自分」と強く感じた過去の瞬間はある？",
      },
    },
    {
      key: "boundary_awareness",
      threshold: 0.35,
      positive: {
        narrative: "境界線を意識できるのは、経験から学んだ大切なスキル",
        prompt: "「ここまで」という線引きを意識するようになった経験は？",
      },
      negative: {
        narrative: "境界線が柔軟なのは、オープンさの表れ",
        prompt: "人の領域に入りすぎて失敗した経験はある？",
      },
    },
    {
      key: "change_embrace_vs_resist",
      threshold: 0.4,
      positive: {
        narrative: "安定を求める気持ち — 過去に大きな変化があったのかも",
        prompt: "「もう変わりたくない」と感じるほどの変化の経験は？",
      },
      negative: {
        narrative: "変化を歓迎できるのは、適応力の高さ",
        prompt: "変化を乗り越えて成長した実感がある出来事は？",
      },
    },
  ];

  for (const item of ORIGIN_NARRATIVES) {
    const score = axisScores[item.key];
    if (score === undefined) continue;

    if (Math.abs(score) >= item.threshold) {
      const direction = score > 0 ? "positive" : "negative";
      const data = direction === "positive" ? item.positive : item.negative;

      hints.push({
        axisKey: item.key,
        direction,
        strength: Math.abs(score),
        narrative: data.narrative,
        originPrompt: data.prompt,
      });
    }
  }

  // 強い順にソート
  return hints.sort((a, b) => b.strength - a.strength);
}

// ═══════════════════════════════════════════════════════════
// 4. Stargazer → Presence 他者視点サマリー
// ═══════════════════════════════════════════════════════════

export interface PresenceInsight {
  /** 第一印象 */
  firstImpression: string;
  /** 近寄りやすさ (0-100) */
  approachability: number;
  /** 深く知ると見えるもの */
  deeperReality: string;
  /** ギャップ (外と中の差) */
  gapDescription: string;
  /** SNSプロフィールに出すべきキーワード */
  profileKeywords: string[];
}

/**
 * Stargazer軸スコアからPresence向けのインサイトを生成
 */
export function generatePresenceInsight(
  axisScores: Partial<Record<TraitAxisKey, number>>
): PresenceInsight {
  const get = (key: TraitAxisKey) => axisScores[key] ?? 0;

  // 第一印象生成
  const firstImpressionParts: string[] = [];
  if (get("introvert_vs_extrovert") > 0.3) firstImpressionParts.push("明るく社交的");
  else if (get("introvert_vs_extrovert") < -0.3) firstImpressionParts.push("静かで落ち着いた");
  if (get("direct_vs_diplomatic") < -0.3) firstImpressionParts.push("はっきりした");
  else if (get("direct_vs_diplomatic") > 0.3) firstImpressionParts.push("柔らかい");
  if (get("emotional_regulation") > 0.3) firstImpressionParts.push("安定感のある");
  if (get("cautious_vs_bold") > 0.3) firstImpressionParts.push("行動力のある");

  const firstImpression =
    firstImpressionParts.length > 0
      ? `${firstImpressionParts.join("、")}人という印象を与えやすい`
      : "穏やかで読みにくい印象を持たれやすい";

  // 近寄りやすさ
  const approachability = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        50 +
          get("introvert_vs_extrovert") * 15 +
          get("direct_vs_diplomatic") * 10 +
          -get("boundary_awareness") * 10 +
          get("social_initiative") * 10 +
          -get("public_private_gap") * 5
      )
    )
  );

  // 深く知ると見えるもの
  const deeperParts: string[] = [];
  if (get("emotional_variability") > 0.3) deeperParts.push("感情が豊か");
  if (get("reassurance_need") > 0.3) deeperParts.push("安心を求めている");
  if (get("public_private_gap") > 0.3) deeperParts.push("本音と建前に差がある");
  if (get("independence_vs_harmony") < -0.3) deeperParts.push("実は芯が強い");
  if (get("stress_isolation_vs_social") < -0.3) deeperParts.push("一人の時間を大切にする");

  const deeperReality =
    deeperParts.length > 0
      ? `深く知ると、${deeperParts.join("、")}一面が見えてくる`
      : "知れば知るほど、安定した核を感じられる";

  // ギャップ
  const gap = Math.abs(get("public_private_gap"));
  const gapDescription =
    gap > 0.4
      ? "外から見える姿と内面にかなりのギャップがある。本人も気づいていないかもしれない"
      : gap > 0.2
        ? "少しだけ外と中が違う。親しくなると「意外」と言われることがある"
        : "外と中がほぼ一致している。裏表が少ない";

  // プロフィールキーワード
  const keywords: string[] = [];
  if (get("analytical_vs_intuitive") < -0.3) keywords.push("論理的");
  if (get("analytical_vs_intuitive") > 0.3) keywords.push("直感的");
  if (get("introvert_vs_extrovert") > 0.3) keywords.push("社交的");
  if (get("introvert_vs_extrovert") < -0.3) keywords.push("内省的");
  if (get("function_vs_expression") > 0.3) keywords.push("表現豊か");
  if (get("quality_vs_quantity") < -0.3) keywords.push("こだわり派");
  if (get("cautious_vs_bold") > 0.3) keywords.push("チャレンジャー");
  if (get("emotional_regulation") > 0.3) keywords.push("安定感");
  if (get("independence_vs_harmony") < -0.3) keywords.push("マイペース");
  if (get("independence_vs_harmony") > 0.3) keywords.push("チームワーク");

  return {
    firstImpression,
    approachability,
    deeperReality,
    gapDescription,
    profileKeywords: keywords.slice(0, 5),
  };
}

// ═══════════════════════════════════════════════════════════
// 5. Daily Observation → Stargazer 連携サマリー
// ═══════════════════════════════════════════════════════════

export interface SystemConnectionSummary {
  genome: {
    connected: boolean;
    contribution: GenomeAxisContribution[];
  };
  rendezvous: {
    connected: boolean;
    matchingVector: MatchingVector;
    safetyFlags: string[];
  };
  origin: {
    connected: boolean;
    hints: OriginConnectionHint[];
  };
  presence: {
    connected: boolean;
    insight: PresenceInsight;
  };
  dailyObservation: {
    connected: boolean;
    observationCount: number;
  };
}

/**
 * 全システム接続状況のサマリーを生成
 * StargazerのUIで「どのシステムと繋がっているか」を表示するために使用
 */
export function getSystemConnectionSummary(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  observationCount: number
): SystemConnectionSummary {
  const hasData = Object.keys(axisScores).length > 0;

  return {
    genome: {
      connected: hasData,
      contribution: hasData ? convertToGenomeAxes(axisScores) : [],
    },
    rendezvous: {
      connected: hasData,
      matchingVector: hasData
        ? convertToMatchingVector(axisScores)
        : {
            conversation_temperature: 0.5,
            distance_need: 0.5,
            depth_speed: 0.5,
            stability_need: 0.5,
            stimulation_need: 0.5,
            initiative: 0.5,
            emotional_openness: 0.5,
            conflict_directness: 0.5,
            social_energy: 0.5,
            structure_preference: 0.5,
          },
      safetyFlags: [],
    },
    origin: {
      connected: hasData,
      hints: hasData ? generateOriginHints(axisScores) : [],
    },
    presence: {
      connected: hasData,
      insight: generatePresenceInsight(axisScores),
    },
    dailyObservation: {
      connected: true,
      observationCount,
    },
  };
}
