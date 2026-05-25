/**
 * Phase 3-N Plan P2 Step 3 — Real Stargazer Personal Model Read-only Adapter
 *
 * 設計書: docs/alter-plan-p2-step3-real-pm-readiness.md (= v3.3 失敗後 補正済)
 *
 * 役割 (= CEO + GPT 2026-05-25 Step 3 着手 GO):
 *   - userId → PersonalModelV2 (= 3 層 + meta) を **実 Stargazer 既存 module** から read-only 抽出
 *   - synthetic adapter (= buildPersonalModelV2FromSynthetic) と並列、 production 用 entry
 *   - **read-only** (= Stargazer 既存 module 改変 0、 参照のみ、 DB write 0)
 *   - **safe degrade** (= 軸データ未完成 user で全 field undefined return、 deterministic 同等)
 *
 * Wire 優先順 (= CEO Q5 確定):
 *   1st: judgmentMode + timePreference (= 即効性高)
 *   2nd (次点): recentRhythm (= P4 中庸型対策可能性)
 *   3rd 以後: energyRecovery / psycheTone / archetype 等 (= 段階拡張)
 *
 * Step 3 主目的 (= v3.3 失敗後 格上げ):
 *   - **synthetic limitation vs prompt 弱さ** の切り分け
 *   - real PM で P3/P4 が adoption pass → synthetic 限界が主因
 *   - real PM でも未達 → prompt 弱さが主因 (= v3.4 必要)
 *
 * 実装段階 (= readiness doc Phase 2 内の wire enablement sub-stage):
 *   - **Stage A (= 本 commit)**: scaffold + safe fallback (= 全 null/undefined return、 既存 stub と同 挙動)
 *   - Stage B (= 次): judgmentMode + timePreference 実 wire (= axisRegistry + chronotypeFitness)
 *   - Stage C (= 次々): recentRhythm 実 wire (= lifeEvents + innerWeather、 CEO Q5 次点)
 *   - Stage D: energyRecovery 等 後続 field 段階拡張
 *
 * 注: readiness doc (= alter-plan-p2-step3-real-pm-readiness.md) の Phase 1-6 は
 *     workflow 全体 (= branch / 実装 / test / smoke / commit / canary)。
 *     adapter file 内の Stage A-D は readiness Phase 2 (= adapter.ts 実装) の sub-stage。
 *
 * 不変原則:
 *   - server-only (= Stargazer module への DB read アクセス想定)
 *   - 既存 Stargazer module 完全 frozen
 *   - DB write 0
 *   - safe degrade (= 例外時は undefined return、 UI 壊れない)
 *   - alter plan scope 限定
 */

import "server-only";

import type {
  PersonalModelV2,
  PersonalModelStableLayer,
  PersonalModelRecentLayer,
  PersonalModelContextualLayer,
  PersonalModelMeta,
} from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Wire 段階 const (= Phase 1 では全 disable、 Phase 2 以降で有効化)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 各 field wire 段階 control (= 段階的 enable、 Step 3 内の Stage 進行で個別 enable)
 *
 * Stage A (= 本 commit): 全 false (= safe scaffold、 既存 stub と同 挙動)
 * Stage B: WIRE_JUDGMENT_MODE + WIRE_TIME_PREFERENCE = true
 * Stage C: + WIRE_RECENT_RHYTHM = true
 * Stage D 以後: 段階的に他 field 追加
 *
 * 各 wire 段階で:
 *   - 単体 test 追加 / 更新
 *   - real PM smoke 1 回
 *   - 採点 (= P3/P4 改善幅 + P1/P2 regression check)
 */
