/**
 * Phase 3-N-3a — Empty Day Observation Pure Foundation
 *
 * 設計原則 (= N-3 plan audit `04ccca51` §11、 CEO + GPT 合議で確定):
 *   - empty day は「埋めるべき空白」 ではない
 *   - entry は default visible だが控えめ tone (= push しない)
 *   - user tap で初めて Alter modal 起動 (= user initiated、 但し UI 接続は N-3b 以降)
 *   - modal 内容は「見立て」 / 「下書き」 / 「観測」 (= push 型ではない)
 *
 * pure foundation (= 本 file の責務):
 *   - LLM call 0 / API call 0 / DB 0 / localStorage 0 / network 0
 *   - 既存 UI 不触 (= N-3b 以降)
 *   - 新規 component 0 (= type / helper / const のみ)
 *   - push recommendation 0 (= label / context / 判定 のみ)
 *
 * 思想 transmission (= Aneurasync 中心問い接続):
 *   - 「観測の幕間」 = entry tap で初めて開く (= push しない)
 *   - 「観測しない時は静か」 = entry は控えめ tone、 modal は user initiated
 *   - 「ALTER で見る」 = 観測の入口、 push 型ではない
 *
 * 設計書:
 *   - docs/alter-plan-phase3-n-3-plan-audit.md (= `04ccca51`)
 *   - docs/alter-plan-phase3-n-3-readiness-audit.md (= `cf869f6d`)
 *   - docs/alter-plan-phase3-n-completion-audit.md (= `95d15ea6`、 §3.3 N-3)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types (= pure type 定義、 view model のみ)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Entry を出す plan tab の種別
 *
 * 3 tab 共通の entry contract (= label / testid / context.iso) を満たす範囲を限定。
 */
export type EmptyDayEntryContextTab = "calendar" | "flow" | "map";

/**
 * Entry の context (= どの tab、 どの日付)
 *
 * iso は YYYY-MM-DD (= 既存 plan/ scope の日付表現と整合)。
 */
export type EmptyDayEntryContext = {
  readonly tab: EmptyDayEntryContextTab;
  readonly iso: string;
};

/**
 * Empty day entry view model
 *
 * pure foundation の view model:
 *   - label: 表示文言 (= EMPTY_DAY_ENTRY_LABEL と一致が前提、 但し型上は free string)
 *   - testid: regression test / E2E 用の test-id
 *   - context: tab + iso (= どの tab のどの日付か)
 */
export type EmptyDayEntryViewModel = {
  readonly label: string;
  readonly testid: string;
  readonly context: EmptyDayEntryContext;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Copy contract (= 確定 label、 永続規約化)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Entry の表示 label (= 確定 copy contract)
 *
 * CEO + GPT 合議で確定 (= 2026-05-23、 N-3 plan audit `04ccca51` §3.2):
 *   - 控えめ tone (= push しない、 user initiated 連想)
 *   - 「ALTER」 + 「見る」 + 「›」 (= UX 慣習、 tap UX)
 *
 * 禁止語不在 + 許可語存在 を regression test で機械保証
 * (= `tests/unit/plan/emptyDayObservationContract.test.ts`)。
 */
export const EMPTY_DAY_ENTRY_LABEL = "ALTER で見る ›" as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper (= pure 判定関数)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Empty day 判定 (= anchor 0 件かどうか)
 *
 * pure helper (= LLM / API / DB 不使用):
 *   - 引数型は ReadonlyArray<unknown> (= anchor の具体型に依存しない、 pure layer の原則)
 *   - 0 件 = true、 1 件以上 = false
 *
 * 設計理由:
 *   - 「sparse 日 (= 1-2 件)」 は empty day として扱わない (= scope 明確化)
 *   - 「完全に anchor 0 件」 のみが N-3 の対象 (= N completion audit §3.3 整合)
 *
 * @param anchors - 当該日の anchor 配列 (= 型は呼び出し側で確定)
 * @returns true if anchor 0 件
 */
export function isEmptyDay(anchors: ReadonlyArray<unknown>): boolean {
  return anchors.length === 0;
}
