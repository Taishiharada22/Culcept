/**
 * Phase 3-N Plan P2 Step 1 — LLM 連携 共通型定義
 *
 * 設計書: docs/alter-plan-p2-llm-readiness.md v2 (= CEO + GPT 合議 2026-05-25)
 *
 * 不変原則 (= Step 1 範囲):
 *   - **pure 型定義のみ** (= LLM 呼び出さない、 副作用 0)
 *   - **Step 2 で Personal Model short tag を追加可能な拡張余地** (= GPT 補正 2)
 *   - 入力 anchor の sensitive / privacy 配慮は呼出側責務
 *
 * 設計:
 *   - AlterNoteContext: LLM に渡す前の事前 normalize 済 context (= category / time / location / title)
 *   - PersonalModelSummary: **Step 2 で実装**、 Step 1 では型のみ optional 用意
 *   - AlterNoteResult: discriminated union (= deterministic / llm / unavailable)
 *
 * 命名規則:
 *   - 「Note」 = alterNote (= EventCard の解釈テキスト)
 *   - Step 2 で 「Footer」 (= SummaryFooter) / 「Map」 (= MapBottomSheet.meaningText) の型も追加予定
 */

import type { EventCategory } from "@/lib/plan/list/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AlterNoteContext (= LLM 入力 context)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * LLM に渡す前の anchor context (= 既に normalize 済)
 *
 * - category, startTime: 必須
 * - endTime, title, location: optional (= 未指定 OK、 LLM が判断材料として扱う)
 * - personalModel: **Step 2 で実装**、 Step 1 では undefined 固定
 *
 * Privacy 配慮: 呼出側 (= adapter) が sensitiveCategory anchor を事前 filter する責務。
 *              本型には個人情報 (= 名前 / 住所等) を直接含めない。 anchor.title / location は user
 *              入力済の文字列のみが入る。
 */
export type AlterNoteContext = {
  /** 解決済 EventCategory (= 4 段階優先順位後の決定値) */
  readonly category: EventCategory;
  /** "HH:MM" 形式の開始時刻 (= normalize 済) */
  readonly startTime: string;
  /** "HH:MM" 形式の終了時刻 (= 推論済の場合あり) */
  readonly endTime?: string;
  /** anchor.title (= user 入力済) */
  readonly title?: string;
  /** 表示用 location 文字列 (= sensitive 除外済) */
  readonly location?: string;
  /**
   * Step 2 拡張余地: Personal Model short tag.
   * Step 1 では **常に undefined**。 Step 2 で `lib/plan/llm/personalModel.ts` (= 未着手) で
   * Stargazer 軸から short tag に縮約して注入。
   */
  readonly personalModel?: PersonalModelSummary;
};

/**
 * Personal Model short tag (= Step 2 拡張用、 Step 1 では未使用)
 *
 * Stargazer 45 軸 → 10 次元 MatchingVector → 4 種 short tag に圧縮:
 *   - judgmentMode: 「集中型」 / 「分散型」 / 「人と会うエネルギー型」 等
 *   - timePreference: 「朝強い」 / 「夜強い」 / 「中庸」
 *   - energyRecovery: 「ひとり静か」 / 「人と話す」
 *   - recentRhythm: 「集中続き」 / 「移動多め」 / 「休息余裕」 等 (= 過去 7-14 day lifeContext)
 *
 * Step 2 で `lib/stargazer/baseline*` から抽出ロジックを実装。
 * 各 tag は 4-12 字程度の自然な日本語。
 */
export type PersonalModelSummary = {
  readonly judgmentMode?: string;
  readonly timePreference?: string;
  readonly energyRecovery?: string;
  readonly recentRhythm?: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AlterNoteResult (= 出力、 discriminated union)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AlterNote 生成結果 (= 由来 + 文字列 / unavailable)
 *
 * - "deterministic": flag OFF / category 'other' / sensitive 等で LLM skip、 既存 getNarrative
 * - "llm": LLM 経路成功、 post-check 通過
 * - "unavailable": LLM 試行したが失敗 (= timeout / safety 違反 / cost cap 超過 等)、
 *                  呼出側で deterministic に fallback すべき
 *
 * 設計判断:
 *   - "llm" と "deterministic" は明示的に区別 (= analytics / 観測用)
 *   - "unavailable" は内部的な signal、 呼出側で deterministic を取り直す
 *   - Step 5 で Negative Capability 「(意味は読めない)」 を追加する場合、
 *     新 variant "negativeCapability" を追加可能 (= discriminated union 拡張余地)
 */
export type AlterNoteResult =
  | { readonly source: "deterministic"; readonly text: string }
  | { readonly source: "llm"; readonly text: string; readonly model: string; readonly latencyMs: number }
  | { readonly source: "unavailable"; readonly reason: AlterNoteUnavailableReason };

/**
 * "unavailable" 時の理由 (= analytics + 切り分け用)
 *
 * 各 reason の対応:
 *   - flag_off: PLAN_FLAGS.alterNoteLive === false → deterministic 経路で十分、 呼出されない想定
 *   - category_other: category === 'other' → deterministic も undefined return (= 既存契約)
 *   - sensitive: sensitive anchor → LLM 送らない (= privacy)
 *   - cost_cap: 1 view 20 calls 超過 → silent degrade
 *   - timeout: runAI 4000ms timeout
 *   - llm_failure: runAI success=false / empty text
 *   - validation_failed: validator (= 規約 24 / 禁止語 / 長さ) で reject
 */
export type AlterNoteUnavailableReason =
  | "flag_off"
  | "category_other"
  | "sensitive"
  | "cost_cap"
  | "timeout"
  | "llm_failure"
  | "validation_failed";
