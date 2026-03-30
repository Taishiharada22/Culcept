// ============================================================
// Avatar Personality & Skill System
// Stargazer 45軸 + MatchingVector 10軸 → アバターの深層人格
// ============================================================

import type { MatchingVector } from "./types";

// ---------- Types ----------

export type AvatarSkillType =
  | "deep_questions"
  | "humor"
  | "empathy"
  | "incisiveness"
  | "topic_expansion"
  | "silence_handling";

export type AvatarSkill = {
  skill_type: AvatarSkillType;
  level: number; // 0-100
  experience: number; // cumulative XP
};

/** Stargazer軸スナップショット（-1.0〜+1.0） */
export type StargazerAxisSnapshot = {
  axis_id: string;
  score: number;
  confidence?: number;
};

export type AvatarPersonalityState = {
  base_temperature: number; // 0-1 from conversation_temperature
  depth_tendency: number; // 0-1
  social_energy: number; // 0-1
  initiative_level: number; // 0-1
  emotional_openness: number; // 0-1
  // Stargazer enrichment (optional, added when 33-axis data available)
  cautiousness?: number; // 0-1 from cautious_vs_bold
  emotional_regulation?: number; // 0-1 from emotional_regulation
  intimacy_pace?: number; // 0-1 from intimacy_pace
  reassurance_need?: number; // 0-1 from reassurance_need
  boundary_awareness?: number; // 0-1 from boundary_awareness
  directness?: number; // 0-1 from direct_vs_diplomatic
  novelty_seeking?: number; // 0-1 from tradition_vs_novelty
  planning_preference?: number; // 0-1 from plan_vs_spontaneous
  created_from_vector: MatchingVector;
  stargazer_enriched?: boolean;
};

export type AvatarConversationStyle = {
  aggressiveness: number; // 0-1
  depth_tendency: number; // 0-1
  humor_level: number; // 0-1
  empathy_level: number; // 0-1
};

// ---------- Skill Definitions ----------

export type SkillDefinition = {
  type: AvatarSkillType;
  nameJa: string;
  descriptionJa: string;
  levelThresholds: { level: number; label: string }[];
};

export const SKILL_DEFINITIONS: SkillDefinition[] = [
  {
    type: "deep_questions",
    nameJa: "深掘り力",
    descriptionJa: "相手の本音や価値観を引き出す質問を投げかける能力",
    levelThresholds: [
      { level: 0, label: "初心者" },
      { level: 20, label: "見習い" },
      { level: 40, label: "探求者" },
      { level: 60, label: "洞察者" },
      { level: 80, label: "達人" },
      { level: 95, label: "マスター" },
    ],
  },
  {
    type: "humor",
    nameJa: "ユーモア力",
    descriptionJa: "会話を楽しく盛り上げる力。緊張をほぐし、距離を縮める",
    levelThresholds: [
      { level: 0, label: "初心者" },
      { level: 20, label: "見習い" },
      { level: 40, label: "ムードメーカー" },
      { level: 60, label: "笑いの達人" },
      { level: 80, label: "コメディアン" },
      { level: 95, label: "マスター" },
    ],
  },
  {
    type: "empathy",
    nameJa: "共感力",
    descriptionJa: "相手の感情を正確に読み取り、寄り添う力",
    levelThresholds: [
      { level: 0, label: "初心者" },
      { level: 20, label: "見習い" },
      { level: 40, label: "傾聴者" },
      { level: 60, label: "共鳴者" },
      { level: 80, label: "心の読み手" },
      { level: 95, label: "マスター" },
    ],
  },
  {
    type: "incisiveness",
    nameJa: "切り込み力",
    descriptionJa: "核心をつく鋭い発言で会話を深める力",
    levelThresholds: [
      { level: 0, label: "初心者" },
      { level: 20, label: "見習い" },
      { level: 40, label: "観察者" },
      { level: 60, label: "分析者" },
      { level: 80, label: "洞察の達人" },
      { level: 95, label: "マスター" },
    ],
  },
  {
    type: "topic_expansion",
    nameJa: "話題展開力",
    descriptionJa: "自然に話題を広げ、会話の幅を広げる力",
    levelThresholds: [
      { level: 0, label: "初心者" },
      { level: 20, label: "見習い" },
      { level: 40, label: "会話の案内人" },
      { level: 60, label: "話題の引き出し" },
      { level: 80, label: "万能トーカー" },
      { level: 95, label: "マスター" },
    ],
  },
  {
    type: "silence_handling",
    nameJa: "沈黙対応力",
    descriptionJa: "会話の間や沈黙を自然に活用する力",
    levelThresholds: [
      { level: 0, label: "初心者" },
      { level: 20, label: "見習い" },
      { level: 40, label: "間の使い手" },
      { level: 60, label: "静寂の職人" },
      { level: 80, label: "余白の達人" },
      { level: 95, label: "マスター" },
    ],
  },
];

