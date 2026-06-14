/**
 * T11-G2-B — Real Entity Retrieval 契約型（**pure types only**・未配線）
 *
 * 設計: docs/t11-g2-real-entity-retrieval-design.md（+ CEO/GPT 補正: Tier0 は URL を fetch/read しない・carry のみ）
 *
 * 役割: 手動供給 evidence → observed entity state（TravelObjectState）への変換契約。
 *   ★ evidence → `Observed<T>`(value+confidence+provenance) → entity state → fit。source を score にしない。
 *   ★ retrieval は rank/book/solver/M2/CoAlter/send/DB write/fetch しない。fit score / authority を出力に載せない。
 *   ★ deep link/url は entity でなく **envelope handoff meta**・freshness は **retrieval 内部**・time lock は **OrderingConstraint(relation 層)**。
 *
 * 純粋性: 型 + as-const のみ。
 */

import type { BudgetBand, Visibility } from "./core-types";
import type {
  AnyEntityRole,
  EntityBurdenAxis,
  FitProvenance,
  Observed,
  OnsenSpringType,
  OrderingConstraint,
  OrderingKind,
  ReliefAxis,
  SharedTraitAxis,
  TravelCategory,
  TravelObjectState,
  TriState,
} from "./fit-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 source kind（Tier0 で処理してよいのは manual/user_provided のみ）
// ─────────────────────────────────────────────────────────────────────────────

export const ENTITY_EVIDENCE_SOURCE_KINDS = [
  "manual",
  "user_provided",
  "official_site_claim",
  "maps_place_claim",
  "ota_claim",
  "review_summary",
  "web_search_snippet",
  "future_provider",
] as const;
export type EntityEvidenceSourceKind = (typeof ENTITY_EVIDENCE_SOURCE_KINDS)[number];

/** ★ Tier0 で**処理してよい** source。他は型として存在するが Tier0 では**非実行**（skip）。 */
export const TIER0_PROCESSABLE_SOURCES = ["manual", "user_provided"] as const;

export interface EntityEvidenceRef {
  sourceKind: EntityEvidenceSourceKind;
  /** ★ 参照のみ・本文非保持 */
  refId: string;
  /** ★ handoff only — Tier0 は **開かない / fetch しない / scrape しない**。carry only */
  url?: string;
}

/** retrieval 内部 freshness（★fit-read state に載せない・出力では confidence 減衰のみ） */
export interface EntityFreshness {
  observedAtRef?: string;
  staleness?: "fresh" | "aging" | "stale";
}

interface EntityFactMeta {
  provenance: FitProvenance;
  /** 未指定は provenance 既定 confidence */
  confidence?: number;
  ref?: EntityEvidenceRef;
  freshness?: EntityFreshness;
  visibility?: Visibility;
}

/** 手動供給される 1 事実（raw fact）。normalizer が Observed / relation(OrderingConstraint) / facet へ写像。 */
export type EntityFact = EntityFactMeta &
  (
    | { kind: "trait"; axis: SharedTraitAxis; value: number }
    | { kind: "roleAffinity"; role: AnyEntityRole; value: number }
    | { kind: "burden"; axis: EntityBurdenAxis; value: number }
    | { kind: "recoveryRest"; value: number }
    | { kind: "onsen"; springType?: OnsenSpringType; kakenagashi?: boolean; scenicView?: "sea" | "mountain" | "river" | "garden" | "none" }
    | { kind: "timeLock"; lockKind: OrderingKind; rawTime?: string }
    | { kind: "priceBand"; lo: number; hi?: number; currency?: "JPY" }
    | { kind: "cancellationFlexibility"; value: number }
    | { kind: "accessibilityStepFree"; value: TriState }
    | { kind: "allergen"; handling: "handled" | "not_handled" | "unknown"; descriptor?: string }
    | { kind: "supportRelief"; reliefAxis: ReliefAxis; reliefValue?: number; necessity?: "optional" | "recommended" | "required" | "trip_critical" }
    | { kind: "popularity"; reliability: number; independent?: boolean } // ★ confidence にのみ効く・quality を上げない
  );

/** 1 entity の手動 evidence（input 単位・server-only） */
export interface EntityEvidence {
  placeRefId: string;
  category: TravelCategory;
  facts: EntityFact[];
  /** 宣言された必須 field key（欠落 → missing question）。safety key は safety_unknown へ昇格 */
  requires?: string[];
  /** entity-level ref（url は handoff・開かない） */
  ref?: EntityEvidenceRef;
}

export interface EntityRetrievalInput {
  entities: EntityEvidence[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 出力（fit score なし・authority なし・url/freshness/time は entity 外）
// ─────────────────────────────────────────────────────────────────────────────

export interface EntityMissingDataQuestion {
  field: string;
  reason: "low_confidence" | "safety_unknown";
}

export interface EntityConfidenceSummary {
  /** entity 単位の集約 confidence（source 由来・raw quality と分離） */
  entityConfidence: number;
  sourceCount: number;
}

/** ★ time lock = relation 層（OrderingConstraint）+ raw carrier（entity でない・retrieval は schedule しない） */
export interface EntityTimeLock {
  ordering: OrderingConstraint;
  rawTime?: string;
  ref?: EntityEvidenceRef;
}

/** ★ deep link/url は TravelObjectState に載せず envelope の handoff meta に保持 */
export interface EntityHandoffMeta {
  placeRefId: string;
  url?: string;
  sourceKind: EntityEvidenceSourceKind;
}

export interface EntityRetrievalCandidate {
  placeRefId: string;
  /** ★ entity state（no fit score / no url / no time / no authority） */
  entity: TravelObjectState;
  /** time/window lock（relation 層・OrderingConstraint）+ raw carrier */
  timeLocks: EntityTimeLock[];
  /** readiness hint（entity state でない・CancelWeatherEvidence へ後段が流す） */
  cancellationFlexibility?: Observed<number>;
  missingQuestions: EntityMissingDataQuestion[];
  confidence: EntityConfidenceSummary;
  /** retrieval 内部 freshness（fit は読まない） */
  freshness?: EntityFreshness;
}

/** entity candidates = **順序なし集合**（配列順を rank と解釈しない） */
export interface EntityRetrievalResult {
  candidates: EntityRetrievalCandidate[];
}

/** retrieval 出力 envelope（handoff meta=deep link を candidates/entity の外に分離） */
export interface EntityRetrievalEnvelope {
  result: EntityRetrievalResult;
  handoffs: EntityHandoffMeta[];
}
