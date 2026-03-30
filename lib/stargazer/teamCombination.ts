// lib/stargazer/teamCombination.ts
// コンビネーション提案 — 誰と組むと強いかを分析
// 根拠: Belbin (Team Roles), Jung (心理的タイプの相補性), Tuckman (チーム発達段階)

import type { TraitAxisKey } from "./traitAxes";
import type { ArchetypeCode } from "./archetypeTypes";
import { getArchetypeByCode, ARCHETYPE_DEFS } from "./archetypeTypes";

// ── Types ──

export interface TeamPartner {
  /** パートナーのアーキタイプ */
  archetypeCode: ArchetypeCode;
  archetypeName: string;
  /** 相性の強さ (0-1) */
  synergy: number;
  /** なぜ合うか */
  whySynergy: string;
  /** この組み合わせで生まれる強み */
  combinedStrength: string;
  /** 注意点 — 衝突ポイント */
  frictionPoint: string;
  /** 最適な役割分担 */
  roleAllocation: string;
}

export interface RomanticPartner {
  /** パートナーのアーキタイプ */
  archetypeCode: ArchetypeCode;
  archetypeName: string;
  /** 相性の強さ (0-1) */
  synergy: number;
  /** なぜ合うか */
  whySynergy: string;
  /** この組み合わせで生まれる強み */
  combinedStrength: string;
  /** 注意点 — 衝突ポイント */
  frictionPoint: string;
  /** 恋愛における役割・関係性 */
  roleAllocation: string;
}

export interface TeamCombinationResult {
  /** 最高の相棒（上位3名） */
  bestPartners: TeamPartner[];
  /** 成長を促すパートナー（相補的なタイプ） */
  growthPartners: TeamPartner[];
  /** 最強の恋人（上位3名） */
  romanticPartners: RomanticPartner[];
  /** 全体サマリー */
  summary: string;
  /** 恋愛サマリー */
  romanticSummary: string;
}

// ── Analysis ──

/**
 * ユーザーのアーキタイプと軸スコアから、最適なチームメイトを提案
 */
export function analyzeTeamCombinations(
  userArchetypeCode: ArchetypeCode | undefined,
  axisScores: Partial<Record<TraitAxisKey, number>>,
): TeamCombinationResult | null {
  if (!userArchetypeCode) return null;
  const entries = Object.keys(axisScores);
  if (entries.length < 5) return null;

  const userDef = getArchetypeByCode(userArchetypeCode);
  if (!userDef) return null;

  // 全L1アーキタイプとの相性を計算
  const partners: (TeamPartner & { isComplementary: boolean })[] = [];

  for (const otherDef of ARCHETYPE_DEFS) {
    if (otherDef.code === userArchetypeCode) continue;

    // 相性スコア計算: 相補性（違いが補い合う）と共鳴性（共通点で理解し合える）
    const complementarity = computeComplementarity(userDef.code, otherDef.code, axisScores);
    const resonance = computeResonance(userDef.code, otherDef.code);
    const synergy = complementarity * 0.6 + resonance * 0.4;

    const partner: TeamPartner & { isComplementary: boolean } = {
      archetypeCode: otherDef.code,
      archetypeName: otherDef.name,
      synergy,
      whySynergy: generateSynergyReason(userDef.name, otherDef.name, complementarity, resonance),
      combinedStrength: generateCombinedStrength(userDef.code, otherDef.code),
      frictionPoint: generateFrictionPoint(userDef.code, otherDef.code),
      roleAllocation: generateRoleAllocation(userDef.name, otherDef.name, axisScores),
      isComplementary: complementarity > resonance,
    };

    partners.push(partner);
  }

  // ソート
  const sorted = [...partners].sort((a, b) => b.synergy - a.synergy);
  const bestPartners = sorted.slice(0, 3);
  const growthPartners = sorted
    .filter((p) => p.isComplementary && p.synergy > 0.3)
    .slice(0, 2);

  const topNames = bestPartners.map((p) => p.archetypeName).join("、");
  const summary = `あなた（${userDef.name}）は${topNames}タイプと特に相性が良い。互いの強みを活かし合える組み合わせです。`;

  // ── 恋愛パートナー分析（共鳴性を重視） ──
  const romanticCandidates: (RomanticPartner & { _score: number })[] = [];

  for (const otherDef of ARCHETYPE_DEFS) {
    if (otherDef.code === userArchetypeCode) continue;

    const complementarity = computeComplementarity(userDef.code, otherDef.code, axisScores);
    const resonance = computeResonance(userDef.code, otherDef.code);
    // 恋愛では理解し合える共鳴性を重視
    const romanticScore = resonance * 0.6 + complementarity * 0.4;

    romanticCandidates.push({
      archetypeCode: otherDef.code,
      archetypeName: otherDef.name,
      synergy: romanticScore,
      whySynergy: generateRomanticSynergyReason(userDef.name, otherDef.name, complementarity, resonance),
      combinedStrength: generateRomanticStrength(userDef.code, otherDef.code),
      frictionPoint: generateRomanticFriction(userDef.code, otherDef.code),
      roleAllocation: generateRomanticDynamic(userDef.name, otherDef.name, axisScores),
      _score: romanticScore,
    });
  }

  const romanticSorted = [...romanticCandidates].sort((a, b) => b._score - a._score);
  const romanticPartners: RomanticPartner[] = romanticSorted.slice(0, 3).map(({ _score, ...rest }) => rest);

  const romanticTopNames = romanticPartners.map((p) => p.archetypeName).join("、");
  const romanticSummary = `あなた（${userDef.name}）は${romanticTopNames}タイプと恋愛相性が高い。深い理解と自然な安心感が生まれやすい組み合わせです。`;

  return { bestPartners, growthPartners, romanticPartners, summary, romanticSummary };
}

