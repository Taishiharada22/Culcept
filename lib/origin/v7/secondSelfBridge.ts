/**
 * Second Self Bridge — Origin → Rendezvous ベクトルプレビュー
 * 判断原理・揺れ方・安全プロファイル・10次元マッチングベクトルをルールベースで導出。
 * AI不要。OriginV7Save + BehavioralLawsResult → SecondSelfPreviewResult の純関数。
 */

import type { OriginV7Save, LifePeriod, LifeDomain, TargetedResponse } from "./types";
import type {
  EraRole,
  RelationshipTone,
  RewardType,
  LifeCenter,
} from "./workspaceTypes";
import type { BehavioralLawsResult } from "./behavioralLaws";
import type { DomainBehaviorProfile } from "./contextualBehavior";
import { applyTargetedResponses } from "./vectorRefinement";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   出力型
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type JudgmentPrinciple = {
  domain: string;
  principle: string;
  evidence: string[];
};

export type FluctuationPattern = {
  trigger: string;
  response: string;
  recovery: string | null;
};

export type SafetyProfile = {
  safeConditions: string[];
  dangerSignals: string[];
  recoveryMethods: string[];
};

export type RendezvousVectorPreview = {
  conversation_temperature: number;
  distance_need: number;
  depth_speed: number;
  stability_need: number;
  stimulation_need: number;
  initiative: number;
  emotional_openness: number;
  conflict_directness: number;
  social_energy: number;
  structure_preference: number;
  derivedDimensions: string[];
  underivableDimensions: string[];
};

export type ContextualRendezvousVector = {
  domain: LifeDomain;
  vector: RendezvousVectorPreview;
  confidence: number;
  dataPointCount: number;
};

export type RelationshipDepthProfile = {
  trustBuildSpeed: number;          // 0-1
  trustBreakers: string[];
  recoveryPattern: string | null;
  intimacyComfort: number;          // 0-1
  conflictStyle: "avoid" | "confront" | "mediate" | "withdraw" | null;
  evidenceSources: string[];
};

