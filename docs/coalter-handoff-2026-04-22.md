# CoAlter 実装セッション Handoff — Bridge (2026-04-22 参照名 / 2026-04-24 作成)

**作成日**: 2026-04-24
**ステータス**: bridge（snapshot、以後の変更は rev 追加方式）
**ファイル名の経緯**:

`docs/coalter-core-ux-layered-presence.md` v1.1 の §0.2 L23 / §12.2 L728 / §13.4 L785 から参照されていた `handoff-2026-04-22.md` が実ファイルとして存在しなかった。参照整合を保つため本ファイル名を `coalter-handoff-2026-04-22.md` とするが、**実作成日は 2026-04-24**。本文に従う。

**本書の目的**:

v1.1 側が参照している **Step A-E フロー** の正本として機能する。本書は以下を固定する:

1. 現在地 (設計完了マイルストーンの snapshot)
2. Step A-E フロー (executor 実装の正式順序)
3. 正本 doc 一覧 (領域ごとの唯一の参照先)
4. 凍結線と不可触線 (触ると既存が壊れる箇所)

**本書が決めないこと**:
- 新設計の起草 (bridge なので既存 doc の連携整理のみ)
- 実装の手順書 (各 doc が固有にもつ実装計画を本書は上書きしない)
- CEO の意思決定 (本書は CEO 発言の集約)

---

## 1. 現在地 snapshot（2026-04-24 時点）

| 対象 | 設計 | 実装 | 観測 | 正本 doc |
|---|---|---|---|---|
| Bug-1（retrieval 感情 gate 誤動作） | ✅ v0.2 固定（2026-04-24） | 🔴 未着手 | — | `docs/coalter-bug1-emotion-retrieval-design.md` |
| Bug-2（theater `missing_where` drop） | ✅ 三段式 rev 3.2 で接続（2026-04-24） | 🔴 未着手（M2） | — | `docs/coalter-movie-three-stage-design.md` §6 Phase M2 Bug-2 接続 |
| P2 food G6 拡張 | ✅ 完成（CEO 6.D 合格 2026-04-19） | ✅ 完成 | 🟡 母数積み上げ中 | `docs/coalter-phase2-3mode-design.md` |
| Phase 2 3-mode body | ✅ 完成・凍結（2026-04-19 CEO 6.D 合格） | ✅ 完成 | 🟡 母数積み上げ中（観測インフラは完成） | `docs/coalter-phase2-3mode-design.md` |
| Phase 1.5.6 Travel 差別化 | 🟡 研究 doc のみ、実装設計未起草 | 🔴 未着手 | — | `docs/coalter-phase-1-5-6-differentiation-research.md` |
| Stage 1 Understand（三段式 M0 共通基盤） | ✅ rev 3.1（2026-04-20 CEO lock） | 🟢 shadow 実装完成（M0-1〜M0-7A + M1-1a/1b/C3b）+ 🟢 runtime 接続完成（2026-04-24 B-5、movie branch に flag-gated fire-and-forget で並走接続済） | 🟡 合成 U1-U5 初回計測済（U4/U5 PASS、U1/U2/U3 FAIL として凍結）/ 🔴 preview 実測は **全実装完了後に延期**（CEO 方針 2026-04-24） | `docs/coalter-movie-three-stage-design.md` §11-13 |
| Stage 2 Curate（三段式 M1 movie） | ✅ rev 3 設計（§2.3） | 🔴 未着手 | — | `docs/coalter-movie-three-stage-design.md` §2.3 / §6 Phase M1 |
| Stage 3 Resolve（三段式 M2 movie） | ✅ rev 3 設計 + rev 3.2 Bug-2 接続 | 🔴 未着手 | — | `docs/coalter-movie-three-stage-design.md` §2.4 / §6 Phase M2 |
| P3（travel reflect 等） | 🔴 未設計 | 🔴 未着手 | — | — |
| P4 | 🔴 未設計 | 🔴 未着手 | — | — |
| P5 | 🔴 未設計 | 🔴 未着手 | — | — |
| live smoke harness | ✅ docstring-as-spec 固定（2026-04-24 Step A-4 判定） | ✅ 実装済（2026-04-20、docstring 補強 2026-04-24） | — | `scripts/coalter/f6-live-smoke.ts` |
| Core UX（Presence / 3 Mode / 上部レイヤー） | ✅ v1.1 固定（2026-04-24 CEO 合意） | 🔴 Stage 0.5 以降 未着手 | — | `docs/coalter-core-ux-layered-presence.md` |

**凡例**: ✅ 完成 / 🟡 進行中 or 一部完成 / 🔴 未着手 / — 該当なし

