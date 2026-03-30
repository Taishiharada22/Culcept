/**
 * Synchronized Experience - 同期体験
 * 二人が同じ質問に同時に向き合い、独立に回答し、同時に開示する。
 * 神経的同期 ── 「一緒にいる」感覚を生む仕組み。
 */

import type { RendezvousCategory } from "@/lib/rendezvous/types";

// ============================================================
// Types
// ============================================================

export type SyncSessionStatus =
  | "waiting"
  | "both_ready"
  | "answering"
  | "revealing"
  | "completed";

export type SyncQuestionCategory =
  | "deep"
  | "playful"
  | "philosophical"
  | "sensory"
  | "future";

export type SyncAnswerType = "text" | "choice" | "scale" | "image_pick";

export type SyncRevealStyle = "simultaneous" | "gradual" | "word_by_word";

export type SyncResonanceType = "harmony" | "surprise" | "mirror" | "contrast";

export type SyncQuestionOption = {
  id: string;
  label: string;
  emoji: string;
};

export type SyncScaleRange = {
  min: number;
  max: number;
  minLabel: string;
  maxLabel: string;
};

export type SyncQuestion = {
  id: string;
  category: SyncQuestionCategory;
  question: string;
  answerType: SyncAnswerType;
  options?: SyncQuestionOption[];
  scaleRange?: SyncScaleRange;
  timerSeconds: number;
  revealStyle: SyncRevealStyle;
};

export type SyncSession = {
  id: string;
  candidateId: string;
  questionId: string;
  status: SyncSessionStatus;
  myAnswer: string | null;
  theirAnswer: string | null;
  myAnsweredAt: string | null;
  theirAnsweredAt: string | null;
  /** 回答の共鳴度 (reveal後に計算) */
  resonanceScore?: number;
  resonanceInsight?: string;
  resonanceType?: SyncResonanceType;
  createdAt: string;
};

export type ResonanceResult = {
  score: number;
  insight: string;
  type: SyncResonanceType;
};

// ============================================================
// Question Bank: 30 questions across 5 categories
// ============================================================

