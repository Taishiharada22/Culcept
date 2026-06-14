/**
 * T11-C2 — Maximum State Coverage レジストリ の最小 pure helpers（**pure・未配線**）
 *
 * 設計正本: docs/t11-a3.1-maximum-state-coverage.md §10-§11
 *
 * 役割: `fit-constructs.ts` の typed registry を**検証/参照**するだけの低リスク helper 群。
 *   - **`evaluateFit` を書き換えない**（registry が先・rollup/interaction の本接続は後続バンドル）。
 *   - 既存 34 fit テスト・挙動は不変。opaque scoring を導入しない。
 *   - `computeConstructScore` は**独立 pure 関数**（fit-core から呼ばれない・小さな安全部分集合のみ）。
 *
 * 厳格性: 型 + 決定論のみ。fetch/API/DB/UI/時刻API/乱数 なし。import は ./fit-constructs / ./fit-types のみ。
 */

import {
  CONSTRUCT_REGISTRY,
  CONSTRUCT_WIRING,
  CONTEXT_ROLLUP_OVERRIDE,
  INDICATOR_REGISTRY,
  INTERACTION_REGISTRY,
  ROLLUP_WEIGHTS,
  WIRED_CONSTRUCTS,
  type ConstructAxis,
  type ConstructFamilyId,
  type ConstructIndicatorInput,
  type ConstructPreferenceInput,
  type InteractionTerm,
  type LayerId,
  type MissingDataPolicy,
  type WiredConstruct,
} from "./fit-constructs";
import { FIT_COMPONENT_KEYS, type EntityBurdenAxis, type FitContext, type FitUserState, type SharedTraitAxis, type TravelObjectState } from "./fit-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 参照 helpers（registry getter・決定論）
// ─────────────────────────────────────────────────────────────────────────────

export function getConstructFamily(axis: ConstructAxis): ConstructFamilyId {
  return CONSTRUCT_REGISTRY[axis].family;
}

export function getIndicatorsForConstruct(axis: ConstructAxis): readonly string[] {
  return INDICATOR_REGISTRY[axis];
}

export function getMissingDataPolicy(axis: ConstructAxis): MissingDataPolicy {
  return CONSTRUCT_REGISTRY[axis].missingData;
}

export function getLayerPlacement(axis: ConstructAxis): { primary: LayerId; secondary?: LayerId } {
  const spec = CONSTRUCT_REGISTRY[axis];
  return spec.secondaryLayer ? { primary: spec.layer, secondary: spec.secondaryLayer } : { primary: spec.layer };
}

export function getConstructsByFamily(family: ConstructFamilyId): ConstructAxis[] {
  return (Object.keys(CONSTRUCT_REGISTRY) as ConstructAxis[])
    .filter((a) => CONSTRUCT_REGISTRY[a].family === family)
    .sort((x, y) => x.localeCompare(y));
}

export function getConstructsByLayer(layer: LayerId): ConstructAxis[] {
  return (Object.keys(CONSTRUCT_REGISTRY) as ConstructAxis[])
    .filter((a) => CONSTRUCT_REGISTRY[a].layer === layer || CONSTRUCT_REGISTRY[a].secondaryLayer === layer)
    .sort((x, y) => x.localeCompare(y));
}

export function getInteractionSpec(id: string): InteractionTerm | null {
  return INTERACTION_REGISTRY.find((t) => t.id === id) ?? null;
}

export interface RegistryStats {
  families: number;
  constructs: number;
  indicators: number;
  interactions: number;
}

