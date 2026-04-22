# Alter Morning — 完全引き継ぎドキュメント（2026-04-22 commit 24 完了時点）

**作成日**: 2026-04-22
**作成時点**: W3-PR-8 rev 3 commit 24 merge 完了 / live preview 安全性 PASS
**次着手**: PR-9（Places API Search / Anchor-Based Search）
**読者**: 次の実装セッション（新チャット）を担当する AI エンジニア

---

## 0. 絶対的コンテキスト

### 0.1 プロダクト

- **Aneurasync**（コードベース名: Culcept）
- Next.js 15 App Router + Supabase + Tailwind CSS 4 + Framer Motion
- 中心問い: 「この機能は、ユーザーの第二の自己として必要か？」
- 最高体験: 「自分って、そういう人間だったのか」とユーザーが気づく瞬間

### 0.2 担当領域

**Alter Morning Protocol** — 起床時に Alter（ユーザーの影の声 / AI 分身）が「今日の予定」を対話で引き出し、plan item として可視化する体験。

**ファイル階層**:
```
app/api/stargazer/alter/route.ts    … HTTP handler（9700+ 行、長大）
lib/alter-morning/
  ├── dialog/                       … PR-8 rev 3 で新設された会話状態層
  │   ├── types.ts                  … DialogState 型定義
  │   ├── reducer.ts                … pure reducer（CAPTURED / PROVIDER_FAILED 等）
  │   ├── taxonomy.ts               … chain / category 辞書
  │   ├── shadowPipeline.ts         … flag ON 時の shadow 駆動
  │   ├── shadowTargetEventId.ts    … commit 22 で追加
  │   ├── responsePromotion.ts      … commit 19 で追加
  │   ├── selectClarifyFallback.ts  … commit 23 で追加
  │   ├── providerLatch.ts          … commit 24 で追加
  │   ├── derivePendingClarify.ts
  │   ├── ensureSessionV1.ts
  │   └── flags.ts
  ├── protocol.ts                   … processMorningMessage（既存）
  ├── adapter.ts                    … pipeline → legacy MorningResponse 変換
  ├── comprehension.ts              … LLM 呼び出し（gapResolver / answerBinder）
  └── types.ts                      … MorningSession / MorningResponse 型
tests/unit/alter-morning/
  └── dialog/                       … 新設層の unit tests（1613 tests PASS）
```

### 0.3 Feature Flag

- `ALTER_MORNING_FLAGS.dialogStateV2` — PR-8 rev 3 全体の ON/OFF
- **flag OFF baseline は絶対不変**（CEO 方針 / 回帰禁止）
- flag ON 時のみ新層が動作。try/catch で wrap し例外は warn 止まり

---

## 1. 北極星（最終ビジョン）

> **全ての予定を map にピンでマッピングし、各予定に *移動手段 / いつ / どこで / 誰と / いつからいつまで / 何を* を載せる。予定を順番に繋いで、1 日の動きを可視化する。**

### 1.1 技術要件分解

各 event が確定値で以下を持つ必要がある:

| slot | 確定値 |
|------|-------|
| where | `lat/lng` + `place_name` + `placeId` |
| when | `startTime(HH:mm)` + `endTime(HH:mm)` |
| transport | `mode` + 2 event 間の経路 |
| who | 正規化された人物参照 |
| what | 具体活動（vague 非許容） |

### 1.2 決定的制約

地図ピンには **座標が必要** → 座標は **外部 search（Places API 等）** 無しには埋まらない → 「会話 → search 準備 → search → 座標注入」の 4 段階は切り離せない。

---

## 2. PR 階段の全体像

