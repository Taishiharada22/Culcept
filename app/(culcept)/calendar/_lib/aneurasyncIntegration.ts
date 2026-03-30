/**
 * Aneurasync 深層統合
 *
 * Stargazer観測データ（ムード、ストレス、判断原理、エネルギー）を
 * コーデ提案に反映する。
 *
 * Aneurasync思想: 「自分って、そういう人間だったのか」
 *  → ユーザーのその日の心理状態に合ったコーデを、本人が自覚する前に提案する
 */

import type { CalendarPersonaProfile } from "./personaBoost";

/* ── 観測データの要約 ── */
export interface ObservationContext {
  // 直近の観測から推定される状態
  moodLevel: number;          // -1(低調) ~ 0(中立) ~ +1(高調)
  stressLevel: number;        // 0(低) ~ 1(高)
  energyLevel: number;        // 0(低) ~ 1(高)
  socialReadiness: number;    // 0(内向的) ~ 1(外向的)

  // 判断原理パターン
  decisionStyle: "intuitive" | "analytical" | "balanced";
  changeOpenness: number;     // 0(安定志向) ~ 1(変化志向)

  // 感情軸
  emotionalStability: number; // 0(変動的) ~ 1(安定)

  // メタデータ
  observationCount: number;
  lastObservationDate: string | null;
  confidence: number;         // 0-1 (データ量に基づく信頼度)
}

/* ── コーデへの適応指示 ── */
export interface OutfitAdaptation {
  formalityShift: number;     // -1 (もっとカジュアル) ~ +1 (もっとフォーマル)
  colorIntensityShift: number; // -1 (抑えめ) ~ +1 (鮮やか)
  comfortPriority: number;    // 0-1 (快適性をどの程度優先するか)
  noveltyTolerance: number;   // 0-1 (新しい組み合わせへの許容度)
  reason: string;
}

/* ── PersonalityLayer の dimensions から ObservationContext を構築 ── */
export function buildObservationContext(
  persona: CalendarPersonaProfile | null,
  recentObservations?: Array<{
    date: string;
    mood?: number;
    stress?: number;
    energy?: number;
  }>,
): ObservationContext {
  const defaultCtx: ObservationContext = {
    moodLevel: 0,
    stressLevel: 0.3,
    energyLevel: 0.5,
    socialReadiness: 0.5,
    decisionStyle: "balanced",
    changeOpenness: 0.5,
    emotionalStability: 0.5,
    observationCount: 0,
    lastObservationDate: null,
    confidence: 0,
  };

  if (!persona || persona.completeness < 10) return defaultCtx;

  const axes = persona.styleAxis;

  // PersonalityLayer の軸からマッピング
  // cautious_vs_bold: -1(慎重) ~ +1(大胆)
  // function_vs_expression: -1(機能) ~ +1(表現)
  // classic_vs_trendy: -1(クラシック) ~ +1(トレンド)
  // minimal_vs_maximal: -1(ミニマル) ~ +1(マキシマル)

  const boldness = axes.cautious_vs_bold;
  const expressiveness = axes.function_vs_expression;
  const trendiness = axes.classic_vs_trendy;

  // 直近観測データがある場合はそちらを優先
  let mood = 0;
  let stress = 0.3;
  let energy = 0.5;
  let lastDate: string | null = null;
  let obsCount = 0;

  if (recentObservations && recentObservations.length > 0) {
    // 直近3件の加重平均 (最新ほど重み大)
    const sorted = [...recentObservations].sort((a, b) => b.date.localeCompare(a.date));
    const recent = sorted.slice(0, 3);

    let totalWeight = 0;
    let moodAcc = 0, stressAcc = 0, energyAcc = 0;

    for (let i = 0; i < recent.length; i++) {
      const weight = 1 / (i + 1);
      moodAcc += (recent[i].mood ?? 0) * weight;
      stressAcc += (recent[i].stress ?? 0.3) * weight;
      energyAcc += (recent[i].energy ?? 0.5) * weight;
      totalWeight += weight;
    }

    mood = moodAcc / totalWeight;
    stress = stressAcc / totalWeight;
    energy = energyAcc / totalWeight;
    lastDate = sorted[0].date;
    obsCount = recentObservations.length;
  }

  // 信頼度: 直近観測 + PersonaGenome完成度
  const obsConfidence = Math.min(1, obsCount / 10);
  const personaConfidence = persona.completeness / 100;
  const confidence = obsConfidence * 0.6 + personaConfidence * 0.4;

  return {
    moodLevel: mood,
    stressLevel: stress,
    energyLevel: energy,
    socialReadiness: (boldness + 1) / 2, // -1~+1 → 0~1
    decisionStyle: boldness > 0.2 ? "intuitive" : boldness < -0.2 ? "analytical" : "balanced",
    changeOpenness: (trendiness + 1) / 2,
    emotionalStability: expressiveness < 0 ? 0.7 : 0.4, // 機能重視 → 感情安定寄り
    observationCount: obsCount,
    lastObservationDate: lastDate,
    confidence,
  };
}

