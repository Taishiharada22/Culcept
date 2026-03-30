import type {
  RendezvousProfile,
  RendezvousPreferences,
  MatchingVector,
  RendezvousCategory,
  EvaluationResult,
  EvaluatePairResult,
  DealbreakerProfile,
  CautionCode,
} from "./types";
import { evaluateDirection, type EnrichedEvaluationInput } from "./evaluateDirection";
import { isMutual, romanticGuard, friendshipGuard, cocreationGuard, communityGuard, partnerGuard } from "./thresholds";
import { buildOverallScore } from "./buildLabel";
import { buildLabel } from "./buildLabel";
import { reasonTextMap, cautionTextMap } from "./buildReasons";
import { checkDealbreakers } from "./dealbreakers";
import { checkPhilosophyAlignment } from "./philosophyGuard";
import {
  computePartnerScore,
  partnerReasonTextMap,
  partnerCautionTextMap,
  type PartnerEvaluationInput,
  type PartnerScoringResult,
} from "./partnerScoring";

function getSharedCategories(
  catA: RendezvousCategory[],
  catB: RendezvousCategory[],
): RendezvousCategory[] {
  return catA.filter((c) => catB.includes(c));
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function passesGuard(
  category: RendezvousCategory,
  resultAB: EvaluationResult,
  resultBA: EvaluationResult,
  vectorA: MatchingVector,
  vectorB: MatchingVector,
  partnerScoringResult?: PartnerScoringResult,
): boolean {
  switch (category) {
    case "romantic":
      return romanticGuard(resultAB) && romanticGuard(resultBA);
    case "friendship":
      return (
        friendshipGuard({ selfVector: vectorA, otherVector: vectorB }) &&
        friendshipGuard({ selfVector: vectorB, otherVector: vectorA })
      );
    case "cocreation":
      return cocreationGuard(resultAB) && cocreationGuard(resultBA);
    case "community":
      return (
        communityGuard({ selfVector: vectorA, otherVector: vectorB }) &&
        communityGuard({ selfVector: vectorB, otherVector: vectorA })
      );
    case "partner":
      // 8次元 Guard: Layer 1 (5次元) + Layer 1.5 (2次元) + Layer 2 (1次元)
      return (
        partnerGuard(resultAB, partnerScoringResult?.processVector, partnerScoringResult?.lifePlanFit) &&
        partnerGuard(resultBA, partnerScoringResult?.processVector, partnerScoringResult?.lifePlanFit)
      );
  }
}

function pickBestCategory(params: {
  sharedCategories: RendezvousCategory[];
  evalByCategory: Record<
    RendezvousCategory,
    { scoreAB: number; scoreBA: number }
  >;
}): RendezvousCategory | null {
  const candidates = params.sharedCategories
    .map((category) => {
      const scores = params.evalByCategory[category];
      const mutual = buildOverallScore(scores.scoreAB, scores.scoreBA);
      return { category, mutual };
    })
    .filter((x) => x.mutual > 0);

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.mutual - a.mutual);
  return candidates[0].category;
}

/**
 * ペア全体の評価
 * 共有カテゴリごとにA→B, B→Aを評価し、相互成立するか判定
 */