```
[北極星] map + pin + timeline UI
  │
  ▼
PR-14 │ timeline UI            │ event 連結線 + transport 描画
  ▼
PR-13 │ map pin rendering      │ coordinates 揃った event を map に描画
  ▼
PR-12 │ end time staircase     │ 時間範囲を点から区間に
  ▼
PR-11 │ who staircase          │ 人物参照の正規化
  ▼
PR-10 │ transport staircase    │ 移動手段 + 2 event 間経路
  ▼
★PR-9 │ Places API search      │ SearchQueryDraft → 候補 → user 選択 → lat/lng 注入  ← ★次着手
  ▼
✅ PR-8 rev 3 │ DialogState + staircase │ 会話が memory を持つ、search query が draft まで蓄積
  ▼
✅ PR-8 rev 2 │ dialog-control contract │ phase authority が slot に
  ▼
✅ PR-8 rev 1 │ UI truth separation     │ slot 分離描画 + confirmationState
  ▼
✅ PR-7       │ clarify loop 基盤       │ pendingClarify / answerBinder の骨格
```

### 2.1 不変な依存関係

- PR-9 は **PR-8 rev 3 の SearchQueryDraft 契約** に依存（rev 3 merge 前は PR-9 実装禁止）← 今クリア
- PR-10 は **PR-9 で埋まった座標** に依存
- PR-11 は独立性が高い（who は where/when と直交 → PR-9 と並行可）
- PR-13 は **全 event が座標を持つ** ことが前提（= PR-9 完了）
- PR-14 は **PR-13 + PR-10** 両方に依存

### 2.2 各 PR の「初めて可能になるもの」

| PR | 北極星への貢献 | これが無いと次に進めない理由 |
|----|--------------|---------------------------|
| ✅ PR-7 | 質問ループが動く | 会話で slot を埋める基本動作がない |
| ✅ PR-8 rev 1 | UI が嘘をつかない | 「確定風」表示を直すコストが膨大になる |
| ✅ PR-8 rev 2 | 未確定が plan に上がらない | slot 解決を入れても UI 側が認識しない |
| ✅ PR-8 rev 3 | 会話が memory を持つ / search query draft が揃う | PR-9 が query 構築元を持てない |
| ★ PR-9 | where に座標が入る | map pin の前提 |
| PR-10 | event 間に経路が乗る | timeline 描画で「移動」が描けない |
| PR-11 | who が一意 | cross-session で「A さん」が毎回別人扱いされる |
| PR-12 | 時間範囲が区間 | pin 間の時間的関係が描けない |
| PR-13 | map に pin が立つ | CEO ビジョンの第一視覚化 |
| PR-14 | 1 日の流れが 1 画面 | CEO ビジョン完成 |

---

## 3. これまでの実装履歴（PR-7 merge から commit 24 まで）

### 3.1 PR-7 merge（2026-04-18 / PR #15, commit 283cb2a4）
- clarify loop 基盤（pendingClarify / answerBinder）
- `lib/alter-morning/comprehension.ts` の gapResolver / answerBinder 配線
- 残課題: 未確定 slot が UI 上「確定風」に描画されている

### 3.2 PR-8 rev 1（UI truth separation）
- `ConfirmationState` / `WhereVagueSubKind` 型追加（commit 1）
- `whereVagueClassifier` + `normalizedPlanItem`（commit 2）
- adapter に sharpness 配線（commit 3）
- `MorningPlanCard` の slot 分離描画（commit 4）
- `anchorSearchGate` PR-9 予約スタブ（commit 5）
- unit tests（commit 6）

### 3.3 PR-8 rev 2（dialog-control contract / commits 7-12）
- `blockingSlots` + `whereClassifier` strict（commit 8）
- `decidePhase` contract + items=0 guard（commit 9）
- `answerBinder` undecided reject + invariant（commit 10）
- dialog-control tests（commit 11）
- 設計書改訂 2 反映（commit 12）

### 3.4 PR-8 rev 3（DialogState 層新設 / commits 13-24）

#### Phase 0（設計）
- 2fc40152: Phase 0 設計一式（PR-8 rev 3 / PR-9 骨子 / PR-10~14 予約 / roadmap）
- bc68101e: 実装詳細追補（Phase 0 設計コンプリート）