// ---------- Functions ----------

/**
 * MatchingVector + (optional) Stargazer軸からアバターの初期パーソナリティを生成
 *
 * Stargazer 45軸データがあれば、アバターの人格に深みを追加:
 * - cautiousness: 慎重さ vs 大胆さ → 会話の切り出し方に影響
 * - emotional_regulation: 感情制御力 → ストレス時の応答パターン
 * - intimacy_pace: 親密さのペース → 深い話への移行速度
 * - reassurance_need: 安心欲求 → 相手の反応への敏感さ
 * - boundary_awareness: 境界認識 → 踏み込みの判断
 * - directness: 直接性 → メッセージの率直さ
 * - novelty_seeking: 新奇性追求 → 話題の幅
 * - planning_preference: 計画性 → 会話の構造化度
 */
export function initializePersonality(
  matchingVector: MatchingVector,
  stargazerAxes?: StargazerAxisSnapshot[],
): AvatarPersonalityState {
  const base: AvatarPersonalityState = {
    base_temperature: matchingVector.conversation_temperature,
    depth_tendency: matchingVector.depth_speed,
    social_energy: matchingVector.social_energy,
    initiative_level: matchingVector.initiative,
    emotional_openness: matchingVector.emotional_openness,
    created_from_vector: matchingVector,
  };

  if (!stargazerAxes || stargazerAxes.length === 0) return base;

  // Build axis map for quick lookup
  const axisMap = new Map<string, number>();
  for (const a of stargazerAxes) {
    // Only use axes with reasonable confidence
    if (a.confidence !== undefined && a.confidence < 0.2) continue;
    axisMap.set(a.axis_id, a.score);
  }

  // Helper: convert -1..+1 stargazer score to 0..1 personality range
  const toUnit = (axisId: string): number | undefined => {
    const score = axisMap.get(axisId);
    if (score === undefined) return undefined;
    return clamp01((score + 1) / 2);
  };

  // Enrich with Stargazer axes
  const cautiousness = toUnit("cautious_vs_bold");
  const emotionalReg = toUnit("emotional_regulation");
  const intimacyPace = toUnit("intimacy_pace");
  const reassuranceNeed = toUnit("reassurance_need");
  const boundaryAwareness = toUnit("boundary_awareness");
  const directness = toUnit("direct_vs_diplomatic");
  const noveltySeeking = toUnit("tradition_vs_novelty");
  const planningPref = toUnit("plan_vs_spontaneous");

  // Cross-influence: Stargazer data refines base personality
  // cautiousness reduces initiative slightly (cautious people don't rush)
  if (cautiousness !== undefined) {
    base.initiative_level = clamp01(
      base.initiative_level * 0.7 + (1 - cautiousness) * 0.3,
    );
  }

  // emotional_regulation enhances empathy skill baseline
  if (emotionalReg !== undefined) {
    base.emotional_openness = clamp01(
      base.emotional_openness * 0.6 + emotionalReg * 0.4,
    );
  }

  // intimacy_pace adjusts depth_tendency
  if (intimacyPace !== undefined) {
    base.depth_tendency = clamp01(
      base.depth_tendency * 0.6 + intimacyPace * 0.4,
    );
  }

  return {
    ...base,
    cautiousness,
    emotional_regulation: emotionalReg,
    intimacy_pace: intimacyPace,
    reassurance_need: reassuranceNeed,
    boundary_awareness: boundaryAwareness,
    directness,
    novelty_seeking: noveltySeeking,
    planning_preference: planningPref,
    stargazer_enriched: true,
  };
}