export type SecondSelfPreviewResult = {
  judgmentPrinciples: JudgmentPrinciple[];
  fluctuationPattern: FluctuationPattern | null;
  safetyProfile: SafetyProfile;
  rendezvousPreview: RendezvousVectorPreview;
  contextualVectors?: ContextualRendezvousVector[];
  relationshipDepth?: RelationshipDepthProfile;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   メイン導出関数
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function deriveSecondSelfPreview(
  save: OriginV7Save,
  laws: BehavioralLawsResult,
  domainProfiles?: DomainBehaviorProfile[],
  targetedResponses?: TargetedResponse[],
): SecondSelfPreviewResult {
  let rendezvousPreview = deriveRendezvousVector(save, laws);

  // TargetedResponses があればベクトルに適用
  if (targetedResponses && targetedResponses.length > 0) {
    rendezvousPreview = applyTargetedResponses(rendezvousPreview, targetedResponses);
  }

  // ドメイン別ベクトル導出
  const contextualVectors = domainProfiles
    ? deriveContextualVectors(rendezvousPreview, domainProfiles)
    : undefined;

  // 信頼・親密度プロファイル
  const relationshipDepth = deriveRelationshipDepth(save, laws);

  return {
    judgmentPrinciples: deriveJudgmentPrinciples(laws),
    fluctuationPattern: deriveFluctuationPattern(laws),
    safetyProfile: deriveSafetyProfile(laws),
    rendezvousPreview,
    contextualVectors,
    relationshipDepth,
  };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   1. 判断原理
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function deriveJudgmentPrinciples(laws: BehavioralLawsResult): JudgmentPrinciple[] {
  const principles: JudgmentPrinciple[] = [];

  // 人間関係ドメイン: contradictions + repeatingPatterns から
  const interpersonalPatterns = laws.repeatingPatterns.filter((rp) =>
    ["空気を読む", "相手に合わせる", "距離を置く", "本音を言いにくい", "世話を焼く",
     "頼られると断れない", "自分から声をかけにくい", "明るく振る舞う"].some(
      (k) => rp.pattern.includes(k),
    ),
  );
  if (interpersonalPatterns.length > 0) {
    principles.push({
      domain: "人間関係",
      principle: interpersonalPatterns[0].pattern,
      evidence: interpersonalPatterns[0].appearances.map((a) => a.context),
    });
  }

  // 仕事/活動ドメイン: decisionPrinciples から
  for (const dp of laws.decisionPrinciples.slice(0, 1)) {
    principles.push({
      domain: "行動選択",
      principle: dp.principle,
      evidence: dp.evidence,
    });
  }

  // 自己管理ドメイン: collapse/growth patterns
  if (laws.collapseConditions.length > 0 && laws.growthConditions.length > 0) {
    principles.push({
      domain: "自己管理",
      principle: `「${laws.growthConditions[0].trigger}」なら伸び、「${laws.collapseConditions[0].trigger}」で崩れる`,
      evidence: [
        ...laws.growthConditions[0].evidence.slice(0, 1),
        ...laws.collapseConditions[0].evidence.slice(0, 1),
      ],
    });
  }

  return principles.slice(0, 3);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   2. 揺れ方パターン
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function deriveFluctuationPattern(laws: BehavioralLawsResult): FluctuationPattern | null {
  if (laws.collapseConditions.length === 0) return null;

  const collapse = laws.collapseConditions[0];
  const growth = laws.growthConditions[0];

  return {
    trigger: collapse.trigger,
    response: collapse.mechanism,
    recovery: growth ? growth.trigger : null,
  };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   3. 安全プロファイル
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function deriveSafetyProfile(laws: BehavioralLawsResult): SafetyProfile {
  const safeConditions = laws.growthConditions.map((gc) => gc.trigger);
  const dangerSignals = laws.collapseConditions.map((cc) => cc.trigger);

  // Recovery: growth conditions の mechanism から推測
  const recoveryMethods = laws.growthConditions
    .map((gc) => {
      const parts = gc.mechanism.split(" → ");
      return parts[0] ?? gc.trigger;
    })
    .slice(0, 3);

  return {
    safeConditions: safeConditions.slice(0, 3),
    dangerSignals: dangerSignals.slice(0, 3),
    recoveryMethods,
  };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   4. Rendezvous 10次元ベクトル
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const DIMENSION_NAMES = [
  "conversation_temperature",
  "distance_need",
  "depth_speed",
  "stability_need",
  "stimulation_need",
  "initiative",
  "emotional_openness",
  "conflict_directness",
  "social_energy",
  "structure_preference",
] as const;

type DimensionName = (typeof DIMENSION_NAMES)[number];

const DIMENSION_LABELS: Record<DimensionName, string> = {
  conversation_temperature: "会話温度",
  distance_need: "距離の必要性",
  depth_speed: "深まり速度",
  stability_need: "安定の必要性",
  stimulation_need: "刺激の必要性",
  initiative: "主導性",
  emotional_openness: "感情の開示度",
  conflict_directness: "衝突の直接度",
  social_energy: "社交エネルギー",
  structure_preference: "構造志向",
};

function deriveRendezvousVector(
  save: OriginV7Save,
  laws: BehavioralLawsResult,
): RendezvousVectorPreview {
  const derived: string[] = [];
  const underivable: string[] = [];

  // Helper: collect all data signals
  const eras = save.eraAffiliations ?? [];
  const activities = save.activities ?? [];
  const residueLabels = new Set((save.residueBoard ?? []).map((r) => r.label));
  const residueCategories = new Map<string, string[]>();
  for (const r of save.residueBoard ?? []) {
    if (!residueCategories.has(r.category)) residueCategories.set(r.category, []);
    residueCategories.get(r.category)!.push(r.label);
  }

  const seekingIds = new Set(save.currentPosition?.seeking ?? []);
  const roles = eras.map((e) => e.mainRole).filter(Boolean) as EraRole[];
  const relationships = eras.map((e) => e.relationships).filter(Boolean) as RelationshipTone[];
  const allRewards: RewardType[] = [];
  for (const a of activities) {
    if (a.analyticalFrame) allRewards.push(...a.analyticalFrame.reward);
  }
  const homeAtmo = save.rootProfile?.homeAtmosphere;

  // 1. conversation_temperature
  let convTemp = 0.5;
  if (relationships.includes("close_group") || relationships.includes("few_deep")) {
    convTemp = 0.7;
    derived.push("conversation_temperature");
  } else if (relationships.includes("wide_shallow")) {
    convTemp = 0.5;
    derived.push("conversation_temperature");
  } else if (relationships.includes("mostly_alone")) {
    convTemp = 0.3;
    derived.push("conversation_temperature");
  } else {
    underivable.push("conversation_temperature");
  }

  // 2. distance_need
  let distNeed = 0.5;
  const defenseResidues = residueCategories.get("defense") ?? [];
  if (defenseResidues.length >= 2 || residueLabels.has("距離を置く") || residueLabels.has("一人で抱える")) {
    distNeed = 0.8;
    derived.push("distance_need");
  } else if (homeAtmo === "warm" || homeAtmo === "free") {
    distNeed = 0.3;
    derived.push("distance_need");
  } else if (homeAtmo) {
    distNeed = 0.5;
    derived.push("distance_need");
  } else {
    underivable.push("distance_need");
  }

  // 3. depth_speed
  let depthSpeed = 0.5;
  const avgRevisit = save.chapters.length > 0
    ? save.chapters.reduce((sum, ch) => sum + ch.revisitCount, 0) / save.chapters.length
    : 0;
  if (avgRevisit > 1) {
    depthSpeed = 0.3; // slow = more careful
    derived.push("depth_speed");
  } else if (save.chapters.length >= 3) {
    depthSpeed = 0.6;
    derived.push("depth_speed");
  } else {
    underivable.push("depth_speed");
  }

  // 4. stability_need
  let stabilityNeed = 0.5;
  if (residueLabels.has("安心感") || seekingIds.has("safe_place") || seekingIds.has("calm_relation")) {
    stabilityNeed = 0.8;
    derived.push("stability_need");
  } else if (seekingIds.has("next_challenge") || seekingIds.has("passion")) {
    stabilityNeed = 0.3;
    derived.push("stability_need");
  } else {
    underivable.push("stability_need");
  }

  // 5. stimulation_need
  let stimNeed = 0.5;
  if (activities.length >= 4 || (save.turningPoints ?? []).length >= 3) {
    stimNeed = 0.7;
    derived.push("stimulation_need");
  } else if (activities.length <= 1) {
    stimNeed = 0.3;
    derived.push("stimulation_need");
  } else {
    underivable.push("stimulation_need");
  }

  // 6. initiative
  let initiative = 0.5;
  if (roles.includes("leader") || roles.includes("entertainer")) {
    initiative = 0.8;
    derived.push("initiative");
  } else if (roles.includes("follower") || roles.includes("observer")) {
    initiative = 0.3;
    derived.push("initiative");
  } else if (roles.length > 0) {
    initiative = 0.5;
    derived.push("initiative");
  } else {
    underivable.push("initiative");
  }

  // 7. emotional_openness
  let emotionalOpen = 0.5;
  if (residueLabels.has("本音を言いにくい") || residueLabels.has("感情を出さない") || residueLabels.has("自分を少し抑える")) {
    emotionalOpen = 0.3;
    derived.push("emotional_openness");
  } else if (homeAtmo === "warm" || residueLabels.has("共感力")) {
    emotionalOpen = 0.7;
    derived.push("emotional_openness");
  } else if (homeAtmo) {
    emotionalOpen = 0.5;
    derived.push("emotional_openness");
  } else {
    underivable.push("emotional_openness");
  }

  // 8. conflict_directness
  let conflictDirect = 0.5;
  const suppressPatterns = laws.repeatingPatterns.filter((rp) =>
    ["空気を読む", "相手に合わせる", "自分を少し抑える", "笑って流す", "受け流す"].some(
      (k) => rp.pattern.includes(k),
    ),
  );
  if (suppressPatterns.length >= 1) {
    conflictDirect = 0.2;
    derived.push("conflict_directness");
  } else if (roles.includes("leader")) {
    conflictDirect = 0.7;
    derived.push("conflict_directness");
  } else {
    underivable.push("conflict_directness");
  }

  // 9. social_energy
  let socialEnergy = 0.5;
  if (relationships.includes("wide_shallow")) {
    socialEnergy = 0.8;
    derived.push("social_energy");
  } else if (relationships.includes("mostly_alone")) {
    socialEnergy = 0.2;
    derived.push("social_energy");
  } else if (relationships.length > 0) {
    socialEnergy = 0.5;
    derived.push("social_energy");
  } else {
    underivable.push("social_energy");
  }

  // 10. structure_preference
  let structPref = 0.5;
  if (residueLabels.has("完璧を目指す") || residueLabels.has("完璧に準備する") || residueLabels.has("石橋を叩いて渡る")) {
    structPref = 0.8;
    derived.push("structure_preference");
  } else if (residueLabels.has("すぐに行動する") || allRewards.includes("freedom")) {
    structPref = 0.3;
    derived.push("structure_preference");
  } else {
    underivable.push("structure_preference");
  }

  return {
    conversation_temperature: convTemp,
    distance_need: distNeed,
    depth_speed: depthSpeed,
    stability_need: stabilityNeed,
    stimulation_need: stimNeed,
    initiative,
    emotional_openness: emotionalOpen,
    conflict_directness: conflictDirect,
    social_energy: socialEnergy,
    structure_preference: structPref,
    derivedDimensions: derived,
    underivableDimensions: underivable,
  };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   5. ドメイン別ベクトル
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function deriveContextualVectors(
  baseVector: RendezvousVectorPreview,
  profiles: DomainBehaviorProfile[],
): ContextualRendezvousVector[] {
  return profiles.map((profile) => {
    // ベースベクトルをドメイン特性で調整
    const adjustedVector = { ...baseVector };

    // initiative はドメイン直接データがある
    if (profile.initiative !== 0.5) {
      adjustedVector.initiative = profile.initiative;
    }

    // emotionalOpenness もドメイン直接データ
    if (profile.emotionalOpenness !== 0.5) {
      adjustedVector.emotional_openness = profile.emotionalOpenness;
    }

    // ドメイン特性による微調整
    switch (profile.domain) {
      case "work":
        // 仕事では構造志向が高まりがち
        adjustedVector.structure_preference = Math.min(
          1,
          baseVector.structure_preference + 0.1,
        );
        break;
      case "romance":
        // 恋愛では距離感が大きく変わりうる
        adjustedVector.distance_need = Math.max(
          0,
          baseVector.distance_need - 0.1,
        );
        adjustedVector.depth_speed = Math.min(
          1,
          baseVector.depth_speed + 0.1,
        );
        break;
      case "friendship":
        // 友人では会話温度が上がりやすい
        adjustedVector.conversation_temperature = Math.min(
          1,
          baseVector.conversation_temperature + 0.1,
        );
        break;
      case "family":
        // 家族では安定志向が高まる
        adjustedVector.stability_need = Math.min(
          1,
          baseVector.stability_need + 0.1,
        );
        break;
      case "solitude":
        // 一人の時間では社交エネルギーが下がる
        adjustedVector.social_energy = Math.max(
          0,
          baseVector.social_energy - 0.15,
        );
        adjustedVector.distance_need = Math.min(
          1,
          baseVector.distance_need + 0.15,
        );
        break;
    }

    return {
      domain: profile.domain,
      vector: adjustedVector,
      confidence:
        profile.evidenceSources.length >= 3
          ? 0.8
          : profile.evidenceSources.length >= 1
            ? 0.5
            : 0.2,
      dataPointCount: profile.evidenceSources.length,
    };
  });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   6. 信頼・親密度プロファイル
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const LIFE_CENTER_TO_DOMAIN_LOCAL: Record<string, LifeDomain> = {
  study: "work", club: "work", friends: "friendship", family: "family",
  hobby: "solitude", part_time: "work", romance: "romance",
  survival: "solitude", escape: "solitude",
};

function deriveRelationshipDepth(
  save: OriginV7Save,
  laws: BehavioralLawsResult,
): RelationshipDepthProfile {
  const eras = save.eraAffiliations ?? [];
  const residueLabels = new Set((save.residueBoard ?? []).map((r) => r.label));
  const relationships = eras
    .map((e) => e.relationships)
    .filter(Boolean) as RelationshipTone[];
  const roles = eras.map((e) => e.mainRole).filter(Boolean) as EraRole[];
  const evidenceSources: string[] = [];

  // trustBuildSpeed: 人間関係の傾向から
  let trustBuildSpeed = 0.5;
  if (relationships.includes("few_deep")) {
    trustBuildSpeed = 0.3; // ゆっくり深める
    evidenceSources.push("少数の深い関係を好む傾向");
  } else if (relationships.includes("close_group")) {
    trustBuildSpeed = 0.5;
    evidenceSources.push("グループ内の信頼関係");
  } else if (relationships.includes("wide_shallow")) {
    trustBuildSpeed = 0.7; // 広く浅く = 早めに打ち解ける
    evidenceSources.push("広い人間関係を築く傾向");
  } else if (relationships.includes("mostly_alone")) {
    trustBuildSpeed = 0.2;
    evidenceSources.push("単独行動を好む傾向");
  }

  // trustBreakers: 崩壊条件 + 残留ボードから
  const trustBreakers: string[] = [];
  for (const cc of laws.collapseConditions.slice(0, 2)) {
    if (cc.trigger.includes("裏切") || cc.trigger.includes("嘘") ||
        cc.trigger.includes("約束") || cc.trigger.includes("信頼")) {
      trustBreakers.push(cc.trigger);
    }
  }
  if (residueLabels.has("裏切りへの警戒")) trustBreakers.push("裏切りへの警戒");
  if (residueLabels.has("本音を言いにくい")) trustBreakers.push("本音を隠されること");
  if (residueLabels.has("距離を置く")) trustBreakers.push("侵入的な距離感");

  // fallback
  if (trustBreakers.length === 0 && laws.collapseConditions.length > 0) {
    trustBreakers.push(laws.collapseConditions[0].trigger);
  }

  // recoveryPattern: 成長条件から
  let recoveryPattern: string | null = null;
  if (laws.growthConditions.length > 0) {
    recoveryPattern = laws.growthConditions[0].trigger;
    evidenceSources.push(`回復条件: ${recoveryPattern}`);
  }

  // intimacyComfort: 感情開示の残留 + 家庭環境
  let intimacyComfort = 0.5;
  const homeAtmo = save.rootProfile?.homeAtmosphere;
  if (residueLabels.has("感情を出さない") || residueLabels.has("一人で抱える")) {
    intimacyComfort = 0.3;
    evidenceSources.push("感情を抑える傾向");
  } else if (residueLabels.has("共感力") || residueLabels.has("素直さ")) {
    intimacyComfort = 0.7;
    evidenceSources.push("共感力・素直さ");
  } else if (homeAtmo === "warm" || homeAtmo === "free") {
    intimacyComfort = 0.6;
    evidenceSources.push(`家庭環境: ${homeAtmo}`);
  }

  // conflictStyle: 反復パターン + ロールから
  let conflictStyle: RelationshipDepthProfile["conflictStyle"] = null;
  const suppressPatterns = laws.repeatingPatterns.filter((rp) =>
    ["空気を読む", "相手に合わせる", "笑って流す", "受け流す"].some(
      (k) => rp.pattern.includes(k),
    ),
  );
  if (suppressPatterns.length >= 1) {
    conflictStyle = "avoid";
    evidenceSources.push("衝突回避パターン");
  } else if (roles.includes("mediator")) {
    conflictStyle = "mediate";
    evidenceSources.push("調整役の経験");
  } else if (roles.includes("leader")) {
    conflictStyle = "confront";
    evidenceSources.push("リーダーの経験");
  } else if (residueLabels.has("距離を置く")) {
    conflictStyle = "withdraw";
    evidenceSources.push("距離を置く傾向");
  }

  return {
    trustBuildSpeed: Math.round(trustBuildSpeed * 100) / 100,
    trustBreakers: trustBreakers.slice(0, 3),
    recoveryPattern,
    intimacyComfort: Math.round(intimacyComfort * 100) / 100,
    conflictStyle,
    evidenceSources: evidenceSources.slice(0, 5),
  };
}