#### 実装コミット

| commit | 内容 |
|---|---|
| 13 (96b0042a) | DialogState v2 型 landing + 予約型 |
| 14 (af96a2f0) | dialogReducer 本実装 + 単体テスト |
| 15 (e0775def) | classifyUtterance 本実装 + 単体テスト |
| 16 (3ce2bbe1) | DialogState v2 route wiring (flag-gated dead code) |
| 17 (a9f04dfb) | DialogState v2 shadow pipeline (flag ON のみ、phase 不干渉) |
| 18 (21e21670) | reducer narrowStep multi-turn lift (§1.2 table 準拠) |
| 19 (fb49a5a1) | **user-facing runtime 昇格**（derived_kind で message 差し替え） |
| 20 (8f5f28da) | rev3 contract gate tests（CEO preview 観点 1-4） |
| 21 (abf260c1) | route.ts dialogState adapter 跨ぎ消失修正 |
| 22 (6e1e8ff9) | shadow targetEventId 条件付き focus 継承 |
| 22b (747ccbac) | client dialogState round-trip |
| 23 (09b8c173) | phase=clarifying items=0 gate（`selectClarifyFallback`） |
| 23c (9e8a6ebd) | reducer slot-independent draft preservation |
| **24 (e36c8624)** | **provider failure latch** ← ★ 最新、live preview PASS |

### 3.5 Commit 24 の詳細（最重要・直近の文脈）

**目的**: pipeline 総失敗（Gemini + OpenAI 両方 throw）時に user 画面を明示的に degrade。

**実装**:
- `lib/alter-morning/dialog/providerLatch.ts` — pure helper
  - streak=1 → "今ちょっと届きにくいかも。少し待って、もう一度。"（24字）
  - streak≥2 → "まだ少し重いみたい。時間おいてまた話そう。"（22字）
  - 負値 / 小数は `Math.max(0, Math.floor(streak))` で安全化
- `app/api/stargazer/alter/route.ts` wiring:
  - catch block で `PROVIDER_FAILED` dispatch + `pipelineAbsorbedOuter=true`
  - shadow 冒頭で `PROVIDER_RECOVERED` dispatch（pipeline 成功かつ prev が `provider_recovering` のとき）
  - commit 19 promote 後・commit 23 gate 前に latch 発火
  - latch 発火時は commit 23 clarifyFallback を skip（degrade 文を守る）
- `tests/unit/alter-morning/dialog/providerLatch.test.ts` — 19 tests PASS

**優先順位**:
```
commit 19 promote → commit 24 latch → commit 23 clarifyFallback
```

**live preview（2026-04-22）**: 3 Run とも `reason=noop_no_streak streak=0 replaced=0` で正常パス不変。Gemini 503 は複数観測されたが全て OpenAI fallback 成功で pipeline 総失敗には至らず、latch の発火条件未達。regression 0 / unit tests 19/19 PASS → **CEO 判断で PASS**。

**narrowing バグ修正**: `morningSession = { ...morningSession, dialogState: recoveredState }` だと TS が dialogState を `null | undefined` に widening し、下流 5 箇所で pre-existing コードが error 化。→ `morningSession.dialogState = recoveredState`（in-place mutation）に変更して narrowing 保持。

---

## 4. 現在地（2026-04-22 commit 24 完了時点）

| 項目 | 状態 |
|---|---|
| branch | `feat/alter-morning-wave3-pr8` |
| HEAD | `e36c8624` |
| unit tests | 1613 PASS / 0 FAIL（+19 from commit 24） |
| tsc 新規 error | 0（pre-existing 15 件は PE 系で無関係） |
| PR-8 rev 3 status | ✅ commit 13-24 完了 |
| live preview | ✅ 安全性 PASS（CEO 2026-04-22 23:30） |
| PR-9 着手条件 | ✅ SearchQueryDraft 契約確立済み |
| **次のアクション** | **PR-9 Phase 1（Places API client 実装）に着手** |

