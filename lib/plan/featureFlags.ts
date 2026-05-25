/**
 * Plan Feature Flags
 *
 * Wave 1 中は全 flag default false（opt-in）。
 * 設計書: docs/alter-plan-foundation-design.md §9, §10
 *
 * 本番有効化は CEO 承認後に env で行う。flag 自体の追加・変更も CEO 承認案件。
 */

export const PLAN_FLAGS = {
  /**
   * Plan route の表示を有効化するか。
   *   true  : /plan が描画される（Wave 1 開発・検証用）
   *   false : /plan は notFound() 相当として扱う（本番デフォルト）
   *
   * env: PLAN_ROUTE_LIVE=true で有効化
   *
   * Wave 1 中はデフォルト false。Plan が触れる状態（Wave 1 完了相当）に
   * 達するまで有効化しない。
   */
  planRouteLive: process.env.PLAN_ROUTE_LIVE === "true",

  /**
   * Home 横スワイプ統合を有効化するか（W1-Home-Swipe）。
   *   true  : Home が <HomeSwipeContainer> でラップされ、Plan pane が swipe で到達可能
   *   false : Home は従来通り単独 <AneurasyncHome />（本番デフォルト、CEO 補正 2026-05-19）
   *
   * env: PLAN_HOME_SWIPE_ENABLED=true で有効化
   *
   * 設計書: docs/alter-plan-home-integration-mini-design.md
   * CEO 補正 (2026-05-19、PR #209 採択方針):
   *   - flag は server-side のみ評価（NEXT_PUBLIC_ prefix なし）
   *   - flag=true でも /plan 直 URL は wrapper なしで単独 PlanClient（既存通り）
   *   - flag=true でも AneurasyncHome.tsx の内部は不変
   *   - Plan pane は summary view のみ（full PlanClient embed は禁止）
   *   - Production deploy 時は default false、Preview で env 投入してから検証
   */
  homeSwipeEnabled: process.env.PLAN_HOME_SWIPE_ENABLED === "true",

  /**
   * P2 Step 1: alterNote の LLM 生成を有効化するか。
   *   true  : List FlowTab で各 anchor の alterNote を LLM 経由で生成 (= 1 日分まとめて Promise.all)
   *   false : 既存 deterministic getNarrative / getMeaningText のみ (= 本番デフォルト)
   *
   * env: PLAN_ALTER_NOTE_LIVE=true で有効化
   *
   * 設計書: docs/alter-plan-p2-llm-readiness.md v2 (= CEO + GPT 合議 2026-05-25)
   *
   * Step 1 制約:
   *   - 1 view あたり LLM call ≤ 20、 同時実行 5、 timeout 4000ms、 失敗時 deterministic fallback
   *   - sensitive anchor は LLM 送らない (= privacy 配慮)
   *   - 'other' category は LLM skip (= 判断不能を押し付けない、 既存契約踏襲)
   *   - 出力 validator: 規約 24 + 禁止語 10 件 + 長さ 6-30 字 + 命令形 / 評価語 検出
   *   - 違反時 → deterministic fallback (= fail-open)
   *
   * Step 2 で拡張予定:
   *   - Stargazer Personal Model short tag を system prompt に注入 (= 「あなたらしい」 解釈)
   *
   * 本番 ON は別 patch (= CEO 判断経由、 default false で merge)。
   */
  alterNoteLive: process.env.PLAN_ALTER_NOTE_LIVE === "true",

  /**
   * P2 Step 2 v3.1: Personal Model V2 統合を有効化するか (= 3 層 PM + Output Contract V2 + framing)
   *   true  : alterNoteLive=true 前提 + PersonalModelV2 + promptBuilderV2 + validatorV2 経路
   *   false : Step 1 同等 (= 4 short tag なし、 generic prompt builder、 5 段 validator)
   *
   * env: PLAN_PERSONAL_MODEL_INTEGRATION=true で有効化
   *
   * 設計書: docs/alter-plan-p2-llm-step2-readiness-v3.md (= CEO + GPT 合議 2026-05-25 G2 通過判定)
   *
   * Step 2 v3.1 制約:
   *   - Step 1 と同 cost cap (= 1 view 20 calls、 並列 5、 timeout 4000ms)
   *   - 3 層 PM (= Stable / Recent / Contextual) を **層を分けたまま** prompt 注入 (= GPT 補正)
   *   - Phase 別 framing hint で hedging level 制御
   *   - 8 段 validator (= V1 5 段 + generic_self_help + fact / interp)
   *   - Step 2 v3.1 stub: 実 Stargazer wire 未着手、 synthetic / safe Phase 0 fallback
   *   - 失敗時 → deterministic fallback (= V1 と同 fail-open)
   *
   * 本番 ON は別 patch (= CEO 判断経由、 default false で merge)。
   */
  personalModelIntegration: process.env.PLAN_PERSONAL_MODEL_INTEGRATION === "true",
} as const;
