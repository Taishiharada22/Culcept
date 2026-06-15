/**
 * DP1 — Scheduled-Draft Display Projection 契約型（**pure types only**・未配線）
 *
 * 設計正本: docs/t11-pipeline-closeout-display-preview-preflight.md §4（+ CEO 補正: place.externalId は inert metadata）
 *
 * 役割: server-only `AssemblyBridgeResult`(scheduled_draft) から作る **client 表示用** の display-safe 旅程。
 *
 * 厳守:
 *   - executionAuthority / booking / calendar / action field なし・serverOnly marker なし・
 *     ScheduledDraftProvenance(audit) なし・raw AssemblyInputCandidate / raw ScheduledTravelItineraryDraft envelope なし・TravelCandidate なし。
 *   - DisplayNode は内部 placeRefId を持たない（nodeId は key 用）。startLabel/endLabel は explicit minutes の決定論フォーマット。
 *   - ★ place.externalId は **inert metadata のみ**（href/link/Maps/booking にしない・external link は別 Tier1 gate）。
 *
 * 純粋性: 型のみ。
 */

import type { BudgetBand } from "./core-types";

export interface DisplayNode {
  /** 安定 render key 用（内部 id・private でない）。内部 placeRefId は含めない */
  nodeId: string;
  startMin: number;
  endMin: number;
  /** explicit minutes の決定論 "HH:MM" */
  startLabel: string;
  endLabel: string;
  /** ★ externalId は inert metadata（href/Maps/booking にしない・live lookup を含意しない） */
  place: { label?: string; externalId?: string };
  activityKind: string;
  budgetBand: BudgetBand;
  fatigueLoad: number;
  nodeConfidence: string;
}

export interface DisplayTransition {
  fromNodeId: string;
  toNodeId: string;
  transport: string;
  durationMin: number;
  cost: BudgetBand;
}

export interface DisplayDay {
  dayIndex: number;
  date: string; // ISO（scope 由来・caller 注入）
  nodes: DisplayNode[]; // startMin 昇順（display order）
  transitions: DisplayTransition[];
}

export interface DisplayScheduledItinerary {
  /** ★ 予約済でない・authoritative でない（draft 提案であることを表示で明示） */
  status: "draft_proposal";
  candidateId: string;
  days: DisplayDay[];
}
