// lib/onboarding/impossibleAccuracy.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// The Impossible Accuracy Moment（不可能な精度の瞬間）
//
// 脳科学的根拠:
// ACC（前帯状皮質）は「自分について言い当てられた」ときに
// 最も強く活性化する。
// この瞬間が「このアプリは本物だ」の確信を作る。
//
// 手法: Barnum効果 + 実データの精密な組み合わせ
// - 普遍的だが個人的に感じる記述（Barnum効果基盤）
// - 実際の回答データで個別化（データ裏付け）
// - 迷い/応答速度のメタデータで深化（行動信号の活用）
//
// 既存資産:
// generateFirstGlimpse() の出力を拡張する追加レイヤー。
// coreNeed / blindSpotHint に加えて:
// - 「あなたが今最も避けていること」（回避行動の推定）
// - 「あなたが言語化できていない欲求」（潜在欲求の言語化）
// - 「あなたの矛盾の種」（矛盾の最初の予兆）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 不可能な精度の洞察 */
export interface ImpossibleAccuracyInsight {
  /** あなたが今最も避けていること */
  avoidance: {
    text: string;
    confidence: number;
  };
  /** あなたが言語化できていない欲求 */
  latentDesire: {
    text: string;
    confidence: number;
  };
  /** あなたの矛盾の種（最初の予兆） */
  contradictionSeed: {
    text: string;
    confidence: number;
  };
  /** 最も衝撃的な一文（1行で刺す） */
  punchLine: string;
  /** 全体の精度推定（Barnum効果込み、0-1） */
  perceivedAccuracy: number;
}

