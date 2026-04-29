# CoAlter — 完全引き継ぎドキュメント（2026-04-22 S1/S3 live-smoke 再実行完了時点）

**作成日**: 2026-04-22
**作成時点**: F-6 venue quality gate + S3 query degeneration + S1 朝誤認の 2 commit landed 後、live smoke 再実行レポート完了
**次着手**: 新チャット冒頭で §12 の 7 論点を CEO と対話 → 進め方合意 → 実装着手（通常は Bug-1 → Bug-2 → G6 food 拡張の順）
**読者**: 次の実装セッション（新チャット）を担当する AI エンジニア
**作業場所**: `feat/coalter-three-stage` branch の worktree（推奨: `~/Culcept-coalter/`）で作業し、最終的に PR 経由で `main` に merge する
**対象範囲**: **CoAlter 専用**。4 theme（food / movie / daily=schedule / travel）を含む全て。CoAlter 以外（alter-morning, Stargazer 本体, Rendezvous 等）は対象外

---

## 0. 絶対的コンテキスト

### 0.1 プロダクト

- **Aneurasync**（コードベース名: Culcept）
- Next.js 15 App Router + Supabase + Tailwind CSS 4 + Framer Motion
- 中心問い: 「この機能は、ユーザーの第二の自己として必要か？」
- 最高体験: 「自分って、そういう人間だったのか」とユーザーが気づく瞬間
- CEO: Taishi Harada（最終決裁者）

### 0.2 担当領域 — CoAlter とは

**CoAlter**（Co-Alter）= 2 人の Alter を統合して「関係性支援 OS」として機能させるモード。

> 2 人の関係・性格・履歴・今の会話・外部情報を統合して、2 人に最適な次の一手を出す関係性支援 OS

Home Alter（個人の判断エンジン）とは別物。Talk（1対1 DM）内で両者同意の上で起動し、共同意思決定（映画・食事・予定調整・旅行先を決める）を支援する。将来的に Rendezvous にも展開。

### 0.3 CoAlter の位置づけ

- `lib/coalter/` 配下のコード本体
- branch: `feat/coalter-three-stage`（これが CoAlter 完成用の統合 branch）
- 最終的に `main` に PR で merge する
- worktree 推奨: `git worktree add ~/Culcept-coalter feat/coalter-three-stage` で物理的に作業場所を分離

---

## 1. 北極星（最終ビジョン — CoAlter）

> **2 人の Alter が統合された CoAlter が、Talk 内で両者同意の上で起動し、関係性・性格・履歴・会話・外部情報を統合して 5 層パイプラインで共同意思決定を支援する。**

### 1.1 5 層パイプライン（master-design.md より）

```
L1  双方の AlterPersonality ロード
L2  関係性メタデータ構築（Fairness Ledger 含む）
L3  会話解析（テーマ検出・膠着検出・Caring Intensity・mode 判定）
L4  Adaptive RAG（Web 検索判断 + 実行 + 品質フィルタ）
L5  提案生成（要約 + 論点整理 + 候補 2-3 + 理由構造）
```

### 1.2 Mode と Theme の 2 軸

**混同しやすいので注意。Mode と Theme は直交する 2 軸。**

| 軸 | 値 | 意味 |
|---|---|---|
| **Mode**（行動モード） | decision / negotiate / clarify / (reflect=Phase 3) | 今どう動くか |
| **Theme**（ドメイン） | food / movie / travel / schedule / general | 何について話しているか |

例: 「渋谷でイタリアン食べよう」=（mode: decision, theme: food）

---

## 2. 今この瞬間の状態（2026-04-22 session 終了時）

### 2.1 Git state

```
branch:   feat/coalter-three-stage
HEAD:     566c4456 fix(coalter): S3 query degeneration + S1 朝誤認
          c22db5f9 fix(coalter): F-6 venue quality gate — block non_venue at catalog entry
          ba05dedb chore: gitignore...（それ以前）
```

**worktree で開始する場合**:
```bash
# メインレポ側から worktree 作成
git worktree add ~/Culcept-coalter feat/coalter-three-stage
cp .env.local ~/Culcept-coalter/
cd ~/Culcept-coalter
npm install
git log --oneline -3
# 期待: HEAD が 566c4456
```

### 2.2 CoAlter 以外の未コミット変更（無視）

CoAlter と無関係なファイル（他 branch の whitespace drift、別機能の binary、他トラックの screenshot 等）が repo 上に残っている場合があるが、**CoAlter worktree では見えないし触らない**。`feat/coalter-three-stage` に最新 CoAlter 変更が landing 済みなので、この branch を base にすれば clean state で作業できる。

### 2.3 直近 2 commit の詳細

#### c22db5f9 — F-6 venue quality gate
- `lib/coalter/pageTypeClassifier.ts`: directory-path gate + `MUNICIPAL_HOST_PATTERNS` + `NON_VENUE_TITLE_PATTERNS`
- `lib/coalter/types.ts`: PageType union に `"non_venue"` 追加
- `lib/coalter/foodCatalog.ts` / `foodOrchestrator.ts` / `foodQueryBuilder.ts` / `foodRanker.ts`: non_venue 処理 + `blocked_page_type` trace
- `scripts/coalter/f6-live-replay.ts`: 決定論 replay harness（新規）
- `scripts/coalter/f6-live-smoke.ts`: live web smoke（3 scenarios、新規）
- 4 unit test ファイル更新

#### 566c4456 — S3 query degeneration + S1 朝誤認
- `lib/coalter/conversationParser.ts`: location whitelist 80+ 駅に拡張（新橋/東京/品川/上野/恵比寿/浜松町/中目黒…）、時刻検出を「clock hour > abstract slot word」に順序変更
- `lib/coalter/webConnector.ts`: `detectCuisineHint()` helper 追加、food case に timeSlot + cuisine を注入（空クエリ/area 単独クエリの degeneration 解消）
- `lib/coalter/briefBuilder.ts`: `rectifyBriefTimeByHour()` helper 追加、`buildConversationBrief` で normalizeLlmBrief 後に explicit hour があれば timeSlot を上書き
- `tests/unit/coalter/conversationParser.test.ts`: 新駅 7 ケース it.each + 時間帯 3 ケース
- `tests/unit/coalter/webConnectorFoodQueries.test.ts`: S3 describe block 2 ケース
- `tests/unit/coalter/briefBuilder.test.ts`: 新規、5 ケース

