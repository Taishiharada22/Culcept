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
  type DayOutlookExplanation,
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

  return { date: input.date, density: input.density, viability, steps, peakStrain, recoveryWindows, convergencePoints, coverage };
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
 * ★Evidence「なぜ?」UI: day outlook の根拠を自然な日本語カテゴリに（純粋）。
 * 観測 = この予定の並び / 移動の余白（feasibility 観測）/ 予定の密度（packed）。
 * 推定 = 重なりやすさ（convergence）or 詰まりやすさ（tight/breaks）/ 一息つけそうな区間（recovery）。
 * 未確定 = 移動の余白を確認できない区間（feasibility not_applicable）。
 * recoveryStepCount は WPM-2b の recoverySteps.size（banner の rehearsal は Option D で recoveryWindows 空のため別途渡す）。
 * ★生スコア / 数値 / level 名は返さない。空カテゴリは呼び出し側が省略。
 */
export function explainDayOutlook(
  rehearsal: DayRehearsal,
  recoveryStepCount: number = 0,
): DayOutlookExplanation {
  const observed: string[] = ["この予定の並び"]; // 予定構造は常に観測
  const inferred: string[] = [];
  const uncertain: string[] = [];

  const transitionSteps = rehearsal.steps.filter((s) => s.friction !== null); // transition のある step
  if (transitionSteps.some((s) => s.bufferStatus === "sufficient" || s.bufferStatus === "insufficient")) {
    observed.push("移動の余白");
  }
  if (rehearsal.density === "packed") observed.push("予定の密度");

  if (rehearsal.convergencePoints.length > 0) inferred.push("重なりやすさ");
  else if (rehearsal.viability.outlook === "tight" || rehearsal.viability.outlook === "breaks") inferred.push("詰まりやすさ");
  if (recoveryStepCount > 0) inferred.push("一息つけそうな区間");

  if (transitionSteps.some((s) => s.bufferStatus === "not_applicable")) uncertain.push("移動の余白を確認できない区間");

  return { observed, inferred, uncertain };
}

/**
 * ★per-marker「なぜ?」: 詰まり(convergence) marker の根拠を、この区間固有の自然な日本語1文に（純粋）。
 * factors（buffer_short=観測 / strain_high=推定 / friction_high=推定）を **observed>inferred 順**で合成。
 * - 既存 FeasibilityDisclosureLine（「不足 N 分」=量的 status）と register を分ける質的 synthesis。
 *   buffer は質的に（「移動の余白が少なめ」）・strain/friction は feasibility が持たない情報を足す。
 * - ★生スコア / 数値 / 係数 / level 名は出さない。仮説トーン（〜そう）。空 factors は ""（呼び出し側が省略）。
 * - recovery は uniform（specificity 弱）のため per-marker 対象外（day-level「なぜ?」で被覆）。
 */
const CONVERGENCE_FACTOR_PHRASE: Readonly<Record<ConvergenceFactor, string>> = {
  buffer_short: "移動の余白が少なめ", // 観測（feasibility insufficient）
  strain_high: "予定が立て込んでいそう", // 推定（密度/連続の意・断定でない）
  friction_high: "移動に時間がかかりそう", // 推定（friction=移動が gap を圧迫）
};

export function explainConvergenceMarker(factors: readonly ConvergenceFactor[]): string {
  // observed>inferred の安定順。重複除去。
  const ordered = (["buffer_short", "strain_high", "friction_high"] as const).filter((f) => factors.includes(f));
  if (ordered.length === 0) return "";
  return `ここは${ordered.map((f) => CONVERGENCE_FACTOR_PHRASE[f]).join("で、")}です。`;
}

/**
 * ★Batch 3 F1: convergence marker の **見出し**を factor 構成に応じて出し分ける（純粋）。
 * 課題: 見出しが factor 非依存で一律「重なりやすい」だと、buffer 十分（余白あり）で strain+friction だけの
 *   transition でも「重なりやすい」と出て**余白と矛盾**（full-path activation 後に露呈・余白145分の例）。
 * 方針（CEO/GPT 確定 2026-06-08）:
 *   - `buffer_short` を含む（= 実際に時間が重なりうる）→ 既存文「予定が重なりやすい」を維持（正しい）。
 *   - `buffer_short` なし（strain_high + friction_high のみ）→「移動と予定が立て込みやすい」。
 *     「重なりやすい」は使わない（時間の重なりでない）。「詰まりやすい」も避ける（やや警告的）。
 * - ★生スコア / 数値 / level 名を出さない・仮説トーン（〜かもしれません）・警告/断定語なし。
 * - 空 factors は existing degrade（marker は非消失が原則ゆえ既存文へ・呼び出し側で marker 自体は表示維持）。
 */
