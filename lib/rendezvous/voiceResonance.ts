// ============================================================
// Voice Resonance Engine
// 声の共鳴から関係性の本質を読み取る
// ============================================================

import type { RendezvousCategory } from "./types";

// ---------- Types ----------

export type VoicePrompt = {
  id: string;
  category: "self_reveal" | "emotional" | "playful" | "reflective";
  prompt: string;
  maxDurationSec: number;
  analysisHints: string[];
};

export type VoiceAnalysis = {
  /** 音声メトリクス (クライアントサイド Web Audio API で抽出) */
  avgPitch: number;
  pitchVariance: number;
  speakingPace: number;
  pauseFrequency: number;
  energyLevel: number;
  breathPattern: "steady" | "excited" | "hesitant" | "calm";
};

export type VoiceResonanceType =
  | "rhythmic_sync"
  | "energy_match"
  | "complementary_tone"
  | "emotional_mirror"
  | "peaceful_contrast"
  | "dynamic_spark";

export type VoiceResonanceResult = {
  resonanceScore: number;
  resonanceType: VoiceResonanceType;
  insight: string;
  resonancePoints: { label: string; description: string; score: number }[];
  voiceDynamic: string;
};

// ---------- 共鳴タイプ定義 ----------

const RESONANCE_TYPE_META: Record<
  VoiceResonanceType,
  { label: string; description: string }
> = {
  rhythmic_sync: {
    label: "リズムの同期",
    description: "話すペースや間の取り方が自然に合っている",
  },
  energy_match: {
    label: "エネルギーの調和",
    description: "声のテンションや熱量が近い位置にある",
  },
  complementary_tone: {
    label: "補完するトーン",
    description: "違うトーンだけど、組み合わさると心地いい",
  },
  emotional_mirror: {
    label: "感情の鏡",
    description: "感情の表現の仕方が鏡のように似ている",
  },
  peaceful_contrast: {
    label: "平和な対比",
    description: "異なるエネルギーが安らぎの空間を作る",
  },
  dynamic_spark: {
    label: "動的な火花",
    description: "お互いの表現力が刺激し合う関係性",
  },
};

// ---------- Voice Prompts (20) ----------

