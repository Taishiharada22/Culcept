// ============================================================
// Daily Resonance（日次共鳴）
// 毎日1つの自己理解ナッジを生成
// マッチ通知ではなく、自分を知る体験
// ============================================================

export type DailyResonance = {
  /** メインテキスト */
  text: string;
  /** 補足テキスト（短い気づき） */
  subtext: string;
  /** 生成に使われたシグナルの種類 */
  sourceType: ResonanceSourceType;
  /** 生成日 */
  date: string;
};

export type ResonanceSourceType =
  | "viewing_pattern"     // 閲覧パターンから
  | "swipe_pattern"       // スワイプパターンから
  | "time_pattern"        // 時間帯パターンから
  | "absence_reflection"  // 不在パターンから
  | "stargazer_echo"      // Stargazerデータの反映
  | "seasonal";           // 季節の変化から

type ViewingSignal = {
  candidateId: string;
  viewingDurationMs: number;
  category: string;
  dimensionHighlights: Record<string, number>;
};

type SwipeSignal = {
  direction: "like" | "pass";
  category: string;
  topDimension: string;
  topDimensionScore: number;
};

/**
 * 日次共鳴を生成
 *
 * ユーザーの行動パターンから「気づいていなかった自分」を映し出す。
 * これはAneurasyncの最高体験「自分って、そういう人間だったのか」に直結する。
 */
export function generateDailyResonance(opts: {
  userId: string;
  date: Date;
  recentViewings?: ViewingSignal[];
  recentSwipes?: SwipeSignal[];
  stargazerHighlight?: { axisName: string; value: number; label: string };
  activeHour?: number; // 最もアクティブな時間帯
  daysSinceLastOpen?: number;
}): DailyResonance {
  const { date, recentViewings, recentSwipes, stargazerHighlight, activeHour, daysSinceLastOpen } = opts;
  const dateStr = date.toISOString().slice(0, 10);

  // 優先度順にソース判定
  // 1. 不在からの復帰
  if (daysSinceLastOpen && daysSinceLastOpen >= 3) {
    return {
      text: "しばらく離れていた間も、あなたの分身は静かに観測を続けていました",
      subtext: "距離を置くことで見えるものがあります。あなたは「適度な距離」を必要とする人なのかもしれません",
      sourceType: "absence_reflection",
      date: dateStr,
    };
  }

  // 2. 閲覧パターンからの気づき
  if (recentViewings && recentViewings.length >= 3) {
    const insight = analyzeViewingPattern(recentViewings);
    if (insight) return { ...insight, date: dateStr };
  }

  // 3. スワイプパターンからの気づき
  if (recentSwipes && recentSwipes.length >= 5) {
    const insight = analyzeSwipePattern(recentSwipes);
    if (insight) return { ...insight, date: dateStr };
  }

  // 4. Stargazerエコー
  if (stargazerHighlight) {
    return {
      text: `あなたの「${stargazerHighlight.label}」という特性が、接続の選び方に影響しているようです`,
      subtext: "自覚していない特性ほど、選択に大きく影響します",
      sourceType: "stargazer_echo",
      date: dateStr,
    };
  }

  // 5. 時間帯パターン
  if (activeHour !== undefined) {
    return generateTimePatternResonance(activeHour, dateStr);
  }

  // 6. 季節の共鳴
  return generateSeasonalResonance(date, dateStr);
}

function analyzeViewingPattern(viewings: ViewingSignal[]): Omit<DailyResonance, "date"> | null {
  // 最も長く見たカードの特徴を分析
  const sorted = [...viewings].sort((a, b) => b.viewingDurationMs - a.viewingDurationMs);
  const longest = sorted[0];

  if (!longest || longest.viewingDurationMs < 5000) return null;

  // 長く見たカードに共通する高スコア次元を見つける
  const top3 = sorted.slice(0, 3);
  const dimensionCounts: Record<string, number> = {};
  for (const v of top3) {
    for (const [dim, score] of Object.entries(v.dimensionHighlights)) {
      if (score >= 0.7) {
        dimensionCounts[dim] = (dimensionCounts[dim] ?? 0) + 1;
      }
    }
  }

  const topDim = Object.entries(dimensionCounts).sort((a, b) => b[1] - a[1])[0];
  if (!topDim) return null;

  const dimLabel = DIMENSION_LABELS[topDim[0]] ?? topDim[0];
  return {
    text: `今週、あなたが最も時間をかけて見ていた分身には「${dimLabel}」の特徴がありました`,
    subtext: `${dimLabel}は、あなたにとって思っている以上に大切なものかもしれません`,
    sourceType: "viewing_pattern",
  };
}