**精密化ポイント**:
- 「Phase 2 観測は完成扱い」とは **観測インフラ・現時点までの母数積み上げは完成** の意。母数そのものは時間経過で継続的に積み上がる（Phase 2 凍結は維持されるため、新機能追加による分岐は発生しない）。
- Bug-1 / Bug-2 は **設計完了**。実装は Step C / Step D に分配される（§2 参照）。
- P3 / P4 / P5 は **未設計** かつ **観測待ち**。Phase 2 観測の母数が揃う前に P3 設計に着手すると、観測値を設計に反映する機会を失う。
- **Stage 1 Understand は 4 段で観測する**（rev 3 で明示化）: 設計 / shadow 実装 / runtime 接続 / U1-U5 実測。初版 bridge (rev 2) は単に「🔴 未着手（shadow 解禁実行待ち）」と書いたが、実態は shadow 実装済（M0-1〜M0-7A + M1 wiring proof 含む commit 系列 + 15 unit test PASS）・runtime 未接続・U1-U5 未実測の混成状態であるため、rev 3 で 4 段分離に訂正した。Step B（§2）はこの 4 段のうち **runtime 接続 / U1-U5 実測 を埋める昇格判定フェーズ** として再定義される。2026-04-24 の rev 5 時点: 設計 ✅ / shadow 実装 ✅ / runtime 接続 ✅（B-5 着地）/ U1-U5 実測 🟡（合成計測済・preview 実測は全実装完了後に延期）。
- **観測フェーズは全実装完了後に回す**（CEO 方針 2026-04-24）: Stage 1 U1-U5 の preview 実測 (B-6) / Bug-1 北極星 / Bug-2 北極星 を Stage 2/3 と切り離して piecemeal に測ると、Stage 2/3 実装後の実態と乖離する。**Step C (Bug-1) / Step D (Bug-2 M1/M2) 完了後に Step E で 1 回で正しく取る**。B-6 はこの Step E 観測 window に統合する。

---

## 2. Step A-E フロー（本書の正式定義）

v1.1 §12.2 / §13.4 が参照していた Step A-E を、本 bridge で以下のとおり定義する。

### Step A: 設計整理（2026-04-24 本セッションで完了予定）

| サブタスク | 状態 | 成果 |
|---|---|---|
| A-1. Bug-1 設計完遂 | ✅ 完了 | `coalter-bug1-emotion-retrieval-design.md` v0.2 固定 |
| A-2. Bug-2 接続監査 → 三段式 doc 追記 | ✅ 完了 | `coalter-movie-three-stage-design.md` rev 3.2 |
| A-3. handoff 欠落処理（本 bridge doc 作成） | ✅ 完了（2026-04-24） | `coalter-handoff-2026-04-22.md`（本書、rev 2） |
| A-4. live smoke doc 化要否判断 | ✅ 完了（2026-04-24） | docstring 継続 + 補強 3 点（Scenarios 観測目的 / 失敗挙動 / CEO 改訂欄）+ 本 bridge 更新。独立 doc は作成しない |

**Step A 完了条件**: 上記 4 サブタスクすべて完了。**2026-04-24 達成**。Step B へは Bug-1 / Bug-2 / bridge / live smoke の 4 artifact が固定された状態で進む。

**A-4 判定根拠**（2026-04-24）:
- 類似 harness 9 本中 8 本が docstring-as-spec で統一（例外は `stage1-observe.ts` のみで、値コピペ先として doc が必要な特殊用途）
- (1) docstring だけで正本として足りるか → 足りる（手順・scenarios・観測目的・失敗挙動・改訂履歴すべて埋め込み可）
- (2) 本線 handoff で参照される価値があるか → 本書 §1 / §3 からの相互参照で十分
- (3) 変更頻度が高いか → 低い（2026-04-20 作成以後、本 rev 2 まで本体変更 0 回）
- 追加で実施した補強 3 点: Scenarios 観測目的 / 失敗時挙動 / CEO 承認改訂履歴欄 + Spec 位置づけ header

### Step B: Understanding 共通基盤の昇格判定フェーズ（re-defined rev 3, 2026-04-24）

**再定義の趣旨**: 初版 bridge (rev 2) は Step B を「`lib/coalter/understanding/` 新設 + shadow モード解禁」と書いたが、実態を精査した結果、M0-1〜M0-7A + M1 wiring proof までの commit 系列が既に landed しており、`lib/coalter/understanding/` は 17 ファイル実装済 + 15 unit test (132 cases) 全 PASS 状態であった。Step B の本質は「作ること」ではなく **既存 M0 実装を昇格条件で判定すること**。よって以下の 6 サブタスクに構造化する。

初版 bridge で混同されていた「shadow モード解禁」は実際には別々の 2 つの作業を含む:
- **shadow harness / replay での観測実行**（既存 code touch 0、自律範囲）
- **runtime shadow 並走接続**（既存 code touch 発生、CEO 承認必要）

rev 3 ではこの 2 つを明示分離する。

