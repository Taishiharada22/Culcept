/**
 * Response Promotion — W3-PR-8 rev 3 commit 19
 *
 * 位置づけ:
 *   commit 17/18 までは DialogState / shadowPipeline は
 *   「persist only（session.dialogState のみ更新）」で、user 画面には
 *   一切出ない dead code だった。commit 19 で初めて
 *   `DialogState → derivePendingClarify` の結果を user-facing な
 *   `MorningProtocolResponse.message` / `clarifyQuestion` に反映する。
 *
 *   本ファイルは route.ts から呼ばれる pure helper。route 内で inline 分岐
 *   するのではなく小さい純粋関数に切り出すことで、
 *   「昇格条件」「非昇格条件」を test で 1:1 に固定できるようにする。
 *
 * CEO 方針（2026-04-22 commit 19 条件）:
 *   1. flag ON 時だけ DialogState → derive を「実質問生成」に使う
 *      （flag gate は route 側で行う。本 helper は flag を知らない。）
 *   2. same broad question の繰り返しを
 *      - narrower step（reducer が newDraft に応じて narrowStep を advance）
 *      - slot switch（conversationStatus=slot_switching → derive=null → legacy 維持）
 *      - provider recovery（provider_recovering → derive=provider_retry の固定質問）
 *      で user-facing に解消する。本 helper 自体は分岐を持たず、
 *      derive 側で既に決まった question をそのまま user-facing に反映する。
 *   3. search_handoff_blocking は internal only のまま
 *      derivePendingClarify が where + search_handoff_blocking → null を返すため、
 *      本 helper は「derived=null なら legacy message 維持」ルールで自動的に
 *      「近くのお店で探そうか？」の open を防ぐ。user-facing に漏れない。
 *   4. plan_presented には上げない
 *      response.phase !== "clarifying" のとき本関数は response を未変更で返す。
 *   5. phase authority 変更禁止
 *      本関数は response.phase / response.plan / response.personalizeHints に
 *      一切触らない。message / clarifyQuestion のみ上書き。
 *
 * 禁止事項（commit 19 scope 外）:
 *   - PR-9 search 実装・候補提示 UI・「近くのお店で探そうか？」の user-facing 開放
 *   - phase authority（hasBlockingUnresolvedSlots）の変更
 *   - Places API 呼び出し
 *   - session.pendingClarify への書き戻し（DialogState が唯一の主状態）
 *
 * 設計書:
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §5 / §7.4
 *   - docs/alter-morning-strict-confirmation-design.md §3.7
 *
 * 本 helper は pure:
 *   - 入力 `response` / `derived` を mutate しない
 *   - Date.now / LLM / DB / I/O を呼ばない
 *   - 戻り値は新しい MorningProtocolResponse（上書き時）か、同一参照（非上書き時）
 */

import type { MorningProtocolResponse, PendingClarify } from "../types";

export interface PromoteDialogStateArgs {
  /**
   * legacyAdapter / processMorningMessage が既に構築した response。
   * phase / plan / message / clarifyQuestion は legacy 経路で埋まっている前提。
   */
  response: MorningProtocolResponse;
  /**
   * `advanceDialogState(...).derived`。DialogState から derive した
   * PendingClarify 相当のビュー。null は「質問しない／legacy に任せる」の意味。
   */
  derived: PendingClarify | null;
}

/**
 * flag ON 時に DialogState → derive の question を user-facing 応答に昇格させる。
 *
 * 昇格条件（全て AND）:
 *   - response.phase === "clarifying"
 *   - derived !== null
 *   - derived.question が非空（trim 後 length > 0）
 *
 * 非昇格時は response を同一参照でそのまま返す（呼び出し側が `===` で
 * 「昇格されたか」を観測できるよう、不要な shallow copy は作らない）。
 *
 * @returns 昇格時は新 response、非昇格時は入力 response と同一参照
 */
export function promoteDialogStateToUserFacing(
  args: PromoteDialogStateArgs,
): MorningProtocolResponse {
  const { response, derived } = args;

  // Rule 4: plan_presented / その他 phase は非昇格（phase authority 尊重）
  //   legacy が phase を「質問不要」側に決めた回は、derive が question を
  //   返していても user-facing を書き換えない。
  //   "clarifying" のみが質問を user-facing に見せる phase。
  if (response.phase !== "clarifying") {
    return response;
  }

  // Rule 3: derived=null → legacy message 維持
  //   - search_handoff_blocking（where）→ derive が null 返却
  //       → user-facing に「近くのお店で探そうか？」を漏らさない（CEO 条件 #3）
  //   - slot_switching（where）→ derive が null 返却
  //       → legacy gapResolver の next-slot question を維持
  //   - stable → derive が null 返却（そもそも phase=clarifying と矛盾想定だが防御的に維持）
  //   - focus === null → derive が null 返却（legacy 側で question 生成済み）
  if (derived === null) {
    return response;
  }

  // Rule: question が空ならフォールバック禁止（legacy message を維持）
  const q = typeof derived.question === "string" ? derived.question.trim() : "";
  if (q.length === 0) {
    return response;
  }

  // Rule 1 + Rule 2: user-facing 昇格
  //   message / clarifyQuestion を同じ q で上書き。
  //   - phase / plan / personalizeHints には触らない（CEO 条件 #5）
  //   - narrower-step / slot-switch / provider-recovery は全て derive 側で分岐済み。
  //     本関数は derive の結論をそのまま user-facing に流すだけ。
  return {
    ...response,
    message: q,
    clarifyQuestion: q,
  };
}
