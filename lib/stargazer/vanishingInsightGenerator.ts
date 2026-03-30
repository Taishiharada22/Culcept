// lib/stargazer/vanishingInsightGenerator.ts
// 消えるインサイト生成エンジン — 観測データから24時間限定のインサイトを生成
//
// ローカルストレージベース。サーバー依存なし。

import { safeSetItem } from "@/lib/stargazer/localStorageHelper";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type InsightCategory = "矛盾発見" | "行動パターン" | "深層の兆候" | "盲点" | "予感";

export interface VanishingInsightData {
  id: string;
  insight: string;
  category: InsightCategory;
  expiresAt: number; // 24 hours from generation
  generatedAt: number;
  basedOn: string; // what observation this is based on
  reaction?: string; // user reaction (resonated, surprising, expected, unclear)
}

interface MorningAnswerInput {
  questionId: string;
  answer: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Storage Keys
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VANISHING_INSIGHT_KEY = "sg_vanishing_insight_v1";
const INSIGHT_HISTORY_KEY = "sg_vanishing_history_v1";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Insight Templates
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface InsightTemplate {
  template: string;
  category: InsightCategory;
  /** Minimum axis score value needed (any axis) to trigger */
  minAxisThreshold?: number;
  /** Specific axis that matters */
  relevantAxis?: string;
  /** Minimum observation count */
  minObservations?: number;
  /** Requires a morning answer */
  requiresMorningAnswer?: boolean;
}

const INSIGHT_TEMPLATES: InsightTemplate[] = [
  // ── 矛盾発見 ──
  {
    template: "「大丈夫」って言ったとき、本当に大丈夫だった？ 体はちょっと違うこと言ってなかった？",
    category: "矛盾発見",
    minObservations: 3,
  },
  {
    template: "安定した毎日がほしい。でも退屈はイヤ。この「両方ほしい」が、あなたらしさだよ",
    category: "矛盾発見",
    relevantAxis: "openness",
    minAxisThreshold: 0.4,
  },
  {
    template: "ひとりは寂しい。でも誰かが近づくと、ちょっと引いてしまう。どっちも本当の気持ち",
    category: "矛盾発見",
    relevantAxis: "sociability",
  },
  {
    template: "昨日と今日で答えが変わった。それは気まぐれじゃなくて、あなたの中で何かが動いてる証拠",
    category: "矛盾発見",
    requiresMorningAnswer: true,
  },
  {
    template: "頭では「こうすべき」と分かってるのに、気持ちがついてこない。それ、よくあるよね",
    category: "矛盾発見",
    relevantAxis: "rationality",
    minAxisThreshold: 0.5,
  },

  // ── 行動パターン ──
  {
    template: "夜になると迷いやすくなってない？ 朝の自分だったら、たぶんこんなに悩まない",
    category: "行動パターン",
    minObservations: 5,
  },
  {
    template: "「それ」を避けてるように見えるけど、本当に避けたいのは、それをやったときの自分の反応かも",
    category: "行動パターン",
    minObservations: 5,
  },
  {
    template: "疲れてるときだけ出てくる本音がある。元気なときは隠せてるだけかも",
    category: "行動パターン",
    minObservations: 7,
  },
  {
    template: "金曜の夜の自分と、月曜の朝の自分、全然違う人みたいじゃない？ どっちも自分だけど",
    category: "行動パターン",
    minObservations: 10,
  },
  {
    template: "あのとき選ばなかったほうを、まだちょっと考えてない？ そこに大事なヒントがあるかも",
    category: "行動パターン",
    requiresMorningAnswer: true,
  },

  // ── 深層の兆候 ──
  {
    template: "なんとなくモヤモヤするけど、理由がわからない。それ、もうすぐ言葉になりそうだよ",
    category: "深層の兆候",
    minObservations: 3,
  },
  {
    template: "表面上は落ち着いてるけど、心の中では何か変わり始めてる。データがそう言ってる",
    category: "深層の兆候",
    minObservations: 8,
  },
  {
    template: "考えると気が重くなるテーマがある。でもたぶん、それが今いちばん向き合うべきこと",
    category: "深層の兆候",
    minObservations: 5,
  },
  {
    template: "今「ふつう」にできてること、半年前は「もう無理」って思ってたよね。気づかないうちに成長してる",
    category: "深層の兆候",
    minObservations: 15,
  },
  {
    template: "最近の疲れ、体の疲れじゃないかも。気持ちの整理にエネルギーを使ってるんだと思う",
    category: "深層の兆候",
  },

  // ── 盲点 ──
  {
    template: "自分のダメなところはすぐ見えるのに、いいところは気づきにくい。それ、みんなそうだよ",
    category: "盲点",
    minObservations: 5,
  },
  {
    template: "周りの人が見てるあなたと、自分で思ってる自分、けっこう違うかも。どっちも本当のあなた",
    category: "盲点",
    minObservations: 7,
  },
  {
    template: "「自分はこういう性格」って思い込んでること、実は今いる環境に合わせてるだけかも",
    category: "盲点",
    minObservations: 10,
  },
  {
    template: "「忙しい」を理由にしてるけど、本当は何もない時間が怖いだけかもしれない",
    category: "盲点",
  },

  // ── 予感 ──
  {
    template: "何かがうまくハマりそうな感じ、しない？ あともう少しで何か変わりそう",
    category: "予感",
    minObservations: 5,
  },
  {
    template: "最近の回答のパターン、大きく変わる直前の人と似てる。来週あたり、何か動きそう",
    category: "予感",
    minObservations: 10,
  },
  {
    template: "やりたいけど怖いこと、ない？ やりたい気持ちと怖い気持ちが同時にあるなら、それは大事なサイン",
    category: "予感",
    requiresMorningAnswer: true,
  },
  {
    template: "最近、ある人の考え方に影響されてきてない？ 自分で思ってるより、けっこう染まってるかも",
    category: "予感",
    minObservations: 12,
  },
  {
    template: "さっきの回答、本当に言いたかったことは別にあるんじゃない？ それが本音だよ",
    category: "予感",
    requiresMorningAnswer: true,
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function safeGetJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function dateSeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Simple seeded pseudo-random (deterministic for the day) */
function seededRandom(seed: number, index: number): number {
  const x = Math.sin(seed * 9301 + index * 49297) * 49297;
  return x - Math.floor(x);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Generator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Generate a vanishing insight based on user's observation history.
 * Returns null if no suitable insight can be generated.
 */
export function generateVanishingInsight(
  axisScores: Record<string, number>,
  observationCount: number,
  previousInsights: string[],
  morningAnswer?: MorningAnswerInput,
): VanishingInsightData | null {
  const seed = dateSeed();
  const previousSet = new Set(previousInsights);

  // Filter templates by eligibility
  const eligible = INSIGHT_TEMPLATES.filter((t) => {
    // Already shown before?
    if (previousSet.has(t.template)) return false;

    // Minimum observations
    if (t.minObservations && observationCount < t.minObservations) return false;

    // Requires morning answer
    if (t.requiresMorningAnswer && !morningAnswer) return false;

    // Axis threshold
    if (t.relevantAxis && t.minAxisThreshold) {
      const score = axisScores[t.relevantAxis];
      if (score === undefined || Math.abs(score) < t.minAxisThreshold) return false;
    }

    return true;
  });

  if (eligible.length === 0) {
    // Fallback: allow repeats but exclude very recent ones
    const fallback = INSIGHT_TEMPLATES.filter((t) => {
      if (t.minObservations && observationCount < t.minObservations) return false;
      if (t.requiresMorningAnswer && !morningAnswer) return false;
      return true;
    });
    if (fallback.length === 0) return null;
    const idx = Math.floor(seededRandom(seed, 42) * fallback.length);
    const chosen = fallback[idx];
    return buildInsightData(chosen, morningAnswer);
  }

  // Deterministic selection for the day
  const idx = Math.floor(seededRandom(seed, 7) * eligible.length);
  const chosen = eligible[idx];
  return buildInsightData(chosen, morningAnswer);
}

function buildInsightData(
  template: InsightTemplate,
  morningAnswer?: MorningAnswerInput,
): VanishingInsightData {
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;

  return {
    id: `vi_${dateSeed()}_${Math.floor(Math.random() * 1000)}`,
    insight: template.template,
    category: template.category,
    expiresAt: now + twentyFourHours,
    generatedAt: now,
    basedOn: morningAnswer
      ? `朝の一問 (${morningAnswer.questionId}: ${morningAnswer.answer})`
      : `観測データ (${Object.keys({}).length} axes)`,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Storage
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Check if user has an active (non-expired) vanishing insight */
export function getActiveVanishingInsight(): VanishingInsightData | null {
  const data = loadVanishingInsight();
  if (!data) return null;
  if (Date.now() > data.expiresAt) {
    // Expired — clean up
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(VANISHING_INSIGHT_KEY);
      } catch {
        // ignore
      }
    }
    return null;
  }
  return data;
}

/** Save a vanishing insight to localStorage */
export function saveVanishingInsight(insight: VanishingInsightData): void {
  safeSetItem(VANISHING_INSIGHT_KEY, JSON.stringify(insight));

  // Also save to history (for deduplication)
  const history: string[] = safeGetJSON(INSIGHT_HISTORY_KEY, []);
  if (!history.includes(insight.insight)) {
    history.push(insight.insight);
    // Keep last 50 insights
    const trimmed = history.slice(-50);
    safeSetItem(INSIGHT_HISTORY_KEY, JSON.stringify(trimmed));
  }
}

/** Load the current vanishing insight from localStorage */
export function loadVanishingInsight(): VanishingInsightData | null {
  return safeGetJSON<VanishingInsightData | null>(VANISHING_INSIGHT_KEY, null);
}

/** Save user reaction to the active vanishing insight in localStorage */
export function saveVanishingReaction(reaction: string): void {
  const data = loadVanishingInsight();
  if (data) {
    data.reaction = reaction;
    safeSetItem(VANISHING_INSIGHT_KEY, JSON.stringify(data));
  }
}

/** Get previous insight texts for deduplication */
export function getPreviousInsights(): string[] {
  return safeGetJSON<string[]>(INSIGHT_HISTORY_KEY, []);
}