### 4.1 未 commit の変更（次 chat が確認すべき）

```
docs/alter-morning-strict-confirmation-design.md    (modified — 改訂 3 記述)
docs/weekly-priorities.md                           (modified)
public/samples/figure/architect.png                 (modified, binary)
docs/alter-morning-pr10-14-interface-reservation.md (untracked)
docs/alter-morning-pr8-rev3-implementation-detail.md (untracked)
docs/alter-morning-pr9-places-search-design.md      (untracked)
docs/alter-morning-roadmap.md                       (untracked)
```

これらは PR-8 rev 3 全体設計ドキュメント群。適切なタイミングで `docs(alter-morning): rev 3 設計書一式` のような commit で landing するか、PR-9 着手時に一緒にまとめる判断を CEO に確認する。

### 4.2 既知の残課題（PR-9 射程）

- **Run 1 観測（2026-04-22）**: 「カフェ」単体 → 場所 narrowing を飛ばして plan_presented
- **Run 2 観測**: 「甲府駅らへん」まで到達しても `search_handoff_blocking` は internal state only → user-facing には「近くのお店探そうか？」を出さない（PR-9 未実装下の dead end 防止として意図的）
- **解消策**: PR-9 で Places API + user-facing 導線開放

---

## 5. PR-9（次着手）の詳細

### 5.1 ゴール

> `SearchQueryDraft.readyForHandoff=1` 到達時に、`anchor + category/chain` から **Places API で候補を取得** し、ユーザーに提示して選択させ、`where.place_ref` + `where.coordinates` を fixed に昇格させる。

### 5.2 スコープ

#### IN（PR-9 本体で実装）
1. **Places API client**（`lib/alter-morning/placesSearch.ts`）
   - Google Places API を第一選択（将来 provider 差し替え可能な interface）
   - `SearchQueryDraft` → `textSearch` / `nearbySearch` query 変換
   - 候補 list の型 `PlaceCandidate[]`
2. **conversationStatus 遷移**
   - `search_handoff_blocking` → `search_candidates_presented` → `stable`
3. **user-facing 化**
   - 「甲府駅近くのカフェだと〇〇／〇〇があるけど、どこ考えてる？」系の質問生成
4. **UI（MorningPlanCard 拡張）**
   - 「暫定」plan item に候補 list をぶら下げる
   - ユーザー選択で fixed 昇格
5. **reducer action 追加**
   - `SEARCH_CANDIDATES_PRESENTED` / `SEARCH_CANDIDATE_SELECTED`
6. **adapter / promotion 対応**
   - 候補選択後の plan item を `where.coordinates` 込みで描画

#### OUT（PR-9 では実装しない）
- 距離に基づく自動選択（常にユーザー選択を要求）
- Stargazer / Relational によるランキング再重み付け（W2-5 以降）
- 複数候補から Alter が推す 1 つを決める判断ロジック
- 徒歩/車/公共交通の所要時間計算（PR-10 transport）

### 5.3 予想されるコミット階段

```
PR-9 commit 1:  設計書 rev 更新 + Places API key 環境変数予約（ドキュメントのみ）
PR-9 commit 2:  PlaceCandidate 型 + placesSearch client インターフェース（実 API 呼び出しなしスタブ）
PR-9 commit 3:  Google Places API 実装 + cache 層（in-memory + DB TTL）
PR-9 commit 4:  reducer SEARCH_CANDIDATES_PRESENTED / SEARCH_CANDIDATE_SELECTED
PR-9 commit 5:  shadow pipeline に search gate 配線（ready=1 で placesSearch 呼び出し）
PR-9 commit 6:  user-facing 化（質問生成 + morningResponse 拡張）
PR-9 commit 7:  MorningPlanCard 候補 list 描画
PR-9 commit 8:  選択 UI → 後続 turn で fixed 昇格
PR-9 commit 9:  E2E / integration tests
PR-9 commit 10: live preview 修正 + flag gate
PR-9 commit 11: PR-9 flag OFF→ON 切替（CEO 承認）
```

