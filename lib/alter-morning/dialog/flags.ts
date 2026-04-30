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
 *
 * Commit 16-T (W3 trace runtime path proof):
 *   - `evaluateAlterMorningFlags` を single source of truth として追加。
 *   - 既存 getter は内部で snapshot を経由しない（test 互換のため独立評価）が、
 *     route.ts は入口で snapshot を 1 回取得 → 以降は snapshot 参照に統一する
 *     ことで「route が使った flag = trace に出る flag」を保証する。
 *   - 評価ロジックは getter / snapshot で完全一致（envBool / override の優先順）。
 *   - allowlist は本ブランチ未実装のため `allowlistChecked: false` 固定。
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

/** @internal テスト用 override（jest / vitest から） */
export function __setDialogStateV2Override(next: boolean | null): void {
  dialogStateV2Override = next;
}

/** @internal テスト用 override（PR-9 Places Search gate） */
export function __setPlacesSearchOverride(next: boolean | null): void {
  placesSearchOverride = next;
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
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Commit 16-T: Flag Snapshot — runtime path 証明用 single source of truth
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * flag が「どの経路で決まったか」のラベル。
 *
 * - "env":         process.env 値が flag を決定した（明示的 true / false）
 * - "override":    `__set*Override` でテスト用 override が立っていた
 * - "default_off": env / override どちらも明示せず、fallback の false が採用された
 *
 * 将来 allowlist 経路が main に merge された時に "allowlist_hit" / "allowlist_miss"
 * を追加する。本ブランチでは未実装のため上記 3 値のみ。
 */
export type FlagSource = "env" | "override" | "default_off";

/**
 * flag の評価結果スナップショット。
 *
 * route.ts は入口でこの snapshot を **1 回だけ** 取得し、以降の分岐判定と
 * trace 出力の両方で同一 snapshot 参照のみを使う（修正条件 3）。
 *
 * placesSearch は `dialogStateV2` との AND gate のため:
 *   - rawEnabled:        env/override 単体評価結果
 *   - effectiveEnabled:  rawEnabled ∧ dialogStateV2.enabled（実際に有効な値）
 *   - gatedByDialogStateV2: rawEnabled=true ∧ dialogStateV2.enabled=false の検出
 */
export interface AlterMorningFlagSnapshot {
  dialogStateV2: {
    enabled: boolean;
    source: FlagSource;
  };
  placesSearch: {
    rawEnabled: boolean;
    effectiveEnabled: boolean;
    source: FlagSource;
    gatedByDialogStateV2: boolean;
  };
  /** allowlist 判定を行ったか。本ブランチ未実装のため常に false */
  allowlistChecked: false;
  /** ISO 時刻（注入された nowIso をそのまま埋める、Date.now 呼ばない） */
  evaluatedAt: string;
}

/**
 * 個別 flag の評価結果。
 * - override > env > default_off の優先順で source を決める。
 * - getter (`ALTER_MORNING_FLAGS.dialogStateV2`) と評価ロジックを完全一致させる。
 */
function evaluateSingleFlag(
  override: boolean | null,
  envName: string,
): { enabled: boolean; source: FlagSource } {
  if (override !== null) {
    return { enabled: override, source: "override" };
  }
  const raw = process.env[envName];
  if (raw == null) {
    return { enabled: false, source: "default_off" };
  }
  const v = raw.trim().toLowerCase();
  if (v === "" || v === "1" || v === "true" || v === "on" || v === "yes") {
    return { enabled: true, source: "env" };
  }
  if (v === "0" || v === "false" || v === "off" || v === "no") {
    return { enabled: false, source: "env" };
  }
  // 未認識値は fallback 扱い
  return { enabled: false, source: "default_off" };
}

/**
 * Alter Morning flag の snapshot を作る pure 関数。
 *
 * 副作用ゼロ:
 *   - process.env / module-level override 変数を **読むのみ**。
 *   - Date.now / LLM / DB / I/O を呼ばない（nowIso は注入）。
 *   - 戻り値は新規生成オブジェクト（caller が mutate しても影響なし）。
 *
 * 呼び出し規約（修正条件 3）:
 *   route.ts は入口で 1 回だけ呼び、得られた snapshot を branch 判定 / promote 判定
 *   / trace 出力の全てに使い回す。getter (`ALTER_MORNING_FLAGS.*`) を route 内で
 *   重複読みしてはいけない（time-of-check / time-of-use 乖離を防ぐため）。
 */
export function evaluateAlterMorningFlags(input: {
  nowIso: string;
}): AlterMorningFlagSnapshot {
  const ds = evaluateSingleFlag(
    dialogStateV2Override,
    "ALTER_MORNING_DIALOG_STATE_V2",
  );
  const ps = evaluateSingleFlag(
    placesSearchOverride,
    "ALTER_MORNING_PLACES_SEARCH",
  );

  const placesEffective = ps.enabled && ds.enabled;
  const placesGated = ps.enabled && !ds.enabled;

  return {
    dialogStateV2: {
      enabled: ds.enabled,
      source: ds.source,
    },
    placesSearch: {
      rawEnabled: ps.enabled,
      effectiveEnabled: placesEffective,
      source: ps.source,
      gatedByDialogStateV2: placesGated,
    },
    allowlistChecked: false,
    evaluatedAt: input.nowIso,
  };
}