| サブタスク | 状態 | 作業内容 | 自律/承認 |
|---|---|---|---|
| B-1. M0 実装健全性確認 | ✅ 完了（2026-04-24） | `npx vitest run tests/unit/coalter/understanding/` → 14 files / 132 tests PASS。`npx tsc --noEmit` → understanding 配下 error 0（Calendar/Stargazer 既存負債は Step B 外） | 自律 |
| B-2. U1-U5 計測導線整備 | ✅ 完了（2026-04-24） | `scripts/coalter/understanding-u-gate.ts` 新設。既存 code touch 0、diagnostics emitter に patch せず `runUnderstanding` 戻り値 + `judgeOutcome` 再呼び出し + harness 側 `performance.now()` で U1-U5 を集計。`--legacy` で先頭 10 件（recover mode 偏重）、default は stride=5 mode 横断の 2 モードを用意 | 自律 |
| B-3. 合成観測の初回報告 | ✅ 完了（2026-04-24） | 10 pair × 3 session = 30 runs を legacy / mode-cross 両方で計測。両方とも U4/U5 PASS、U1/U2/U3 FAIL。FAIL の原因は合成 fixture の source_coverage / confidence 水準が judgeOutcome 閾値（0.5/4）と構造的に乖離していること（mode 偏りではない） | 自律 |
| B-4. bridge doc snapshot 訂正 | ✅ 完了（2026-04-24） | 本 rev 3 で §1 Stage 1 Understand 行を 4 段分離 + §2 Step B を昇格判定フェーズに書き直し + §6 rev 3 追加 | 自律 |
| B-5. runtime shadow 並走接続 | ✅ 完了（2026-04-24） | `lib/coalter/flags.ts` に新 flag `understandingShadowMovie`（env `COALTER_UNDERSTANDING_SHADOW_MOVIE`、default OFF）。`lib/coalter/engine.ts` に `runMovieShadowUnderstanding` 関数を新設（`buildFoodLensIfEnabled` の pattern 模倣）。`buildDecisionCard` クロージャの movie V2 経路に `void ... .catch(() => {})` で fire-and-forget 呼び出し hook。§11.A 禁止対象（`movieOrchestrator.ts` / `webConnector.ts` / `movieCatalog.ts`）は 1 bit も未変更。flag OFF で call flow 完全不変。`tests/unit/coalter/understandingShadowFlag.test.ts` で default OFF + env-driven 挙動を固定。coalter suite 71 files / 1117 tests PASS | CEO 承認済（2026-04-24 本セッション） |
| B-6. preview 実測 | 🟡 パラメータ承認済 / 実行 deferred | パラメータ固定（下記 B-6 執行ポリシー）。**実行は Step C + Step D 完了後の Step E 観測 window に統合**（CEO 方針「観測フェーズは全実装完了後」2026-04-24）。preview env ON/OFF + 5 pair × 3 invoke × 72h のランブックは本 bridge doc で固定し、Step E 着手時に適用する | CEO 承認済（2026-04-24 パラメータ） / 実行時に Step E 連動 |

**Step B α 範囲**（本セッション自律実行）: B-1 → B-4 → B-2 → B-3（CEO 承認 2026-04-24 の順序）
**Step B β 範囲**（α 完了 + CEO 承認後）:
- B-5 ✅ 完了（2026-04-24 実装着地）
- B-6 🟡 パラメータ承認済、実行は **Step E 観測 window に統合**（下記 B-6 執行ポリシー参照）

**Step B 完了条件（再定義、rev 5 時点）**:
- α 範囲完了条件: 合成 fixture で U1-U5 初回値が計測され、計測値と harness が bridge doc に記録される（閾値到達は β 範囲で判定）→ ✅ 達成（rev 4）
- β 範囲完了条件:
  - **B-5（runtime 接続）**: flag OFF で既存 behavior 完全不変 + flag ON で shadow 並走が起動すること → ✅ 達成（rev 5、flag invariant test + 既存 1111 tests PASS 継続）
  - **B-6（preview 実測）**: Step E 観測 window 内で `U1 ≥ 95% / U2 ≥ 90% / U3 中央値 ≥ 0.6 / U4 p95 ≤ 5s / U5 ≥ 95%` を達成。未達なら設計・実装に戻る（判定タイミング = Step E 実行時）
- **Step B 全体**: α + β（実装まで）完了。β の実測完了判定は Step E と統合。

#### B-6 執行ポリシー（CEO 承認 2026-04-24、実行 deferred）

**承認された執行パラメータ**（Step E 着手時にそのまま適用）:

| 項目 | 固定値 |
|---|---|
| pair 選定 | **B 案: 既存内部ペアのみ**（知人招待制の既存テストペア / 自己ペア等、内部スコープ限定） |
| 測定規模 | **5 pair × 3 invoke × 72h 以内** |
| 環境 | **`feat/coalter-three-stage` の Preview 限定**（本番・他ブランチ Preview には波及させない） |
| 有効化方法 | Preview デプロイの env に `COALTER_UNDERSTANDING_SHADOW_MOVIE=true` + `COALTER_UNDERSTANDING_DIAGNOSTICS=1` を設定。不要になれば env から外せば即座に pre-B-5 状態に戻る |
| 実行タイミング | **Step C + Step D 完了後**（= Step E 観測 window） |
| 延期理由（CEO 方針 2026-04-24） | Stage 2/3（Step C Bug-1 / Step D Bug-2 M1/M2）未実装で Stage 1 単独で U1-U5 を測ると、フルスタック完成後の実態と乖離する。観測は全実装完了後に 1 回で正しく取る |

**執行ランブック**（Step E で実行する手順、本 bridge で固定）:
1. Step C + Step D 完了を確認（D-1 / D-2 が H1-H5 + B1-B3 合格）
2. `feat/coalter-three-stage` ブランチの Preview env に B-6 用 2 変数を追加、デプロイ
3. 内部ペア 5 組に 72h window で 3 invoke ずつ movie 相談を走らせる（= 合計 15 diagnostics emit 目標）
4. `coalter.understanding.diagnostics.v1` analytics / `[CoAlter] understanding.diagnostics` console.info を回収
5. U1-U5 を集計し Step B β 完了条件（`U1 ≥ 95% / U2 ≥ 90% / U3 p50 ≥ 0.6 / U4 p95 ≤ 5s / U5 ≥ 95%`）と比較
6. 判定は CEO。未達時の判断 3 択:
   - (a) α で凍結した「合成 fixture lift」を実施（testkit 側を preview 実測で得た分布に近づける）
   - (b) `OUTCOME_THRESHOLDS` を preview 実測分布に合わせて再校正
   - (c) Understanding 側の collector / fusion / todayReader を再設計
7. 観測終了後、Preview env の B-6 用 2 変数を削除（flag OFF に戻す）

#### Step B α-range 初回計測結果（rev 4, 2026-04-24）

**harness**: `scripts/coalter/understanding-u-gate.ts`
**fixture**: `buildExtendedMatrix()` 50 件 から 10 pair を抽出 × 3 session = 30 runs（same-bundle）

| 指標 | 閾値 | legacy 版（先頭 10 件, recover only） | mode-cross 版（stride=5, default） | 判定 |
|---|---|---|---|---|
| U1 strict (success only) | ≥ 95% | 0.0% [0/30] | 0.0% [0/30] | ❌ FAIL |
| U1 loose (success+degraded) | — | 100.0% [30/30] | 100.0% [30/30] | — |
| U2 (sourcedFrom ≥2 両者) | ≥ 90% | 0.0% [0/30] | 0.0% [0/30] | ❌ FAIL |
| U3 (confidence p50) | ≥ 0.60 | 0.460 | 0.400 | ❌ FAIL |
| U4 (latency p95) | ≤ 5000ms | 0.1 ms | 0.2 ms | ✅ PASS |
| U5 (same-bundle min-Jaccard ≥ 0.95) | ≥ 95% | 100.0% [10/10] | 100.0% [10/10] | ✅ PASS |

**breakdown (両版共通)**: success=0 / degraded=30 / failed=0 / crashed=0

**構造的発見**:
1. **U1/U2/U3 FAIL は fixture mode の偏りではない**。legacy (recover のみ) と mode-cross (5 mode 横断) で結果がほぼ同一。つまり fixture 全体が judgeOutcome の閾値 (`DEGRADED_CONFIDENCE_FLOOR=0.5`) と `source_coverage ≥ 2 カテゴリ` 要求に対して構造的に低い水準にある
2. **すべてが degraded に集まる**。`failed` も `crashed` もゼロで、`confidence < 0.5` かつ `missing_domains < 4` を満たす degraded バンドに全件集中
3. **U4 は桁違いに余裕（0.2ms << 5000ms）**。rule-based なので当然だが、β 範囲で LLM 経由 (shadow でも todayReader LLM 版は走る設計) になったときに再計測要
4. **U5 PASS は same-bundle determinism の検証まで**。真の cross-session 安定性は β 範囲（preview 実測）で評価する（α 注釈どおり）

**論点（CEO 裁定要請）**:
- A. **合成 fixture を source_coverage / confidence 高めに改良**（testkit 側を lift）するか
- B. **閾値 / outcome 判定ロジックを実測ベースで再調整**（index.ts の `OUTCOME_THRESHOLDS` 見直し）するか
- C. **β 範囲（B-5/B-6）に進み preview 実測で「現実がどのレベルか」を取ってから A/B を判断**するか

