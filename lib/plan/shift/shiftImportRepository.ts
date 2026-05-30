/**
 * シフト取り込み 本保存の境界（atomic bundle 契約）— SR Step 6A
 *
 * 確認画面で承認した内容を /plan に保存する境界。**all-or-nothing**:
 *   source（external_anchor_sources）+ 勤務 anchors（external_anchors）+ 休み印（plan_day_indicators）
 *   を 1 つの不可分な束（bundle）として保存する。1 件でも invalid / 途中失敗なら **何も書かない**。
 *
 * 設計根拠:
 *   - 三者は一体で「元原稿どおりの正確な反映」を成す。部分保存は /plan の信頼を壊す（CEO/GPT 2026-05-31）。
 *   - 既存 ExternalAnchorRepository.createSourceWithAnchors（source+anchors atomic）と同思想を、
 *     day_indicators 込みに拡張したもの。
 *
 * Step 分割:
 *   - 6A（本ファイル）: 契約（interface）+ 最小 saved 型 + 入力 validator。
 *     実装は in-memory（transaction/rollback を test で実証）。**実 DB write なし**。
 *   - 6B: Supabase 実装（Postgres RPC で真の 1 トランザクション）。migration apply 後・CEO 別承認。
 *
 * 不変原則:
 *   - 全 method user-scoped（userId 必須）。
 *   - source-first: repo が source.id を採番し、anchors / day_indicators の sourceId に注入。
 *   - 休みは anchor にしない（別経路の SavedShiftDayIndicator）。
 */

import {
  isValidDateString,
  type CreateExternalAnchorInput,
  type AnchorInputValidationError,
} from "@/lib/plan/external-anchor-input";
import type { AnchorRigidity } from "@/lib/plan/external-anchor";
import type { ExternalAnchorRepositoryDependencies } from "@/lib/plan/external-anchor-repository";
import type { ShiftDayImportIndicator } from "./shiftImportAdapter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 入力（bundle）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 取り込み source の入力。id / userId / sourceType("shift_image") / capturedAt は repo が補完する。 */
export interface ShiftImportSourceInput {
  /** 元ファイル名（trace 用、任意） */
  originalFilename?: string;
  /** 抽出時刻 ISO（任意） */
  extractedAt?: string;
}

/** source + anchors + day_indicators の不可分な保存単位。 */
export interface ShiftImportBundleInput {
  source: ShiftImportSourceInput;
  /** 勤務 → one_off anchor（sourceType="shift_image"、buildShiftImportPlan の出力） */
  anchors: CreateExternalAnchorInput[];
  /** 休み / 希望休 → 日レベル印（anchor でない） */
  dayIndicators: ShiftDayImportIndicator[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 出力（最小 saved 型：6A は self-contained、6B で実 ExternalAnchor へ写像）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SavedShiftImportSource {
  id: string;
  userId: string;
  sourceType: "shift_image";
  originalFilename?: string;
  capturedAt: string;
}

export interface SavedShiftAnchor {
  id: string;
  userId: string;
  sourceId: string;
  date: string;
  title: string;
  startTime: string;
  endTime?: string;
  rigidity: AnchorRigidity;
  /** 確認画面の承認で付与（未確認データは保存不可の不変原則を満たす） */
  confirmedAt: string;
}

export interface SavedShiftDayIndicator {
  id: string;
  userId: string;
  sourceId: string;
  date: string;
  kind: "off" | "off_request";
  label: string;
  countsAsPublicHoliday: boolean;
  rawCode: string;
  semanticType: string;
  sourceType: "shift_image";
  createdAt: string;
  updatedAt: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 結果（atomic 性の表現）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ShiftImportSaveError =
  | { kind: "anchor_invalid"; index: number; errors: AnchorInputValidationError[] }
  | { kind: "indicator_invalid"; index: number; errors: AnchorInputValidationError[] }
  /** 永続化途中の失敗（DB error 等）。全体を rollback したことを表す。 */
  | { kind: "persistence_failed"; message: string };

export type ShiftImportSaveResult =
  | {
      ok: true;
      source: SavedShiftImportSource;
      anchors: SavedShiftAnchor[];
      dayIndicators: SavedShiftDayIndicator[];
    }
  | { ok: false; errors: ShiftImportSaveError[] };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Repository 境界
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ShiftImportRepository {
  /**
   * source + anchors + day_indicators を **atomic** に保存する。
   *   - 各 anchor / indicator を validate。1 件でも invalid → 全体 reject、store に書き込まない。
   *   - 全件 valid でも永続化途中で失敗 → 全体 rollback（部分書き込みを残さない）。
   *   - 補完: source.id 採番 → anchors / indicators の sourceId に注入（source-first）。
   *     anchor.confirmedAt = now()、indicator timestamps = now()、両者 sourceType = "shift_image"。
   */
  saveShiftImportBundle(
    userId: string,
    input: ShiftImportBundleInput
  ): Promise<ShiftImportSaveResult>;
}

/** 6A in-memory / 6B Supabase 共通の DI（idFactory / now）。 */
export type ShiftImportRepositoryDependencies = ExternalAnchorRepositoryDependencies;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 入力 validator（DB CHECK のミラー）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * day indicator 入力を validate する pure 関数（migration の CHECK 群をミラー）:
 *   - date は YYYY-MM-DD
 *   - kind ∈ {off, off_request}
 *   - label は空文字/空白のみ禁止（btrim(label) <> ''）
 *   - off_request は公休にしない（counts_as_public_holiday=false）
 */
export function validateShiftDayIndicatorInput(
  ind: ShiftDayImportIndicator
): AnchorInputValidationError[] {
  const errors: AnchorInputValidationError[] = [];
  if (typeof ind.date !== "string" || !isValidDateString(ind.date)) {
    errors.push({
      field: "date",
      code: "invalid_format",
      message: "date must be YYYY-MM-DD",
    });
  }
  if (ind.kind !== "off" && ind.kind !== "off_request") {
    errors.push({
      field: "kind",
      code: "not_allowed_value",
      message: "kind must be 'off' or 'off_request'",
    });
  }
  if (typeof ind.label !== "string" || ind.label.trim() === "") {
    errors.push({
      field: "label",
      code: "required",
      message: "label must be a non-empty string",
    });
  }
  if (ind.kind === "off_request" && ind.countsAsPublicHoliday) {
    errors.push({
      field: "countsAsPublicHoliday",
      code: "logical_conflict",
      message: "off_request must not count as a public holiday",
    });
  }
  return errors;
}
