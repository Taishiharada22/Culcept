/**
 * Clarify Fallback Selector — W3-PR-8 rev 3 commit 23
 *
 * 位置づけ:
 *   morningResponse.phase === "clarifying" かつ plan.items.length === 0 の
 *   「user-facing が不意に空質問 or 同文再質問になる」状態を user 画面直前で救済する
 *   pure helper。phase authority は変更せず、clarifyQuestion/message のみ書き換える。
 *
 * 問題の出所（2026-04-22 commit 22b live preview で観測）:
 *   カフェ→9時→まだ未定 シナリオで user が「まだ未定」と返すと:
 *     Turn 3: bindAnswerToSlot が semantic_miss を返す
 *       → route.ts L1855-1860 が morningResponse を priorPending.question の verbatim
 *         再提示で埋める
 *       → phase=clarifying items=0 のまま user 画面に同じ質問が再出現
 *     Turn 4: 同じ semantic_miss 連続で 2 発目 → pending 破棄経路
 *
 *   「同文再質問」は alter の会話 quality を壊し、undecided 継続では user の
 *   選択肢が狭まっていくのに体験が前進しない。
 *
 * 設計方針:
 *   1. phase authority は変更しない（clarifying のまま）。
 *   2. plan.items は作らない（LLM を介さず fabrication しない）。
 *   3. morningResponse.message / clarifyQuestion を差し替えるだけ。
 *   4. 世界観: Aneurasync alter voice（短く・柔らかく・断定しない・絵文字なし）。
 *      結論相当は 14-28 文字を目安、最長でも 1 文目が行末まで届かない程度。
 *
 * 判定順（最初に一致した branch で return、DAG 的に排他）:
 *   A. classifyUtterance(utterance).subKind === "undecided"
 *      → 4 sub-branch（draft の anchor/spec 状況で戦略を変える）
 *   B. bindReason === "semantic_miss"
 *      → targetSlot ∪ priorQuestion から rephrase を選ぶ
 *   C. currentMessage === priorQuestion（anti-dupe）
 *      → 同文 verbatim 再提示を避け、柔らかく添え直す
 *   D. どれにも該当しない → shouldReplace=false（不介入）
 *
 * 禁止事項:
 *   - Places search 呼び出し / 「近くのお店で探そうか？」開放（commit 19 凍結継続）
 *   - phase の変更 / plan.items の生成 / personalizeHints の上書き
 *   - DB / LLM / I/O 依存
 *
 * 設計書:
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §7.5 (clarifyFallback)
 */

import { classifyUtterance } from "./taxonomy";
import type { DialogFocus, SearchQueryDraft } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SelectClarifyFallbackParams {
  /** 今 turn の user 発話（trim 済みでも可、本関数が防御的に trim する） */
  utterance: string;
  /**
   * 今 turn 終了後の DialogState.searchQueryDraft。shadow block で reducer が
   * 更新した後の値を渡すのが正規。null は「shadow 未通過 / dialogState 不在」を表す。
   */
  draft: SearchQueryDraft | null;
  /** 今 turn 対象 slot（route 側で where/when/what に絞った値） */
  targetSlot: DialogFocus["slot"] | null;
  /** 前 turn で session.pendingClarify.question だった文字列（なければ null） */
  priorQuestion: string | null;
  /** bindAnswerToSlot の reason。"ok" | "semantic_miss" | "system_miss" | null */
  bindReason: string | null;
  /** 差し替え前の morningResponse.message（anti-dupe 判定に使う） */
  currentMessage: string;
}

