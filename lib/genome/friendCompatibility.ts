// lib/genome/friendCompatibility.ts
// 友達相性スコアリングエンジン — ルールベース（高速・AI不要）

/* ══════════════════════════════════════════════
   型定義
   ══════════════════════════════════════════════ */

export interface FriendProfile {
  userId: string;
  displayName: string | null;
  /** 15軸スコア (0-1) — personality_dimensions から */
  dimensionScores: Record<string, number>;
  /** パーソナルカラー季節 */
  pcSeason: string | null;
  /** コンステレーションコード */
  archetypeCode: string | null;
  /** スタイルレーン */
  styleLanes: string[];
  /** 5軸レーダー (0-100) */
  radarAxes: {
    analytical: number;
    cautious: number;
    social: number;
    expressive: number;
    independent: number;
  } | null;
}

export interface CategoryScore {
  score: number;
  label: string;
  detail: string;
}

export interface TraitComparison {
  axis: string;
  axisLabel: string;
  myScore: number;
  friendScore: number;
  insight: string;
}

export interface FrictionPoint {
  situation: string;
  myReaction: string;
  friendReaction: string;
  advice: string;
}

export interface FriendReport {
  overallScore: number;

  categories: {
    personality: CategoryScore;
    vibe: CategoryScore;
    style: CategoryScore;
    values: CategoryScore;
  };

  strengths: string[];
  watchOuts: string[];
  bestActivities: string[];
  traitComparisons: TraitComparison[];
  frictionPoints: FrictionPoint[];
}

/* ══════════════════════════════════════════════
   軸定義
   ══════════════════════════════════════════════ */

const PERSONALITY_AXES = [
  "analytical_vs_intuitive",
  "cautious_vs_bold",
  "introvert_vs_extrovert",
  "independence_vs_harmony",
  "emotional_stable_vs_volatile",
] as const;

const VALUES_AXES = [
  "quality_vs_quantity",
  "tradition_vs_novelty",
  "change_embrace_vs_resist",
] as const;

const STYLE_AXES = [
  "minimal_vs_maximal",
  "function_vs_expression",
  "classic_vs_trendy",
] as const;

const SOCIAL_AXES = [
  "direct_vs_diplomatic",
  "individual_vs_social",
  "plan_vs_spontaneous",
  "stress_external_vs_internal",
] as const;

const AXIS_LABELS: Record<string, string> = {
  analytical_vs_intuitive: "分析 vs 直感",
  cautious_vs_bold: "慎重 vs 大胆",
  introvert_vs_extrovert: "内向 vs 外向",
  independence_vs_harmony: "独立 vs 調和",
  emotional_stable_vs_volatile: "安定 vs 情熱",
  quality_vs_quantity: "質 vs 量",
  tradition_vs_novelty: "伝統 vs 革新",
  change_embrace_vs_resist: "変化 vs 安定",
  minimal_vs_maximal: "ミニマル vs マキシマル",
  function_vs_expression: "機能 vs 表現",
  classic_vs_trendy: "クラシック vs トレンド",
  direct_vs_diplomatic: "率直 vs 配慮",
  individual_vs_social: "個人 vs 集団",
  plan_vs_spontaneous: "計画 vs 即興",
  stress_external_vs_internal: "外発散 vs 内処理",
};

/* ══════════════════════════════════════════════
   スコア計算
   ══════════════════════════════════════════════ */

function computeAxisGroupScore(
  mine: Record<string, number>,
  theirs: Record<string, number>,
  axes: readonly string[],
): number {
  let totalSim = 0;
  let count = 0;
  for (const axis of axes) {
    const my = mine[axis];
    const their = theirs[axis];
    if (my == null || their == null) continue;
    const diff = Math.abs(my - their);
    // 類似性: 差が小さいほど高い（0-1）
    // ただし完全に同じよりも少し違うほうが面白い → 0.05-0.15の差が最高
    const similarity = diff < 0.15
      ? 1.0 - diff * 0.5   // 近い: 0.925-1.0
      : diff < 0.35
        ? 0.85 - (diff - 0.15) * 1.5  // やや違う: 0.55-0.85
        : diff < 0.55
          ? 0.6 - (diff - 0.35) * 1.0  // 違う: 0.4-0.6（補完的）
          : 0.4 - (diff - 0.55) * 0.8; // 大きく違う: 0.04-0.4
    totalSim += Math.max(0, Math.min(1, similarity));
    count++;
  }
  return count > 0 ? Math.round((totalSim / count) * 100) : 50;
}