export function evaluatePair(params: {
  profileA: RendezvousProfile;
  profileB: RendezvousProfile;
  preferencesA: RendezvousPreferences;
  preferencesB: RendezvousPreferences;
  vectorA: MatchingVector;
  vectorB: MatchingVector;
  /** プロフィール詳細（dealbreaker判定用、任意） */
  dealbreakerA?: DealbreakerProfile;
  dealbreakerB?: DealbreakerProfile;
  /** 学習済みウェイト（カテゴリ別、A用） */
  personalizedWeightsA?: Partial<Record<RendezvousCategory, import("./types").CategoryWeights>>;
  /** 学習済みウェイト（カテゴリ別、B用） */
  personalizedWeightsB?: Partial<Record<RendezvousCategory, import("./types").CategoryWeights>>;
  /** A→B方向のenrichedデータ（phenotype/Stargazer/Origin） */
  enrichedAB?: Partial<EnrichedEvaluationInput>;
  /** B→A方向のenrichedデータ（phenotype/Stargazer/Origin） */
  enrichedBA?: Partial<EnrichedEvaluationInput>;
  /** Partner 枠専用: 3層統合スコアリング入力 */
  partnerInput?: PartnerEvaluationInput;
}): EvaluatePairResult & { partnerResult?: PartnerScoringResult } {
  const emptyResult: EvaluatePairResult = {
    mutual: false,
    bestCategory: null,
    scoreABByCategory: {},
    scoreBAByCategory: {},
    overallScore: null,
    reasonCodes: [],
    cautionCodes: [],
    label: null,
  };

  const sharedCategories = getSharedCategories(
    params.profileA.enabled_categories,
    params.profileB.enabled_categories,
  );

  if (!sharedCategories.length) return emptyResult;

  // Dealbreaker チェック: 絶対条件の不一致をスコア計算前にブロック
  const categoriesAfterDealbreakers = sharedCategories.filter((category) => {
    const dbResult = checkDealbreakers({
      category,
      profileA: params.dealbreakerA,
      profileB: params.dealbreakerB,
    });
    return dbResult.pass;
  });

  if (!categoriesAfterDealbreakers.length) return emptyResult;

  const scoreABByCategory: Partial<
    Record<RendezvousCategory, EvaluationResult>
  > = {};
  const scoreBAByCategory: Partial<
    Record<RendezvousCategory, EvaluationResult>
  > = {};

  for (const category of categoriesAfterDealbreakers) {
    scoreABByCategory[category] = evaluateDirection({
      selfPreferences: params.preferencesA,
      selfVector: params.vectorA,
      otherPreferences: params.preferencesB,
      otherVector: params.vectorB,
      category,
      selfProfile: params.dealbreakerA,
      otherProfile: params.dealbreakerB,
      personalizedWeights: params.personalizedWeightsA?.[category],
      ...params.enrichedAB,
    });

    scoreBAByCategory[category] = evaluateDirection({
      selfPreferences: params.preferencesB,
      selfVector: params.vectorB,
      otherPreferences: params.preferencesA,
      otherVector: params.vectorA,
      category,
      selfProfile: params.dealbreakerB,
      otherProfile: params.dealbreakerA,
      personalizedWeights: params.personalizedWeightsB?.[category],
      ...params.enrichedBA,
    });
  }

  // ── Partner 3層統合: Layer 1 の total を Layer 1.5 + Layer 2 で補強 ──
  let partnerResult: PartnerScoringResult | undefined;
  if (params.partnerInput && scoreABByCategory.partner && scoreBAByCategory.partner) {
    // A→B と B→A の Layer 1 スコアの平均を Layer 1 入力とする
    const layer1Avg = (scoreABByCategory.partner.total + scoreBAByCategory.partner.total) / 2;
    partnerResult = computePartnerScore(layer1Avg, params.partnerInput);

    // Partner の Guard が失敗した場合、partner カテゴリを除外
    if (!partnerResult.guardResult.pass) {
      const idx = categoriesAfterDealbreakers.indexOf("partner");
      if (idx >= 0) categoriesAfterDealbreakers.splice(idx, 1);
    } else {
      // Partner の total を3層統合スコアで上書き
      // A→B, B→A それぞれの total を3層スコア方向にブレンド
      // 元の方向性差は維持（A→B が B→A より高ければその差を保持）
      const origAB = scoreABByCategory.partner.total;
      const origBA = scoreBAByCategory.partner.total;
      const origAvg = (origAB + origBA) / 2;
      const ratio = origAvg > 0 ? partnerResult.total / origAvg : 1;
      scoreABByCategory.partner = {
        ...scoreABByCategory.partner,
        total: Math.max(0, Math.min(1, origAB * ratio)),
        dimensions: {
          ...scoreABByCategory.partner.dimensions,
          partnerProcessFit: partnerResult.layer15Score,
          partnerLifePlanFit: partnerResult.layer2Score,
        },
      };
      scoreBAByCategory.partner = {
        ...scoreBAByCategory.partner,
        total: Math.max(0, Math.min(1, origBA * ratio)),
        dimensions: {
          ...scoreBAByCategory.partner.dimensions,
          partnerProcessFit: partnerResult.layer15Score,
          partnerLifePlanFit: partnerResult.layer2Score,
        },
      };
    }
  }

  // 相互成立 + guard を通過するカテゴリだけ
  const validCategories = categoriesAfterDealbreakers.filter((category) => {
    const ab = scoreABByCategory[category]!;
    const ba = scoreBAByCategory[category]!;
    if (!isMutual(ab.total, ba.total, category)) return false;
    return passesGuard(
      category,
      ab,
      ba,
      params.vectorA,
      params.vectorB,
      partnerResult,
    );
  });

  if (!validCategories.length) {
    return { ...emptyResult, scoreABByCategory, scoreBAByCategory };
  }

  const bestCategory = pickBestCategory({
    sharedCategories: validCategories,
    evalByCategory: Object.fromEntries(
      validCategories.map((category) => [
        category,
        {
          scoreAB: scoreABByCategory[category]!.total,
          scoreBA: scoreBAByCategory[category]!.total,
        },
      ]),
    ) as Record<RendezvousCategory, { scoreAB: number; scoreBA: number }>,
  });

  if (!bestCategory) {
    return { ...emptyResult, scoreABByCategory, scoreBAByCategory };
  }

  const ab = scoreABByCategory[bestCategory]!;
  const ba = scoreBAByCategory[bestCategory]!;
  const overallScore = buildOverallScore(ab.total, ba.total);

  const mergedReasonCodes = uniq([
    ...ab.reasonCodes,
    ...ba.reasonCodes,
  ]).slice(0, 3);
  const mergedCautionCodes = uniq([
    ...ab.cautionCodes,
    ...ba.cautionCodes,
  ]).slice(0, 2);

  const rawLabel = buildLabel({
    category: bestCategory,
    overallScore,
    reasonCodes: mergedReasonCodes,
  });

  // ── 哲学ガード: ラベルの依存・不安・商品化パターンを検出 ──
  let finalLabel = rawLabel;
  if (rawLabel) {
    const philosophyCheck = checkPhilosophyAlignment(rawLabel, "match_reveal");
    if (!philosophyCheck.isAligned && philosophyCheck.violations.length > 0) {
      // 哲学違反がある場合、cautionCodesに追記
      mergedCautionCodes.push("philosophy_misaligned" as CautionCode);
      // 最初のviolationのsuggestionがあればラベルを修正
      const firstSuggestion = philosophyCheck.violations[0]?.suggestion;
      if (firstSuggestion) {
        finalLabel = rawLabel.replace(
          philosophyCheck.violations[0].term,
          firstSuggestion,
        );
      }
    }
  }

  const finalCautionCodes = uniq(mergedCautionCodes).slice(0, 4);

  return {
    mutual: true,
    bestCategory,
    scoreABByCategory,
    scoreBAByCategory,
    overallScore,
    reasonCodes: mergedReasonCodes,
    cautionCodes: finalCautionCodes,
    label: finalLabel,
    ...(partnerResult ? { partnerResult } : {}),
  };
}

/**
 * ReasonCode → 日本語テキスト変換（Partner 固有コードも対応）
 */
export function reasonCodesToTexts(codes: string[]): string[] {
  return codes
    .map((c) =>
      reasonTextMap[c as keyof typeof reasonTextMap] ??
      partnerReasonTextMap[c as keyof typeof partnerReasonTextMap],
    )
    .filter(Boolean);
}

/**
 * CautionCode → 日本語テキスト変換（Partner 固有コードも対応）
 */
export function cautionCodesToTexts(codes: string[]): string[] {
  return codes
    .map((c) =>
      cautionTextMap[c as keyof typeof cautionTextMap] ??
      partnerCautionTextMap[c as keyof typeof partnerCautionTextMap],
    )
    .filter(Boolean);
}

// Re-export Partner types for external consumers
export type { PartnerEvaluationInput, PartnerScoringResult } from "./partnerScoring";