export interface SelectClarifyFallbackResult {
  /** true のとき呼び出し側は morningResponse.message / clarifyQuestion を書き換える */
  shouldReplace: boolean;
  /** shouldReplace=true のときの差し替え先 message。false のときは null */
  nextMessage: string | null;
  /** debug / structured log 用の判定理由（英数字 + "_" のみ） */
  reason: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 判定ロジック
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * priorQuestion / targetSlot から「どの slot について聞いていたか」を推定する。
 * targetSlot が非 null ならそれを優先、null の時は priorQuestion の語から推定、
 * それでも分からなければ null。
 */
function inferSlot(
  targetSlot: DialogFocus["slot"] | null,
  priorQuestion: string | null,
): DialogFocus["slot"] | null {
  if (targetSlot !== null) return targetSlot;
  if (priorQuestion === null) return null;
  const q = priorQuestion;
  if (q.includes("どこ") || q.includes("場所") || q.includes("エリア")) {
    return "where";
  }
  if (q.includes("何時") || q.includes("いつ") || q.includes("時間")) {
    return "when";
  }
  if (q.includes("何を") || q.includes("何する") || q.includes("なに")) {
    return "what";
  }
  return null;
}

/**
 * undecided 系 user 応答に対する差し替えメッセージ生成。
 *
 * 4 sub-branch:
 *   - A1: anchor あり + (category|chain) あり
 *     → 既に情報は出揃っている。候補提示の合図を出して次の turn 行動を引き出す。
 *   - A2: anchor なし + (category|chain) あり
 *     → spec は持っている。anchor を柔らかく聞く（narrowStep を進める方向）。
 *   - A3: anchor あり + spec なし
 *     → anchor は持っている。ジャンル/chain を広めに聞く。
 *   - A4: 情報なし（初手で undecided）
 *     → 戦略切替。「決めなくていい」前提で方向だけ柔らかく拾う。
 */
function buildUndecidedMessage(
  draft: SearchQueryDraft | null,
): { message: string; reason: string } {
  const anchor = draft?.anchorRegion ?? null;
  const category = draft?.categoryToken ?? null;
  const chain = draft?.chainToken ?? null;
  const spec = chain ?? category; // chain 優先（specificity）

  if (anchor !== null && spec !== null) {
    // A1: 情報揃い — 候補提示に誘導
    return {
      message: `${anchor}の${spec}で、気になる所いくつか挙げてみる？`,
      reason: "undecided_anchor_and_spec",
    };
  }
  if (anchor === null && spec !== null) {
    // A2: spec のみ — anchor を引き出す
    return {
      message: `${spec}はいいね。エリアだけ、どのへんが近い？`,
      reason: "undecided_spec_needs_anchor",
    };
  }
  if (anchor !== null && spec === null) {
    // A3: anchor のみ — spec を引き出す
    return {
      message: `${anchor}のあたりで、気分はカフェ系？ ご飯系？`,
      reason: "undecided_anchor_needs_spec",
    };
  }
  // A4: 情報なし — 戦略切替
  return {
    message: "決めきらなくて大丈夫。まずどっち寄りの気分？ 外？ 家？",
    reason: "undecided_empty_draft",
  };
}

/**
 * semantic_miss に対する rephrase 生成。slot ヒントがあればそれ寄りに、
 * なければ柔らかい generic rephrase を返す。
 */
function buildSemanticMissMessage(
  slot: DialogFocus["slot"] | null,
): { message: string; reason: string } {
  switch (slot) {
    case "where":
      return {
        message: "どこに行くか、ざっくりでいい。エリアだけでも。",
        reason: "semantic_miss_rephrase_where",
      };
    case "when":
      return {
        message: "時間帯だけ教えて。朝？ 昼？ 夜？",
        reason: "semantic_miss_rephrase_when",
      };
    case "what":
      return {
        message: "何する気分？ なんとなくでいい。",
        reason: "semantic_miss_rephrase_what",
      };
    default:
      return {
        message: "ごめん、もう少しだけ手がかり欲しい。",
        reason: "semantic_miss_rephrase_generic",
      };
  }
}

/**
 * 同文 verbatim 再提示を避けるため、priorQuestion に「ぼんやりでいい」を添える。
 */
function buildAntiDupeMessage(
  priorQuestion: string,
): { message: string; reason: string } {
  return {
    message: `${priorQuestion} ぼんやりでいい。`,
    reason: "anti_dupe_soften",
  };
}

/**
 * phase=clarifying && items=0 の state で user-facing message を救済する pure 関数。
 *
 * 呼び出し側の責務:
 *   - gate 条件（phase=clarifying && items=0）の判定は route 側で行う
 *   - 本関数は常に SelectClarifyFallbackResult を返すだけで、shouldReplace=false なら
 *     呼び出し側は morningResponse を触らない
 */
export function selectClarifyFallback(
  params: SelectClarifyFallbackParams,
): SelectClarifyFallbackResult {
  const {
    utterance,
    draft,
    targetSlot,
    priorQuestion,
    bindReason,
    currentMessage,
  } = params;

  const trimmedUtterance = typeof utterance === "string" ? utterance.trim() : "";

  // ── Branch A: undecided ──────────────────────────────────────────────
  // 空発話は classifyUtterance が "other" を返すので A に入らない（意図的）。
  if (trimmedUtterance.length > 0) {
    const capture = classifyUtterance(trimmedUtterance);
    if (capture.subKind === "undecided") {
      const { message, reason } = buildUndecidedMessage(draft);
      return {
        shouldReplace: true,
        nextMessage: message,
        reason,
      };
    }
  }

  // ── Branch B: semantic_miss rephrase ────────────────────────────────
  if (bindReason === "semantic_miss") {
    const inferred = inferSlot(targetSlot, priorQuestion);
    const { message, reason } = buildSemanticMissMessage(inferred);
    return {
      shouldReplace: true,
      nextMessage: message,
      reason,
    };
  }

  // ── Branch C: anti-dupe ─────────────────────────────────────────────
  // 「次 turn の message が priorQuestion と完全一致」の現象を検知して柔らかくする。
  // priorQuestion が null / 空 の時は発火しない（そもそも同文になり得ない）。
  if (
    priorQuestion !== null &&
    priorQuestion.length > 0 &&
    currentMessage === priorQuestion
  ) {
    const { message, reason } = buildAntiDupeMessage(priorQuestion);
    return {
      shouldReplace: true,
      nextMessage: message,
      reason,
    };
  }

  // ── Branch D: 不介入 ─────────────────────────────────────────────────
  return {
    shouldReplace: false,
    nextMessage: null,
    reason: "noop",
  };
}