論理的推奨は **C**。A を先行すると fixture を「想定」で lift することになり preview 実測との乖離理由が不明になる。B も同様に preview 値なしに閾値を動かすと gate の意味が失われる。C の結果で A / B どちらが必要か（または両方不要か）が決まる

### Step C: retrieval gate 修正（Bug-1 実装）

- `coalter-bug1-emotion-retrieval-design.md` v0.2 §9 Phase 分けに従う
- Phase 1: `EMOTION_TAG_LEXEMES` 正本化（`NO_SEARCH_PATTERNS` は deprecated alias）
- extractEmotionTags + 失敗独立 5 条文（v0.2 §2.3）の実装
- Gate: Bug-1 §8.4「Bug-1 が直った」4 条件（recall / precision / 回帰なし / narration接続）

**Step C 完了条件**: preview 本カウントで `searchCandidatesCount ≥ 5` が中央値で満たされ、§8.1 の 3 系統テスト matrix（actionable+emotional / non-actionable+emotional / actionable+low-emotion）が PASS。

### Step D: executor 実装（v1.1 §13.4 の「Step D executor 実装フロー」）

Bug-1 修正後（Step C 完了後）に順次:

| D-サブ | 内容 | 正本 doc | Gate |
|---|---|---|---|
| D-1. Bug-2 実装（三段式 M1 Curate） | Stage 2 Curate 新設 / Soft Availability Filter / LLM Ranker | `coalter-movie-three-stage-design.md` §6 Phase M1 | G1-G6 |
| D-2. Bug-2 実装（三段式 M2 Resolve） | Stage 3 Resolve 新設 / Concentric Area Expansion / theaterResolver | `coalter-movie-three-stage-design.md` §6 Phase M2 | H1-H5 + 構造 gate B1-B3（§6 M2 Bug-2 接続） |
| D-3. P2 food G6 拡張観測継続 | 既存観測の母数積み上げ（新機能追加なし） | `coalter-phase2-3mode-design.md` | Phase 2 観測インフラで継続測定 |
| D-4. P3 travel reflect 設計着手 | 未設計なので設計先行（Phase 2 母数が揃った後に着手） | 新規 doc 起草 | — |
| D-5. P4 / P5 | P3 完成後に CEO 判断 | — | — |

**重要**: D-1 / D-2 は Bug-1 実装（Step C）が完了してから着手。Step C 未完では retrieval が構造矛盾のままであり、M1/M2 の preview 観測値が信頼できない。

**Step D 完了条件**: D-1 + D-2 が H1-H5 + B1-B3 を満たす。D-3 は Phase 2 観測母数が設計判断に足る量に達した時点。

### Step E: 観測と判定

- preview 30 件 full observation gate（`coalter-handoff-2026-04-19-retrieval-investigation.md` §7.4 継承）
- 監査対象:
  - Bug-1 北極星: `searchCandidatesCount ≥ 5`（Step C の直接成果）
  - Bug-2 北極星: `catalogCount ≥ 5 / rankedCount ≥ 3 / missingWhereRejectCount ≤ 30%`（M2 未着手の間は現行実装の maintenance として観測。M2 完成後は構造 gate B1 により `missingWhereRejectCount` は 0 に収束）
  - **Stage 1 Understand U1-U5（B-6 統合 rev 5, 2026-04-24）**: B-6 執行ポリシー（§2 Step B 内）に従い、5 pair × 3 invoke × 72h で `U1 ≥ 95% / U2 ≥ 90% / U3 p50 ≥ 0.6 / U4 p95 ≤ 5s / U5 ≥ 95%` を測定。CEO 方針「観測フェーズは全実装完了後」に従い、Step C / Step D 完了後のこの window で初めて preview 実測を行う
  - Phase 2 3-mode body: 母数積み上げに従い追加集計
- 判定と次フェーズ移行は CEO 承認

---

## 3. 正本 doc 一覧

