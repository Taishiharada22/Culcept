// lib/stargazer/profileContentGenerator.ts
// MBTI的コンテンツ生成エンジン
// 既存データから MBTI のセクション構造を生成する純粋関数群

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import type { TypeDefLike } from "./dailyInsightEngine";
import type { DerivedTraitCard, ContextDifference } from "./traitCards";
import {
  generateCoreStarEssence,
  getTraitCardNarrative,
  classifyAxes,
} from "./dailyInsightEngine";

// ── Output Types ──

export interface SummaryAxis {
  axisId: TraitAxisKey;
  labelLeft: string;
  labelRight: string;
  score: number; // -1 to 1
  percent: number; // 0-100, leans toward the dominant side
  dominantSide: "left" | "right" | "center";
  dominantLabel: string;
  description: string;
}

export interface StrengthItem {
  id: string;
  icon: string;
  headline: string;
  description: string;
  manifestation: string;
  accentColor: string;
}

export interface WeaknessItem {
  id: string;
  icon: string;
  headline: string;
  description: string;
  accentColor: string;
}

export interface RelationshipPattern {
  context: "romance" | "friends" | "work";
  contextLabel: string;
  icon: string;
  style: string;
  strengths: string[];
  challenges: string[];
  advice: string;
  accentColor: string;
}

export interface WorkRolePattern {
  roleName: string;
  roleDescription: string;
  strengths: string[];
  stressors: string[];
  idealEnvironment: string;
  teamRole?: string;
  workStyle?: string;
}

export interface GrowthDirection {
  currentPhase: string;
  growthEdge: string;
  actionSuggestions: string[];
  energySources?: string[];
  energyDrains?: string[];
  recoveryPattern?: string;
}

export interface InfluentialTrait {
  id: string;
  icon: string;
  label: string;
  description: string;
}

export interface ProfileContent {
  heroSummary: string;
  summaryAxes: SummaryAxis[];
  strengths: StrengthItem[];
  weaknesses: WeaknessItem[];
  relationships: RelationshipPattern[];
  workRole: WorkRolePattern;
  growthDirection: GrowthDirection;
  influentialTraits: InfluentialTrait[];
}

// ── Strength/Weakness Icons ──
const STRENGTH_ICONS: Record<string, string> = {
  core: "🔷",
  relational: "🤝",
  emotional: "💫",
  motion: "⚡",
  safety: "🛡️",
};

const WEAKNESS_ICONS: Record<string, string> = {
  core: "⚠️",
  relational: "🌊",
  emotional: "🌑",
  motion: "💨",
  safety: "🔓",
};

// ── Main Generator ──

export function generateProfileContent(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  traitCards: DerivedTraitCard[],
  typeDef: TypeDefLike,
  contextDiffs: ContextDifference[],
  contextScores: Record<string, Partial<Record<TraitAxisKey, number>>>,
  totalObservations: number
): ProfileContent {
  return {
    heroSummary: generateHeroSummary(typeDef, axisScores, totalObservations),
    summaryAxes: generateSummaryAxes(axisScores),
    strengths: generateStrengths(traitCards),
    weaknesses: generateWeaknesses(traitCards, axisScores),
    relationships: generateRelationships(contextScores, contextDiffs, axisScores),
    workRole: generateWorkRole(axisScores),
    growthDirection: generateGrowthDirection(axisScores, traitCards, totalObservations),
    influentialTraits: generateInfluentialTraits(traitCards),
  };
}

// ── Hero Summary ──

function generateHeroSummary(
  typeDef: TypeDefLike,
  axisScores: Partial<Record<TraitAxisKey, number>>,
  totalObservations: number
): string {
  const essence = generateCoreStarEssence(typeDef);

  // Add context based on dominant axes
  const intro = axisScores.introvert_vs_extrovert ?? 0;
  const analytical = axisScores.analytical_vs_intuitive ?? 0;
  const social = axisScores.individual_vs_social ?? 0;

  let supplement = "";
  if (intro < -0.3 && analytical < -0.2) {
    supplement = "静かな場所で深く考えることを好み、論理と直感のバランスを大切にする人。";
  } else if (intro > 0.3 && social > 0.2) {
    supplement = "人と関わることでエネルギーを得て、周囲に活力をもたらす人。";
  } else if (analytical < -0.3) {
    supplement = "物事の構造を分析し、本質を見抜く力を持った人。";
  } else if (analytical > 0.3) {
    supplement = "直感を信じ、感覚的な判断で道を切り拓く人。";
  } else {
    supplement = "状況に応じて柔軟にスタイルを切り替える、バランス感覚に優れた人。";
  }

  if (totalObservations < 30) {
    return `${essence} ${supplement}（観測はまだ序盤です — 回答を重ねるほど、より精密な理解に近づきます）`;
  }
  return `${essence} ${supplement}`;
}

