/**
 * detectModifyIntent — utterance から modify 意図を deterministic に検出する pure function
 *
 * CEO 2026-04-28 PR #41a Commit 8:
 *   LLM が turn_mode を 100% 安定で出すとは限らない (確率的)。
 *   Commit 7 で SYSTEM_PROMPT を強化したが、safety net として deterministic guard を
 *   設置する。
 *
 *   本 helper は utterance だけから「modify 意図がある」 を判定する。
 *   priorPersistedEvents の有無や LLM 出力には依存しない (合成は呼び出し側 = legacyAdapter)。
 *
 * 検出条件:
 *   1. **change keyword**: 「変更/変える/ずらす/にする/移動/キャンセル/削除/やめる」
 *   2. **time-shift pattern**: 「○時を△時に」「○:○○を△:△△に」 等
 *   3. **place-shift pattern** (将来拡張、本 commit では time のみ): 「○○を△△に」
 *
 * 戻り値:
 *   - isModifyIntent: 上記条件のいずれかで modify と判定
 *   - suggestedTargetRef: target_ref に使うヒント文字列 (例: "9時の予定")
 *   - suggestedChangeScope: change_scope (デフォルト "patch")
 *   - suggestedWhen: 変更後の when (time-shift pattern から抽出)
 *
 * 設計原則:
 *   - 純関数、副作用なし、env / flag を読まない
 *   - false positive 抑制: 「9時を10時に変更」 のような明確な pattern が必要
 *   - 単独「変更」だけでは不十分 (時刻 / 場所など変更対象が必要)
 *
 * 適用場所:
 *   legacyAdapter で comprehension.events を見て:
 *     - LLM が turn_mode="modify" を既に出していれば guard 不要
 *     - LLM が turn_mode="create" を出していて、かつ detectModifyIntent=true で、かつ
 *       priorPersistedEvents が non-empty なら、event の turn_mode を "modify" に補正
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ChangeScopeSuggestion = "replace" | "patch" | "append" | "remove";

export interface ModifyIntentResult {
  /** modify 意図を検出したか */
  isModifyIntent: boolean;
  /**
   * target_ref として使うヒント文字列。
   * - time-shift detected: "{fromHour}時の予定" (e.g., "9時の予定")
   * - keyword only: undefined (target 不確定。呼び出し側で fallback 必要)
   */
  suggestedTargetRef?: string;
  /** change_scope ヒント。default は patch */
  suggestedChangeScope: ChangeScopeSuggestion;
  /**
   * time-shift pattern が detected された場合、変更後の HH:mm。
   * 「9時を10時に変更」 → "10:00"
   * keyword only の場合は undefined。
   */
  suggestedNewStartTime?: string;
  /**
   * detect の根拠 (debug / trace 用)。複数 reason が同時に true もあり得る。
   */
  reasons: {
    hasChangeKeyword: boolean;
    hasTimeShiftPattern: boolean;
    hasCancelKeyword: boolean;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Keyword sets
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 「変更/修正系」 keyword (turn_mode=modify, change_scope=patch or replace)
const CHANGE_KEYWORD_RE =
  /変更|変える|変えて|ずらす|ずらして|にする|にして|移動|移して|変えたい|変更したい|遅らせる|早める|早めて|遅らせて/;

// 「キャンセル / 削除系」 keyword (turn_mode=modify, change_scope=remove)
const CANCEL_KEYWORD_RE = /キャンセル|削除|やめる|やめたい|なし|消す|消して|外す|抜く/;

// 時刻 A → 時刻 B pattern
//   matches: 「9時を10時に」「9時を10時にする」「9時を10時に変更」「09:00を10:00に」
//   captures: [_, fromHour or fromHHmm, toHour or toHHmm]
const TIME_SHIFT_RE_HOUR = /(\d{1,2})時を(\d{1,2})時に/;
const TIME_SHIFT_RE_HHMM = /(\d{1,2}):(\d{2})を(\d{1,2}):(\d{2})に/;
// 矢印 pattern (より自然): 「9時→10時」「09:00 → 10:00」
const TIME_ARROW_RE_HOUR = /(\d{1,2})時\s*[→⇒>]\s*(\d{1,2})時/;
const TIME_ARROW_RE_HHMM = /(\d{1,2}):(\d{2})\s*[→⇒>]\s*(\d{1,2}):(\d{2})/;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function padHour(h: number): string {
  return h.toString().padStart(2, "0");
}

interface TimeShiftMatch {
  fromHour: number;
  fromMinute: number;
  toHour: number;
  toMinute: number;
}

/**
 * utterance から time-shift pattern を抽出する。
 * 優先順序: HH:mm pattern → 時 pattern。HH:mm が明示的な場合はそちらを採用。
 */
function extractTimeShift(normalized: string): TimeShiftMatch | null {
  // 1. HH:mm pattern (「09:00を10:00に」)
  const hhmmMatch =
    normalized.match(TIME_SHIFT_RE_HHMM) ||
    normalized.match(TIME_ARROW_RE_HHMM);
  if (hhmmMatch) {
    const fromHour = parseInt(hhmmMatch[1], 10);
    const fromMinute = parseInt(hhmmMatch[2], 10);
    const toHour = parseInt(hhmmMatch[3], 10);
    const toMinute = parseInt(hhmmMatch[4], 10);
    if (
      fromHour >= 0 &&
      fromHour <= 23 &&
      fromMinute >= 0 &&
      fromMinute <= 59 &&
      toHour >= 0 &&
      toHour <= 23 &&
      toMinute >= 0 &&
      toMinute <= 59
    ) {
      return { fromHour, fromMinute, toHour, toMinute };
    }
  }

  // 2. 時 pattern (「9時を10時に」)
  const hourMatch =
    normalized.match(TIME_SHIFT_RE_HOUR) ||
    normalized.match(TIME_ARROW_RE_HOUR);
  if (hourMatch) {
    const fromHour = parseInt(hourMatch[1], 10);
    const toHour = parseInt(hourMatch[2], 10);
    if (fromHour >= 0 && fromHour <= 23 && toHour >= 0 && toHour <= 23) {
      return { fromHour, fromMinute: 0, toHour, toMinute: 0 };
    }
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// applyDeterministicModifyIntent — 補正 logic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Event, ChangeScope } from "./eventSchema";

export interface ApplyModifyIntentInput {
  /** LLM 出力の events (raw comprehension) */
  events: Event[];
  /** prior persisted events (補正対象判定 + target_ref fallback) */
  priorPersistedEvents: Event[];
  /** ユーザー発話 */
  utterance: string;
}

export interface ApplyModifyIntentResult {
  /** 補正後の events (mutate せず新配列を返す pure) */
  events: Event[];
  /**
   * 補正発火フラグ:
   *   true: detectModifyIntent + 安全条件すべて満たし event[0] の turn_mode を modify に書き換えた
   *   false: 補正なし (LLM が既に modify を出した / 条件に該当しない)
   */
  modifyCandidate: boolean;
  /** 補正の根拠 (debug / trace 用) */
  reason:
    | "no_intent" // detectModifyIntent が isModifyIntent=false を返した
    | "no_prior" // priorPersistedEvents が空
    | "events_count_mismatch" // events.length !== 1 (補正は単一 event のみ)
    | "already_modify" // 既に LLM が turn_mode='modify' を出している
    | "applied"; // 補正発火
  /** detectModifyIntent の生結果 (trace で参照可能に) */
  detection: ModifyIntentResult;
}

/**
 * LLM が turn_mode="create" を出したが、utterance pattern から modify 意図が
 * 確実に読み取れる場合、event[0].turn_mode を "modify" に補正する。
 *
 * 安全条件 (すべて AND):
 *   1. detectModifyIntent(utterance).isModifyIntent === true
 *   2. priorPersistedEvents.length > 0 (補正対象が存在する)
 *   3. events.length === 1 (単一 event のみ補正、複数は危険)
 *   4. events[0].turn_mode === "create" (既に modify ならそのまま)
 *
 * 補正内容:
 *   - turn_mode: "create" → "modify"
 *   - target_ref: detectModifyIntent.suggestedTargetRef (or fallback "最初の予定")
 *   - target_ref_confidence: "medium" (補正由来であることを明示)
 *   - change_scope: detectModifyIntent.suggestedChangeScope (default "patch")
 *   - when.startTime: detectModifyIntent.suggestedNewStartTime があれば override
 *
 * 戻り値:
 *   modifyCandidate=true なら events[0] が modify に書き換えられている。
 *   trace に modifyCandidate=true が出ることで観測可能。
 */
export function applyDeterministicModifyIntent(
  input: ApplyModifyIntentInput,
): ApplyModifyIntentResult {
  const { events, priorPersistedEvents, utterance } = input;
  const detection = detectModifyIntent(utterance);

  if (!detection.isModifyIntent) {
    return { events, modifyCandidate: false, reason: "no_intent", detection };
  }
  if (priorPersistedEvents.length === 0) {
    return { events, modifyCandidate: false, reason: "no_prior", detection };
  }
  if (events.length !== 1) {
    return {
      events,
      modifyCandidate: false,
      reason: "events_count_mismatch",
      detection,
    };
  }
  if (events[0].turn_mode === "modify") {
    return {
      events,
      modifyCandidate: false,
      reason: "already_modify",
      detection,
    };
  }
  // turn_mode === "append" は本 commit では補正対象外 (LLM の意図を尊重)
  if (events[0].turn_mode !== "create") {
    return {
      events,
      modifyCandidate: false,
      reason: "already_modify", // append 等は touch しない
      detection,
    };
  }

  // 補正発火
  const targetRef =
    detection.suggestedTargetRef ??
    // priorPersistedEvents が 1 件しかなければ「最初の予定」 fallback
    (priorPersistedEvents.length === 1 ? "最初の予定" : undefined);

  const correctedEvent: Event = {
    ...events[0],
    turn_mode: "modify",
    target_ref: targetRef ?? events[0].target_ref,
    target_ref_confidence: "medium",
    change_scope: detection.suggestedChangeScope as ChangeScope,
    // suggestedNewStartTime があれば when.startTime を override (modify の意図する変更後値)
    ...(detection.suggestedNewStartTime
      ? {
          when: {
            ...events[0].when,
            startTime: detection.suggestedNewStartTime,
          },
        }
      : {}),
  };

  return {
    events: [correctedEvent],
    modifyCandidate: true,
    reason: "applied",
    detection,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * utterance から modify 意図を検出する。
 *
 * 判定優先順位:
 *   1. time-shift pattern detected → modify (suggestedNewStartTime + suggestedTargetRef)
 *   2. cancel keyword → modify (change_scope="remove")
 *   3. change keyword → modify (target_ref 不確定)
 *   4. なし → not modify
 *
 * Phase 1 (PR #41a) では time-shift と change keyword のみ対象。
 * place-shift / activity-shift は将来拡張。
 */
export function detectModifyIntent(utterance: string): ModifyIntentResult {
  const u = utterance.normalize("NFKC");
  const hasChangeKeyword = CHANGE_KEYWORD_RE.test(u);
  const hasCancelKeyword = CANCEL_KEYWORD_RE.test(u);

  const timeShift = extractTimeShift(u);
  const hasTimeShiftPattern = timeShift !== null;

  // Strategy 1: time-shift pattern (最も confident)
  //   「○時を△時に」 が明示されていれば、change keyword の有無に関わらず modify。
  //   target_ref に「{fromHour}時の予定」を提案、suggestedNewStartTime に変更後時刻。
  if (timeShift) {
    const fromHHmm = `${padHour(timeShift.fromHour)}:${padHour(timeShift.fromMinute)}`;
    const toHHmm = `${padHour(timeShift.toHour)}:${padHour(timeShift.toMinute)}`;
    void fromHHmm; // documentation
    return {
      isModifyIntent: true,
      suggestedTargetRef: `${timeShift.fromHour}時の予定`,
      suggestedChangeScope: "patch",
      suggestedNewStartTime: toHHmm,
      reasons: {
        hasChangeKeyword,
        hasTimeShiftPattern: true,
        hasCancelKeyword,
      },
    };
  }

  // Strategy 2: cancel keyword (change_scope="remove")
  if (hasCancelKeyword) {
    return {
      isModifyIntent: true,
      suggestedTargetRef: undefined, // target 不確定（context 依存）
      suggestedChangeScope: "remove",
      reasons: {
        hasChangeKeyword,
        hasTimeShiftPattern: false,
        hasCancelKeyword: true,
      },
    };
  }

  // Strategy 3: change keyword (時刻パターン無し、target 不確定だが modify 意図)
  if (hasChangeKeyword) {
    return {
      isModifyIntent: true,
      suggestedTargetRef: undefined,
      suggestedChangeScope: "patch",
      reasons: {
        hasChangeKeyword: true,
        hasTimeShiftPattern: false,
        hasCancelKeyword: false,
      },
    };
  }

  // No modify intent detected
  return {
    isModifyIntent: false,
    suggestedChangeScope: "patch",
    reasons: {
      hasChangeKeyword: false,
      hasTimeShiftPattern: false,
      hasCancelKeyword: false,
    },
  };
}