/* ── 観測データからコーデ適応指示を生成 ── */
export function computeOutfitAdaptation(
  ctx: ObservationContext,
  events: Array<{ event_type: string }>,
): OutfitAdaptation {
  let formalityShift = 0;
  let colorIntensityShift = 0;
  let comfortPriority = 0.5;
  let noveltyTolerance = 0.5;
  const reasons: string[] = [];

  if (ctx.confidence < 0.1) {
    return { formalityShift: 0, colorIntensityShift: 0, comfortPriority: 0.5, noveltyTolerance: 0.5, reason: "" };
  }

  // ストレス高 → 快適性UP、フォーマリティ下げ、色は落ち着き
  if (ctx.stressLevel >= 0.7) {
    formalityShift -= 0.3;
    colorIntensityShift -= 0.3;
    comfortPriority += 0.3;
    noveltyTolerance -= 0.2;
    reasons.push("ストレスが高い時期なので快適さ重視");
  }

  // ムード高 → 新しい挑戦OK、色味UP
  if (ctx.moodLevel >= 0.5) {
    colorIntensityShift += 0.2;
    noveltyTolerance += 0.2;
    reasons.push("好調な時期。新しいスタイルにチャレンジ");
  }

  // ムード低 → 安心できるコーデ、お気に入り優先
  if (ctx.moodLevel <= -0.3) {
    comfortPriority += 0.2;
    noveltyTolerance -= 0.3;
    reasons.push("心が落ち着くお気に入りコーデを優先");
  }

  // エネルギー低 → シンプル構成
  if (ctx.energyLevel <= 0.3) {
    formalityShift -= 0.2;
    comfortPriority += 0.2;
    reasons.push("エネルギーが低めなのでシンプルに");
  }

  // 社交性高 + ソーシャルイベント → フォーマリティUP
  const hasSocialEvent = events.some(e => ["date", "party", "meeting"].includes(e.event_type));
  if (ctx.socialReadiness >= 0.7 && hasSocialEvent) {
    formalityShift += 0.2;
    colorIntensityShift += 0.1;
    reasons.push("社交的な気分に合わせてスタイルアップ");
  }

  // 変化志向高 → 新鮮な組み合わせ推奨
  if (ctx.changeOpenness >= 0.7 && ctx.moodLevel >= 0) {
    noveltyTolerance += 0.2;
    reasons.push("変化を好む傾向。いつもと違う提案も");
  }

  return {
    formalityShift: Math.max(-1, Math.min(1, formalityShift)),
    colorIntensityShift: Math.max(-1, Math.min(1, colorIntensityShift)),
    comfortPriority: Math.max(0, Math.min(1, comfortPriority)),
    noveltyTolerance: Math.max(0, Math.min(1, noveltyTolerance)),
    reason: reasons.length > 0 ? reasons[0] : "",
  };
}

/* ── Aneurasync適応をSYNCスコアに反映 ── */
export function aneurasyncSyncBoost(
  adaptation: OutfitAdaptation,
  currentTpoScore: number,
  currentVisualScore: number,
): { tpoAdjust: number; visualAdjust: number } {
  // フォーマリティシフトが実現されていれば TPO ボーナス
  const tpoAdjust = adaptation.comfortPriority >= 0.7 ? 2 : 0;
  // 色彩シフトが実現されていれば Visual ボーナス
  const visualAdjust = Math.abs(adaptation.colorIntensityShift) >= 0.3 ? 1 : 0;

  return { tpoAdjust, visualAdjust };
}