// ── Summary Axes ──

function generateSummaryAxes(
  axisScores: Partial<Record<TraitAxisKey, number>>
): SummaryAxis[] {
  // Core visible axes (not safety/deep relational)
  const visibleCategories = new Set(["core", "relational", "emotional", "motion", "aesthetic"]);

  const scored = TRAIT_AXES
    .filter((axis) => visibleCategories.has(axis.category))
    .map((axis) => {
      const score = axisScores[axis.id] ?? 0;
      return { axis, score, absScore: Math.abs(score) };
    })
    .sort((a, b) => b.absScore - a.absScore);

  // Take top 4-6 most prominent axes
  const topAxes = scored.slice(0, 6).filter((s) => s.absScore > 0.1);

  return topAxes.map(({ axis, score }) => {
    const percent = Math.round(50 + score * 50);
    const dominantSide: "left" | "right" | "center" =
      score < -0.15 ? "left" : score > 0.15 ? "right" : "center";
    const dominantLabel =
      dominantSide === "left"
        ? axis.labelLeft
        : dominantSide === "right"
          ? axis.labelRight
          : "バランス型";

    return {
      axisId: axis.id,
      labelLeft: axis.labelLeft,
      labelRight: axis.labelRight,
      score,
      percent,
      dominantSide,
      dominantLabel,
      description: generateAxisDescription(axis.id, score),
    };
  });
}

function generateAxisDescription(axisId: TraitAxisKey, score: number): string {
  const abs = Math.abs(score);
  const intensity = abs > 0.5 ? "明確に" : abs > 0.3 ? "やや" : "わずかに";

  const descriptions: Partial<Record<TraitAxisKey, [string, string]>> = {
    introvert_vs_extrovert: [
      `${intensity}内向的 — 静かな環境でエネルギーを充電するタイプ`,
      `${intensity}外向的 — 人と関わることでエネルギーを得るタイプ`,
    ],
    individual_vs_social: [
      `${intensity}個人主義的 — 独立した判断と行動を好む`,
      `${intensity}社会的 — チームや集団の中で力を発揮する`,
    ],
    cautious_vs_bold: [
      `${intensity}慎重派 — リスクを見極めてから動くタイプ`,
      `${intensity}大胆派 — 直感を信じて飛び込むタイプ`,
    ],
    analytical_vs_intuitive: [
      `${intensity}分析的 — データと論理で判断するタイプ`,
      `${intensity}直感的 — 感覚とひらめきで判断するタイプ`,
    ],
    plan_vs_spontaneous: [
      `${intensity}計画型 — 事前に準備して動くタイプ`,
      `${intensity}即興型 — その場の流れに柔軟に対応するタイプ`,
    ],
    independence_vs_harmony: [
      `${intensity}独立志向 — 自分の意見を貫くことを大切にする`,
      `${intensity}調和志向 — 周囲との関係性を大切にする`,
    ],
    direct_vs_diplomatic: [
      `${intensity}直接的 — 率直にものを言うタイプ`,
      `${intensity}外交的 — 場の空気を読んで伝えるタイプ`,
    ],
    stress_isolation_vs_social: [
      `${intensity}一人で回復 — ストレス時は一人の時間が必要`,
      `${intensity}人と回復 — ストレス時は誰かと話したくなる`,
    ],
    quality_vs_quantity: [
      `${intensity}質重視 — 少なくても深い体験を好む`,
      `${intensity}量重視 — 幅広い体験を楽しむタイプ`,
    ],
    perfectionist_vs_pragmatic: [
      `${intensity}完璧主義 — 細部まで妥協しないタイプ`,
      `${intensity}実用主義 — 十分良ければ前に進むタイプ`,
    ],
  };

  const pair = descriptions[axisId];
  if (!pair) return "";
  return score < 0 ? pair[0] : pair[1];
}