※ あくまで予想。CEO 判断で増減する。

### 5.4 着手前に読むべき設計書

1. **`docs/alter-morning-pr9-places-search-design.md`** — PR-9 骨子（Phase 0 で作成）
2. **`docs/alter-morning-strict-confirmation-design.md`** — §2.9〜2.12（DialogState / SearchQueryDraft / providerRecovery）
3. **`docs/alter-morning-pr8-rev3-implementation-detail.md`** — §3（providerRecovery）§4+（SearchQueryDraft detail）
4. **`docs/alter-morning-roadmap.md`** — 全体階段
5. **`docs/alter-morning-pr10-14-interface-reservation.md`** — PR-10 以降の型予約（PR-9 が壊してはいけない interface）

---

## 6. PR-10 〜 PR-14 の概要（PR-9 完了後）

### 6.1 PR-10 — Transport Staircase
- 2 event 間の移動手段推論（徒歩 / 車 / 公共交通）
- 時間計算（PR-9 の座標を使う）
- 型予約: `docs/alter-morning-pr10-14-interface-reservation.md`
- 並行可: PR-12

### 6.2 PR-11 — Who Staircase
- 人物参照の正規化（「A さん」→ 同定）
- cross-session で一意
- **PR-9 と並行可能**（where と直交）

### 6.3 PR-12 — End Time Staircase
- event の時間範囲を点から区間に（startTime + endTime）
- 並行可: PR-10

### 6.4 PR-13 — Map Pin Rendering
- PR-9 完了後、coordinates 揃った event を map に描画
- CEO ビジョンの第一視覚化

### 6.5 PR-14 — Timeline UI
- event 連結線 + transport 描画
- PR-13（描画層）+ PR-10（経路データ）両方に依存
- CEO ビジョン完成

---

## 7. 不変条件（CEO invariants — 絶対に破らない）

### 7.1 設計原則

1. **phase authority を変更しない** — phase / plan / personalizeHints / hasBlockingUnresolvedSlots は commit 19/20 の確立した authority 以外で触らない
2. **plan.items を fabricate しない** — 空の item / placeholder item を合成してはいけない。items=0 は正当な state
3. **PendingClarify を主状態として再書き戻さない** — reducer が主、PendingClarify は derived view
4. **LLM prompt に DialogState を混入させない** — reducer は rule-based のみ（LLM 汚染リスク防止）
5. **session.dialogState の書き換えは reducer の責務** — route.ts から直接 field を書かない（in-place mutation は narrowing 保持目的の例外として許容）
6. **flag OFF baseline は絶対不変** — 新機能は `ALTER_MORNING_FLAGS.dialogStateV2` で必ず gate
7. **外部 I/O（DB / LLM / Places API）は helper 層では禁止** — pure function を保つ

### 7.2 世界観（Alter voice）

- 短く・柔らかく・断定しない・絵文字なし
- 目安: 14-30 文字
- 禁忌 token: `!`, `！`, 絵文字, 「必ず」「絶対」等の決め付け
- 1 回答 1 箇所厳守、1 文目結論 14-28 文字 + 後半理由
- 参照: `.claude/projects/-Users-haradataishi-Culcept/memory/feedback_alter-voice-constraints.md`

### 7.3 chain ↔ category §1.4 invariant

- `taxonomy.ts` の chain と category は対称性を保つ
- reducer 全 branch で chain ↔ category 整合を維持
- commit 23c でこれを slot-independent preservation の全 branch に拡張した

### 7.4 CEO 承認が必要な行動

- 本番環境へのデプロイ・DB migration 実行
- 課金・決済に関わる変更
- 法務・プライバシーに関わる変更
- 外部サービスとの連携追加・API キー発行（★ **PR-9 の Places API は要承認**）
- ユーザーへの一斉通知・メール送信
- ブランドガイドライン変更
- 対外公開（SNS 投稿・プレスリリース等）