| 領域 | 正本 doc | rev / 日付 | 状態 |
|---|---|---|---|
| CoAlter 全体原則 | `docs/coalter-master-design.md` | 既存 | 生存 |
| Core UX（Presence / 3 Mode / 上部レイヤー） | `docs/coalter-core-ux-layered-presence.md` | v1.1（2026-04-24） | 生存・参照元 |
| Phase 2 3-mode（Action Mode） | `docs/coalter-phase2-3mode-design.md` | 既存（2026-04-19 CEO 6.D 合格で凍結） | 凍結 |
| Phase 1.5.6 Travel 差別化 | `docs/coalter-phase-1-5-6-differentiation-research.md` | 既存 | 生存（設計先行） |
| Bug-1（retrieval 感情 gate） | `docs/coalter-bug1-emotion-retrieval-design.md` | v0.2（2026-04-24 固定） | 固定 |
| 映画ドメイン三段式（Bug-2 接続含む） | `docs/coalter-movie-three-stage-design.md` | rev 3.2（2026-04-24） | 固定（rev 追加方式） |
| Presence State UI Spec | `docs/coalter-presence-state-ui-spec.md` | v0.1（2026-04-24） | 生存 |
| 発話文面テンプレート | `docs/coalter-speech-template.md` | v0.1（2026-04-24） | 生存 |
| **P0 統合契約**（canonical surface / 直交 / Stage 1 vs S4 / Pattern 命名） | `docs/coalter-integration-contract-2026-04-24.md` | v0.1 rev 1 FIXED（2026-04-24） | 固定（不可侵、正本間衝突時のみ rev 例外） |
| 前 handoff（retrieval investigation 原典） | `docs/coalter-handoff-2026-04-19-retrieval-investigation.md` | 2026-04-19 | 凍結・原典 |
| 本 bridge handoff | `docs/coalter-handoff-2026-04-22.md`（本書） | 2026-04-24 作成 | snapshot |
| live smoke harness spec | `scripts/coalter/f6-live-smoke.ts`（docstring） | 2026-04-20 作成 / 2026-04-24 docstring 補強 | docstring-as-spec 固定（CEO 承認 2026-04-24 Step A-4） |

**live smoke 運用束**（CEO 追補 2026-04-24）: 以下 6 本はすべて「手動限定 / staging-frozen」の同一運用ルール下にある。spec 正本は `f6-live-smoke.ts` の docstring、他 5 本はその運用束の同格メンバーとして扱う:

| harness | 役割 |
|---|---|
| `scripts/coalter/f6-live-smoke.ts` | foodTier 本線 live smoke（spec 正本） |
| `scripts/coalter/f6-live-replay.ts` | foodTier 録画 replay |
| `scripts/coalter/shadow-real-api.ts` | understanding shadow を real API で起動 |
| `scripts/coalter/shadow-replay.ts` | understanding shadow の録画 replay |
| `scripts/coalter/step4-preflight.ts` | M0 step4 flip 前の preflight |
| `scripts/coalter/step4-postflip-smoke.ts` | M0 step4 flip 後の smoke |

**複数 doc の関係**:
- `coalter-core-ux-layered-presence.md` v1.1 と本 bridge は **並行存在**（v1.1 §12.2 明示）。v1.1 は Presence / Action / Theme の 3 軸直交を定義、本 bridge は executor 実装の順序を定義。
- `coalter-movie-three-stage-design.md` rev 3.2 と `coalter-bug1-emotion-retrieval-design.md` v0.2 は **責務分離**（rev 3.2 §6 M2 の「Bug-1 / Bug-2 責務分離まとめ」）。Bug-1 = Stage 0 / Bug-2 = Stage 3。

---

## 4. 凍結線と不可触線

### 4.1 コード凍結線

| 箇所 | 凍結理由 | 期限 |
|---|---|---|
| `lib/coalter/coalterDispatch.ts:141-143` `isExecutorThemeEnabled(theme) => theme === "movie"`（G6） | Phase 2 3-mode body の CEO 6.D 合格時に凍結 | 解除時は CEO 判断 |
| `lib/coalter/webConnector.ts` の `parseMovieScreenings` / `NEAR_WINDOW` / theater 抽出正規表現 | Stage 3 Resolve 稼働までの fallback として必要 | M2 完成後に別 rev で削除審議 |
| `lib/coalter/movieRanker.ts:166` `missing_where` hard drop 条件 | 現行実装の劣化防止 | 同上 |
| `lib/coalter/movieOrchestrator.ts` の既存 ranker 呼び出しフロー | 移行期 maintenance gate の観測対象 | 同上 |
| `lib/coalter/triggerDetection.ts:180` `if (theme === "general" or "schedule") return NONE_RESULT("")` | G6 境界と整合（executor 未実装 theme の NONE 返し） | G6 解除時まで |

### 4.2 設計 doc 不可侵項

| doc | 不可侵箇所 |
|---|---|
| `coalter-core-ux-layered-presence.md` v1.1 | §15.2: §1 / §2.3 / §2.4 / §3.1-3.3 / §8.1 / §11 |
| `coalter-bug1-emotion-retrieval-design.md` v0.2 | §2.3 失敗独立 5 条文 / §2.6 凍結線整合 / §7 非目標 / §10 凍結線整合 |
| `coalter-movie-three-stage-design.md` rev 3.2 | §0.5 CoAlter 存在論 / §1 設計原則 0-5 / §11 M0 固定事項 / §6 M2 Bug-2 接続 構造 gate B1-B3 |
| `coalter-phase2-3mode-design.md` | CEO 6.D 合格の 3-mode body 全体（2026-04-19 凍結） |

### 4.3 運用凍結

- preview 30 件 full observation gate（handoff-2026-04-19 §7.4 継承）: Bug-1 修正（Step C）中も継続
- Phase 2 観測インフラ: KPI SQL / diagnostics フィールドを壊さない