export function buildConvergenceMarkerHeadline(factors: readonly ConvergenceFactor[]): string {
  // 防御的: factor が取れない（空）は既存文へ degrade（marker 非消失・挙動不変・実際は marker は factor≥2 でのみ出る）。
  if (factors.length === 0) return "この前後は予定が重なりやすいかもしれません";
  return factors.includes("buffer_short")
    ? "この前後は予定が重なりやすいかもしれません"
    : "この前後は移動と予定が立て込みやすいかもしれません";
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

/**
 * ★full path（Batch 1）: hook が overlay（movement segment）から surface する transition 単位の実 travel。
 * resolved → travelMin=estimatedDurationMin / mode=modeCandidate.mode / travelKnown=既知 provider。
 * unresolved/不在 → travelMin null（捏造しない＝unknown）。
 */
export interface RehearsalTravelView {
  readonly travelMin: number | null;
  readonly mode: TransportMode;
  readonly travelKnown: boolean;
}

/**
 * ★full path（Batch 1・原典の意図した入力モデルの完遂）: DayGraph + **raw feasibility（真の slack/shortfall）** +
 * **実 travel** から RehearsalInput を構築。Option D（buildRehearsalInputFromDisplay）の degrade を解消し、
 * travelMin/mode/slackMin/shortfallMin を **実値**で埋める（friction が実移動で可変・convergence/recovery が正確・protect_buffer 到達可）。
 * raw 不在 = not_applicable（feasibility 対象外）・travel 不在/unresolved = unknown（捏造しない）。pure・READ のみ・Date 不使用・honest degrade。
 */
export function buildRehearsalInputFull(
  dayGraph: DayGraph,
  rawByTransitionIndex: ReadonlyMap<number, FeasibilitySlackView>,
  travelByTransitionIndex: ReadonlyMap<number, RehearsalTravelView>,
  opts?: { readonly baseEnergyLevel?: number | null },
): RehearsalInput {
  const events = dayGraph.nodes.filter((n): n is EventNode => n.kind === "event");
  const steps: RehearsalStep[] = events.map((ev, i) => {
    const next = events[i + 1];
    let transitionAfter: RehearsalTransitionInput | null = null;
    if (next) {
      const raw = rawByTransitionIndex.get(i); // 不在 = not_applicable
      const travel = travelByTransitionIndex.get(i); // 不在/unresolved = unknown
      const aEnd = hhmmToMin(ev.endTime);
      const bStart = hhmmToMin(next.startTime);
      const gapMin = aEnd != null && bStart != null ? Math.max(0, bStart - aEnd) : null;
      transitionAfter = {
        mode: travel?.mode ?? ("unknown" as TransportMode),
        travelMin: travel?.travelMin ?? null, // 実 travel（unknown は null・捏造しない）
        travelKnown: travel?.travelKnown ?? false,
        bufferStatus: raw?.status ?? "not_applicable", // ★真の status（raw 由来）
        slackMin: raw?.slackMin ?? null, // ★真の slack（display と違い実値）
        shortfallMin: raw?.shortfallMin ?? null, // ★真の shortfall
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

/**
 * ★Day Rehearsal full-path 有効化フラグ（Batch 1・module const）。
 * client(CalendarTab) で評価するため PLAN_FLAGS（server-only）でなく module const。
 * OFF: buildRehearsalInputFromDisplay（status-only degrade）。ON: buildRehearsalInputFull（実 transport + raw feasibility）。
 * ★**2026-06-07 activation（CEO smoke PASS・/plan 実機検証済）**: 既定 ON。
 *   実機検証で friction が実移動で可変・convergence/recovery が実 slack 由来・protect_buffer 復活・異常なし・read-only/数値非表示 を確認。
 *   緊急時は false に戻せば Option D（status-only degrade）へ即復帰（kill 相当）。
 */
export const DAY_REHEARSAL_FULL_PATH_ENABLED = true;

/**
 * ★Day Rehearsal energy（状態次元）有効化フラグ（Batch 2・module const・default OFF）。
 * OFF: baseEnergyLevel を渡さない＝null＝budget 不変（既存挙動完全不変）。
 * ON: InnerWeather の energy（正規化 0-1）を baseEnergyLevel に供給＝§6 state evolution（energy 低→budget やや低→tight 寄り）。
 * 過悲観回避は energyBudgetWeight=0.5（最大 −25%）+ null degrade（未記録日は baseBudget 不変=安全側）。
 * local smoke 時のみ true → 検証後に既定 ON 化を CEO 判断。緊急時 false で即 degrade。
 */
export const DAY_REHEARSAL_ENERGY_ENABLED = true; // ★Batch 2 activation（2026-06-08 CEO/GPT GO・実エンジン再現で energy が過悲観の原因でないこと実測・有界 −25%・null degrade・leak なし）

/**
 * ★A1-5 personal pace 反映 有効化フラグ（module const・**default OFF**）。
 * OFF: rehearsalInput をそのまま rehearseDay（既存挙動完全不変＝同一参照）。
 * ON: applyPersonalPaceToRehearsalInput で travelMin に personal pace を soft 反映
 *   （ready(≥3観測)のみ・damping+clamp[0.85,1.25]・buffer 観測は不変・unknown は捏造しない）。
 * ★現状 capture(A1-6) 未実装ゆえ resolver は観測 0 → ON でも実質 inert（null resolver と同等）。
 *   activation は A1-6 で実データ経路が完成し実機 smoke を通してから CEO 判断（今は有効化しない）。
 */
export const DAY_REHEARSAL_PERSONAL_PACE_ENABLED = false;

/**
 * ★Batch 2: InnerWeather.energyLevel（**-1〜1**・GET /api/stargazer/inner-weather 由来）→ baseEnergyLevel（**0-1**）に正規化。
 * 値域 sign 不一致を吸収（**省くと負値が clamp(0,1) で 0 に潰れ系統的 over-pessimism＝silent bug**）。
 * 式: (raw + 1) / 2 → clamp(0,1)。例: -1→0.0, 0→0.5, +1→1.0。null（未記録）は null のまま（degrade）。
 */
export function normalizeInnerWeatherEnergy(rawMinus1to1: number | null | undefined): number | null {
  if (rawMinus1to1 == null || Number.isNaN(rawMinus1to1)) return null;
  return clamp((rawMinus1to1 + 1) / 2, 0, 1);
}
