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
/**
 * U1-minimal（2026-06-15）: startTime の provenance（由来）。RD2e-SUPPLY が arrival fixedness を
 * honest に判定する土台。**creation 時に server が確定して persist**（read で derive しない）。
 * - `user_explicit`: ユーザーが時刻を実入力（manual + 打鍵あり）。confirmed 候補。
 * - `imported_exact`: 外部 import の確定時刻（ICS timed + tzid あり）。confirmed 候補。
 * - `system_inferred`: 推定（ICS timed だが tzid 不明=floating 等）。tentative（fixed にしない）。
 * - `assumed_default`: 既定値（ICS all-day 00:00 / manual prefill 未編集）。reject。
 * - `unknown`: 未確定 / scope 外 path / legacy NULL 行。fail-closed（fixed にしない）。
 */
export type StartTimeSource =
  | "user_explicit"
  | "imported_exact"
  | "system_inferred"
  | "assumed_default"
  | "unknown";

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

  /**
   * P3 W3 (= 2026-05-26): .ics VEVENT UID
   *
   * - 用途: 同 .ics ファイルの再 import で 同 UID 既存 anchor を検出 → update or skip (= dedup)
   * - source_type='ics' の anchor のみ保持、 他 source では undefined
   * - NULL 許容 (= 既存 manual / template / pdf / image / chat anchor は持たない)
   * - DB column: external_anchors.external_uid TEXT NULL (= 20260526100000 migration)
   */
  externalUid?: string;

  /**
   * 誰と (P4・2026-06-02): 参加者名の配列（任意）。
   * - DB column: external_anchors.companions TEXT[] NULL（20260602100000 migration・apply は CEO 承認後）
   * - migration 未適用環境では永続化されない（読込時 undefined・後方互換）
   */
  companions?: string[];

  /**
   * U1-minimal（2026-06-15）: startTime 由来。**server が creation 時に確定**（manual + ICS-timed のみ本片対象）。
   * - DB column: external_anchors.start_time_source TEXT NULL（CHECK enum）。legacy NULL 行は読込時 `"unknown"` に倒す。
   * - RD2e-SUPPLY はこれを READ（derive しない）。`{user_explicit, imported_exact} ∧ ¬isAllDayPlaceholder` のみ fixed 候補。
   */
  startTimeSource?: StartTimeSource;
  /** U1-minimal: all-day import の 00:00 placeholder か（exact に偽装不可・DB CHECK で強制） */
  isAllDayPlaceholder?: boolean;
  /** U1-minimal: ICS tzid（imported_exact の honest 根拠。floating[tzid 無]は exact にしない） */
  timezoneOfRecord?: string | null;
  /**
   * U1-minimal: **startTime provenance を記録した時刻**（anchor 存在の `confirmedAt` とは別）。
   * - `imported_exact`: imported source の時刻 provenance を記録した時刻。
   * - `user_explicit`: ユーザー入力時刻の provenance を記録した時刻。
   * - この timestamp 単独で user_explicit 判定をしない（startTimeSource が正本）。
   */
  startTimeProvenanceRecordedAt?: string | null;
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