/**
 * 初期スキルセットを生成（ベクトル + Stargazer軸に応じた初期値）
 *
 * Stargazer軸がある場合、スキルの初期値がより精密になる:
 * - analytical_vs_intuitive → deep_questions のブースト
 * - introvert_vs_extrovert → silence_handling のブースト
 * - direct_vs_diplomatic → incisiveness の調整
 */
export function initializeSkills(
  matchingVector: MatchingVector,
  stargazerAxes?: StargazerAxisSnapshot[],
): AvatarSkill[] {
  const axisMap = new Map<string, number>();
  if (stargazerAxes) {
    for (const a of stargazerAxes) {
      if (a.confidence !== undefined && a.confidence < 0.2) continue;
      axisMap.set(a.axis_id, a.score);
    }
  }

  // Helper: get stargazer bonus (0-10 range), returns 0 if axis not available
  const bonus = (axisId: string, weight: number = 10): number => {
    const score = axisMap.get(axisId);
    if (score === undefined) return 0;
    return Math.round(((score + 1) / 2) * weight);
  };

  return [
    {
      skill_type: "deep_questions",
      level: Math.round(matchingVector.depth_speed * 30 + 10)
        + bonus("analytical_vs_intuitive", 8),  // 分析的→深い質問が得意
      experience: 0,
    },
    {
      skill_type: "humor",
      level: Math.round(matchingVector.conversation_temperature * 25 + 10)
        + bonus("introvert_vs_extrovert", 5),  // 外向的→ユーモア高め
      experience: 0,
    },
    {
      skill_type: "empathy",
      level: Math.round(matchingVector.emotional_openness * 30 + 10)
        + bonus("emotional_regulation", 8),  // 感情制御→共感力
      experience: 0,
    },
    {
      skill_type: "incisiveness",
      level: Math.round(matchingVector.conflict_directness * 25 + 10)
        + bonus("direct_vs_diplomatic", 7),  // 直接的→切り込み力
      experience: 0,
    },
    {
      skill_type: "topic_expansion",
      level: Math.round(matchingVector.stimulation_need * 25 + 10)
        + bonus("tradition_vs_novelty", 6),  // 新奇性→話題展開
      experience: 0,
    },
    {
      skill_type: "silence_handling",
      level: Math.round(matchingVector.distance_need * 25 + 10)
        + bonus("intimacy_pace", 7),  // 親密ペース→沈黙対応
      experience: 0,
    },
  ];
}

/**
 * パーソナリティとスキルから会話スタイルを決定
 * Stargazer enrichedの場合、より精密な人格表現が可能
 */