export const VOICE_PROMPTS: VoicePrompt[] = [
  // self_reveal (5)
  {
    id: "sr_01",
    category: "self_reveal",
    prompt: "あなたの名前の由来を教えてください",
    maxDurationSec: 30,
    analysisHints: ["warmth", "nostalgia", "openness"],
  },
  {
    id: "sr_02",
    category: "self_reveal",
    prompt: "一番好きな季節と、その理由を声で",
    maxDurationSec: 30,
    analysisHints: ["enthusiasm", "descriptive_tone", "pace_change"],
  },
  {
    id: "sr_03",
    category: "self_reveal",
    prompt: "子供の頃の夢を、今の声で語って",
    maxDurationSec: 45,
    analysisHints: ["reflection", "temporal_shift", "emotion_blend"],
  },
  {
    id: "sr_04",
    category: "self_reveal",
    prompt: "自分を一言で紹介するなら",
    maxDurationSec: 15,
    analysisHints: ["confidence", "hesitation", "self_image"],
  },
  {
    id: "sr_05",
    category: "self_reveal",
    prompt: "最近、嬉しかったこと",
    maxDurationSec: 30,
    analysisHints: ["joy_expression", "energy_spike", "sharing_warmth"],
  },

  // emotional (5)
  {
    id: "em_01",
    category: "emotional",
    prompt: "大切な人への「ありがとう」を、ここで",
    maxDurationSec: 20,
    analysisHints: ["sincerity", "emotional_depth", "voice_softening"],
  },
  {
    id: "em_02",
    category: "emotional",
    prompt: "怒りを感じた最近の出来事を、落ち着いて",
    maxDurationSec: 45,
    analysisHints: ["controlled_energy", "tension_release", "pace_regulation"],
  },
  {
    id: "em_03",
    category: "emotional",
    prompt: "一番泣いた映画のシーンを説明して",
    maxDurationSec: 45,
    analysisHints: ["vulnerability", "narrative_engagement", "emotion_recall"],
  },
  {
    id: "em_04",
    category: "emotional",
    prompt: "安心する言葉を、自分に向けて",
    maxDurationSec: 20,
    analysisHints: ["self_compassion", "tone_warmth", "breath_steadiness"],
  },
  {
    id: "em_05",
    category: "emotional",
    prompt: "「大丈夫」を、本当に大丈夫な声で",
    maxDurationSec: 15,
    analysisHints: ["conviction", "stability", "reassurance_tone"],
  },

  // playful (5)
  {
    id: "pl_01",
    category: "playful",
    prompt: "好きな食べ物を、最大限おいしそうに",
    maxDurationSec: 20,
    analysisHints: ["expressiveness", "playful_energy", "vocal_range"],
  },
  {
    id: "pl_02",
    category: "playful",
    prompt: "朝の自分を実況中継して",
    maxDurationSec: 30,
    analysisHints: ["humor", "pacing", "self_awareness"],
  },
  {
    id: "pl_03",
    category: "playful",
    prompt: "架空の映画の予告ナレーション",
    maxDurationSec: 30,
    analysisHints: ["dramatic_range", "creativity", "vocal_dynamics"],
  },
  {
    id: "pl_04",
    category: "playful",
    prompt: "動物になりきって自己紹介",
    maxDurationSec: 20,
    analysisHints: ["uninhibited", "creative_play", "character_voice"],
  },
  {
    id: "pl_05",
    category: "playful",
    prompt: "外国語のふりをして何かを説明",
    maxDurationSec: 20,
    analysisHints: ["spontaneity", "rhythm_play", "comfort_with_absurd"],
  },

  // reflective (5)
  {
    id: "rf_01",
    category: "reflective",
    prompt: "「孤独」という言葉から連想することを",
    maxDurationSec: 45,
    analysisHints: ["depth", "pause_patterns", "contemplative_tone"],
  },
  {
    id: "rf_02",
    category: "reflective",
    prompt: "10年前の自分に声をかけるなら",
    maxDurationSec: 45,
    analysisHints: ["temporal_perspective", "tenderness", "wisdom_tone"],
  },
  {
    id: "rf_03",
    category: "reflective",
    prompt: "今の気持ちを天気で表現すると",
    maxDurationSec: 30,
    analysisHints: ["metaphorical_thinking", "current_state", "creative_expression"],
  },
  {
    id: "rf_04",
    category: "reflective",
    prompt: "沈黙が心地いい瞬間について",
    maxDurationSec: 30,
    analysisHints: ["comfort_with_silence", "pace_slowdown", "intimacy_tolerance"],
  },
  {
    id: "rf_05",
    category: "reflective",
    prompt: "言葉にできない感情を、あえて言葉にすると",
    maxDurationSec: 60,
    analysisHints: ["struggle_expression", "authenticity", "emotional_vocabulary"],
  },
];

// ---------- カテゴリ別プロンプトマップ ----------

const PROMPTS_BY_CATEGORY: Record<VoicePrompt["category"], VoicePrompt[]> = {
  self_reveal: VOICE_PROMPTS.filter((p) => p.category === "self_reveal"),
  emotional: VOICE_PROMPTS.filter((p) => p.category === "emotional"),
  playful: VOICE_PROMPTS.filter((p) => p.category === "playful"),
  reflective: VOICE_PROMPTS.filter((p) => p.category === "reflective"),
};

// ---------- Resonance Computation ----------

/**
 * 2つの声の分析結果から共鳴スコアと共鳴タイプを計算する
 */
export function computeVoiceResonance(
  analysisA: VoiceAnalysis,
  analysisB: VoiceAnalysis,
  promptCategory: VoicePrompt["category"],
): VoiceResonanceResult {
  const checks = evaluateResonanceTypes(analysisA, analysisB);
  const bestType = determineBestType(checks);

  const resonancePoints = buildResonancePoints(checks);
  const baseScore = computeBaseScore(checks);

  // カテゴリボーナス: 特定のカテゴリは特定の共鳴タイプをより強く評価
  const categoryBonus = getCategoryBonus(bestType, promptCategory);
  const finalScore = Math.min(100, Math.round(baseScore + categoryBonus));

  const insight = generateInsight(bestType, analysisA, analysisB, promptCategory);
  const voiceDynamic = generateDynamicNarrative(bestType, analysisA, analysisB);

  return {
    resonanceScore: finalScore,
    resonanceType: bestType,
    insight,
    resonancePoints,
    voiceDynamic,
  };
}

