/**
 * T11-C — 決定論 Travel Fit core（**pure・未配線**）
 *
 * 設計正本: docs/t11-travel-fit-model-plan.md §5 + docs/t11-travel-object-ontology.md
 *
 * 入力: FitUserState/FitSubject + TravelObjectState + FitContext（全て呼び出し側が供給する pure input）
 * 出力: FitResult（fitLabel/components/hardBlocks/説明・**実行権限を一切生成しない**）
 *
 * 厳守（純・決定論・非 opaque）:
 *   - 実 hotel/flight/place 検索・scraping・price/空室断定・booking・route/weather API・永続化・
 *     M2 runtime・Plan Intelligence・UI・LLM・solver は一切なし。import は ./core-types / ./fit-types の型のみ。
 *   - 時刻 API / 乱数を使わない。同一入力→同一出力（tie は id/role 名 localeCompare）。
 *   - **gate-first 2 段**: blocked は score 合成の外の hard gate。veto floor は他軸で覆らせない（WSM masking 防止）。
 *   - **budgetFit 単独は blocked にしない**（INVARIANT）。budget block は FitContext.budgetRedLine 経由のみ。
 *   - **source 数/人気は component の生値・overall・fitLabel を変えず confidence にのみ影響**。
 *   - **private 非漏洩**: toSharedFitView は二層 + 要素削除（private 由来の連続値/descriptor を構造的に塞ぐ）。
 *   - **fit ≠ 実行権限**: FitResult.authoritative=false 固定・hasFitActionAuthority は literal false。
 */

import type { ViewerScopedRationale } from "./core-types";
import { computeConstructBlend, runInteractions, applyCap, hotelDropPolicy, type ConstructBlend, type ConstructBlendInput, type InteractionInputBundle } from "./fit-constructs-core";
import type { ConstructIndicatorInput, ConstructPreferenceInput } from "./fit-constructs";
import {
  BURDEN_TOLERANCE_MAP,
  ENTITY_FIT_GRADES,
  FIT_LABEL_THRESHOLDS,
  FIT_WEIGHTS,
  MISERY_FLOOR,
  ROLE_FLOOR,
  ROUTE_CHAIN_WEIGHTS,
  ROUTE_DERIVED_PROVENANCE,
  VETO_FLOORS,
  type AnyEntityRole,
  type EntityBurdenAxis,
  type EntityFitGrade,
  type FitComponent,
  type FitComponentKey,
  type FitContext,
  type FitHardBlock,
  type FitResult,
  type FitSubject,
  type FitUserState,
  type GroupAggregateFit,
  type GroupConflict,
  type MismatchReason,
  type MissingDataQuestion,
  type Observed,
  type PerParticipantFit,
  type ProvenanceSource,
  type RelationshipKind,
  type RiskFlag,
  type RouteChainState,
  type RouteDerivedObservation,
  type SharedTraitAxis,
  type TraitValue,
  type TravelObjectState,
} from "./fit-types";

// ─────────────────────────────────────────────────────────────────────────────
// §0 小道具（pure・決定論）
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (x: number, lo = 0, hi = 1): number => (x < lo ? lo : x > hi ? hi : x);
const mean = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Observed の値を取り出す（未観測 null は undefined） */
function val<T>(o: Observed<T> | undefined): T | undefined {
  if (!o || o.value === null) return undefined;
  return o.value;
}
function conf<T>(o: Observed<T> | undefined): number {
  if (!o || o.value === null) return 0;
  return o.confidence;
}

/** FitContext modulation 係数（非 opaque） */
const FATIGUE_K = 0.4;
const WEATHER_K = 0.5;
const CROWD_K = 0.4;

/** role 別 trait 軸 importance（非 opaque・正本可視・未列挙は 1.0） */
export const ROLE_AXIS_IMPORTANCE: Partial<Record<AnyEntityRole, Partial<Record<SharedTraitAxis, number>>>> = {
  recovery: { quietLively: 1.4, calmStimulating: 1.4, onsenWaterQuality: 1.3, photogenicStyle: 0.4 },
  view: { photogenicStyle: 1.5, aestheticPlain: 1.2, quietLively: 0.7 },
  destination: { noveltyFamiliar: 1.2, learningDepth: 1.2, photogenicStyle: 1.1 },
  romance: { intimateSocial: 1.4, quietLively: 1.2, photogenicStyle: 1.1 },
  culture_learning: { learningDepth: 1.5, classicTrendy: 1.1 },
};

// ─────────────────────────────────────────────────────────────────────────────
// §1 door-to-door burden（ConnectionState 上の純関数・T11-A2 §4）
// ─────────────────────────────────────────────────────────────────────────────

export interface DoorToDoorBreakdown {
  total: number;
  legsBurden: number;
  transfersBurden: number;
  terminalsBurden: number;
  baggageBurden: number;
}

/** ordering の luggage_drop_enables が荷物 base 化しているか（荷物項を消す状態 carrier） */
export function baggageDroppedByOrdering(routeChain: RouteChainState): boolean {
  return (routeChain.ordering ?? []).some((o) => o.kind === "luggage_drop_enables");
}

/**
 * door-to-door 総負荷の合成（純粋・実 API 無・推定のみ・price/実時刻断定なし）。
 * burden = Σ(legTime×legWeight) + Σ(transferPenalty+minTransfer) + Σterminal + baggage×crowd。
 * ★ egress(lastMile)=firstMile×3 の非対称重み。★ baggage は terminal/階段×混雑の交互作用項。
 */