// ── Strengths ──

function generateStrengths(traitCards: DerivedTraitCard[]): StrengthItem[] {
  const strongCards = traitCards
    .filter((c) => c.strength > 0.6)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 6);

  return strongCards.map((card) => {
    const narrative = getTraitCardNarrative(card.id);
    const icon = STRENGTH_ICONS[card.category] || "✨";

    return {
      id: card.id,
      icon,
      headline: card.label,
      description: narrative?.story
        ? truncate(narrative.story, 80)
        : card.description,
      manifestation: narrative?.manifestations[0] || "",
      accentColor: "rgba(74,222,128,0.5)",
    };
  });
}

// ── Weaknesses ──

function generateWeaknesses(
  traitCards: DerivedTraitCard[],
  axisScores: Partial<Record<TraitAxisKey, number>>
): WeaknessItem[] {
  const items: WeaknessItem[] = [];

  // From trait card shadows
  const relevantCards = traitCards
    .filter((c) => c.strength > 0.5)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 4);

  for (const card of relevantCards) {
    const narrative = getTraitCardNarrative(card.id);
    if (narrative?.shadow) {
      items.push({
        id: `shadow-${card.id}`,
        icon: WEAKNESS_ICONS[card.category] || "⚡",
        headline: `${card.label}の影`,
        description: truncate(narrative.shadow, 80),
        accentColor: "rgba(251,191,36,0.5)",
      });
    }
  }

  // From extreme axes
  const extremeAxes = TRAIT_AXES
    .filter((axis) => {
      const s = axisScores[axis.id] ?? 0;
      return Math.abs(s) > 0.5 && axis.category !== "safety" && axis.category !== "relational_deep";
    })
    .slice(0, 2);

  for (const axis of extremeAxes) {
    const score = axisScores[axis.id] ?? 0;
    const dominant = score < 0 ? axis.labelLeft : axis.labelRight;
    const opposite = score < 0 ? axis.labelRight : axis.labelLeft;

    // Only add if not already covered by card shadows
    if (!items.find((i) => i.headline.includes(dominant))) {
      items.push({
        id: `extreme-${axis.id}`,
        icon: "⚖️",
        headline: `${dominant}への偏り`,
        description: `「${dominant}」の傾向が強いため、「${opposite}」的な状況で緊張しやすい可能性があります。`,
        accentColor: "rgba(251,191,36,0.5)",
      });
    }
  }

  return items.slice(0, 6);
}

// ── Relationships ──

function generateRelationships(
  contextScores: Record<string, Partial<Record<TraitAxisKey, number>>>,
  contextDiffs: ContextDifference[],
  baseScores: Partial<Record<TraitAxisKey, number>>
): RelationshipPattern[] {
  const patterns: RelationshipPattern[] = [];

  // Romance
  const romanceScores = contextScores.romance || baseScores;
  const romanceReassurance = romanceScores.reassurance_need ?? baseScores.reassurance_need ?? 0;
  const romanceIntimacy = romanceScores.intimacy_pace ?? baseScores.intimacy_pace ?? 0;
  const romanceDirect = romanceScores.direct_vs_diplomatic ?? baseScores.direct_vs_diplomatic ?? 0;

  patterns.push({
    context: "romance",
    contextLabel: "恋愛",
    icon: "💕",
    style: generateRelStyle("romance", romanceReassurance, romanceIntimacy, romanceDirect),
    strengths: generateRelStrengths("romance", romanceScores, baseScores),
    challenges: generateRelChallenges("romance", romanceScores, baseScores),
    advice: generateRelAdvice("romance", romanceScores, baseScores),
    accentColor: "rgba(244,114,182,0.5)",
  });

  // Friends
  const friendScores = contextScores.friends || baseScores;
  const friendSocial = friendScores.individual_vs_social ?? baseScores.individual_vs_social ?? 0;
  const friendHarmony = friendScores.independence_vs_harmony ?? baseScores.independence_vs_harmony ?? 0;
  const friendInit = friendScores.social_initiative ?? baseScores.social_initiative ?? 0;

  patterns.push({
    context: "friends",
    contextLabel: "友達",
    icon: "🌿",
    style: generateRelStyle("friends", friendSocial, friendHarmony, friendInit),
    strengths: generateRelStrengths("friends", friendScores, baseScores),
    challenges: generateRelChallenges("friends", friendScores, baseScores),
    advice: generateRelAdvice("friends", friendScores, baseScores),
    accentColor: "rgba(74,222,128,0.5)",
  });

  // Work
  const workScores = contextScores.work || baseScores;
  const workAnalytical = workScores.analytical_vs_intuitive ?? baseScores.analytical_vs_intuitive ?? 0;
  const workSocial = workScores.individual_vs_social ?? baseScores.individual_vs_social ?? 0;
  const workPlan = workScores.plan_vs_spontaneous ?? baseScores.plan_vs_spontaneous ?? 0;

  patterns.push({
    context: "work",
    contextLabel: "仕事",
    icon: "💼",
    style: generateRelStyle("work", workAnalytical, workSocial, workPlan),
    strengths: generateRelStrengths("work", workScores, baseScores),
    challenges: generateRelChallenges("work", workScores, baseScores),
    advice: generateRelAdvice("work", workScores, baseScores),
    accentColor: "rgba(96,165,250,0.5)",
  });

  return patterns;
}

