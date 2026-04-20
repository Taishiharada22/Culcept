/**
 * CoAlter Phase 2 — Mode router (2026-04-19 v0.3)
 *
 * 位置づけ: Pre-router gate を通過した後の mode 判定レイヤー。
 *           mode を返すだけでなく **RouterTrace**（監査可能な分岐情報）を返す。
 *
 * 参照: docs/coalter-phase2-3mode-design.md §1.3, §1.3.1
 *
 * 判定フロー（短絡評価、上から順）:
 *  1. previousNegotiateNoProposal === true
 *     → decision (reason: negotiate_no_proposal_retry_decision)
 *     ※ CEO 実装固定条件: この最優先短絡を実装で崩さない
 *  2. previousMode === "clarify" && previousClarifyTurns >= 1 && misread >= 0.7
 *     → decision (reason: clarify_self_suppression)
 *     ※ clarify 自己増殖防止
 *  3. misread.confidence >= 0.7 → clarify
 *  4. contradiction.detected === true → negotiate
 *  5. stall.detected === true → decision
 *  6. ambiguity.response_mode === "conclude" → decision
 *     ambiguity.response_mode === "branch" → decision
 *  7. ambiguity.response_mode === "clarify" → decision (1 問委譲)
 *     ※ Ambiguity Engine の clarify と CoAlter clarify モードは別物
 *  8. default → decision
 *
 * 制約（CEO 実装固定条件）:
 *  - **純関数**。DB 書き込み / UI 文言生成 / LLM 呼び出し禁止。
 *    trace を返すだけに留める。
 *  - Post-router modifier は別関数（本ファイルでは questionBudget の初期値のみ決める）。
 */

import type {
  CoAlterMode,
  ModeRouterInput,
  RouterReason,
  RouterTrace,
  SignalName,
  EmotionHeat,
} from "./types";

/** misread が「主要信号」として扱われる閾値 */
const MISREAD_DOMINANT_THRESHOLD = 0.7;

/**
 * 入力から**反応した信号**（triggered）の集合を算出する。
 * 抑制判定は含まない。trace の triggeredSignals に入る候補リスト。
 */
function collectTriggeredSignals(input: ModeRouterInput): SignalName[] {
  const signals: SignalName[] = [];
  if (input.misread.confidence >= MISREAD_DOMINANT_THRESHOLD) {
    signals.push("misread");
  }
  if (input.contradiction.detected) {
    signals.push("contradiction");
  }
  if (input.stall.detected) {
    signals.push("stall");
  }
  if (input.ambiguityResponseMode === "conclude") {
    signals.push("ambiguity_conclude");
  } else if (input.ambiguityResponseMode === "branch") {
    signals.push("ambiguity_branch");
  } else if (input.ambiguityResponseMode === "clarify") {
    signals.push("ambiguity_clarify");
  }
  if (
    input.previousMode === "clarify" &&
    input.previousClarifyTurns >= 1 &&
    input.misread.confidence >= MISREAD_DOMINANT_THRESHOLD
  ) {
    signals.push("previous_clarify_self_suppress");
  }
  if (input.previousNegotiateNoProposal) {
    signals.push("previous_negotiate_no_proposal");
  }
  return signals;
}

/**
 * 反応した信号のうち、**選ばれた分岐以外で抑制された信号**を算出する。
 * reason に応じて、本来選ばれた可能性のある信号を除外して残す。
 */
function collectSuppressedSignals(
  triggered: SignalName[],
  reason: RouterReason,
): SignalName[] {
  // 各分岐で「もし reason がこれでなかったら発火し得たもの」= triggered - 選ばれた分岐の信号
  const suppressed = new Set<SignalName>(triggered);

  // 各 reason で「その reason の根拠となった信号」を suppressed から除外する
  switch (reason) {
    case "negotiate_no_proposal_retry_decision":
      suppressed.delete("previous_negotiate_no_proposal");
      break;
    case "clarify_self_suppression":
      suppressed.delete("previous_clarify_self_suppress");
      // self_suppress のとき、misread も根拠の一部なので除外
      suppressed.delete("misread");
      break;
    case "misread_dominant":
      suppressed.delete("misread");
      break;
    case "contradiction_detected":
      suppressed.delete("contradiction");
      break;
    case "stall_detected":
      suppressed.delete("stall");
      break;
    case "ambiguity_conclude":
      suppressed.delete("ambiguity_conclude");
      break;
    case "ambiguity_branch":
      suppressed.delete("ambiguity_branch");
      break;
    case "ambiguity_clarify_delegate_decision":
      suppressed.delete("ambiguity_clarify");
      break;
    case "default_decision":
      // 何も発火していないので suppressed は空集合
      break;
  }

  return Array.from(suppressed);
}

