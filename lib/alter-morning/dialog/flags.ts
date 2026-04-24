/**
 * Alter Morning runtime flags — DialogState v2 / Places Search / Transport v2
 *
 * 位置づけ:
 *   PR-8 rev 3 で導入する DialogState / reducer / derivePendingClarify
 *   本実装を「env で切替可能な弁」として ship する集約。既定 OFF。
 *
 * 設計書:
 *   - docs/alter-morning-strict-confirmation-design.md §3.7 (DialogState)
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §10 (4-phase rollout)
 *   - docs/alter-morning-pr12-production-rollout-plan.md §2 Stage 1 (allowlist canary)
 *
 * rollout フェーズ（detail §10）:
 *   R1: flag false で merge（dead code）
 *   R2: dev 環境で ALTER_MORNING_DIALOG_STATE_V2=true、開発チームで QA
 *   R3: CEO preview（preview 環境のみ ON）
 *   R4: prod roll out（ON）
 *
 * env keys:
 *   - `ALTER_MORNING_DIALOG_STATE_V2` (bool) — global fallback
 *   - `ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST` (CSV of userId) — PR-12.5 canary
 *   - `ALTER_MORNING_PLACES_SEARCH` (bool) — global fallback (AND with dialogStateV2)
 *   - `ALTER_MORNING_PLACES_SEARCH_ALLOWLIST` (CSV of userId) — PR-12.5 canary
 *   - `ALTER_MORNING_TRANSPORT_V2` (bool) — global fallback
 *   - `ALTER_MORNING_TRANSPORT_V2_ALLOWLIST` (CSV of userId) — PR-10 canary
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
 * env CSV → Set<string> の cache 付きパーサ。
 *
 * PR-10 transport v2 と PR-12.5 dialogStateV2 / placesSearch の 3 allowlist で共通化。
 * env 値変更時だけ再計算（test で process.env を書き換える pattern に対応）。
 *
 * normalization:
 *   - trim + lowercase（UUID は hex なので入力ミス吸収）
 *   - 空要素は無視
 */
type AllowlistCache = { raw: string | undefined; set: Set<string> };

function parseAllowlistCsv(raw: string | undefined, cache: AllowlistCache): AllowlistCache {
  if (raw === cache.raw) return cache;
  const set = new Set<string>();
  if (raw) {
    for (const entry of raw.split(",")) {
      const trimmed = entry.trim().toLowerCase();
      if (trimmed) set.add(trimmed);
    }
  }
  return { raw, set };
}

let cachedTransportAllowlist: AllowlistCache = { raw: undefined, set: new Set() };
let cachedDialogStateAllowlist: AllowlistCache = { raw: undefined, set: new Set() };
let cachedPlacesSearchAllowlist: AllowlistCache = { raw: undefined, set: new Set() };

function getTransportV2AllowlistSet(): Set<string> {
  cachedTransportAllowlist = parseAllowlistCsv(
    process.env.ALTER_MORNING_TRANSPORT_V2_ALLOWLIST,
    cachedTransportAllowlist,
  );
  return cachedTransportAllowlist.set;
}

function getDialogStateV2AllowlistSet(): Set<string> {
  cachedDialogStateAllowlist = parseAllowlistCsv(
    process.env.ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST,
    cachedDialogStateAllowlist,
  );
  return cachedDialogStateAllowlist.set;
}

function getPlacesSearchAllowlistSet(): Set<string> {
  cachedPlacesSearchAllowlist = parseAllowlistCsv(
    process.env.ALTER_MORNING_PLACES_SEARCH_ALLOWLIST,
    cachedPlacesSearchAllowlist,
  );
  return cachedPlacesSearchAllowlist.set;
}

/**
 * テスト override。process.env を触らず flag を上書きする。
 * null でクリア（env 値に戻る）。
 */
let dialogStateV2Override: boolean | null = null;
let placesSearchOverride: boolean | null = null;
let transportV2Override: boolean | null = null;

/**
 * canary flag の「どの経路で ON になったか」を payload に埋める用の共通 type。
 *
 * 優先順位（§1-A-1）:
 *   test override > allowlist > global fallback
 *
 * 戻り値:
 *   - "allowlist" / "global"（log payload の flag_source に入る値）
 *   - null（flag OFF なので ON にはならなかった = log 自体そもそも出さない）
 *
 * 注意: test override が効いているときは log を通常 emit しない（test では fire-and-forget
 *       の side-effect を assert しない）。そのため "test" ラベルは必要なく、
 *       allowlist / global の 2 値で十分。
 */
export type FlagSource = "allowlist" | "global";
/** @deprecated PR-12.5 以降は共通 `FlagSource` を使う。既存 import の後方互換のため残置 */
export type TransportV2FlagSource = FlagSource;

export function resolveTransportV2FlagSource(
  userId: string | undefined,
): FlagSource | null {
  if (transportV2Override !== null) {
    return transportV2Override ? "global" : null;
  }
  if (userId) {
    const normalized = userId.toLowerCase();
    if (getTransportV2AllowlistSet().has(normalized)) return "allowlist";
  }
  if (envBool("ALTER_MORNING_TRANSPORT_V2", false)) return "global";
  return null;
}

/**
 * PR-12.5 canary: DialogState v2 の flag_source 解決。
 *
 * 用途:
 *   - 観測イベント (`alter_morning_shadow_state`) の metadata.flag_source
 *   - ALTER_MORNING_FLAGS.dialogStateV2(userId) と同じ判定ロジック
 *
 * 戻り値:
 *   - "allowlist": env CSV に userId が含まれる
 *   - "global": env CSV に含まれないが global flag が true
 *   - null: flag OFF（canary 対象外 = 観測イベントも出さない）
 */
