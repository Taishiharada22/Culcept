// ============================================================
// Avatar Conversation Summary
// 分身同士の会話データから、人間向けの要約を生成する
// ============================================================

export type AvatarTopicCategory =
  | "values"        // 大切にしていること
  | "lifestyle"     // 生活スタイル
  | "stress"        // ストレスと対処法
  | "relationships" // 人間関係の考え方
  | "dreams"        // 将来の夢・目標
  | "personality"   // 性格特性
  | "interests"     // 興味・趣味
  | "communication" // コミュニケーションスタイル
  | "growth"        // 成長と変化
  | "unknown";

export type ConversationMood = "warm" | "neutral" | "exciting" | "deep" | "playful";

export type AvatarConversationEntry = {
  id: string;
  timestamp: string;
  topicCategory: AvatarTopicCategory;
  topicLabel: string;
  summary: string;
  insight?: string;
  mood: ConversationMood;
  /** 会話の深さスコア (0-1) */
  depthScore: number;
};

export type AvatarInteractionData = {
  candidateId: string;
  /** 分身の接触開始日時 */
  startedAt: string;
  /** 分身の接触完了日時（nullなら進行中） */
  completedAt: string | null;
  /** 会話のログ（抽象化されたトピック） */
  topics: {
    id: string;
    category: AvatarTopicCategory;
    discussed_at: string;
    score?: number;
    keywords?: string[];
    match_signal?: "positive" | "neutral" | "interesting_difference";
  }[];
  /** 総合的な相性シグナル */
  overallSignal?: "strong" | "moderate" | "developing";
};

// ────────────────────────────────────────────
// トピックカテゴリの日本語ラベル
// ────────────────────────────────────────────
const TOPIC_LABELS: Record<AvatarTopicCategory, string> = {
  values: "大切にしていること",
  lifestyle: "生活スタイル",
  stress: "ストレスの対処法",
  relationships: "人間関係の考え方",
  dreams: "将来の夢",
  personality: "性格の特徴",
  interests: "興味・趣味",
  communication: "コミュニケーション",
  growth: "成長と変化",
  unknown: "その他",
};

// ────────────────────────────────────────────
// マッチシグナルの要約テンプレート
// ────────────────────────────────────────────
const SIGNAL_SUMMARIES: Record<
  string,
  Record<string, string[]>
> = {
  positive: {
    values: [
      "お互いの価値観に共通点がありました",
      "大切にしているものが似ています",
    ],
    lifestyle: [
      "ライフスタイルに共通の傾向が見つかりました",
      "日常の過ごし方に近い部分があります",
    ],
    stress: [
      "ストレスへの向き合い方に共感できる部分がありました",
      "困った時の対処法が似ています",
    ],
    relationships: [
      "人との関わり方に近い考えが見つかりました",
      "人間関係の価値観が合っています",
    ],
    dreams: [
      "将来のビジョンに重なる部分がありました",
      "目指す方向に共通点があります",
    ],
    personality: [
      "性格面で相性の良い組み合わせです",
      "お互いの性格が補完し合えそうです",
    ],
    interests: [
      "共通の興味を見つけました",
      "同じ趣味や関心を持っています",
    ],
    communication: [
      "コミュニケーションスタイルが噛み合いそうです",
      "話し方や聴き方に近い傾向があります",
    ],
    growth: [
      "成長への意欲に似た部分があります",
      "変化に対する姿勢が近いです",
    ],
    unknown: [
      "共通するポイントが見つかりました",
    ],
  },
  neutral: {
    values: ["価値観について穏やかに話し合いました"],
    lifestyle: ["お互いの生活パターンを知りました"],
    stress: ["ストレスについて率直に話しました"],
    relationships: ["人間関係の考え方を共有しました"],
    dreams: ["将来のことについて話しました"],
    personality: ["お互いの性格を感じ取りました"],
    interests: ["興味・関心について話しました"],
    communication: ["コミュニケーションの好みを確認しました"],
    growth: ["成長への考え方を共有しました"],
    unknown: ["いくつかの話題について話しました"],
  },
  interesting_difference: {
    values: [
      "面白い違いが見つかりました",
      "異なる視点を持っていて、刺激になりそうです",
    ],
    lifestyle: [
      "ライフスタイルに興味深い違いがあります",
      "お互いの世界が広がりそうな違いです",
    ],
    stress: [
      "ストレスへのアプローチが対照的で、補い合えそうです",
    ],
    relationships: [
      "人間関係への考え方に興味深い差異があります",
    ],
    dreams: [
      "異なる夢を持っていて、お互いに新しい視点を得られそうです",
    ],
    personality: [
      "性格の違いが良い刺激になりそうです",
    ],
    interests: [
      "それぞれの興味が新しい発見につながりそうです",
    ],
    communication: [
      "コミュニケーションスタイルの違いが新鮮です",
    ],
    growth: [
      "成長の方向性が異なり、学び合えそうです",
    ],
    unknown: [
      "興味深い違いが見つかりました",
    ],
  },
};