---

## 5. 本 bridge 以後の更新ルール

- 本書は **snapshot**。2026-04-24 時点の状態を固定する。
- 以後の handoff は新ファイル（例: `coalter-handoff-2026-XX-XX.md`）として作成し、本書は凍結・原典として残す。
- 本書の内容訂正が必要な場合は、本書の末尾に「rev 追記」を足す方式とする（既存本文は削除しない）。
- 本書のファイル名 `handoff-2026-04-22.md` は v1.1 参照整合のため維持。以後の bridge は実作成日に従う命名とする。

---

## 付録 A. 前史 / 凍結原典台帳（2026-04-24 CEO 追補）

本流 8 項目（Bug-1 設計 / Bug-2 接続 / handoff bridge / live smoke / core UX / state UI spec / speech template / master-design の内側）の**前史・監査証跡**として残す doc 群。これらは「これから触る本流」ではなく、**参照・監査・昇格判定の後方資産**として、削除禁止 / 改訂禁止で凍結する。本流と同格では扱わない（重み付け保護のため）。

### A.1 Phase 2 前史（Action Mode 凍結の原典群）

| doc | 凍結理由 |
|---|---|
| `docs/coalter-phase2-3mode-design.md` | 2026-04-19 CEO 6.D 合格で body 凍結。本流の「Phase 2 3-mode」として §3 で生存扱いだが、**改訂不可**の凍結原典 |
| `docs/coalter-phase2-freeze-checklist.md` | 6.D 合格時の checklist 証跡 |
| `docs/coalter-phase2-observation-spec.md` | 6.D 合格時の観測仕様（KPI SQL / diagnostics field 定義） |
| `docs/coalter-phase2-preview-scenarios.md` | 6.D 合格時の preview scenario 台帳 |

### A.2 M0 通過前史（三段式 M0 昇格判定の原典群）

| doc | 凍結理由 |
|---|---|
| `docs/coalter-m0-promotion-gates.md` | M0 → M1 promotion gate 定義。master-design から参照される付随 |
| `docs/coalter-m0-6a-challenge-agreement-memo.md` | M0-6a CEO 合意メモ |
| `docs/coalter-m0-6b-code-review.md` | M0-6b code review 記録 |
| `docs/coalter-m0-6b-prerequisites.md` | M0-6b 前提条件台帳 |
| `docs/coalter-m0-6b-zdr-evidence.md` | M0-6b ZDR 証跡 |

### A.3 retrieval / 差別化 前史

| doc | 凍結理由 |
|---|---|
| `docs/coalter-handoff-2026-04-19-retrieval-investigation.md` | 本 bridge の **原典 handoff**。§3 で「凍結・原典」として既記載。本 bridge は本 doc を継承 |
| `docs/coalter-phase-1-5-6-differentiation-research.md` | Phase 1.5.6 Travel 差別化の研究原典。§1 snapshot で「実装設計未起草」状態として生存扱いだが、**研究 doc としては凍結原典** |

### A.4 付随運用資料（本流 6-core doc に直接対応する付録）

| doc | 対応する本流 doc |
|---|---|
| `docs/coalter-internal-pair-consent-2026-04.md` | 本 bridge §2 Step B B-6 執行ポリシー（内部ペア同意記録） |
| `docs/coalter-food-diagnostics.md` | `docs/coalter-phase2-3mode-design.md`（food diagnostics 仕様の実装側記述） |

### A.5 更新ポリシー

- **削除禁止**: 監査証跡として残す必要あり
- **改訂禁止**: 凍結時点の内容を保持する。新しい知見は新 doc として別途作成する
- **参照可**: 本流 doc から「前史として参照」する形式は許容
- **付録台帳の保守**: 新たに凍結原典化する doc が発生したら本付録 A に追記する

---

## 6. 改訂履歴

