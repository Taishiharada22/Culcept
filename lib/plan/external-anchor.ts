/**
 * ExternalAnchor — 動かせない外部固定予定
 *
 * 仕事 / 学校 / バイト / 通院 / フライト 等の「生活上すでに存在する外部制約」。
 * 本人の希望ではない（PlanSeed と混同禁止 — §2.0 不変原則）。
 *
 * discriminated union で one_off / recurring を型レベルで区別し、
 * 「validity 必須」原則と型定義の整合を確保する。
 *
 * 設計書: docs/alter-plan-foundation-design.md §2.0, §2.1, §12
 *
 * Wave 1: 型定義のみ（W1-1）。
 *   - migration / RLS / repository は W1-3 以降。
 *   - 入力 UI / API は W1-4 以降。
 *   - DB 永続化はまだ行わない。
 */

import type { LocationCategory } from "./location-category";

/** 動かせなさの強さ */
export type AnchorRigidity =
  | "hard"   // 動かすと現実が崩れる（仕事会議 / 授業 / 医者予約 / フライト）
  | "soft";  // 基本固定だが、当日状態で動かせる（定期ジム / 習い事 等）

/** sensitive 情報カテゴリ（共有機能でデフォルト除外、§11.4） */
export type AnchorSensitiveCategory =
  | "medical"  // 通院 / 診察 / 検査
  | "legal"    // 法廷 / 弁護士相談 / 公的手続き
  | "exam"     // 試験 / 入試
  | "other";   // ユーザー指定

/** OneOff / Recurring に共通する base */
interface ExternalAnchorBase {
  id: string;
  userId: string;

  title: string;

  /** 開始時刻（HH:mm 形式 or ISO 8601） */
  startTime: string;
  endTime?: string;

  locationText?: string;
  locationCategory?: LocationCategory;

  rigidity: AnchorRigidity;

  // ── Source Trace（external_anchor_sources 参照） ──
  /** external_anchor_sources.id への参照（必須） */
  sourceId: string;
  /** ユーザー承認時刻（必須、未確認データは保存しない — §2.1 不変原則） */
  confirmedAt: string;
  /** 抽出時の自信度 */
  confidence?: number;

  sensitiveCategory?: AnchorSensitiveCategory;
}

/** 単発予定: 特定の日付に紐づく */
export interface OneOffExternalAnchor extends ExternalAnchorBase {
  anchorKind: "one_off";

  /** YYYY-MM-DD（必須） */
  date: string;

  // recurring 専用 field は禁止
  recurrenceRule?: never;
  validFrom?: never;
  validUntil?: never;
  exceptionDates?: never;
}

/** 繰り返し予定: validity window + recurrence rule（必須） */
export interface RecurringExternalAnchor extends ExternalAnchorBase {
  anchorKind: "recurring";

  /** YYYY-MM-DD（必須） */
  validFrom: string;

  /**
   * YYYY-MM-DD（終了未定なら省略可）
   * 注意: 省略は「終了日未定」を意味する。「永続」ではない。
   * 学期終了 / 契約終了 / 転職等が判明したら更新する。
   */
  validUntil?: string;

  /** iCal RRULE 準拠（必須） — 例: FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR */
  recurrenceRule: string;

  /** 祝日 / 休講 / シフト変更等の例外日（YYYY-MM-DD[]） */
  exceptionDates?: string[];

  // one_off 専用 field は禁止
  date?: never;
}

/** discriminated union: anchorKind で型レベル区別 */
export type ExternalAnchor =
  | OneOffExternalAnchor
  | RecurringExternalAnchor;