function computeStyleScore(mine: FriendProfile, theirs: FriendProfile): number {
  let score = 50;

  // 軸ベーススコア
  const axisScore = computeAxisGroupScore(mine.dimensionScores, theirs.dimensionScores, STYLE_AXES);
  score = axisScore;

  // パーソナルカラーボーナス
  if (mine.pcSeason && theirs.pcSeason) {
    if (mine.pcSeason === theirs.pcSeason) {
      score = Math.min(100, score + 8); // 同じ季節
    } else if (areSeasonsComplementary(mine.pcSeason, theirs.pcSeason)) {
      score = Math.min(100, score + 5); // 補完的な季節
    }
  }

  // スタイルレーン重複ボーナス
  const overlap = mine.styleLanes.filter((l) => theirs.styleLanes.includes(l)).length;
  score = Math.min(100, score + overlap * 4);

  return score;
}

function areSeasonsComplementary(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase();
  const pairs = [
    ["spring", "autumn"],
    ["summer", "winter"],
  ];
  return pairs.some(
    ([x, y]) =>
      (norm(a).includes(x) && norm(b).includes(y)) ||
      (norm(a).includes(y) && norm(b).includes(x)),
  );
}

function computeVibeScore(mine: FriendProfile, theirs: FriendProfile): number {
  // Vibe = 社交軸 + レーダーの近さ
  let score = computeAxisGroupScore(mine.dimensionScores, theirs.dimensionScores, SOCIAL_AXES);

  // レーダー比較ボーナス
  if (mine.radarAxes && theirs.radarAxes) {
    const keys: (keyof typeof mine.radarAxes)[] = ["analytical", "cautious", "social", "expressive", "independent"];
    let radarSim = 0;
    for (const key of keys) {
      const diff = Math.abs((mine.radarAxes[key] ?? 50) - (theirs.radarAxes[key] ?? 50));
      radarSim += 1 - diff / 100;
    }
    const radarAvg = (radarSim / keys.length) * 100;
    score = Math.round((score + radarAvg) / 2);
  }

  return score;
}

/* ══════════════════════════════════════════════
   インサイト生成（ルールベース）
   ══════════════════════════════════════════════ */

function generateTraitComparisons(mine: FriendProfile, theirs: FriendProfile): TraitComparison[] {
  const allAxes = [...PERSONALITY_AXES, ...VALUES_AXES, ...STYLE_AXES, ...SOCIAL_AXES];
  const comparisons: TraitComparison[] = [];

  for (const axis of allAxes) {
    const my = mine.dimensionScores[axis];
    const their = theirs.dimensionScores[axis];
    if (my == null || their == null) continue;

    const diff = Math.abs(my - their);
    if (diff < 0.1) continue; // あまりに近い軸はスキップ

    const insight = generateAxisInsight(axis, my, their, diff);
    if (insight) {
      comparisons.push({
        axis,
        axisLabel: AXIS_LABELS[axis] ?? axis,
        myScore: Math.round(my * 100),
        friendScore: Math.round(their * 100),
        insight,
      });
    }
  }

  // 差が大きい順にソート、上位5つ
  return comparisons.sort((a, b) => Math.abs(a.myScore - a.friendScore) - Math.abs(b.myScore - b.friendScore)).reverse().slice(0, 5);
}