| 日付 | 版 | 変更内容 | 承認 |
|---|---|---|---|
| 2026-04-24 | 初版 | v1.1 `coalter-core-ux-layered-presence.md` が参照する `handoff-2026-04-22.md` の欠落を埋める bridge として新規作成。現在地 snapshot + Step A-E フロー + 正本 doc 一覧 + 凍結線を集約 | CEO 指示（2026-04-24 本セッション） |
| 2026-04-24 | rev 2 | Step A-4 完了反映: live smoke harness の docstring-as-spec を CEO 承認固定として §1 snapshot / §2 Step A-4 + Step A 完了条件 / §3 正本 doc 一覧 を更新。A-4 判定根拠（類似 harness 統一 / 3 判断軸 / 補強 3 点）を明文化。Step A 4 サブタスクすべて完了、Step B 着手条件を満たす状態に遷移 | CEO 指示「(a) docstring 継続 + 最小補強 3 点実施 + bridge doc 更新」（2026-04-24 本セッション） |
| 2026-04-24 | rev 3 | **Step B 再定義**: Step B 着手前の実態精査で rev 2 snapshot と実装状態の齟齬を発見。`lib/coalter/understanding/` は M0-1〜M0-7A + M1 wiring proof まで commit 済 (17 files) + 15 unit test (132 cases) PASS + tsc understanding 配下 error 0 という状態で、rev 2 の「🔴 未着手（shadow 解禁実行待ち）」は不正確だった。rev 3 で (1) §1 Stage 1 Understand 行を 4 段分離（設計 / shadow 実装 / runtime 接続 / U1-U5 実測）に書き直し、(2) §1 精密化ポイントに 4 段観測原則を追記、(3) §2 Step B を「Understanding 共通基盤の昇格判定フェーズ」に再定義し B-1〜B-6 の 6 サブタスク構造へ置換、(4) 「shadow モード解禁」という二重化した表現を shadow harness 実行 (B-2/B-3 自律) と runtime 並走接続 (B-5 CEO 承認) に分離。B-1 / B-4 は本 rev で完了、B-2 / B-3 は α 範囲として自律続行、B-5 / B-6 は β 範囲として CEO 承認必要 | CEO 指示「(α) 採用 + 順序 B-1 → B-4 → B-2 → B-3、Step B を昇格判定フェーズに再定義」（2026-04-24 本セッション） |
| 2026-04-24 | rev 4 | **B-2 / B-3 完了反映 + α 初回計測記録**: `scripts/coalter/understanding-u-gate.ts` を新設し 10 pair × 3 session = 30 runs で U1-U5 を計測。legacy (先頭 10 件) / mode-cross (stride=5) の両モードで計測し結果を §2 Step B 末尾に記録。U4 (latency p95) / U5 (same-bundle Jaccard) は PASS、U1 (success 率) / U2 (sourcedFrom ≥2) / U3 (confidence p50) は FAIL。全 30 件が `degraded` バンドに集中 = 合成 fixture と判定閾値の構造的乖離。β 範囲（B-5/B-6）で preview 実測を取って fixture 改良 / 閾値調整の要否を判定する方針を論点として提示 | 自律（B-2/B-3 は α 範囲 CEO 承認済） |
| 2026-04-24 | rev 5 | **B-5 完了反映 + B-6 を Step E 観測 window に統合**: (1) B-5 runtime shadow 並走接続が commit `47d57a46` で着地（`COALTER_UNDERSTANDING_SHADOW_MOVIE` flag default OFF / `runMovieShadowUnderstanding` 関数 / movie V2 経路 fire-and-forget hook / §11.A 禁止対象は 1 bit も未変更 / flag invariant test + 既存 1111 tests PASS → 1117 tests PASS）。(2) §1 Stage 1 Understand 行の「runtime 接続 🔴」→「🟢 完了」、「U1-U5 🔴」→「🟡 合成済・preview は全実装完了後に延期」。(3) §1 精密化ポイントに「観測フェーズは全実装完了後」CEO 方針を追記。(4) §2 Step B 表で B-5 ✅ 完了 + B-6 🟡 パラメータ承認済 / 実行 deferred に更新。(5) §2 Step B に「B-6 執行ポリシー」ブロック新設（pair: 内部ペアのみ / 規模: 5 pair × 3 invoke × 72h / 環境: feat/coalter-three-stage Preview 限定 / 実行タイミング: Step E）。(6) §2 Step E の監査対象に Stage 1 U1-U5 （B-6 統合）を追加 | CEO 指示「観測フェーズは全実装完了後に回す + B-6 preview 実測承認 + B 案 + 推奨案 + Preview 限定」（2026-04-24 本セッション） |
| 2026-04-24 | rev 6 | **棚卸し反映 + 前史台帳化 + live smoke 運用束明示化**: CEO 判定（2026-04-24 本流 8 項目棚卸し後）を反映。(1) §3 正本 doc 一覧の live smoke 行直下に「live smoke 運用束」表を追加し `f6-live-smoke` + `f6-live-replay` + `shadow-real-api` + `shadow-replay` + `step4-preflight` + `step4-postflip-smoke` の 6 本を同一運用ルール（手動限定 / staging-frozen）下にあることを明示化（本流 8 項目の項目 6 拡張）。(2) **付録 A「前史 / 凍結原典台帳」を新設**: Phase 2 前史 4 本 / M0 通過前史 5 本 / retrieval・差別化 前史 2 本 / 付随運用資料 2 本を削除禁止・改訂禁止で凍結台帳化。8 項目本流リストを 9 項目化せず、付録として後方資産管理する方針（CEO 判定: 重み付け保護のため） | CEO 指示「棚卸しはほぼ正しい・9 項目化は不要・付録表で管理・項目 6 拡張は採用」（2026-04-24 本セッション） |