// ── Internal Helpers ──

/** 相補性: 互いの弱みを補い合えるか */
function computeComplementarity(
  a: ArchetypeCode,
  b: ArchetypeCode,
  axisScores: Partial<Record<TraitAxisKey, number>>,
): number {
  // 異なるカテゴリのアーキタイプは相補性が高い
  const aDef = getArchetypeByCode(a);
  const bDef = getArchetypeByCode(b);
  if (!aDef || !bDef) return 0.5;

  let score = 0.5; // ベースライン

  // 対極的な特性の組み合わせは相補性が高い
  const intro = axisScores.introvert_vs_extrovert ?? 0;
  const analytical = axisScores.analytical_vs_intuitive ?? 0;
  const bold = axisScores.cautious_vs_bold ?? 0;

  // 分析的な人は直感的な相手と組むと強い
  if (Math.abs(analytical) > 0.3) score += 0.1;
  // 大胆な人は慎重な相手と組むと安定する
  if (Math.abs(bold) > 0.3) score += 0.08;
  // 内向的な人は外向的な相手と組むとカバー範囲が広がる
  if (Math.abs(intro) > 0.3) score += 0.08;

  // 同じ層でない方が多様性が出る
  const aLayer = getLayer(a);
  const bLayer = getLayer(b);
  if (aLayer !== bLayer) score += 0.1;

  return Math.min(1, score);
}

/** 共鳴性: 互いを理解し合えるか */
function computeResonance(a: ArchetypeCode, b: ArchetypeCode): number {
  // 同じ層のアーキタイプは価値観が近い
  const aLayer = getLayer(a);
  const bLayer = getLayer(b);
  let score = 0.4;
  if (aLayer === bLayer) score += 0.25;

  // 近いコード番号は特性が近い
  const aNum = parseInt(a.replace(/\D/g, ""), 10) || 0;
  const bNum = parseInt(b.replace(/\D/g, ""), 10) || 0;
  const diff = Math.abs(aNum - bNum);
  if (diff <= 2) score += 0.15;

  return Math.min(1, score);
}

function getLayer(code: ArchetypeCode): number {
  const num = parseInt(code.replace(/\D/g, ""), 10) || 0;
  if (num <= 4) return 1;
  if (num <= 8) return 2;
  return 3;
}

function generateSynergyReason(
  userName: string,
  partnerName: string,
  complementarity: number,
  resonance: number,
): string {
  if (complementarity > resonance) {
    return `${userName}と${partnerName}は互いの弱みを補い合える関係。あなたにない視点を相手が持っている。`;
  }
  return `${userName}と${partnerName}は価値観が近く、言葉が少なくても通じ合える。安心して深い協業ができる。`;
}