// ---------- 共鳴タイプ判定 ----------

type ResonanceCheck = {
  type: VoiceResonanceType;
  score: number;
  matched: boolean;
};

function evaluateResonanceTypes(
  a: VoiceAnalysis,
  b: VoiceAnalysis,
): ResonanceCheck[] {
  return [
    evaluateRhythmicSync(a, b),
    evaluateEnergyMatch(a, b),
    evaluateComplementaryTone(a, b),
    evaluateEmotionalMirror(a, b),
    evaluatePeacefulContrast(a, b),
    evaluateDynamicSpark(a, b),
  ];
}

function evaluateRhythmicSync(
  a: VoiceAnalysis,
  b: VoiceAnalysis,
): ResonanceCheck {
  const paceDiff = Math.abs(a.speakingPace - b.speakingPace);
  const pauseDiff = Math.abs(a.pauseFrequency - b.pauseFrequency);
  const matched = paceDiff < 0.2 && pauseDiff < 2;

  // スコアはdiffが小さいほど高い
  const paceScore = Math.max(0, 1 - paceDiff / 0.5) * 50;
  const pauseScore = Math.max(0, 1 - pauseDiff / 5) * 50;
  const score = Math.round(paceScore + pauseScore);

  return { type: "rhythmic_sync", score, matched };
}

function evaluateEnergyMatch(
  a: VoiceAnalysis,
  b: VoiceAnalysis,
): ResonanceCheck {
  const energyDiff = Math.abs(a.energyLevel - b.energyLevel);
  const matched = energyDiff < 0.15;

  const score = Math.round(Math.max(0, 1 - energyDiff / 0.4) * 100);
  return { type: "energy_match", score, matched };
}

function evaluateComplementaryTone(
  a: VoiceAnalysis,
  b: VoiceAnalysis,
): ResonanceCheck {
  const varianceDiff = Math.abs(a.pitchVariance - b.pitchVariance);
  const energyDiff = Math.abs(a.energyLevel - b.energyLevel);
  const matched = varianceDiff > 20 && energyDiff < 0.2;

  const varianceScore = Math.min(50, varianceDiff);
  const energyProximity = Math.max(0, 1 - energyDiff / 0.3) * 50;
  const score = Math.round(matched ? varianceScore + energyProximity : (varianceScore + energyProximity) * 0.5);

  return { type: "complementary_tone", score, matched };
}

function evaluateEmotionalMirror(
  a: VoiceAnalysis,
  b: VoiceAnalysis,
): ResonanceCheck {
  const sameBreath = a.breathPattern === b.breathPattern;
  const varianceDiff = Math.abs(a.pitchVariance - b.pitchVariance);
  const varianceSimilar = varianceDiff < 15;
  const matched = sameBreath && varianceSimilar;

  let score = 0;
  if (sameBreath) score += 50;
  score += Math.round(Math.max(0, 1 - varianceDiff / 30) * 50);

  return { type: "emotional_mirror", score, matched };
}

function evaluatePeacefulContrast(
  a: VoiceAnalysis,
  b: VoiceAnalysis,
): ResonanceCheck {
  const energyDiff = Math.abs(a.energyLevel - b.energyLevel);
  const bothSteady =
    (a.breathPattern === "steady" || a.breathPattern === "calm") &&
    (b.breathPattern === "steady" || b.breathPattern === "calm");
  const matched = energyDiff > 0.2 && bothSteady;

  let score = 0;
  if (bothSteady) score += 50;
  if (energyDiff > 0.15) score += Math.round(Math.min(50, energyDiff * 100));

  return { type: "peaceful_contrast", score, matched };
}