function generateRelStyle(
  context: string,
  a: number,
  b: number,
  c: number
): string {
  if (context === "romance") {
    if (a > 0.2) return "確認を重視する安定型";
    if (b < -0.3) return "ゆっくり深めていく慎重型";
    if (c > 0.2) return "率直に気持ちを伝える直球型";
    return "自然体で関係を育てるタイプ";
  }
  if (context === "friends") {
    if (a < -0.3) return "少数精鋭の深い友情を好むタイプ";
    if (b < -0.3) return "自分のペースを大切にする独立型";
    if (a > 0.2) return "幅広い人脈を持つ社交型";
    return "状況に応じて柔軟に関わるタイプ";
  }
  // work
  if (a < -0.3) return "分析力で貢献する専門家タイプ";
  if (b < -0.3) return "独立して深く取り組む職人タイプ";
  if (c < -0.3) return "計画を立てて着実に進める推進型";
  return "柔軟に状況に対応するバランス型";
}

function generateRelStrengths(
  context: string,
  scores: Partial<Record<TraitAxisKey, number>>,
  base: Partial<Record<TraitAxisKey, number>>
): string[] {
  const strengths: string[] = [];

  if (context === "romance") {
    if ((scores.emotional_regulation ?? base.emotional_regulation ?? 0) > 0.2)
      strengths.push("感情が安定しており、関係に安心感をもたらす");
    if ((scores.boundary_awareness ?? base.boundary_awareness ?? 0) > 0.2)
      strengths.push("相手の境界線を自然に尊重できる");
    if (Math.abs(scores.direct_vs_diplomatic ?? base.direct_vs_diplomatic ?? 0) > 0.2)
      strengths.push("コミュニケーションに一貫性がある");
    if (strengths.length === 0) strengths.push("自然体で相手と向き合える");
  } else if (context === "friends") {
    if ((scores.quality_vs_quantity ?? base.quality_vs_quantity ?? 0) < -0.2)
      strengths.push("深い関係を大切にし、信頼される存在");
    if ((scores.independence_vs_harmony ?? base.independence_vs_harmony ?? 0) > 0.2)
      strengths.push("相手の意見を尊重し、調和を保つ力がある");
    if (strengths.length === 0) strengths.push("相手のペースに合わせられる柔軟さがある");
  } else {
    if ((scores.analytical_vs_intuitive ?? base.analytical_vs_intuitive ?? 0) < -0.2)
      strengths.push("論理的に問題を分析し、解決策を提示できる");
    if ((scores.perfectionist_vs_pragmatic ?? base.perfectionist_vs_pragmatic ?? 0) < -0.2)
      strengths.push("質の高いアウトプットへのこだわりがある");
    if ((scores.plan_vs_spontaneous ?? base.plan_vs_spontaneous ?? 0) < -0.2)
      strengths.push("計画的に物事を進める推進力がある");
    if (strengths.length === 0) strengths.push("柔軟に状況に適応できる");
  }

  return strengths.slice(0, 3);
}

