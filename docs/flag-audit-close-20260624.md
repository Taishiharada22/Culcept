# FLAG-AUDIT-CLOSE — 統合セッション flag 説明の補正（2026-06-24）

各 track 担当セッションが、統合セッションが `.env.local` に並べた flag 名・説明を**実コードと突き合わせて監査**した結果、統合セッションの過去説明に複数の誤りが判明した。本書はその補正を docs として正式記録する（フラグ名・過不足とも問題なし＝surface は正しく機能する。誤っていたのは「説明・分類」のみ）。

## 監査総括
- **flag 名は全 track で実コードと完全一致**（過不足なし）。surface 用フラグは正しく ON、危険フラグ（write/prod/ranking apply）は正しく OFF。
- 補正対象は統合セッションの「説明文・分類」4 点 + 前提条件 + 注意。コード/フラグ自体に不足はない。

## 補正 1: Travel Supabase repo は「throw する skeleton」ではない（実装済）
- 統合セッションの旧説明: 「`NEXT_PUBLIC_PLAN_TRAVEL_SUPABASE_REPO_ENABLED` は skeleton＝**throw する**ので除外」。
- **事実（実コード裏取り済）**: `app/(culcept)/calendar/_lib/travel/repository/supabaseTravelRepository.ts` は **E-2/E-3/E-6A で実装済**（read+write 検証済・`sb.auth.getUser` で auth・anon+RLS・service_role 不使用）。`NOT_IMPLEMENTED` throw は**ない**。throw は未認証時（`if(!uid)`）の認証ガードのみ。factory の**コメント文字列が "未実装 skeleton" のまま stale** だったため統合セッションが誤読した。
- **OFF 維持の正しい理由**: 目視は fixture（6/24-26 サンプル京都）で十分。**repo ON は staging への実 write + staging seed を伴う**（E-7B dogfood＝別 CEO ゲート）。視覚確認目的では OFF が正解。
- 補足: repo ON の前提となる **E-6A write-path fix は main に取り込み済み**（`6db88bd57`・破壊的 round-trip 根絶）。将来 ON にする条件は満たしている。

## 補正 2: Travel 表示の前提（anchor ≥ 1 + 6/24〜26 選択）
- `/plan` の CalendarTab は **anchor 0 件だと EmptyState**（カレンダーグリッド・旅行ボタンとも出ない）。**まず予定を 1 件追加**（「+ Alter に教える」or .ics 取込）が必要。
- Travel 旅行日詳細ボタンは **fixture trip 期間（6/24-26）選択時のみ**出現。
- `PLAN_ROUTE_LIVE=true` 前提（カレンダー/リスト/マップが見えていれば満たされている）。

## 補正 3: LifeOps mainline は「dormant/consumer 未配線」ではない（配線済）
- 統合セッションの旧説明: 「LifeOps mainline は dormant の可能性（consumer 未配線）。確実に見えるのは `/lifeops-preview` だけ」。
- **事実（実コード裏取り済）**: consumer は**配線済**（`app/(culcept)/plan/page.tsx:82-90`→`computeLifeOpsMainlineModel`→`buildLifeOpsMainlineCardDto`、`PlanClient.tsx:879`→`<LifeOpsMainlineCard>`、`:885`→`<LifeOpsMomentCard>`）。
- `LIFEOPS_MAINLINE=true`（+ `LIFEOPS_MAINLINE_MOMENT=true` + `PLAN_ROUTE_LIVE` + staging URL）で **/plan 本線に「生活まわり」card +「今の一枚」card が surface**（c23b で CEO staging dogfood PASS 済）。`/lifeops-preview` 限定ではない。dormant の理由は「consumer 未配線」ではなく「flag OFF だったから」。
- 注意（意図的・write OFF 由来）: ①「生活まわりを登録」入口は `LIFEOPS_STRUCTURED_SOURCE_WRITE` gate 配下で非表示 ②done/later/dismiss は `LIFEOPS_FEEDBACK_WRITE` OFF のため永続化しない（画面遷移はするが学習に反映されない）。表示・操作感は見えるが「打った done が効く」検証には write flag が要る。

## 補正 4: `REALITY_OS_SURFACE_PROD` は無副作用 fixture surface（誤分類だった）
- 統合セッションの旧分類: 「`REALITY_CAPTURE_*` と同じ production/write/no-op 系」として除外。
- **事実（実コード裏取り済）**: `lib/plan/realityPipeline/realityOsSurfaceFixture.ts` は **supabase/fetch/admin import なし・write/DB/API/LLM/fetch 0 件**の pure fixture builder。flag ON → `buildRealityOsSurfaceFixtureDisplay()` が redacted fixture VM を返すだけ。`_PROD` という命名が誤解の元（実体は無副作用 fixture seam）。
- **dev smoke では ON 可**（安全）。surface 経路: ①CoAlter タブ内（`PlanIntelligenceLivePanel.tsx:431`・`REALITY_OS_SURFACE_PROD=true` + CoAlter タブ ON）②`/plan/dev-reality-pipeline`（flag 不要・dev）。2026-06-24 の dev smoke `.env.local` に追加済。

## 前提 5: Candidate Lens / post-visit / Fit-Arc は dev-only hard block
- 3 機能とも `process.env.NODE_ENV === "production"` で**必ず false**（`postVisitObservation.ts:29` / `fitArcReadout.ts:20` / `candidateLensUi.ts` 裏取り済）。
- → **`npx next dev`（NODE_ENV=development）でのみ surface**。`next build && next start`（production build）では env を立てても出ない。CEO の dev smoke 前提と一致。
- Fit-Arc は観測ゼロでは `insufficient`（「まだ分かりません」）＝post-visit 答え合わせを数件すると tentative→observed に育つ（false-aliveness 回避の意図的挙動）。

## 前提 6: 評価OS ②-1〜②-7 shadow 層は UI に出ないのが正しい
- 階層ベイズ融合 / Match Ledger / persona prior / retention readiness / cross-domain 契約 / honesty firewall（②-1〜②-7）は **flag も UI 配線も持たない pure/dormant**。
- → env リストに**無いのが正解**（漏れではない）。「融合エンジン/Match Ledger が見えない」=正常（shadow＝不可視が設計）。

## 注意記録: `REALITY_LEARNING_EVENT_WRITE=true`（CEO 既存設定由来）
- main worktree の既存フル `.env.local` に `REALITY_LEARNING_EVENT_WRITE=true` が**元から存在**（2026-06-24 の safe smoke 追加分ではない）。
- これは reality 学習イベントの **staging write を伴いうる** flag。safe smoke で統合セッションが追加した 4-track + `REALITY_OS_SURFACE_PROD` には write/prod は皆無。
- staging（test 環境）への書込のため production リスクではないが、**意図しない場合は後で当該行を OFF 推奨**。`.env.local` は gitignore 対象で commit されない。

---
本書は docs-only の事実補正。コード・フラグ・接続の変更なし。surface 機能とフラグ名は監査で「過不足なし」と確認済み。
