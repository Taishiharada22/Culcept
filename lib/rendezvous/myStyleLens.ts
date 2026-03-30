import type { SupabaseClient } from "@supabase/supabase-js";
import { selectUserStyleSummaryForUsers } from "@/lib/userStyleSummary";

import {
  buildMyStyleProfile,
  isRecord,
  normalizeSavedState,
} from "@/app/my-style/_lib/state";
import {
  IMPRESSION_OPTIONS,
  getElementLabel,
  getStyleLaneLabel,
  normalizeElementId,
  normalizeStyleLaneId,
} from "@/app/my-style/_lib/catalog";
import type { MyStyleProfile, SeekContextKey } from "@/app/my-style/_lib/types";

import type { AvatarJudgment } from "./questions/constants";
import type { ContextReason, ContextType } from "./questions/types";
import type {
  ContextLensDetail,
  ContextMatchScore,
  MatchExplanation,
} from "./types";

type StyleSummaryRow = {
  user_id: string;
  style_tags?: unknown;
  wardrobe_colors?: unknown;
  wardrobe_categories?: unknown;
  quiz_result?: unknown;
  mood_keywords?: unknown;
  favorite_colors?: unknown;
};

type MatchSignals = {
  laneOverlap: string[];
  preferredElementOverlap: string[];
  avoidedElementConflicts: string[];
  impressionFit: string[];
  wardrobeEvidence: string[];
  outfitEvidence: string[];
  complementSignals: string[];
  confidence: number;
};

const CONTEXT_KEYS: ContextType[] = ["romance", "friend", "cocreation", "orbiter"];

const CONTEXT_LABELS: Record<ContextType, string> = {
  romance: "romance",
  friend: "friend",
  cocreation: "cocreation",
  orbiter: "orbiter",
};

const CONTEXT_WEIGHTS: Record<
  ContextType,
  {
    laneFit: number;
    elementFit: number;
    impressionFit: number;
    complementFit: number;
    conflictPenalty: number;
    evidenceStrength: number;
  }
> = {
  romance: {
    laneFit: 0.24,
    elementFit: 0.22,
    impressionFit: 0.22,
    complementFit: 0.12,
    conflictPenalty: 0.10,
    evidenceStrength: 0.10,
  },
  friend: {
    laneFit: 0.20,
    elementFit: 0.20,
    impressionFit: 0.26,
    complementFit: 0.10,
    conflictPenalty: 0.10,
    evidenceStrength: 0.14,
  },
  cocreation: {
    laneFit: 0.16,
    elementFit: 0.18,
    impressionFit: 0.24,
    complementFit: 0.22,
    conflictPenalty: 0.08,
    evidenceStrength: 0.12,
  },
  orbiter: {
    laneFit: 0.22,
    elementFit: 0.20,
    impressionFit: 0.24,
    complementFit: 0.16,
    conflictPenalty: 0.06,
    evidenceStrength: 0.12,
  },
};

