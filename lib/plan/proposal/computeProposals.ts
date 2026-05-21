/**
 * Compute Proposals — Phase 3-J-6a orchestration layer。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-6 / §2 Invariants / §10 Smoke
 *
 * 役割:
 *   J-1a〜J-3 で作った全 helper を orchestrate し、
 *   (anchors + dismissEvents + now + firstUseDate) → ProposedAnchor[] を生成する pure 関数。
 *
 *   UI 接続なし (= caller が computeProposals の結果を React state に渡す予定、 J-6e で)。
 *
 * Gate stack (= 思想的に正しい順、 全 PASS でのみ proposal 出力):
 *   1. Onboarding Quietude     (Day 0-7 silent、 Idea 24)
 *   2. Theory-of-Mind Pause    (24h dismiss 3+ silent、 Idea 26)
 *   3. Sensitive 除外          (input filter、 Invariant 4)
 *   4. Signal extraction       (pattern_repeat MVP)
 *   5. Dismiss filter          (7 日 cross-day memory、 Invariant 14)
 *   6. Reversibility gate      (score >= 50、 Invariant 23)
 *   7. Self-Contradiction      (反復 vs 直近乖離 → intentional_break_observed)
 *   8. Entropy Budget          (max 3pt/day、 single=1pt、 phase limit)
 *   9. Compliance check        (assertProposalCompliance 5 性質、 Invariant 37)
 *
 * MVP 制限 (= J-6a 範囲):
 *   - signal は pattern_repeat (= 直近 4 週 同 feature 3+ 反復) のみ
 *   - lived_geography_centroid は anchor resolutions 必要 (= J-6d 領域)
 *   - day_pattern (= 予定なし日の同曜日 history match) は別 commit
 *   - unconfirmed_place_hint は UPDATE 性質 → Phase 3.5 預け
 *
 * 不変原則:
 *   - LLM 不使用 (= Invariant 12、 全 table + 統計)
 *   - 副作用なし (= pure、 storage read は caller 経由)
 *   - input mutate なし
 *   - sensitive 完全除外
 *   - Past-Self Voice 内文体 (= copy template 経由)
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";

import { inferAnchorVerb, type AnchorVerb } from "../dayGraph/anchorVerbMap";
import {
  countRecentDismisses,
  wasRecentlyDismissed,
  type DismissLogEntry,
} from "./dismissLog";
import {
  canConsumeBudget,
  consumeBudget,
  initEntropyBudgetState,
} from "./entropyBudget";
import {
  classifyOnboardingPhase,
  dailyProposalLimitForPhase,
  isProposalAllowed,
} from "./onboardingQuietude";
import { type ProposalDirection } from "./proposalDirection";
import {
  PROPOSAL_INTEGRITY_CONTRACT,
  assertProposalCompliance,
} from "./proposalIntegrityContract";
import type {
  ProposalConfidence,
  ProposedAnchor,
} from "./proposalTypes";
import {
  computeReversibilityScore,
  meetsPhase3JReversibilityThreshold,
} from "./reversibilityMap";
import { detectSelfContradiction } from "./selfContradictionDetector";
import type { TestOverrideContext } from "./testOverrideContext";
import { inferUserStatePause } from "./userStateInference";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PAST_WINDOW_DAYS = 28; // 直近 4 週
const RECENT_WINDOW_DAYS = 14; // 直近 2 週 (= contradiction 判定用)
const MIN_REPETITION_DEFAULT = 3;
const CONFIDENT_REPETITION_THRESHOLD = 5;
const MS_PER_DAY = 86400000;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input / Output types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ComputeProposalsInput {
  /** 全 anchors (= sensitive を含む、 内部で除外) */
  readonly anchors: ReadonlyArray<ExternalAnchor>;
  /** 現在時刻 (= ISO 8601) */
  readonly now: string;
  /** 利用開始日 (= ISO 8601) */
  readonly firstUseDate: string;
  /** dismiss log (= 7 日 retention 想定、 caller が fetch) */
  readonly dismissEvents: ReadonlyArray<DismissLogEntry>;
  /** test override (= production undefined) */
  readonly testOverride?: TestOverrideContext;
}