function evaluateDynamicSpark(
  a: VoiceAnalysis,
  b: VoiceAnalysis,
): ResonanceCheck {
  const bothHighVariance = a.pitchVariance > 30 && b.pitchVariance > 30;
  const bothHighEnergy = a.energyLevel > 0.6 && b.energyLevel > 0.6;
  const matched = bothHighVariance && bothHighEnergy;

  let score = 0;
  const avgVariance = (a.pitchVariance + b.pitchVariance) / 2;
  const avgEnergy = (a.energyLevel + b.energyLevel) / 2;
  score += Math.round(Math.min(50, avgVariance));
  score += Math.round(avgEnergy * 50);

  return { type: "dynamic_spark", score, matched };
}

// ---------- 共鳴タイプ決定 ----------

function determineBestType(checks: ResonanceCheck[]): VoiceResonanceType {
  // matchedがtrueのもので最高スコアを選ぶ。なければ全体の最高スコア
  const matchedChecks = checks.filter((c) => c.matched);
  const pool = matchedChecks.length > 0 ? matchedChecks : checks;
  pool.sort((a, b) => b.score - a.score);
  return pool[0].type;
}

// ---------- 共鳴ポイント構築 ----------

function buildResonancePoints(
  checks: ResonanceCheck[],
): VoiceResonanceResult["resonancePoints"] {
  return checks
    .filter((c) => c.score > 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((c) => ({
      label: RESONANCE_TYPE_META[c.type].label,
      description: RESONANCE_TYPE_META[c.type].description,
      score: c.score,
    }));
}

// ---------- ベーススコア計算 ----------

function computeBaseScore(checks: ResonanceCheck[]): number {
  const sorted = [...checks].sort((a, b) => b.score - a.score);
  // トップ3の加重平均 (60/25/15)
  const weights = [0.6, 0.25, 0.15];
  let total = 0;
  for (let i = 0; i < Math.min(3, sorted.length); i++) {
    total += sorted[i].score * weights[i];
  }
  return total;
}

// ---------- カテゴリボーナス ----------

function getCategoryBonus(
  type: VoiceResonanceType,
  category: VoicePrompt["category"],
): number {
  const bonusMap: Record<VoicePrompt["category"], VoiceResonanceType[]> = {
    self_reveal: ["rhythmic_sync", "energy_match"],
    emotional: ["emotional_mirror", "peaceful_contrast"],
    playful: ["dynamic_spark", "complementary_tone"],
    reflective: ["peaceful_contrast", "emotional_mirror"],
  };
  return bonusMap[category].includes(type) ? 5 : 0;
}

// ---------- インサイト生成 ----------

function generateInsight(
  type: VoiceResonanceType,
  a: VoiceAnalysis,
  b: VoiceAnalysis,
  category: VoicePrompt["category"],
): string {
  const meta = RESONANCE_TYPE_META[type];

  const categoryLabel: Record<VoicePrompt["category"], string> = {
    self_reveal: "自己開示",
    emotional: "感情表現",
    playful: "遊び心",
    reflective: "内省",
  };

  const baseInsight = `${categoryLabel[category]}の問いに対して、ふたりの声には「${meta.label}」が見つかりました。${meta.description}。`;

  // 追加の具体的なインサイト
  const details: string[] = [];

  const avgEnergy = (a.energyLevel + b.energyLevel) / 2;
  if (avgEnergy > 0.7) {
    details.push("お互いにエネルギッシュに語り合える関係性です");
  } else if (avgEnergy < 0.3) {
    details.push("静かで穏やかな空間を共有できる二人です");
  }

  if (a.breathPattern === b.breathPattern) {
    const patternLabel: Record<VoiceAnalysis["breathPattern"], string> = {
      steady: "安定した",
      excited: "高揚した",
      hesitant: "慎重な",
      calm: "穏やかな",
    };
    details.push(
      `同じ「${patternLabel[a.breathPattern]}」呼吸パターンを持っています`,
    );
  }

  return details.length > 0
    ? `${baseInsight} ${details.join("。")}。`
    : baseInsight;
}

// ---------- ダイナミクスナラティブ ----------

function generateDynamicNarrative(
  type: VoiceResonanceType,
  a: VoiceAnalysis,
  b: VoiceAnalysis,
): string {
  const narratives: Record<VoiceResonanceType, () => string> = {
    rhythmic_sync: () => {
      const avgPace = (a.speakingPace + b.speakingPace) / 2;
      return avgPace > 3
        ? "テンポよく言葉を交わし合える二人。会話のリズムが心地よく続いていく。"
        : "ゆったりとした時間を共有できる二人。言葉の間にある沈黙も意味を持つ。";
    },
    energy_match: () => {
      const avg = (a.energyLevel + b.energyLevel) / 2;
      return avg > 0.5
        ? "同じ熱量で語り合える相手。一緒にいると自然にテンションが上がる。"
        : "落ち着いた空間を自然に作れる二人。無理のないエネルギーの交換が心地いい。";
    },
    complementary_tone: () =>
      "違うメロディーが重なると和音になるように、二つの声が新しいハーモニーを生む。",
    emotional_mirror: () =>
      "感情の温度感が似ている。悲しい時の声、嬉しい時の声が、不思議と同じ色を帯びる。",
    peaceful_contrast: () =>
      "片方が波なら、もう片方は岸辺。異なるエネルギーが安らぎの景色を作り出す。",
    dynamic_spark: () =>
      "二つの声が出会うと、予想外の化学反応が起きる。お互いの表現が刺激し合い、新しい何かが生まれる。",
  };

  return narratives[type]();
}

// ---------- プロンプト選択 ----------

/**
 * 関係性の段階とカテゴリに応じて適切なプロンプトを選択する
 */
export function selectVoicePrompt(
  messageCount: number,
  previousPromptIds: string[],
  category: RendezvousCategory,
): VoicePrompt {
  // 関係性段階に応じたカテゴリの重み付け
  const stageWeights = getStageWeights(messageCount, category);

  // 未使用のプロンプトからカテゴリの重み付けに基づいて選択
  const usedSet = new Set(previousPromptIds);
  const available = VOICE_PROMPTS.filter((p) => !usedSet.has(p.id));

  if (available.length === 0) {
    // 全プロンプト使用済みの場合はリセットして最初から
    return selectWeightedPrompt(VOICE_PROMPTS, stageWeights);
  }

  return selectWeightedPrompt(available, stageWeights);
}

function getStageWeights(
  messageCount: number,
  category: RendezvousCategory,
): Record<VoicePrompt["category"], number> {
  // 初期段階: self_reveal + playful 重視
  if (messageCount < 10) {
    return category === "romantic"
      ? { self_reveal: 0.4, playful: 0.35, emotional: 0.1, reflective: 0.15 }
      : { self_reveal: 0.45, playful: 0.3, emotional: 0.1, reflective: 0.15 };
  }

  // 中期: emotional + reflective が増加
  if (messageCount < 30) {
    return category === "romantic"
      ? { self_reveal: 0.2, playful: 0.2, emotional: 0.35, reflective: 0.25 }
      : { self_reveal: 0.25, playful: 0.25, emotional: 0.25, reflective: 0.25 };
  }

  // 深い関係: reflective + emotional 重視
  return category === "romantic"
    ? { self_reveal: 0.1, playful: 0.15, emotional: 0.35, reflective: 0.4 }
    : { self_reveal: 0.15, playful: 0.2, emotional: 0.3, reflective: 0.35 };
}

function selectWeightedPrompt(
  prompts: VoicePrompt[],
  weights: Record<VoicePrompt["category"], number>,
): VoicePrompt {
  // カテゴリの重みに基づいてランダム選択
  const rand = Math.random();
  let cumulative = 0;

  const categories: VoicePrompt["category"][] = [
    "self_reveal",
    "emotional",
    "playful",
    "reflective",
  ];

  let selectedCategory: VoicePrompt["category"] = "self_reveal";
  for (const cat of categories) {
    cumulative += weights[cat];
    if (rand <= cumulative) {
      selectedCategory = cat;
      break;
    }
  }

  // 選ばれたカテゴリのプロンプトから一つランダムに選択
  const categoryPrompts = prompts.filter(
    (p) => p.category === selectedCategory,
  );

  if (categoryPrompts.length === 0) {
    // フォールバック: 全プロンプトからランダム
    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  return categoryPrompts[Math.floor(Math.random() * categoryPrompts.length)];
}