const WIRE_JUDGMENT_MODE = false;
const WIRE_TIME_PREFERENCE = false;
const WIRE_RECENT_RHYTHM = false;
const WIRE_ENERGY_RECOVERY = false;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Per-field helpers (= 各 field 独立 try/catch、 fail-open undefined return)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * judgmentMode 抽出 (= axisRegistry + axisInferenceEngine 経由、 Phase 2 実装予定)
 *
 * 想定 logic:
 *   1. user の BeliefSet を DB から取得 (= bayesianAxisUpdater.ts pattern)
 *   2. 「集中 vs 分散」 axis (= AXIS_REGISTRY 内の該当軸) の mean を読み取る
 *   3. mean > 閾値 → 「集中型」、 mean < 閾値 → 「分散型」、 中間 → 「中庸型」
 *   4. 「関係エネルギー型」 axis (= 別軸) も並列確認、 dominant tag を選択
 *   5. short tag (4-12 字) として return
 *
 * Stage A (= 本 commit): WIRE_JUDGMENT_MODE = false → undefined return
 */
async function getJudgmentMode(_userId: string): Promise<string | undefined> {
  if (!WIRE_JUDGMENT_MODE) return undefined;
  // Stage B で実装
  return undefined;
}

/**
 * timePreference 抽出 (= chronotypeFitness 経由、 Phase 2 実装予定)
 *
 * 想定 logic:
 *   1. user の time blocks 取得 (= activity log / quiz data / etc.)
 *   2. analyzeChronotype(blocks) → ChronotypeResult
 *   3. result.type に応じて 「朝強い」 / 「夜強い」 / 「中庸」 short tag
 *
 * Stage A (= 本 commit): WIRE_TIME_PREFERENCE = false → undefined return
 */
async function getTimePreference(_userId: string): Promise<string | undefined> {
  if (!WIRE_TIME_PREFERENCE) return undefined;
  // Stage B で実装
  return undefined;
}

/**
 * recentRhythm 抽出 (= lifeEvents + innerWeather 経由、 Phase 3 実装予定)
 *
 * 想定 logic:
 *   1. user の直近 7-14 日 lifeEvents 取得
 *   2. category 分布 + density 集計
 *   3. innerWeather (= 内的天気) も合わせて状態語に圧縮
 *   4. 「集中続き」 / 「休息余裕」 / 「移動多め」 / 「対話多め」 等の short tag
 *
 * CEO Q5 補正で 「次点」 priority に格上げ (= P4 中庸型対策可能性、 v3.3 失敗後)
 *
 * Stage A (= 本 commit): WIRE_RECENT_RHYTHM = false → undefined return
 */
async function getRecentRhythm(_userId: string): Promise<string | undefined> {
  if (!WIRE_RECENT_RHYTHM) return undefined;
  // Stage C で実装
  return undefined;
}

/**
 * energyRecovery 抽出 (= axisRegistry traitTone 経由、 Phase 4+ 実装予定)
 *
 * Stage A (= 本 commit): WIRE_ENERGY_RECOVERY = false → undefined return
 */
async function getEnergyRecovery(_userId: string): Promise<string | undefined> {
  if (!WIRE_ENERGY_RECOVERY) return undefined;
  // Stage D で実装
  return undefined;
}

/**
 * HdmPhase 取得 (= hdmPhase.ts 経由、 Phase 2 と同時実装予定)
 *
 * Stage A (= 本 commit): safe fallback Phase 0
 */
async function getUserHdmPhase(_userId: string): Promise<number> {
  // Phase 2 で実 hdmPhaseState 取得
  return 0;
}

/**
 * TrustLevel 取得 (= alterUnderstanding 経由、 Phase 2 と同時実装予定)
 *
 * Stage A (= 本 commit): safe fallback 0
 */
async function getUserTrustLevel(_userId: string): Promise<number> {
  // Phase 2 で実 alterUnderstanding 取得
  return 0;
}

/**
 * Observation completeness (= 軸データ充足度、 Phase 2 と同時実装予定)
 *
 * Stage A (= 本 commit): safe fallback 0 (= 完全 dormant)
 */