export const SYNC_QUESTIONS: SyncQuestion[] = [
  // ── deep (6) ──
  {
    id: "sync_deep_01",
    category: "deep",
    question: "人生で最も勇気が必要だった瞬間は？",
    answerType: "text",
    timerSeconds: 90,
    revealStyle: "word_by_word",
  },
  {
    id: "sync_deep_02",
    category: "deep",
    question: "誰にも言えない、自分だけの幸福の条件は？",
    answerType: "text",
    timerSeconds: 90,
    revealStyle: "gradual",
  },
  {
    id: "sync_deep_03",
    category: "deep",
    question: "もし全てをやり直せるなら、何を変えない？",
    answerType: "text",
    timerSeconds: 90,
    revealStyle: "simultaneous",
  },
  {
    id: "sync_deep_04",
    category: "deep",
    question: "あなたが最も恐れていることの裏にある願いは？",
    answerType: "text",
    timerSeconds: 90,
    revealStyle: "word_by_word",
  },
  {
    id: "sync_deep_05",
    category: "deep",
    question: "自分の弱さで、実は誇りに思っていることは？",
    answerType: "text",
    timerSeconds: 90,
    revealStyle: "gradual",
  },
  {
    id: "sync_deep_06",
    category: "deep",
    question: "10年後の自分に聞きたい、たった一つの質問は？",
    answerType: "text",
    timerSeconds: 90,
    revealStyle: "simultaneous",
  },

  // ── playful (6) ──
  {
    id: "sync_play_01",
    category: "playful",
    question: "無人島に一つだけ持っていくなら？",
    answerType: "choice",
    options: [
      { id: "book", label: "本", emoji: "\uD83D\uDCDA" },
      { id: "music", label: "音楽", emoji: "\uD83C\uDFB5" },
      { id: "cooking", label: "料理道具", emoji: "\uD83C\uDF73" },
      { id: "telescope", label: "望遠鏡", emoji: "\uD83D\uDD2D" },
    ],
    timerSeconds: 30,
    revealStyle: "simultaneous",
  },
  {
    id: "sync_play_02",
    category: "playful",
    question: "朝起きて別人になっていたら、最初にすることは？",
    answerType: "text",
    timerSeconds: 60,
    revealStyle: "simultaneous",
  },
  {
    id: "sync_play_03",
    category: "playful",
    question: "世界中のどこでも一瞬で行けるなら、今どこに行く？",
    answerType: "text",
    timerSeconds: 45,
    revealStyle: "simultaneous",
  },
  {
    id: "sync_play_04",
    category: "playful",
    question: "自分を色で表すなら？",
    answerType: "choice",
    options: [
      { id: "red", label: "赤", emoji: "\u2764\uFE0F" },
      { id: "blue", label: "青", emoji: "\uD83D\uDC99" },
      { id: "green", label: "緑", emoji: "\uD83D\uDC9A" },
      { id: "yellow", label: "黄", emoji: "\uD83D\uDC9B" },
      { id: "purple", label: "紫", emoji: "\uD83D\uDC9C" },
      { id: "white", label: "白", emoji: "\uD83E\uDD0D" },
    ],
    timerSeconds: 20,
    revealStyle: "simultaneous",
  },
  {
    id: "sync_play_05",
    category: "playful",
    question: "もし動物と話せたら、最初に何を聞く？",
    answerType: "text",
    timerSeconds: 45,
    revealStyle: "gradual",
  },
  {
    id: "sync_play_06",
    category: "playful",
    question: "あなたの人生の主題歌のジャンルは？",
    answerType: "choice",
    options: [
      { id: "jazz", label: "ジャズ", emoji: "\uD83C\uDFB7" },
      { id: "rock", label: "ロック", emoji: "\uD83C\uDFB8" },
      { id: "classical", label: "クラシック", emoji: "\uD83C\uDFBB" },
      { id: "electronic", label: "エレクトロ", emoji: "\uD83C\uDFDB\uFE0F" },
      { id: "folk", label: "フォーク", emoji: "\uD83C\uDFB6" },
      { id: "ambient", label: "アンビエント", emoji: "\uD83C\uDF0A" },
    ],
    timerSeconds: 20,
    revealStyle: "simultaneous",
  },

  // ── philosophical (6) ──
  {
    id: "sync_phil_01",
    category: "philosophical",
    question: "「正しいこと」と「優しいこと」が矛盾したら、どちらを選ぶ？",
    answerType: "scale",
    scaleRange: { min: 0, max: 100, minLabel: "正しさ", maxLabel: "優しさ" },
    timerSeconds: 30,
    revealStyle: "simultaneous",
  },
  {
    id: "sync_phil_02",
    category: "philosophical",
    question: "人は本質的に変われると思う？",
    answerType: "scale",
    scaleRange: { min: 0, max: 100, minLabel: "変われない", maxLabel: "変われる" },
    timerSeconds: 30,
    revealStyle: "simultaneous",
  },
  {
    id: "sync_phil_03",
    category: "philosophical",
    question: "孤独は贈り物か、それとも罰か？",
    answerType: "text",
    timerSeconds: 60,
    revealStyle: "gradual",
  },
  {
    id: "sync_phil_04",
    category: "philosophical",
    question: "「完璧な理解」と「心地よい誤解」、どちらが関係を深める？",
    answerType: "text",
    timerSeconds: 60,
    revealStyle: "word_by_word",
  },
  {
    id: "sync_phil_05",
    category: "philosophical",
    question: "自由と安全、今のあなたが求めているのは？",
    answerType: "scale",
    scaleRange: { min: 0, max: 100, minLabel: "安全", maxLabel: "自由" },
    timerSeconds: 30,
    revealStyle: "simultaneous",
  },
  {
    id: "sync_phil_06",
    category: "philosophical",
    question: "言葉にできない感情は、存在するのか？",
    answerType: "text",
    timerSeconds: 60,
    revealStyle: "gradual",
  },

  // ── sensory (6) ──
  {
    id: "sync_sens_01",
    category: "sensory",
    question: "今この瞬間、一番聞こえている音は？",
    answerType: "text",
    timerSeconds: 30,
    revealStyle: "simultaneous",
  },
  {
    id: "sync_sens_02",
    category: "sensory",
    question: "最も記憶に残っている「匂い」は？",
    answerType: "text",
    timerSeconds: 45,
    revealStyle: "gradual",
  },
  {
    id: "sync_sens_03",
    category: "sensory",
    question: "安心する手触りは？",
    answerType: "text",
    timerSeconds: 45,
    revealStyle: "gradual",
  },
  {
    id: "sync_sens_04",
    category: "sensory",
    question: "あなたの心が最も静かになる時間帯は？",
    answerType: "scale",
    scaleRange: { min: 0, max: 100, minLabel: "深夜", maxLabel: "早朝" },
    timerSeconds: 20,
    revealStyle: "simultaneous",
  },
  {
    id: "sync_sens_05",
    category: "sensory",
    question: "最も好きな「光」は？",
    answerType: "choice",
    options: [
      { id: "sunrise", label: "朝日", emoji: "\uD83C\uDF05" },
      { id: "komorebi", label: "木漏れ日", emoji: "\uD83C\uDF3F" },
      { id: "sunset", label: "夕焼け", emoji: "\uD83C\uDF07" },
      { id: "moonlight", label: "月明かり", emoji: "\uD83C\uDF19" },
      { id: "starlight", label: "星空", emoji: "\u2728" },
      { id: "candle", label: "蝋燭", emoji: "\uD83D\uDD6F\uFE0F" },
    ],
    timerSeconds: 20,
    revealStyle: "simultaneous",
  },
  {
    id: "sync_sens_06",
    category: "sensory",
    question: "いま食べたいものの一番の理由は？",
    answerType: "choice",
    options: [
      { id: "taste", label: "味", emoji: "\uD83D\uDE0B" },
      { id: "texture", label: "食感", emoji: "\uD83E\uDDD1\u200D\uD83C\uDF73" },
      { id: "temperature", label: "温度", emoji: "\uD83C\uDF21\uFE0F" },
      { id: "memory", label: "思い出", emoji: "\uD83D\uDCAD" },
    ],
    timerSeconds: 20,
    revealStyle: "simultaneous",
  },

  // ── future (6) ──
  {
    id: "sync_futr_01",
    category: "future",
    question: "5年後、どんな朝を迎えていたい？",
    answerType: "text",
    timerSeconds: 60,
    revealStyle: "word_by_word",
  },
  {
    id: "sync_futr_02",
    category: "future",
    question: "老後の自分に一言残すなら？",
    answerType: "text",
    timerSeconds: 60,
    revealStyle: "gradual",
  },
  {
    id: "sync_futr_03",
    category: "future",
    question: "未来の自分が今の自分を見たら、何と言う？",
    answerType: "text",
    timerSeconds: 60,
    revealStyle: "simultaneous",
  },
  {
    id: "sync_futr_04",
    category: "future",
    question: "一緒に歳を取りたい人の条件は？",
    answerType: "text",
    timerSeconds: 60,
    revealStyle: "gradual",
  },
  {
    id: "sync_futr_05",
    category: "future",
    question: "世界に一つだけ変化を起こせるなら？",
    answerType: "text",
    timerSeconds: 60,
    revealStyle: "simultaneous",
  },
  {
    id: "sync_futr_06",
    category: "future",
    question: "あなたの物語の次の章のタイトルは？",
    answerType: "text",
    timerSeconds: 45,
    revealStyle: "word_by_word",
  },
];

