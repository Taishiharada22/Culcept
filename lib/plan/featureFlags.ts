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

  /**
   * A1-7-33: operator が proposal を review し decision を **M2/M3 に書く** route（POST /api/reality/review-decision）の有効化。
   *   true  : flag ON で route が server 再導出 proposal を review→M2 insert→approve なら M3 entry insert（review_decision_id FK）。
   *   false : route は no-op（**本番デフォルト**・M2/M3 write 0・既存挙動不変）。
   * env: REALITY_REVIEW_WRITE=true で有効化（**server-side のみ評価・NEXT_PUBLIC_ なし**）。
   * 設計: docs/prm-review-flow-route-design.md（A1-7-33）
   * 制約: **default OFF**（local/staging only・production OFF + hard block）。operator-only（reviewer は server で operator 固定）。
   *   snapshot は client から受けず server 再導出（integrity）。第二の自己 surfacing（実ユーザー公開）は別 gate。
   */
  realityReviewWrite: process.env.REALITY_REVIEW_WRITE === "true",

  /**
   * A1-7-33: dev-learning-observation の **review ボタン UI**（operator が approve/reject/defer を押す）の client 有効化。
   *   true  : observation の candidate proposal に review ボタン表示し /api/reality/review-decision に POST。
   *   false : ボタン非表示（**本番デフォルト**・observation は read-only=既存不変）。
   * env: NEXT_PUBLIC_REALITY_REVIEW_UI=true で有効化（**client 評価可・NEXT_PUBLIC_**）。dev 限定（triple-guard host 配下）。
   */
  realityReviewUi: process.env.NEXT_PUBLIC_REALITY_REVIEW_UI === "true",

  /**
   * A1-7-34: **第二の自己 read-only surface**（M3 prm_model_entries の review 済 tendency を operator が dev-preview で見る）の有効化。
   *   true  : flag ON で dev-second-self preview が owner の M3 tendency を **非断定・観察トーン**で表示（read-only・correction write なし）。
   *   false : 表示しない（**本番デフォルト**・read 0）。
   * env: REALITY_SECOND_SELF_SURFACE=true で有効化（**server-side のみ評価・NEXT_PUBLIC_ なし**）。
   * 設計: docs/prm-second-self-surfacing-design.md（A1-7-34）
   * 制約: **default OFF**・**operator-only / dev-preview / read-only**（本格 user-facing 公開・Alter 連結・correction write は別 stop gate）。
   *   certainty no high（≤tentative 表示）・tendency-not-trait・counter/stillPossible 併記・production hard block。
   */
  realitySecondSelfSurface: process.env.REALITY_SECOND_SELF_SURFACE === "true",

  /**
   * A1-7-35: 第二の自己 **confirm/correct/reject feedback write**（POST /api/reality/tendency-feedback）の有効化。
   *   true  : flag ON で operator が tendency に confirm(user M2+新 M3 version)/correct(M3 user_correction)/reject(M3 retracted) を可逆に書く。
   *   false : route は no-op（**本番デフォルト**・write 0・既存挙動不変）。
   * env: REALITY_TENDENCY_FEEDBACK_WRITE=true で有効化（**server-side のみ評価・NEXT_PUBLIC_ なし**）。
   * 設計: docs/prm-confirm-correct-loop-design.md（A1-7-35）
   * 制約: **default OFF・operator-only / dev-preview**（broader user-facing 公開・Alter 連結・Home/Stargazer 本線は別 stop gate）。
   *   server 再読込（client snapshot 不信）・破壊削除なし（retracted_at/supersedes で可逆）・certainty no high・raw/personality 保存なし。
   */
  realityTendencyFeedbackWrite: process.env.REALITY_TENDENCY_FEEDBACK_WRITE === "true",

  /** A1-7-35: dev-second-self の confirm/correct/reject ボタン UI（client・default OFF・dev 限定）。 */
  realityTendencyFeedbackUi: process.env.NEXT_PUBLIC_REALITY_TENDENCY_FEEDBACK_UI === "true",

  /**
   * P-A: Reality Pipeline operator-only read-only dev preview（RealityPipelineEnvelope を operator が観測するだけ）。
   * 設計: docs/reality-pipeline-dev-preview-design.md
   * 制約: **server default OFF・operator-only / dev・staging 限定（triple-guard で production hard block）**・read-only。
   *   plan を書き換えない・apply しない・通知しない・user-facing でない（NEXT_PUBLIC なし＝server-side のみ評価）。
   */
  realityPipelinePreview: process.env.REALITY_PIPELINE_PREVIEW === "true",

  /**
   * A-4-c7: Life Ops 実データ read-only の flag 群（**dormant・default OFF・consumer なし**＝設計/contract のみ）。
   *   将来 wiring: master ∧ per-source の AND + staging triple-guard + production hard block。
   *   有効化条件: 5層cap 配線の実データ量検証 + staging 観測 ≥2 週間 + CEO 承認（docs/life-ops-realdata-readiness-a4-c7-mini-design.md）。
   *   本 slice では**読み取りを実装しない**（flag を読む reader が存在しない）。
   */
  lifeopsRealdataReadonly: process.env.LIFEOPS_REALDATA_READONLY === "true",
  lifeopsCadenceReadonly: process.env.LIFEOPS_CADENCE_READONLY === "true",
  lifeopsCalendarEventReadonly: process.env.LIFEOPS_CALENDAR_EVENT_READONLY === "true",
  lifeopsDeadlineReadonly: process.env.LIFEOPS_DEADLINE_READONLY === "true",
  lifeopsFeedbackReadonly: process.env.LIFEOPS_FEEDBACK_READONLY === "true",
  /**
   * A-4-c9: Life Ops feedback **write**（read とは独立・**dormant・default OFF・未配線**）。
   *   実 write は M1 CHECK 拡張 migration（source_kind+='lifeops'）+ CEO write GO が前提。
   */
  lifeopsFeedbackWrite: process.env.LIFEOPS_FEEDBACK_WRITE === "true",

  /**
   * A-4-c19: Life Ops **本線 surface**（/plan への接続・**dormant・default OFF・consumer なし**＝設計のみ）。
   *   将来 wiring: 本 flag ∧ staging allowlist ∧ production deny（`isLifeOpsMainlineAllowed`）∧ planRouteLive。
   *   有効化条件（docs/life-ops-mainline-readiness-a4-c19-design.md）: 実データ源接続 + operator 観測条件充足 + CEO GO。
   *   production 解禁は deny 解除の**別 CEO gate**（二段階）。本 slice では UI/接続を実装しない。
   */
  lifeopsMainline: process.env.LIFEOPS_MAINLINE === "true",

  /**
   * A-4-c27: Life Ops 構造化 source（`lifeops_structured_sources`・**draft 未 apply**）の read-only flag
   *   （**dormant・default OFF・consumer なし**）。将来 wiring: master ∧ 本 flag ∧ staging ∧ production deny。
   *   有効化条件: staging migration apply（別 CEO GO）+ reader 接続 slice。
   */
  lifeopsStructuredSourceReadonly: process.env.LIFEOPS_STRUCTURED_SOURCE_READONLY === "true",

  /**
   * A-4-c31: Life Ops 構造化 source の **write**（read とは独立・**dormant・default OFF・呼び出し元なし**）。
   *   実 write は staging write smoke（別 GO・mini-design §1-10 計画）→ UI 入力 slice が前提。production は gate で常に false。
   */
  lifeopsStructuredSourceWrite: process.env.LIFEOPS_STRUCTURED_SOURCE_WRITE === "true",

  /**
   * A-4-c35: production 段階解禁 flags（**全て dormant・default OFF・consumer なし**＝Release Gate Matrix の具体化のみ）。
   *   将来 wiring: `isLifeOpsProductionStageAllowed`（production URL ∧ stage flag ∧ **user allowlist**）を段階ごとに
   *   別 CEO GO で配線（P2 read → P3 input+structured write → P4 feedback write・P5 一般開放は allowlist 条項撤去の別改修）。
   *   前提: production schema apply（別 slice）。source safety（real_only 恒久）は何段階でも解禁対象外。
   */
  lifeopsProdReadVisibility: process.env.LIFEOPS_PROD_READ_VISIBILITY === "true",
  lifeopsProdInputUi: process.env.LIFEOPS_PROD_INPUT_UI === "true",
  lifeopsProdStructuredWrite: process.env.LIFEOPS_PROD_STRUCTURED_WRITE === "true",
  lifeopsProdFeedbackWrite: process.env.LIFEOPS_PROD_FEEDBACK_WRITE === "true",

  /**
   * A-4-c39: Life Ops Moment の本線 read-only surface（「今の一枚」card・**default OFF・briefing card と独立 kill**）。
   *   表示条件 = mainline gate（staging∧!prod）∧ 本 flag ∧ surfaced 非 null。**R4 trigger 本線ではない**
   *   （既存 moment VM の表示解禁のみ・writer/notification/timer/polling なし）。production は mainline gate で恒久不可視。
   */
  lifeopsMainlineMoment: process.env.LIFEOPS_MAINLINE_MOMENT === "true",

  /**
   * S1（PDF/画像シフト取込の本番導線・第一段）: /plan に「シフト表を取り込む」入口を出すか。
   *   true  : /plan に取込ボタン → ShiftImportModal（確認画面）を表示
   *   false : 入口非表示（本番デフォルト・UI 完全不変）
   *
   * **client 到達のため NEXT_PUBLIC_ env 駆動**（calendarMonthGridEnabled と同方式）。default OFF。
   *
   * 重要（gate 分離・CEO 2026-06-04）: 入口を出しても
   *   - 保存は別 gate（`PLAN_SHIFT_IMPORT_SAVE`・server-side・OFF）→ DB write しない
   *   - VLM live も別（S2 では cells を fixture 注入＝live 不発火）
   *   入口 / 保存 / VLM を独立 gate に分離し、画面導線だけ先に安全に出せる。
   */
  shiftImportEntryEnabled:
    process.env.NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED === "true",

  /**
   * S3A-2-2: 在app入口の **live VLM 下書き抽出**を許可するか（product 導線の live gate）。
   *   true  : 在app入口が（draftLiveEnabled prop 経由で）live 抽出 flow を出せる（S3A-2-2-2 以降）
   *   false : 入口は fixture fallback のまま（本番デフォルト・UI 不変）
   *
   * env: PLAN_SHIFT_DRAFT_LIVE_ENABLED=true（**server-side のみ評価**・NEXT_PUBLIC_ なし）
   *
   * 重要（server→prop・client 直読み禁止／GPT 補正 2026-06-04）:
   *   - client component は本 flag を**直読みしない**。plan/page.tsx（server）が読み、
   *     boolean prop（draftLiveEnabled）として client に渡す（composeTimelineEnabled と同方式）。
   *   - client bundle では非 NEXT_PUBLIC env は undefined → 本値は false に inlining されるが、
   *     client は prop を使うため漏れ・誤判定なし（server の真値は prop でのみ client に届く）。
   *   - action 側 gate（PLAN_SHIFT_DRAFT_LIVE_ENABLED || PLAN_SHIFT_DRAFT_HOST・S3A-1）とは別レイヤ。
   *   - 入口 flag(NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED) / live flag(本flag) /
   *     保存 flag(PLAN_SHIFT_IMPORT_SAVE) は **分離**（混ぜない）。
   */
  shiftDraftLiveEnabled: process.env.PLAN_SHIFT_DRAFT_LIVE_ENABLED === "true",

  // ── UX-1b: Battery(ALTER)タブ — Day State 人体バッテリー（xenodochial 由来・既定 OFF・本番 inert）──
  //   alterTabEnabled: /plan に「バッテリー」タブを出すか（server-side・page.tsx が prop 渡し）。
  //   dayStateStorageEnabled: localStorage dogfood（plan_day_state_v0 等 3 キー・DB/Supabase write なし）。
  //   両方 default OFF → 着地時点で現 3 タブ挙動は不変。本番表示/ON は別 GO。
  alterTabEnabled: process.env.PLAN_ALTER_TAB_ENABLED === "true",
  dayStateStorageEnabled: process.env.PLAN_DAY_STATE_STORAGE === "true",

  // ── UX-2: CoAlter /plan タブ（practical-diffie 由来・全 default OFF・本番 inert・既存タブ不変）──
  //   coalterPlanTabEnabled でタブ表示（fixture-only）。live read / relation / send / live messages は
  //   段階別 gate で全 dormant。送信 route は別 server gate planCoAlterSendLocalEnabled() で二重 gate。
  /**
   * CoAlter /plan タブ（**UI プロトタイプ・fixture data のみ**）を表示するか。
   *   true  : /plan のタブ列に「CoAlter」タブが追加される（左 Plan Intelligence + 右ペアチャット）
   *   false : タブ非表示（**本番デフォルト**・既存 3 タブ UI 完全不変）
   *
   * env: NEXT_PUBLIC_PLAN_COALTER_TAB_ENABLED=true で有効化
   *   （タブ列は client component（PlanClient）のため calendarMonthGridEnabled と同じく
   *     NEXT_PUBLIC_ prefix が必須。default OFF = env 未設定なら従来どおり）。
   *
   * 契約正本: docs/coalter-plan-tab-backend-contract-draft.md（UI が bind する安定インターフェース）
   * 制約（2026-06-12 CEO 指示の最初のスライス）:
   *   - local only / fixture data のみ。fetch・DB・migration・外部 API・実 CoAlter backend 接続なし
   *   - M2 PersonalizationPort / pair read / RLS 対応なし（バックエンド統合は CEO の明示 GO 後）
   */
  coalterPlanTabEnabled: process.env.NEXT_PUBLIC_PLAN_COALTER_TAB_ENABLED === "true",

  /**
   * @deprecated TalkBridge legacy retire（2026-06-12）: 本 flag が駆動していた T1b **thread-as-body**
   *   は B で本文が session message 化したため撤去。CoAlterTab は本 flag を**消費しない**。
   *   thread 内容は relation→thread の `coalterThreadContext` 文脈セクションで読む。freeze（新依存禁止）。
   *
   * TalkBridge-T1a: CoAlter タブのチャット **read-only live read** の gate（**dormant・default OFF**）。
   *   true  : （T1b 以降）resolveCoAlterChatAdapter が read-only talk thread adapter を返す予定
   *   false : fixture adapter（**本番デフォルト・現行動作・視覚的に完全不変**）
   *
   * env: NEXT_PUBLIC_PLAN_COALTER_CHAT_LIVE=true で有効化（client tab 内分岐のため NEXT_PUBLIC_）。
   * 正本: docs/coalter-plan-tab-talk-migration-design.md §4（T1a/T1b/T1c 分割・CEO 承認 2026-06-12）
   *
   * ★ flag semantics（CEO 2026-06-12 訂正）: この flag は **read（read-only thread 表示）の
   *   gate のみ**。send / 既読 / Realtime / CoAlter invoke を **一括で点ける単一スイッチに
   *   してはならない**。それらは将来も別段階・別 gate（adapter `capabilities` の独立 field で
   *   表現・各々別 flag を後で追加）。1 つの env でチャット機能が全部 live 化することはない。
   * 制約: **T1a では ON でも fixture のまま**（live adapter 未実装＝実 API 呼び出しゼロ）。
   *   T1b（read-only thread 表示）/ T1c（send/realtime）は各 CEO GO 後に分岐のみ追加。
   */
  coalterChatLive: process.env.NEXT_PUBLIC_PLAN_COALTER_CHAT_LIVE === "true",

  /**
   * @deprecated TalkBridge legacy retire（2026-06-12）: thread-as-body 撤去に伴い CoAlterTab は消費しない。
   *   文脈セクションの threadId は relation→thread（genome-connections.threadId）由来＝別経路。freeze。
   *
   * TalkBridge-T1b: read-only live read の対象 threadId（**dev/local 注入専用・default 空**）。
   *   - 空（既定）: live read 対象なし＝coalterChatLive が ON でも fixture のまま（fetch 0）
   *   - 非空 ∧ coalterChatLive=true: 既存 GET /api/talk/threads/[id]/messages を 1 回読む
   *     （read-only。失敗/empty は fixture へ fail-closed）
   *
   * env: NEXT_PUBLIC_PLAN_COALTER_DEV_THREAD_ID=<uuid>（client 読みのため NEXT_PUBLIC_）。
   * 制約: **thread picker は作らない**（CEO T1b thread resolution・picker は別 GO）。
   *   本 env は local 検証用の明示注入のみ。production では未設定＝空。
   */
  coalterChatDevThreadId: (process.env.NEXT_PUBLIC_PLAN_COALTER_DEV_THREAD_ID ?? "").trim(),

  /**
   * TalkBridge-C1: relation metadata binding（**read-only・default OFF・C-1 専用 gate**）。
   *   true  : C-1 前提（viewerUserId + dev counterpart）充足時に既存 `GET /api/genome-connections`
   *           を 1 回読み、accepted connection の counterpart を `culcept_relation` に解決して
   *           session participants を bind（read-only・失敗は fixture へ fail-closed）。
   *   false : fixture のまま（**本番デフォルト**・fetch 0・現行動作不変）。
   *
   * env: NEXT_PUBLIC_PLAN_COALTER_RELATION_LIVE=true で有効化（client tab 内分岐のため NEXT_PUBLIC_）。
   * 正本: docs/coalter-plan-tab-c1-relation-binding-preflight.md（CEO 承認 2026-06-12）。
   * ★ chat live（read）とは **独立 gate**（capabilities は単一スイッチにしない原則）。relation 源は
   *   genome-connections のみ＝**`/api/talk/threads` は使わない**・service_role 非依存。
   */
  coalterRelationLive: process.env.NEXT_PUBLIC_PLAN_COALTER_RELATION_LIVE === "true",

  /**
   * TalkBridge-C1: relation 解決対象の counterpart userId（**dev/local 注入専用・default 空**）。
   *   - 空（既定）: 解決対象なし＝coalterRelationLive が ON でも fixture のまま（fetch 0・**勝手に選ばない**）
   *   - 非空 ∧ coalterRelationLive=true ∧ viewerUserId あり: genome-connections を読み、その userId が
   *     accepted connection の counterpart のときだけ resolve。
   *
   * env: NEXT_PUBLIC_PLAN_COALTER_DEV_COUNTERPART_USER_ID=<uuid>（client 読みのため NEXT_PUBLIC_）。
   * 制約: **thread picker / counterpart picker は作らない**（明示注入のみ・production 未設定＝空）。
   *   production の counterpart は session 作成由来（C-1 範囲外）。
   */
  coalterDevCounterpartUserId: (
    process.env.NEXT_PUBLIC_PLAN_COALTER_DEV_COUNTERPART_USER_ID ?? ""
  ).trim(),

  /**
   * TalkBridge-A: 「これまでの会話」**文脈セクション**（read-only・**default OFF**・session 本文と分離）。
   *   true  : C-1 relation が `attachedThreadRef`（= genome-connections.threadId）を得たとき、その thread の
   *           messages を read-only で**別セクション**に表示（**本文の bubble list には混ぜない**）。
   *   false : 文脈セクション非表示（**本番デフォルト**・thread messages fetch 0・本文不変）。
   *
   * env: NEXT_PUBLIC_PLAN_COALTER_THREAD_CONTEXT=true で有効化（client tab 内分岐のため NEXT_PUBLIC_）。
   * 正本: docs/coalter-session-message-closeout-thread-context-preflight.md §6-A（CEO 承認 2026-06-12）。
   * 制約: read-only（GET-only・既存 messages GET 再利用）・send/既読/Realtime/useCoAlter なし・
   *   thread→identity/session 派生なし（話者は匿名/表示専用・participants に昇格しない）・
   *   threadId 源は **genome-connections のみ**（`/api/talk/threads` LIST 不使用・picker なし）。
   */
  coalterThreadContext: process.env.NEXT_PUBLIC_PLAN_COALTER_THREAD_CONTEXT === "true",

  /**
   * CoAlter **local-only human send route** gate（POST /api/coalter/sessions/:id/messages・**default OFF**）。
   *   true  : participant が自分の session に session message を送信できる（user-RLS・author は server stamp）。
   *   false : route は 404（**本番デフォルト**・送信経路 dormant）。
   *
   * env: PLAN_COALTER_SEND_LOCAL=true（**server-side のみ評価・NEXT_PUBLIC_ なし**＝client に露出しない）。
   * 正本: docs/coalter-send-route-preflight.md（CEO GO 2026-06-13 local-only persistence/send bundle）。
   * 制約: **local only**（push/staging/production なし）。human participant の chat 送信のみ。
   *   system/CoAlter 送信なし・read receipt/realtime/typing/useCoAlter なし・`/talk` mutation なし・
   *   service_role 非依存（user-RLS client + DB RLS が最終ゲート）。route は request 時に本 env を再評価する。
   */
  coalterSendLocal: process.env.PLAN_COALTER_SEND_LOCAL === "true",

  /**
   * UX-5a-1: CoAlter **本文の live read** gate（GET /api/coalter/sessions/:id/messages・**client gate・default OFF**）。
   *   true  : `coalterDevSessionId` がある時、本文を GET から **read-only** で読む（送信は別 flag `coalterSendMessages`）。
   *           失敗/未認証/session 未束縛 → fixture へ fail-closed。
   *   false : fixture のまま（**本番デフォルト**・fetch 0・現行 UI 完全不変）。
   *
   * env: NEXT_PUBLIC_PLAN_COALTER_READ_MESSAGES=true（client tab 内分岐のため NEXT_PUBLIC_）。
   * 正本: docs/coalter-send-route-preflight.md（UX-5a-1 read/send flag separation）。
   * 制約: **read のみ**。route 側 server read gate `PLAN_COALTER_READ_LOCAL`（または send gate）と AND で初めて live read。
   *   raw userId を UI に出さない（未解決 author は中立ラベル）。read receipt/realtime/typing/useCoAlter なし。
   *   thread を session root にしない・thread から session identity を推論しない。
   */
  coalterReadMessages: process.env.NEXT_PUBLIC_PLAN_COALTER_READ_MESSAGES === "true",

  /**
   * UX-5a-1: CoAlter **本文の live send** gate（POST /api/coalter/sessions/:id/messages・**client gate・default OFF**）。
   *   true  : live read 中（`coalterReadMessages`+sessionId+live state）に送信を **実 send route** へ回す。
   *   false : 送信は **local echo のまま**（**本番デフォルト**・POST 0・現行挙動）。
   *
   * env: NEXT_PUBLIC_PLAN_COALTER_SEND_MESSAGES=true（client tab 内分岐のため NEXT_PUBLIC_）。
   * 制約: **send のみ**（read は `coalterReadMessages`）。**client send flag 単独では永続しない**
   *   （server `PLAN_COALTER_SEND_LOCAL` OFF なら POST 404＝write は絶対に開かない）。read receipt/realtime/typing/useCoAlter なし。
   */
  coalterSendMessages: process.env.NEXT_PUBLIC_PLAN_COALTER_SEND_MESSAGES === "true",

  /**
   * C4: CoAlter **brain preview** の read-only dev gate（**fixture 会話で脳 preview を観測するだけ**・default OFF）。
   *   true  : /plan/dev-coalter-brain-preview が fixture New-session messages → `buildCoAlterBrainPreview`
   *           （Legacy 脳の DB 非依存決定論コア `analyzeConversation` 再利用）の **preview を read-only 表示**。
   *   false : Disabled（**本番デフォルト**・render しない）。
   *
   * env: PLAN_COALTER_BRAIN_PREVIEW=true（**server-side のみ評価・NEXT_PUBLIC_ なし**）。
   * 設計: docs/coalter-brain-newsession-bridge-migration-gap-design.md（§4-B/§8）。
   * 制約: **保存しない**（DB/Supabase/insert なし）・**`runCoAlterPipeline` 本体を呼ばない**・LLM/外部なし・
   *   send/write は別 flag（本 flag は preview のみ・read-only）・bounded surface のみ（raw 内部 signal 非露出）。
   */
  coalterBrainPreview: process.env.PLAN_COALTER_BRAIN_PREVIEW === "true",

  /**
   * CoAlter live 本文の対象 sessionId（**dev/local 注入専用・default 空**・product strategy ではない）。
   *   - 空（既定）: live 対象なし＝coalterReadMessages が ON でも fixture のまま（fetch 0）
   *   - 非空 ∧ coalterReadMessages=true: その sessionId の messages を read-only で読む（送信は coalterSendMessages）。
   *
   * env: NEXT_PUBLIC_PLAN_COALTER_DEV_SESSION_ID=<uuid>（client 読みのため NEXT_PUBLIC_）。
   * 制約: **session 作成は production 未実装**（本 env は local 検証用の明示注入のみ・production 未設定＝空）。
   *   **`/talk` thread を session root にしない**（sessionId は plan_coalter session・thread 由来でない）。
   */
  coalterDevSessionId: (process.env.NEXT_PUBLIC_PLAN_COALTER_DEV_SESSION_ID ?? "").trim(),

  /**
   * UX-6a: Travel **personalization enrichment** の read-only dev preview（fixture 性格で proposal が変わるのを観測）。
   *   true  : /plan/dev-travel-personalization が **fixture PlanParams/TravelTraits → M2 soft preference → enrich** の
   *           baseline vs personalized proposal を read-only 比較表示（engine は fixture 入力で実行）。
   *   false : Disabled 表示（**本番デフォルト**・render しない）。
   *
   * env: PLAN_TRAVEL_PERSONALIZATION_PREVIEW=true で有効化（**server-side のみ評価・NEXT_PUBLIC_ なし**）。default OFF。
   * 制約: **fixture 入力のみ**（snapshotReader/DB/Supabase/real user data 非接触）・**read-only**・
   *   no API/fetch/送信/realtime・**本番 `/plan` 体験に非接触**・action button なし。production caller は本 preview 経路を使わない。
   */
  travelPersonalizationPreview: process.env.PLAN_TRAVEL_PERSONALIZATION_PREVIEW === "true",

  /**
   * UX-6b-1: Travel personalization の **real snapshot read** gate（solo/self・**dormant**・default OFF）。
   *   true  : （UX-6b-2 以降・caller 配線後）server caller が **user-RLS client** で snapshotReader を呼び、
   *           自 user の stargazer_axis_snapshots / stargazer_alter_growth → PersonalizationSnapshot → derive → m2 enrich。
   *   false : real read 一切なし（**本番デフォルト**・fixture preview のみ・DB 不触）。
   *
   * env: PLAN_TRAVEL_PERSONALIZATION_REAL_READ=true（**server-only・NEXT_PUBLIC_ なし**）。default OFF。
   * 制約（**UX-6b-1 では caller 未配線＝ON でも no-op**）: **service_role 禁止**（user-RLS client 注入）・自 user のみ・
   *   **consent gate（UX-6b-2 必須）なしでは real read しない**・companions(pair) は HOLD・staging re-link 後のみ。
   */
  travelPersonalizationRealRead: process.env.PLAN_TRAVEL_PERSONALIZATION_REAL_READ === "true",
} as const;

/**
 * CoAlter local-only send route の **request 時**評価（route handler 用）。
 * `PLAN_FLAGS.coalterSendLocal` は module load 時固定だが、route は毎リクエストで env を再評価して
 * local-only gate を効かせる（test も env stub で制御できる）。default OFF。
 */
export function planCoAlterSendLocalEnabled(): boolean {
  return process.env.PLAN_COALTER_SEND_LOCAL === "true";
}

/**
 * UX-5a-1: CoAlter local-only **read** route の **request 時**評価（GET handler 用・default OFF）。
 * read は send から独立した gate（`PLAN_COALTER_READ_LOCAL`）。GET は read ∨ send で許可
 * （send 可能なら自分の送信を読み返せる必要があるため＝send-refetch を壊さない）。POST は send のみ。
 */
export function planCoAlterReadLocalEnabled(): boolean {
  return process.env.PLAN_COALTER_READ_LOCAL === "true";
}