function generateRelChallenges(
  context: string,
  scores: Partial<Record<TraitAxisKey, number>>,
  base: Partial<Record<TraitAxisKey, number>>
): string[] {
  const challenges: string[] = [];

  if (context === "romance") {
    if ((scores.reassurance_need ?? base.reassurance_need ?? 0) > 0.3)
      challenges.push("確認を求めすぎて、相手に負担をかける可能性");
    if ((scores.introvert_vs_extrovert ?? base.introvert_vs_extrovert ?? 0) < -0.3)
      challenges.push("一人の時間が必要で、パートナーとのバランスが課題");
    if (challenges.length === 0) challenges.push("自分の感情を言語化するのに時間がかかることがある");
  } else if (context === "friends") {
    if ((scores.social_initiative ?? base.social_initiative ?? 0) < -0.3)
      challenges.push("自分から声をかけるのが苦手で、関係が疎遠になりやすい");
    if ((scores.individual_vs_social ?? base.individual_vs_social ?? 0) < -0.3)
      challenges.push("グループ行動より個人の時間を優先しがち");
    if (challenges.length === 0) challenges.push("新しい友人関係を築くのに時間がかかる");
  } else {
    if ((scores.direct_vs_diplomatic ?? base.direct_vs_diplomatic ?? 0) < -0.2)
      challenges.push("率直すぎる表現で、相手を傷つけることがある");
    if ((scores.individual_vs_social ?? base.individual_vs_social ?? 0) < -0.3)
      challenges.push("チームワークよりも個人作業を好み、協調性に課題");
    if (challenges.length === 0) challenges.push("過度な完璧主義で、締め切りに追われることがある");
  }

  return challenges.slice(0, 2);
}

function generateRelAdvice(
  context: string,
  scores: Partial<Record<TraitAxisKey, number>>,
  base: Partial<Record<TraitAxisKey, number>>
): string {
  if (context === "romance") {
    const reassurance = scores.reassurance_need ?? base.reassurance_need ?? 0;
    if (reassurance > 0.3) return "気持ちを確認したくなったら、まず自分の感情を観察してみて。";
    const intimacy = scores.intimacy_pace ?? base.intimacy_pace ?? 0;
    if (intimacy < -0.3) return "自分のペースを大切にしつつ、相手にもそれを伝えることが鍵。";
    return "自然体を保ちながら、小さな感謝を言葉にしてみて。";
  }
  if (context === "friends") {
    const initiative = scores.social_initiative ?? base.social_initiative ?? 0;
    if (initiative < -0.3) return "月に一度、自分から連絡してみると、関係が長続きする。";
    return "量より質を大切にしつつ、新しい出会いにも開いていこう。";
  }
  const analytical = scores.analytical_vs_intuitive ?? base.analytical_vs_intuitive ?? 0;
  if (analytical < -0.3) return "分析だけでなく、時には直感を信じた提案も試してみて。";
  return "自分の強みを活かせるポジションを見つけることが、成長の近道。";
}

// ── Work & Role ──