### 2.4 テスト状態

```bash
npx vitest run tests/unit/coalter/
# 期待: 1111/1111 PASS（直近確認時点）
# 70 test ファイル
```

tsc:
```bash
npx tsc --noEmit 2>&1 | grep "lib/coalter\|tests/unit/coalter"
# 期待: 0 errors
# 他領域（CeoDashboard / baseline / stargazer/alter / sceneWeighting / perspectiveEngine / voiRefutation 等）の pre-existing error は無関係なので触らない
```

### 2.5 live smoke（2026-04-21 00:19 実行、`/tmp/f6-live-2.log`）

**3 scenario 全件 S3 query degeneration 解消を確認**:

| scenario | query（Q1） | rankedCount | summaryScore |
|---|---|---|---|
| S1 | `新宿 11時 ラーメン レストラン 食べログ Retty ...` | 1 | 0.7 |
| S2 | `渋谷 夜 イタリアン レストラン 食べログ Retty ...` | 2 | 0.85 |
| S3 | `新橋 7時 和定食 レストラン 食べログ Retty ...` | 3 | 0.7 |

**未解決バグ 2 件（次セッションの P0 タスク）**:

#### 🔴 Bug-1: S1 narrationBuilder が「朝」と誤表示
- S1 の output: `summary: "新宿・朝でご飯をどこで食べるか選びたい流れ。"`
- briefBuilder.rectifyBriefTimeByHour は効いている（tierAttempts に startHour=11 入っている）
- しかし narrationBuilder の summary 生成は「朝」を出力
- **仮説**: `lib/coalter/narrationBuilder.ts` の `formatWhenFromBrief` が `approximateTime.timeSlot` を無視しているか、別データソースから「朝」を取得している
- briefBuilder の unit test は既に PASS だが、narrationBuilder 層は未カバー
- 着手方法: `lib/coalter/narrationBuilder.ts` の formatWhenFromBrief を grep、test 追加、修正

#### 🔴 Bug-2: listicle URL（`PUR\d+`）と「X店」title が通過
3 scenario の rank 1 位が listicle:
```
S1 [1] https://retty.me/area/PRE13/ARE1/SUB101/LCAT5/PUR1/   ← ランチが楽しめる20店
S2 [1] https://retty.me/area/PRE13/ARE8/LCAT1/CAT415/PUR12/  ← ダイニングバー 20店
S3 [1] https://retty.me/area/PRE13/ARE2/SUB1601/LCAT8/CAT16/PUR12/ ← ひとりで入りやすい定食 12店
```
- pageTypeDistribution では listicle=3〜4 と検出されている（title 側で拾える分）
- しかし candidateEligiblePageRate=0.556〜0.667 で一部通過 → third_party_listing に分類された個体がある
- 必要な追加 gate:
  - `/area/.../(PUR|SUB)\d+/$` directory path pattern
  - title 末尾 `\d+店` pattern（12店 / 20店）
- 修正先: `lib/coalter/pageTypeClassifier.ts` の `MUNICIPAL_HOST_PATTERNS` と同格、`NON_VENUE_TITLE_PATTERNS` に追加

---

## 3. これまでの CoAlter 実装履歴（主要マイルストーン）

### 3.1 設計確立期（2026-04-15 頃）

- `docs/coalter-master-design.md` v1 landing — 5 層パイプライン定義 / Phase 1-4 分け
- CEO 承認 2026-04-15:
  - 個別チャネル = Phase 2 以降
  - Fairness Ledger = Phase 1 は内部のみ
  - 検索 = Web のみ（Phase 1.5 で HotPepper）
  - clarify = Phase 2（Intent Translation との棲み分け）

### 3.2 Phase 1 decision（food / movie 完成）

主要 commit:
- `d1d17e5f` feat(coalter): M1 1a — Stage 1 → /api/coalter/invoke 配線
- `5cf0ea6a` feat(coalter): M1 1b — Stage 1 collector Y-lite 拡張
- `1d64d937` feat(coalter): M1 Candidate 2 — Stage 1 narration
- `97d28945` feat(coalter): M1 C3 — pair onboarding minimum slice
- `e16c9e2d` feat(coalter): B / U1+U2 — META filter + topic-freshness
- `7cbb6430` feat(coalter): §7 U3 gate abolition structure complete
- `881665ec` feat(coalter): complete F-1..F-6 food lens wiring

### 3.3 Phase 2（3-mode body）凍結（2026-04-19）

CEO 承認で Phase 2 凍結。詳細: `docs/coalter-phase2-freeze-checklist.md`

凍結 6 項目（以後変更禁止）:
1. `isExecutorThemeEnabled` の判定基準
2. `coalterDispatch` の 5 step 順序（gate → router → modifier → theme gate → executor）
3. `CoAlterCard` discriminated union と各 mode の契約
4. `coalter_messages.metadata` のキー構造（proposalCard / card / routerTrace / gateResult / executorFallbackReason）
5. status API の出力形
6. `resolveActiveFromMetadata` の復元ロジック

**G6 制約**: executor 本実装は **movie 先行**。food / travel / schedule では negotiate / clarify が発火しても **decision fallback**（`coalterDispatch.ts:141-142` の `isExecutorThemeEnabled(theme) => theme === "movie"`）。

### 3.4 Phase 2 観測（2026-04-19）

- `docs/coalter-phase2-observation-spec.md` — 7 KPI + 4 AUX
- 初回観測: 実装健全、母数不足で Phase 3 優先順位は保留
- KPI-5 定義バグ修正: `WHERE cs.state = 'completed'` → message 1 件以上持つ session

