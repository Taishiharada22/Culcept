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
   * 予定追加 2カラム・タイムライン体験（compose sheet）を有効化するか（A-4b）。
   *   true  : /plan の予定追加が AddAnchorComposeContainer（ドラッグ配置）になる
   *   false : 既存 AddAnchorModal（本番デフォルト・**完全不変**）
   *
   * env: PLAN_COMPOSE_TIMELINE_ENABLED=true で有効化
   *
   * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md（A-4b）
   *
   * CEO 補正 (2026-06-01): PLAN_FLAGS は **server-side のみ評価**（NEXT_PUBLIC なし）。
   *   client（openAdd）へは plan/page.tsx が server で読み取り prop で渡す
   *   （homeSwipeEnabled と同方式）。本番有効化は CEO 承認後に env で。default false。
   */
  composeTimelineEnabled: process.env.PLAN_COMPOSE_TIMELINE_ENABLED === "true",

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
   * **client 到達のため NEXT_PUBLIC_ env 駆動**（統合 2026-06-04 CEO smoke 指示で env 制御化）:
   *   - CalendarTab は "use client"。client bundle で非 NEXT_PUBLIC_ env は undefined に
   *     inlining されるため、client から確実に読むには NEXT_PUBLIC_ prefix が必須。
   *   - **default OFF**（env 未設定 → false）。本番 / main は env を設定しない限り従来どおり
   *     toggle 非表示・UI 完全不変（= SH 設計の「default OFF」要件を env-default-false で満たす）。
   *   - 旧設計の「smoke 時だけ手動 true、commit は false に戻す」手動 flip footgun を env 制御で解消
   *     （State Safety: 未コミットの true を残さない / main へ true が漏れない）。
   *   - smoke: `NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=true` で dev 起動 → toggle 出現。
   *
   * 段階:
   *   - M3-a: flag + 「週 | 月」toggle shell。
   *   - M3-b: MonthGridView を month mode に接続（統合済み）。
   *
   * 設計: Plan 月ビュー mini design + M3 mini design（2026-06-03 CEO chat 承認）、
   *       env 制御化は 2026-06-04 CEO smoke 指示で追加。
   */
  calendarMonthGridEnabled:
    process.env.NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED === "true",

  /**
   * A1-5-1b: Reality Complete shadow dev smoke を有効化するか（**dev-only manual smoke 専用**）。
   *   true  : CEO 手動 smoke entry の gate.flagEnabled が立つ（実 read は CEO の認証文脈で user-RLS client 注入時のみ）
   *   false : 全 smoke が FLAG_OFF no-op（**本番デフォルト**・自動実行なし・UI 不変）
   *
   * env: REALITY_COMPLETE_SHADOW=true で有効化（**server-side のみ評価・NEXT_PUBLIC_ なし**）。
   *
   * 設計: docs/aneurasync-reality-control-os-connection-design.md §8（A1-5-0/1a/1b）
   * 制約: dev-only / production no-op（gate が PRODUCTION で必ず no-op）/ rollback は flag off のみ /
   *   route/UI/PlanClient/cron から呼ばない（manual entry 専用）。
   */
  realityCompleteShadow: process.env.REALITY_COMPLETE_SHADOW === "true",

  /**
   * A1-5-5a: Reality structured capture（seed write）を有効化するか（**runtime 未接続・gate 用 flag のみ**）。
   *   true  : capture gate の liveEnabled が立つ（実 write は orchestrator 経由 + staging + canary + 別 GO の接続後のみ）
   *   false : capture gate が FLAG_OFF で block（**本番デフォルト**・自動 capture なし・UI 不変）
   *
   * env: REALITY_CAPTURE_LIVE=true で有効化（**server-side のみ評価・NEXT_PUBLIC_ なし**）。
   * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.25/§8.26（A1-5-5-0/5a）
   * 制約: gate（evaluateCaptureGate）が production nodeEnv / production project ref / 非 staging / 非 canary で必ず block。
   *   route/UI/PlanClient/cron から呼ばない（capture service は A1-5-5c 以降・別 GO）。
   */
  realityCaptureLive: process.env.REALITY_CAPTURE_LIVE === "true",

  /**
   * A1-5-5a: Reality capture の **緊急停止（kill switch）**。**live flag より優先**して capture gate を block。
   *   true  : REALITY_CAPTURE_LIVE=true でも gate が KILLED で block（emergency off）
   *   false : 通常（live flag に従う）
   * env: REALITY_CAPTURE_KILL=true で停止（**server-side のみ評価・NEXT_PUBLIC_ なし**）。
   */
  realityCaptureKill: process.env.REALITY_CAPTURE_KILL === "true",

  /**
   * A1-5-5g: Reality capture の **observe-mode**（**write OFF・実 DB 書かない・would-capture を観測のみ**）を有効化するか。
   *   true  : capture route runner の observe mode の gate liveEnabled が立つ（**dry-run write・wouldCapture summary を log するだけ**）。
   *   false : observe も block（**本番デフォルト**）。
   * env: REALITY_CAPTURE_OBSERVE=true で有効化（**server-side のみ評価・NEXT_PUBLIC_ なし**）。
   * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.35（A1-5-5g-0/1）
   * 制約: write（実 DB）とは **別 flag**（write は realityCaptureLive）。observe を write 有効化前に回せる。
   *   kill（realityCaptureKill）は observe にも最優先。gate（evaluateCaptureGate）の production/staging/canary block は両者に適用。
   *   route 接続は A1-5-5g-2 以降（別 GO）。
   */
  realityCaptureObserve: process.env.REALITY_CAPTURE_OBSERVE === "true",

  /**
   * A1-5-7-5: Reality capture candidate の **surface-mode**（route response に `data.captureCandidate?` を additive 表示）を有効化するか。
   *   true  : alter-morning/plan route が **pending captured seed/evidence を read-only consumption** し、候補があれば `captureCandidate` を additive 追加。
   *   false : surface しない（**本番デフォルト**・route response は既存と完全一致）。
   * env: REALITY_CAPTURE_SURFACE=true で有効化（**server-side のみ評価・NEXT_PUBLIC_ なし**）。
   * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.45（A1-5-7-5）
   * 制約: capture write（realityCaptureLive）/ observe（realityCaptureObserve）とは **別 flag**（surface は read-only・write しない・LLM await しない）。
   *   kill（realityCaptureKill）最優先。gate（evaluateCaptureGate）の production/staging/canary block を適用（production では surface read 0）。
   *   fail-open: flag off / no candidate / read error / gate block では `captureCandidate` を付けず response を壊さない。
   */
  realityCaptureSurface: process.env.REALITY_CAPTURE_SURFACE === "true",

  /**
   * A1-5-7-7: Reality capture candidate の **client-side surface consumer**（V2 route response の `data.captureCandidate?` を
   *   client で fetch/extract し MorningPlanCard へ流す bridge）を有効化するか。
   *   true  : caller（将来 AskHero 親）が `fetchCaptureCandidate` で V2 route を fetch し captureCandidate を MorningPlanCard prop に流せる。
   *   false : **本番デフォルト**・**fetch 0・captureCandidate undefined・既存 UI 完全不変**（dormant）。
   * env: NEXT_PUBLIC_REALITY_CAPTURE_SURFACE_CLIENT=true で有効化（**client-side 評価可・NEXT_PUBLIC_**）。
   * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.47（A1-5-7-7）
   * 制約: server surface flag（realityCaptureSurface）とは別（client 消費の dormant gate）。real network は本 slice では走らせない（caller の live fetch は別 GO）。
   */
  realityCaptureSurfaceClient: process.env.NEXT_PUBLIC_REALITY_CAPTURE_SURFACE_CLIENT === "true",

  /**
   * A1-5-13: Reality capture の **production canary 専用 enable flag**（production ref 許可の明示 gate・scaffold）。
   *   true ∧ production ref(aljav) ∧ reality canary list 該当 ∧ live ∧ !kill のときのみ production capture を許可（evaluateCaptureGate の production lane）。
   *   **false/missing（既定）→ production 不可**（gate が PRODUCTION_PROJECT_REF block・staging-only 維持）。
   * env: REALITY_CAPTURE_PRODUCTION_CANARY=true（**server-side のみ・NEXT_PUBLIC なし**）。
   * 注（A1-5-13 scaffold）: 本 flag は **gate capability + env contract** を default-off で用意する。runtime resolver
   *   （resolveMorningObserveGate / resolveSurfaceGate）への配線は **別 slice（activation）**＝設定しても現時点では production capture は起きない（dead-safe scaffold）。
   */
  realityCaptureProductionCanary: process.env.REALITY_CAPTURE_PRODUCTION_CANARY === "true",

  /**
   * A1-5-13: Reality 専用 canary user allowlist（PLAN_CANARY_USER_IDS から分離・結合解消）。
   *   非空なら gate が staging/production とも本 list を優先（PLAN_CANARY_USER_IDS への依存を減らす）。production lane は本 list 必須（shared へ fallback しない）。
   *   空（既定）→ staging は PLAN_CANARY_USER_IDS へ fallback（後方互換）。
   * env: REALITY_CAPTURE_CANARY_USER_IDS=uuid1,uuid2（**server-side のみ**・auth UUID・email でない）。
   */
  realityCanaryUserIds: (() => {
    const raw = process.env.REALITY_CAPTURE_CANARY_USER_IDS ?? "";
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  })() as readonly string[],

  /**
   * A1-6-7: Consumed seed → MorningPlan reflection（accept 済み候補を live `MorningPlan` の `PlanItem[]` に additive merge）を有効化するか。
   *   true  : morning route が **status='consumed' の seed を read-only consumption** し、`reflectConsumedSeedsIntoMorningPlan` で
   *           `MorningPlan.items` に additive 追加（同日・id 重複 skip・consumed seed だけが item 化）。
   *   false : reflect しない（**本番デフォルト**・`MorningPlan` は既存と完全一致＝dormant・serve read 0）。
   * env: REALITY_CONSUMED_REFLECTION=true で有効化（**server-side のみ評価・NEXT_PUBLIC_ なし**）。
   * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.12（A1-6-7）
   * 背景: reflection の target は live plan = `MorningPlan`（`DraftPlan` は Wave-4 stub・非 live。CEO 判断 2026-06-08 で pivot）。
   * 制約: capture write（realityCaptureLive）/ surface（realityCaptureSurface）とは **別 flag**。reflection は **read-only**
   *   （status-only accept の結果＝consumed seed を読むだけ・write しない・LLM await しない・generateComplete/anchor 不使用）。
   *   fail-open: flag off / no consumed seed / read error では `MorningPlan` を **変えない**（additive・既存を壊さない）。
   *   active / rejected / expired seed は混ざらない（reader が status='consumed' のみ・merge も guard）。
   */
  realityConsumedReflection: process.env.REALITY_CONSUMED_REFLECTION === "true",

  /**
   * A1-6-8: Candidate action **UI ボタン**（accept/dismiss/later）の client-side 有効化フラグ。
   *   true  : CaptureCandidateBanner が accept/dismiss/later ボタンを表示し `/api/reality/candidate-action` に POST。
   *           accept 後は client が `reflectConsumedSeedsIntoMorningPlan`（A1-6-7 再利用）で MorningPlan に **optimistic add**。
   *   false : ボタン非表示（**本番デフォルト**・banner は read-only=A1-5-7-6 と同一・既存 UI 不変）。
   * env: NEXT_PUBLIC_REALITY_CANDIDATE_ACTIONS=true で有効化（**client-side 評価可・NEXT_PUBLIC_**）。
   * 設計: docs/aneurasync-reality-control-os-connection-design.md §9.13（A1-6-8）
   * 運用制約: **`realityConsumedReflection`（server reflect）と一緒に staging で on** にする（optimistic add と server reflect の整合）。
   *   production は両者 off（banner は realityCaptureSurface server flag・production off ゆえ candidate 自体出ない）。
   *   route(`/api/reality/candidate-action`)は user-RLS・status-only（A1-6-6 検証済）。ボタンは request {handle,action} のみ送る。
   */
  realityCandidateActions: process.env.NEXT_PUBLIC_REALITY_CANDIDATE_ACTIONS === "true",

  /**
   * A1-7-17: Candidate action の **status transition 成功後に PRM learning event を永続化**するか（slice ④ route connection）。
   *   true  : `/api/reality/candidate-action` が accept→consumed / dismiss→rejected 成功後に `writeLearningEventOnAction`
   *           （toDryRunLearningEvent→toPrmLearningEventInsertRow→Supabase repository.insert）を **await-and-swallow** で実行。
   *   false : learning write を呼ばない（**本番デフォルト**・insert 0・既存挙動完全不変・banner/route response 不変）。
   * env: REALITY_LEARNING_EVENT_WRITE=true で有効化（**server-side のみ評価・NEXT_PUBLIC_ なし**）。
   * 設計: docs/aneurasync-reality-control-os-connection-design.md §10.13/§10.17（A1-7-17）
   * 制約: **default OFF**（local/staging only・production OFF + hard block）。learning write は best-effort=insert 失敗は
   *   user action response を壊さない（fail-open）。M1 `prm_learning_events` table 未 apply 環境では flag ON でも insert は
   *   error→fail-open（action 不破壊）。**実 staging/production apply + flag ON は別 CEO gate（slice ⑤）**。
   */
  realityLearningEventWrite: process.env.REALITY_LEARNING_EVENT_WRITE === "true",
} as const;
