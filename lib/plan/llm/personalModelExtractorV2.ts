/**
 * Phase 3-N Plan P2 Step 2 v3.1 — Personal Model V2 抽出器 (= 3 層 synthetic adapter)
 *
 * 設計書: docs/alter-plan-p2-llm-step2-readiness-v3.md §1 + §13 + §14
 *
 * 設計原則 (= CEO + GPT 2026-05-25 G2 通過判定):
 *   - **server-only** (= 内部で DB read / Stargazer module 呼出を想定、 client 直接 import 禁止)
 *   - **scope を絞る** (= GPT 「Step 2 を小さく正確に」):
 *     - Step 2 v3.1 では **synthetic adapter** (= test dataset の EvalUserProfile から直接生成可能)
 *     - 実 Stargazer module wire (= axisRegistry / lifeContext / episodicRecall) は **別 Step**
 *     - 「実データ待ち禁止」 ルール (= readiness §13) を遵守、 wire 完了を blocker にしない
 *   - **fail-open** (= 軸データ未完成 / 例外時は全 layer undefined return、 meta のみ最小化)
 *
 * 役割:
 *   - userId → PersonalModelV2 (= 3 層 + meta)
 *   - Phase に応じた layer 充填 (= Phase < 2 で stable も skip、 完全 meta-only)
 *   - synthetic adapter として EvalUserProfile (= tests/eval/planAlterNoteDataset.ts) を直接受け取る
 *     bridge 関数も export (= 評価 harness 用)
 *
 * Phase 別 layer readout (= readiness §1.5 通り):
 *   - Phase 0-1: meta のみ (= 個別化 skip、 deterministic 維持)
 *   - Phase 2:   meta + stable
 *   - Phase 3:   meta + stable + recent
 *   - Phase 4-5: meta + stable + recent + contextual
 *
 * 設計書 references:
 *   - lib/plan/llm/types.ts (= PersonalModelV2 + 3 layer types)
 *   - lib/plan/llm/hdmPhaseGate.ts (= Phase gate logic)
 *   - tests/eval/planAlterNoteDataset.ts (= EvalUserProfile synthetic source)
 */

import "server-only";

import type {
  PersonalModelV2,
  PersonalModelStableLayer,
  PersonalModelRecentLayer,
  PersonalModelContextualLayer,
  PersonalModelMeta,
} from "./types";

// Step 3 Phase 5: 実 Stargazer adapter (= Stage A 28508617 + Stage B 56a1a6e7) への接続
import { extractPersonalModelFromStargazer } from "./personalModelStargazerAdapter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Synthetic input型 (= test dataset EvalUserProfile と shape 一致、 import 循環避け inline)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * synthetic source profile (= EvalUserProfile と shape 一致)
 *
 * 評価 harness / unit test から直接渡される。 実 Stargazer wire 完了後は本型不要に。
 */
