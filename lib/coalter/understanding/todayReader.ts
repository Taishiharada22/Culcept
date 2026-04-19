/**
 * CoAlter Stage 1 Understand — TodayReader
 *
 * ObservationBundle → TodayReading の rule-based baseline。
 *
 * [CEO lock 2026-04-20 M0-3 #1] LLM 未使用。
 *   "今日の読み" を rule-based に限定し、監査可能性を確保する。
 *   軽量 LLM 化は M0-4 で別差し替え（内部 API は同じ TodayReading を返す）。
 * [CEO lock 2026-04-20 M0-2 #1] 完全決定論: 現在時刻 / 乱数参照なし。
 * [CEO lock 2026-04-20 M0-2 #2] 欠損時 degrade、補完なし。
 *
 * M0-3 scope: shadow 限定、既存 runtime 未接続。
 */

import type {
  ConversationObservation,
  ObservationBundle,
  PersonObservation,
  TodayMode,
  TodayReading,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Mode decision — priority cascade（先に match したものを採用）
// ═══════════════════════════════════════════════════════════════════════════

const CELEBRATION_MARKERS = /(祝|記念|誕生日|特別|久しぶりに|ご褒美)/;

/**
 * Mode 決定表（上から順に評価、match した最初のものを採用）:
 *
 *   recover    ─ どちらかが "low" energy、または両者 fatigue 強（本人 sensitivities 発火）
 *   celebrate  ─ conversation.implicitMood / turns に祝祭マーカー
 *   challenge  ─ arc=expanding AND 両者の Ren 系（刺激/新奇）軸が正方向
 *   connect    ─ caring 非対称が 0.2 以上（片方が相手に配慮している）
 *   maintain   ─ 上記いずれも該当しない（calendar density heavy 時も含む）
 */
function deriveMode(
  personA: PersonObservation,
  personB: PersonObservation,
  conversation: ConversationObservation,
): TodayMode {
  // 1. recover
  if (conversation.energyLevel === "low") return "recover";
  if (bothFatigued(personA, personB, conversation)) return "recover";

  // 2. celebrate — conversation turns / implicitMood の文字列マーカーのみ。
  if (CELEBRATION_MARKERS.test(conversation.implicitMood)) return "celebrate";
  for (const t of conversation.turns) {
    if (CELEBRATION_MARKERS.test(t.body)) return "celebrate";
  }

  // 3. challenge
  if (conversation.conversationArc === "expanding" && bothRenLeaning(personA, personB)) {
    return "challenge";
  }

  // 4. connect — caring 非対称
  const caringGap = Math.abs(conversation.caringIntensity.a - conversation.caringIntensity.b);
  if (caringGap >= 0.2) return "connect";

  // 5. maintain
  return "maintain";
}

function bothFatigued(
  a: PersonObservation,
  b: PersonObservation,
  conversation: ConversationObservation,
): boolean {
  // 疲労の observation: Alter の emotionalState.intensity が "疲れ" 系、または
  // fatigueTriggers を含む単語が最近ターンの body に出ている。
  // rule-based なので、文字列 token ベースで判定する（心理推定ではない）。
  const fatigueTokens = ["疲れ", "だるい", "眠い", "ヘトヘト", "無理"];
  for (const t of conversation.turns) {
    const matched = fatigueTokens.some((tok) => t.body.includes(tok));
    if (matched) return true; // 1 本でも観測あれば recover 側へ寄せる
  }
  // recentEmotionalState.intensity が低く dominantAffect が "疲労" 系なら採用。
  const aAff = a.alter.recentEmotionalState?.dominantAffect ?? "";
  const bAff = b.alter.recentEmotionalState?.dominantAffect ?? "";
  if (aAff.includes("疲") || bAff.includes("疲")) return true;
  return false;
}

function bothRenLeaning(a: PersonObservation, b: PersonObservation): boolean {
  // 両者とも「caution_vs_stimulus > 0」または「novelty_vs_familiarity > 0」に寄る場合。
  return renLeaningPerson(a) && renLeaningPerson(b);
}

// γ M0-6C: 実在する Ren 系軸を列挙。value の正方向が「刺激/新奇を選ぶ」側。
// caution_vs_stimulus / novelty_vs_familiarity は旧命名で現 DB に存在しないが、
// 後方互換のため残す。実運用では cautious_vs_bold 等が参照される。
const REN_AXES = new Set([
  "caution_vs_stimulus",
  "novelty_vs_familiarity",
  "cautious_vs_bold",
  "tradition_vs_novelty",
  "change_embrace_vs_resist",
]);

function renLeaningPerson(p: PersonObservation): boolean {
  for (const ax of p.stargazer.decisionAxes) {
    if (REN_AXES.has(ax.key) && ax.value >= 0.3 && ax.confidence >= 0.4) {
      return true;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Budgets — 観測値の直接マッピング
// ═══════════════════════════════════════════════════════════════════════════

function deriveEnergyBudget(conversation: ConversationObservation): "high" | "mid" | "low" {
  return conversation.energyLevel; // 直接反映、推測禁止
}

function deriveTimeBudget(
  a: PersonObservation,
  b: PersonObservation,
): "ample" | "limited" | "tight" {
  const densities = [
    a.behavioral.calendarContext?.todayDensity,
    b.behavioral.calendarContext?.todayDensity,
  ].filter((d): d is "empty" | "light" | "medium" | "heavy" => !!d);

  if (densities.length === 0) return "limited"; // 観測欠損時は中立
  if (densities.includes("heavy")) return "tight";
  if (densities.every((d) => d === "empty" || d === "light")) return "ample";
  return "limited";
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Intent & needs — 観測文字列の pass-through のみ
// ═══════════════════════════════════════════════════════════════════════════

function deriveImplicitIntent(
  conversation: ConversationObservation,
  mode: TodayMode,
): string {
  // 観測 implicitMood が空なら空文字（lock #2）。
  // あれば "<mood>（{mode} 基調）" 形式で渡す。mode は narration の hint。
  const mood = conversation.implicitMood.trim();
  if (!mood) return "";
  return `${mood}（${MODE_LABEL[mode]}基調）`;
}

const MODE_LABEL: Record<TodayMode, string> = {
  recover: "回復",
  celebrate: "祝祭",
  connect: "接近",
  challenge: "挑戦",
  maintain: "平常",
};

function deriveLatentNeeds(
  a: PersonObservation,
  b: PersonObservation,
): string[] {
  // 観測された unspokenDesires をそのまま採用。捏造しない。
  const set = new Set<string>();
  for (const s of a.stargazer.unspokenDesires) {
    const t = s.trim();
    if (t) set.add(t);
  }
  for (const s of b.stargazer.unspokenDesires) {
    const t = s.trim();
    if (t) set.add(t);
  }
  return Array.from(set).sort((x, y) => (x < y ? -1 : 1)).slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Confidence — bundle.completeness から導出
// ═══════════════════════════════════════════════════════════════════════════

function deriveConfidence(bundle: ObservationBundle): number {
  const c = bundle.completeness;
  const personScore =
    (avgFour(c.personA.stargazer, c.personA.alter, c.personA.behavioral, c.personA.context) +
      avgFour(c.personB.stargazer, c.personB.alter, c.personB.behavioral, c.personB.context)) /
    2;
  const score =
    0.4 * personScore +
    0.2 * c.relationship +
    0.25 * c.conversation +
    0.15 * c.environmental;
  // 小数 3 桁に丸め（決定論、JSON 比較安定）
  return Math.round(score * 1000) / 1000;
}

function avgFour(a: number, b: number, c: number, d: number): number {
  return (a + b + c + d) / 4;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Public API
// ═══════════════════════════════════════════════════════════════════════════

export function readToday(bundle: ObservationBundle): TodayReading {
  const mode = deriveMode(bundle.personA, bundle.personB, bundle.conversation);
  return {
    mode,
    energyBudget: deriveEnergyBudget(bundle.conversation),
    timeBudget: deriveTimeBudget(bundle.personA, bundle.personB),
    implicitIntent: deriveImplicitIntent(bundle.conversation, mode),
    latentNeeds: deriveLatentNeeds(bundle.personA, bundle.personB),
    confidence: deriveConfidence(bundle),
  };
}

/**
 * [CEO lock 2026-04-20 M0-4 #1] 並立のための明示エイリアス。
 *   runUnderstanding 本流は readToday（rule-based）を使い続ける。
 *   LLM 版は `todayReaderLLM.ts` に別置、比較は `compareTodayReaders.ts`。
 */
export const readTodayRuleBased = readToday;