### 3.5 Primary Question Guard / Loop Guard（2026-04-19）

- `docs/decision-log.md` 採用案 D/E
- `lib/coalter/primaryQuestionGuard.ts` — 破綻質問の構造排除
- Loop Guard — 同じ条件質問の連続再投出排除
- 25 tests PASS

### 3.6 Stage 1 Understand M0-6B（2026-04-20）

- M0-6A synthetic matrix ✅
- M0-6B shadow 実行解禁（内部ペア taishi/kumi、sessions 23 件）
- ZDR 確認済（org=Aneurasync, prefix=dceca5bb, enrolled=Yes）
- 本流昇格（readTodayRuleBased 退役）はまだ

### 3.7 今セッション（2026-04-21 / 2026-04-22）

- F-6 venue quality gate 実装完了
- S3 query degeneration 修正（conversationParser + webConnector）
- S1 朝誤認 修正（parser + briefBuilder rectify）
- Live smoke 3 scenario 再実行 → S3 解消確認、Bug-1/Bug-2 発見
- 2 commit landing on `feat/coalter-three-stage`

---

## 4. CoAlter ロードマップ（完成までの全体像）

### 4.1 4 theme × 現状マトリクス（最重要）

CoAlter には 2 軸がある: **mode**（行動モード）と **theme**（ドメイン）。

| | **food（食事）** | **movie（映画）** | **daily（=schedule / 予定調整）** | **travel（旅行）** |
|---|---|---|---|---|
| **decision pipeline** | ✅ F-1〜F-6 完成間近（残 Bug-1/2） | ✅ Phase A 完了 | 🔴 `triggerDetection.ts L180` で即スキップ。完全未着手 | 🟡 `webConnector` query のみ（`ilritrovo` 等の旅行体験 query）。catalog/orchestrator/ranker 未実装 |
| **catalog** | ✅ `foodCatalog.ts` | ✅ `movieCatalog.ts` | 🔴 なし | 🔴 なし（Phase 1.5.6 で Plan Brief 設計は存在） |
| **orchestrator** | ✅ `foodOrchestrator.ts` | ✅ `movieOrchestrator.ts` | 🔴 なし | 🔴 なし |
| **ranker** | ✅ `foodRanker.ts` | ✅ `movieRanker.ts` | 🔴 なし | 🔴 なし |
| **tier retry loop** | ✅ F-6 `foodTierRunner.ts` | 🟡 設計のみ | 🔴 — | 🔴 — |
| **venue quality gate** | ✅ F-6 pageTypeClassifier（残: listicle PUR\d+ gate = Bug-2） | ✅ Phase A.6 映画館ページ誘引 | 🔴 — | 🔴 — |
| **narration builder** | ✅ `narrationBuilder.ts`（残 Bug-1: 朝誤認） | ✅ | 🔴 — | 🔴 — |
| **negotiate mode** | 🔴 `isExecutorThemeEnabled` false → decision fallback | ✅ 本番実行 | 🔴 fallback | 🔴 fallback |
| **clarify mode** | 🔴 同上 | ✅ 本番実行 | 🔴 fallback | 🔴 fallback |
| **Phase 1.5 外部 API（構造化 search）** | 🟡 HotPepper 未着手 | N/A | 🔴 | 🔴 |
| **Phase 1.5.6 深層パーソナライズ** | 🟡 research 済 | 🟡 research 済 | 🔴 | 🟡 設計（Plan Brief 概念）、コード未着手 |
| **UI 入口（theme 明示選択）** | 🔴 なし（自動検出のみ） | 🔴 なし（自動検出のみ） | 🔴 なし + trigger 除外 | 🔴 なし（自動検出のみ） |

### 4.1.1 現在の UI 配置（実装済み）

**CoAlter ボタン**: `app/(culcept)/talk/[threadId]/ChatClient.tsx:1898-1908` にてチャット入力欄の**上**に、**右寄せで小さく**配置済み。
```
┌──────────────────────┐
│ メッセージ履歴           │
│ [CoAlterCard があれば]  │  ← 提案カードが差し込まれる
│              [CoAlter]│  ← 右寄せの小さいボタン
│ [引用返信プレビュー]    │
│ ┌─────────────┐     │
│ │ 入力欄           │     │
│ └─────────────┘     │
└──────────────────────┘
```

ボタン 6 state:
- inactive / disabled: 「CoAlterを使ってみる」
- pending_consent: 「CoAlterを有効にする」
- enabled: 「CoAlter」（グラデーション）
- active / loading: 「考え中...」
- error: 「もう一度試す」

**theme 選択 UI は未実装**:
- `CoAlterButton` に theme / mode パラメータ無し
- 呼び出し側 `onInvoke={() => coalter.invoke(null)}` — 無引数起動
- theme は `conversationParser.ts` が会話ログから自動検出（food/movie/travel/schedule/general）
- daily(=schedule) は `triggerDetection.ts:180` で自動提案トリガから除外
- ユーザーが「今回は travel で」と明示的に選ぶ UI は存在しない

**これが意味すること**:
P3 travel / P4 daily の executor を完走しても、**ユーザーから見える入口がない**。UI 設計が未決のため、新チャット冒頭で CEO と合意する必要がある（§13.2 参照）。

### 4.2 theme 別完成までのマイルストーン

#### food（最先端、完成間近）
1. Bug-1 / Bug-2 修正（次セッション P0）
2. live smoke 再実行 PASS
3. **G6 拡張: food で negotiate / clarify を有効化**（`isExecutorThemeEnabled` を food に開ける）
4. Phase 1.5 HotPepper API 統合（予算・ジャンル・エリアの構造化 search）
5. Phase 1.5.6 profileLoader 47軸拡張で深層パーソナライズ

#### movie（Phase 2 本実行テーマ、安定）
1. Phase 2 本番観測の母数回復（M0-6B shadow から実データ増やす）
2. KPI 読みで改善点特定（negotiate proposals=0 率、clarify question=null 率等）
3. 改善 iteration（Phase 3 で優先順位付け）

