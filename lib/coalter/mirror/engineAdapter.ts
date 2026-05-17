/**
 * CoAlter AOO Phase B B-5a — Engine Adapter (runtime context → MirrorDecisionInput)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §3 / §5
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.5
 *
 * 役割 (B-5a 段階):
 *   `MirrorDecisionInput` を **runtime context から組み立てる** pure adapter。
 *
 *   B-5a (shadow mode foundation) では:
 *     - **presence layer / observer layer 触らない / 読まない** (CEO B-5a 仕様の絶対境界)
 *     - 取得不能な axes は **すべて unknown / conservative default** に倒す
 *     - 結果: engine は Observe Gate fail で STAY_SILENT を返すことが多くなる
 *     - これは **shadow mode の目的に合致** (engine wiring 確認、real input は B-5b 以降)
 *
 *   将来 B-5b 以降で presence layer から safe な read-only API が確立されたら、
 *   本 adapter が利用するように拡張。
 *
 * 設計原則:
 *   - **pure / deterministic / side-effect-free**
 *   - **PII 受理なし**: 引数は `AdapterContext` で boolean + number のみ受理
 *   - **defensive defaults**: 不明 axes → unknown (Observe Gate fail)
 *   - **module-level state は参照する** (sleepStore / frequencyCap / noveltyEstimator /
 *     conversationPhaseDetector) が、各 module 自体が session-local in-memory のみ
 *
 * No-Effect Contract:
 *   - I/O / network / storage / DOM / event / timer / log / LLM 一切なし
 *   - 入力 mutation なし
 *   - 出力 object は新規 (caller の参照に影響なし)
 *   - PII (raw text / message id / user id / pair id / session id) 一切受け取らない
 *
 * 不可侵境界:
 *   - 既存 presence layer / observer layer touch なし
 *   - chat layer 17 files touch なし
 *   - B-1 〜 B-4d zero diff
 */

import { getSleep } from "./sleepStore";
import { getTimeSinceLastSpeakTurns } from "./frequencyCap";
import { estimateNovelty } from "./noveltyEstimator";
import {
  detectConversationPhase,
  type ConversationPhaseDetectorInput,
} from "./conversationPhaseDetector";
import type {
  MirrorDecisionInput,
  ConversationPhase,
} from "./types";

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
 * **B-5a の defensive defaults**:
 *   - modeContext / alignment / uncertainty / silenceBudget / patternCategory:
 *     **すべて unknown** (presence layer 読まないため)
 *   - observationNovelty: 0.5 (placeholder、`WORTH_NOVELTY_MIN` 境界値)
 *   - conversationPhase: ctx.messageCount から推定 (なければ "unknown")
 *   - timeSinceLastSpeakTurns: frequencyCap から取得 (初回は MAX_SAFE_INTEGER)
 *   - ruptureFlag: null (presence 読まないため、CEO B-4b 仕様で null は no-op)
 *   - userOverrideSleep: sleepStore.get() (default false)
 *
 * @param ctx - {@link AdapterContext} (optional fields のみ)
 * @returns {@link MirrorDecisionInput} (engine に渡せる format)
 *
 * @example
 *   buildMirrorDecisionInput({})
 *     // → 全 axis unknown → engine は STAY_SILENT (observe_gate_unknown_modeContext) を返す
 *
 *   buildMirrorDecisionInput({ messageCount: 10, lastMessageAgeMs: 5000 })
 *     // → conversationPhase: "in_progress", 他は unknown
 *     // → engine は STAY_SILENT (observe_gate_unknown_modeContext) を返す (まだ presence 読まないため)
 */
export function buildMirrorDecisionInput(ctx: AdapterContext): MirrorDecisionInput {
  // (1) Presence layer 由来 axes はすべて unknown (B-5a 不可侵境界)
  const modeContext: MirrorDecisionInput["modeContext"] = {
    status: "unknown",
    mode: null,
    source: "missing",
    canProceedToMirrorDecision: false,
  };

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

  const patternCategory: MirrorDecisionInput["patternCategory"] = {
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