function generateAxisInsight(axis: string, my: number, their: number, diff: number): string | null {
  const INSIGHTS: Record<string, { similar: string; complementary: string; contrast: string }> = {
    analytical_vs_intuitive: {
      similar: "お互いに同じ思考スタイルなので、議論がスムーズに進みやすい",
      complementary: "一方が分析、もう一方が直感。議論が面白くなる組み合わせ",
      contrast: "考え方のプロセスが大きく異なるため、新しい視点をもらえる",
    },
    cautious_vs_bold: {
      similar: "リスクに対する感覚が近いので、一緒に行動しやすい",
      complementary: "慎重さと大胆さのバランスが取れる関係",
      contrast: "一方がブレーキ、もう一方がアクセル。良いチームになれる",
    },
    introvert_vs_extrovert: {
      similar: "エネルギーの充電方法が同じなので、一緒にいて疲れにくい",
      complementary: "お互いの世界を広げてくれる関係",
      contrast: "遊び方の好みが違うかも。でもそれぞれの世界を見せ合える",
    },
    independence_vs_harmony: {
      similar: "人との距離感が近いので、自然体でいられる",
      complementary: "自律と調和のバランスが絶妙な関係",
      contrast: "一人の時間と一緒の時間の感覚が違う。尊重がカギ",
    },
    emotional_stable_vs_volatile: {
      similar: "感情の波が似ているので、お互いの気持ちが理解しやすい",
      complementary: "一方が落ち着かせ、もう一方が盛り上げる名コンビ",
      contrast: "感情の出し方が違う。驚くこともあるけど、学びも多い",
    },
    quality_vs_quantity: {
      similar: "ものの選び方が近いので、買い物や食事が楽しい",
      complementary: "こだわりポイントがちょうど補い合える",
      contrast: "選ぶ基準が全然違う。新しい発見のチャンス",
    },
    tradition_vs_novelty: {
      similar: "新しいもの・古いものへの感覚が近い",
      complementary: "伝統と革新のいいとこ取りができる関係",
      contrast: "趣味や興味が違う方向。お互いに新しい世界を見せられる",
    },
    plan_vs_spontaneous: {
      similar: "旅行やイベントの計画がスムーズに立てられる",
      complementary: "計画性と柔軟性がちょうどよくミックス",
      contrast: "予定の立て方で意見が割れるかも。事前に相談がおすすめ",
    },
    direct_vs_diplomatic: {
      similar: "コミュニケーションスタイルが近いのでストレスが少ない",
      complementary: "率直さと配慮のバランスが取れている",
      contrast: "伝え方の違いに最初は戸惑うかも。でも慣れると心地よい",
    },
    stress_external_vs_internal: {
      similar: "ストレス時の対処法が似ているので、支え合いやすい",
      complementary: "一方が話し、もう一方が聞く。良い関係",
      contrast: "疲れたときの行動が真逆。お互いのペースを尊重して",
    },
  };

  const rules = INSIGHTS[axis];
  if (!rules) return null;

  if (diff < 0.2) return rules.similar;
  if (diff < 0.4) return rules.complementary;
  return rules.contrast;
}

function generateStrengths(
  mine: FriendProfile,
  theirs: FriendProfile,
  overallScore: number,
): string[] {
  const strengths: string[] = [];

  // 全体スコアベース
  if (overallScore >= 75) {
    strengths.push("自然体でいられる関係。無理せず一緒にいられる");
  }
  if (overallScore >= 60) {
    strengths.push("お互いの違いが刺激になり、成長できる関係");
  }

  // 特定の軸の組み合わせ
  const myExt = mine.dimensionScores.introvert_vs_extrovert ?? 0.5;
  const theirExt = theirs.dimensionScores.introvert_vs_extrovert ?? 0.5;
  if (Math.abs(myExt - theirExt) < 0.15) {
    strengths.push("エネルギーの使い方が似ていて、一緒にいて疲れにくい");
  }

  const myBold = mine.dimensionScores.cautious_vs_bold ?? 0.5;
  const theirBold = theirs.dimensionScores.cautious_vs_bold ?? 0.5;
  if (myBold > 0.6 && theirBold < 0.4) {
    strengths.push("大胆さと慎重さが補い合える最高のバランス");
  } else if (myBold < 0.4 && theirBold > 0.6) {
    strengths.push("大胆さと慎重さが補い合える最高のバランス");
  }

  // スタイル重複
  const overlap = mine.styleLanes.filter((l) => theirs.styleLanes.includes(l));
  if (overlap.length >= 2) {
    strengths.push("ファッションの好みが近い。一緒にショッピングが楽しそう");
  }

  // パーソナルカラー
  if (mine.pcSeason && theirs.pcSeason && mine.pcSeason === theirs.pcSeason) {
    strengths.push("パーソナルカラーが同じ。似合う色の感覚が近い");
  }

  return strengths.slice(0, 4);
}