export function resolveDialogStateV2FlagSource(
  userId: string | undefined,
): FlagSource | null {
  if (dialogStateV2Override !== null) {
    return dialogStateV2Override ? "global" : null;
  }
  if (userId) {
    const normalized = userId.toLowerCase();
    if (getDialogStateV2AllowlistSet().has(normalized)) return "allowlist";
  }
  if (envBool("ALTER_MORNING_DIALOG_STATE_V2", false)) return "global";
  return null;
}

/**
 * PR-12.5 canary: Places Search の flag_source 解決。
 *
 * 用途:
 *   - 観測イベント (`alter_morning_handoff_outcome`) の metadata.flag_source
 *   - ALTER_MORNING_FLAGS.placesSearch(userId) と同じ判定ロジック（AND gate 前）
 *
 * 注意:
 *   - AND gate（dialogStateV2 先行）は `placesSearch(userId)` method 側でのみ適用
 *   - こちらは purely placesSearch 自身の canary 経路を報告するだけ
 */
export function resolvePlacesSearchFlagSource(
  userId: string | undefined,
): FlagSource | null {
  if (placesSearchOverride !== null) {
    return placesSearchOverride ? "global" : null;
  }
  if (userId) {
    const normalized = userId.toLowerCase();
    if (getPlacesSearchAllowlistSet().has(normalized)) return "allowlist";
  }
  if (envBool("ALTER_MORNING_PLACES_SEARCH", false)) return "global";
  return null;
}

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
   * **W3-PR-12.5 canary（2026-04-24）以降は method に変更**:
   *   `ALTER_MORNING_FLAGS.dialogStateV2(userId?)` の形で呼ぶ。getter ではないので
   *   `if (ALTER_MORNING_FLAGS.dialogStateV2) { ... }` と書くと常に truthy
   *   （function reference）になる。必ず `()` を付けて呼び出すこと。
   *
   * 優先順位（§1-A-1）:
   *   1. test override（`__setDialogStateV2Override(true|false)`）
   *   2. allowlist（`ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST` CSV に userId 含む）
   *   3. global fallback（`ALTER_MORNING_DIALOG_STATE_V2` env、既定 false）
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
   *
   * userId の扱い:
   *   - undefined: allowlist check を skip。global fallback のみ参照（safe OFF 方向）
   *   - lower-case normalize で比較（env 入力の大小文字ミス吸収）
   *
   * env keys:
   *   - `ALTER_MORNING_DIALOG_STATE_V2_ALLOWLIST` (CSV) — primary
   *   - `ALTER_MORNING_DIALOG_STATE_V2` (bool) — global fallback
   */
  dialogStateV2(userId?: string): boolean {
    if (dialogStateV2Override !== null) return dialogStateV2Override;
    if (userId) {
      const normalized = userId.toLowerCase();
      if (getDialogStateV2AllowlistSet().has(normalized)) return true;
    }
    return envBool("ALTER_MORNING_DIALOG_STATE_V2", false);
  },

  /**
   * PR-9 Places Search handoff の有効化。
   *
   * **AND gate**: 本 flag が true でも `dialogStateV2(userId)` が false なら無効。
   * DialogState が無ければ handoff を fire しても dispatch 先がないため。
   *
   * **W3-PR-12.5 canary（2026-04-24）以降は method に変更**:
   *   `ALTER_MORNING_FLAGS.placesSearch(userId?)` の形で呼ぶ。`()` 必須。
   *
   * 優先順位（§1-A-1）:
   *   1. test override（`__setPlacesSearchOverride(true|false)`）
   *   2. allowlist（`ALTER_MORNING_PLACES_SEARCH_ALLOWLIST` CSV に userId 含む）
   *   3. global fallback（`ALTER_MORNING_PLACES_SEARCH` env、既定 false）
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
   * env keys:
   *   - `ALTER_MORNING_PLACES_SEARCH_ALLOWLIST` (CSV) — primary
   *   - `ALTER_MORNING_PLACES_SEARCH` (bool) — global fallback
   */
  placesSearch(userId?: string): boolean {
    if (placesSearchOverride !== null) return placesSearchOverride;
    if (userId) {
      const normalized = userId.toLowerCase();
      if (getPlacesSearchAllowlistSet().has(normalized)) return true;
    }
    return envBool("ALTER_MORNING_PLACES_SEARCH", false);
  },

  /**
   * PR-10 Transport Staircase — canonical TransportSegment[] 供給 gate。
   *
   * **W3-PR-10 canary（2026-04-24）以降は method**:
   *   `ALTER_MORNING_FLAGS.transportV2(userId?)` の形で呼ぶ。`()` 必須。
   *
   * 優先順位（§1-A-1）:
   *   1. test override（`__setTransportV2Override(true|false)`）
   *   2. allowlist（`ALTER_MORNING_TRANSPORT_V2_ALLOWLIST` CSV に userId 含む）
   *   3. global fallback（`ALTER_MORNING_TRANSPORT_V2` env、既定 false）
   *
   * false（既定）:
   *   - buildPlanAndSegmentsFromEvents は transportSegments key を返さない
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
   *
   * env keys:
   *   - `ALTER_MORNING_TRANSPORT_V2_ALLOWLIST` (CSV) — primary
   *   - `ALTER_MORNING_TRANSPORT_V2` (bool) — global fallback
   */
  transportV2(userId?: string): boolean {
    if (transportV2Override !== null) return transportV2Override;
    if (userId) {
      const normalized = userId.toLowerCase();
      if (getTransportV2AllowlistSet().has(normalized)) return true;
    }
    return envBool("ALTER_MORNING_TRANSPORT_V2", false);
  },
};