// ============================================================
// Category mapping by relationship stage
// ============================================================

const CATEGORY_PROGRESSION: Record<string, SyncQuestionCategory[]> = {
  early: ["playful", "sensory", "future"],
  middle: ["playful", "philosophical", "sensory", "future"],
  deep: ["deep", "philosophical", "sensory", "future"],
  mature: ["deep", "philosophical", "future"],
};

function getStageKey(messageCount: number): string {
  if (messageCount < 10) return "early";
  if (messageCount < 30) return "middle";
  if (messageCount < 80) return "deep";
  return "mature";
}

/**
 * 関係段階と過去の質問に基づいて次の質問を選択
 */
export function selectSyncQuestion(
  _category: RendezvousCategory,
  previousQuestionIds: string[],
  messageCount: number,
): SyncQuestion | null {
  const stage = getStageKey(messageCount);
  const allowedCategories = CATEGORY_PROGRESSION[stage];

  // Filter: allowed categories & not previously used
  const candidates = SYNC_QUESTIONS.filter(
    (q) =>
      allowedCategories.includes(q.category) &&
      !previousQuestionIds.includes(q.id),
  );

  if (candidates.length === 0) {
    // Fallback: any unused question
    const fallback = SYNC_QUESTIONS.filter(
      (q) => !previousQuestionIds.includes(q.id),
    );
    if (fallback.length === 0) return null;
    return fallback[Math.floor(Math.random() * fallback.length)];
  }

  // Weight toward less-used categories among candidates
  const categoryCounts = new Map<SyncQuestionCategory, number>();
  for (const id of previousQuestionIds) {
    const q = SYNC_QUESTIONS.find((x) => x.id === id);
    if (q) categoryCounts.set(q.category, (categoryCounts.get(q.category) ?? 0) + 1);
  }

  // Sort: prefer categories with fewer previous answers
  candidates.sort((a, b) => {
    const countA = categoryCounts.get(a.category) ?? 0;
    const countB = categoryCounts.get(b.category) ?? 0;
    return countA - countB;
  });

  // Pick from top-weighted with slight randomness
  const topCount = categoryCounts.get(candidates[0].category) ?? 0;
  const topCandidates = candidates.filter(
    (c) => (categoryCounts.get(c.category) ?? 0) <= topCount,
  );

  return topCandidates[Math.floor(Math.random() * topCandidates.length)];
}