### 7.5 自律実行してよい行動

- コード調査・分析・レビュー
- 開発環境でのテスト実行
- ドキュメント作成・更新
- 設計提案の起草（提案まで。実行は CEO 承認後）
- バグ調査と修正案の作成
- ローカル環境でのビルド確認

---

## 8. State Safety Rule（CLAUDE.md 2026-04-01 制定）

**禁止操作**（Hook で機械的にブロック）:
- `git stash`
- `git reset --hard`
- `git checkout --`
- `git clean -f`
- `git restore .`

**コミット頻度**: 30 分以上の作業、または 3 ファイル以上の変更後は必ずコミット。

**ファイル個別指定**: `git add -A` / `git add .` 禁止。必ず `git add <file1> <file2>` で個別指定。

**tsc/build 確認**: stash を使わない。そのまま実行するか、WIP コミット後に実行。

**セッション終了時**: 未コミット変更がある場合は `git commit -m "WIP: <内容>"` を作成してから終了。

---

## 9. 実行 tips

### 9.1 よく使うコマンド

```bash
# ブランチ確認
git log --oneline -5

# 特定ディレクトリのテストのみ
npx vitest run tests/unit/alter-morning/

# 特定ファイルのテスト
npx vitest run tests/unit/alter-morning/dialog/providerLatch.test.ts

# tsc（全体。route.ts が巨大なので heap を増やす）
NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit

# tsc エラーを特定ファイルで grep
npx tsc --noEmit 2>&1 | grep "app/api/stargazer/alter/route.ts"
```

### 9.2 Route.ts の読み方（9700+ 行）

巨大ファイル。以下の landmark で navigate:

- L1 〜 L530: imports
- L1459: `let morningSession` 宣言
- L1780 周辺: outer flag 宣言（`bindReasonOuter`, `pipelineAbsorbedOuter`）
- L1990 周辺: catch block（pipeline absorb）
- L2072 周辺: shadow block entry（`if (ALTER_MORNING_FLAGS.dialogStateV2 && ...)`）
- L2078 周辺: PROVIDER_RECOVERED dispatch（commit 24）
- L2119 周辺: shadow advance（targetEventId + advanceDialogState）
- L2234 周辺: providerLatch gate（commit 24）
- L2300 周辺: commit 23 clarifyFallback gate

### 9.3 Pre-existing tsc エラー 15 件（触らない）

以下は PR-9 前から存在するエラー。PR-9 着手時に混乱しないよう記憶しておく:
- `SearchTaskClassification` / `PerspectiveEngineResult.searchTaskClassification` / `SearchTask.explicit|confidence`（PE 系）
- `ModeDecisionReason` union 不整合
- `protective` / `reactive` on `never`
- `personalityCtx` 未定義
- `TrustLevel` 型不一致
- `"skipped" | "fired"` vs `"blocked"` 比較
- fragmentsBefore 系の return 型

### 9.4 テスト実行時間

- `tests/unit/alter-morning/` 全体: 約 3-4 秒 / 1613 tests
- 単一ファイル: 200ms 前後

### 9.5 live preview 観測ログ pattern

shadow pipeline のログ（flag ON 時）:
```
[morning-protocol:v2:bind] reason=ok boundSlot=when phase=clarifying
[dialog-state-v2:targetEventId] prev_focus=event_1 nextPending=event_1 events0=event_1 chosen=event_1 eventChanged=0 canContinueFocus=0 reason=prev_status_not_active_stable
[dialog-state-v2:shadow] status=narrowing narrowStep=2 ready=0 derived_kind=where_pinpoint phase_unchanged=clarifying user_facing_promoted=0
[dialog-state-v2:providerLatch] reason=noop_no_streak streak=0 replaced=0
[morning-protocol] phase=plan_presented items=1
```

