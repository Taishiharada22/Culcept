/**
 * M2 PersonalizationPort — pure 写像（snapshot → PlanParams / TravelTraitsV0）
 *
 * 設計: docs/m2-personalization-port-design.md §3（v0 写像・初期仮説）
 *
 * 原則:
 *   - pure・決定論（I/O なし・Date.now なし）
 *   - 各導出値 = 源泉軸の confidence 加重平均 × カバレッジ
 *   - confidence < CONFIDENCE_FLOOR の値は**中立デフォルトに丸める**（source: "default"）。
 *     consumer（質問生成 / M1 micro 質問）が「まだ聞くべき軸」を判別できるよう
 *     confidence は丸め後も実測値のまま返す。
 *   - 写像に使う軸は traitAxes.ts の実在キーのみ（axisRegistry の frozen 軸は不使用）
 *   - 実ラベルに対応しない param は捏造しない（morningness は源泉なし → default 固定。
 *     energy_rhythm のラベルは「静かに充電↔活発に消費」であり朝型度ではない）
 */

import type { TraitAxisKey } from "../../stargazer/traitAxes";
import {
  TRAVEL_TRAIT_KEYS_V0,
  type DerivedValue,
  type PersonalizationSnapshot,
  type PlanParams,
  type TravelTraitsV0,
  type TravelTraitKeyV0,
} from "./types";

/** これ未満の confidence は中立デフォルトへ丸める（v0 仮説値） */
export const CONFIDENCE_FLOOR = 0.3;

// ─────────────────────────────────────────────────────────────────────────────
// 内部ヘルパ（pure）
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

interface SourceSpec {
  axis: TraitAxisKey;
  /** 寄与の重み（> 0） */
  weight: number;
  /** true = score の符号を反転して使う（軸ラベルの向きを揃える） */
  invert?: boolean;
  /** 0..1。proxy 軸の信頼度を意図的に減衰させる（例: crowdTolerance） */
  confidenceDamp?: number;
}

interface BlendResult {
  /** -1..1。寄与軸ゼロのとき 0 */
  value: number;
  /** 0..1。寄与軸 confidence の加重平均 × カバレッジ（欠損軸ぶん下がる） */
  confidence: number;
}

/** 複数軸の confidence 加重ブレンド */
function blendAxes(snapshot: PersonalizationSnapshot, sources: SourceSpec[]): BlendResult {
  const totalWeight = sources.reduce((s, x) => s + x.weight, 0);
  let valueNum = 0;
  let valueDen = 0;
  let confNum = 0;
  let coveredWeight = 0;

  for (const src of sources) {
    const snap = snapshot.axes[src.axis];
    if (!snap) continue;
    const score = clamp(src.invert ? -snap.score : snap.score, -1, 1);
    const conf = clamp(snap.confidence, 0, 1) * (src.confidenceDamp ?? 1);
    // 値は confidence × weight で加重（自信のある軸ほど効く）
    const w = src.weight * conf;
    valueNum += score * w;
    valueDen += w;
    confNum += conf * src.weight;
    coveredWeight += src.weight;
  }

  if (coveredWeight === 0 || totalWeight === 0) return { value: 0, confidence: 0 };
  const coverage = coveredWeight / totalWeight;
  return {
    value: valueDen > 0 ? clamp(valueNum / valueDen, -1, 1) : 0,
    confidence: clamp((confNum / coveredWeight) * coverage, 0, 1),
  };
}

/** blend 結果 → DerivedValue（低信頼は中立デフォルトへ丸め） */
function toDerived<T>(blend: BlendResult, fromValue: (v: number) => T, neutral: T): DerivedValue<T> {
  if (blend.confidence < CONFIDENCE_FLOOR) {
    return { value: neutral, confidence: blend.confidence, source: "default" };
  }
  return { value: fromValue(blend.value), confidence: blend.confidence, source: "derived" };
}

/** -1..1 → 0..1 */
const toUnit = (v: number): number => clamp((v + 1) / 2, 0, 1);

// ─────────────────────────────────────────────────────────────────────────────
// PlanParams 写像 v0
// ─────────────────────────────────────────────────────────────────────────────