// ============================================================
// Resonance Computation
// ============================================================

/**
 * 二人の回答の共鳴度を計算する
 */
export function computeAnswerResonance(
  question: SyncQuestion,
  answerA: string,
  answerB: string,
): ResonanceResult {
  if (question.answerType === "choice") {
    return computeChoiceResonance(question, answerA, answerB);
  }
  if (question.answerType === "scale") {
    return computeScaleResonance(question, answerA, answerB);
  }
  return computeTextResonance(question, answerA, answerB);
}

// ── Choice resonance ──

function computeChoiceResonance(
  question: SyncQuestion,
  answerA: string,
  answerB: string,
): ResonanceResult {
  const same = answerA === answerB;
  const optA = question.options?.find((o) => o.id === answerA);
  const optB = question.options?.find((o) => o.id === answerB);
  const labelA = optA?.label ?? answerA;
  const labelB = optB?.label ?? answerB;

  if (same) {
    return {
      score: 95,
      insight: `二人とも「${labelA}」を選んだ。言葉を交わさなくても通じ合う感覚がある。`,
      type: "harmony",
    };
  }

  // Check for complementary pairs
  const complementary = areComplementary(answerA, answerB, question);
  if (complementary) {
    return {
      score: 75,
      insight: `「${labelA}」と「${labelB}」。異なる選択だが、互いを補い合う組み合わせ。一人では見えない景色が見える。`,
      type: "surprise",
    };
  }

  return {
    score: 55,
    insight: `「${labelA}」と「${labelB}」。違う視点を持つ二人だからこそ、会話が面白くなる。`,
    type: "contrast",
  };
}

function areComplementary(a: string, b: string, question: SyncQuestion): boolean {
  const pairs: [string, string][] = [
    ["book", "music"],
    ["sunrise", "sunset"],
    ["moonlight", "sunrise"],
    ["taste", "memory"],
    ["jazz", "classical"],
    ["rock", "electronic"],
    ["red", "blue"],
    ["green", "yellow"],
  ];
  // Also consider question-specific complementarity
  if (question.options && question.options.length >= 4) {
    const ids = question.options.map((o) => o.id);
    const idxA = ids.indexOf(a);
    const idxB = ids.indexOf(b);
    // Adjacent options are somewhat complementary
    if (Math.abs(idxA - idxB) === 1) return true;
  }
  return pairs.some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x),
  );
}

// ── Scale resonance ──