/**
 * emotion_heat から初期 questionBudget を算出する。
 * Post-router modifier が最終決定するが、RouterTrace に入れるために
 * router 側でも同じロジックで暫定値を出す。
 *
 * - emotion_heat.severity === "mid" → 0
 * - それ以外 → 1
 *
 * target 不明による 0 は clarifyBuilder 側で最終判断するので、ここでは扱わない。
 */
export function deriveQuestionBudget(emotionHeat: EmotionHeat): 0 | 1 {
  return emotionHeat.severity === "mid" ? 0 : 1;
}

/**
 * mode 判定の核。純関数。
 *
 * @param input ModeRouterInput（ModeRouterInput 型の全フィールド）
 * @param emotionHeat questionBudget 算出のためだけに参照。mode 判定には使わない
 *                    （emotion_heat high は Pre-router gate で既に弾かれている前提）
 * @param now 現在時刻（テスト容易性のため引数化、省略時 new Date()）
 * @returns RouterTrace（selectedMode / reason / triggered / suppressed / previousMode / questionBudget / timestamp）
 */
export function runModeRouter(
  input: ModeRouterInput,
  emotionHeat: EmotionHeat,
  now: Date = new Date(),
): RouterTrace {
  const triggered = collectTriggeredSignals(input);

  // 短絡評価（上から順）
  const { selectedMode, reason } = decideMode(input);

  const suppressed = collectSuppressedSignals(triggered, reason);
  const questionBudget = deriveQuestionBudget(emotionHeat);

  return {
    selectedMode,
    reason,
    triggeredSignals: triggered,
    suppressedSignals: suppressed,
    previousMode: input.previousMode,
    questionBudget,
    timestamp: now.toISOString(),
  };
}

/**
 * mode と reason を決める内部関数。短絡評価。
 */
function decideMode(
  input: ModeRouterInput,
): { selectedMode: CoAlterMode; reason: RouterReason } {
  // 1. 【最優先短絡】前ターン negotiate proposals=0 → decision 再実行
  //    CEO 実装固定条件: このルールを崩さない
  if (input.previousNegotiateNoProposal) {
    return {
      selectedMode: "decision",
      reason: "negotiate_no_proposal_retry_decision",
    };
  }

  // 2. clarify 自己増殖抑制（連続 clarify ≥ 1 かつ誤読がなお強い）
  if (
    input.previousMode === "clarify" &&
    input.previousClarifyTurns >= 1 &&
    input.misread.confidence >= MISREAD_DOMINANT_THRESHOLD
  ) {
    return {
      selectedMode: "decision",
      reason: "clarify_self_suppression",
    };
  }

  // 3. misread 優勢 → clarify
  if (input.misread.confidence >= MISREAD_DOMINANT_THRESHOLD) {
    return { selectedMode: "clarify", reason: "misread_dominant" };
  }

  // 4. 対立検出 → negotiate
  if (input.contradiction.detected) {
    return { selectedMode: "negotiate", reason: "contradiction_detected" };
  }

  // 5. 膠着 → decision（branch 寄り、実装は decision builder 側で）
  if (input.stall.detected) {
    return { selectedMode: "decision", reason: "stall_detected" };
  }

  // 6. Ambiguity conclude / branch → decision
  if (input.ambiguityResponseMode === "conclude") {
    return { selectedMode: "decision", reason: "ambiguity_conclude" };
  }
  if (input.ambiguityResponseMode === "branch") {
    return { selectedMode: "decision", reason: "ambiguity_branch" };
  }

  // 7. Ambiguity clarify → decision（1 問委譲）
  //    ※ Ambiguity Engine の clarify と CoAlter clarify モードは別物
  if (input.ambiguityResponseMode === "clarify") {
    return {
      selectedMode: "decision",
      reason: "ambiguity_clarify_delegate_decision",
    };
  }

  // 8. default
  return { selectedMode: "decision", reason: "default_decision" };
}