function analyzeSwipePattern(swipes: SwipeSignal[]): Omit<DailyResonance, "date"> | null {
  const likes = swipes.filter((s) => s.direction === "like");
  const passes = swipes.filter((s) => s.direction === "pass");

  if (likes.length < 2 || passes.length < 2) return null;

  // likeカードの共通特徴
  const likeDims: Record<string, number[]> = {};
  for (const l of likes) {
    if (!likeDims[l.topDimension]) likeDims[l.topDimension] = [];
    likeDims[l.topDimension].push(l.topDimensionScore);
  }

  const mostLikedDim = Object.entries(likeDims)
    .sort((a, b) => b[1].length - a[1].length)[0];

  if (!mostLikedDim) return null;

  const dimLabel = DIMENSION_LABELS[mostLikedDim[0]] ?? mostLikedDim[0];
  return {
    text: `あなたが惹かれる分身には「${dimLabel}」が共通しています`,
    subtext: "無意識の選択パターンは、あなたが本当に求めているものを映し出します",
    sourceType: "swipe_pattern",
  };
}

function generateTimePatternResonance(
  activeHour: number,
  dateStr: string,
): DailyResonance {
  if (activeHour >= 22 || activeHour < 4) {
    return {
      text: "夜の静けさの中で接続を探すあなた。夜は内省が深まる時間です",
      subtext: "深夜の判断は、日中とは異なる本音が現れやすいと言われています",
      sourceType: "time_pattern",
      date: dateStr,
    };
  }

  if (activeHour >= 6 && activeHour < 10) {
    return {
      text: "朝の時間に接続を確認するあなた。一日の始まりに人との繋がりを意識する人です",
      subtext: "朝の習慣は、あなたにとって接続が「安心の源」であることを示しています",
      sourceType: "time_pattern",
      date: dateStr,
    };
  }

  return {
    text: "日中のひとときに接続を覗くあなた。忙しい中でも繋がりを忘れない人です",
    subtext: "接続は「余暇」ではなく「必要」なものなのかもしれません",
    sourceType: "time_pattern",
    date: dateStr,
  };
}

function generateSeasonalResonance(date: Date, dateStr: string): DailyResonance {
  const month = date.getMonth() + 1;

  if (month >= 3 && month <= 5) {
    return {
      text: "春は新しい接続が生まれやすい季節。分身も少し活発になっています",
      subtext: "環境の変化が内面にも影響します。今のあなたは、いつもより開放的かもしれません",
      sourceType: "seasonal",
      date: dateStr,
    };
  }

  if (month >= 6 && month <= 8) {
    return {
      text: "夏の光が気持ちを外に向けるように、接続への意欲も高まりやすい時期です",
      subtext: "この時期に惹かれる相手には、普段とは違う特徴があるかもしれません",
      sourceType: "seasonal",
      date: dateStr,
    };
  }

  if (month >= 9 && month <= 11) {
    return {
      text: "秋は内面と向き合う季節。分身も、より慎重に観測しています",
      subtext: "深い接続を求めやすい時期。質を重視するあなたの判断を信じてください",
      sourceType: "seasonal",
      date: dateStr,
    };
  }

  return {
    text: "冬は安心できる温もりを求める季節。分身も「安全基地」を探しています",
    subtext: "寒い季節に求めるものは、あなたの最も根源的な欲求を映し出します",
    sourceType: "seasonal",
    date: dateStr,
  };
}

const DIMENSION_LABELS: Record<string, string> = {
  conversationFit: "会話の温度感",
  distanceFit: "距離感の自然さ",
  depthFit: "深まりやすさ",
  initiativeFit: "役割の相性",
  emotionalFit: "感情の受け止め方",
  conflictFit: "すれ違いへの向き合い方",
  stabilityFit: "安定感",
  categoryAffinity: "生活スタイルの親和性",
  attachmentFit: "安心の築き方",
  conflictRepairFit: "修復力",
  sdtFit: "自律性の尊重",
  stargazerFit: "深層特性の共鳴",
};