function generateWatchOuts(mine: FriendProfile, theirs: FriendProfile): string[] {
  const watchOuts: string[] = [];

  // ストレス対処の違い
  const myStress = mine.dimensionScores.stress_external_vs_internal ?? 0.5;
  const theirStress = theirs.dimensionScores.stress_external_vs_internal ?? 0.5;
  if (Math.abs(myStress - theirStress) > 0.4) {
    watchOuts.push("疲れている時に求めるものが違う。そっとしてほしい時と話したい時のズレに注意");
  }

  // 計画性の違い
  const myPlan = mine.dimensionScores.plan_vs_spontaneous ?? 0.5;
  const theirPlan = theirs.dimensionScores.plan_vs_spontaneous ?? 0.5;
  if (Math.abs(myPlan - theirPlan) > 0.4) {
    watchOuts.push("予定の立て方で衝突しやすい。事前に「ざっくり」か「きっちり」か確認を");
  }

  // 感情の波
  const myEmo = mine.dimensionScores.emotional_stable_vs_volatile ?? 0.5;
  const theirEmo = theirs.dimensionScores.emotional_stable_vs_volatile ?? 0.5;
  if (Math.abs(myEmo - theirEmo) > 0.4) {
    watchOuts.push("感情の出し方が違う。相手の表現に驚いても、否定せずまず受け止めて");
  }

  // 率直さ
  const myDirect = mine.dimensionScores.direct_vs_diplomatic ?? 0.5;
  const theirDirect = theirs.dimensionScores.direct_vs_diplomatic ?? 0.5;
  if (Math.abs(myDirect - theirDirect) > 0.4) {
    watchOuts.push("言い方の違いで傷つくことがあるかも。悪気がないことを思い出して");
  }

  return watchOuts.slice(0, 3);
}

function generateBestActivities(mine: FriendProfile, theirs: FriendProfile): string[] {
  const activities: string[] = [];

  const avgExt = ((mine.dimensionScores.introvert_vs_extrovert ?? 0.5) + (theirs.dimensionScores.introvert_vs_extrovert ?? 0.5)) / 2;
  const avgBold = ((mine.dimensionScores.cautious_vs_bold ?? 0.5) + (theirs.dimensionScores.cautious_vs_bold ?? 0.5)) / 2;
  const avgPlan = ((mine.dimensionScores.plan_vs_spontaneous ?? 0.5) + (theirs.dimensionScores.plan_vs_spontaneous ?? 0.5)) / 2;
  const avgNovelty = ((mine.dimensionScores.tradition_vs_novelty ?? 0.5) + (theirs.dimensionScores.tradition_vs_novelty ?? 0.5)) / 2;

  // 内向的なペア
  if (avgExt < 0.4) {
    activities.push("カフェでゆっくり読書", "美術館巡り", "おうち映画鑑賞会");
  } else if (avgExt > 0.6) {
    activities.push("フェスやイベント参加", "グループ旅行", "スポーツ観戦");
  } else {
    activities.push("カフェ巡り", "散歩しながらおしゃべり");
  }

  if (avgBold > 0.6) {
    activities.push("新しい料理に挑戦", "初めての場所を探検");
  }
  if (avgPlan < 0.4) {
    activities.push("ノープラン日帰り旅");
  }
  if (avgNovelty > 0.6) {
    activities.push("最新スポット開拓", "ポップアップイベント");
  }
  if (avgNovelty < 0.4) {
    activities.push("行きつけのお店でまったり", "定番コースの温泉旅行");
  }

  // スタイル関連
  const styleOverlap = mine.styleLanes.filter((l) => theirs.styleLanes.includes(l));
  if (styleOverlap.length > 0) {
    activities.push("一緒にショッピング");
  }

  // 重複排除して上位4つ
  return [...new Set(activities)].slice(0, 4);
}