// ────────────────────────────────────────────
// ムード判定
// ────────────────────────────────────────────
function determineMood(
  signal?: string,
  category?: AvatarTopicCategory,
): ConversationMood {
  if (signal === "positive") {
    if (category === "values" || category === "dreams") return "warm";
    if (category === "interests") return "exciting";
    return "warm";
  }
  if (signal === "interesting_difference") return "exciting";
  if (
    category === "stress" ||
    category === "relationships" ||
    category === "growth"
  )
    return "deep";
  if (category === "interests") return "playful";
  return "neutral";
}

// ────────────────────────────────────────────
// ハッシュベースの決定論的選択
// ────────────────────────────────────────────
function pickFromArray<T>(arr: T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return arr[Math.abs(hash) % arr.length];
}

// ────────────────────────────────────────────
// メイン: 会話データ → タイムライン用エントリ
// ────────────────────────────────────────────
export function generateConversationSummary(
  data: AvatarInteractionData,
): AvatarConversationEntry[] {
  const entries: AvatarConversationEntry[] = [];

  for (const topic of data.topics) {
    const category = topic.category || "unknown";
    const signal = topic.match_signal || "neutral";
    const topicLabel = TOPIC_LABELS[category];

    // サマリー文を選択
    const summaryPool =
      SIGNAL_SUMMARIES[signal]?.[category] ??
      SIGNAL_SUMMARIES.neutral.unknown;
    const summary = pickFromArray(summaryPool, topic.id);

    // インサイトの生成（ポジティブまたはinteresting_differenceの場合）
    let insight: string | undefined;
    if (signal === "positive") {
      insight = `共通点: ${topicLabel}`;
    } else if (signal === "interesting_difference") {
      insight = `新発見: ${topicLabel}の違い`;
    }

    const mood = determineMood(signal, category);
    const depthScore = topic.score ?? (signal === "positive" ? 0.7 : 0.4);

    entries.push({
      id: topic.id,
      timestamp: topic.discussed_at,
      topicCategory: category,
      topicLabel: `「${topicLabel}」について話しました`,
      summary,
      insight,
      mood,
      depthScore,
    });
  }

  // 接触完了の場合、レポート生成中エントリを追加
  if (data.completedAt) {
    entries.push({
      id: `${data.candidateId}-complete`,
      timestamp: data.completedAt,
      topicCategory: "unknown",
      topicLabel: "接触完了。レポートを作成中...",
      summary: "分身同士の接触が完了しました。結果レポートを準備しています。",
      mood: "warm",
      depthScore: 1.0,
    });
  }

  return entries.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

/**
 * 会話エントリから主要トピックを抽出
 */
export function extractKeyTopics(
  entries: AvatarConversationEntry[],
): { topic: string; mood: ConversationMood }[] {
  return entries
    .filter((e) => e.insight)
    .map((e) => ({
      topic: e.insight!,
      mood: e.mood,
    }));
}

/**
 * 全体的な相性ニュアンスを1行でまとめる
 */
export function generateOverallNuance(
  entries: AvatarConversationEntry[],
  overallSignal?: "strong" | "moderate" | "developing",
): string {
  const positiveCount = entries.filter(
    (e) => e.mood === "warm" || e.mood === "exciting",
  ).length;

  if (overallSignal === "strong" || positiveCount >= 3) {
    return "分身同士がとても良い反応を示しています";
  }
  if (overallSignal === "moderate" || positiveCount >= 1) {
    return "興味深い会話が交わされています";
  }
  return "じっくりお互いを知ろうとしています";
}
