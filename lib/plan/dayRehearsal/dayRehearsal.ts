/**
 * lib/plan/dayRehearsal/dayRehearsal.ts — Wave 2 Day Rehearsal pure engine + adapter
 *
 * rehearseDay: 正規化入力を前から走らせ、6 計算（成立/friction/buffer/strain/recovery/convergence）を
 *   仮説 estimate + evidence trace 付きで返す。★最適化でなく simulation・予定を動かさない・修正案を作らない。
 * buildRehearsalInput: 既存 DayGraph + feasibility(slack) + TransportSegment から正規化入力を構築（join）。
 *
 * 不変: pure / READ のみ / Date 不使用（時刻は "HH:MM" を分に変換）/ unknown は unknown（捏造しない）。
 */
import type { DayFeasibilityResult, FeasibilitySlackView, SlackStatus } from "@/lib/plan/feasibility/feasibilityTypes";
import type { FeasibilityDisplayView } from "@/lib/plan/feasibility/feasibilityDisplayFormatter";
import type { TransportSegment, TransportMode } from "@/lib/alter-morning/transport/types";
import type { DayGraph, EventNode } from "@/lib/plan/dayGraph/dayGraphTypes";
import {
  DEFAULT_REHEARSAL_CONFIG,
  type ConvergenceEstimate,
  type ConvergenceFactor,
  type DayRehearsal,
  type DayRehearsalConfig,
  type Estimate,
  type EstimateLevel,
  type Evidence,
  type RehearsalCoverage,
  type RehearsalInput,
  type RehearsalStep,
  type RehearsalStepResult,
  type RehearsalTransitionInput,
  type ViabilityEstimate,
} from "./dayRehearsalTypes";

// ───────────────────────── helpers ─────────────────────────

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

function levelOf(score: number, c: DayRehearsalConfig): EstimateLevel {
  if (score < c.levelThresholds.lowMax) return "low";
  if (score < c.levelThresholds.highMin) return "moderate";
  return "high";
}