export function derivePlanParams(snapshot: PersonalizationSnapshot): PlanParams {
  // 行程密度の潜在量: +1 = 詰め込み耐性高
  const density = blendAxes(snapshot, [
    { axis: "quality_vs_quantity", weight: 1 }, //         +1 量・広がり → 高密度
    { axis: "energy_rhythm", weight: 1 }, //               +1 活発に消費 → 高密度
    { axis: "efficiency_vs_process", weight: 0.5, invert: true }, // -1 最短距離 → 高密度
  ]);

  const novelty = blendAxes(snapshot, [
    { axis: "tradition_vs_novelty", weight: 1 }, //        +1 新規性
    { axis: "novelty_threshold", weight: 1 }, //           +1 未知も平気
    { axis: "change_embrace_vs_resist", weight: 1, invert: true }, // -1 変化を歓迎 → 新奇
  ]);

  const precommit = blendAxes(snapshot, [
    { axis: "plan_vs_spontaneous", weight: 1, invert: true }, // -1 計画的 → 事前確定
    { axis: "cautious_vs_bold", weight: 0.5, invert: true }, //  -1 慎重   → 事前確定
  ]);

  const social = blendAxes(snapshot, [
    { axis: "introvert_vs_extrovert", weight: 1 }, //      +1 外向
    { axis: "social_initiative", weight: 0.7 }, //         +1 自分から
    { axis: "stress_isolation_vs_social", weight: 0.7 }, //+1 人と回復
  ]);

  const quality = blendAxes(snapshot, [
    { axis: "function_vs_expression", weight: 1 }, //      +1 表現・情緒 → quality
    { axis: "quality_vs_quantity", weight: 1, invert: true }, // -1 質を深く → quality
  ]);

  const buffer = blendAxes(snapshot, [
    { axis: "cautious_vs_bold", weight: 1, invert: true }, //        -1 慎重 → 余白大
    { axis: "perfectionist_vs_pragmatic", weight: 0.5, invert: true }, // -1 完成度重視 → 余白大
  ]);

  const reason = blendAxes(snapshot, [
    { axis: "rational_vs_emotional_decision", weight: 1 }, // -1 論理 → reason_first
    { axis: "analytical_vs_intuitive", weight: 0.5 }, //      -1 分析的 → reason_first
  ]);

  return {
    paceDefault: toDerived(
      density,
      (v) => (v < -0.25 ? "slow" : v > 0.25 ? "intense" : "normal"),
      "normal",
    ),
    densityCap: toDerived(density, (v) => clamp(Math.round(3 + v * 1.5), 2, 5), 3),
    // 源泉軸なし（朝型度を表す軸が traitAxes に存在しない）→ 恒久 default 0.5 / confidence 0
    morningness: { value: 0.5, confidence: 0, source: "default" },
    noveltyBias: toDerived(novelty, (v) => v, 0),
    precommitPreference: toDerived(precommit, toUnit, 0.5),
    socialLoadTolerance: toDerived(social, toUnit, 0.5),
    budgetPosture: toDerived(
      quality,
      (v) => (v < -0.25 ? "save" : v > 0.25 ? "quality" : "balanced"),
      "balanced",
    ),
    bufferMargin: toDerived(buffer, toUnit, 0.5),
    explanationTone: toDerived(
      reason,
      (v) => (v <= 0 ? "reason_first" : "feeling_first"),
      "reason_first",
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TravelTraitsV0 写像（T1A の M1 Trait Space 確定までの暫定）
// ─────────────────────────────────────────────────────────────────────────────

const TRAVEL_TRAIT_SOURCES_V0: Record<TravelTraitKeyV0, SourceSpec[]> = {
  noveltySeeking: [
    { axis: "tradition_vs_novelty", weight: 1 },
    { axis: "novelty_threshold", weight: 1 },
    { axis: "change_embrace_vs_resist", weight: 1, invert: true },
  ],
  pacePreference: [
    { axis: "quality_vs_quantity", weight: 1 },
    { axis: "energy_rhythm", weight: 1 },
    { axis: "efficiency_vs_process", weight: 0.5, invert: true },
  ],
  // 直接の軸が無い proxy（内向外向 + 回復様式）→ confidence を意図的に半減
  crowdTolerance: [
    { axis: "introvert_vs_extrovert", weight: 1, confidenceDamp: 0.5 },
    { axis: "stress_isolation_vs_social", weight: 0.7, confidenceDamp: 0.5 },
  ],
  planningStyle: [{ axis: "plan_vs_spontaneous", weight: 1 }],
  comfortVsAdventure: [
    { axis: "cautious_vs_bold", weight: 1 },
    { axis: "novelty_threshold", weight: 0.7 },
  ],
  experienceDepth: [{ axis: "quality_vs_quantity", weight: 1 }],
  aestheticOrientation: [{ axis: "classic_vs_trendy", weight: 1 }],
  socialOrientation: [{ axis: "introvert_vs_extrovert", weight: 1 }],
};

export function deriveTravelTraits(snapshot: PersonalizationSnapshot): TravelTraitsV0 {
  const traits = {} as Record<TravelTraitKeyV0, DerivedValue<number>>;
  for (const key of TRAVEL_TRAIT_KEYS_V0) {
    traits[key] = toDerived(blendAxes(snapshot, TRAVEL_TRAIT_SOURCES_V0[key]), (v) => v, 0);
  }
  return { version: "v0", traits };
}