function generateWorkRole(
  axisScores: Partial<Record<TraitAxisKey, number>>
): WorkRolePattern {
  const analytical = axisScores.analytical_vs_intuitive ?? 0;
  const plan = axisScores.plan_vs_spontaneous ?? 0;
  const bold = axisScores.cautious_vs_bold ?? 0;
  const social = axisScores.individual_vs_social ?? 0;

  // 4軸の組合せから8パターンの役割テンプレートを選択
  const isAnalytical = analytical < 0;
  const isPlanner = plan < 0;
  const isBold = bold > 0;
  const isSocial = social > 0;

  if (isAnalytical && isPlanner && !isSocial) {
    return {
      roleName: "戦略的アナリスト",
      roleDescription: "データと論理に基づいて深い分析を行い、計画的に物事を進める。チームの知的基盤を支える存在。",
      strengths: ["複雑な問題を構造化して解決できる", "計画的で着実に成果を出す", "客観的な判断力"],
      stressors: ["急な方向転換", "感情的な議論", "曖昧な指示"],
      idealEnvironment: "静かで集中できる環境。明確な目標と十分な時間が与えられるチーム。",
      teamRole: "チームの「分析官」。複雑な状況を整理し、データに基づいた判断材料を提供する。会議では一歩引いて全体を俯瞰し、見落とされがちなリスクや論点を指摘する存在。",
      workStyle: "一人で深く考える時間を確保した上で、定期的にチームと共有するリズムが合う。マルチタスクよりもシングルタスクで力を発揮する。",
    };
  }
  if (isAnalytical && !isPlanner && isSocial) {
    return {
      roleName: "適応型ストラテジスト",
      roleDescription: "分析力を持ちながらも、状況に柔軟に対応できる。チーム内の知恵袋的存在。",
      strengths: ["分析力と柔軟性の両立", "チームの課題を素早く把握", "多角的な視点"],
      stressors: ["硬直的なルール", "長期間の孤立作業", "政治的な駆け引き"],
      idealEnvironment: "多様な人材がいるフラットなチーム。自由に意見を言え、実験が許される場。",
      teamRole: "チームの「参謀」。アイデアの実現可能性を検証し、メンバー間の認識のずれを橋渡しする。議論が停滞した時に新しい切り口を提示できる人。",
      workStyle: "短いスプリントで素早くアウトプットし、フィードバックを受けてすぐ修正するアジャイル型が向いている。",
    };
  }
  if (!isAnalytical && isBold && isSocial) {
    return {
      roleName: "インスピレーション・リーダー",
      roleDescription: "直感とエネルギーで周囲を巻き込み、新しい方向へ導く。チームのモチベーション源。",
      strengths: ["人を動かす力", "新しいアイデアの発信", "困難な状況での決断力"],
      stressors: ["細かい事務作業", "長期的な管理業務", "進捗の遅いプロジェクト"],
      idealEnvironment: "変化が早く、創造性が求められる環境。裁量権のあるポジション。",
      teamRole: "チームの「起爆剤」。停滞した空気を一変させ、メンバーのやる気に火をつける。ビジョンを語り、全員が同じ方向を向くきっかけを作る。",
      workStyle: "大きな絵を描いて、詳細は信頼できるメンバーに委ねるスタイル。自分で手を動かすよりも方向性を示す役割で力を発揮する。",
    };
  }
  if (!isAnalytical && !isBold && !isSocial) {
    return {
      roleName: "内省的クリエイター",
      roleDescription: "深い感性と独自の視点で、他者にはない価値を生み出す。静かなイノベーター。",
      strengths: ["独自の視点からの発想", "深い集中力", "質の高いアウトプット"],
      stressors: ["大人数の会議", "短納期のプレッシャー", "表面的な人間関係"],
      idealEnvironment: "自分のペースで深く取り組める環境。少人数の信頼できるチーム。",
      teamRole: "チームの「職人」。誰も気づかなかった角度からの提案や、細部にこだわったアウトプットでチーム全体の質を底上げする。",
      workStyle: "静かな環境でじっくり取り組み、完成度の高いものを一度に出すスタイル。途中経過の共有よりも、完成形での発表を好む。",
    };
  }
  if (isAnalytical && isBold) {
    return {
      roleName: "決断型アーキテクト",
      roleDescription: "分析力と大胆さを兼ね備え、複雑な課題に対して明確な方向性を示す。",
      strengths: ["迅速かつ的確な判断", "システム思考", "困難な決断への耐性"],
      stressors: ["優柔不断な環境", "根拠のない慣習", "コンセンサス重視の文化"],
      idealEnvironment: "実力主義で、成果に対してフェアな評価がされる組織。",
      teamRole: "チームの「決定者」。曖昧な状況でも素早く方針を決め、チームを前に進める。責任を取ることを恐れず、迷いのある場面でリーダーシップを発揮する。",
      workStyle: "目標を明確にし、逆算して行動する。無駄な会議やプロセスを省き、最短ルートで成果を出すことにこだわる。",
    };
  }
  if (isSocial && isPlanner) {
    return {
      roleName: "組織型コーディネーター",
      roleDescription: "チームの力を最大化する調整役。計画的に人と仕事を結びつける。",
      strengths: ["チームビルディング", "スケジュール管理", "関係者間の調整"],
      stressors: ["単独での創作活動", "予測不能な変化", "感情的な対立"],
      idealEnvironment: "チームワークを重視する組織。明確な役割分担と定期的なコミュニケーション。",
      teamRole: "チームの「ハブ」。メンバー一人ひとりの強みを理解し、最適な組み合わせで仕事を配分する。全体の進捗を見渡し、遅れや問題を早期に察知する。",
      workStyle: "定期的なミーティングとタスク管理ツールを活用し、計画に沿って着実に進める。チームとのコミュニケーションを重視する。",
    };
  }
  if (!isAnalytical && isPlanner) {
    return {
      roleName: "感覚的プランナー",
      roleDescription: "直感的な判断力を活かしながら、着実に計画を実行する。感性と規律のバランサー。",
      strengths: ["感覚的に正しい方向を見極める", "計画的な実行力", "美的センス"],
      stressors: ["過度なデータ分析", "感情を排除した議論", "自由度のない環境"],
      idealEnvironment: "クリエイティブな要素がありつつ、安定したプロセスがある場。",
      teamRole: "チームの「翻訳者」。抽象的なビジョンを具体的な計画に落とし込む。感性と論理の橋渡しをし、両方の言語を話せる存在。",
      workStyle: "直感で方向性を掴んだら、そこから逆算して段階的に進める。感覚と計画のハイブリッド型。",
    };
  }
  // Default
  return {
    roleName: "バランス型ジェネラリスト",
    roleDescription: "特定の極端な傾向を持たず、状況に応じて柔軟に役割を変えられる万能型。",
    strengths: ["適応力が高い", "多角的な視点", "チーム内の潤滑油的存在"],
    stressors: ["極端な専門性を求められる場面", "明確な方向性がない環境"],
    idealEnvironment: "多様なタスクがあり、幅広いスキルを活かせるチーム。",
    teamRole: "チームの「潤滑油」。特定の役割に固定されず、その時々で必要なポジションに入れる柔軟さがある。足りない部分を自然に補完する。",
    workStyle: "状況に応じてスタイルを切り替えられる。一人作業もチーム作業も苦にならないが、どちらか一方に偏ると疲れやすい。",
  };
}

