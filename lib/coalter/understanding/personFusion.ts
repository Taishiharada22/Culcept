/**
 * CoAlter Stage 1 Understand — PersonFusion
 *
 * PersonObservation → PersonalLens の rule-based 決定論 fusion。
 *
 * [CEO lock 2026-04-20 M0-2 #1] 完全決定論:
 *   - Math.random / new Date / 暗黙の外部状態参照なし。
 *   - 同じ PersonObservation なら必ず同じ PersonalLens を返す。
 * [CEO lock 2026-04-20 M0-2 #2] 欠損時は degrade:
 *   - 観測が薄い箇所は補完しない。空なら空配列 / "" を返す。
 *   - 責任は dataGaps / understanding_confidence に逃がす。
 * [CEO lock 2026-04-20 M0-2 #3] coreDecisionPrinciples:
 *   - 3〜5 本、短い原理フレーズ、ドメイン非依存（movie/food/travel で共通）。
 *
 * M0-2 scope: LLM なし、rule-based のみ、既存 runtime 未接続、shadow 限定。
 */

import type {
  AlterObservation,
  AlterSourceRef,
  BehavioralObservation,
  BehavioralSourceRef,
  DecisionAxis,
  PersonalLens,
  PersonalLensSources,
  PersonObservation,
  StargazerObservation,
  StargazerSourceRef,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Axis → 原理フレーズ対応表（ドメイン非独立）
//    このテーブルにない軸は phrase を生成しない（== 捏造しない）。
// ═══════════════════════════════════════════════════════════════════════════

type PrinciplePhrasePair = {
  /** axis.value >= +threshold のときに出すフレーズ */
  positive: string;
  /** axis.value <= -threshold のときに出すフレーズ */
  negative: string;
};

/**
 * 対応表。**短い原理フレーズ**（14〜22 字目安）で、どのドメインでも引用可能。
 * - 「映画」「店」「食事」等のドメイン名詞を含めないこと。
 * - 行動指示ではなく傾向の記述であること。
 */
const AXIS_PRINCIPLE_MAP: Record<string, PrinciplePhrasePair> = {
  caution_vs_stimulus: {
    positive: "刺激に身を置くと力が出る",
    negative: "整った場で先に安心を確保する",
  },
  novelty_vs_familiarity: {
    positive: "未知を試すことで満ちる",
    negative: "馴染んだ場所で深く息をつく",
  },
  speed_vs_precision: {
    positive: "勢いで踏み出すほうがうまくいく",
    negative: "確かさを握ってから動く",
  },
  solo_vs_social: {
    positive: "人と居るときに輪郭が立つ",
    negative: "一人の時間で形が整う",
  },
  plan_vs_emergence: {
    positive: "流れに預けると開ける",
    negative: "段取りが見えると動き出せる",
  },
  intellect_vs_emotion: {
    positive: "理屈で筋を通すと落ち着く",
    negative: "感情の流れで判断する",
  },
  intensity_vs_calm: {
    positive: "濃度の高い瞬間で生きる",
    negative: "落ち着いた密度で続く",
  },
  expansion_vs_depth: {
    positive: "広げて試すほうが腑に落ちる",
    negative: "ひとつを深めると腹に落ちる",
  },
  risk_vs_safety: {
    positive: "未回収の余地を残したい",
    negative: "先に退路を確保したい",
  },
  openness_vs_boundary: {
    positive: "開いて混ざるほうが楽",
    negative: "線引きを保つほうが楽",
  },
};

/** どの axis でも confidence がこれ未満なら原理として引用しない。 */
const AXIS_CONFIDENCE_FLOOR = 0.4;
/** axis.value の絶対値がこれ未満なら中立扱い、原理として引用しない。 */
const AXIS_VALUE_FLOOR = 0.35;
/** 最終的に返す原理フレーズの最大本数。CEO lock #3: 3〜5 本。 */
const MAX_PRINCIPLES = 5;
const MIN_PRINCIPLES_TARGET = 3;

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API
// ═══════════════════════════════════════════════════════════════════════════

export function fusePersonalLens(person: PersonObservation): PersonalLens {
  const coreDecisionPrinciples = derivePrinciples(person.stargazer);
  const currentEmotionalHue = deriveEmotionalHue(person.alter);
  const todaySensitivities = deriveSensitivities(person.stargazer, person.alter);
  const comfortPathways = deriveComfortPathways(person.stargazer);
  const sourcedFrom = collectSources(person);

  return {
    userId: person.identity.userId,
    displayName: person.identity.displayName,
    coreDecisionPrinciples,
    currentEmotionalHue,
    todaySensitivities,
    comfortPathways,
    sourcedFrom,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Derivers（各 rule-based、完全決定論）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stargazer の decisionAxes から 3〜5 本の短い原理フレーズを選ぶ。
 *
 * アルゴリズム（完全決定論）:
 *   1. AXIS_PRINCIPLE_MAP にある軸だけを対象。未登録軸は捏造しない。
 *   2. confidence >= AXIS_CONFIDENCE_FLOOR かつ |value| >= AXIS_VALUE_FLOOR で絞り込み。
 *   3. key ベースで 昇順 tie-break → (confidence * |value|) 降順で sort。
 *   4. 先頭 MAX_PRINCIPLES 本まで採用。0 本なら空配列（degrade）。
 */
function derivePrinciples(stargazer: StargazerObservation): string[] {
  const candidates: Array<{ axis: DecisionAxis; score: number; phrase: string }> = [];

  for (const axis of stargazer.decisionAxes) {
    const mapping = AXIS_PRINCIPLE_MAP[axis.key];
    if (!mapping) continue;
    if (axis.confidence < AXIS_CONFIDENCE_FLOOR) continue;
    if (Math.abs(axis.value) < AXIS_VALUE_FLOOR) continue;
    const phrase = axis.value > 0 ? mapping.positive : mapping.negative;
    const score = axis.confidence * Math.abs(axis.value);
    candidates.push({ axis, score, phrase });
  }

  // 決定論 sort: score 降順、同点は axis.key 昇順。
  candidates.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    return x.axis.key < y.axis.key ? -1 : 1;
  });

  const picked = candidates.slice(0, MAX_PRINCIPLES).map((c) => c.phrase);
  // MIN_PRINCIPLES_TARGET を下回っても 「それっぽく埋めない」（lock #2）。
  return picked;
}

function deriveEmotionalHue(alter: AlterObservation): string {
  // Alter が観測できていないなら空。補完しない。
  const hue = alter.recentEmotionalState?.dominantAffect;
  if (!hue) return "";
  return hue;
}

function deriveSensitivities(
  stargazer: StargazerObservation,
  alter: AlterObservation,
): string[] {
  // 「今日 気をつける対象」: 疲労トリガ + Alter の breaking 相当。
  // 文字列ソース内容はそのまま採用（捏造しない）。
  const set = new Set<string>();

  for (const s of stargazer.fatigueTriggers) {
    const t = s.trim();
    if (t) set.add(t);
  }
  for (const s of stargazer.breakingConditions) {
    const t = s.trim();
    if (t) set.add(t);
  }
  // Alter narrative は直接は入れない（生テキスト経路の迂回を避ける）。
  // narrative は emotionalHue と sourcedFrom 経由で Stage 2 に渡る。
  void alter;

  // 決定論 sort（挿入順依存を避ける）: 文字列昇順。
  return Array.from(set).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}

function deriveComfortPathways(stargazer: StargazerObservation): string[] {
  // 「今日 近づける状態」: comfort sources + recovery conditions。
  const set = new Set<string>();
  for (const s of stargazer.comfortSources) {
    const t = s.trim();
    if (t) set.add(t);
  }
  for (const s of stargazer.recoveryConditions) {
    const t = s.trim();
    if (t) set.add(t);
  }
  return Array.from(set).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Source refs（sourcedFrom）
// ═══════════════════════════════════════════════════════════════════════════

function collectSources(person: PersonObservation): PersonalLensSources {
  return {
    stargazer: collectStargazerSources(person.stargazer),
    alter: collectAlterSources(person.alter),
    behavioral: collectBehavioralSources(person.behavioral),
  };
}

function collectStargazerSources(stargazer: StargazerObservation): StargazerSourceRef[] {
  // AXIS_PRINCIPLE_MAP にある軸かつ原理として引用可能なもののみ refs に残す。
  const refs: StargazerSourceRef[] = [];
  for (const axis of stargazer.decisionAxes) {
    if (!AXIS_PRINCIPLE_MAP[axis.key]) continue;
    if (axis.confidence < AXIS_CONFIDENCE_FLOOR) continue;
    if (Math.abs(axis.value) < AXIS_VALUE_FLOOR) continue;
    refs.push({
      axisKey: axis.key,
      axisValue: axis.value,
      observedAt: axis.observedAt,
      // quote は collector 側で埋める（質問カタログ経由）。M0-2 では null。
      quote: null,
    });
  }
  // 決定論 sort: axisKey 昇順。
  refs.sort((x, y) => (x.axisKey < y.axisKey ? -1 : 1));
  return refs;
}

function collectAlterSources(alter: AlterObservation): AlterSourceRef[] {
  const refs: AlterSourceRef[] = [];
  if (alter.personalityLens) {
    // lensesByKey の各キーを AlterSourceRef として登録。
    // summary は narration 内部専用（lock A）。
    const entries = Object.entries(alter.personalityLens.lensesByKey);
    entries.sort((x, y) => (x[0] < y[0] ? -1 : 1)); // 決定論
    for (const [lensKey, summary] of entries) {
      refs.push({
        lensKey,
        summary,
        observedAt: alter.personalityLens.lastUpdated,
      });
    }
  }
  return refs;
}

function collectBehavioralSources(
  behavioral: BehavioralObservation,
): BehavioralSourceRef[] {
  const refs: BehavioralSourceRef[] = [];
  for (const act of behavioral.recentActivity) {
    // kind を enum に正規化できるものだけ採用。不明 kind は捏造しない。
    const kind = normalizeActivityKind(act.kind);
    if (!kind) continue;
    refs.push({
      kind,
      summary: act.summary,
      observedAt: act.occurredAt,
    });
  }
  for (const wear of behavioral.wearHistory) {
    refs.push({
      kind: "wear_event",
      summary: `${wear.moodTag ?? ""}/${wear.outfitTag ?? ""}`.replace(/^\/$/, ""),
      observedAt: wear.date,
    });
  }
  // 決定論 sort: observedAt 降順、同時刻は kind 昇順。
  refs.sort((x, y) => {
    if (x.observedAt !== y.observedAt) return x.observedAt < y.observedAt ? 1 : -1;
    return x.kind < y.kind ? -1 : 1;
  });
  return refs;
}

function normalizeActivityKind(
  raw: string,
): "origin_diary" | "calendar" | "wear_event" | null {
  if (raw === "origin_diary" || raw === "mood_note" || raw === "diary") return "origin_diary";
  if (raw === "calendar" || raw === "calendar_event") return "calendar";
  if (raw === "wear_event" || raw === "outfit") return "wear_event";
  return null;
}