/** "HH:MM" → 分。失敗は null（Date 不使用・捏造しない）。 */
function hhmmToMin(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

const EMPTY_EVIDENCE: Evidence = { basis: [], known: [], unknown: [], inferred: [] };

// ───────────────────────── 個別計算（純粋・evidence 付き） ─────────────────────────

/** strain budget（level 判定・viability の分母）。energyLevel 低 → budget 低（仮説）。 */
function strainBudget(input: RehearsalInput, c: DayRehearsalConfig): number {
  const e = input.baseEnergyLevel;
  if (e == null) return c.baseBudget;
  return c.baseBudget * (1 - c.energyBudgetWeight * (1 - clamp(e, 0, 1)) * 0.5);
}

/** event 単体の strain（仮説・密度/時間帯/duration から）。 */
function eventStrain(event: RehearsalInput["steps"][number]["event"], density: RehearsalInput["density"], c: DayRehearsalConfig): { score: number; evidence: Evidence } {
  const hours = event.durationMin / 60;
  let score = c.eventStrain.perHour * hours;
  const basis: string[] = [`duration ${event.durationMin}min`];
  const known: string[] = [];
  const unknown: string[] = [];
  const inferred: string[] = ["strain from duration (hypothesis)"];
  if (event.durationAssumed) unknown.push("event duration assumed (not user-confirmed)");
  else known.push("explicit event duration");
  if (event.timeBucket === "evening" || event.timeBucket === "night" || event.timeBucket === "late_night") {
    score += c.eventStrain.eveningBump;
    basis.push(`late time (${event.timeBucket})`);
    inferred.push("late-hour strain (hypothesis)");
  }
  if (density === "packed") {
    score += c.eventStrain.packedBump;
    basis.push("packed day density");
    inferred.push("density strain (hypothesis)");
  }
  return { score, evidence: { basis, known, unknown, inferred } };
}

/** 移動の friction（仮説）+ F に積む travelStrain。 */
function transitionFriction(t: RehearsalTransitionInput, c: DayRehearsalConfig): { friction: Estimate; travelStrain: number } {
  const basis: string[] = [`mode ${t.mode}`];
  const known: string[] = [];
  const unknown: string[] = [];
  const inferred: string[] = ["friction from travel/mode (hypothesis)"];
  let travelStrain = c.travelStrain.byMode[t.mode];
  if (t.mode === "unknown") inferred.push("mode unknown → neutral");
  if (t.travelMin == null) {
    travelStrain += c.travelStrain.unknownPenalty;
    unknown.push("travel duration unknown"); // 捏造しない
  } else {
    travelStrain += c.travelStrain.per30Min * (t.travelMin / 30);
    basis.push(`travel ${t.travelMin}min`);
    if (t.travelKnown) known.push("measured/explicit travel duration");
    else inferred.push("heuristic travel duration");
  }
  let frictionScore = travelStrain;
  if (t.bufferStatus === "insufficient" && t.shortfallMin != null) {
    frictionScore += c.friction.shortfallPer30Min * (t.shortfallMin / 30);
    basis.push(`shortfall ${t.shortfallMin}min`);
    known.push("feasibility shortfall");
  }
  return {
    friction: { level: levelOf(frictionScore, c), score: frictionScore, evidence: { basis, known, unknown, inferred } },
    travelStrain,
  };
}

/** gap の recovery（仮説・余白の余りから）。 */
function transitionRecovery(t: RehearsalTransitionInput, c: DayRehearsalConfig): Estimate {
  const basis: string[] = [];
  const known: string[] = [];
  const unknown: string[] = [];
  const inferred: string[] = ["recovery from slack (hypothesis)"];
  let score = 0;
  if (t.bufferStatus === "sufficient" && t.slackMin != null) {
    const usable = Math.min(t.slackMin, c.recovery.capMin);
    score = c.recovery.per30MinSlack * (usable / 30);
    basis.push(`slack ${t.slackMin}min`);
    known.push("feasibility slack");
  } else if (t.bufferStatus === "insufficient") {
    basis.push("no slack (insufficient)");
    known.push("feasibility insufficient");
  } else {
    unknown.push("buffer not_applicable"); // slack 不明 → recovery 不明
  }
  return { level: levelOf(score, c), score, evidence: { basis, known, unknown, inferred } };
}

/** convergence（「risk」相当・確率でなく重なりの仮説）。 */
function convergence(bufferStatus: SlackStatus, strainLevel: EstimateLevel, frictionLevel: EstimateLevel): ConvergenceEstimate {
  const factors: ConvergenceFactor[] = [];
  const known: string[] = [];
  const inferred: string[] = [];
  if (bufferStatus === "insufficient") {
    factors.push("buffer_short");
    known.push("feasibility insufficient");
  }
  if (strainLevel === "high") {
    factors.push("strain_high");
    inferred.push("cumulative strain high (hypothesis)");
  }
  if (frictionLevel === "high") {
    factors.push("friction_high");
    inferred.push("friction high (hypothesis)");
  }
  const level: EstimateLevel = factors.length >= 2 ? "high" : factors.length === 1 ? "moderate" : "low";
  const basis = factors.length > 0 ? factors.map((f) => f) : ["no convergence"];
  return { level, factors, evidence: { basis, known, unknown: [], inferred } };
}

// ───────────────────────── engine ─────────────────────────

/**
 * 1日を先に試す forward simulation（純粋）。★全推定は仮説 + evidence trace 付き。
 */
export function rehearseDay(input: RehearsalInput, config: DayRehearsalConfig = DEFAULT_REHEARSAL_CONFIG): DayRehearsal {
  const budget = strainBudget(input, config);
  const steps: RehearsalStepResult[] = [];
  const recoveryWindows: number[] = [];
  const convergencePoints: number[] = [];
  let F = 0; // 累積 strain
  let peakScore = 0;
  let peakEvidence: Evidence = EMPTY_EVIDENCE;
  let transitionsTotal = 0;
  let travelKnown = 0;
  let travelUnknown = 0;
  let eventsAssumed = 0;
  let firstBreakIdx: number | null = null;
  let anyInsufficient = false;
  let hasBufferSignal = false; // not_applicable 以外の buffer が 1 つでもあるか（travel unknown でも outlook 可）

  input.steps.forEach((step: RehearsalStep, i: number) => {
    if (step.event.durationAssumed) eventsAssumed += 1;
    // event strain を積む
    const es = eventStrain(step.event, input.density, config);
    F = clamp(F + es.score, 0, Number.POSITIVE_INFINITY);
    const strainRatio = budget > 0 ? F / budget : F;
    const strainLevel = levelOf(strainRatio, config);
    const cumulativeStrain: Estimate = {
      level: strainLevel,
      score: F,
      evidence: {
        basis: [`cumulative after step ${i}`, ...es.evidence.basis],
        known: es.evidence.known,
        unknown: es.evidence.unknown,
        inferred: ["cumulative strain (hypothesis)", ...es.evidence.inferred],
      },
    };
    if (F > peakScore) {
      peakScore = F;
      peakEvidence = cumulativeStrain.evidence;
    }

    const t = step.transitionAfter;
    let friction: Estimate | null = null;
    let recovery: Estimate | null = null;
    let conv: ConvergenceEstimate | null = null;
    let bufferStatus: SlackStatus = "not_applicable";
    let bufferMin: number | null = null;

    if (t) {
      transitionsTotal += 1;
      if (t.travelMin != null && t.travelKnown) travelKnown += 1;
      if (t.travelMin == null) travelUnknown += 1;
      bufferStatus = t.bufferStatus;
      if (t.bufferStatus !== "not_applicable") hasBufferSignal = true;
      bufferMin = t.bufferStatus === "sufficient" ? (t.slackMin ?? null) : t.bufferStatus === "insufficient" ? (t.shortfallMin != null ? -t.shortfallMin : null) : null;
      if (t.bufferStatus === "insufficient") anyInsufficient = true;

      const ff = transitionFriction(t, config);
      friction = ff.friction;
      recovery = transitionRecovery(t, config);
      // F 更新: travel 積む → recovery 引く（削除でなく緩和・clamp ≥0）
      F = clamp(F + ff.travelStrain - recovery.score, 0, Number.POSITIVE_INFINITY);
      if (recovery.level !== "low") recoveryWindows.push(i);

      const convStrainLevel = levelOf(budget > 0 ? F / budget : F, config);
      conv = convergence(t.bufferStatus, convStrainLevel, friction.level);
      if (conv.level === "high") {
        convergencePoints.push(i);
        if (firstBreakIdx == null) firstBreakIdx = i;
      }
    }

    steps.push({ stepIndex: i, eventId: step.event.id, cumulativeStrain, friction, bufferStatus, bufferMin, recovery, convergence: conv });
  });

  const peakStrain: Estimate = { level: levelOf(budget > 0 ? peakScore / budget : peakScore, config), score: peakScore, evidence: peakEvidence };
  const coverage: RehearsalCoverage = { transitionsTotal, travelKnown, travelUnknown, eventsAssumedDuration: eventsAssumed };
  const viability = computeViability(input, anyInsufficient, peakStrain.level, firstBreakIdx, coverage, hasBufferSignal);

  return { date: input.date, viability, steps, peakStrain, recoveryWindows, convergencePoints, coverage };
}

/** 1日成立（仮説）。時間(feasibility insufficient) と 状態(peak strain) の両面。 */
function computeViability(
  input: RehearsalInput,
  anyInsufficient: boolean,
  peakStrainLevel: EstimateLevel,
  firstBreakIdx: number | null,
  coverage: RehearsalCoverage,
  hasBufferSignal: boolean,
): ViabilityEstimate {
  const known: string[] = [];
  const unknown: string[] = [];
  const inferred: string[] = [];
  const basis: string[] = [];
  // 入力不足: step 0 / (transition あるが buffer signal も travel signal も無い) → unknown（過剰主張しない）
  // ★buffer signal（feasibility status）があれば travel unknown でも outlook を出す（Option D: status-only）。
  if (input.steps.length === 0 || (coverage.transitionsTotal > 0 && !hasBufferSignal && coverage.travelKnown === 0)) {
    if (coverage.transitionsTotal > 0) unknown.push("no feasibility or travel signal");
    if (input.steps.length === 0) unknown.push("no steps");
    return { outlook: "unknown", breaksAtStepIndex: null, evidence: { basis: ["insufficient input"], known, unknown, inferred } };
  }
  const strainHigh = peakStrainLevel === "high";
  if (anyInsufficient) {
    known.push("feasibility insufficient present");
    basis.push("time shortfall");
  }
  if (strainHigh) {
    inferred.push("peak strain high (hypothesis)");
    basis.push("state strain");
  }
  let outlook: ViabilityEstimate["outlook"];
  if (anyInsufficient && strainHigh) outlook = "breaks";
  else if (anyInsufficient || strainHigh) outlook = "tight";
  else {
    outlook = "holds";
    basis.push("buffers sufficient, strain within budget");
  }
  return { outlook, breaksAtStepIndex: outlook === "breaks" ? firstBreakIdx : null, evidence: { basis, known, unknown, inferred } };
}

// ───────────────────────── adapter（既存 building blocks → 正規化入力） ─────────────────────────

function isKnownDuration(src: TransportSegment["durationSource"]): boolean {
  return src === "routes_api" || src === "explicit_user" || src === "user_override";
}

/**
 * DayGraph + feasibility(slack) + TransportSegment から RehearsalInput を構築（純粋・join）。
 * - events = nodes(kind==="event") 時系列順。transition i = i 番目の event ペア。
 * - feasibility: `transition_${i}` で join（無ければ not_applicable）。transport: event id で join（無ければ unknown mode/duration）。
 * - gap: event 間時刻差から算出（"HH:MM"→分・Date 不使用）。
 */
export function buildRehearsalInput(
  dayGraph: DayGraph,
  feasibility: DayFeasibilityResult,
  transportSegments: readonly TransportSegment[],
  opts?: { readonly baseEnergyLevel?: number | null },
): RehearsalInput {
  const events = dayGraph.nodes.filter((n): n is EventNode => n.kind === "event");
  const steps: RehearsalStep[] = events.map((ev, i) => {
    const next = events[i + 1];
    let transitionAfter: RehearsalTransitionInput | null = null;
    if (next) {
      const seg = transportSegments.find((s) => s.fromEventId === ev.id && s.toEventId === next.id) ?? null;
      const view: FeasibilitySlackView | undefined = feasibility.feasibilityByTransitionKey.get(`transition_${i}`);
      const aEnd = hhmmToMin(ev.endTime);
      const bStart = hhmmToMin(next.startTime);
      const gapMin = aEnd != null && bStart != null ? Math.max(0, bStart - aEnd) : null;
      transitionAfter = {
        mode: seg?.mode ?? ("unknown" as TransportMode),
        travelMin: seg?.estimatedDurationMin ?? null,
        travelKnown: seg ? isKnownDuration(seg.durationSource) : false,
        bufferStatus: view?.status ?? "not_applicable",
        slackMin: view?.slackMin ?? null,
        shortfallMin: view?.shortfallMin ?? null,
        gapMin,
      };
    }
    return {
      event: {
        id: ev.id,
        timeBucket: ev.timeBucket,
        durationMin: ev.durationMin,
        durationAssumed: ev.durationSource === "assumed_default",
        sensitive: ev.sensitive,
      },
      transitionAfter,
    };
  });
  return {
    date: dayGraph.attributes.date,
    dayMood: dayGraph.attributes.dayMood,
    density: dayGraph.attributes.density,
    baseEnergyLevel: opts?.baseEnergyLevel ?? null,
    steps,
  };
}

/** ★WPM-2b: recovery（一息つけそう）の閾値（真の余白 slack 分・較正は backlog）。 */
export const DEFAULT_RECOVERY_MIN_SLACK_MIN = 60;

/**
 * ★WPM-2b: raw feasibility から recovery の stepIndex 集合（純粋）。
 * status==="sufficient" かつ **真の余白 slack（=gap−travel）が minSlackMin 以上**の transition のみ。
 * ★gapMin でなく raw slack を根拠（過大評価しない・honest）。strain forward 積分とは decouple
 *   （WPM-1 convergence / banner / strain を変えない）。not_applicable / insufficient / slack 不明は対象外。
 */
export function recoveryStepsFromFeasibilityRaw(
  rawByTransitionIndex: ReadonlyMap<number, FeasibilitySlackView>,
  minSlackMin: number = DEFAULT_RECOVERY_MIN_SLACK_MIN,
): Set<number> {
  const steps = new Set<number>();
  for (const [idx, view] of rawByTransitionIndex) {
    if (view.status === "sufficient" && view.slackMin != null && view.slackMin >= minSlackMin) {
      steps.add(idx);
    }
  }
  return steps;
}

/**
 * ★Option D（status-only・CalendarTab 配線用）: DayGraph + feasibility **display** map から RehearsalInput を構築。
 * 既存 `_useCalendarTabFeasibilityDisplay` の `Map<transitionIndex, FeasibilityDisplayView>` を消費。
 * raw slack/shortfall 分数は display 層に無い → **null=未確定（捏造しない・honest degrade）**。transport も未公開 → travel unknown。
 * not_applicable は display map から除外済 → 不在キー = not_applicable。pure・READ のみ・Date 不使用。
 */
export function buildRehearsalInputFromDisplay(
  dayGraph: DayGraph,
  displayByTransitionIndex: ReadonlyMap<number, FeasibilityDisplayView>,
  opts?: { readonly baseEnergyLevel?: number | null },
): RehearsalInput {
  const events = dayGraph.nodes.filter((n): n is EventNode => n.kind === "event");
  const steps: RehearsalStep[] = events.map((ev, i) => {
    const next = events[i + 1];
    let transitionAfter: RehearsalTransitionInput | null = null;
    if (next) {
      const view = displayByTransitionIndex.get(i); // 不在 = not_applicable（display は除外）
      const bufferStatus: SlackStatus = view ? (view.variant === "slack" ? "sufficient" : "insufficient") : "not_applicable";
      const aEnd = hhmmToMin(ev.endTime);
      const bStart = hhmmToMin(next.startTime);
      const gapMin = aEnd != null && bStart != null ? Math.max(0, bStart - aEnd) : null;
      transitionAfter = {
        mode: "unknown", // transport 未公開 → unknown（fake duration を作らない）
        travelMin: null, // honest degrade
        travelKnown: false,
        bufferStatus, // ★status のみ（display 由来）
        slackMin: null, // raw 分数なし → 未確定（捏造しない）
        shortfallMin: null, // raw 分数なし → 未確定
        gapMin,
      };
    }
    return {
      event: {
        id: ev.id,
        timeBucket: ev.timeBucket,
        durationMin: ev.durationMin,
        durationAssumed: ev.durationSource === "assumed_default",
        sensitive: ev.sensitive,
      },
      transitionAfter,
    };
  });
  return {
    date: dayGraph.attributes.date,
    dayMood: dayGraph.attributes.dayMood,
    density: dayGraph.attributes.density,
    baseEnergyLevel: opts?.baseEnergyLevel ?? null,
    steps,
  };
}
