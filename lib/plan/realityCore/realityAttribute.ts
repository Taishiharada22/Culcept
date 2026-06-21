/**
 * RealityAttribute — field-level provenance wrapper（RC1a）
 *
 * 正本: docs/reality-core-guardrail-r05.md §2 / CEO RC1 GO 追加ガード 5
 * 基底: 既存 ConfidentValue（value/confidence/source=EvidenceSource）の **additive 拡張**。
 *       並行する第三の語彙体系ではない（domain enum の新造は禁止）。
 *
 * 許容された新 union は 2 つのみ（CEO ガード 5 の整理）:
 *  - RealityAttributeStatus / RealityDisplayPolicy = **provenance wrapper の lifecycle / 表示・安全制御語彙**。
 *    RC 専用であり、予定意味論（rigidity / flexibility / verb 等）の新正本ではない。
 *  - LeaveByUnresolvedReason = leave-by 診断語彙（CEO/GPT が値まで指定 — 偽 deadline 防止の安全制御）。
 *
 * 不変条件（INV-RC1。assertRealityAttributeInvariants が機械検証・RC1c fixture が使用）:
 *  - unknown  ⇒ value=null ∧ confidence=0 ∧ displayPolicy ∈ {hidden, debugOnly}
 *  - blocked  ⇒ value=null ∧ displayPolicy ∈ {hidden, debugOnly, notActionable}
 *  - heuristic⇒ confidence ≤ HEURISTIC_CONFIDENCE_MAX(0.35) ∧ displayPolicy ∈ {debugOnly, notActionable}
 *  - confirmed/inferred ⇒ value ≠ null ∧ evidenceRefs ≥ 1
 *  - visible は confirmed/inferred のみ
 */

import type { ConfidentValue, EvidenceSource } from "@/lib/stargazer/alterHomeAdapter";

export type RealityAttributeStatus = "confirmed" | "inferred" | "heuristic" | "unknown" | "blocked";

export type RealityDisplayPolicy = "visible" | "hidden" | "debugOnly" | "notActionable";

/** heuristic の confidence 上限（CEO ガード 7: energyCost ≤0.35 を全 heuristic に適用 — 保守側で単純） */
export const HEURISTIC_CONFIDENCE_MAX = 0.35;

export interface RealityAttribute<T> extends ConfidentValue<T | null> {
  /** 既存 EvidenceTag / kernel SourceTrace 参照 / 構造根拠の識別子（自由文禁止・snake_case 識別子のみ） */
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly status: RealityAttributeStatus;
  readonly displayPolicy: RealityDisplayPolicy;
}

/** 値が無いことを正直に表す attribute（捏造の構造的禁止） */
export function unknownAttribute<T>(
  opts: { displayPolicy?: Extract<RealityDisplayPolicy, "hidden" | "debugOnly">; evidenceRefs?: ReadonlyArray<string> } = {},
): RealityAttribute<T> {
  return {
    value: null,
    confidence: 0,
    source: "unknown",
    evidenceRefs: opts.evidenceRefs ?? [],
    status: "unknown",
    displayPolicy: opts.displayPolicy ?? "hidden",
  };
}

/** 判定不能を「許可しない」側に倒す attribute（CEO ガード 6: unknown は blocked 側） */
export function blockedAttribute<T>(
  evidenceRefs: ReadonlyArray<string>,
  opts: { value?: T | null; confidence?: number; displayPolicy?: Exclude<RealityDisplayPolicy, "visible"> } = {},
): RealityAttribute<T> {
  return {
    value: opts.value ?? null,
    confidence: opts.confidence ?? 0,
    source: "unknown",
    evidenceRefs,
    status: "blocked",
    displayPolicy: opts.displayPolicy ?? "debugOnly",
  };
}

export function inferredAttribute<T>(
  value: T,
  confidence: number,
  evidenceRefs: ReadonlyArray<string>,
  opts: { source?: EvidenceSource; displayPolicy?: RealityDisplayPolicy; status?: "confirmed" | "inferred" } = {},
): RealityAttribute<T> {
  return {
    value,
    confidence,
    source: opts.source ?? "inferred",
    evidenceRefs,
    status: opts.status ?? "inferred",
    displayPolicy: opts.displayPolicy ?? "debugOnly",
  };
}

export function heuristicAttribute<T>(
  value: T,
  confidence: number,
  evidenceRefs: ReadonlyArray<string>,
  opts: { displayPolicy?: Extract<RealityDisplayPolicy, "debugOnly" | "notActionable"> } = {},
): RealityAttribute<T> {
  return {
    value,
    confidence: Math.min(confidence, HEURISTIC_CONFIDENCE_MAX),
    source: "derived",
    evidenceRefs,
    status: "heuristic",
    displayPolicy: opts.displayPolicy ?? "debugOnly",
  };
}

/** INV-RC1 の機械検証。違反を文字列で列挙（空 = 適合）。throw しない（テスト/監査の両用途） */
export function realityAttributeViolations(name: string, a: RealityAttribute<unknown>): string[] {
  const out: string[] = [];
  const push = (msg: string) => out.push(`${name}: ${msg}`);
  if (a.status === "unknown") {
    if (a.value !== null) push("unknown だが value が非 null");
    if (a.confidence !== 0) push("unknown だが confidence ≠ 0");
    if (a.displayPolicy !== "hidden" && a.displayPolicy !== "debugOnly") push("unknown は hidden/debugOnly のみ");
  }
  if (a.status === "blocked") {
    if (a.displayPolicy === "visible") push("blocked を visible にしてはならない");
  }
  if (a.status === "heuristic") {
    if (a.confidence > HEURISTIC_CONFIDENCE_MAX) push(`heuristic の confidence > ${HEURISTIC_CONFIDENCE_MAX}`);
    if (a.displayPolicy !== "debugOnly" && a.displayPolicy !== "notActionable")
      push("heuristic は debugOnly/notActionable のみ");
  }
  if (a.status === "confirmed" || a.status === "inferred") {
    if (a.value === null) push(`${a.status} だが value が null`);
    if (a.evidenceRefs.length === 0) push(`${a.status} だが evidenceRefs が空`);
  }
  if (a.displayPolicy === "visible" && a.status !== "confirmed" && a.status !== "inferred") {
    push("visible は confirmed/inferred のみ");
  }
  return out;
}