async function getObservationCompleteness(_userId: string): Promise<number> {
  // Phase 2 で axisRegistry 充足度算定
  return 0;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extractPersonalModelFromStargazer (= public entry、 各 field 独立 try/catch)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 実 Stargazer 経由で PersonalModelV2 抽出
 *
 * 各 field 独立に try/catch (= 1 つの取得失敗で他 field を巻き込まない)。
 * Stage A (= 本 commit): 全 field WIRE_* false → 全 undefined、 Phase 0 fallback。
 *   → 既存 extractPersonalModelV2 stub と同 挙動 (= regression 0)
 *
 * Phase 2 以降:
 *   - WIRE_JUDGMENT_MODE = true → judgmentMode が実 wire
 *   - WIRE_TIME_PREFERENCE = true → timePreference が実 wire
 *   - ...段階的に enable
 *
 * 不変:
 *   - 既存 Stargazer module 完全 frozen (= 参照のみ)
 *   - DB write 0
 *   - 例外 1 件で entry 全体が落ちない (= fail-open per field)
 */
export async function extractPersonalModelFromStargazer(
  userId: string,
): Promise<PersonalModelV2> {
  // userId 不在 → meta-only Phase 0 (= deterministic 等価)
  if (!userId || userId.length === 0) {
    return {
      meta: {
        hdmPhase: 0,
        trustLevel: 0,
        observationCompleteness: 0,
      },
    };
  }

  // Per-field 並列取得 (= 各 try/catch で fail-open)
  const [
    judgmentMode,
    timePreference,
    recentRhythm,
    energyRecovery,
    hdmPhase,
    trustLevel,
    observationCompleteness,
  ] = await Promise.all([
    getJudgmentMode(userId).catch(() => undefined),
    getTimePreference(userId).catch(() => undefined),
    getRecentRhythm(userId).catch(() => undefined),
    getEnergyRecovery(userId).catch(() => undefined),
    getUserHdmPhase(userId).catch(() => 0),
    getUserTrustLevel(userId).catch(() => 0),
    getObservationCompleteness(userId).catch(() => 0),
  ]);

  // Meta は常に build
  const meta: PersonalModelMeta = {
    hdmPhase,
    trustLevel,
    observationCompleteness,
  };

  // Phase < 2 → meta-only (= 個別化 skip、 deterministic 等価)
  if (hdmPhase < 2) {
    return { meta };
  }

  // Stable layer build (= 充填 field のみ含む、 readonly 維持のため spread で構築)
  const stable: PersonalModelStableLayer | undefined = (() => {
    const built: PersonalModelStableLayer = {
      ...(judgmentMode ? { judgmentMode } : {}),
      ...(timePreference ? { timePreference } : {}),
      // energyRecovery → traitTone slot に格納 (= Stable layer の slot 名)
      ...(energyRecovery ? { traitTone: energyRecovery } : {}),
    };
    return Object.keys(built).length > 0 ? built : undefined;
  })();

  // Phase 2 → stable のみ
  if (hdmPhase === 2) {
    return stable !== undefined ? { stable, meta } : { meta };
  }

  // Recent layer build (= Phase ≥ 3、 readonly 維持)
  const recent: PersonalModelRecentLayer | undefined = (() => {
    const built: PersonalModelRecentLayer = {
      ...(recentRhythm ? { recentRhythm } : {}),
    };
    return Object.keys(built).length > 0 ? built : undefined;
  })();

  if (hdmPhase === 3) {
    return {
      ...(stable !== undefined ? { stable } : {}),
      ...(recent !== undefined ? { recent } : {}),
      meta,
    };
  }

  // Phase ≥ 4 → contextual layer も build (= 当面空、 別 Step で実装)
  const contextual: PersonalModelContextualLayer | undefined = undefined;

  return {
    ...(stable !== undefined ? { stable } : {}),
    ...(recent !== undefined ? { recent } : {}),
    ...(contextual !== undefined ? { contextual } : {}),
    meta,
  };
}