provider 失敗時（commit 24 発火時の想定ログ）:
```
[dialog-state-v2:providerFailed] streak=1 status=provider_recovering
[dialog-state-v2:providerLatch] reason=latched_first streak=1 replaced=1 before_len=<N> after_len=24
```

次回成功時:
```
[dialog-state-v2:providerRecovered] streak=0 status=normal
```

---

## 10. CEO の意思決定原則（会話パターン）

### 10.1 絶対的原則

> **「常に、ゴールから逆算して論理的に戦略を立てろ、先を見通せ、変更によって何が変わるのか、どういう影響があるのかを緻密に計算しろ、論理的に思考しろ。」**

> **「迷ったらスピードより整合性と世界観を優先」**

### 10.2 AI への要求

- 報告は日本語
- ステータス絵文字: 🟢 順調 / 🟡 要注意 / 🔴 ブロック中
- 提案まで AI、最終決定は CEO
- 曖昧表現禁止（根拠を示せ: ファイル / 行 / コマンド / 結果）
- 主張には根拠必須

### 10.3 commit メッセージの style

- 日本語タイトル + 詳細本文
- 構造: CEO 指示 → 背景 → 実装 → 検証 → 副作用 → 残課題 → 設計書参照
- 末尾: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`
- HEREDOC で渡す
- 直近の commit 23c, 24 を参考にする

### 10.4 落ちてはならないこと

- **scope 混同**: commit 境界と PR 境界を明確に分ける。「残存課題」と呼ぶ前に「未着手領域」か「bug」かを判定する
- **前提の無検証**: 「この挙動は設計通りか？」を必ず設計書に照合する
- **verification なき断定**: audit → テスト → 修正 → 再 audit のプロトコルを守る
- **過剰な自律**: 外部サービス連携追加・本番デプロイは必ず CEO 承認

---

## 11. 参照すべき docs 一覧（完全版）

### 11.1 Alter Morning 系（最重要）

| ファイル | 役割 |
|---|---|
| `docs/alter-morning-roadmap.md` | **全 PR の階段と依存関係** |
| `docs/alter-morning-strict-confirmation-design.md` | **PR-8 全改訂（rev 1/2/3）の契約書** |
| `docs/alter-morning-pr8-rev3-implementation-detail.md` | **rev 3 実装詳細（Phase 0 追補）** |
| `docs/alter-morning-pr9-places-search-design.md` | **PR-9 骨子（次に読む）** |
| `docs/alter-morning-pr10-14-interface-reservation.md` | PR-10〜14 型予約（PR-9 が壊してはいけない） |
| `docs/alter-morning-protocol-design.md` | protocol 全体設計 |
| `docs/alter-morning-planner-redesign.md` | planner 再設計 |
| `docs/alter-morning-gap-fill-research.md` | gap resolver リサーチ |
| `docs/alter-morning-comprehension-first-wave3-pr7-design.md` | PR-7 設計（前段） |
| `docs/alter-morning-handoff-2026-04-18.md` | 前回引き継ぎ（今回の前身） |
| `docs/alter-morning-handoff-2026-04-22.md` | **本ドキュメント** |

### 11.2 CEO 方針・運用

| ファイル | 役割 |
|---|---|
| `CLAUDE.md` | プロジェクト全体の CEO 方針 / State Safety Rule |
| `docs/decision-log.md` | 意思決定ログ |
| `docs/weekly-priorities.md` | 週次優先事項 |
| `docs/operations-playbook.md` | 日次・週次運用手順 |
| `docs/roles.md` | 全役職の責務 |
| `docs/company-context.md` | 会社概要・ミッション |

### 11.3 MEMORY（`~/.claude/projects/-Users-haradataishi-Culcept/memory/`）

| ファイル | 役割 |
|---|---|
| `MEMORY.md` | プロジェクト全体の継続メモリ（index） |
| `aneurasync-philosophy.md` | 設計思想（最優先原則） |
| `feedback_alter-voice-constraints.md` | Alter voice 制約 |
| `feedback_verification-protocol.md` | 検証プロトコル |
| `feedback_coverage-audit-methodology.md` | Coverage Matrix 監査手法 |
| `feedback_reaudit-approach.md` | 再監査アプローチ |
| `feedback_copy-design-principles.md` | Copy 設計原則 |

### 11.4 Stargazer / HDM（Alter の上位概念）

Alter Morning は Stargazer の一機能。以下を押さえておく:
- `docs/stargazer-human-os-design.md` — Human OS 戦略
- `docs/heart-dynamics-model-v1.md` — HDM v1 設計
- memory: `project_heart-dynamics-model-v1.md`, `project_stargazer-human-os-strategy.md`

---

## 12. 新チャット最初のチェックリスト

```bash
# 1. 現在の branch / HEAD を確認
git log --oneline -5

