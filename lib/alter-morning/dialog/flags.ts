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
let placesSearchOverride: boolean | null = null;
let transportV2Override: boolean | null = null;

/** @internal テスト用 override（jest / vitest から） */
export function __setDialogStateV2Override(next: boolean | null): void {
  dialogStateV2Override = next;
}

/** @internal テスト用 override（PR-9 Places Search gate） */
export function __setPlacesSearchOverride(next: boolean | null): void {
  placesSearchOverride = next;
}

/** @internal テスト用 override（PR-10 Transport Staircase gate） */
export function __setTransportV2Override(next: boolean | null): void {
  transportV2Override = next;
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

  /**
   * PR-9 Places Search handoff の有効化。
   *
   * **AND gate**: 本 flag が true でも `dialogStateV2` が false なら無効。
   * DialogState が無ければ handoff を fire しても dispatch 先がないため。
   *
   * false（既定）:
   *   - route.ts は executePlacesHandoff を呼ばない
   *   - PlacesApi 呼び出し 0 回、cache 0 エントリ
   *   - DialogState の searchQueryDraft.readyForHandoff=true になっても
   *     SEARCH_CANDIDATES_PRESENTED / SEARCH_ZERO_CANDIDATES は dispatch されない
   *     （reducer は search_handoff_blocking のまま）
   *
   * true:
   *   - route.ts が advanceDialogState 後に handoff を発火
   *   - idempotency gate 通過時のみ新規 API 呼び出し
   *   - L1 in-memory cache で同一 fingerprint の再発火を抑制
   *
   * env key: `ALTER_MORNING_PLACES_SEARCH`
   */
  get placesSearch(): boolean {
    if (placesSearchOverride !== null) return placesSearchOverride;
    return envBool("ALTER_MORNING_PLACES_SEARCH", false);
  },

  /**
   * PR-10 Transport Staircase — canonical TransportSegment[] 供給 gate。
   *
   * false（既定）:
   *   - buildPlanAndSegmentsFromEvents は transportSegments key を返さない
   *     （undefined も含めない、conditional spread で落とす）
   *   - MorningPlan.transportSegments は付かない → 既存 consumer は無影響
   *   - selection endpoint の plan rebuild も transportSegments を含めない
   *   - Path B（processMorningMessage / insertTravelItems）は不干渉で従来通り
   *   - byte-diff ゼロ互換（既存 test suite green 条件）
   *
   * true:
   *   - adaptPipelineToLegacy が buildPlanAndSegmentsFromEvents に委譲
   *     → plan.items build 時に同一関数内で canonical segments を 1 回生成
   *   - selection endpoint accepted 時に同関数で plan rebuild → transportSegments 更新
   *   - 両端 where.coordinates が揃った隣接 event pair のみ segment 生成
   *     （placeholder / heuristic edge は禁止、不完全情報で捏造しない）
   *
   * env key: `ALTER_MORNING_TRANSPORT_V2`
   */
  get transportV2(): boolean {
    if (transportV2Override !== null) return transportV2Override;
    return envBool("ALTER_MORNING_TRANSPORT_V2", false);
  },
};
