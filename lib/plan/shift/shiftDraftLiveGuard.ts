/**
 * シフト下書き live VLM 経路の **canary gate**（pure / no env / no IO）— P15-B
 *
 * 目的: 「実シフトを取り込む live VLM 経路（ShiftDraftInApp）」を、
 *   server-only flag だけで全ユーザーに見せず、canary user 限定で表示するための pure helper。
 *
 * 設計（CEO 2026-06-27 P14-B → P15-B）:
 *   - **flag ON ∧ auth ∧ (staging ∨ clean-prod-canary)** で UI を出す（fail-closed）。
 *   - flag OFF / 未認証 / canary 外 / 不明 host → 従来どおり fixture fallback modal を表示
 *     （`ShiftImportModal` ＋ `saveEnabled={false}` ハードコード＝デモ保存不可・退化なし）。
 *   - VLM 抽出結果は client state に保持され「確認画面」を経由してから保存。即保存しない。
 *   - 保存は別 gate（PLAN_SHIFT_IMPORT_SAVE + PLAN_SHIFT_IMPORT_SAVE_CANARY_USER_IDS + auth）が
 *     さらに通過しないと不可（`isShiftImportSaveUiEnabled` / `runShiftImportSave` の二重防御）。
 *
 * 不変:
 *   - 本 helper は **`saveEnabled` を兼ねない**（VLM 抽出可 = 保存可 ではない・別 gate）。
 *   - `process.env` を読まない・throw しない。pure。
 *   - URL 値を log / return しない（boolean のみ）。
 *
 * 注: 接続先 helper（`isShiftImportSaveConnectionAllowed` / `isShiftImportSaveProductionCanaryAllowed`）
 *     は本ファイルから import せず、呼出側（planClientFeatureProps）が同じ env を渡して両 gate を独立に評価する。
 *     gate 同士に強い結合を作らない（save canary id ≠ draftLive canary id にしたい将来要件への余地）。
 */

import {
  isShiftImportSaveConnectionAllowed,
  isShiftImportSaveProductionCanaryAllowed,
  type ShiftImportSaveConnectionEnv,
} from "./shiftImportSaveGuard";

/**
 * live VLM 経路の UI 表示可否（pure・fail-closed）。
 *
 *   gate（順序は意味的に save lane と同形）:
 *     1. `flagEnabled`（PLAN_SHIFT_DRAFT_LIVE_ENABLED）が true
 *     2. `userId` 認証済（匿名 null は false）
 *     3. staging lane（接続先 staging ∧ legacy/active production deny）
 *        ∨ clean-prod canary lane（接続先 active production ∧ user ∈ allowlist）
 *
 *   いずれか欠ければ false。呼出側は false の時に **従来の fixture fallback**（saveEnabled=false 固定）を出す。
 */
export function isShiftDraftLiveUiAllowed(args: {
  flagEnabled: boolean;
  connection: ShiftImportSaveConnectionEnv;
  userId: string | null;
  canaryUserIds: readonly string[];
}): boolean {
  if (!args.flagEnabled) return false;
  if (!args.userId) return false;
  const stagingOk = isShiftImportSaveConnectionAllowed(args.connection);
  const prodCanaryOk = isShiftImportSaveProductionCanaryAllowed(
    args.connection,
    args.userId,
    args.canaryUserIds
  );
  return stagingOk || prodCanaryOk;
}