export function doorToDoorBurden(
  routeChain: RouteChainState,
  opts?: { crowd?: number; baggageDropped?: boolean },
): DoorToDoorBreakdown {
  const c = routeChain.connection;
  const w = ROUTE_CHAIN_WEIGHTS;

  let legsBurden = 0;
  for (const leg of c.legs) {
    let weight: number;
    if (leg.legKind === "firstMile") weight = w.firstMile;
    else if (leg.legKind === "lastMile") weight = w.lastMile;
    else if (leg.inVehicleKind === "wait") weight = w.wait;
    else if (leg.inVehicleKind === "walk") weight = w.walk;
    else weight = w.inVehicle;
    legsBurden += leg.timeMin * weight;
  }

  let transfersBurden = 0;
  for (const t of c.transferNodes) {
    // 型付き乗換（回数でない）: in-seat(4)=0 / in-station(5)=半額 / その他=18 分相当
    const penalty = t.transferType === 4 ? 0 : t.transferType === 5 ? w.transferPenaltyMin * 0.5 : w.transferPenaltyMin;
    // C5: 乗換複雑性（additive・undefined→0）
    transfersBurden += penalty + t.minTransferMin + (t.transferComplexity ?? 0) * ROUTE_C5_WEIGHTS.transferComplexityMin;
  }

  // C5: terminal は overhead + 構内歩行 + 行列ばらつき（新 field undefined→0 で既存不変）
  const terminalsBurden = (c.terminals ?? []).reduce(
    (a, t) => a + t.overheadMin + (t.walkM ?? 0) * ROUTE_C5_WEIGHTS.terminalWalkFactor + (t.queueVariance ?? 0) * ROUTE_C5_WEIGHTS.queueVarianceMin,
    0,
  );

  // C5: baggageState.droppedState も荷物 drop と見なす（ordering opts と OR）
  const dropped = opts?.baggageDropped || c.baggageState?.droppedState === "dropped";
  let baggageBurden = 0;
  if (!dropped) {
    const occ = c.baggageState?.spatialOccupancy ?? c.baggage?.spatialOccupancy ?? (c.baggage?.pieces ? clamp(c.baggage.pieces * 0.3) : 0);
    const stair = c.transferNodes.some((t) => t.pathwayMode === 2) ? w.stairBaggageFactor : 1;
    const crowd = 1 + (opts?.crowd ?? 0) * 0.5;
    baggageBurden = occ * stair * crowd * 10; // 分相当スケール
  }

  // C5: 信頼性 modifier（PTI 高で全体補正・undefined→×1 で既存 Hiroshima 不変）
  const pti = c.reliability?.planningTimeIndex;
  const reliabilityMul = pti !== undefined ? 1 + clamp(pti) * ROUTE_C5_WEIGHTS.reliabilityK : 1;
  const base = legsBurden + transfersBurden + terminalsBurden + baggageBurden;

  return {
    total: base * reliabilityMul,
    legsBurden,
    transfersBurden,
    terminalsBurden,
    baggageBurden,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §1.5 T11-C5 ConnectionState deepening helpers（pure・実 route API 無）
// ─────────────────────────────────────────────────────────────────────────────

/** C5 非 opaque 係数（door-to-door 分→0..1 正規化スケール等・export） */
export const ROUTE_C5_WEIGHTS = {
  transferComplexityMin: 12,
  terminalWalkFactor: 0.05,
  queueVarianceMin: 8,
  reliabilityK: 0.5,
  burdenScaleMin: 300,
  transferScaleMin: 150,
  baggageScaleMin: 50,
} as const;

export interface RouteLockSignals {
  /** 終電/最終便 lock 由来の risk（scheduling せず signal のみ） */
  lastDepartureRisk: boolean;
  timedEntryConstraints: number;
  openHoursConstraints: number;
  checkinCheckoutLocks: number;
  reorderable: boolean;
}

/** ordering/lock を**carry signal**として読む（solver/scheduling/booking しない） */
export function routeLockSignals(routeChain: RouteChainState): RouteLockSignals {
  const o = routeChain.ordering ?? [];
  return {
    lastDepartureRisk: o.some((x) => x.kind === "last_departure_lock"),
    timedEntryConstraints: o.filter((x) => x.kind === "timed_entry_lock").length,
    openHoursConstraints: o.filter((x) => x.kind === "open_hours_window_lock").length,
    checkinCheckoutLocks: o.filter((x) => x.kind === "checkin_window_lock" || x.kind === "checkout_window_lock").length,
    reorderable: o.some((x) => x.kind === "reorderable"),
  };
}

/** ConnectionState 由来の指標観測マップ（★派生値・provenance=derived_from_connection_state） */
export type RouteDerivedIndicators = Partial<Record<string, Partial<Record<string, RouteDerivedObservation>>>>;

/**
 * ConnectionState から H_route 構築子の**派生観測**を作る（★実観測でなく派生・live route data でない）。
 * confidence は入力 completeness の集約（派生は満点にしない）。欠落 field は派生しない（hallucinate しない）。
 */
export function deriveRouteObservations(routeChain: RouteChainState): RouteDerivedIndicators {
  const c = routeChain.connection;
  const dropped = hotelDropPolicy(routeChain) || c.baggageState?.droppedState === "dropped"; // ★C6: ordering単独でなくpolicy(ordering+affordance)/明示droppedState
  const bd = doorToDoorBurden(routeChain, { baggageDropped: dropped });
  // aggregate input confidence = 入力の充実度（派生 confidence の上限 0.85）
  const richFields = [c.reliability, c.comfort, c.terminals?.length, c.baggageState, c.airportToCityBurden, c.stationToHotelBurden, c.transferNodes.length > 0 ? 1 : 0].filter(Boolean).length;
  const conf = clamp(0.4 + 0.06 * richFields, 0, 0.85);
  const mk = (value: number): RouteDerivedObservation => ({ value: clamp(value), confidence: conf, provenance: ROUTE_DERIVED_PROVENANCE });
  const out: RouteDerivedIndicators = {};

  if (c.legs.length > 0) {
    // ★ C5.1: door-to-door 総負荷を**route 専用集約 construct(routeChainBurden)**へ（walkingLoad に総負荷を入れない）。
    //   単一 aggregate signal で平均化逆転を回避しつつ、意味論を「歩行」でなく「総 route 負荷」に正す。
    const stationHotel = (c.stationToHotelBurden?.walkMin ?? 0) * ROUTE_CHAIN_WEIGHTS.lastMile;
    const airportCity = (c.airportToCityBurden?.accessMin ?? 0) * ROUTE_CHAIN_WEIGHTS.lastMile;
    const totalWithEgress = bd.total + stationHotel + airportCity;
    const burdenNorm = clamp(totalWithEgress / ROUTE_C5_WEIGHTS.burdenScaleMin);
    out.routeChainBurden = { doorToDoorTotalNorm: mk(burdenNorm) };
    out.arrivalFreshness = { energyCarryToFirstActivity: mk(1 - burdenNorm) };
  }
  if (c.comfort?.workability !== undefined) out.workabilityValue = { workability: mk(c.comfort.workability) };
  if (c.comfort?.sleepability !== undefined) out.sleepabilityValue = { sleepability: mk(c.comfort.sleepability) };
  return out;
}

/**
 * C5.1: route 負荷の**分解 sub-observation**（説明 / 将来 interaction / missing-question 用）。
 * ★ fit には供給しない（burdenFit を二重計上しない）。walkingLoad は**歩行専用**（walk leg のみ）。
 */
export function deriveRouteDecomposition(routeChain: RouteChainState): RouteDerivedIndicators {
  const c = routeChain.connection;
  const dropped = hotelDropPolicy(routeChain) || c.baggageState?.droppedState === "dropped"; // ★C6: ordering単独でなくpolicy(ordering+affordance)/明示droppedState
  const bd = doorToDoorBurden(routeChain, { baggageDropped: dropped });
  const conf = 0.7;
  const mk = (value: number): RouteDerivedObservation => ({ value: clamp(value), confidence: conf, provenance: ROUTE_DERIVED_PROVENANCE });
  const out: RouteDerivedIndicators = {};
  // walkingLoad = ★歩行のみ（walk leg / walk-kind の合計・総負荷ではない）
  const walkMin = c.legs.filter((l) => l.mode === "walk" || l.inVehicleKind === "walk").reduce((a, l) => a + l.timeMin + (l.walkingMin ?? 0), 0);
  if (walkMin > 0) out.walkingLoad = { walkingDistanceKm: mk(walkMin / 120) };
  if (c.transferNodes.length > 0) out.transferBurden = { transferCountTyped: mk(clamp(c.transferNodes.length / 5)) };
  if ((c.terminals?.length ?? 0) > 0) out.terminalWalkingBurden = { terminalWalkMin: mk(clamp(bd.terminalsBurden / 120)) };
  if (!dropped && (c.baggageState || c.baggage)) out.baggageLoad = { baggageVolumeWeight: mk(clamp(bd.baggageBurden / ROUTE_C5_WEIGHTS.baggageScaleMin)) };
  if (c.stationToHotelBurden?.walkMin !== undefined) out.stationToHotelBurden = { stationHotelWalkMin: mk(clamp(c.stationToHotelBurden.walkMin / 60)) };
  if (c.airportToCityBurden?.accessMin !== undefined) out.airportToCityBurden = { airportCityAccessMin: mk(clamp(c.airportToCityBurden.accessMin / 90)) };
  if (c.reliability?.planningTimeIndex !== undefined) out.reliabilityBurden = { ptiBurden: mk(clamp(c.reliability.planningTimeIndex)) };
  return out;
}

/** 派生観測 + 直接観測を merge（★直接観測=実観測が派生に優先）→ C3 rollup 入力へ */
function mergeRouteIntoIndicators(derived: RouteDerivedIndicators, direct?: ConstructIndicatorInput): ConstructIndicatorInput {
  const result: Record<string, Record<string, { value: number; confidence: number }>> = {};
  for (const [axis, inds] of Object.entries(derived)) {
    if (!inds) continue;
    result[axis] = {};
    for (const [k, o] of Object.entries(inds)) if (o) result[axis][k] = { value: o.value, confidence: o.confidence };
  }
  const directAny = direct as Record<string, Record<string, { value: number; confidence: number }>> | undefined;
  if (directAny) for (const [axis, inds] of Object.entries(directAny)) result[axis] = { ...(result[axis] ?? {}), ...inds };
  return result as ConstructIndicatorInput;
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 entity trait 派生（onsen facet を trait 空間へ射影）
// ─────────────────────────────────────────────────────────────────────────────

/** 温泉 facet を持つ entity の onsenWaterQuality trait を派生（facet projection の fit 反映） */
function deriveEntityTraits(entity: TravelObjectState): { traits: Partial<Record<SharedTraitAxis, TraitValue>>; onsenSpring?: string } {
  const traits: Partial<Record<SharedTraitAxis, TraitValue>> = { ...(entity.traits ?? {}) };
  let onsenSpring: string | undefined;
  const onsen =
    entity.category === "lodging" || entity.category === "place" || entity.category === "area"
      ? entity.rich?.onsenFacet
      : undefined;
  if (onsen) {
    const spring = val(onsen.springType);
    const kake = val(onsen.kakenagashi);
    onsenSpring = spring;
    const quality = clamp(0.6 + (spring ? 0.2 : 0) + (kake ? 0.2 : 0));
    const existing = traits.onsenWaterQuality;
    if (!existing || existing.value < quality) {
      traits.onsenWaterQuality = { value: quality, confidence: Math.max(conf(onsen.springType), conf(onsen.kakenagashi), 0.5) };
    }
  }
  return { traits, onsenSpring };
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 component helpers（各 0..1・available/signalBasis/confidence を返す）
// ─────────────────────────────────────────────────────────────────────────────

interface ComponentRaw {
  value: number;
  available: boolean;
  confidence: number;
  signalBasis: FitComponent["signalBasis"];
}

const NEUTRAL = 0.6;

/** trait 適合（user 同一空間・signedGap・非対称欠落は confidence 減算） */
export function traitFit(
  user: FitUserState,
  entityTraits: Partial<Record<SharedTraitAxis, TraitValue>>,
  primaryRole: AnyEntityRole | null,
  opts: { includePrivate: boolean; excludeUserAxes?: ReadonlySet<SharedTraitAxis> },
): ComponentRaw {
  const userTraits = user.traits ?? {};
  const importance = (primaryRole && ROLE_AXIS_IMPORTANCE[primaryRole]) || {};
  let wSum = 0;
  let acc = 0;
  let confAcc = 0;
  let confW = 0;
  let present = 0;
  for (const axis of Object.keys(userTraits) as SharedTraitAxis[]) {
    const u = userTraits[axis];
    if (!u) continue;
    if (!opts.includePrivate && u.visibility === "private") continue;
    if (opts.excludeUserAxes?.has(axis)) continue; // C3 supersede: construct が担う軸は legacy から除外
    const e = entityTraits[axis];
    const imp = importance[axis] ?? 1.0;
    const wc = clamp(u.confidence) * imp;
    confW += imp;
    if (!e) {
      // 非対称欠落: distance 加算でなく confidence 減算（present に数えない）
      continue;
    }
    const gap = Math.abs(u.value - e.value) / 2; // -1..1 → 0..1
    const axisFit = 1 - gap;
    acc += axisFit * wc;
    wSum += wc;
    confAcc += clamp(u.confidence) * clamp(e.confidence) * imp;
    present += 1;
  }
  if (present === 0) {
    return { value: NEUTRAL, available: false, confidence: 0, signalBasis: "default" };
  }
  return {
    value: clamp(acc / wSum),
    available: true,
    confidence: clamp(confW === 0 ? 0 : confAcc / confW),
    signalBasis: "observed",
  };
}

/** role 適合（intendedRole × entity.roleAffinity・未指定→最良 role 自動採用） */
export function roleFit(
  user: FitUserState,
  entity: TravelObjectState,
  opts: { includePrivate: boolean },
): { raw: ComponentRaw; chosenRole: AnyEntityRole | null; categoryMismatch: boolean } {
  const affinity = entity.roleAffinity ?? {};
  // 1. user の intendedRole（category 一致・visibility 考慮）から最重み
  const intents = (user.intendedRoles ?? []).filter(
    (r) => (opts.includePrivate || r.visibility !== "private"),
  );
  const matching = intents.filter((r) => r.category === entity.category);
  const mismatch = intents.length > 0 && matching.length === 0;
  if (mismatch) {
    return { raw: { value: 0, available: true, confidence: 0.6, signalBasis: "observed" }, chosenRole: null, categoryMismatch: true };
  }
  let chosen: AnyEntityRole | null = null;
  if (matching.length > 0) {
    matching.sort((a, b) => (b.weight - a.weight) || a.role.localeCompare(b.role));
    chosen = matching[0].role;
  } else {
    // 未指定 → 最良 role 自動採用（argmax roleAffinity・tie は role 名 localeCompare）
    const keys = (Object.keys(affinity) as AnyEntityRole[]).filter((k) => val(affinity[k]) !== undefined);
    keys.sort((a, b) => (val(affinity[b])! - val(affinity[a])!) || a.localeCompare(b));
    chosen = keys[0] ?? null;
  }
  if (!chosen) {
    return { raw: { value: NEUTRAL, available: false, confidence: 0, signalBasis: "default" }, chosenRole: null, categoryMismatch: false };
  }
  const a = affinity[chosen];
  const v = val(a);
  if (v === undefined) {
    return { raw: { value: 0.4, available: true, confidence: 0.3, signalBasis: "inferred_from_trait" }, chosenRole: chosen, categoryMismatch: false };
  }
  return { raw: { value: clamp(v), available: true, confidence: clamp(conf(a)), signalBasis: "observed" }, chosenRole: chosen, categoryMismatch: false };
}

function toleranceForAxis(axis: EntityBurdenAxis, user: FitUserState): number | undefined {
  if (axis === "morningBurden") return user.morningness ?? user.tolerances.fatigueSensitivity;
  const mapped = BURDEN_TOLERANCE_MAP[axis];
  return user.tolerances[mapped];
}

function effectiveTolerance(axis: EntityBurdenAxis, base: number, ctx?: FitContext): number {
  let t = base;
  if (ctx?.todayFatigueSpike) t -= FATIGUE_K * ctx.todayFatigueSpike;
  if (axis === "weatherFragility" && ctx?.weatherSeverity) t -= WEATHER_K * ctx.weatherSeverity;
  if (axis === "crowdNoise" && ctx?.expectedCrowdLevel) t -= CROWD_K * ctx.expectedCrowdLevel.value;
  return clamp(t);
}

/** 負荷適合（対称写像・FitContext で effectiveTolerance を当日値に・base trait 不変） */
export function burdenFit(user: FitUserState, entity: TravelObjectState, ctx?: FitContext, excludeBurdenAxes?: ReadonlySet<EntityBurdenAxis>): ComponentRaw {
  const burden = entity.burden ?? {};
  const penalties: number[] = [];
  const confs: number[] = [];
  for (const axis of Object.keys(burden) as EntityBurdenAxis[]) {
    if (excludeBurdenAxes?.has(axis)) continue; // C3 supersede: construct が担う burden 軸は legacy から除外
    const b = burden[axis];
    const bv = val(b);
    if (bv === undefined) continue;
    const base = toleranceForAxis(axis, user) ?? 0.5;
    const tol = effectiveTolerance(axis, base, ctx);
    penalties.push(clamp(bv) * (1 - tol));
    confs.push(clamp(conf(b)));
  }
  if (penalties.length === 0) return { value: NEUTRAL, available: false, confidence: 0, signalBasis: "default" };
  return { value: clamp(1 - mean(penalties)), available: true, confidence: clamp(mean(confs)), signalBasis: "observed" };
}

/** 回復適合（restValue × recoveryNeed・todayFatigueSpike/tripIntent で増幅・support relief 加点） */
export function recoveryFit(user: FitUserState, entity: TravelObjectState, ctx?: FitContext): ComponentRaw {
  const restO = entity.recovery?.restValue;
  let rest = val(restO);
  let confBase = conf(restO);
  let basis: FitComponent["signalBasis"] = "observed";
  // support の reliefValue は摩擦除去＝回復の鏡像（負号の負＝回復）
  if (rest === undefined && entity.category === "support") {
    const rv = val(entity.rich?.reliefValue);
    if (rv !== undefined) {
      rest = rv;
      confBase = conf(entity.rich?.reliefValue);
    }
  }
  if (rest === undefined) return { value: NEUTRAL, available: false, confidence: 0, signalBasis: "default" };
  const fatigueTol = user.tolerances.fatigueSensitivity ?? 0.5;
  const recoveryNeed = clamp(
    (1 - fatigueTol) * 0.6 + (ctx?.todayFatigueSpike ?? 0) * 0.5 + (ctx?.tripIntent === "recovery" ? 0.2 : 0),
  );
  const value = clamp(rest * recoveryNeed + NEUTRAL * (1 - recoveryNeed));
  return { value, available: true, confidence: clamp(confBase), signalBasis: basis };
}

/** 関係適合（subject.relationship × entity.relational） */
export function relationalFit(entity: TravelObjectState, relationship: RelationshipKind): ComponentRaw {
  const r = entity.relational?.[relationship];
  const v = val(r);
  if (v === undefined) return { value: NEUTRAL, available: false, confidence: 0, signalBasis: "default" };
  return { value: clamp(v), available: true, confidence: clamp(conf(r)), signalBasis: "observed" };
}

/** 予算適合（INVARIANT: 単独で blocked にしない・常に [0,1] soft） */
export function budgetFit(user: FitUserState, entity: TravelObjectState): ComponentRaw {
  const pv = val(entity.priceLevel);
  if (pv === undefined) return { value: NEUTRAL, available: false, confidence: 0, signalBasis: "default" };
  const sens = user.budgetSensitivity ?? 0.5;
  return { value: clamp(1 - clamp(pv) * sens), available: true, confidence: clamp(conf(entity.priceLevel)), signalBasis: "observed" };
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 confidence 集約（source は confidence にのみ影響・質に直結しない）
// ─────────────────────────────────────────────────────────────────────────────

/** 1 − Π(1 − reliability_i)（独立性割引・上限飽和）。source 数は confidence のみ動かす。 */
export function aggregateFieldConfidence(sources: ProvenanceSource[] | undefined): number {
  if (!sources || sources.length === 0) return 0.5;
  let prod = 1;
  for (const s of sources) {
    const eff = clamp(s.reliability) * (s.independent ? 1 : 0.5);
    prod *= 1 - eff;
  }
  return clamp(1 - prod, 0, 0.99);
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 hard blocks（gate-first・安全側 fail-closed）
// ─────────────────────────────────────────────────────────────────────────────

function evaluateHardBlocks(user: FitUserState, entity: TravelObjectState, ctx?: FitContext): FitHardBlock[] {
  const blocks: FitHardBlock[] = [];
  const reasonFor = (sev: "red_line" | "hard"): FitHardBlock["reason"] =>
    sev === "red_line" ? "red_line_violation" : "hard_constraint_violation";

  for (const hc of user.hardConstraints ?? []) {
    const failClosed = hc.severity === "red_line" || hc.axis === "allergy" || hc.axis === "medical" || hc.axis === "accessibility";
    const target = hc.descriptor.includes(":") ? hc.descriptor.split(":")[1] : hc.descriptor;
    const push = () => blocks.push({ reason: reasonFor(hc.severity), visibility: hc.visibility, ownerParticipantId: null });

    if (hc.axis === "allergy") {
      const a = entity.hardProfile?.allergens;
      if (!a || a.handling === "unknown") push(); // 未確認は満たさず（外食は表示義務外）
      else if (a.handling === "not_handled") push();
      else if (a.present?.includes(target)) push();
      else if (!(a.handling === "handled" && a.safe?.includes(target))) push(); // handled だが当該 allergen 安全未確認
    } else if (hc.axis === "accessibility") {
      const acc = entity.hardProfile?.accessibility;
      const needStepFree = /no_stairs|wheelchair|step_free/.test(hc.descriptor);
      if (needStepFree) {
        const v = acc?.stepFree ?? acc?.wheelchair ?? "unknown";
        if (v === "no" || v === "unknown") push();
      }
      if (/no_steep_slope/.test(hc.descriptor)) {
        const v = acc?.noSteepSlope ?? "unknown";
        if (v !== "yes") push();
      }
    } else if (hc.axis === "tattoo") {
      const p = entity.hardProfile?.tattooPolicy ?? "unknown";
      if (p === "prohibited") push();
      else if (p === "unknown" && hc.severity === "red_line") push();
    } else if (hc.axis === "dietary") {
      const d = entity.hardProfile?.dietary;
      if (!d || d.handling === "unknown") {
        if (failClosed) push();
      } else if (d.handling === "not_handled" || !(d.supports ?? []).includes(target)) push();
    } else if (hc.axis === "medical") {
      const m = entity.hardProfile?.medical;
      if ((m?.exertionSafe ?? "unknown") !== "yes") push();
    }
  }

  // budget hard ceiling（user 供給 redLine 経由のみ・entity 価格断定でない）
  if (ctx?.budgetRedLine && entity.priceBand) {
    const band = val(entity.priceBand);
    if (band && band.lo > ctx.budgetRedLine.maxHi) {
      blocks.push({ reason: "budget_over_hard_ceiling", visibility: ctx.budgetRedLine.visibility, ownerParticipantId: ctx.budgetRedLine.ownerParticipantId });
    }
  }

  // support necessity（required/trip_critical で reliefValue 欠落 → fail-closed）
  if (entity.category === "support") {
    const nec = entity.rich?.necessity;
    if (nec === "required" || nec === "trip_critical") {
      const rv = val(entity.rich?.reliefValue);
      if (rv === undefined || rv < 0.2) {
        blocks.push({ reason: "support_unavailable", visibility: "shared", ownerParticipantId: null });
      }
    }
  }

  // activity の季節/天候 hard（modulator でなく成立可否 gate に昇格）
  if (entity.category === "activity") {
    const rich = entity.rich;
    const window = val(rich?.seasonWindow);
    const occ = val(rich?.occurrenceType);
    if (ctx?.season && window && window.length > 0 && occ !== "always_available") {
      const seasonOk = (["spring", "summer", "autumn", "winter"] as const).includes(ctx.season as never)
        ? window.includes(ctx.season as "spring" | "summer" | "autumn" | "winter")
        : true;
      if (!seasonOk) blocks.push({ reason: "season_or_weather_unavailable", visibility: "shared", ownerParticipantId: null });
    }
    const cancelAbove = val(rich?.cancelOnWeatherAbove);
    if (cancelAbove !== undefined && ctx?.weatherSeverity !== undefined && ctx.weatherSeverity > cancelAbove) {
      blocks.push({ reason: "season_or_weather_unavailable", visibility: "shared", ownerParticipantId: null });
    }
  }

  return blocks;
}

// ─────────────────────────────────────────────────────────────────────────────
// §6 gate-first deriveFitLabel（2 段・閾値/weight は export＝非 opaque）
// ─────────────────────────────────────────────────────────────────────────────

interface LabelInput {
  key: FitComponentKey;
  value: number;
  available: boolean;
  signalBasis: FitComponent["signalBasis"];
}

export interface FitLabelOutput {
  fitLabel: EntityFitGrade;
  overall: number;
  affinity: number;
  comfortGate: number;
  vetoBreached: boolean;
}

/**
 * 2 段ロジック:
 *   Stage1 (non-compensatory veto): hardBlock 非空 → blocked。veto floor 抵触 → poor cap（他軸で覆らせない）。
 *   Stage2 (bounded compensatory): affinity=weightedMean(FIT_WEIGHTS) × comfortGate=min(burden,recovery)。
 */
export function deriveFitLabel(components: LabelInput[], hardBlocks: FitHardBlock[]): FitLabelOutput {
  const get = (k: FitComponentKey) => components.find((c) => c.key === k);
  const value = (k: FitComponentKey): number | null => {
    const c = get(k);
    return c && c.available ? c.value : null;
  };

  if (hardBlocks.length > 0) {
    return { fitLabel: "blocked", overall: 0, affinity: 0, comfortGate: 0, vetoBreached: true };
  }

  // Stage1 veto floor
  const burden = value("burdenFit");
  const relational = value("relationalFit");
  const role = value("roleFit");
  const vetoBreached =
    (burden !== null && burden < VETO_FLOORS.burdenFit) ||
    (relational !== null && relational < VETO_FLOORS.relationalFit) ||
    (role !== null && role < VETO_FLOORS.roleFit) ||
    (role !== null && role < ROLE_FLOOR);

  // Stage2 affinity = FIT_WEIGHTS で重み付け平均（available のみ再正規化）
  const affinityKeys: FitComponentKey[] = ["roleFit", "traitFit", "relationalFit", "budgetFit"];
  let wSum = 0;
  let acc = 0;
  for (const k of affinityKeys) {
    const v = value(k);
    if (v === null) continue;
    const w = FIT_WEIGHTS[k as keyof typeof FIT_WEIGHTS] ?? 0;
    acc += v * w;
    wSum += w;
  }
  const affinity = wSum === 0 ? NEUTRAL : acc / wSum;

  const comfortInputs = [burden, value("recoveryFit")].filter((x): x is number => x !== null);
  const comfortGate = comfortInputs.length === 0 ? 1 : Math.min(...comfortInputs);

  const overall = clamp(affinity * (0.5 + 0.5 * comfortGate));

  let fitLabel: EntityFitGrade;
  if (vetoBreached) fitLabel = "poor";
  else if (overall >= FIT_LABEL_THRESHOLDS.excellent) fitLabel = "excellent";
  else if (overall >= FIT_LABEL_THRESHOLDS.good) fitLabel = "good";
  else if (overall >= FIT_LABEL_THRESHOLDS.stretch) fitLabel = "stretch";
  else fitLabel = "poor";

  // excellent は observed な role/burden 根拠を要求（trait 推論のみ → good 止まり）
  if (fitLabel === "excellent") {
    const hasObservedBasis = components.some((c) => c.available && c.signalBasis === "observed" && (c.key === "roleFit" || c.key === "burdenFit"));
    if (!hasObservedBasis) fitLabel = "good";
  }

  return { fitLabel, overall, affinity, comfortGate, vetoBreached };
}

// ─────────────────────────────────────────────────────────────────────────────
// §7 per-participant 評価
// ─────────────────────────────────────────────────────────────────────────────

interface ParticipantEval {
  participantId: string;
  componentsFull: FitComponent[];
  hardBlocksFull: FitHardBlock[];
  hardBlocksShared: FitHardBlock[];
  labelFull: FitLabelOutput;
  labelShared: FitLabelOutput;
  confidence: number;
  onsenSpring?: string;
  chosenRoleFull: AnyEntityRole | null;
  categoryMismatch: boolean;
  /** C4 interaction 由来（shared-safe label 上限 + 情報 risk/missing） */
  labelCap: EntityFitGrade | null;
  interactionRiskFlags: RiskFlag[];
  interactionMissing: MissingDataQuestion[];
}

const COMPENSABILITY: Record<FitComponentKey, FitComponent["compensability"]> = {
  roleFit: "veto",
  traitFit: "compensatory",
  burdenFit: "veto",
  recoveryFit: "partial",
  relationalFit: "veto",
  budgetFit: "compensatory",
};

/** C3 presence-gated blend: construct 寄与を legacy raw に confidence 加重で畳む（非供給時=legacy 同一） */
function blendRaw(legacy: ComponentRaw, c: { value: number; available: boolean; confidence: number } | null | undefined): ComponentRaw {
  if (!c || !c.available) return legacy;
  if (!legacy.available) return { value: clamp(c.value), available: true, confidence: clamp(c.confidence), signalBasis: "observed" };
  const wL = clamp(legacy.confidence) || 1e-6;
  const wC = clamp(c.confidence) || 1e-6;
  return {
    value: clamp((legacy.value * wL + c.value * wC) / (wL + wC)),
    available: true,
    confidence: clamp(Math.max(legacy.confidence, c.confidence)),
    signalBasis: legacy.signalBasis,
  };
}

function buildComponents(
  user: FitUserState,
  entity: TravelObjectState,
  ctx: FitContext | undefined,
  relationship: RelationshipKind,
  blend?: ConstructBlend,
): { full: FitComponent[]; chosenRoleFull: AnyEntityRole | null; chosenRoleShared: AnyEntityRole | null; categoryMismatch: boolean; onsenSpring?: string } {
  const derived = deriveEntityTraits(entity);
  const exUserTrait = blend && blend.excludeUserTraitAxes.length > 0 ? new Set(blend.excludeUserTraitAxes) : undefined;
  const exBurden = blend && blend.excludeBurdenAxes.length > 0 ? new Set(blend.excludeBurdenAxes) : undefined;

  const roleFull = roleFit(user, entity, { includePrivate: true });
  const roleShared = roleFit(user, entity, { includePrivate: false });
  const traitFull = blendRaw(traitFit(user, derived.traits, roleFull.chosenRole, { includePrivate: true, excludeUserAxes: exUserTrait }), blend?.traitFull);
  const traitShared = blendRaw(traitFit(user, derived.traits, roleShared.chosenRole, { includePrivate: false, excludeUserAxes: exUserTrait }), blend?.traitShared);
  const burden = blendRaw(burdenFit(user, entity, ctx, exBurden), blend?.burden);
  const recovery = blendRaw(recoveryFit(user, entity, ctx), blend?.recovery);
  const relational = relationalFit(entity, relationship);
  // ★ roleFit blend: construct mealRole は private でない → full/shared 同一寄与（chosenRole は legacy 維持）
  const roleFullRaw = blendRaw(roleFull.raw, blend?.role);
  const roleSharedRaw = blendRaw(roleShared.raw, blend?.role);
  const budget = budgetFit(user, entity);

  const pair = (key: FitComponentKey, full: ComponentRaw, shared: ComponentRaw): FitComponent => {
    const weight = (FIT_WEIGHTS as Record<string, number>)[key] ?? 0;
    return {
      key,
      valueFull: full.value,
      valueShared: shared.value,
      weight,
      contribution: full.value * weight,
      compensability: COMPENSABILITY[key],
      available: full.available,
      availableShared: shared.available,
      signalBasis: full.signalBasis,
    };
  };

  const full: FitComponent[] = [
    pair("roleFit", roleFullRaw, roleSharedRaw),
    pair("traitFit", traitFull, traitShared),
    pair("burdenFit", burden, burden),
    pair("recoveryFit", recovery, recovery),
    pair("relationalFit", relational, relational),
    pair("budgetFit", budget, budget),
  ];

  return { full, chosenRoleFull: roleFull.chosenRole, chosenRoleShared: roleShared.chosenRole, categoryMismatch: roleFull.categoryMismatch, onsenSpring: derived.onsenSpring };
}

function labelInputs(components: FitComponent[], projection: "full" | "shared"): LabelInput[] {
  return components.map((c) => ({
    key: c.key,
    value: projection === "full" ? c.valueFull : c.valueShared,
    available: projection === "full" ? c.available : c.availableShared,
    signalBasis: c.signalBasis,
  }));
}

function evalParticipant(
  participantId: string,
  user: FitUserState,
  entity: TravelObjectState,
  ctx: FitContext | undefined,
  relationship: RelationshipKind,
  blend?: ConstructBlend,
  interBundle?: InteractionInputBundle,
): ParticipantEval {
  const built = buildComponents(user, entity, ctx, relationship, blend);
  let components = built.full;
  let hardBlocksFull = evaluateHardBlocks(user, entity, ctx);
  let labelCap: EntityFitGrade | null = null;
  let interactionRiskFlags: RiskFlag[] = [];
  let interactionMissing: MissingDataQuestion[] = [];

  // ★ C4 interaction pass（presence-gated・buildComponents 後・deriveFitLabel 前）
  if (interBundle) {
    const inter = runInteractions(interBundle);
    if (inter.componentDeltas.length > 0) {
      components = built.full.map((c) => {
        const dFull = inter.componentDeltas.filter((d) => d.component === c.key).reduce((s, d) => s + d.full, 0);
        const dShared = inter.componentDeltas.filter((d) => d.component === c.key).reduce((s, d) => s + d.shared, 0);
        if (dFull === 0 && dShared === 0) return c;
        const vFull = clamp(c.valueFull + dFull);
        return { ...c, valueFull: vFull, valueShared: clamp(c.valueShared + dShared), contribution: vFull * c.weight };
      });
    }
    hardBlocksFull = [...hardBlocksFull, ...inter.hardBlocks];
    labelCap = inter.labelCap;
    interactionRiskFlags = inter.riskFlags;
    interactionMissing = inter.missingQuestions;
  }
  // ★ C5: private mobility/accessibility 懸念（private な walkingLoad 選好）→ full のみ burdenFit penalty。
  //   shared には漏らさない（valueShared 不変・private mobility 状態を shared から逆算不能）。
  const privMob = interBundle?.userPrefs?.walkingLoad;
  if (privMob && privMob.visibility === "private") {
    const pen = 0.25 * clamp(privMob.value);
    components = components.map((c) =>
      c.key === "burdenFit" ? { ...c, valueFull: clamp(c.valueFull - pen), contribution: clamp(c.valueFull - pen) * c.weight } : c,
    );
  }
  const hardBlocksShared = hardBlocksFull.filter((b) => b.visibility === "shared");
  // gate-first → label、その後 ★ shared-safe labelCap を適用（excellent 不可化等）
  const lf = deriveFitLabel(labelInputs(components, "full"), hardBlocksFull);
  const ls = deriveFitLabel(labelInputs(components, "shared"), hardBlocksShared);
  const labelFull: FitLabelOutput = { ...lf, fitLabel: applyCap(lf.fitLabel, labelCap) };
  const labelShared: FitLabelOutput = { ...ls, fitLabel: applyCap(ls.fitLabel, labelCap) };

  // confidence = field confidence（source は confidence にのみ影響）× component 充足度
  const fieldConf = aggregateFieldConfidence(entity.provenance?.sources);
  // ★ confidence は shared-safe availability から（private-only 信号が confidence 経由で shared に漏れない）
  const availableWeight = components.filter((c) => c.availableShared).reduce((a, c) => a + c.weight, 0);
  const totalWeight = components.reduce((a, c) => a + c.weight, 0) || 1;
  const availabilityRatio = clamp(availableWeight / totalWeight);
  const confidence = clamp(0.4 * fieldConf + 0.6 * availabilityRatio);

  return {
    participantId,
    componentsFull: components,
    hardBlocksFull,
    hardBlocksShared,
    labelFull,
    labelShared,
    confidence,
    onsenSpring: built.onsenSpring,
    chosenRoleFull: built.chosenRoleFull,
    categoryMismatch: built.categoryMismatch,
    labelCap,
    interactionRiskFlags,
    interactionMissing,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §8 group 集約（least-misery aware・式固定）
// ─────────────────────────────────────────────────────────────────────────────

export function aggregateGroupFit(
  per: { participantId: string; overallShared: number; overallFull: number; fairnessSensitivity?: number }[],
): GroupAggregateFit {
  const fulls = per.map((p) => p.overallFull);
  const shareds = per.map((p) => p.overallShared);
  const fairnessVals = per.map((p) => p.fairnessSensitivity).filter((x): x is number => x !== undefined);
  const maxF = fairnessVals.length === 0 ? 0.25 : Math.max(...fairnessVals.map((x) => clamp(x)));
  const LM = clamp(0.5 + 0.4 * maxF, 0.5, 0.9);

  const aggregate = (xs: number[]): number => LM * Math.min(...xs) + (1 - LM) * mean(xs);
  const aggregateFull = aggregate(fulls);
  const aggregateShared = aggregate(shareds);

  // worst（tie は participantId localeCompare）
  const sortedFull = [...per].sort((a, b) => (a.overallFull - b.overallFull) || a.participantId.localeCompare(b.participantId));
  const worst = sortedFull[0];
  const worstScore = worst.overallFull;
  const floorBreached = worstScore < MISERY_FLOOR;

  return {
    overallScore: aggregateFull,
    worstParticipantId: worst.participantId,
    worstScore,
    floorBreached,
    strategy: "least_misery",
    usedStrategy: "least_misery",
    aggregateShared,
    aggregateFull,
    loweredByPrivate: aggregateFull < aggregateShared - 1e-9,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §9 説明 / mismatch / risk（top-K・visibility/derivedFrom タグ）
// ─────────────────────────────────────────────────────────────────────────────

const COMPONENT_JA: Record<FitComponentKey, string> = {
  roleFit: "目的との相性",
  traitFit: "好みの一致",
  burdenFit: "負荷の少なさ",
  recoveryFit: "回復のしやすさ",
  relationalFit: "同行者との相性",
  budgetFit: "予算の収まり",
};

const HARDBLOCK_JA: Record<FitHardBlock["reason"], string> = {
  red_line_violation: "譲れない条件に反します",
  intended_role_unsupported: "目的の使い方に向きません",
  budget_over_hard_ceiling: "予算の上限を超えます",
  hard_constraint_violation: "必須条件を満たしません",
  support_unavailable: "必要な支援が確保できません",
  season_or_weather_unavailable: "時期・天候で成立しません",
  safety_escalation: "夜間の安全に懸念があります",
};

function buildExplanations(
  components: FitComponent[],
  hardBlocks: FitHardBlock[],
  pick: "full" | "shared",
): { whyFits: MismatchReason[]; whyMayFail: MismatchReason[]; mismatchReasons: MismatchReason[]; riskFlags: RiskFlag[] } {
  const v = (c: FitComponent) => (pick === "full" ? c.valueFull : c.valueShared);
  const sorted = [...components].filter((c) => c.available).sort((a, b) => v(b) - v(a) || a.key.localeCompare(b.key));
  const whyFits: MismatchReason[] = sorted
    .filter((c) => v(c) >= 0.7)
    .slice(0, 2)
    .map((c) => ({ code: `strong_${c.key}`, visibility: "shared", derivedFrom: "shared", owner: null }));

  const whyMayFail: MismatchReason[] = [];
  for (const b of hardBlocks) {
    whyMayFail.push({
      code: b.reason,
      visibility: b.visibility,
      derivedFrom: b.visibility === "private" ? "private" : "shared",
      owner: b.ownerParticipantId,
    });
  }
  for (const c of sorted.filter((c) => v(c) < 0.4).slice(0, 2)) {
    whyMayFail.push({ code: `weak_${c.key}`, visibility: "shared", derivedFrom: "shared", owner: null });
  }

  const mismatchReasons = whyMayFail;
  const riskFlags: RiskFlag[] = hardBlocks.map((b) => ({
    code: b.reason,
    visibility: b.visibility,
    derivedFrom: b.visibility === "private" ? "private" : "shared",
  }));

  return { whyFits, whyMayFail, mismatchReasons, riskFlags };
}

function buildRationale(
  fitLabel: EntityFitGrade,
  whyFits: MismatchReason[],
  whyMayFail: MismatchReason[],
  onsenSpring: string | undefined,
): ViewerScopedRationale {
  const top = whyFits[0];
  const risk = whyMayFail.find((r) => r.derivedFrom === "shared");
  let shared: string;
  if (fitLabel === "blocked") {
    shared = "この条件では合いません。";
  } else {
    const fitPhrase = top ? COMPONENT_JA[top.code.replace("strong_", "") as FitComponentKey] ?? "相性" : "全体の相性";
    const onsenPhrase = onsenSpring ? `（温泉の泉質: ${onsenSpring}）` : "";
    shared = `${fitPhrase}が良い対象です${onsenPhrase}。`;
    if (risk) {
      const rk = risk.code.startsWith("weak_") ? COMPONENT_JA[risk.code.replace("weak_", "") as FitComponentKey] : HARDBLOCK_JA[risk.code as FitHardBlock["reason"]];
      if (rk) shared += `ただし${rk}に注意。`;
    }
  }
  return { shared, forParticipant: {} };
}

// ─────────────────────────────────────────────────────────────────────────────
// §10 public: evaluateFit / evaluateFitBatch
// ─────────────────────────────────────────────────────────────────────────────

/** C3 construct rollup の任意入力（非供給時=従来 legacy 挙動・34 テスト不変） */
export interface EvaluateFitConstructInput {
  /** entity の typed 指標観測（registry の per-construct key のみ） */
  entityIndicators?: ConstructIndicatorInput;
  /** participantId → その人の construct 選好（solo は "self"） */
  userPrefs?: Record<string, ConstructPreferenceInput>;
}

export interface EvaluateFitArgs {
  entity: TravelObjectState;
  subject: FitSubject;
  context?: FitContext;
  /** ★ optional・presence-gated。未供給なら construct 寄与ゼロ＝従来挙動 */
  constructInput?: EvaluateFitConstructInput;
  /**
   * ★ C5 optional・presence-gated。ConnectionState を H_route 構築子 observation(派生・provenance付)に変換し
   * C3 rollup へ供給して burdenFit/recoveryFit を修飾する。**route 推薦/予約/scheduling 権限を生成しない**。
   */
  routeInput?: RouteChainState;
}

export function evaluateFit(args: EvaluateFitArgs): FitResult {
  const { entity, subject, context } = args;
  const participants =
    subject.kind === "solo"
      ? [{ participantId: "self", state: subject.user }]
      : subject.participants;
  const relationship: RelationshipKind = subject.kind === "solo" ? "solo" : subject.relationship;
  const ci = args.constructInput;
  // ★ C5: ConnectionState → 派生 H_route 観測（direct 観測が優先）。route+construct を 1 入力に統一。
  const routeDerived = args.routeInput ? deriveRouteObservations(args.routeInput) : undefined;
  const effectiveEntityIndicators = routeDerived ? mergeRouteIntoIndicators(routeDerived, ci?.entityIndicators) : ci?.entityIndicators;
  const hasInput = ci !== undefined || routeDerived !== undefined;

  const evals = participants.map((p) => {
    const blendInput: ConstructBlendInput | undefined = hasInput
      ? { entityIndicators: effectiveEntityIndicators, userPrefs: ci?.userPrefs?.[p.participantId] }
      : undefined;
    const blend = computeConstructBlend(p.state, entity, context, blendInput);
    const interBundle: InteractionInputBundle | undefined = hasInput || args.routeInput
      ? { entityIndicators: effectiveEntityIndicators, ctx: context, isSolo: subject.kind === "solo", userPrefs: ci?.userPrefs?.[p.participantId], routeChain: args.routeInput }
      : undefined;
    return evalParticipant(p.participantId, p.state, entity, context, relationship, blend, interBundle);
  });
  // ★ shared-safe な label 上限を全 participant で集約（strictest）
  const caps = evals.map((e) => e.labelCap).filter((c): c is EntityFitGrade => c !== null);
  const resultCap: EntityFitGrade | null = caps.length > 0 ? caps.reduce((a, b) => applyCap(a, b)) : null;

  const perParticipantFit: PerParticipantFit[] = evals.map((e) => ({
    participantId: e.participantId,
    fitLabel: e.labelFull.fitLabel,
    overall: e.labelFull.overall,
    fitLabelShared: e.labelShared.fitLabel,
    overallShared: e.labelShared.overall,
  }));

  const group = aggregateGroupFit(
    evals.map((e, i) => ({
      participantId: e.participantId,
      overallFull: e.labelFull.fitLabel === "blocked" ? 0 : e.labelFull.overall,
      overallShared: e.labelShared.fitLabel === "blocked" ? 0 : e.labelShared.overall,
      fairnessSensitivity: participants[i].state.fairnessSensitivity,
    })),
  );

  // binding participant = worst（group の least-misery を決める）。solo は唯一。
  const worstId = group.worstParticipantId;
  const binding = evals.find((e) => e.participantId === worstId) ?? evals[0];

  // solo は binding の label をそのまま。group は floor/overallScore を閾値判定。
  const groupLabel: EntityFitGrade = applyCap(
    subject.kind === "solo"
      ? binding.labelFull.fitLabel
      : deriveGroupLabel(binding.labelFull.fitLabel === "blocked", group.floorBreached, group.overallScore),
    resultCap,
  );

  const expl = buildExplanations(binding.componentsFull, binding.hardBlocksFull, "full");
  const rationale = buildRationale(groupLabel, expl.whyFits, expl.whyMayFail, binding.onsenSpring);

  // conflicts（group のみ・最良 vs 最悪が trait/role で割れる）
  const conflicts: GroupConflict[] = [];
  if (subject.kind === "group" && evals.length >= 2) {
    const sortedByOverall = [...evals].sort((a, b) => (b.labelFull.overall - a.labelFull.overall) || a.participantId.localeCompare(b.participantId));
    const favored = sortedByOverall[0];
    const sacrificed = sortedByOverall[sortedByOverall.length - 1];
    if (favored.participantId !== sacrificed.participantId && favored.labelFull.overall - sacrificed.labelFull.overall > 0.2) {
      conflicts.push({
        axisOrRole: "overall",
        favoredParticipantId: favored.participantId,
        sacrificedParticipantId: sacrificed.participantId,
        severity: clamp(favored.labelFull.overall - sacrificed.labelFull.overall),
        visibility: "shared",
      });
    }
  }

  // confidence / labelStability
  const confidence = clamp(mean(evals.map((e) => e.confidence)));
  const slack = (1 - confidence) * 0.15;
  const optimistic = gradeOf(clamp(group.overallScore + slack));
  const pessimistic = gradeOf(clamp(group.overallScore - slack));
  const labelStability: FitResult["labelStability"] =
    binding.labelFull.fitLabel === "blocked" ? "stable" : optimistic === pessimistic ? "stable" : "fragile";

  const missingDataQuestions: MissingDataQuestion[] = [];
  const availableWeight = binding.componentsFull.filter((c) => c.available).reduce((a, c) => a + c.weight, 0);
  if (availableWeight < 0.5) missingDataQuestions.push({ field: "core_components", reason: "low_confidence" });
  if (labelStability === "fragile") missingDataQuestions.push({ field: "label", reason: "label_unstable" });
  // 安全側 unknown（hardBlock になった未確認）→ 質問昇格
  for (const hc of args.subject.kind === "solo" ? args.subject.user.hardConstraints ?? [] : []) {
    if (hc.axis === "allergy" && (!entity.hardProfile?.allergens || entity.hardProfile.allergens.handling === "unknown")) {
      missingDataQuestions.push({ field: `allergy:${hc.descriptor}`, reason: "safety_unknown" });
    }
  }
  // C4 interaction 由来の情報 risk/missing を合流（full・shared 射影では §toSharedFitView が再導出）
  missingDataQuestions.push(...binding.interactionMissing);

  return {
    authoritative: false,
    fitLabel: groupLabel,
    components: binding.componentsFull,
    hardBlocks: binding.hardBlocksFull,
    mismatchReasons: expl.mismatchReasons,
    whyFits: expl.whyFits,
    whyMayFail: expl.whyMayFail,
    riskFlags: [...expl.riskFlags, ...binding.interactionRiskFlags],
    rationale,
    perParticipantFit,
    groupAggregateFit: group,
    conflicts,
    confidence,
    labelStability,
    labelCap: resultCap,
    missingDataQuestions,
    placeRefId: entity.placeRefId,
    subjectKind: subject.kind,
  };
}

function gradeOf(overall: number): EntityFitGrade {
  if (overall >= FIT_LABEL_THRESHOLDS.excellent) return "excellent";
  if (overall >= FIT_LABEL_THRESHOLDS.good) return "good";
  if (overall >= FIT_LABEL_THRESHOLDS.stretch) return "stretch";
  return "poor";
}

function deriveGroupLabel(bindingBlocked: boolean, floorBreached: boolean, overallScore: number): EntityFitGrade {
  if (bindingBlocked) return "blocked";
  if (floorBreached) return "poor";
  return gradeOf(overallScore);
}

export function evaluateFitBatch(entities: TravelObjectState[], subject: FitSubject, context?: FitContext): FitResult[] {
  return entities
    .map((entity) => evaluateFit({ entity, subject, context }))
    .sort((a, b) => a.placeRefId.localeCompare(b.placeRefId));
}

// ─────────────────────────────────────────────────────────────────────────────
// §11 public: shared 射影（M5・二層 + 要素削除）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * shared ビュー: 相手に見せてよい display 専用形。private 由来の連続値/descriptor を構造的に塞ぐ。
 *   - components: valueFull を valueShared に揃える（private 差分が shared 数値に現れない）。
 *   - shared label を shared component + shared hardBlock から再導出（private block は除去）。
 *   - mismatch/whyFits/whyMayFail/risk/missingData/conflicts の private 由来要素を**削除**。
 *   - groupAggregate は aggregateShared を採用・worst が private 由来なら非露出・loweredByPrivate を隠す。
 *   - rationale.forParticipant 全削除。
 * ★ authoritative は false のまま（実行権限ではない）。
 */
export function toSharedFitView(r: FitResult): FitResult {
  // 1. components: valueFull を valueShared に揃える（private 差分を構造的に消す）
  const sharedComponents: FitComponent[] = r.components.map((c) => ({
    ...c,
    valueFull: c.valueShared,
    contribution: c.valueShared * c.weight,
    available: c.availableShared, // ★ shared 可用性に揃える（private-only 信号を available で漏らさない）
    signalBasis: c.availableShared ? c.signalBasis : "default", // ★ shared 信号が無ければ basis も漏らさない
  }));
  const sharedHardBlocks = r.hardBlocks.filter((b) => b.visibility === "shared");

  // 2. shared label / 説明を **shared 値から再導出**（full 由来を一切持ち込まない）
  const sharedBindingLabel = deriveFitLabel(labelInputs(sharedComponents, "shared"), sharedHardBlocks);
  const sExpl = buildExplanations(sharedComponents, sharedHardBlocks, "shared");

  // 3. per-participant: precompute 済みの shared 値のみ採用
  const sharedPer: PerParticipantFit[] = r.perParticipantFit.map((p) => ({
    participantId: p.participantId,
    fitLabel: p.fitLabelShared,
    overall: p.overallShared,
    fitLabelShared: p.fitLabelShared,
    overallShared: p.overallShared,
  }));

  // 4. group: aggregateShared を採用し worst/floor を shared 値から再計算
  const group = r.groupAggregateFit;
  let sharedGroup: GroupAggregateFit | null = null;
  let sharedFloorBreached = false;
  if (group) {
    const sortedShared = [...sharedPer].sort((a, b) => a.overallShared - b.overallShared || a.participantId.localeCompare(b.participantId));
    const worst = sortedShared[0];
    sharedFloorBreached = worst.overallShared < MISERY_FLOOR;
    sharedGroup = {
      ...group,
      overallScore: group.aggregateShared,
      worstParticipantId: worst.participantId,
      worstScore: worst.overallShared,
      floorBreached: sharedFloorBreached,
      aggregateFull: group.aggregateShared,
      loweredByPrivate: false,
    };
  }

  // 5. FitResult.fitLabel: solo は binding shared label・group は floor/overallScore
  // ★ shared-safe labelCap を shared label にも適用（安全 unknown は shared でも fully-safe にしない）
  const fitLabel: EntityFitGrade = applyCap(
    r.subjectKind === "solo"
      ? sharedBindingLabel.fitLabel
      : deriveGroupLabel(sharedBindingLabel.fitLabel === "blocked", sharedFloorBreached, group ? group.aggregateShared : 0),
    r.labelCap,
  );

  // 6. labelStability / missingData を shared 値から再計算（full の不安定性を持ち込まない）
  const baseScore = group ? group.aggregateShared : sharedBindingLabel.overall;
  const slack = (1 - r.confidence) * 0.15;
  const stable = gradeOf(clamp(baseScore + slack)) === gradeOf(clamp(baseScore - slack));
  const labelStability: FitResult["labelStability"] = fitLabel === "blocked" ? "stable" : stable ? "stable" : "fragile";

  const availableWeight = sharedComponents.filter((c) => c.available).reduce((a, c) => a + c.weight, 0);
  const sharedMissing: MissingDataQuestion[] = [];
  if (availableWeight < 0.5) sharedMissing.push({ field: "core_components", reason: "low_confidence" });
  if (labelStability === "fragile") sharedMissing.push({ field: "label", reason: "label_unstable" });

  // 7. conflicts: shared per-participant overall から再計算（private 由来を除去）
  const sharedConflicts: GroupConflict[] = [];
  if (r.subjectKind === "group" && sharedPer.length >= 2) {
    const sorted = [...sharedPer].sort((a, b) => b.overallShared - a.overallShared || a.participantId.localeCompare(b.participantId));
    const favored = sorted[0];
    const sacrificed = sorted[sorted.length - 1];
    if (favored.participantId !== sacrificed.participantId && favored.overallShared - sacrificed.overallShared > 0.2) {
      sharedConflicts.push({
        axisOrRole: "overall",
        favoredParticipantId: favored.participantId,
        sacrificedParticipantId: sacrificed.participantId,
        severity: clamp(favored.overallShared - sacrificed.overallShared),
        visibility: "shared",
      });
    }
  }

  const sharedRationale = buildRationale(fitLabel, sExpl.whyFits, sExpl.whyMayFail, undefined);

  return {
    authoritative: false,
    fitLabel,
    components: sharedComponents,
    hardBlocks: sharedHardBlocks,
    mismatchReasons: sExpl.mismatchReasons,
    whyFits: sExpl.whyFits,
    whyMayFail: sExpl.whyMayFail,
    riskFlags: sExpl.riskFlags,
    rationale: sharedRationale,
    perParticipantFit: sharedPer,
    groupAggregateFit: sharedGroup,
    conflicts: sharedConflicts,
    confidence: r.confidence,
    labelStability,
    labelCap: r.labelCap, // shared-safe（private は別途 hardBlock 経由で full のみに効く）
    missingDataQuestions: sharedMissing,
    placeRefId: r.placeRefId,
    subjectKind: r.subjectKind,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §12 ★ 実行権限の唯一の判定口（fit は決して権限を生成しない・literal false）
// ─────────────────────────────────────────────────────────────────────────────

export function hasFitActionAuthority(_r: FitResult): false {
  return false;
}

// 網羅性 lock（grades の参照保持・dead-code でない静的整合）
void ENTITY_FIT_GRADES;