#### daily（=schedule、完全未着手 / 最難関）
1. **設計**: daily/schedule theme の executor 設計（食事と違い「候補 list」ではなく「スケジュール案」= 時間軸）
2. `triggerDetection.ts` の `if (theme === "general" || theme === "schedule") return NONE_RESULT("")` の解除
3. catalog / orchestrator / ranker の新規設計（Home Alter の Daily Guidance Engine から借用可能な部分あり）
4. calendar / availability との統合（supabase `culcept_calendar_*` テーブル群）
5. narration builder の新規テンプレート

> 注: 「daily モード」は CoAlter 内では **theme=schedule** のこと。Home Alter の Daily Guidance Engine（個人の起床時対話）とは別物なので混同しないこと。

#### travel（設計のみ、中規模）
1. **設計消費**: `docs/coalter-phase-1-5-6-differentiation-research.md` の Plan Brief 概念を実装に落とす
2. profileLoader 拡張（47軸 + Life Profile + chronotype + attachment + SDT + pair evaluatePair）
3. travel catalog / orchestrator / ranker 新規実装（food と同様の構造）
4. webConnector の travel query template 強化（現在は最小限）
5. narration builder の travel テンプレート（"novelty/familiarity 混合比"、"pace/budget/decision style 衝突吸収"）

### 4.3 全体フェーズ状態

```
Phase 1 decision executor:     food ✅残 Bug-1/2 / movie ✅ / daily 🔴 / travel 🟡
Phase 1.5 HotPepper:           🔴 未着手（food 構造化用）
Phase 1.5.6 Travel 深層PM:     🟡 research 済、コード未着手
Phase 2 3-mode body:           ✅ 凍結（2026-04-19、movie 先行 executor）
Phase 2 本番観測:              🟡 母数不足で Phase 3 優先順位保留
Stage 1 Understand LLM 本流化: 🟡 M0-6B shadow 解禁（2026-04-20）、昇格待ち
Phase 3 reflect + Rendezvous:  🔴 未着手
Phase 4 関係性インテリジェンス:🔴 未着手
```

### 4.4 完成までの優先度付きタスク（次セッション用）

| # | タスク | 根拠 / 状態 | 規模 |
|---|---|---|---|
| **P0-a** | Bug-1: narrationBuilder 朝誤認最終 fix（food） | live smoke 発覚 | 30min |
| **P0-b** | Bug-2: listicle PUR\d+ path + "X店" title gate（food） | live smoke 3 件全滅 | 1h |
| **P0-c** | Bug-1/2 修正後に live smoke 3 scenario 再実行、rank 1 = venue_detail 確認 | | 30min |
| **P0-d** | P0-a/b/c を 1 論理 commit で landing | | — |
| **P1** | Phase 2 本番観測の母数回復 + KPI 再取得（主に movie theme） | decision-log 2026-04-19 保留中 | 観測待ち |
| **P2** | **G6 拡張: food の negotiate/clarify 有効化** | Phase 2 凍結後の最初の拡張。`isExecutorThemeEnabled` を food にも | 1-2d |
| **P3** | **travel executor 本実装（catalog/orchestrator/ranker）** | Phase 1.5.6 設計済 | 3-5d |
| **P4** | **daily(=schedule) executor 本実装** | 設計も未（最難関） | 要設計 + 1w |
| **P5** | HotPepper API 統合（food 構造化） | Phase 1.5 / 要 CEO 承認（外部 API 連携） | 2d |
| **P6** | profileLoader 47軸拡張（Phase 1.5.6） | research doc 済、80% 未活用 | 3d |
| **P7** | Stage 1 Understand LLM 本流昇格（M0-6B → 昇格） | M0-6B 解禁済 | 観測サイクル依存 |
| **P8** | Phase 3: reflect mode / Fairness Ledger 自然言語開示 / Rendezvous 展開 | 設計のみ | 大 |

### 4.5 用語定義（daily / travel の混同防止）

| 呼称 | CoAlter 内での実体 | 状態 |
|---|---|---|
| **food / 食事 / ご飯** | theme="food" | decision ✅ / negotiate・clarify は G6 で fallback |
| **movie / 映画** | theme="movie" | decision ✅ / negotiate・clarify ✅（Phase 2 本実行） |
| **travel / 旅行** | theme="travel" | decision 🟡 部分 / Phase 1.5.6 で深層設計あり |
| **daily / 予定調整 / スケジュール** | theme="schedule" | 🔴 完全未着手。`triggerDetection.ts L180` でスキップ |
| **general / 雑談** | theme="general" | 🔴 未着手（Phase 1 の対象外） |

> 注: CoAlter の「daily」= **theme="schedule"** のこと。Home Alter の Daily Guidance Engine（起床時対話の別機能）とは無関係なので混同しないこと。

---

## 5. 次の具体アクション（P0 詳細）

### 5.1 Bug-1: narrationBuilder 朝誤認 最終 fix

**調査手順**:
```bash
git checkout feat/coalter-three-stage
grep -n "formatWhenFromBrief\|timeSlot\|朝\|昼" lib/coalter/narrationBuilder.ts | head -30
```

**着手ポイント**:
1. `formatWhenFromBrief(brief)` の実装を読む
2. `brief.approximateTime.timeSlot` と `preferredStartHour` をどう使っているか
3. timeSlot が "afternoon" なのに「朝」が出る経路を特定
4. 仮説: 別の helper（例: `describeTimeSlot(slot)`）で `"afternoon"` → 「昼」の mapping が欠けている、または日付ベースで「朝」を返している
5. unit test を書く（S1 相当: `timeSlot: "afternoon"`, `preferredStartHour: 11` → summary に「昼」or「11時」）
6. 修正

**追加ロジック方針**:
- 確実性の高い順: preferredStartHour > timeSlot > heuristic
- preferredStartHour があればそれを「11時」「7時」等で文字化するのが最も安全

### 5.2 Bug-2: listicle PUR\d+ / X店 gate 強化

