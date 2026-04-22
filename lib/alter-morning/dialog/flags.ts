/**
 * Alter Morning runtime flags — DialogState v2 kill switch
 *
 * 位置づけ:
 *   PR-8 rev 3 で導入する DialogState / reducer / derivePendingClarify
 *   本実装を「env で切替可能な弁」として ship する集約。既定 OFF。
 *
 * 設計書:
 *   - docs/alter-morning-strict-confirmation-design.md §3.7 (DialogState)
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §10 (4-phase rollout)
 *
 * rollout フェーズ（detail §10）:
 *   R1: flag false で merge（dead code）
 *   R2: dev 環境で ALTER_MORNING_DIALOG_STATE_V2=true、開発チームで QA
 *   R3: CEO preview（preview 環境のみ ON）
 *   R4: prod roll out（ON）
 *
 * env key: `ALTER_MORNING_DIALOG_STATE_V2`
 *
 * pattern は `lib/coalter/flags.ts` の envBool と揃える（既存パターンに合流）。
 */

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "" || v === "1" || v === "true" || v === "on" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return fallback;
}

/**
 * テスト override。process.env を触らず flag を上書きする。
 * null でクリア（env 値に戻る）。
 */
let dialogStateV2Override: boolean | null = null;

/** @internal テスト用 override（jest / vitest から） */
export function __setDialogStateV2Override(next: boolean | null): void {
  dialogStateV2Override = next;
}

export const ALTER_MORNING_FLAGS = {
  /**
   * DialogState v2 経路の有効化。
   *
   * false（既定）:
   *   - session.dialogState は undefined / null のまま読み書きされない
   *   - dialogReducer / derivePendingClarify / classifyUtterance は呼ばれない
   *   - 既存 PendingClarify / persistedEvents 経路が全量処理（PR-8 rev 2 互換）
   *
   * true:
   *   - route.ts / legacyAdapter が新経路に分岐
   *   - session.dialogState が createInitialDialogState() で初期化
   *   - ensureSessionV1 が旧 session を RESET
   */
  get dialogStateV2(): boolean {
    if (dialogStateV2Override !== null) return dialogStateV2Override;
    return envBool("ALTER_MORNING_DIALOG_STATE_V2", false);
  },
};