export function registryStats(): RegistryStats {
  const axes = Object.keys(CONSTRUCT_REGISTRY) as ConstructAxis[];
  const families = new Set(axes.map((a) => CONSTRUCT_REGISTRY[a].family));
  const indicators = axes.reduce((n, a) => n + INDICATOR_REGISTRY[a].length, 0);
  return { families: families.size, constructs: axes.length, indicators, interactions: INTERACTION_REGISTRY.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 検証 helpers（型を補う runtime ガード・二重計上/veto/欠落 を機械検出）
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistryValidation {
  ok: boolean;
  errors: string[];
}

/** 全 construct が indicator≥1 / layer / missingData / family を持つ・INDICATOR↔CONSTRUCT 整合 */
export function validateConstructRegistry(): RegistryValidation {
  const errors: string[] = [];
  const axes = Object.keys(CONSTRUCT_REGISTRY) as ConstructAxis[];
  const indAxes = new Set(Object.keys(INDICATOR_REGISTRY));
  for (const a of axes) {
    if (!indAxes.has(a)) errors.push(`construct ${a}: no indicator entry`);
    if ((INDICATOR_REGISTRY[a] as readonly string[]).length === 0) errors.push(`construct ${a}: 0 indicators`);
    const spec = CONSTRUCT_REGISTRY[a];
    if (!spec.layer) errors.push(`construct ${a}: missing layer`);
    if (!spec.missingData) errors.push(`construct ${a}: missing missingData policy`);
    if (spec.valence.length === 0) errors.push(`construct ${a}: empty valence`);
  }
  // INDICATOR にあって CONSTRUCT に無い key
  for (const k of indAxes) {
    if (!(k in CONSTRUCT_REGISTRY)) errors.push(`indicator key ${k}: no construct spec`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * ★ 全 interaction の `modifies` が**既存の component / construct / hardBlock** を指すか検証。
 * これにより「相互作用が新たな並列スコアを作る」ことを構造的に禁止（§4.2 不変条件）。
 */
export function validateInteractionTargets(): RegistryValidation {
  const errors: string[] = [];
  const comps = new Set<string>(FIT_COMPONENT_KEYS as readonly string[]);
  const ids = new Set<string>();
  for (const t of INTERACTION_REGISTRY) {
    if (ids.has(t.id)) errors.push(`interaction ${t.id}: duplicate id`);
    ids.add(t.id);
    const m = t.modifies;
    if (m.kind === "component") {
      if (!comps.has(m.key)) errors.push(`interaction ${t.id}: modifies unknown component ${m.key}`);
    } else if (m.kind === "construct") {
      if (!(m.axis in CONSTRUCT_REGISTRY)) errors.push(`interaction ${t.id}: modifies unknown construct ${m.axis}`);
    } else if (m.kind !== "hardBlock") {
      errors.push(`interaction ${t.id}: modifies invalid kind`);
    }
    if (!t.confidence) errors.push(`interaction ${t.id}: missing confidence rule`);
  }
  return { ok: errors.length === 0, errors };
}

/** 相互作用は常に「既存の修飾子」（新並列スコアを作らない）= 型で保証された不変条件の runtime 確認 */
export function isInteractionModifierOnly(term: InteractionTerm): boolean {
  return term.modifies.kind === "component" || term.modifies.kind === "construct" || term.modifies.kind === "hardBlock";
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 confidence 連鎖（相互作用は最弱入力の確度を継ぐ・§4.3）
// ─────────────────────────────────────────────────────────────────────────────

export function interactionConfidence(rule: InteractionTerm["confidence"], inputConfidences: number[]): number {
  if (inputConfidences.length === 0) return 0;
  const clamped = inputConfidences.map((c) => (c < 0 ? 0 : c > 1 ? 1 : c));
  if (rule === "product_of_inputs") return clamped.reduce((a, b) => a * b, 1);
  return Math.min(...clamped); // min_of_inputs（弱リンク）
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 独立 rollup（小さな安全部分集合・fit-core から呼ばれない・registry 検証用）
// ─────────────────────────────────────────────────────────────────────────────

export type IndicatorObservation = { value: number; confidence: number } | null;

export interface ConstructScore {
  score: number;
  confidence: number;
  available: boolean;
  usedIndicators: number;
}

/**
 * construct スコアの**独立 pure 計算**（指標の confidence 重み付き平均・欠損は除外し残 weight 再正規化）。
 * ★ `evaluateFit` から呼ばれない（registry-only・挙動不変）。後続バンドルで rollup を本接続する際の基礎。
 * weights 未指定は等重み。score は指標値域 [-1,1] を踏襲（呼び出し側責務）。
 */
export function computeConstructScore(
  axis: ConstructAxis,
  observations: Partial<Record<string, IndicatorObservation>>,
  weights?: Partial<Record<string, number>>,
): ConstructScore {
  const keys = INDICATOR_REGISTRY[axis];
  let wSum = 0;
  let acc = 0;
  let confAcc = 0;
  let used = 0;
  for (const k of keys) {
    const o = observations[k];
    if (!o) continue; // 欠損は除外（distance 加算しない）
    const w = weights?.[k] ?? 1;
    const wc = w * (o.confidence < 0 ? 0 : o.confidence > 1 ? 1 : o.confidence);
    acc += o.value * wc;
    wSum += wc;
    confAcc += o.confidence;
    used += 1;
  }
  if (used === 0 || wSum === 0) return { score: 0, confidence: 0, available: false, usedIndicators: 0 };
  return { score: acc / wSum, confidence: confAcc / used, available: true, usedIndicators: used };
}

// ═════════════════════════════════════════════════════════════════════════════
// §5 T11-C3 construct rollup → fit-core 接続用 helpers（pure・fit-core を import しない）
// ═════════════════════════════════════════════════════════════════════════════

const cl = (x: number, lo = 0, hi = 1): number => (x < lo ? lo : x > hi ? hi : x);
const match = (a: number, b: number): number => 1 - Math.abs(a - b) / 2; // -1..1 → fit 0..1

/** valence 多因子（第一 slice は recoveryStyle + tripIntent・valenceSensitive のみ動く） */
export function valenceMultiplier(axis: WiredConstruct, user: FitUserState, ctx?: FitContext): number {
  if (!CONSTRUCT_WIRING[axis].valenceSensitive) return 1;
  // tranquility 等: rest_to_recover で価値・stimulation_to_recover で退屈（符号弱化）
  const rs = user.recoveryStyle;
  let m = rs === "rest_to_recover" ? 1.0 : rs === "stimulation_to_recover" ? 0.4 : 0.7;
  if (ctx?.tripIntent === "recovery") m *= 1.1;
  else if (ctx?.tripIntent === "exploration") m *= 0.85;
  return cl(m, 0, 1.3);
}

export interface RawLite {
  value: number;
  available: boolean;
  confidence: number;
}

export interface ConstructBlend {
  /** traitFit へ（tranquility/hygiene/noveltySeeking の集約・二層） */
  traitFull: RawLite | null;
  traitShared: RawLite | null;
  /** burdenFit へ（mobilityBurden） */
  burden: RawLite | null;
  /** roleFit へ（mealRoleAffinity・food のみ） */
  role: RawLite | null;
  /** recoveryFit へ（arrivalFreshness） */
  recovery: RawLite | null;
  /** 二重計上回避: legacy traitFit の user-trait loop から除外する軸 */
  excludeUserTraitAxes: SharedTraitAxis[];
  /** 二重計上回避: legacy burdenFit から除外する entity 負荷軸 */
  excludeBurdenAxes: EntityBurdenAxis[];
}

export interface ConstructBlendInput {
  entityIndicators?: ConstructIndicatorInput;
  /** この participant の construct 選好 */
  userPrefs?: ConstructPreferenceInput;
}

interface Contribution {
  component: WiredConstructComponent;
  full: RawLite;
  shared: RawLite;
}
type WiredConstructComponent = (typeof CONSTRUCT_WIRING)[WiredConstruct]["component"];

/** 1 construct の entity スコア（指標 rollup または legacy trait 軸）。null=未供給 */
function entityScoreOf(
  axis: WiredConstruct,
  entity: TravelObjectState,
  input: ConstructBlendInput,
  ctx?: FitContext,
): { value: number; confidence: number } | null {
  const w = CONSTRUCT_WIRING[axis];
  if (w.entityScoreFrom === "legacy_trait") {
    const t = w.legacyTraitAxis ? entity.traits?.[w.legacyTraitAxis] : undefined;
    if (!t) return null;
    return { value: t.value, confidence: t.confidence };
  }
  // indicators rollup（public 型は厳格・内部読みは均一 record にキャストして homomorphic 添字を回避）
  const allObs = input.entityIndicators as Partial<Record<ConstructAxis, Partial<Record<string, { value: number; confidence: number }>>>> | undefined;
  const obs = allObs?.[axis];
  if (!obs) return null;
  const base = ROLLUP_WEIGHTS[axis] ?? {};
  const override = ctx?.tripIntent ? CONTEXT_ROLLUP_OVERRIDE[ctx.tripIntent]?.[axis] : undefined;
  const weights = override ? { ...base, ...override } : base;
  const r = computeConstructScore(axis, obs as Partial<Record<string, IndicatorObservation>>, weights);
  if (!r.available) return null;
  return { value: r.score, confidence: r.confidence };
}

/** 1 construct の fit 寄与（kind 別写像・二層）。null=非発火（presence-gated） */
function constructContribution(
  axis: WiredConstruct,
  user: FitUserState,
  entity: TravelObjectState,
  ctx: FitContext | undefined,
  input: ConstructBlendInput,
): Contribution | null {
  const w = CONSTRUCT_WIRING[axis];
  if (w.categoryGate && entity.category !== w.categoryGate) return null;
  // safety_critical guard（第一 slice の構築子に該当なしだが将来 construct 用に fail-closed を組込む）
  if (CONSTRUCT_REGISTRY[axis].missingData === "safety_critical") {
    const allObs = input.entityIndicators as Partial<Record<ConstructAxis, Record<string, unknown>>> | undefined;
    const obs = allObs?.[axis];
    if (!obs || Object.keys(obs).length === 0) return null; // 安全 critical 未確認は寄与させない（満たさず）
  }
  const es = entityScoreOf(axis, entity, input, ctx);
  if (!es) return null;

  const pref = input.userPrefs?.[axis] ?? (w.userPrefFallbackTraitAxis ? user.traits?.[w.userPrefFallbackTraitAxis] : undefined);
  const isPrivate = (input.userPrefs?.[axis]?.visibility ?? undefined) === "private";

  if (w.kind === "trait_match") {
    if (!pref) return null; // 照合先 user 選好が無ければ非発火
    const v = cl(match(pref.value, es.value) * valenceMultiplier(axis, user, ctx));
    const conf = cl(es.confidence) * cl(pref.confidence);
    const full: RawLite = { value: v, available: true, confidence: conf };
    const shared: RawLite = isPrivate ? { value: 0, available: false, confidence: 0 } : full;
    return { component: "traitFit", full, shared };
  }
  if (w.kind === "burden_penalty") {
    const tol = (w.toleranceAxis ? user.tolerances[w.toleranceAxis] : undefined) ?? 0.5;
    const effTol = cl(tol - 0.4 * (ctx?.todayFatigueSpike ?? 0));
    const v = cl(1 - cl(es.value) * (1 - effTol));
    const raw: RawLite = { value: v, available: true, confidence: cl(es.confidence) };
    return { component: "burdenFit", full: raw, shared: raw };
  }
  if (w.kind === "role_affinity") {
    const raw: RawLite = { value: cl(es.value), available: true, confidence: cl(es.confidence) };
    return { component: "roleFit", full: raw, shared: raw };
  }
  // recovery_value
  const raw: RawLite = { value: cl(es.value), available: true, confidence: cl(es.confidence) };
  return { component: "recoveryFit", full: raw, shared: raw };
}

const aggRaw = (xs: RawLite[]): RawLite | null => {
  const a = xs.filter((x) => x.available);
  if (a.length === 0) return null;
  let wSum = 0;
  let acc = 0;
  for (const x of a) {
    const wc = cl(x.confidence) || 1e-6;
    acc += x.value * wc;
    wSum += wc;
  }
  return { value: cl(acc / wSum), available: true, confidence: cl(a.reduce((s, x) => s + x.confidence, 0) / a.length) };
};

/**
 * presence-gated blend 入力を計算（fit-core が消費）。
 * construct 入力が無ければ全 null + 空 exclude → fit-core は legacy 挙動（従来 34 テスト不変）。
 */
export function computeConstructBlend(
  user: FitUserState,
  entity: TravelObjectState,
  ctx: FitContext | undefined,
  input: ConstructBlendInput | undefined,
): ConstructBlend {
  const empty: ConstructBlend = { traitFull: null, traitShared: null, burden: null, role: null, recovery: null, excludeUserTraitAxes: [], excludeBurdenAxes: [] };
  if (!input || (!input.entityIndicators && !input.userPrefs)) return empty;

  const traitFulls: RawLite[] = [];
  const traitShareds: RawLite[] = [];
  const burdens: RawLite[] = []; // ★ 複数 burden construct(walking/stairs/transfer/baggage)を集約
  let role: RawLite | null = null;
  let recovery: RawLite | null = null;
  const exTrait: SharedTraitAxis[] = [];
  const exBurden: EntityBurdenAxis[] = [];

  for (const axis of WIRED_CONSTRUCTS) {
    const c = constructContribution(axis, user, entity, ctx, input);
    if (!c) continue;
    const w = CONSTRUCT_WIRING[axis];
    for (const a of w.supersedeUserTraitAxes ?? []) if (!exTrait.includes(a)) exTrait.push(a);
    for (const a of w.supersedeBurdenAxes ?? []) if (!exBurden.includes(a)) exBurden.push(a);
    if (c.component === "traitFit") {
      traitFulls.push(c.full);
      traitShareds.push(c.shared);
    } else if (c.component === "burdenFit") burdens.push(c.full);
    else if (c.component === "roleFit") role = c.full;
    else if (c.component === "recoveryFit") recovery = c.full;
  }

  return {
    traitFull: aggRaw(traitFulls),
    traitShared: aggRaw(traitShareds),
    burden: aggRaw(burdens),
    role,
    recovery,
    excludeUserTraitAxes: exTrait,
    excludeBurdenAxes: exBurden,
  };
}