**調査手順**:
```bash
grep -n "MUNICIPAL_HOST_PATTERNS\|NON_VENUE_TITLE_PATTERNS\|directory-path\|PUR\|SUB" lib/coalter/pageTypeClassifier.ts
```

**着手ポイント**:
1. 既存の directory-path gate のマッチャーを読む（retty.me の `/area/PRE\d+/ARE\d+/` は既に部分対応？）
2. path 末尾が `/(PUR|SUB)\d+/?$` で終わる retty.me URL を listicle 判定に加える
3. `NON_VENUE_TITLE_PATTERNS` に `/\d+店$/` を追加（既に「まとめ」「10選」「ランキング」等がある想定）
4. unit test 追加（3 URL パターン + "X店" title）
5. live smoke で確認

### 5.3 実行時のチェックリスト

```bash
# 1. branch 切替
git checkout feat/coalter-three-stage

# 2. 最新確認
git log --oneline -5
# 期待: HEAD = 566c4456

# 3. tsc 0 error 維持
npx tsc --noEmit 2>&1 | grep "lib/coalter\|tests/unit/coalter" | head -5
# 期待: 出力なし

# 4. テスト PASS 維持
npx vitest run tests/unit/coalter/
# 期待: 1111 PASS

# 5. 修正 → test → commit
```

### 5.4 Bug 修正後の P2（G6 拡張 food 有効化）着手前の CEO 確認事項

- food で negotiate / clarify を有効化してよいか（Phase 2 凍結条件との整合）
- `isExecutorThemeEnabled` 展開の段階性（food 先・movie と同格 or food は shadow 観測先行）
- negotiate materialization は既存 `foodRanker` の利害軸ヒント再実行でよいか（§3.6 依存禁止表遵守）
- food の clarify テンプレは movie と同じでよいか、ドメイン調整が要るか

---

## 6. 不変条件（CEO invariants — 絶対に破らない）

### 6.1 設計原則

1. **Phase 2 凍結 6 項目を変更しない**（`docs/coalter-phase2-freeze-checklist.md`）
2. **decision pipeline は Phase 1 完成時に確定。触らない**（Phase 2 設計書§2.1）
3. **negotiate は既存 ranker を利害軸ヒントで再実行するのみ**。新規 catalog / 独自 score は作らない（§2.2）
4. **clarify は候補を持たない**。ranker 呼ばない（§3.6）
5. **LLM narration enricher は凍結継続**（Phase 1 時点の方針）
6. **negotiate proposals = 0 件許容**（Phase 2 v0.3、pieExpansion だけで次ターン decision 再実行）
7. **modeRouter は RouterTrace を必ず返す**（監査必須、`coalter_messages.metadata.routerTrace` に永続化）
8. **依存禁止表（§3.6）**を守る — clarify が ranker 呼ばない、decision が intentTranslation 呼ばない 等

### 6.2 世界観（CoAlter voice）

- 推定表現固定・言い切り禁止（AI 主役感を防ぐ）
- 両者に同じものを見せる（片寄らない）
- Fairness Ledger は Phase 1 は内部のみ非表示

### 6.3 CEO 承認が必要な行動

- 本番環境へのデプロイ・DB migration
- HotPepper API 統合（P5）= 外部サービス連携追加、**要承認**
- Places API と同じく外部 key 発行の場合 **要承認**
- 課金・決済関連
- 法務・プライバシー関連

### 6.4 触っていい領域 / 触ってはいけない領域（worktree 厳格化）

**原則**: Alter と CoAlter の接点はコード import 1 箇所（`lib/stargazer/perspectiveEngine` の `executeSearch`）と DB schema 共有（`personality_dimensions` / `profiles`）のみ。並行セッションが Alter 側を触っている可能性があるので、CoAlter worktree では境界を厳格に守る。

**考え方**:
- Alter 側の `executeSearch` は「外部サービス」扱い
- CoAlter は「利用者」
- CoAlter の要件で足りないことがあっても、**まずは CoAlter 側で吸収**
- Alter 側を触りたくなったら、その時点で危険信号 → CEO に確認

**CoAlter worktree では以下の領域以外は変更禁止**:

✅ 触ってよい:
- `lib/coalter/**`
- `app/api/coalter/**`
- `app/(culcept)/talk/coalter-preview/**`
- `app/(dev)/coalter-preview/**`
- `tests/unit/coalter/**`
- `scripts/coalter/**`
- `docs/coalter-*.md`

🔴 通常は触らない:
- `lib/stargazer/**`（`executeSearch` は使うだけ。中身変更禁止）
- `lib/shared/**`
- `app/(culcept)/talk/[threadId]/ChatClient.tsx`
- `app/AneurasyncHome.tsx`
- `components/**`
- 既存 `supabase/migrations/**`

⚠️ CEO 承認必須:
- `app/(culcept)/talk/[threadId]/ChatClient.tsx` のロジック変更（preview → 実導線昇格時の正規接続点）
- CoAlter 新規 migration（`supabase/migrations/*coalter*` を含む全新規 migration）
- `personality_dimensions` / `profiles` テーブル schema 変更
- `executeSearch` シグネチャ変更

### 6.5 自律実行してよい行動

- コード調査・分析・レビュー
- unit test 実行
- バグ調査・修正案の起草
- 設計書作成・更新
- ローカル build 確認
- Bug-1 / Bug-2 の修正は自律実行可

---

## 7. State Safety Rule（CLAUDE.md 2026-04-01 制定）

**禁止操作**（Hook で機械的にブロック）:
- `git stash`
- `git reset --hard`
- `git checkout --`
- `git clean -f`
- `git restore .`

**コミット頻度**: 30 分以上の作業、または 3 ファイル以上の変更後は必ずコミット。

**ファイル個別指定**: `git add -A` / `git add .` 禁止。必ず `git add <file1> <file2>` で個別指定。

**tsc/build 確認**: stash を使わない。そのまま実行するか、WIP commit 後に実行。

