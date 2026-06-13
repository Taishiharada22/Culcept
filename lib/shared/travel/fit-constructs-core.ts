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
  INDICATOR_REGISTRY,
  INTERACTION_REGISTRY,
  type ConstructAxis,
  type ConstructFamilyId,
  type InteractionTerm,
  type LayerId,
  type MissingDataPolicy,
} from "./fit-constructs";
import { FIT_COMPONENT_KEYS } from "./fit-types";

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