const PRIMARY_WEIGHTS = [1, 0.84, 0.7];
const SECONDARY_WEIGHTS = [0.62, 0.5];
const TARGET_WEIGHTS = [1, 0.84, 0.7, 0.58, 0.48, 0.4];

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function uniqueList(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clamp100(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function bandLabel(score: number) {
  if (score >= 85) return "かなり合いそう";
  if (score >= 70) return "相性が良さそう";
  if (score >= 55) return "一部が強く噛み合う";
  if (score >= 40) return "まだらに一致";
  return "方向性に差がある";
}

function confidencePhrase(confidence: number) {
  if (confidence >= 0.78) return "かなり自然に噛み合います。";
  if (confidence >= 0.58) return "相性が良さそうです。";
  return "まだ仮の傾向ですが、近い可能性があります。";
}

function toAvatarJudgment(score: number): AvatarJudgment {
  if (score >= 75) return "go";
  if (score >= 55) return "hold";
  return "low_recommend";
}

function buildFallbackProfile(row: StyleSummaryRow): MyStyleProfile {
  const styleTags = toStringArray(row.style_tags)
    .map(normalizeStyleLaneId)
    .filter((entry): entry is MyStyleProfile["self"]["primaryLanes"][number] => Boolean(entry));
  const moodKeywords = toStringArray(row.mood_keywords);
  const wardrobeColors = toStringArray(row.wardrobe_colors);
  const favoriteColors = toStringArray(row.favorite_colors);
  const wardrobeCategories = isRecord(row.wardrobe_categories) ? row.wardrobe_categories : {};
  const primaryLanes = styleTags.slice(0, 3);
  const secondaryLanes = styleTags.slice(3, 5);
  const desiredImpressions = moodKeywords.filter((entry) => IMPRESSION_OPTIONS.includes(entry)).slice(0, 4);
  const likedElements = moodKeywords
    .map((entry) => normalizeElementId(entry))
    .filter((entry) => entry && normalizeText(getElementLabel(entry)) !== normalizeText(entry))
    .slice(0, 6);
  const topCategories = Object.entries(wardrobeCategories)
    .sort((a, b) => Number(b[1] ?? 0) - Number(a[1] ?? 0))
    .slice(0, 3)
    .map(([key]) => key);

  const wardrobeSignals = uniqueList([
    wardrobeColors.length > 0 ? `${wardrobeColors.slice(0, 3).join(" / ")} がワードローブの中心です` : "",
    topCategories.length > 0 ? `${topCategories.join(" / ")} が主力カテゴリです` : "",
    favoriteColors.length > 0 ? `${favoriteColors.slice(0, 2).join(" / ")} への反応が残っています` : "",
  ]);

  const signalCount =
    primaryLanes.length +
    secondaryLanes.length +
    desiredImpressions.length +
    wardrobeSignals.length;

  return {
    self: {
      primaryLanes,
      secondaryLanes,
      coreLanes: primaryLanes,
      rareLanes: secondaryLanes,
      secretLanes: [],
      unexpectedPulls: [],
      likedElements,
      dislikedElements: [],
      desiredImpressions,
      naturalSelfTags: [],
      attractedWorldviews: [],
      repeatedBecomeResults: [],
      wardrobeSignals,
      outfitSignals: [],
      timelineSignals: [],
    },
    seek: {
      romance: { preferredLanes: [], preferredElements: [], avoidedElements: [], similarityPreference: "mixed", memo: "" },
      friend: { preferredLanes: [], preferredElements: [], avoidedElements: [], similarityPreference: "mixed", memo: "" },
      cocreation: { preferredLanes: [], preferredElements: [], avoidedElements: [], similarityPreference: "mixed", memo: "" },
      orbiter: { preferredLanes: [], preferredElements: [], avoidedElements: [], similarityPreference: "mixed", memo: "" },
    },
    identity: {
      iam: { likedTags: [], dislikedTags: [], desiredImpressions: [], naturalSelfTags: [], memo: "" },
      iseek: { attractedWorldviews: [], attractedElements: [], unexpectedPulls: [], avoidedElements: [], memo: "" },
      ibecome: { pairs: [] },
    },
    evidence: {
      wardrobeStrength: clamp01(wardrobeSignals.length / 4),
      outfitStrength: 0,
      selectionStrength: clamp01(signalCount / 10),
      memoStrength: 0,
    },
    exportProfile: {
      primaryLanes,
      coreLanes: primaryLanes,
      rareLanes: secondaryLanes,
      secretLanes: [],
      unexpectedPulls: [],
      desiredImpressions,
      attractedWorldviews: [],
      repeatedBecomeResults: [],
      wardrobeSignals,
      outfitSignals: [],
      timelineSignals: [],
    },
  };
}

function profileFromRow(row: StyleSummaryRow): MyStyleProfile {
  const quizResult = isRecord(row.quiz_result) ? row.quiz_result : {};
  if (isRecord(quizResult.myStyleState)) {
    return buildMyStyleProfile(normalizeSavedState(quizResult.myStyleState));
  }
  return buildFallbackProfile(row);
}

export async function loadMyStyleProfileMap(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, MyStyleProfile>> {
  const ids = uniqueList(userIds);
  if (ids.length === 0) return new Map();

  const { data, error } = await selectUserStyleSummaryForUsers(
    supabase,
    ids,
    "user_id, style_tags, wardrobe_colors, wardrobe_categories, quiz_result, mood_keywords, favorite_colors",
    "user_id, style_tags, wardrobe_colors, wardrobe_categories, quiz_result",
  );

  if (error || !data) return new Map();

  const map = new Map<string, MyStyleProfile>();
  for (const row of data as unknown as StyleSummaryRow[]) {
    map.set(row.user_id, profileFromRow(row));
  }
  return map;
}

function labelPool(profile: MyStyleProfile) {
  const counterpartSignals = [
    ...profile.self.primaryLanes.map(getStyleLaneLabel),
    ...profile.self.secondaryLanes.map(getStyleLaneLabel),
    ...profile.self.likedElements.map(getElementLabel),
    ...profile.self.desiredImpressions,
    ...profile.self.wardrobeSignals,
    ...profile.self.outfitSignals,
  ];

  return counterpartSignals;
}

function matchesText(label: string, pool: string[]) {
  const normalizedLabel = normalizeText(label);
  return pool.some((entry) => {
    const normalizedEntry = normalizeText(entry);
    return normalizedEntry === normalizedLabel || normalizedEntry.includes(normalizedLabel);
  });
}

function weightedLaneFit(
  preferredLanes: string[],
  counterpartPrimary: string[],
  counterpartSecondary: string[],
) {
  if (preferredLanes.length === 0) return { score: 0, overlaps: [] as string[] };

  const counterpartWeights = new Map<string, number>();
  counterpartPrimary.forEach((lane, index) => counterpartWeights.set(lane, PRIMARY_WEIGHTS[index] ?? PRIMARY_WEIGHTS[PRIMARY_WEIGHTS.length - 1]));
  counterpartSecondary.forEach((lane, index) => {
    const current = counterpartWeights.get(lane) ?? 0;
    counterpartWeights.set(lane, Math.max(current, SECONDARY_WEIGHTS[index] ?? SECONDARY_WEIGHTS[SECONDARY_WEIGHTS.length - 1]));
  });

  let matched = 0;
  let total = 0;
  const overlaps: string[] = [];

  preferredLanes.forEach((lane, index) => {
    const targetWeight = TARGET_WEIGHTS[index] ?? TARGET_WEIGHTS[TARGET_WEIGHTS.length - 1];
    total += targetWeight;
    const counterpartWeight = counterpartWeights.get(lane) ?? 0;
    if (counterpartWeight > 0) {
      matched += targetWeight * counterpartWeight;
      overlaps.push(getStyleLaneLabel(lane));
    }
  });

  return {
    score: total > 0 ? clamp100((matched / total) * 100) : 0,
    overlaps: uniqueList(overlaps),
  };
}

function weightedElementFit(
  preferredElements: string[],
  counterpartProfile: MyStyleProfile,
) {
  if (preferredElements.length === 0) {
    return { score: 0, overlaps: [] as string[] };
  }

  const directSet = new Set(uniqueList([
    ...counterpartProfile.self.likedElements.map(normalizeElementId),
    ...counterpartProfile.self.desiredImpressions.map(normalizeElementId),
  ]));
  const pool = labelPool(counterpartProfile);

  let matched = 0;
  let total = 0;
  const overlaps: string[] = [];

  preferredElements.forEach((code, index) => {
    const weight = TARGET_WEIGHTS[index] ?? TARGET_WEIGHTS[TARGET_WEIGHTS.length - 1];
    total += weight;
    const normalized = normalizeElementId(code);
    const label = getElementLabel(normalized);
    let strength = 0;
    if (directSet.has(normalized)) strength = 1;
    else if (counterpartProfile.self.desiredImpressions.some((entry) => normalizeText(entry) === normalizeText(label))) strength = 0.92;
    else if (matchesText(label, pool)) strength = 0.74;
    if (strength > 0) {
      matched += weight * strength;
      overlaps.push(label);
    }
  });

  return {
    score: total > 0 ? clamp100((matched / total) * 100) : 0,
    overlaps: uniqueList(overlaps),
  };
}

function impressionFit(
  context: ContextType,
  selfProfile: MyStyleProfile,
  counterpartProfile: MyStyleProfile,
) {
  const preferredLabels = selfProfile.seek[context].preferredElements.map(getElementLabel);
  const counterpartDesired = counterpartProfile.self.desiredImpressions;
  const reciprocalPool = counterpartProfile.seek[context].preferredElements.map(getElementLabel);
  const counterpartLaneLabels = counterpartProfile.self.primaryLanes.map(getStyleLaneLabel);

  const directMatches = preferredLabels.filter((label) => counterpartDesired.some((entry) => normalizeText(entry) === normalizeText(label)));
  const reciprocalMatches = selfProfile.self.desiredImpressions.filter((label) =>
    reciprocalPool.some((entry) => normalizeText(entry) === normalizeText(label))
  );
  const laneEcho = selfProfile.seek[context].preferredLanes
    .map(getStyleLaneLabel)
    .filter((label) => counterpartLaneLabels.some((entry) => normalizeText(entry) === normalizeText(label)));

  const uniqueMatches = uniqueList([...directMatches, ...reciprocalMatches, ...laneEcho]);
  const basis = Math.max(
    preferredLabels.length,
    selfProfile.self.desiredImpressions.length,
    selfProfile.seek[context].preferredLanes.length,
    1,
  );

  return {
    score: clamp100((uniqueMatches.length / basis) * 100),
    overlaps: uniqueMatches,
  };
}

function complementFit(
  context: ContextType,
  selfProfile: MyStyleProfile,
  overlapRatio: number,
  counterpartProfile: MyStyleProfile,
) {
  const preference = selfProfile.seek[context].similarityPreference;
  const selfPrimary = selfProfile.self.primaryLanes.map(getStyleLaneLabel);
  const counterpartPrimary = counterpartProfile.self.primaryLanes.map(getStyleLaneLabel);
  const uniqueCounterpart = counterpartPrimary.filter((lane) => !selfPrimary.some((entry) => normalizeText(entry) === normalizeText(lane))).length;
  const distinctRatio = counterpartPrimary.length > 0 ? uniqueCounterpart / counterpartPrimary.length : 0;

  let raw = 0;
  let signal = "";
  if (preference === "similar") {
    raw = overlapRatio;
    signal = overlapRatio >= 0.34 ? "近い方が心地いい傾向に合う" : "";
  } else if (preference === "slightly-different") {
    raw = 1 - Math.abs(overlapRatio - 0.42) / 0.42;
    raw = clamp01((raw + distinctRatio) / 2);
    signal = raw >= 0.45 ? "近さの中に差分があり、惹かれやすいバランスです" : "";
  } else if (preference === "very-different") {
    raw = clamp01(distinctRatio * 0.72 + (1 - overlapRatio) * 0.28);
    signal = raw >= 0.45 ? "自分にない方向が魅力として立っています" : "";
  } else {
    const mixedBalance = overlapRatio > 0.15 && distinctRatio > 0.15 ? 1 - Math.abs(overlapRatio - 0.45) / 0.45 : 0.2;
    raw = clamp01((mixedBalance + distinctRatio) / 2);
    signal = raw >= 0.45 ? "共通点と差分のバランスが取れています" : "";
  }

  return {
    score: clamp100(raw * 100),
    signals: signal ? [signal] : [],
  };
}

function conflictPenalty(
  context: ContextType,
  selfProfile: MyStyleProfile,
  counterpartProfile: MyStyleProfile,
) {
  const avoided = selfProfile.seek[context].avoidedElements.map(getElementLabel);
  if (avoided.length === 0) return { score: 0, conflicts: [] as string[] };

  const directSet = new Set(uniqueList([
    ...counterpartProfile.self.likedElements.map(normalizeElementId),
    ...counterpartProfile.self.desiredImpressions.map(normalizeElementId),
  ]));
  const pool = labelPool(counterpartProfile);

  let severity = 0;
  const conflicts: string[] = [];

  for (const label of avoided) {
    const normalized = normalizeElementId(label);
    let impact = 0;
    if (directSet.has(normalized)) impact = 1;
    else if (matchesText(label, pool)) impact = 0.72;
    if (impact > 0) {
      severity += impact;
      conflicts.push(label);
    }
  }

  const score = clamp100((severity / Math.max(avoided.length, 1)) * 100);
  return {
    score,
    conflicts: uniqueList(conflicts).map((label) => `「${label}」の方向には少し差があります`),
  };
}

function evidenceStrength(selfProfile: MyStyleProfile, counterpartProfile: MyStyleProfile, context: ContextType) {
  const counterpartEvidence =
    counterpartProfile.evidence.wardrobeStrength * 0.34 +
    counterpartProfile.evidence.outfitStrength * 0.34 +
    counterpartProfile.evidence.selectionStrength * 0.18 +
    counterpartProfile.evidence.memoStrength * 0.14;
  const seek = selfProfile.seek[context];
  const selfCompleteness = clamp01(
    (
      seek.preferredLanes.length * 2 +
      seek.preferredElements.length +
      seek.avoidedElements.length +
      (seek.memo.trim() ? 2 : 0)
    ) / 12,
  );

  return clamp100((counterpartEvidence * 0.7 + selfCompleteness * 0.3) * 100);
}

function collectEvidence(counterpartProfile: MyStyleProfile) {
  return {
    wardrobeEvidence: counterpartProfile.self.wardrobeSignals.slice(0, 2),
    outfitEvidence: counterpartProfile.self.outfitSignals.slice(0, 2),
  };
}

function buildExplanation(
  context: ContextType,
  selfProfile: MyStyleProfile,
  counterpartProfile: MyStyleProfile,
  signals: MatchSignals,
): MatchExplanation {
  const seek = selfProfile.seek[context];
  const seekLabels = uniqueList([
    ...seek.preferredLanes.map(getStyleLaneLabel),
    ...seek.preferredElements.map(getElementLabel),
  ]);
  const desired = selfProfile.self.desiredImpressions;
  const counterpartLanes = counterpartProfile.self.primaryLanes.map(getStyleLaneLabel);

  const baseChips = uniqueList([
    ...signals.laneOverlap.slice(0, 2).map((label) => `${label} の好みが噛み合う`),
    ...signals.preferredElementOverlap.slice(0, 2).map((label) => `${label} の方向が近い`),
    ...signals.impressionFit.slice(0, 1).map((label) => `${label} を感じやすい`),
    ...signals.complementSignals.slice(0, 1).map((label) => `${CONTEXT_LABELS[context]} では ${label}`),
  ]);
  const fallbackChips = uniqueList([
    signals.outfitEvidence[0] ? "組み方の傾向に近さがある" : "",
    signals.wardrobeEvidence[0] ? "ワードローブに近い方向がある" : "",
    counterpartLanes[0] ? `${counterpartLanes[0]} が主軸にある` : "",
  ]);
  const chips = (baseChips.length > 0 ? baseChips : fallbackChips).slice(0, 3);

  const evidencePhrases = uniqueList([
    ...signals.outfitEvidence,
    ...signals.wardrobeEvidence,
    ...counterpartLanes.slice(0, 2).map((label) => `${label} が主軸です`),
  ]).slice(0, 2);

  const fallbackUsed = seekLabels.length === 0 || evidencePhrases.length === 0;
  let mediumSummary = "";

  if (fallbackUsed) {
    if (signals.outfitEvidence[0]) {
      mediumSummary = `まだ十分なデータはありませんが、${signals.outfitEvidence[0]}。このあたりに近い方向が見られます。${confidencePhrase(signals.confidence)}`;
    } else if (signals.wardrobeEvidence[0]) {
      mediumSummary = `まだ十分なデータはありませんが、${signals.wardrobeEvidence[0]}。このあたりに近い方向が見られます。${confidencePhrase(signals.confidence)}`;
    } else if (counterpartLanes[0]) {
      mediumSummary = `まだ十分なデータはありませんが、相手の主軸に ${counterpartLanes[0]} があり、近い方向が見られます。${confidencePhrase(signals.confidence)}`;
    } else {
      mediumSummary = "まだ十分なデータはありませんが、主軸レーンには近さが見られます。";
    }
  } else {
    const desiredPart = desired.slice(0, 2).join(" と ") || "自分らしい整い方";
    const seekPart = seekLabels.slice(0, 2).join(" と ");
    const evidencePart = evidencePhrases.join("、");
    const lanePart = counterpartLanes.slice(0, 2).join(" / ");
    mediumSummary = `あなたは ${desiredPart} を大切にしていて、${CONTEXT_LABELS[context]} では相手にも ${seekPart} を求める傾向があります。この相手は ${lanePart || "主軸レーン"} が強く、${evidencePart} にその方向が出ています。${confidencePhrase(signals.confidence)}`;
  }

  const baseEvidenceBullets = uniqueList([
    ...signals.laneOverlap.slice(0, 2).map((label) => `I SEEK(${context}) の「${label}」と相手の主軸レーンが近い`),
    ...signals.preferredElementOverlap.slice(0, 2).map((label) => `I SEEK(${context}) の「${label}」と一致`),
    ...signals.impressionFit.slice(0, 2).map((label) => `相手の desired impression に「${label}」が見られる`),
    ...signals.wardrobeEvidence.slice(0, 1).map((line) => `相手のワードローブに ${line}`),
    ...signals.outfitEvidence.slice(0, 1).map((line) => `相手のセットアップで ${line}`),
    ...signals.complementSignals.slice(0, 1).map((line) => `距離感の好みとして ${line}`),
    ...signals.avoidedElementConflicts.slice(0, 1).map((line) => `補足: ${line}`),
  ]);
  const evidenceBullets = (
    baseEvidenceBullets.length > 0
      ? baseEvidenceBullets
      : [counterpartLanes[0] ? `相手の主軸レーンに「${counterpartLanes[0]}」が見られる` : "ワードローブ由来の根拠はまだ少なく、現時点では主軸レーンを中心に見ています"]
  ).slice(0, 6);

  return {
    context,
    shortReasonChips: chips,
    mediumSummary,
    evidenceBullets,
    confidence: signals.confidence,
    conflictText: signals.avoidedElementConflicts[0] ?? null,
    fallbackUsed,
  };
}

function buildContextReason(
  context: ContextType,
  score: ContextMatchScore,
  explanation: MatchExplanation,
): ContextReason {
  return {
    context,
    score: score.total,
    summary: explanation.mediumSummary,
    recommendedTone:
      context === "cocreation"
        ? "相手の組み方や視点に触れながら、具体的なアイデアから会話に入ると自然です。"
        : context === "romance"
          ? "まずは軽い話題から入りつつ、空気感の好みが近い点を自然に拾うとよさそうです。"
          : context === "orbiter"
            ? "急がず、相手の世界観や輪郭に触れる聞き方が向いています。"
            : "自然体で会話を始めて、近さのあるポイントから広げるとよさそうです。",
    topFactors: [
      ...explanation.evidenceBullets.slice(0, 3).map((bullet) => ({
        questionTitle: "My Style",
        category: "values" as const,
        description: bullet,
        impact: "positive" as const,
      })),
      ...(explanation.conflictText
        ? [
            {
              questionTitle: "My Style",
              category: "conflict" as const,
              description: explanation.conflictText,
              impact: "caution" as const,
            },
          ]
        : []),
    ],
  };
}

function evaluateContext(
  context: ContextType,
  selfProfile: MyStyleProfile,
  counterpartProfile: MyStyleProfile,
) {
  const seek = selfProfile.seek[context];
  const laneFitResult = weightedLaneFit(
    seek.preferredLanes,
    counterpartProfile.self.primaryLanes,
    counterpartProfile.self.secondaryLanes,
  );
  const elementFitResult = weightedElementFit(seek.preferredElements, counterpartProfile);
  const impressionFitResult = impressionFit(context, selfProfile, counterpartProfile);
  const overlapRatio = (
    laneFitResult.score * 0.5 +
    elementFitResult.score * 0.35 +
    impressionFitResult.score * 0.15
  ) / 100;
  const complement = complementFit(context, selfProfile, overlapRatio, counterpartProfile);
  const conflicts = conflictPenalty(context, selfProfile, counterpartProfile);
  const evidence = collectEvidence(counterpartProfile);
  const evidenceScore = evidenceStrength(selfProfile, counterpartProfile, context);
  const confidence = clamp01((evidenceScore / 100) * 0.7 + clamp01(
    (
      seek.preferredLanes.length * 2 +
      seek.preferredElements.length +
      seek.avoidedElements.length +
      (seek.memo.trim() ? 1 : 0)
    ) / 10,
  ) * 0.3);

  const weights = CONTEXT_WEIGHTS[context];
  const baseTotal =
    laneFitResult.score * weights.laneFit +
    elementFitResult.score * weights.elementFit +
    impressionFitResult.score * weights.impressionFit +
    complement.score * weights.complementFit +
    evidenceScore * weights.evidenceStrength -
    conflicts.score * weights.conflictPenalty;
  const total = clamp100(baseTotal * (0.45 + confidence * 0.55));

  const score: ContextMatchScore = {
    context,
    total,
    breakdown: {
      laneFit: laneFitResult.score,
      elementFit: elementFitResult.score,
      impressionFit: impressionFitResult.score,
      complementFit: complement.score,
      conflictPenalty: conflicts.score,
      evidenceStrength: evidenceScore,
    },
    bandLabel: bandLabel(total),
  };

  const signals: MatchSignals = {
    laneOverlap: laneFitResult.overlaps,
    preferredElementOverlap: elementFitResult.overlaps,
    avoidedElementConflicts: conflicts.conflicts,
    impressionFit: impressionFitResult.overlaps,
    wardrobeEvidence: evidence.wardrobeEvidence,
    outfitEvidence: evidence.outfitEvidence,
    complementSignals: complement.signals,
    confidence,
  };

  const explanation = buildExplanation(context, selfProfile, counterpartProfile, signals);
  return {
    score,
    explanation,
    reason: buildContextReason(context, score, explanation),
  };
}

export function buildMyStyleContextLens(params: {
  selfProfile: MyStyleProfile | null | undefined;
  counterpartProfile: MyStyleProfile | null | undefined;
}): ContextLensDetail | null {
  const { selfProfile, counterpartProfile } = params;
  if (!selfProfile || !counterpartProfile) return null;

  const evaluations = CONTEXT_KEYS.map((context) => evaluateContext(context, selfProfile, counterpartProfile));
  if (evaluations.length === 0) return null;

  const best = [...evaluations].sort((a, b) => b.score.total - a.score.total)[0];
  const contextScores = Object.fromEntries(
    evaluations.map((entry) => [entry.score.context, entry.score.total]),
  ) as ContextLensDetail["contextScores"];
  const scoreBreakdown = Object.fromEntries(
    evaluations.map((entry) => [entry.score.context, entry.score]),
  ) as Partial<Record<ContextType, ContextMatchScore>>;
  const explanationsByContext = Object.fromEntries(
    evaluations.map((entry) => [entry.score.context, entry.explanation]),
  ) as Partial<Record<ContextType, MatchExplanation>>;

  return {
    contextScores,
    bestContext: best.score.context,
    avatarJudgment: toAvatarJudgment(best.score.total),
    alignmentPoints: best.explanation.shortReasonChips.slice(0, 4),
    cautionPoints: best.explanation.conflictText ? [best.explanation.conflictText] : best.explanation.fallbackUsed ? ["ワードローブ由来の根拠がまだ少なく、現時点では主軸レーンと選択履歴を中心に見ています"] : [],
    avatarJudgmentText: best.explanation.mediumSummary,
    contextReasons: evaluations.map((entry) => entry.reason),
    recommendedTone: evaluations.find((entry) => entry.score.context === best.score.context)?.reason.recommendedTone,
    matchSummary: best.explanation.mediumSummary,
    evidenceBullets: best.explanation.evidenceBullets,
    scoreBreakdown,
    explanationsByContext,
  };
}
