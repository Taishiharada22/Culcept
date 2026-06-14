/**
 * T11-F-B — Fit-to-Decision / T9 composition adapter 契約型（**pure types only**・未配線）
 *
 * 設計: docs/t11-fit-to-decision-t9-composition-facade-plan.md（+ CEO/GPT 修正 2 点）
 *
 * 役割: T11 Fit Model（entity 採点）を T9 engine facade / PlanDecisionPacket に
 *   **境界を壊さず**合成するための contract。Fit は entity を採点するが T3/T4 の TravelProposal は
 *   場所確定前骨格で entity を持たないため、**fit evidence は caller が candidateId に対応づけて渡す純 input**。
 *
 * ★ CEO/GPT 修正 1: **raw/full FitResult を packet に載せない**。packet には engine-safe な
 *   bounded `ProposalFitSummary` のみ。raw component 値 / private signalBasis / private reason /
 *   private risk flag / private missing 詳細は packet field に入れない。
 * ★ CEO/GPT 修正 2: join は **厳格 fail-closed**（exact id 一致のみ・未知 id は diagnostic・
 *   重複 id は fail-closed 棄却・areaPlaceholder/proposal copy から推論しない・entity 捏造しない）。
 *
 * 純粋性: 型 + as-const のみ。
 */

import type { EntityFitGrade, FitResult } from "./fit-types";

// ─────────────────────────────────────────────────────────────────────────────
// §1 入力（caller 供給・candidateId keyed・推論なし）
// ─────────────────────────────────────────────────────────────────────────────

export interface ProposalFitInput {
  /** 対応づけ先 proposal/candidate id（**caller 責務**・adapter は推論/捏造しない） */
  candidateId: string;
  /** その proposal に対する fit 評価（caller 供給・adapter は entity を作らない） */
  fit: FitResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 出力（packet 安全 bounded summary・raw FitResult を含まない）
// ─────────────────────────────────────────────────────────────────────────────

export const FIT_CONFIDENCE_BANDS = ["low", "medium", "high"] as const;
export type FitConfidenceBand = (typeof FIT_CONFIDENCE_BANDS)[number];

/**
 * packet に載せる **engine-safe bounded summary**。
 *   - raw FitResult / raw component 値を持たない。
 *   - mismatchCount / riskCodes / missingFields は **shared-safe な集計のみ**（descriptor/理由文を載せない）。
 *   - advisory のみ・**executionAuthority に不参加**。
 */
export interface ProposalFitSummary {
  candidateId: string;
  /** authoritative summary は full label（private 反映可）・shared summary は toSharedFitView 由来 */
  grade: EntityFitGrade;
  /** C4 interaction の label 上限（shared-safe・null=上限なし） */
  labelCap: EntityFitGrade | null;
  labelStability: "stable" | "fragile";
  /** raw confidence を載せず band 化（bounded） */
  confidenceBand: FitConfidenceBand;
  /** shared-safe な mismatch 数（理由文/descriptor は載せない） */
  mismatchCount: number;
  /** shared-safe な risk code（private 由来除外・sorted/dedup） */
  riskCodes: string[];
  /** shared-safe な欠落 question field（reason 文は載せない・sorted/dedup） */
  missingFields: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 join 健全性（unknown/duplicate の可視化・fail-closed）
// ─────────────────────────────────────────────────────────────────────────────

export interface FitJoinDiagnostics {
  /** どの proposal にも一致しなかった fit id（無視・surfaced） */
  unknownIds: string[];
  /** 同一 proposal に複数供給された id（**全棄却** = fail-closed） */
  duplicateIds: string[];
}

export interface ProposalFitComposition {
  summaries: ProposalFitSummary[];
  diagnostics: FitJoinDiagnostics;
}