function computeScaleResonance(
  question: SyncQuestion,
  answerA: string,
  answerB: string,
): ResonanceResult {
  const valA = parseFloat(answerA) || 50;
  const valB = parseFloat(answerB) || 50;
  const range = question.scaleRange ?? { min: 0, max: 100, minLabel: "", maxLabel: "" };
  const diff = Math.abs(valA - valB);
  const maxDiff = range.max - range.min;
  const normalizedDiff = diff / maxDiff;

  // Close = harmony
  if (normalizedDiff < 0.15) {
    const position = valA / maxDiff;
    const leaning = position > 0.6
      ? range.maxLabel
      : position < 0.4
        ? range.minLabel
        : "バランス";
    return {
      score: 90 + Math.round((1 - normalizedDiff) * 10),
      insight: `ほぼ同じ位置。二人とも「${leaning}」寄り。共通の価値観が根底にある。`,
      type: "mirror",
    };
  }

  // Moderate difference
  if (normalizedDiff < 0.35) {
    return {
      score: 70 + Math.round((1 - normalizedDiff) * 10),
      insight: `近いけれど少し違う。その微妙な差が、互いの考えを広げるきっかけになる。`,
      type: "harmony",
    };
  }

  // Opposite ends
  if (normalizedDiff > 0.65) {
    return {
      score: 45 + Math.round(normalizedDiff * 10),
      insight: `「${range.minLabel}」と「${range.maxLabel}」、対極的な立場。だからこそ見える世界が倍になる。`,
      type: "contrast",
    };
  }

  // Moderate opposition
  return {
    score: 55 + Math.round((1 - normalizedDiff) * 10),
    insight: `異なる位置にいるが、互いの視点を尊重できる距離感。対話が深まるポイント。`,
    type: "surprise",
  };
}

// ── Text resonance (keyword-based heuristic) ──

function computeTextResonance(
  _question: SyncQuestion,
  answerA: string,
  answerB: string,
): ResonanceResult {
  const wordsA = extractKeywords(answerA);
  const wordsB = extractKeywords(answerB);

  const intersection = wordsA.filter((w) => wordsB.includes(w));
  const union = new Set([...wordsA, ...wordsB]);
  const overlap = union.size > 0 ? intersection.length / union.size : 0;

  // Length similarity
  const lenA = answerA.length;
  const lenB = answerB.length;
  const lenRatio = Math.min(lenA, lenB) / Math.max(lenA, lenB || 1);

  // Similar keywords = mirror
  if (overlap > 0.3) {
    const sharedWord = intersection[0] ?? "";
    return {
      score: 80 + Math.round(overlap * 20),
      insight: sharedWord
        ? `「${sharedWord}」という言葉が二人の回答に現れた。同じ方向を見ている証拠。`
        : "共通の感覚が回答ににじみ出ている。同じ波長にいる。",
      type: "mirror",
    };
  }

  // Very different but both thoughtful
  if (overlap < 0.1 && lenA > 20 && lenB > 20) {
    return {
      score: 60,
      insight: "全く異なる視点から答えている。それぞれの世界が豊かで、共有すると景色が広がる。",
      type: "contrast",
    };
  }

  // Some overlap
  if (overlap > 0.15) {
    return {
      score: 70,
      insight: "部分的に重なる感覚がある。完全に同じでないからこそ、発見がある。",
      type: "surprise",
    };
  }

  // Different, short answers
  if (lenRatio > 0.7 && lenA < 30 && lenB < 30) {
    return {
      score: 65,
      insight: "シンプルな回答に、それぞれの本質が凝縮されている。簡潔さの中に共通点が隠れている。",
      type: "harmony",
    };
  }

  // Default
  return {
    score: 55,
    insight: "異なるアプローチで答えている。二人の視点を重ねると、新しい理解が生まれる。",
    type: "surprise",
  };
}

/**
 * 日本語テキストからキーワードを抽出する簡易ヒューリスティック
 */
function extractKeywords(text: string): string[] {
  // Remove common particles and connectors
  const cleaned = text
    .replace(/[、。！？「」『』（）\s]+/g, " ")
    .trim();

  // Split into segments (rough tokenization for Japanese)
  const segments: string[] = [];

  // Extract katakana words
  const katakana = cleaned.match(/[\u30A0-\u30FF]+/g);
  if (katakana) segments.push(...katakana);

  // Extract kanji compounds (2+ chars)
  const kanji = cleaned.match(/[\u4E00-\u9FFF]{2,}/g);
  if (kanji) segments.push(...kanji);

  // Extract alphabetic words
  const alpha = cleaned.match(/[a-zA-Z]+/g);
  if (alpha) segments.push(...alpha.map((w) => w.toLowerCase()));

  // Filter short/common words
  const stopWords = new Set([
    "こと", "もの", "それ", "これ", "あれ", "ため", "とき",
    "よう", "ところ", "ほう", "ほど", "まま", "わけ",
  ]);

  return segments.filter((w) => w.length >= 2 && !stopWords.has(w));
}
