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

  /**
   * LLM closeout 帯 Track 1: preview canary userId allowlist (= CEO 2026-05-26)
   *
   * 役割:
   *   - personalModelIntegration が true でも、 **本 allowlist にある userId のみ** で V2 経路 起動
   *   - 段階展開 (= 10% → 30% → 50% → 100%) を env 値更新だけで control
   *   - 50+ 実データ観測の枠組み (= readiness LLM closeout)
   *
   * env: `PLAN_CANARY_USER_IDS=uuid1,uuid2,uuid3` (= comma-separated UUIDs)
   *
   * 動作:
   *   - allowlist が **空** (= env 未設定 or 空文字) → **全 user で gate なし** (= 既存挙動維持)
   *   - allowlist が **非空** → 該当 userId のみ V2 経路、 他は V1 baseline (= 段階展開模式)
   *
   * 不変:
   *   - personalModelIntegration=false なら本 const は無視 (= 既存契約優先)
   *   - default 空 (= 既存挙動完全保持)
   *   - empty allowlist = no gating (= 旧コードと同等)
   */
  canaryUserIds: (() => {
    const raw = process.env.PLAN_CANARY_USER_IDS ?? "";
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  })() as readonly string[],

  /**
   * SR Step 6: 画像/PDF シフト表取り込みの **本保存**（確認→/plan 反映）を有効化するか。
   *   true  : import action が confirmed cells を external_anchors + plan_day_indicators に保存
   *   false : 保存経路は dormant（本番デフォルト）。確認画面の「反映」は無効のまま。
   *
   * env: PLAN_SHIFT_IMPORT_SAVE=true で有効化（server-side のみ評価、NEXT_PUBLIC_ なし）
   *
   * 設計: SR Step 6A transactional save plan foundation（CEO + GPT 合議 2026-05-31）
   *
   * 制約（6A 時点）:
   *   - 本保存 = all-or-nothing（source + anchors + day_indicators を atomic に。部分保存禁止）
   *   - 6A は契約 + memory repository + transaction/rollback test まで。実 DB 保存は **6B**（migration apply 後の Supabase/RPC）
   *   - 実 DB 保存 / production path は migration apply（CEO 別承認）後にのみ有効化
   *
   * 本番 ON は別 patch（= CEO 判断経由、default false で merge）。
   */
  shiftImportSave: process.env.PLAN_SHIFT_IMPORT_SAVE === "true",

  /**
   * SR B1b-2C-9-FIX-2: VLM への画像入力形式（split / combined）。
   *
   *   - "split"（既定）: 旧経路。headerBlob + personRowBlob の **2 枚** を VLM に投げる。
   *     既存 staging smoke / 旧 prompt と互換。
   *   - "combined": 日付ヘッダ + 本人行を **同 X 軸で上下結合した 1 枚** を VLM に投げる。
   *     Phase A FAIL（2026-06-01 column registration drift）対策。chunk は 1-15/16-31 を
   *     同じ combined 画像 + 違う chunk-prompt で 2 回投げる（Z 案）。
   *
   * env: PLAN_SHIFT_VLM_INPUT_MODE=combined で combined 経路。未設定/その他値 → split。
   * **server-side only**（NEXT_PUBLIC_ なし）。production 既定は split（CEO 別承認で切替）。
   *
   * 注: client は env を直接読まない。page.tsx（server）が解決して props で流す。
   *      server action（extractShiftDraftAction）が env を再評価して FormData と照合
   *      （client が mode を信用しない設計）。
   */
  vlmInputMode: (process.env.PLAN_SHIFT_VLM_INPUT_MODE === "combined"
    ? "combined"
    : "split") as "split" | "combined",

  /**
   * Plan 月ビュー Phase 2-A+: CalendarTab の week ⇄ month grid toggle を出すか。
   *   true  : CalendarTab に「週 | 月」segmented toggle を表示
   *   false : 既存 week strip のみ（本番デフォルト・toggle 非表示・UI 完全不変）
   *
   * **client-side const**（process.env でない）:
   *   - CalendarTab は "use client"。client bundle で非 NEXT_PUBLIC_ env は undefined に
   *     inlining されるため、client から確実に読める plain const にする（8a UI flag 前例踏襲）。
   *   - default OFF。M3-b visual smoke 時のみ手動 true、commit は必ず false に戻す。
   *
   * 段階:
   *   - M3-a（本コミット）: flag + 「週 | 月」toggle shell のみ。month grid 本体は描画しない
   *     （viewMode が month でも body は week strip 維持）。
   *   - M3-b: MonthGridView を month mode に接続。
   *
   * 設計: Plan 月ビュー mini design + M3 mini design（2026-06-03 CEO chat 承認）。
   */
  calendarMonthGridEnabled: false,
} as const;