export type ComputeProposalsSilenceReason =
  | "onboarding_quietude"
  | "theory_of_mind_pause"
  | "no_signals"
  | "budget_exhausted";

export interface ComputeProposalsResult {
  /** 通過した proposal 群 (= 0 件もありうる) */
  readonly proposals: ReadonlyArray<ProposedAnchor>;
  /**
   * 全 silent の理由 (= debug 用、 UI 非可視)。
   * proposals が 1 件以上ある時は undefined。
   */
  readonly silenceReason?: ComputeProposalsSilenceReason;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Small utilities (= 内部のみ、 export しない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** "HH:MM" or "HH:MM:SS" から hour (= 0-23) を抽出。 不正なら null。 */
function parseHourFromStartTime(startTime?: string): number | null {
  if (typeof startTime !== "string") return null;
  const m = startTime.match(/^(\d{1,2}):/);
  if (!m) return null;
  const h = parseInt(m[1]!, 10);
  if (isNaN(h) || h < 0 || h > 23) return null;
  return h;
}

/** ISO 8601 string から Date を作成。 不正なら null。 */
function safeParseDate(iso: string): Date | null {
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  return new Date(t);
}

/** Date を "YYYY-MM-DD" (= UTC) で format。 */
function formatYMD(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pattern repetition signal extraction (= MVP signal)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface RepeatGroup {
  readonly key: string;
  readonly hour: number;
  readonly verb: AnchorVerb;
  readonly anchors: ReadonlyArray<ExternalAnchor>;
  readonly representative: ExternalAnchor;
}

/**
 * 同曜日 + 同時刻 (= hour 単位) + 同 verb で group 化。
 * one_off anchors のみ対象 (= MVP)、 recurring は別 commit で対応。
 */
function groupPastAnchorsByFeature(
  anchors: ReadonlyArray<ExternalAnchor>,
  now: Date,
): ReadonlyArray<RepeatGroup> {
  const nowMs = now.getTime();
  // cutoff は **日単位** で揃える (= "28 日前の calendar day を含む" 意味で日 boundary 計算)。
  // 例: now=2026-05-22 12:00 UTC、 28 日前 calendar day = 2026-04-24、 cutoff = 2026-04-24 00:00 UTC
  const cutoffRaw = new Date(nowMs - PAST_WINDOW_DAYS * MS_PER_DAY);
  const cutoffMs = Date.UTC(
    cutoffRaw.getUTCFullYear(),
    cutoffRaw.getUTCMonth(),
    cutoffRaw.getUTCDate(),
  );
  const todayWd = now.getUTCDay();

  // 1. 同曜日 past anchor を抽出 (= one_off only)
  const sameWeekday: Array<{ anchor: ExternalAnchor; date: Date }> = [];
  for (const a of anchors) {
    if (a.anchorKind !== "one_off") continue;
    const d = safeParseDate(a.date);
    if (!d) continue;
    const ms = d.getTime();
    if (ms > nowMs) continue; // 未来除外
    if (ms < cutoffMs) continue; // 4 週超除外
    if (d.getUTCDay() !== todayWd) continue;
    sameWeekday.push({ anchor: a, date: d });
  }

  // 2. (hour, verb) で group 化
  const map = new Map<string, Array<{ anchor: ExternalAnchor; date: Date }>>();
  for (const entry of sameWeekday) {
    const hour = parseHourFromStartTime(entry.anchor.startTime);
    if (hour == null) continue;
    const verb = inferAnchorVerb({
      title: entry.anchor.title,
      locationText: entry.anchor.locationText,
    });
    const key = `${hour}|${verb}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(entry);
  }

  // 3. group → RepeatGroup 構造化 (= 最新 anchor を representative)
  const result: RepeatGroup[] = [];
  for (const [key, entries] of map.entries()) {
    if (entries.length === 0) continue;
    const sortedDesc = [...entries].sort((a, b) => b.date.getTime() - a.date.getTime());
    const rep = sortedDesc[0]!.anchor;
    const [hourStr, verb] = key.split("|");
    result.push({
      key,
      hour: parseInt(hourStr!, 10),
      verb: verb as AnchorVerb,
      anchors: sortedDesc.map((e) => e.anchor),
      representative: rep,
    });
  }
  return result;
}

/**
 * group の重複回数 / 直近 2 週乖離 から direction を分類。
 *
 * 判定:
 *   - 直近 2 週内 anchor 0 + 過去 (= 2-4 週前) >= 2 + contradiction detector PASS
 *     → intentional_break_observed (= 観測文化)
 *   - 直近 2 週内 anchor 0 + total >= 3 → recover_pattern
 *   - その他 → continue_pattern
 */
function classifyDirection(
  group: RepeatGroup,
  now: Date,
): ProposalDirection {
  const nowMs = now.getTime();
  const recentCutoff = nowMs - RECENT_WINDOW_DAYS * MS_PER_DAY;

  let inRecent = 0;
  for (const a of group.anchors) {
    if (a.anchorKind !== "one_off") continue;
    const d = safeParseDate(a.date);
    if (!d) continue;
    if (d.getTime() >= recentCutoff) inRecent += 1;
  }
  const total = group.anchors.length;
  const inOlder = total - inRecent;

  if (inRecent === 0 && inOlder >= 2) {
    const contradiction = detectSelfContradiction({
      pastRepetitionCount: inOlder,
      recentDeviationCount: 2,
      featureLabel: group.representative.title,
    });
    if (contradiction.hasContradiction) return "intentional_break_observed";
  }
  if (inRecent === 0 && total >= MIN_REPETITION_DEFAULT) {
    return "recover_pattern";
  }
  return "continue_pattern";
}

/**
 * RepeatGroup → ProposedAnchor 変換。
 *
 * - id: `proposal_${todayYMD}_${groupKey}` (= 同日 同 feature で uniqueness 保証)
 * - direction: classifyDirection
 * - confidence: count >= 5 → high、 else medium
 * - draft: representative anchor から title / startTime / endTime / locationText 等を継承、
 *          today date、 rigidity="soft"、 anchorKind="one_off"
 * - sensitive は **絶対に draft に含めない** (= 上流 filter で除外済を再保証)
 */
function groupToProposal(
  group: RepeatGroup,
  now: Date,
  nowIso: string,
): ProposedAnchor {
  const todayYMD = formatYMD(now);
  const direction = classifyDirection(group, now);
  const rep = group.representative;
  const repetitionCount = group.anchors.length;
  const confidence: ProposalConfidence =
    repetitionCount >= CONFIDENT_REPETITION_THRESHOLD ? "high" : "medium";

  return {
    id: `proposal_${todayYMD}_${group.key}`,
    reason: "pattern_repeat",
    direction,
    confidence,
    draft: {
      title: rep.title,
      startTime: rep.startTime,
      endTime: rep.endTime,
      rigidity: "soft",
      locationText: rep.locationText,
      locationCategory: rep.locationCategory,
      anchorKind: "one_off",
      date: todayYMD,
      // sensitive は意図的に含めない (= Invariant 4 + ProposalIntegrityContract)
    },
    source: {
      signalType: "pattern_repeat",
      evidenceCount: repetitionCount,
      generatedAt: nowIso,
    },
    createdAt: nowIso,
  };
}

/**
 * Pattern repeat signal の core 抽出。
 *
 * - sensitive 除外済 anchor を受け取る (= caller 責任)
 * - 直近 4 週同曜日 同時刻 同 verb で 3+ 反復 (= testOverride で threshold override 可) → proposal
 * - direction は Self-Contradiction Detector で内部分類
 */
function extractPatternRepeatProposals(
  anchors: ReadonlyArray<ExternalAnchor>,
  now: Date,
  nowIso: string,
  testOverride?: TestOverrideContext,
): ProposedAnchor[] {
  const minRepetition = testOverride?.forceRepetitionThreshold ?? MIN_REPETITION_DEFAULT;
  const groups = groupPastAnchorsByFeature(anchors, now);
  const proposals: ProposedAnchor[] = [];
  for (const group of groups) {
    if (group.anchors.length < minRepetition) continue;
    proposals.push(groupToProposal(group, now, nowIso));
  }
  return proposals;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main orchestration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全 gate を通った proposal を返す。
 *
 * Gate stack:
 *   1. Onboarding Quietude
 *   2. Theory-of-Mind Pause
 *   3. Sensitive 除外
 *   4. Signal extraction (pattern_repeat)
 *   5. Dismiss filter
 *   6. Reversibility gate
 *   7. (Self-Contradiction direction は extraction 内で処理)
 *   8. Entropy Budget consumption + phase limit
 *   9. Compliance check (assertProposalCompliance)
 */
export function computeProposals(input: ComputeProposalsInput): ComputeProposalsResult {
  // 1. Onboarding Quietude gate
  const onboardingPhase = classifyOnboardingPhase({
    firstUseDate: input.firstUseDate,
    now: input.now,
    testOverride: input.testOverride,
  });
  if (!isProposalAllowed(onboardingPhase)) {
    return { proposals: [], silenceReason: "onboarding_quietude" };
  }

  // 2. Theory-of-Mind Pause gate
  const userState = inferUserStatePause({
    dismissEvents: input.dismissEvents,
    now: input.now,
    testOverride: input.testOverride,
  });
  if (userState.isPaused) {
    return { proposals: [], silenceReason: "theory_of_mind_pause" };
  }

  // 3. Sensitive 除外 (= input filter、 Invariant 4)
  const safeAnchors = input.anchors.filter((a) => !a.sensitiveCategory);

  // now を一度だけ Date 化
  const nowDate = safeParseDate(input.now);
  if (!nowDate) {
    // 不正 now → silent (= defensive)
    return { proposals: [], silenceReason: "no_signals" };
  }

  // 4. Signal extraction
  const candidates = extractPatternRepeatProposals(
    safeAnchors,
    nowDate,
    input.now,
    input.testOverride,
  );

  if (candidates.length === 0) {
    return { proposals: [], silenceReason: "no_signals" };
  }

  // 5. Dismiss filter (= 7 日 retention 内に既 dismiss なら suppress)
  const notRecentlyDismissed = candidates.filter(
    (p) => !wasRecentlyDismissed(input.dismissEvents, p.id, input.now),
  );

  // 6. Reversibility gate (= score >= 50)
  const safeProposals = notRecentlyDismissed.filter((p) => {
    const score = computeReversibilityScore({
      title: p.draft.title,
      locationText: p.draft.locationText,
      locationCategory: p.draft.locationCategory,
      sensitiveCategory: p.draft.sensitiveCategory,
    });
    return meetsPhase3JReversibilityThreshold(score, input.testOverride);
  });

  if (safeProposals.length === 0) {
    return { proposals: [], silenceReason: "no_signals" };
  }

  // sort by confidence desc、 同点なら evidenceCount desc
  const sorted = [...safeProposals].sort((a, b) => {
    const aConfRank = a.confidence === "high" ? 2 : 1;
    const bConfRank = b.confidence === "high" ? 2 : 1;
    if (aConfRank !== bConfRank) return bConfRank - aConfRank;
    return b.source.evidenceCount - a.source.evidenceCount;
  });

  // 7. Entropy Budget consumption (= max 3pt/day) + phase limit
  const recentDismissCount = countRecentDismisses(input.dismissEvents, input.now);
  let budget = initEntropyBudgetState({
    recentDismissCount,
    testOverride: input.testOverride,
  });
  const phaseLimit = dailyProposalLimitForPhase(onboardingPhase);
  const accepted: ProposedAnchor[] = [];

  for (const p of sorted) {
    if (accepted.length >= phaseLimit) break;
    if (!canConsumeBudget(budget, "single")) break;

    // 8. Compliance check (= 最終 type lock)
    try {
      assertProposalCompliance(p, PROPOSAL_INTEGRITY_CONTRACT);
    } catch {
      continue; // skip invalid (= silent、 Invariant 39)
    }

    accepted.push(p);
    budget = consumeBudget(budget, "single");
  }

  if (accepted.length === 0) {
    return { proposals: [], silenceReason: "budget_exhausted" };
  }

  return { proposals: accepted };
}