// ── Growth Direction ──

function generateGrowthDirection(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  traitCards: DerivedTraitCard[],
  totalObservations: number
): GrowthDirection {
  const { moving, unknown } = classifyAxes(axisScores);

  let currentPhase: string;
  if (totalObservations < 20) {
    currentPhase = "探索期 — 自分がどういう人間かを知り始めたばかりの段階";
  } else if (totalObservations < 60) {
    currentPhase = "形成期 — パターンが見え始め、自己理解が深まっている段階";
  } else if (unknown.length > 10) {
    currentPhase = "拡張期 — 既知の自分を超えて、未知の領域を探る段階";
  } else {
    currentPhase = "統合期 — 自己理解が高いレベルにあり、矛盾を統合する段階";
  }

  let growthEdge: string;
  if (moving.length > 3) {
    const topMoving = moving.slice(0, 2).map((m) => m.label).join("」と「");
    growthEdge = `今、「${topMoving}」が揺れている。これは変化の最前線。この揺れに意識を向けることが成長のカギ。`;
  } else if (unknown.length > 5) {
    growthEdge = "まだ未観測の領域が多い。新しい場面で自分がどう反応するか、意識的に観察してみよう。";
  } else {
    growthEdge = "基盤は安定している。次のステップは、安定を超えた挑戦に踏み出すこと。";
  }

  const suggestions: string[] = [];
  if (moving.length > 0) {
    suggestions.push(`「${moving[0].label}」が揺れている時の自分に注目してみよう`);
  }
  if (unknown.length > 0) {
    suggestions.push("まだ未観測の領域に触れる新しい体験をしてみよう");
  }
  const weakCards = traitCards.filter(
    (c) => c.strength > 0.5 && c.observationDepth !== "deep"
  );
  if (weakCards.length > 0) {
    suggestions.push(`「${weakCards[0].label}」について、もう少し深く観測してみよう`);
  }
  if (suggestions.length === 0) {
    suggestions.push("日常の小さな選択に意識を向けると、新しい気づきが見つかるかも");
  }

  // Energy sources & drains based on axis scores
  const energySources: string[] = [];
  const energyDrains: string[] = [];

  const intro = axisScores.introvert_vs_extrovert ?? 0;
  const analytical = axisScores.analytical_vs_intuitive ?? 0;
  const social = axisScores.individual_vs_social ?? 0;
  const plan = axisScores.plan_vs_spontaneous ?? 0;
  const bold = axisScores.cautious_vs_bold ?? 0;
  const quality = axisScores.quality_vs_quantity ?? 0;
  const perf = axisScores.perfectionist_vs_pragmatic ?? 0;
  const stressIso = axisScores.stress_isolation_vs_social ?? 0;

  // Introvert / Extrovert
  if (intro < -0.2) {
    energySources.push("静かな一人の時間");
    energyDrains.push("長時間の社交や大人数の場");
  } else if (intro > 0.2) {
    energySources.push("人との会話や交流");
    energyDrains.push("長時間の孤立");
  }

  // Analytical / Intuitive
  if (analytical < -0.2) {
    energySources.push("論理的に考え、構造を理解すること");
    energyDrains.push("根拠のない感情的な議論");
  } else if (analytical > 0.2) {
    energySources.push("自由にアイデアを膨らませること");
    energyDrains.push("細かいデータ分析や数字の作業");
  }

  // Plan / Spontaneous
  if (plan < -0.2) {
    energySources.push("計画通りに物事が進むこと");
    energyDrains.push("予測不能な変化や急な変更");
  } else if (plan > 0.2) {
    energySources.push("自由度のある即興的な状況");
    energyDrains.push("厳格なルールやマニュアル");
  }

  // Quality / Quantity
  if (quality < -0.2) {
    energySources.push("一つのことに深く集中すること");
  } else if (quality > 0.2) {
    energySources.push("多様な体験や新しいことへの挑戦");
  }

  // Perfectionist
  if (perf < -0.3) {
    energyDrains.push("中途半端な状態や低品質な成果物");
  }

  // Recovery pattern
  let recoveryPattern: string;
  if (stressIso < -0.2) {
    if (intro < -0.2) {
      recoveryPattern = "一人で静かに過ごすことで回復するタイプ。読書、散歩、お気に入りの場所で自分だけの時間を確保することが大切。";
    } else {
      recoveryPattern = "ストレスを感じた時はまず一人になって整理したい。落ち着いてから信頼できる人に話すことで回復する。";
    }
  } else if (stressIso > 0.2) {
    recoveryPattern = "信頼できる人と話すことで回復するタイプ。一人で抱え込まず、早い段階で誰かに打ち明けることが回復の鍵。";
  } else {
    recoveryPattern = "状況に応じて一人の時間と人との時間を使い分ける。どちらか一方に偏らないバランスが回復のポイント。";
  }

  return {
    currentPhase,
    growthEdge,
    actionSuggestions: suggestions.slice(0, 3),
    energySources: energySources.slice(0, 3),
    energyDrains: energyDrains.slice(0, 3),
    recoveryPattern,
  };
}

// ── Influential Traits ──

function generateInfluentialTraits(
  traitCards: DerivedTraitCard[]
): InfluentialTrait[] {
  const TRAIT_ICONS: Record<string, string> = {
    pioneer: "🚀",
    anchor: "⚓",
    strategist: "♟️",
    spark: "⚡",
    drive: "🔥",
    depth: "🔮",
    pragmatist: "🔧",
    empathizer: "💗",
    lone_wolf: "🐺",
    bridge_builder: "🌉",
    guardian: "🛡️",
    chameleon: "🦎",
    calm_water: "🏔️",
    deep_current: "🌊",
    seeker: "🔍",
    resilient: "💎",
    minimalist: "◻️",
    expressionist: "🎨",
    respectful_navigator: "🧭",
  };

  return traitCards
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 4)
    .map((card) => ({
      id: card.id,
      icon: TRAIT_ICONS[card.id] || "✨",
      label: card.label,
      description: card.description,
    }));
}

// ── Helpers ──

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}