export type SyntheticPersonalModelSource = {
  readonly hdmPhase: number;
  readonly trustLevel: number;
  readonly stable: {
    readonly judgmentMode: string;
    readonly timePreference: string;
    readonly energyRecovery: string;
    readonly archetype?: string;
  };
  readonly recent: {
    readonly innerWeather: string;
    readonly recentRhythm: string;
    readonly stressLoad: string;
  };
  readonly contextual?: {
    readonly similarDayRecall?: string;
    readonly pastSelfDelta?: string;
  };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 別 layer readout (= readiness §1.5)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Phase → どの layer を充填するか (= pure helper)
 */
export type PhaseReadoutLevel = "meta_only" | "stable" | "stable_recent" | "full";

export function getPhaseReadoutLevel(hdmPhase: number): PhaseReadoutLevel {
  if (hdmPhase < 2) return "meta_only";
  if (hdmPhase === 2) return "stable";
  if (hdmPhase === 3) return "stable_recent";
  return "full"; // 4-5
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Synthetic adapter (= EvalUserProfile → PersonalModelV2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * synthetic profile から PersonalModelV2 を生成 (= 評価 harness 用、 pure)
 *
 * Phase に応じて layer 充填を制御:
 *   - Phase < 2: meta のみ (= stable / recent / contextual 全 undefined)
 *   - Phase 2:   stable のみ
 *   - Phase 3:   stable + recent
 *   - Phase 4-5: stable + recent + contextual
 *
 * 入力 mutate なし。 同入力 → 同出力 (= deterministic、 test 用に重要)。
 */
export function buildPersonalModelV2FromSynthetic(
  source: SyntheticPersonalModelSource,
  observationCompleteness: number = 1.0,
): PersonalModelV2 {
  const level = getPhaseReadoutLevel(source.hdmPhase);

  const meta: PersonalModelMeta = {
    hdmPhase: source.hdmPhase,
    trustLevel: source.trustLevel,
    observationCompleteness,
  };

  if (level === "meta_only") {
    return { meta };
  }

  // stable layer 構築 (= 全 phase ≥ 2 で含む)
  const stable: PersonalModelStableLayer = {
    judgmentMode: source.stable.judgmentMode,
    timePreference: source.stable.timePreference,
    ...(source.stable.archetype !== undefined ? { archetype: source.stable.archetype } : {}),
    // energyRecovery は SyntheticPersonalModelSource にあるが、 PersonalModelStableLayer field に
    // 統合的に traitTone として配置 (= 「ひとり静か」 「人と話す」 は内向 / 外向 trait の縮約)
    traitTone: source.stable.energyRecovery,
  };

  if (level === "stable") {
    return { stable, meta };
  }

  // recent layer 構築 (= phase ≥ 3 で含む)
  const recent: PersonalModelRecentLayer = {
    innerWeather: source.recent.innerWeather,
    recentRhythm: source.recent.recentRhythm,
    stressLoad: source.recent.stressLoad,
  };

  if (level === "stable_recent") {
    return { stable, recent, meta };
  }

  // contextual layer 構築 (= phase ≥ 4 で含む)
  const contextual: PersonalModelContextualLayer = source.contextual
    ? {
        ...(source.contextual.similarDayRecall !== undefined
          ? { similarDayRecall: source.contextual.similarDayRecall }
          : {}),
        ...(source.contextual.pastSelfDelta !== undefined
          ? { pastSelfDelta: source.contextual.pastSelfDelta }
          : {}),
      }
    : {};

  return { stable, recent, contextual, meta };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extractPersonalModelV2 (= server entry、 Step 3 で 実 adapter 接続)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * userId + hdmPhase から PersonalModelV2 を取得 (= server entry)
 *
 * **Step 3 Phase 5 (= 2026-05-25)**: 実 Stargazer adapter 接続:
 *   - 既存 stub から `extractPersonalModelFromStargazer` (= 28508617 Stage A scaffold + 56a1a6e7 Stage B 実 wire) 呼出に置換
 *   - 接続 1 接点 (= 本 file のみ)、 caller (= externalAnchorAdapterAsync.ts:81) は不変
 *   - Phase 5 後の Phase 6 で real PM read-only smoke 実施予定
 *
 * 挙動:
 *   - userId が undefined / 空 → meta-only (= Phase 0 で deterministic 維持、 早期 return)
 *   - userId 指定あり → `extractPersonalModelFromStargazer(userId)` 呼出
 *     - WIRE_JUDGMENT_MODE / WIRE_TIME_PREFERENCE = true (= 実 wire)
 *     - hdmPhase = stargazer_alter_growth.hdm_phase_state.currentPhase (= 実 DB)
 *     - 軸 confidence > 0 ⇒ scores が body に伝わる、 未観測 user は meta-only に safe degrade
 *
 * 並行運用 (= readiness §13 維持):
 *   - synthetic adapter `buildPersonalModelV2FromSynthetic` は不変 (= eval harness 用)
 *   - 評価データセット で 引き続き V2 prompt 確認可能
 */
export async function extractPersonalModelV2(
  userId?: string,
): Promise<PersonalModelV2> {
  // userId 不在 → 完全 deterministic 経路 (= Phase 0、 個別化 skip、 DB 接続不要)
  if (userId === undefined || userId.length === 0) {
    return {
      meta: {
        hdmPhase: 0,
        trustLevel: 0,
        observationCompleteness: 0,
      },
    };
  }
  // Step 3 Phase 5: 実 Stargazer adapter 経由 (= 56a1a6e7 で Stage B 実 wire 完了済)
  return extractPersonalModelFromStargazer(userId);
}