# 期待: HEAD が e36c8624（commit 24）
#   e36c8624 feat(alter-morning): W3-PR-8 rev 3 commit 24 — provider failure latch
#   9e8a6ebd feat(alter-morning): W3-PR-8 rev 3 commit 23c — reducer slot-independent draft preservation
#   09b8c173 feat(alter-morning): W3-PR-8 rev 3 commit 23 — phase=clarifying items=0 gate
#   747ccbac fix(alter-morning): W3-PR-8 rev 3 commit 22b — client dialogState round-trip
#   6e1e8ff9 fix(alter-morning): W3-PR-8 rev 3 commit 22 — shadow targetEventId 条件付き focus 継承

# 2. テスト PASS 確認
npx vitest run tests/unit/alter-morning/
# 期待: 75 files / 1613 tests PASS

# 3. 未コミットの設計書を確認
git status
# 期待: docs/alter-morning-pr9-places-search-design.md 他が untracked

# 4. 本ドキュメントを読む
cat docs/alter-morning-handoff-2026-04-22.md

# 5. PR-9 設計書を読む
cat docs/alter-morning-pr9-places-search-design.md

# 6. PR-10-14 interface 予約を読む（PR-9 が壊してはいけない境界）
cat docs/alter-morning-pr10-14-interface-reservation.md
```

---

## 13. PR-9 キックオフ時の最初の確認事項（CEO に聞くべきこと）

1. **Places API の provider 選定**: Google Places API で確定か？代替（Mapbox / OpenStreetMap Nominatim）も検討するか？
2. **API キー管理**: 環境変数設計と supabase secrets のどちらで管理するか？
3. **課金モデル**: Google Places は有料。月次予算の上限は？cache TTL 設計は？
4. **未 commit 設計書**: `docs/alter-morning-pr9-places-search-design.md` 他を先に landing するか、PR-9 commit 1 で一緒に入れるか？
5. **PR-9 flag 名**: `ALTER_MORNING_FLAGS.placesSearch` 等で独立 gate するか？
6. **初期 beta 範囲**: 検証ユーザー（知人・招待制の数人）で live preview を回すか？
7. **失敗時の fallback**: Places API 失敗時は commit 24 の `computeProviderLatch` と同じ layer で degrade するか、別 layer か？

---

## 14. 本ドキュメントのメタ情報

- **前身**: `docs/alter-morning-handoff-2026-04-18.md`（PR-7 merge 時点）
- **次回更新タイミング**: PR-9 完了時（または別のチャット切替タイミング）
- **更新方法**: 本ファイルを上書きせず `docs/alter-morning-handoff-YYYY-MM-DD.md` で新規作成、前身を「前身」欄に記録
- **不可侵領域**: CEO の方針原則（§10）/ State Safety Rule（§8）は変更禁止

---

**🎯 結論**: commit 24 まで完了。次のアクションは **PR-9 着手**。着手前に §5.4 の docs 5 本を読み、§13 の確認事項を CEO に投げる。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