function generateCombinedStrength(a: ArchetypeCode, b: ArchetypeCode): string {
  const aLayer = getLayer(a);
  const bLayer = getLayer(b);

  if (aLayer !== bLayer) {
    return "異なる深さの視点を組み合わせることで、表面的な課題も深層的な課題も同時に見えるチームになる。";
  }
  return "共通の価値観をベースに、それぞれの得意領域で分業することで、速度と品質を両立できる。";
}

function generateFrictionPoint(a: ArchetypeCode, b: ArchetypeCode): string {
  const aLayer = getLayer(a);
  const bLayer = getLayer(b);

  if (aLayer !== bLayer) {
    return "物事の捉え方の深さが違うため、判断スピードにズレが生じやすい。「なぜそう考えるか」を丁寧に共有するのが鍵。";
  }
  return "似ているからこそ「言わなくても分かるはず」という思い込みが生じやすい。明示的なコミュニケーションを意識する。";
}

function generateRoleAllocation(
  userName: string,
  partnerName: string,
  axisScores: Partial<Record<TraitAxisKey, number>>,
): string {
  const analytical = axisScores.analytical_vs_intuitive ?? 0;
  const social = axisScores.social_initiative ?? 0;

  if (analytical < -0.2) {
    return `あなた（${userName}）は分析・戦略面を担い、${partnerName}が実行・対外面を担うと最大効率。`;
  }
  if (social > 0.3) {
    return `あなた（${userName}）が対外的な交渉やプレゼンを担い、${partnerName}が裏方の設計・品質管理を担うのが理想。`;
  }
  return `${userName}と${partnerName}で、構想フェーズと実行フェーズを交互にリードする「バトンタッチ型」がベスト。`;
}

// ── Romantic Helpers ──

function generateRomanticSynergyReason(
  userName: string,
  partnerName: string,
  complementarity: number,
  resonance: number,
): string {
  if (resonance > complementarity) {
    return `${userName}と${partnerName}は感覚が似ていて、一緒にいると自然体でいられる。言葉にしなくても気持ちが伝わりやすい関係。`;
  }
  return `${userName}と${partnerName}は互いにないものを持っていて、一緒にいると世界が広がる。新鮮さが長続きする組み合わせ。`;
}

function generateRomanticStrength(a: ArchetypeCode, b: ArchetypeCode): string {
  const aLayer = getLayer(a);
  const bLayer = getLayer(b);

  if (aLayer === bLayer) {
    return "価値観の根底が近いため、人生の大きな選択で自然と同じ方向を向ける。安定感のある深い絆が育ちやすい。";
  }
  if (Math.abs(aLayer - bLayer) === 1) {
    return "程よい違いが刺激になり、マンネリになりにくい。お互いの視点を取り入れることで、ふたりとも成長できる関係。";
  }
  return "大きく異なる世界観を持つからこそ、理解し合えたときの信頼は非常に深い。唯一無二の特別な関係になれる。";
}

function generateRomanticFriction(a: ArchetypeCode, b: ArchetypeCode): string {
  const aLayer = getLayer(a);
  const bLayer = getLayer(b);

  if (aLayer === bLayer) {
    return "似ているがゆえに「分かってくれて当然」と期待しすぎることがある。感謝と感動を言葉にする習慣が長続きの秘訣。";
  }
  return "感情の表現方法やペースが違うため、すれ違いが起きやすい。「違う＝嫌い」ではないことを忘れないのが大切。";
}

function generateRomanticDynamic(
  userName: string,
  partnerName: string,
  axisScores: Partial<Record<TraitAxisKey, number>>,
): string {
  const intro = axisScores.introvert_vs_extrovert ?? 0;
  const empathy = (axisScores as Record<string, number | undefined>)["empathy_expression"] ?? 0;

  if (empathy > 0.3) {
    return `あなた（${userName}）の共感力が関係の土台になる。${partnerName}が安心して本音を出せる環境をつくれる。`;
  }
  if (intro < -0.2) {
    return `あなた（${userName}）はふたりの内面的な深さを担い、${partnerName}が外の世界との接点を広げる。静と動のバランスが心地いい。`;
  }
  return `${userName}と${partnerName}は対等なパートナーシップが理想。日常の小さな選択を交互にリードし合うとうまくいく。`;
}
