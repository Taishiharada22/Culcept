/**
 * ExternalAnchorSource — 外部 Anchor の source trace
 *
 * 1 source（1 PDF / 1 会話発話 等）から複数 ExternalAnchor が派生する場合があるため、
 * source を別 entity として正規化する。
 * これにより source 単位削除（DELETE WHERE source_id = ?）が単純な DELETE で成立する。
 *
 * 設計書: docs/alter-plan-foundation-design.md §2.1, §11.2
 *
 * Wave 1: 型定義のみ（W1-1）。
 *   - migration / RLS / repository 実装は W1-3, W1-4 以降。
 *   - DB 永続化はまだ行わない。
 */

/** 入力経路 */
export type ExternalAnchorSourceType =
  | "manual"      // 手動入力
  | "template"    // 曜日テンプレート
  | "pdf"         // PDF 取り込み
  | "image"       // 画像取り込み
  | "chat"        // Home 会話キャプチャ
  | "ics"         // P3 W3 (= 2026-05-26): .ics / iCalendar ファイル取り込み
  | "google_calendar" // P3 Phase B (= 2026-05-29 β 恒久化): Google Calendar 連携取り込み
  | "microsoft_calendar"; // Track B (= 2026-05-29): Outlook / Microsoft 365 連携取り込み

/** raw 保持方針（§11.1 参照）。default: discarded */
export type RawRetention = "discarded" | "stored";

export interface ExternalAnchorSource {
  id: string;
  userId: string;

  sourceType: ExternalAnchorSourceType;

  /** PDF / 画像時のみ保持される元ファイル名 */
  originalFilename?: string;

  /** 抽出時刻（PDF / 画像 / chat 時） */
  extractedAt?: string;

  /** ソース取り込み時刻（必須） */
  capturedAt: string;

  /** raw 保持方針。default は discarded（§11.1 不変原則） */
  rawRetention: RawRetention;

  /** stored 時のみ */
  rawStoragePath?: string;

  /** stored 時の自動失効日 */
  rawExpiresAt?: string;

  notes?: string;
}
