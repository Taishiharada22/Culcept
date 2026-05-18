/**
 * CoAlter AOO Phase B B-5a + Phase C C-2 — Engine Adapter (context → MirrorDecisionInput)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §3 / §5
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.5
 *   - Phase C C-0 design: docs/coalter-aoo-phase-c-integration-design.md §4.2
 *
 * 役割:
 *   `MirrorDecisionInput` を **runtime context + presenceMirrorBridge cache** から
 *   組み立てる pure adapter。
 *
 *   B-5a (shadow mode foundation) では:
 *     - presence layer / observer layer 触らない / 読まない
 *     - 取得不能な axes は **すべて unknown / conservative default** に倒す
 *
 *   Phase C C-2 拡張 (本 file の本体修正):
 *     - `presenceMirrorBridge.getMirrorReadInput()` を call (既存 public API 経由)
 *     - bridge が non-null なら **`patternCategoryBucket` のみ** known に進める
 *     - 他 axis (mode / alignment / uncertainty / silenceBudget) は **依然 unknown**
 *       (`PresenceSignal` shape の制約、`presenceMirrorBridge.ts` 設計 caveat 参照)
 *     - 結果: 1 axis 改善 + default-STAY_SILENT 維持
 *
 * 設計原則:
 *   - **pure / deterministic / side-effect-free** (bridge cache read のみ side effect)
 *   - **PII 受理なし**: 引数は `AdapterContext` で boolean + number のみ受理
 *   - **defensive defaults**: 不明 axes → unknown (Observe Gate fail)
 *   - **module-level state は参照する** (sleepStore / frequencyCap / noveltyEstimator
 *     / conversationPhaseDetector / **C-2: presenceMirrorBridge**) が、各 module
 *     自体が session-local in-memory のみ
 *
 * No-Effect Contract:
 *   - I/O / network / storage / DOM / event / timer / log / LLM 一切なし
 *   - 入力 mutation なし
 *   - 出力 object は新規 (caller の参照に影響なし)
 *   - PII (raw text / message id / user id / pair id / session id) 一切受け取らない
 *
 * 不可侵境界:
 *   - 既存 presence layer / observer layer touch なし (C-2 は bridge 経由で
 *     既存 public API のみ utilizing、層 0 diff)
 *   - chat layer 17 files touch なし
 *   - B-1 〜 B-5b zero diff (本 file は B-5a 由来、C-2 で拡張のみ)
 */

import { getSleep } from "./sleepStore";
import { getTimeSinceLastSpeakTurns } from "./frequencyCap";
import { estimateNovelty } from "./noveltyEstimator";
import {
  detectConversationPhase,
  type ConversationPhaseDetectorInput,
} from "./conversationPhaseDetector";
import {
  getMirrorReadInput,
  type MirrorReadInput,
} from "./presenceMirrorBridge";
import type {
  MirrorDecisionInput,
  ConversationPhase,
  MirrorPatternCategoryBucket,
} from "./types";

/**
 * Phase C C-2: bridge cache の `patternCategoryBucket` から Mirror engine の
 * `patternCategory` discriminated union result を構築する pure helper。
 *
 * Mapping (B-3 PatternCategoryBucketResult 定義に厳格準拠):
 *   - `"null_pattern"`        → known、canProceed = **true**  (通常評価へ進む)
 *   - `"rupture_signal_mild"` → known、canProceed = **true**  (Repair Mirror 候補)
 *   - `"safety_concern"`      → known、canProceed = **false** (Safe Gate fail)
 *   - `"rupture_signal_high"` → known、canProceed = **false** (Safe Gate fail)
 *   - `"unknown_category"`    → unknown、canProceed = **false** (Observe Gate fail)
 *
 * 安全側設計:
 *   - bridge が返す bucket が `safety_concern` / `rupture_signal_high` でも
 *     **STAY_SILENT を強制**する経路 (canProceed false で Observe/Safe Gate fail)
 *   - `null_pattern` だけ通常評価へ進む (他 axis unknown で Observe Gate fail し
 *     結果 STAY_SILENT、C-2 後も default-STAY_SILENT 維持)
 */
function buildPatternCategoryResult(
  bucket: MirrorPatternCategoryBucket,
): MirrorDecisionInput["patternCategory"] {
  if (bucket === "unknown_category") {
    return {
      status: "unknown",
      bucket: "unknown_category",
      canProceedToMirrorDecision: false,
    };
  }
  if (bucket === "null_pattern" || bucket === "rupture_signal_mild") {
    return {
      status: "known",
      bucket,
      canProceedToMirrorDecision: true,
    };
  }
  // safety_concern / rupture_signal_high
  return {
    status: "known",
    bucket,
    canProceedToMirrorDecision: false,
  };
}

/**
 * Adapter context — runtime caller (useMirrorEngine hook) から渡される情報。
 *
 * すべて optional (取得不能なら undefined を渡す)。
 * **PII fields は型に存在しない**: raw text / message id / user id / pair id /
 * session id 等を**書けない**。
 */
export interface AdapterContext {
  /**
   * 会話 message count (B-5b chat bridge 以降で渡される予定、B-5a は undefined)。
   * undefined → conversationPhase: "unknown" となり Worth Gate fail。
   */
  readonly messageCount?: number;
  /**
   * 最後の message からの経過時間 (ms)。同上。
   */
  readonly lastMessageAgeMs?: number;
}