**セッション終了時**: 未コミット変更がある場合は `git commit -m "WIP: <内容>"` を作成してから終了。

**今セッションで守ったこと**:
- `app/AneurasyncHome.tsx` の whitespace drift は自分の変更ではないので staging しなかった
- 2 commit を論理的に分割（F-6 gate / S3+S1 fix）

---

## 8. 実行 tips

### 8.1 よく使うコマンド

```bash
# CoAlter テストのみ
npx vitest run tests/unit/coalter/

# 特定ファイル
npx vitest run tests/unit/coalter/briefBuilder.test.ts

# tsc（CoAlter 領域だけ grep）
npx tsc --noEmit 2>&1 | grep "lib/coalter\|tests/unit/coalter"

# deterministic replay（ネット不要）
npx tsx scripts/coalter/f6-live-replay.ts

# live web smoke（Gemini semcache 効く。初回以外はほぼ cache hit）
npx tsx scripts/coalter/f6-live-smoke.ts 2>&1 | tee /tmp/f6-live-3.log
```

### 8.2 live smoke ログの読み方

- `[CoAlter] webConnector.decision` = クエリ構築結果
- `[CoAlter] webConnector.retrieval` = web 検索生データ top 3
- `[ai/run] cache hit` = Gemini semcache v2 ヒット（brief 計算スキップ）
- `[CoAlter] food.diagnostics` = F-6 diagnostics（rankedCount / pageTypeDistribution / queryProjectionCoverage 等）
- 最後の 1-PAGE REPORT が sessionId ごとの最終 proposalCard

### 8.3 CoAlter lib ファイル階層

```
lib/coalter/
  engine.ts                    — 5 層統合（L1〜L5 dispatch）
  coalterDispatch.ts           — Phase 2 dispatch (gate→router→modifier→theme→executor)
  preRouterGate.ts             — Pre-router gate（consent / emotion_heat high）
  modeRouter.ts                — Mode router（decision/negotiate/clarify 判定）
  postRouterModifier.ts        — Post-router modifier（ToneModifier）
  conversationParser.ts        — L3 会話解析（テーマ/膠着/caring/時間/場所）
  briefBuilder.ts              — ConversationBrief 生成（LLM + rectify）
  webConnector.ts              — L4 Adaptive RAG
  profileLoader.ts             — L1 AlterPersonality + 拡張
  # food pipeline
  foodCatalog.ts / foodOrchestrator.ts / foodQueryBuilder.ts / foodRanker.ts
  foodLensInputBuilder.ts / foodTierExpander.ts / foodTierRunner.ts
  # movie pipeline
  movieCatalog.ts / movieOrchestrator.ts / movieRanker.ts
  # mode executor
  negotiateBuilder.ts / clarifyBuilder.ts
  # narration
  narrationBuilder.ts / narrationEnricher.ts / narrationTemplate.ts
  stage1Narration.ts / pairContextNarrative.ts
  # gates / guards
  pageTypeClassifier.ts        — listicle / news / official / non_venue 分類
  primaryQuestionGuard.ts      — 破綻質問の構造排除
  slotValidator.ts / slots.ts
  safetyGate.ts (implicit via preRouterGate)
  # misc
  axes.ts / flags.ts / types.ts / u3Telemetry.ts
  planShelf.ts / planShelfFilters.ts / planTimeline.ts
  bookingResolver.ts / statusResolver.ts / themeContinuity.ts
  refineDirections.ts / refineItem.ts / topicScope.ts / triggerDetection.ts
  pairOnboarding.ts / realityCheck.ts
  understanding/               — Stage 1 LLM 理解エンジン
    realApiAdapter.ts / __testkit__/internalPairSchema.ts 等
```

---

## 9. CEO の意思決定原則

### 9.1 絶対的原則

> **「常に、ゴールから逆算して論理的に戦略を立てろ、先を見通せ、変更によって何が変わるのか、どういう影響があるのかを緻密に計算しろ、論理的に思考しろ。」**

> **「迷ったらスピードより整合性と世界観を優先」**

> **「先に考える、シンプル優先、精密に構築する、目標駆動、安全、品質の向上、論理的に、反証して合理的じゃないものは採用しない」**

### 9.2 AI への要求

- 報告は日本語
- ステータス絵文字: 🟢 順調 / 🟡 要注意 / 🔴 ブロック中
- 提案まで AI、最終決定は CEO
- **曖昧表現禁止**（根拠を示せ: ファイル / 行 / コマンド / 結果）
- 主張には根拠必須
- **検証プロトコル**: audit → テスト → 修正 → 再 audit

### 9.3 commit メッセージ style

