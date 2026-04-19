/**
 * CoAlter Stage 1 Understand — LLM 用入力圧縮
 *
 * [CEO lock 2026-04-20 M0-4 #4] LLM 入力は最小化。
 *   ObservationBundle 全量を LLM に投げない。TodayReading 生成に必要な
 *   aggregated signal だけを抽出し、raw turn body / displayName / userId /
 *   narrative summary / wear history を一切含まない形に落とす。
 *
 * [CEO lock 2026-04-20 A] 生テキストが LLM prompt に混入する経路をここで遮断する。
 *   rule-based todayReader は bundle 全量を読んで良い（sandbox 内）。
 *   LLM 版は本関数の出力以外を触れない。
 *
 * 圧縮ポリシー:
 *   - energyLevel: そのまま（enum）
 *   - conversationArc: そのまま（enum）
 *   - caringIntensity: 数値 2 本（0-1）
 *   - implicitMood: 既に narration 側で作られた要約文字列（raw turn body ではない）
 *     を 1 本だけ渡す。空なら空のまま。
 *   - fatigueSignal: 3 値 enum（none / some / strong）に集約。turn body は渡さない。
 *   - celebrationSignal: boolean に集約。markers match を bool 化。
 *   - renLeaning: 両者の「caution_vs_stimulus / novelty_vs_familiarity が正側」を bool 化。
 *   - calendarDensity: enum そのまま（null は null）。
 *   - unspokenDesires: 両者の最大 6 本だけ merge + sort（短い decision phrase 候補）。
 *   - completeness: 数値のみ。0-1 aggregated。
 */

import type {
  BundleCompleteness,
  ConversationObservation,
  ObservationBundle,
  PersonObservation,
} from "./types";

export type FatigueSignal = "none" | "some" | "strong";

export type CalendarDensity = "empty" | "light" | "medium" | "heavy";

export type CompressedTodayInput = {
  energyLevel: "high" | "mid" | "low";
  conversationArc: ConversationObservation["conversationArc"];
  caringIntensity: { a: number; b: number };
  implicitMood: string;
  fatigueSignal: FatigueSignal;
  celebrationSignal: boolean;
  renLeaning: { a: boolean; b: boolean };
  calendarDensity: { a: CalendarDensity | null; b: CalendarDensity | null };
  unspokenDesires: string[];
  completeness: BundleCompleteness;
};

const CELEBRATION_MARKERS = /(祝|記念|誕生日|特別|久しぶりに|ご褒美)/;
const FATIGUE_TOKENS = ["疲れ", "だるい", "眠い", "ヘトヘト", "無理"];

export function compressForTodayReader(
  bundle: ObservationBundle,
): CompressedTodayInput {
  const conv = bundle.conversation;

  return {
    energyLevel: conv.energyLevel,
    conversationArc: conv.conversationArc,
    caringIntensity: { a: conv.caringIntensity.a, b: conv.caringIntensity.b },
    implicitMood: conv.implicitMood.trim(),
    fatigueSignal: deriveFatigueSignal(bundle.personA, bundle.personB, conv),
    celebrationSignal: deriveCelebrationSignal(conv),
    renLeaning: {
      a: renLeaningPerson(bundle.personA),
      b: renLeaningPerson(bundle.personB),
    },
    calendarDensity: {
      a: bundle.personA.behavioral.calendarContext?.todayDensity ?? null,
      b: bundle.personB.behavioral.calendarContext?.todayDensity ?? null,
    },
    unspokenDesires: mergeUnspokenDesires(bundle.personA, bundle.personB),
    completeness: bundle.completeness,
  };
}

function deriveFatigueSignal(
  a: PersonObservation,
  b: PersonObservation,
  conv: ConversationObservation,
): FatigueSignal {
  let hits = 0;
  for (const t of conv.turns) {
    if (FATIGUE_TOKENS.some((tok) => t.body.includes(tok))) hits += 1;
  }
  const aAff = a.alter.recentEmotionalState?.dominantAffect ?? "";
  const bAff = b.alter.recentEmotionalState?.dominantAffect ?? "";
  if (aAff.includes("疲")) hits += 1;
  if (bAff.includes("疲")) hits += 1;

  if (hits === 0) return "none";
  if (hits >= 2) return "strong";
  return "some";
}

function deriveCelebrationSignal(conv: ConversationObservation): boolean {
  if (CELEBRATION_MARKERS.test(conv.implicitMood)) return true;
  for (const t of conv.turns) {
    if (CELEBRATION_MARKERS.test(t.body)) return true;
  }
  return false;
}

// γ M0-6C: todayReader.REN_AXES と同一定義。変更時は両方同期すること。
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

function mergeUnspokenDesires(
  a: PersonObservation,
  b: PersonObservation,
): string[] {
  const set = new Set<string>();
  for (const s of a.stargazer.unspokenDesires) {
    const t = s.trim();
    if (t) set.add(t);
  }
  for (const s of b.stargazer.unspokenDesires) {
    const t = s.trim();
    if (t) set.add(t);
  }
  return Array.from(set)
    .sort((x, y) => (x < y ? -1 : 1))
    .slice(0, 6);
}

// ═══════════════════════════════════════════════════════════════════════════
// 型レベル guard — 生テキスト混入を compile-time で遮断
// ═══════════════════════════════════════════════════════════════════════════

type _ForbiddenInLLMInput =
  | "userId"
  | "displayName"
  | "turns"
  | "recentNarratives"
  | "sharedHistory"
  | "rupturesAndRepairs"
  | "recentActivity"
  | "wearHistory"
  | "personalityLens";

type _Assert_NoForbidden = Extract<
  keyof CompressedTodayInput,
  _ForbiddenInLLMInput
> extends never
  ? true
  : never;

export const _COMPRESS_GUARD: _Assert_NoForbidden = true;