/**
 * Runtime context から `MirrorDecisionInput` を組み立てる pure function。
 *
 * **B-5a/B-5b defensive defaults**:
 *   - alignment / uncertainty / silenceBudget: **すべて unknown** (presence layer
 *     から数値値を導出する経路がない、Phase D 候補)
 *   - modeContext: bridge `mode` が null のため unknown (Phase D 候補)
 *   - observationNovelty: 0.5 (placeholder、`WORTH_NOVELTY_MIN` 境界値)
 *   - conversationPhase: ctx.messageCount から推定 (なければ "unknown")
 *   - timeSinceLastSpeakTurns: frequencyCap から取得 (初回は MAX_SAFE_INTEGER)
 *   - ruptureFlag: null (CEO B-4b 仕様で null は no-op、true のみ Safe Gate fail)
 *   - userOverrideSleep: sleepStore.get() (default false)
 *
 * **Phase C C-2 拡張** (`presenceMirrorBridge` 経由):
 *   - `patternCategoryBucket`: bridge cache から取得
 *     - bridge null (初期化前 / signal 未受領) → 従来通り `unknown_category` (canProceed false)
 *     - bridge non-null → bucket 別に discriminated union を構築 (本 module の
 *       `buildPatternCategoryResult` helper、§安全側設計参照)
 *   - 他 axis (mode / alignment / uncertainty / silenceBudget) は **依然 unknown**
 *     (`PresenceSignal` shape の制約、`presenceMirrorBridge.ts` 設計 caveat 参照)
 *
 * **Default-STAY_SILENT 維持** (C-2 後も):
 *   - 1 axis (patternCategory) が known になっても、他 axis (modeContext 等) が
 *     unknown のため Observe Gate fail → 結果 STAY_SILENT
 *   - これは C-2 設計通り (controlled progression、visible 経路は C-3 forced canary で)
 *
 * @param ctx - {@link AdapterContext} (optional fields のみ)
 * @returns {@link MirrorDecisionInput} (engine に渡せる format)
 *
 * @example
 *   buildMirrorDecisionInput({})
 *     // bridge null → 全 axis unknown → engine は STAY_SILENT
 *     //   (observe_gate_unknown_modeContext)
 *
 *   buildMirrorDecisionInput({ messageCount: 10 })
 *     // bridge non-null (patternCategoryBucket: null_pattern) →
 *     //   patternCategory known + conversationPhase in_progress, 他は unknown
 *     // → engine は STAY_SILENT (observe_gate_unknown_modeContext) を返す
 *     //   (default-STAY_SILENT 維持)
 */
export function buildMirrorDecisionInput(ctx: AdapterContext): MirrorDecisionInput {
  // (0) Phase C C-2: bridge から read input を取得 (null = 初期化前 / signal 未受領)
  const bridgeInput: MirrorReadInput | null = getMirrorReadInput();

  // (1) modeContext: bridge mode が null のため依然 unknown (Phase D 候補)
  const modeContext: MirrorDecisionInput["modeContext"] = {
    status: "unknown",
    mode: null,
    source: "missing",
    canProceedToMirrorDecision: false,
  };

  // (2) alignment / uncertainty / silenceBudget: signal から導出不能、依然 unknown
  const alignment: MirrorDecisionInput["alignment"] = {
    status: "unknown",
    bucket: "unknown",
    raw: null,
    canProceedToMirrorDecision: false,
  };

  const uncertainty: MirrorDecisionInput["uncertainty"] = {
    status: "unknown",
    bucket: "unknown",
    raw: null,
    canProceedToMirrorDecision: false,
  };

  const silenceBudget: MirrorDecisionInput["silenceBudget"] = {
    status: "unknown",
    bucket: "unknown",
    raw: null,
    canProceedToMirrorDecision: false,
  };

  // (3) patternCategory: Phase C C-2 で bridge cache から known に進む可能性あり
  const patternCategory: MirrorDecisionInput["patternCategory"] = bridgeInput
    ? buildPatternCategoryResult(bridgeInput.patternCategoryBucket)
    : {
        status: "unknown",
        bucket: "unknown_category",
        canProceedToMirrorDecision: false,
      };

  // (2) Mirror layer 内 state からの axes
  const observationNovelty: number = estimateNovelty(); // const 0.5

  const phaseDetectorInput: ConversationPhaseDetectorInput = {
    messageCount: ctx.messageCount,
    lastMessageAgeMs: ctx.lastMessageAgeMs,
  };
  const conversationPhase: ConversationPhase = detectConversationPhase(phaseDetectorInput);

  const timeSinceLastSpeakTurns: number = getTimeSinceLastSpeakTurns();

  // (3) Boolean state
  // ruptureFlag: presence 読まないため null (CEO B-4b 仕様: null は no-op、true のみ Safe Gate fail)
  const ruptureFlag: null = null;

  // userOverrideSleep: sleepStore default false、B-5b で UI / 言語的停止検出から変更可能
  const userOverrideSleep: boolean = getSleep();

  return {
    modeContext,
    alignment,
    uncertainty,
    silenceBudget,
    patternCategory,
    observationNovelty,
    conversationPhase,
    timeSinceLastSpeakTurns,
    ruptureFlag,
    userOverrideSleep,
  };
}