- 英語 or 日本語のタイトル（`fix(coalter): ...` / `feat(coalter): ...`）
- 本文: 何をなぜ、どう直したか、影響範囲
- 末尾: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`
- HEREDOC で渡す
- 直近 2 commit（c22db5f9 / 566c4456）を参考

### 9.4 落ちてはならないこと

- **scope 混同**: commit 境界と PR 境界を明確に
- **前提の無検証**: 設計書に照合する
- **verification なき断定**: audit → test → 修正 → 再 audit
- **過剰な自律**: 外部サービス連携追加・本番 deploy は CEO 承認

---

## 10. 参照すべき docs 一覧（完全版）

### 10.1 CoAlter 設計書（最重要）

| ファイル | 役割 | 読む必要性 |
|---|---|---|
| `docs/coalter-master-design.md` | **CoAlter 全体設計 / 5 層パイプライン / Phase 1-4 ロードマップ** | 最初に読む |
| `docs/coalter-phase2-3mode-design.md` | **Phase 2 3-mode body 設計書 v0.3（確定版）** | Phase 2 凍結契約。絶対読む |
| `docs/coalter-phase2-freeze-checklist.md` | Phase 2 凍結チェックリスト（5 項目合格済） | 凍結ライン確認 |
| `docs/coalter-phase2-observation-spec.md` | **Phase 2 本番観測仕様 / 7 KPI + 4 AUX** | Phase 3 優先順位根拠 |
| `docs/coalter-phase2-preview-scenarios.md` | Phase 2 preview シナリオ | — |
| `docs/coalter-phase-1-5-6-differentiation-research.md` | **Phase 1.5.6 Travel 深層パーソナライズ設計** | travel 本実装時に必読 |
| `docs/coalter-food-diagnostics.md` | Food diagnostics 仕様 | F-6 触る時 |
| `docs/coalter-movie-three-stage-design.md` | Movie three stage（Phase A 設計） | movie 触る時 |
| `docs/coalter-m0-promotion-gates.md` | **Stage 1 Understand M0 昇格 Gate** | Stage 1 LLM 触る時 |
| `docs/coalter-m0-6a-challenge-agreement-memo.md` | M0-6A 合意書 | — |
| `docs/coalter-m0-6b-code-review.md` | M0-6B code review | M0-6B 触る時 |
| `docs/coalter-m0-6b-prerequisites.md` | M0-6B 前提条件 | — |
| `docs/coalter-m0-6b-zdr-evidence.md` | M0-6B ZDR 証跡 | — |
| `docs/coalter-internal-pair-consent-2026-04.md` | 内部ペア同意書（taishi/kumi） | — |
| `docs/coalter-handoff-2026-04-19-retrieval-investigation.md` | F-6 retrieval 調査引き継ぎ | F-6 触る時 |
| `docs/coalter-handoff-2026-04-22.md` | **本ドキュメント** | — |

### 10.2 CEO 方針・運用

| ファイル | 役割 |
|---|---|
| `CLAUDE.md` | **プロジェクト全体の CEO 方針 / State Safety Rule** |
| `docs/decision-log.md` | 意思決定ログ（CoAlter 関連 grep で辿れる） |
| `docs/weekly-priorities.md` | 週次優先事項 |
| `docs/operations-playbook.md` | 日次・週次運用手順 |
| `docs/roles.md` | 全役職の責務 |
| `docs/company-context.md` | 会社概要・ミッション |

### 10.3 MEMORY（`~/.claude/projects/-Users-haradataishi-Culcept/memory/`）

| ファイル | 役割 |
|---|---|
| `MEMORY.md` | プロジェクト全体の継続メモリ（index） |
| `aneurasync-philosophy.md` | 設計思想（最優先原則） |
| `feedback_verification-protocol.md` | 検証プロトコル |
| `feedback_coverage-audit-methodology.md` | Coverage Matrix 監査手法 |
| `feedback_reaudit-approach.md` | 再監査アプローチ |
| `feedback_copy-design-principles.md` | Copy 設計原則 |
| `feedback_alter-voice-constraints.md` | Alter voice 制約（CoAlter にも適用） |

### 10.4 関連 scripts

| ファイル | 役割 |
|---|---|
| `scripts/coalter/f6-live-replay.ts` | 決定論 replay（2026-04-21 新設） |
| `scripts/coalter/f6-live-smoke.ts` | live web smoke 3 scenario（2026-04-21 新設） |
| `scripts/coalter/export-internal-pair.ts` | 内部ペア export（M0-6B） |
| `scripts/coalter/shadow-real-api.ts` | shadow 実行（M0-6B） |
| `scripts/coalter-phase2-kpis.sql` | Phase 2 観測 SQL 集 |

---

## 11. 新チャット開始フロー（必ずこの順で進める）

**原則**: いきなり実装に飛び込まない。まず設計会話、次に進め方合意、最後に実装着手の 3 段階。

### 11.1 Step A — 環境セットアップ（CEO 承認不要、黙ってやる）

```bash
# 1. worktree 作成（メインレポ側から）
git worktree add ~/Culcept-coalter feat/coalter-three-stage
cp .env.local ~/Culcept-coalter/
cd ~/Culcept-coalter
npm install

# 2. branch 確認
git log --oneline -5
# 期待: HEAD = 566c4456 fix(coalter): S3 query degeneration + S1 朝誤認

# 3. coalter テスト PASS
npx vitest run tests/unit/coalter/
# 期待: 1111 PASS