function generateFrictionPoints(mine: FriendProfile, theirs: FriendProfile): FrictionPoint[] {
  const frictions: FrictionPoint[] = [];

  // ストレス下
  const myStress = mine.dimensionScores.stress_external_vs_internal ?? 0.5;
  const theirStress = theirs.dimensionScores.stress_external_vs_internal ?? 0.5;
  if (Math.abs(myStress - theirStress) > 0.35) {
    frictions.push({
      situation: "締切前のプレッシャー下で",
      myReaction: myStress > 0.5 ? "周りに愚痴を言って発散する" : "黙って一人で処理しようとする",
      friendReaction: theirStress > 0.5 ? "周りに愚痴を言って発散する" : "黙って一人で処理しようとする",
      advice: "お互いのストレス対処法を知っておくだけで、衝突が減る",
    });
  }

  // 計画性
  const myPlan = mine.dimensionScores.plan_vs_spontaneous ?? 0.5;
  const theirPlan = theirs.dimensionScores.plan_vs_spontaneous ?? 0.5;
  if (Math.abs(myPlan - theirPlan) > 0.35) {
    frictions.push({
      situation: "旅行の計画を立てるとき",
      myReaction: myPlan > 0.5 ? "しっかり予定を組みたい" : "行き当たりばったりで楽しみたい",
      friendReaction: theirPlan > 0.5 ? "しっかり予定を組みたい" : "行き当たりばったりで楽しみたい",
      advice: "大枠だけ決めて、あとはフリータイムにすると両方満足",
    });
  }

  // 率直さ
  const myDirect = mine.dimensionScores.direct_vs_diplomatic ?? 0.5;
  const theirDirect = theirs.dimensionScores.direct_vs_diplomatic ?? 0.5;
  if (Math.abs(myDirect - theirDirect) > 0.35) {
    frictions.push({
      situation: "意見が合わなかったとき",
      myReaction: myDirect > 0.5 ? "はっきり伝えたい" : "空気を読んで遠回しに言う",
      friendReaction: theirDirect > 0.5 ? "はっきり伝えたい" : "空気を読んで遠回しに言う",
      advice: "「言い方」を調整するだけで、内容は同じでも受け止め方が変わる",
    });
  }

  // 感情の波
  const myEmo = mine.dimensionScores.emotional_stable_vs_volatile ?? 0.5;
  const theirEmo = theirs.dimensionScores.emotional_stable_vs_volatile ?? 0.5;
  if (Math.abs(myEmo - theirEmo) > 0.35) {
    frictions.push({
      situation: "感動する映画を観た後",
      myReaction: myEmo > 0.5 ? "興奮して感想を語りまくる" : "静かに余韻に浸りたい",
      friendReaction: theirEmo > 0.5 ? "興奮して感想を語りまくる" : "静かに余韻に浸りたい",
      advice: "相手のペースに合わせる余裕を持つと、お互い心地よい",
    });
  }

  return frictions.slice(0, 3);
}

/* ══════════════════════════════════════════════
   メイン関数
   ══════════════════════════════════════════════ */

export function computeFriendCompatibility(
  mine: FriendProfile,
  theirs: FriendProfile,
): FriendReport {
  // 4カテゴリスコア
  const personalityScore = computeAxisGroupScore(mine.dimensionScores, theirs.dimensionScores, PERSONALITY_AXES);
  const vibeScore = computeVibeScore(mine, theirs);
  const styleScore = computeStyleScore(mine, theirs);
  const valuesScore = computeAxisGroupScore(mine.dimensionScores, theirs.dimensionScores, VALUES_AXES);

  // 全体スコア（加重平均）
  const overallScore = Math.round(
    personalityScore * 0.30 +
    vibeScore * 0.25 +
    styleScore * 0.20 +
    valuesScore * 0.25,
  );

  // ラベル生成
  const labelFor = (score: number): string => {
    if (score >= 80) return "最高の相性";
    if (score >= 65) return "とても良い相性";
    if (score >= 50) return "良い相性";
    if (score >= 35) return "補い合える関係";
    return "刺激的な関係";
  };

  const detailFor = (category: string, score: number): string => {
    const quality = score >= 65 ? "近い" : score >= 45 ? "程よく異なる" : "大きく異なる";
    const map: Record<string, string> = {
      personality: `性格の根幹が${quality}。${score >= 60 ? "自然体でいられる" : "お互いに新しい発見がある"}関係`,
      vibe: `空気感が${quality}。${score >= 60 ? "一緒にいて心地よい" : "刺激し合える"}テンション`,
      style: `美意識が${quality}。${score >= 60 ? "好みが合う" : "新しい視点をもらえる"}スタイル感覚`,
      values: `価値観が${quality}。${score >= 60 ? "大事なことが通じ合う" : "視野を広げてくれる"}関係`,
    };
    return map[category] ?? "";
  };

  return {
    overallScore,
    categories: {
      personality: { score: personalityScore, label: labelFor(personalityScore), detail: detailFor("personality", personalityScore) },
      vibe: { score: vibeScore, label: labelFor(vibeScore), detail: detailFor("vibe", vibeScore) },
      style: { score: styleScore, label: labelFor(styleScore), detail: detailFor("style", styleScore) },
      values: { score: valuesScore, label: labelFor(valuesScore), detail: detailFor("values", valuesScore) },
    },
    strengths: generateStrengths(mine, theirs, overallScore),
    watchOuts: generateWatchOuts(mine, theirs),
    bestActivities: generateBestActivities(mine, theirs),
    traitComparisons: generateTraitComparisons(mine, theirs),
    frictionPoints: generateFrictionPoints(mine, theirs),
  };
}