export function computeConversationStyle(
  personality: AvatarPersonalityState,
  skills: AvatarSkill[],
): AvatarConversationStyle {
  const skillMap = new Map(skills.map((s) => [s.skill_type, s.level]));
  const getLevel = (t: AvatarSkillType) => (skillMap.get(t) ?? 20) / 100;

  // aggressiveness: initiative + incisiveness + conflict_directness
  let aggressiveness = clamp01(
    personality.initiative_level * 0.4 +
      getLevel("incisiveness") * 0.4 +
      personality.base_temperature * 0.2,
  );

  // depth_tendency: depth_speed + deep_questions skill
  let depth_tendency = clamp01(
    personality.depth_tendency * 0.5 + getLevel("deep_questions") * 0.5,
  );

  // humor_level: social_energy + humor skill + temperature
  let humor_level = clamp01(
    personality.social_energy * 0.3 +
      getLevel("humor") * 0.5 +
      personality.base_temperature * 0.2,
  );

  // empathy_level: emotional_openness + empathy skill
  let empathy_level = clamp01(
    personality.emotional_openness * 0.4 + getLevel("empathy") * 0.6,
  );

  // Stargazer enrichment: 45軸データで微調整
  if (personality.stargazer_enriched) {
    // cautiousness dampens aggressiveness
    if (personality.cautiousness !== undefined) {
      aggressiveness = clamp01(
        aggressiveness * (1 - personality.cautiousness * 0.3),
      );
    }

    // directness boosts aggressiveness
    if (personality.directness !== undefined) {
      aggressiveness = clamp01(
        aggressiveness + personality.directness * 0.15,
      );
    }

    // boundary_awareness enhances empathy
    if (personality.boundary_awareness !== undefined) {
      empathy_level = clamp01(
        empathy_level + personality.boundary_awareness * 0.1,
      );
    }

    // novelty_seeking widens humor and depth balance
    if (personality.novelty_seeking !== undefined) {
      humor_level = clamp01(humor_level + personality.novelty_seeking * 0.1);
    }

    // planning_preference adds structure to depth
    if (personality.planning_preference !== undefined) {
      depth_tendency = clamp01(
        depth_tendency + (1 - personality.planning_preference) * 0.05,
      );
    }
  }

  return { aggressiveness, depth_tendency, humor_level, empathy_level };
}

/**
 * 経験値を追加し、自動レベルアップ
 */
export function addExperience(
  skills: AvatarSkill[],
  skillType: AvatarSkillType,
  amount: number,
): AvatarSkill[] {
  return skills.map((s) => {
    if (s.skill_type !== skillType) return s;

    const newExp = s.experience + amount;
    // XP -> level: diminishing returns curve
    // level = min(100, floor(sqrt(newExp) * 2))
    const newLevel = Math.min(100, Math.floor(Math.sqrt(newExp) * 2));

    return {
      ...s,
      experience: newExp,
      level: Math.max(s.level, newLevel), // never decrease
    };
  });
}

/**
 * スキル成長のサマリーを日本語で返す
 */
export function getSkillGrowthSummary(
  before: AvatarSkill[],
  after: AvatarSkill[],
): string {
  const beforeMap = new Map(before.map((s) => [s.skill_type, s.level]));
  const changes: string[] = [];

  for (const skill of after) {
    const prev = beforeMap.get(skill.skill_type) ?? 0;
    if (skill.level > prev) {
      const def = SKILL_DEFINITIONS.find((d) => d.type === skill.skill_type);
      const name = def?.nameJa ?? skill.skill_type;
      const diff = skill.level - prev;

      // Check if crossed a threshold
      const newThreshold = def?.levelThresholds
        .filter((t) => t.level <= skill.level && t.level > prev)
        .pop();

      if (newThreshold) {
        changes.push(
          `${name}が「${newThreshold.label}」に到達！(+${diff})`,
        );
      } else {
        changes.push(`${name}が+${diff}上昇`);
      }
    }
  }

  if (changes.length === 0) return "スキルに変化なし";
  return changes.join("、");
}

/**
 * スキルの現在ランクラベルを取得
 */
export function getSkillRankLabel(
  skillType: AvatarSkillType,
  level: number,
): string {
  const def = SKILL_DEFINITIONS.find((d) => d.type === skillType);
  if (!def) return "不明";

  const threshold = [...def.levelThresholds]
    .reverse()
    .find((t) => level >= t.level);
  return threshold?.label ?? "初心者";
}

// ---------- Helpers ----------

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