# 4. tsc 0 error（CoAlter 領域のみ）
npx tsc --noEmit 2>&1 | grep "lib/coalter\|tests/unit/coalter"
# 期待: 出力なし
```

### 11.2 Step B — 読み込み（新セッションの担当 AI が必ず読む）

1. `docs/coalter-handoff-2026-04-22.md`（本ドキュメント。最初に最後まで読む）
2. `docs/coalter-master-design.md`（5 層パイプラインと phase 設計）
3. `docs/coalter-phase2-3mode-design.md`（Phase 2 凍結契約）
4. `docs/coalter-phase2-observation-spec.md`（観測 KPI）
5. `CLAUDE.md`（CEO 方針 / State Safety Rule）

### 11.3 Step C — CEO との設計会話（実装前に必ず詰める）

§12 に記載した **7 つの設計論点**を CEO と対話して合意する。
いきなり Bug-1 修正に入らない。CEO が「進めていい」と言うまで実装着手しない。

### 11.4 Step D — 進め方合意

§12 の合意結果に基づいて:
- P0〜P8 の優先順位を CEO と再確認
- 越境 3 点（P3 executeSearch / P4 calendar / P6 profileLoader 47軸）の扱いを確定
- UI 設計（theme 選択の A/B/C）を確定

### 11.5 Step E — 実装着手（合意後）

通常は P0 Bug-1 / Bug-2 から。合意内容により順序変動あり。

---

## 12. CEO との設計会話（新チャット冒頭、実装前に必ず詰める）

新チャット担当 AI は、以下 7 論点を**順番に**CEO と対話して合意する。実装に入る前の必須プロセス。

### 12.1 【論点 1】境界線の確認（§6.4）

**問い**: 「CoAlter worktree では §6.4 の境界線（✅ 触ってよい / 🔴 通常は触らない / ⚠️ CEO 承認必須）で合意でよいか。追加・変更はあるか」

**目的**: 作業スコープを機械的に確定する。並行作業との衝突防止。

### 12.2 【論点 2】完走可能性 3 越境点の扱い

現行 P3 / P4 / P6 は境界線の越境可能性がある。事前に方針合意が必要。

1. **P3 travel executor**: `executeSearch(queries: string[], timeout)` シグネチャで travel query を構築しきれるか。不足時は Alter 側を触らず CoAlter の query 構築で吸収する方針でよいか
2. **P4 daily(=schedule) executor**: calendar/availability 統合で `lib/shared/calendar`（正本）への依存が出る。read 関数追加が必要な場合、CoAlter 内 wrapper で吸収するか、CEO 承認で shared 側に足すか
3. **P6 profileLoader 47軸拡張**: `personality_dimensions` テーブルに 47 軸全部 stored されている前提。未 stored なら Alter 側 migration が必要 → CEO 承認事項。現状の stored 軸数を事前調査しておくか

### 12.3 【論点 3】UI theme 選択設計（最重要）

**現状**:
- CoAlter ボタンはチャット入力欄の上に右寄せ配置済み
- theme 選択 UI は**無い**（会話内容から自動検出のみ）
- `triggerDetection.ts:180` で schedule(=daily) は自動提案除外
- travel は検出されるが executor 無しで decision fallback

**問い**: P3 travel / P4 daily 完成後のユーザー入口設計。以下 A/B/C のどれか。

- **A: 現状維持（自動検出に完全依存）** — 世界観として自然、精度リスクあり
- **B: CoAlter ボタン長押し or タップメニューで theme 明示指定** — 確実性高い、UI 複雑化
- **C: CoAlter 起動後の clarify mode で theme を聞く** — シンプルな入口、タップ数増

**目的**: P3 / P4 の実装前に入口設計を確定しないと、executor 完成しても出口のない機能になる。

### 12.4 【論点 4】P0 実装の承認範囲

**問い**: Bug-1（narrationBuilder 朝誤認）/ Bug-2（listicle PUR\d+ gate）は State Safety Rule 下の自律修正で進めてよいか。それとも 1 commit ごとに CEO レビューを入れるか

### 12.5 【論点 5】P2 G6 food 拡張のタイミング

**問い**: Bug-1/2 修正後、live smoke で rank 1 = venue_detail 確認できたら P2（food で negotiate/clarify 有効化）に進んでよいか。観測データ取得を先にするか

### 12.6 【論点 6】Phase 2 観測母数回復の主体

**問い**: Phase 2 本番観測は母数不足で Phase 3 優先順位保留中。M0-6B shadow 解禁済だが、内部ペア taishi/kumi の実データ流し込みは誰がいつ実施するか

### 12.7 【論点 7】P5 HotPepper API 着手時期

**問い**: 外部サービス連携追加は CEO 承認必須。food の深層パーソナライズに必須だが、いつ着手するか。P3 travel / P4 daily より前か後か

---

## 13. 本ドキュメントのメタ情報

- **作成理由**: セッション引き継ぎ。新チャットで CoAlter 完成作業を継続する
- **前身**: `docs/coalter-handoff-2026-04-19-retrieval-investigation.md`（F-6 retrieval 調査まで）
- **次回更新タイミング**: Bug-1/Bug-2 修正完了時、または Phase 2 G6 food 拡張着手時
- **更新方法**: 本ファイルを上書きせず `docs/coalter-handoff-YYYY-MM-DD.md` で新規作成、前身を「前身」欄に記録
- **不可侵領域**: CEO 方針原則（§9）/ State Safety Rule（§7）/ Phase 2 凍結 6 項目（§6.1）は変更禁止

---

## 14. 最後に

### 14.1 次セッションが最初に取り組むべきこと

**重要**: いきなり実装に飛び込まない。§11 のフロー（A→B→C→D→E）を必ず守る。

1. **Step A**: worktree 作成（`~/Culcept-coalter`）+ テスト / tsc 確認（CEO 承認不要）
2. **Step B**: handoff doc + 関連設計書 4 本を読む
3. **Step C**: §12 の 7 論点を CEO と対話して合意（**ここが新チャット冒頭の本命**）
   - 特に【論点 3】UI theme 選択設計は P3 / P4 実装前に必ず詰める
   - 越境 3 点（論点 2）も合意必須
4. **Step D**: 合意内容に基づいて P0〜P8 の進め方を合意
5. **Step E**: 実装着手（通常は Bug-1 / Bug-2 → live smoke → P2 判断）

### 14.2 やってはいけないこと

- `app/AneurasyncHome.tsx` に触る（whitespace drift は自分のものではない）
- Phase 2 凍結 6 項目の変更
- `isExecutorThemeEnabled` を勝手に food に拡張（P2 は CEO 承認必要）
- HotPepper API / Google Places API 等の外部連携追加（CEO 承認必要）
- `git stash` / `git reset --hard` / `git checkout --` 等の State Safety Rule 違反
- decision pipeline の変更（Phase 1 で確定、不可侵）
- LLM narration enricher の有効化（Phase 1 凍結継続）

### 14.3 迷ったら

- CEO 方針「**迷ったらスピードより整合性と世界観を優先**」
- 「先に考える、シンプル優先、精密に構築する、目標駆動、安全、品質の向上、論理的に、反証して合理的じゃないものは採用しない」
- 今月の成功条件（CLAUDE.md）に照らす:
  1. コア機能の完成
  2. 初期ユーザー獲得
  3. 世界観の確立
  4. デプロイ可能状態

### 14.4 究極のゴール

> **CoAlter が 2 人の会話に自然に呼び込まれ、双方の性格・履歴・関係性・今の会話・外部情報を統合して、「2 人にとって最適な次の一手」を片寄らず両者の世界観で提示し、静かに退出する。その体験で「この 2 人の関係を知っている第二の知性がいる」と感じさせる。**

---

**🎯 結論**: F-6 + S3 + S1 の 2 commit landing 済み。次は **Bug-1 / Bug-2 修正 → live smoke 再実行 → G6 food 拡張** の順で CoAlter 完成へ。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