/** マイクロ観測の回答データ */
export interface MicroObservationData {
  /** 各質問の回答 */
  answers: {
    questionId: string;
    selectedValue: string;
    responseTimeMs: number;
    /** 迷った（ホバーした選択肢） */
    hoveredOptions: string[];
  }[];
  /** 蓄積された軸スコア */
  accumulatedAxes: Partial<Record<TraitAxisKey, number>>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Avoidance Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 回避行動の推定
 *
 * 手がかり:
 * 1. 最も応答時間が長かった質問 → その領域に葛藤がある
 * 2. ホバーしたが選ばなかった選択肢 → 意識的に避けた可能性
 * 3. 軸スコアの極端さ → 0/1に近い回答は防衛的可能性
 */
function detectAvoidance(
  data: MicroObservationData,
): { text: string; confidence: number } {
  // 最も応答が遅かった質問を特定
  const slowest = [...data.answers].sort(
    (a, b) => b.responseTimeMs - a.responseTimeMs,
  )[0];

  // ホバーしたが選ばなかった選択肢がある → 意識的回避
  const hasHoverAvoidance =
    slowest &&
    slowest.hoveredOptions.length > 0 &&
    !slowest.hoveredOptions.includes(slowest.selectedValue);

  // 軸スコアの極端さチェック
  const extremeAxes = Object.entries(data.accumulatedAxes)
    .filter(([, v]) => v !== undefined && (Math.abs(v) > 0.6))
    .map(([k]) => k as TraitAxisKey);

  // 回避パターンの組み合わせ
  const avoidanceTemplates = getAvoidanceTemplates(
    data.accumulatedAxes,
    hasHoverAvoidance,
    extremeAxes,
  );

  if (avoidanceTemplates.length === 0) {
    return {
      text: "まだ見えていない部分がある。それを見つけるのが、ここからの旅",
      confidence: 0.3,
    };
  }

  // 最も確信度の高いテンプレートを選択
  const best = avoidanceTemplates.sort((a, b) => b.confidence - a.confidence)[0];
  return best;
}

function getAvoidanceTemplates(
  axes: Partial<Record<TraitAxisKey, number>>,
  hasHoverAvoidance: boolean,
  extremeAxes: TraitAxisKey[],
): { text: string; confidence: number }[] {
  const templates: { text: string; confidence: number }[] = [];

  // 感情関連の回避
  if ((axes.emotional_variability ?? 0) > 0.4 && (axes.emotional_regulation ?? 0) > 0.3) {
    templates.push({
      text: "感情を「コントロールすべきもの」として扱っている。でも、コントロールしきれない瞬間にこそ、本当のあなたが現れる。その瞬間を、あなたは避けている",
      confidence: 0.7,
    });
  }

  // 対人関係の回避
  if ((axes.public_private_gap ?? 0) > 0.4) {
    templates.push({
      text: "「本当の自分」を見せることを避けている。人前で演じるコストを払い続けている。問題は、演技が上手すぎて、自分でも本音が見えなくなることがあること",
      confidence: 0.7,
    });
  }

  // 衝突の回避
  if ((axes.direct_vs_diplomatic ?? 0) > 0.4 && (axes.independence_vs_harmony ?? 0) > 0.3) {
    templates.push({
      text: "衝突を避けている。それは優しさではなく、「嫌われること」への恐怖かもしれない。あなたが本当に避けているのは、相手の反応を見ること",
      confidence: 0.65,
    });
  }

  // 深い関係の回避
  if ((axes.boundary_awareness ?? 0) > 0.5 && (axes.intimacy_pace ?? 0) < -0.2) {
    templates.push({
      text: "人との距離を、無意識に管理している。近づきすぎると危険だと知っているから。でも、その「安全距離」の内側に入れる人がいないことに、気づいている",
      confidence: 0.65,
    });
  }

  // 変化の回避
  if ((axes.change_embrace_vs_resist ?? 0) < -0.3) {
    templates.push({
      text: "変化を避けている。今の自分を手放すことが怖い。でも、あなたが本当に恐れているのは変化そのものではなく、変化した先の自分が「今の自分より劣っていたらどうしよう」という可能性",
      confidence: 0.6,
    });
  }

  // ホバー回避（データ裏付け）
  if (hasHoverAvoidance) {
    templates.push({
      text: "さっき、一つの選択肢に心が動いたのに選ばなかった。その瞬間の「引っ込め」が、あなたの日常的なパターンかもしれない",
      confidence: 0.8, // 実データに基づくため高い
    });
  }

  return templates;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Latent Desire Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 潜在欲求の言語化
 *
 * 「自分では気づいていないが、実は強く求めているもの」
 * 軸スコアの組み合わせパターンから推定。
 */
function detectLatentDesire(
  axes: Partial<Record<TraitAxisKey, number>>,
): { text: string; confidence: number } {
  const templates: { text: string; confidence: number; condition: boolean }[] = [
    {
      condition:
        (axes.introvert_vs_extrovert ?? 0) < -0.2 &&
        (axes.individual_vs_social ?? 0) > 0.3,
      text: "一人を好むのに、「理解される」ことを強く求めている。表面的な社交は疲れるが、深い繋がりへの渇望は人一倍強い。数ではなく、質で満たされたい",
      confidence: 0.7,
    },
    {
      condition:
        (axes.analytical_vs_intuitive ?? 0) < -0.3 &&
        (axes.emotional_variability ?? 0) > 0.3,
      text: "論理で武装しているが、本当は感情を全開にできる場所を求めている。分析は安全装置。その奥にある「制御不能な感情」を受け止めてもらいたい",
      confidence: 0.7,
    },
    {
      condition:
        (axes.perfectionist_vs_pragmatic ?? 0) < -0.3 &&
        (axes.cautious_vs_bold ?? 0) < -0.2,
      text: "完璧を追い求めているが、本当に欲しいのは「不完全なままでいい」と言ってもらうこと。高い基準は、自分を守る壁でもある",
      confidence: 0.65,
    },
    {
      condition:
        (axes.independence_vs_harmony ?? 0) < -0.3 &&
        (axes.stress_isolation_vs_social ?? 0) < -0.2,
      text: "自立を大切にしているが、本当は誰かに頼りたい。「頼ることは弱さ」という信念が邪魔をしている。あなたが求めているのは、頼れる相手ではなく、頼ることへの許可",
      confidence: 0.65,
    },
    {
      condition:
        (axes.public_private_gap ?? 0) > 0.3 &&
        (axes.direct_vs_diplomatic ?? 0) > 0.2,
      text: "「本当の自分」を見せられる場所を探している。演じることに疲れている。でも、素の自分が受け入れられるか確信が持てないから、演じ続けている",
      confidence: 0.7,
    },
    {
      condition:
        (axes.tradition_vs_novelty ?? 0) > 0.3 &&
        (axes.change_embrace_vs_resist ?? 0) < -0.2,
      text: "新しいことに惹かれるのに、変化を恐れている。あなたが本当に欲しいのは「安全な冒険」——リスクなしの新しさ。でもそんなものは存在しない。だからここに来た",
      confidence: 0.6,
    },
    {
      condition:
        (axes.reassurance_need ?? 0) > 0.3 &&
        (axes.emotional_regulation ?? 0) > 0.3,
      text: "「自分は大丈夫」と言い聞かせているが、本当は誰かに「大丈夫じゃなくていいよ」と言ってほしい。強さの仮面は、いつか重くなる",
      confidence: 0.7,
    },
    {
      condition:
        (axes.social_initiative ?? 0) > 0.3 &&
        (axes.public_private_gap ?? 0) > 0.2,
      text: "社交的に振る舞えるが、それは「技術」であって「自然体」ではない。一人になった瞬間の安堵感を知っている。でもその安堵が寂しさに変わる瞬間も",
      confidence: 0.65,
    },
  ];

  const matched = templates.filter((t) => t.condition);
  if (matched.length === 0) {
    return {
      text: "言葉にならない何かを探している。それを見つけるのが、この観測の目的",
      confidence: 0.4,
    };
  }

  return matched.sort((a, b) => b.confidence - a.confidence)[0];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Contradiction Seed Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 矛盾の種の検出
 *
 * 3問の回答から、将来的に矛盾として顕在化する可能性がある
 * 内的緊張を予兆として検出する。
 */
function detectContradictionSeed(
  axes: Partial<Record<TraitAxisKey, number>>,
  answers: MicroObservationData["answers"],
): { text: string; confidence: number } {
  // 矛盾の候補パターン
  const contradictions: { text: string; confidence: number; condition: boolean }[] = [
    {
      condition:
        (axes.introvert_vs_extrovert ?? 0) < -0.2 &&
        (axes.social_initiative ?? 0) > 0.3,
      text: "一人を好むのに、社交的な場では積極的になる。この二面性は矛盾ではなく、あなたの中に「2つの自分」がいる証拠。どちらが本物か？——どちらも本物",
      confidence: 0.7,
    },
    {
      condition:
        (axes.cautious_vs_bold ?? 0) > 0.3 &&
        (axes.plan_vs_spontaneous ?? 0) < -0.2,
      text: "大胆に見えるのに、実は緻密に計画している。「衝動的に見せかけた計算」がある。あなたが恐れているのは、計画通りにいかないことではなく、計画していることがバレること",
      confidence: 0.65,
    },
    {
      condition:
        (axes.emotional_regulation ?? 0) > 0.3 &&
        (axes.emotional_variability ?? 0) > 0.4,
      text: "感情を上手くコントロールしているように見えるが、内側では激しく揺れている。その「制御の膜」がいつか限界を迎えたとき、何が起きるか。それがあなたの最大の盲点",
      confidence: 0.7,
    },
    {
      condition:
        (axes.direct_vs_diplomatic ?? 0) > 0.3 &&
        (axes.independence_vs_harmony ?? 0) > 0.3,
      text: "波風を立てたくないのに、嘘はつけない。この二つが衝突する場面で、あなたは沈黙を選ぶ。沈黙は平和でも正直でもない——ただの延期",
      confidence: 0.65,
    },
    {
      condition:
        (axes.perfectionist_vs_pragmatic ?? 0) < -0.3 &&
        (axes.plan_vs_spontaneous ?? 0) > 0.2,
      text: "完璧主義なのに、計画通りにいかないことを密かに楽しんでいる。予想外の展開に、自分の適応力を試したい欲求がある",
      confidence: 0.65,
    },
    {
      condition:
        (axes.reassurance_need ?? 0) > 0.3 &&
        (axes.independence_vs_harmony ?? 0) < -0.3,
      text: "自立を重視するのに、承認を強く求めている。「認められなくていい」と言いながら、認められないと深く傷つく。この矛盾が、あなたの成長エンジン",
      confidence: 0.7,
    },
  ];

  const matched = contradictions.filter((c) => c.condition);
  if (matched.length === 0) {
    // 応答速度の矛盾を検出
    if (answers.length >= 2) {
      const times = answers.map((a) => a.responseTimeMs);
      const maxDiff = Math.max(...times) / Math.max(1, Math.min(...times));
      if (maxDiff > 3) {
        return {
          text: "ある質問には即答し、別の質問には長く迷った。この「速度の差」が、あなたの内面の地形を描いている。確信がある領域と、整理がついていない領域の境界線",
          confidence: 0.6,
        };
      }
    }

    return {
      text: "まだ矛盾は見えていない。でも、観測を続けると必ず見つかる。矛盾がない人はいない——見えていないだけ",
      confidence: 0.4,
    };
  }

  return matched.sort((a, b) => b.confidence - a.confidence)[0];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Punch Line Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 最も衝撃的な一文を生成
 *
 * 全ての分析結果を統合し、
 * 「この1文で心を掴む」パンチラインを生成する。
 */
function generatePunchLine(
  avoidance: { text: string; confidence: number },
  latentDesire: { text: string; confidence: number },
  contradictionSeed: { text: string; confidence: number },
  axes: Partial<Record<TraitAxisKey, number>>,
): string {
  // 最も信頼度の高い分析をパンチラインの素材に
  const bestConfidence = Math.max(
    avoidance.confidence,
    latentDesire.confidence,
    contradictionSeed.confidence,
  );

  if (avoidance.confidence === bestConfidence && avoidance.confidence >= 0.6) {
    // 回避ベースのパンチライン
    if ((axes.public_private_gap ?? 0) > 0.4) {
      return "あなたは、自分を演じることに疲れていることすら、演じている。";
    }
    if ((axes.boundary_awareness ?? 0) > 0.4) {
      return "あなたの優しさは、本当は壁でできている。";
    }
  }

  if (latentDesire.confidence === bestConfidence && latentDesire.confidence >= 0.6) {
    // 潜在欲求ベースのパンチライン
    if ((axes.analytical_vs_intuitive ?? 0) < -0.3) {
      return "論理武装の奥に、ただ「分かってほしい」という子供がいる。";
    }
    if ((axes.introvert_vs_extrovert ?? 0) < -0.3) {
      return "一人を選び続ける人ほど、理解されたい欲求が深い。";
    }
  }

  if (contradictionSeed.confidence >= 0.6) {
    return "あなたの中に、正反対のあなたが住んでいる。どちらも本物。";
  }

  // 追加パンチライン
  if ((axes.perfectionist_vs_pragmatic ?? 0) < -0.3) {
    return "完璧を目指すのは、不完全な自分を許せないから。でも、不完全さこそがあなたを人間にしている。";
  }

  if ((axes.stress_isolation_vs_social ?? 0) < -0.3) {
    return "一人で抱え込むのは強さじゃない。誰にも頼れないと決めつけたのは、あなた自身。";
  }

  if ((axes.cautious_vs_bold ?? 0) > 0.4) {
    return "大胆に見えるけど、本当に怖いことには手を出していない。そのことに、気づいてる？";
  }

  if ((axes.reassurance_need ?? 0) > 0.4) {
    return "「大丈夫？」って聞いてほしいのに、自分からは絶対聞かせない。それが、あなたのプライド。";
  }

  if ((axes.intimacy_pace ?? 0) > 0.3 && (axes.boundary_awareness ?? 0) > 0.3) {
    return "ゆっくり近づくのは、傷つくのが怖いから。でも本当は、傷つけることのほうが怖い。";
  }

  // 汎用パンチライン（Barnum効果最大化）
  return "あなたが最も恐れていることは、自分が最も必要としていることと、驚くほど似ている。";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 6. Main Entry Point
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 不可能な精度の洞察を生成
 *
 * InitialOnboardingFlow の generateFirstGlimpse() を拡張する
 * 追加レイヤーとして機能。
 *
 * 使い方:
 * ```
 * const firstGlimpse = generateFirstGlimpse(mergedAxes);
 * const impossible = generateImpossibleAccuracy(microData);
 * // firstGlimpse.coreNeed + impossible.avoidance + impossible.latentDesire
 * // を段階的に表示
 * ```
 */
export function generateImpossibleAccuracy(
  data: MicroObservationData,
): ImpossibleAccuracyInsight {
  const avoidance = detectAvoidance(data);
  const latentDesire = detectLatentDesire(data.accumulatedAxes);
  const contradictionSeed = detectContradictionSeed(
    data.accumulatedAxes,
    data.answers,
  );
  const punchLine = generatePunchLine(
    avoidance,
    latentDesire,
    contradictionSeed,
    data.accumulatedAxes,
  );

  // 全体の知覚精度（Barnum効果込み）
  // 実際の精度は低くても、ユーザーは「当たっている」と感じる
  const perceivedAccuracy = Math.min(
    0.95,
    0.5 + // Barnum効果のベースライン
      avoidance.confidence * 0.15 +
      latentDesire.confidence * 0.15 +
      contradictionSeed.confidence * 0.15,
  );

  return {
    avoidance,
    latentDesire,
    contradictionSeed,
    punchLine,
    perceivedAccuracy,
  };
}
