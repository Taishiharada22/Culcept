# CoAlter 実装手順書 — 本流修正系統（Bug-1 / Bug-2 / 三段式）

**作成日**: 2026-04-24
**ステータス**: v0.1 DRAFT（新セッション即時着手版 / CEO 承認待ち）
**起草 branch**: `feat/coalter-three-stage`
**正本依存**:
- `docs/coalter-bug1-emotion-retrieval-design.md` v0.2（Bug-1 設計、不可侵）
- `docs/coalter-movie-three-stage-design.md` rev 3.2（Bug-2 三段式設計、不可侵）
- `docs/coalter-integration-contract-2026-04-24.md` v0.1 rev 1 FIXED（P0 骨格契約、不可侵）
- `docs/coalter-runtime-contract-2026-04-24.md` v0.1 FIXED（P1 runtime 契約、不可侵）
- `docs/coalter-master-design.md` v1.1（全体原則、不可侵）
- `docs/coalter-handoff-2026-04-22.md` rev 6（8 項目 + 付録 A 凍結原典台帳、状態 snapshot）

---

## 0. メタ情報

### 0.1 本書の位置づけ

本書は CoAlter **本流修正系統の実装手順書**である。レイアウト系統（上部レイヤー / Presence UI / Pattern variant / 共有メモリ UI）は `docs/coalter-implementation-plan-layout.md` に委譲する。

**本書は既存設計の実装指示のみ**:
- 既存正本 doc（Bug-1 v0.2 / 三段式 rev 3.2）を**新規解釈しない**。「どの節に従って、どの順で、何を commit するか」のみ記述する
- 新規設計・新規 API 契約の提案は本書では**しない**（必要なら別 doc を起こす）
- 既存コード（`lib/coalter/**` / `app/api/coalter/**` / `tests/**` / `scripts/coalter/**`）の touch 計画のみ記述し、コード本体は commit 時に書く

### 0.2 本書が決めること / 決めないこと

**決める**:
- Step C（Bug-1）/ Step D（Bug-2 三段式）/ Step E（観測）の**実行順序と依存関係**
- 各 Step の**Phase 分解・commit 粒度・変更ファイル・テストケース**
- 各 Phase の**gate 充足条件とロールバック手順**
- kill switch の地図（env flag とデフォルト値の一覧）

**決めない**:
- Bug-1 / 三段式 の設計本体（正本不可侵）
- Pattern / Presence / 上部レイヤーの実装順序（→ layout plan に委譲）
- 数値閾値の具体値（正本が定めた値を踏襲）
- CEO の最終 gate 判定基準の変更（承認済 gate をそのまま使う）

### 0.3 State Safety Rule（絶対遵守）

本実装に着手する新セッションは以下を**機械的に厳守**する:

1. `git stash` / `git reset --hard` / `git checkout --` / `git clean -f` / `git restore .` は一切使わない
2. 30 分以上の作業 or 3 ファイル以上の変更で必ず commit（WIP でも可）
3. `git add -A` / `git add .` 禁止。必ず `git add <file1> <file2>` でファイル個別指定
4. tsc / build 確認のために stash を使わない。そのまま実行 or WIP commit 後に実行
5. セッション終了時、未 commit 変更があれば WIP commit を作って終える

### 0.4 不可触対象（統合契約 §5 整合）

以下は本書の実装中**1 bit も touch しない**:

| 対象 | 正本 | 理由 |
|---|---|---|
| Phase 2 3-mode body | `coalter-phase2-3mode-design.md`（凍結） | 2026-04-19 CEO 6.D 合格、観測母数積み上げ中 |
| Phase 2 凍結 6 項目 | handoff §4.1 | `isExecutorThemeEnabled` / `coalterDispatch` 5 step / `CoAlterCard` / metadata / status API / `resolveActiveFromMetadata` |
| `lib/coalter/webConnector.ts` の `parseMovieScreenings` / `NEAR_WINDOW` / theater 抽出 regex | 三段式 §6 Phase M2 旧実装温存 | Stage 3 Resolve 本稼働まで fallback |
| `lib/coalter/movieOrchestrator.ts` 既存 ranker フロー | 三段式 §6 Phase M2 旧実装温存 | 移行期 maintenance gate の観測対象 |
| `lib/coalter/movieCatalog.ts` | 三段式 §11.A 禁触 | 既存 movie retrieval 挙動の不変性 |
| `scripts/coalter/f6-live-smoke.ts` docstring | Step A-4 確定 | live smoke harness 固定 |

---

## 1. 全体ロードマップ

### 1.1 3-Step の依存関係

```
┌─────────────────────────────────────────────────────────────────┐
│ Step C: Bug-1 修正（感情タグ retrieval skip の構造化解消）          │
│  Phase 1 → Phase 2 → Phase 3（各 1 commit）                     │
│  担当層: Stage 0 Analysis（retrieval gate）                      │
│  完了指標: searchCandidatesCount ≥ 5 中央値（Bug-1 §8.4）         │
└────────────────────────────────────┬────────────────────────────┘
                                     │ C 完了が D の前提
                                     │ （catalog 入力が安定してから M0 に進む）
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step D: Bug-2 三段式実装（M0 → M1 → M2）                          │
│  D-1 = M0: Understanding common base（ドメイン非依存）            │
│  D-2 = M1: Stage 2 Curate movie                                 │
│  D-3 = M2: Stage 3 Resolve（theater fact authority）             │
│  完了指標: B1-B3 構造 gate + H1-H5 品質 gate（三段式 §6）          │
└────────────────────────────────────┬────────────────────────────┘
                                     │ D-1 着地から E-1 が並走可
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step E: 観測（shadow → live → 本番 kill switch flip）              │
│  E-1: B-6 shadow 観測（understandingShadowMovie flag ON）         │
│  E-2: live integration canary（M1 merged 後）                    │
│  E-3: COALTER_THREE_STAGE flip（M2 merged 後、CEO 審議）          │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 依存の論理的根拠

**C → D 順序の根拠**:
- Bug-1 で `searchCandidatesCount` を安定させないと、Bug-2（catalog drop / ranked 0）の真の構造原因と**移行期 maintenance gate**（三段式 §6 層 3）の観測ノイズが切り分けられない
- Bug-1 未修正の状態で三段式に進むと、Stage 0 Analysis の retrieval 不安定が Stage 2 Curate の candidate pool 枯渇と**混線**する（三段式 §6「Bug-1 と Bug-2 の責務分離」違反）

**D-1 → D-2 → D-3 順序の根拠**:
- M0 は Stage 1 Understand（ドメイン非依存共通基盤）、M1 は Stage 2 Curate movie、M2 は Stage 3 Resolve
- M1 の Curate は M0 の `TwoPersonLensToday` を消費して Query Derivation を行う（三段式 §2.3）。M0 未実装では M1 の入力が無い
- M2 の Resolve は M1 の Skeleton UI（WHERE 空欄許容）前提で theater fact を引き受ける（三段式 §2.4 / §6 B1）。M1 未実装では M2 の出力受け皿が無い

**E-1 並走可の根拠**:
- B-5（shadow 並走接続）は既に Step A-β で着地済。flag OFF 既定のため、**D-1 完了を待たずに** preview で shadow 観測が回せる（handoff §3 live smoke 運用束）
- shadow の結果は本流に 1 bit も反映しないため、実装順序に影響しない（三段式 §11.A 整合）

### 1.3 Commit 粒度の原則

| 粒度 | 運用 |
|---|---|
| **1 Phase = 1 commit**（Step C / Step D-1/2/3 各内部 Phase） | Phase 境界でロールバック可能にする |
| **WIP commit を活用** | 30 分/3 ファイル境界を超えたら一旦 WIP。gate 到達で rebase / squash せず WIP をそのまま残してよい（State Safety Rule 優先） |
| **新ファイル追加と既存ファイル修正は同一 commit に含めてよい** | ただし commit msg で「新設ファイル一覧」と「既存修正一覧」を分けて書く |
| **テストは同一 commit に含める** | 「実装 + テスト」で 1 Phase 完結。テスト後置きにしない |

---

## 2. Step C — Bug-1 修正（Phase 1 / 2 / 3）

**正本**: `docs/coalter-bug1-emotion-retrieval-design.md` v0.2
**担当層**: Stage 0 Analysis（retrieval gate）
**前提**: handoff §4.1 / §7 の凍結項目を 1 bit も崩さない
**完了指標**: Bug-1 §8.4 の 4 条件（recall / precision / 回帰なし / narration 接続）

### 2.1 Phase 1 — EMOTION_TAG_LEXEMES 正本化（Commit A）

**目的**: Bug-1 §4.3 の EMOTION_TAG_LEXEMES を唯一の emotion 語彙正本として新設し、既存の散在語彙を deprecated alias として参照元に変換する。

**変更ファイル一覧**:

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/emotion/lexemes.ts` | **新規** | `EMOTION_TAG_LEXEMES` 定数エクスポート（§4.3 語彙表の実装形） |
| `lib/coalter/emotion/types.ts` | **新規** | `EmotionTag` / `EmotionCategory`（mood / indecision / relation / friction） 型定義（§4.1） |
| `lib/coalter/webConnector.ts` | **修正（最小）** | 既存 `NO_SEARCH_PATTERNS` 等の散在正規表現を**そのままで残す**（deprecated alias 化は Phase 3）。Phase 1 では touch しない |

**Phase 1 が webConnector.ts を触らない理由**: webConnector は三段式 §11.A で旧実装温存対象。Phase 1 で alias 化すると maintenance gate（層 3）を同時に動かすことになり、構造原因の切り分けが困難になる。Phase 1 は**新規ファイル追加のみ**で既存挙動を 1 bit も変えない。

**テストケース**:

| ファイル | 種別 | 検証内容 |
|---|---|---|
| `tests/unit/coalter/emotionLexemes.test.ts` | **新規** | ① `EMOTION_TAG_LEXEMES` の全 4 カテゴリが存在 / ② 各カテゴリに最低 5 語含む / ③ 語彙重複 0 件 / ④ export シグネチャ固定 |
| `tests/unit/coalter/emotionTypes.test.ts` | **新規** | `EmotionCategory` が正確に 4 値（mood/indecision/relation/friction）/ `EmotionTag` の型 shape 固定 |

**Gate 充足条件（Phase 1）**:
- [ ] `npx vitest run tests/unit/coalter/emotionLexemes.test.ts tests/unit/coalter/emotionTypes.test.ts` 全 PASS
- [ ] `npx vitest run tests/unit/coalter/` 既存テスト全 PASS（**回帰ゼロ**）
- [ ] `npx tsc --noEmit` エラー 0
- [ ] webConnector.ts / movieRanker.ts / movieOrchestrator.ts の diff = 0 行

**ロールバック**: 新規 2 ファイル（+ テスト 2 ファイル）のみ追加のため、commit 単位 revert で即戻る。

**Commit msg 書式**:
```
feat(coalter): Bug-1 Phase 1 — EMOTION_TAG_LEXEMES 正本化

新設:
- lib/coalter/emotion/lexemes.ts  (Bug-1 §4.3 語彙正本)
- lib/coalter/emotion/types.ts    (Bug-1 §4.1 型定義)
- tests/unit/coalter/emotionLexemes.test.ts
- tests/unit/coalter/emotionTypes.test.ts

既存修正: なし（Phase 1 は新規のみ、挙動 1 bit 不変）

正本: docs/coalter-bug1-emotion-retrieval-design.md v0.2 §4.1 / §4.3
```

### 2.2 Phase 2 — extractEmotionTags + 失敗独立 5 条文（Commit B）

**目的**: Bug-1 §4.3 の `extractEmotionTags` を実装し、§2.3「失敗独立 5 条文」を型と関数の不変性で担保する。

**変更ファイル一覧**:

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/emotion/extract.ts` | **新規** | `extractEmotionTags(text: string): EmotionTag[]` 実装。Phase 1 の LEXEMES を唯一の入力とする。純関数（副作用ゼロ、DB/network touch 禁止） |
| `lib/coalter/emotion/independence.ts` | **新規** | 「失敗独立 5 条文」を**コード水準で担保する guard 関数群**。§2.3 の 5 条文を assertion 化: <br/>- `assertNoSideEffect(fn)`: extract が DB/network を叩かないことを静的に表現（ESLint-disable コメントで明示禁止 + 実行時 try/catch 無しで確認） <br/>- `assertPureDetection(tag, text)`: tag 判定が text のみに依存（外部 state 不参照） <br/>- `assertBoundedRuntime(fn, maxMs)`: 1 回 100ms 以内を保証する wrapper <br/>- `assertFailOpen(fn)`: 失敗時に例外を投げず空配列 `[]` を返す fail-open 保証 <br/>- `assertNoDownstreamSignal(result)`: 返り値が同期呼び出し側以外に信号を発しない |

**テストケース**:

| ファイル | 種別 | 検証内容 |
|---|---|---|
| `tests/unit/coalter/emotionExtract.test.ts` | **新規** | Bug-1 §4.3 の抽出条件: ① mood 語検出 / ② indecision 語検出 / ③ relation 語検出 / ④ friction 語検出 / ⑤ 複数カテゴリ同時検出 / ⑥ 空文字・null・非文字列で `[]` 返却 / ⑦ 100ms 以内 completion |
| `tests/unit/coalter/emotionIndependence.test.ts` | **新規** | 失敗独立 5 条文の**動的検証**: ① extract 内で DB / fetch / localStorage touch ゼロ（モック注入で検出）/ ② 同一 text で 2 回呼び同一結果（決定的）/ ③ 100ms 超過時タイムアウト挙動 / ④ 不正入力で例外を投げず `[]` / ⑤ 返り値が caller 以外に信号を発しない（モック spy） |

**Gate 充足条件（Phase 2）**:
- [ ] Phase 2 新規テスト 2 本 PASS
- [ ] Phase 1 + Phase 2 累積で `tests/unit/coalter/` 全 PASS
- [ ] `npx tsc --noEmit` エラー 0
- [ ] `lib/coalter/webConnector.ts` 依然 touch ゼロ（Phase 3 で対応）
- [ ] `lib/coalter/engine.ts` 依然 touch ゼロ（Phase 3 で対応）

**ロールバック**: Phase 2 追加 2 ファイル（+ テスト 2 ファイル）の commit revert で即戻る。Phase 1 は残る。

**Commit msg 書式**:
```
feat(coalter): Bug-1 Phase 2 — extractEmotionTags + 失敗独立 5 条文

新設:
- lib/coalter/emotion/extract.ts        (Bug-1 §4.3 extractEmotionTags)
- lib/coalter/emotion/independence.ts   (Bug-1 §2.3 失敗独立 5 条文 guard)
- tests/unit/coalter/emotionExtract.test.ts
- tests/unit/coalter/emotionIndependence.test.ts

既存修正: なし（Phase 2 も新規のみ、挙動 1 bit 不変）

正本: docs/coalter-bug1-emotion-retrieval-design.md v0.2 §2.3 / §4.3
```

### 2.3 Phase 3 — decideSearch 再設計 + 3 系統テスト（Commit C）

**目的**: Bug-1 §4.4「decideSearch 再設計（actionable-only）」を実装し、Bug-1 §8.1 の 3 系統テスト matrix（A/B/C）で実証する。**Phase 3 で初めて既存 webConnector / engine を触る**。

**変更ファイル一覧**:

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/webConnector.ts` | **修正** | `decideSearch` を §4.4 の actionable-only 判定に置換。既存 `NO_SEARCH_PATTERNS` は**削除せず deprecated 扱い**で残す（新実装から参照しない。commit msg で deprecation 宣言）。§4.4 の判定順: ① actionable 判定 → ② emotion tags 抽出（Phase 2 extract）→ ③ actionable && !(emotion-only) で retrieval 許可 |
| `lib/coalter/engine.ts` | **修正（最小）** | `decideSearch` の呼び出し点（既存）を維持。新 signature が互換ならこの touch は不要。不可避な場合のみ最小差分 |

**テストケース（Bug-1 §8.1 三系統 matrix）**:

| ファイル | 種別 | 検証内容 |
|---|---|---|
| `tests/unit/coalter/decideSearchSystemA.test.ts` | **新規** | 系統 A: **actionable + emotional**（「今日モヤモヤするけど映画でも見る？」）→ retrieval **実行**（emotion tag が actionable を遮断しない） |
| `tests/unit/coalter/decideSearchSystemB.test.ts` | **新規** | 系統 B: **non-actionable + emotional**（「最近ちょっと疲れる」）→ retrieval **skip**（noise 防止、従来挙動維持） |
| `tests/unit/coalter/decideSearchSystemC.test.ts` | **新規** | 系統 C: **actionable + low-emotion**（「新宿で映画見たい」）→ retrieval **実行**（従来挙動完全維持、回帰ゼロ証明） |
| `tests/unit/coalter/decideSearchIndependence.test.ts` | **新規** | Bug-1 §8.1.5 失敗独立テスト: emotion extract 失敗時に `decideSearch` が fail-open で actionable 判定のみで決断する |
| `tests/unit/coalter/webConnectorNoSearchPatternsDeprecated.test.ts` | **新規** | `NO_SEARCH_PATTERNS` が存在するが新 `decideSearch` から参照されていないことを**構造確認**（symbol-level reference check） |

**Gate 充足条件（Phase 3、= Step C 完了 gate）**:
- [ ] 3 系統テスト A/B/C 全 PASS
- [ ] 失敗独立テスト PASS
- [ ] deprecated 確認テスト PASS
- [ ] `tests/unit/coalter/` 全 PASS（**Bug-1 §8.4 条件 3 回帰ゼロ**）
- [ ] `npx tsc --noEmit` エラー 0
- [ ] preview で **`searchCandidatesCount ≥ 5` 中央値**（Bug-1 §8.4 条件 1 recall）
- [ ] preview で **non-actionable emotional noise skip 維持**（Bug-1 §8.4 条件 2 precision）
- [ ] shadow / live smoke（`npm run coalter:f6-live-smoke` 相当）の本流挙動不変（handoff §3）
- [ ] CEO が narration 接続（Bug-1 §8.4 条件 4）を preview で確認

**ロールバック**:
- Commit C の revert で webConnector / engine が元に戻る
- Phase 1 / Phase 2 の新規ファイルは残るが、誰も import しない dead code 扱い（実害ゼロ）
- Phase 1 / 2 を戻したい場合は commit B / A を順次 revert

**Commit msg 書式**:
```
feat(coalter): Bug-1 Phase 3 — decideSearch 再設計 + 3 系統テスト

既存修正:
- lib/coalter/webConnector.ts  (decideSearch actionable-only 化)
- lib/coalter/engine.ts        (呼び出し互換のみ、差分最小)

DEPRECATION:
- webConnector.NO_SEARCH_PATTERNS は残置するが新 decideSearch から
  参照しない (次 minor で削除審議、CEO 承認必須)

新設（テスト）:
- tests/unit/coalter/decideSearchSystemA.test.ts (actionable + emotional)
- tests/unit/coalter/decideSearchSystemB.test.ts (non-actionable + emotional)
- tests/unit/coalter/decideSearchSystemC.test.ts (actionable + low-emotion)
- tests/unit/coalter/decideSearchIndependence.test.ts (§8.1.5 失敗独立)
- tests/unit/coalter/webConnectorNoSearchPatternsDeprecated.test.ts

正本: docs/coalter-bug1-emotion-retrieval-design.md v0.2 §4.4 / §8.1

Bug-1 §8.4 完了 4 条件 達成:
  ① recall   — searchCandidatesCount ≥ 5 中央値 (preview)
  ② precision — non-actionable emotional skip 維持
  ③ 回帰ゼロ — tests/unit/coalter/ 全 PASS
  ④ narration 接続 — CEO preview 確認済
```

### 2.4 Step C 完了後の状態

- `lib/coalter/emotion/**` が正本として存在し、他層から参照可能
- `lib/coalter/webConnector.ts` の `decideSearch` が actionable-only で動作
- `EMOTION_TAG_LEXEMES` が唯一の emotion 語彙正本、他の散在正規表現は deprecated
- preview / live smoke で `searchCandidatesCount ≥ 5` 中央値観測
- **Step D に進む前提が揃う**（Bug-1 / Bug-2 責務分離成立、三段式 §6「境界線」整合）

---

## 3. Step D — Bug-2 三段式実装（D-1 / D-2 / D-3）

**正本**: `docs/coalter-movie-three-stage-design.md` rev 3.2
**前提**: Step C 完了（Bug-1 §8.4 4 条件達成）
**完了指標**: 三段式 §6 Phase M2 構造 gate B1-B3 + 品質 gate H1-H5

### 3.1 D-1（= Phase M0）— Understanding common base

**正本節**: 三段式 §2.2 / §6 Phase M0 / §11（M0 固定事項）/ §12（M0 最初の報告 plan artifact）

**目的**: ドメイン非依存の 2 人理解統合エンジン `lib/coalter/understanding/` を新設する。Stage 1 Understand は movie / food / travel 共通の基盤となる。

#### D-1 Phase 分解（5 commit）

**D-1-a: 型定義**

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/understanding/types.ts` | **新規** | 三段式 §12.2 の `TwoPersonLensToday` 型定義 + `ObservationBundle` / `PersonFusion` / `RelationalFusion` / `FairnessAdjustment` 型 |
| `tests/unit/coalter/understanding/types.test.ts` | **新規** | 型 shape 固定テスト（`TwoPersonLensToday` 必須フィールド / optional フィールドの network） |

**D-1-b: ObservationBundle 収集**

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/understanding/observationBundle.ts` | **新規** | Alter / Stargazer / CoAlter / conversation / 環境 を DB から引く（§2.2 / §12.1）。**read-only**、write 禁止 |
| `tests/unit/coalter/understanding/observationBundle.test.ts` | **新規** | ① 5 source 全収集 / ② 欠損 source で `null`（throw しない） / ③ RLS 遵守（他ペア read ゼロ） |

**D-1-c: Fusion レイヤー**

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/understanding/personFusion.ts` | **新規** | 個人理解融合（Alter + Stargazer）→ `PersonFusion` |
| `lib/coalter/understanding/relationalFusion.ts` | **新規** | 関係理解融合（CoAlter + conversation）→ `RelationalFusion` |
| `lib/coalter/understanding/fairnessAdjustment.ts` | **新規** | Fairness Ledger の今日のバイアス → `FairnessAdjustment`（master §2 原則 3 準拠） |
| `tests/unit/coalter/understanding/personFusion.test.ts` | **新規** | 2 人分の fusion / 欠損データ fallback |
| `tests/unit/coalter/understanding/relationalFusion.test.ts` | **新規** | relational signal 統合 / conversation 空時の挙動 |
| `tests/unit/coalter/understanding/fairnessAdjustment.test.ts` | **新規** | ledger 値に基づく bias 反映 |

**D-1-d: todayReader（LLM 軽量プロンプト）**

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/understanding/todayReader.ts` | **新規** | 軽量 LLM todayReader（§2.2）。Fusion 結果 → `todayReading` を生成 |
| `lib/coalter/understanding/index.ts` | **新規** | `runUnderstanding(pairId): TwoPersonLensToday` エントリーポイント。§11.C diagnostics ログ emit |
| `tests/unit/coalter/understanding/todayReader.test.ts` | **新規** | snapshot 安定性（同一入力 → 同一出力、temperature=0 or low）/ 欠損 source fallback |
| `tests/unit/coalter/understanding/indexEntry.test.ts` | **新規** | `runUnderstanding` E2E mock / latency p95 ≤ 5s（§6 U4） |

**D-1-e: flag / diagnostics 整合**

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/flags.ts` | **修正** | `understandingLiveEnabled` 新設（既定 OFF、env `COALTER_UNDERSTANDING_LIVE`）。既存 `understandingShadowMovie` と独立 |
| `tests/unit/coalter/understandingLiveFlag.test.ts` | **新規** | flag invariant（既定 OFF、env で ON） |

#### D-1 Gate 充足条件（= Phase M0 gate、三段式 §6）

- [ ] U1: `TwoPersonLensToday` 生成成功率 ≥ 95%（ユニットテスト mock で 95% 以上、実 preview は E-1 で測る）
- [ ] U2: `sourcedFrom` 埋まり率 ≥ 90%
- [ ] U3: `understanding_confidence` 中央値 ≥ 0.6（実 preview は E-1）
- [ ] U4: latency p95 ≤ 5s（unit test でタイムアウト wrapper で担保）
- [ ] U5: ドメイン間一貫性 ≥ 95%（D-2 の movie / 将来 food で計測、D-1 単体では movie 1 ドメインのみ）
- [ ] §11.A 禁触対象（movieOrchestrator / webConnector / movieCatalog）に diff ゼロ

#### D-1 ロールバック

- `understandingLiveEnabled` flag OFF に倒す（D-1-e で既定 OFF）→ 本番影響ゼロ
- コード側 revert は commit 単位で D-1-e → D-1-d → D-1-c → D-1-b → D-1-a の順

### 3.2 D-2（= Phase M1）— Stage 2 Curate (movie)

**正本節**: 三段式 §2.3 / §6 Phase M1

**目的**: movie 固有の Stage 2 Curate を実装する。Skeleton UI（WHERE 空欄）を許容し、Bug-2 §6 B1「Stage 2 は `missing_where` hard drop を起こさない」を**構造的に**担保する。

#### D-2 Phase 分解（4 commit）

**D-2-a: Query Derivation**

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/movie/queryDerivation.ts` | **新規** | `TwoPersonLensToday` → movie 軸クエリ変換（§2.3.1） |
| `tests/unit/coalter/movie/queryDerivation.test.ts` | **新規** | lens → query の決定性 / veto_guard 反映 |

**D-2-b: Candidate pool + Soft Availability Filter**

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/movie/candidatePool.ts` | **新規** | 3 source candidate pool（§2.3.2）+ Soft Availability Filter（CEO 指示 B） |
| `tests/unit/coalter/movie/candidatePool.test.ts` | **新規** | 3 source 統合 / soft filter 閾値 / empty pool fallback |
| `tests/unit/coalter/movie/candidatePoolNoMissingWhereDrop.test.ts` | **新規** | **B1 構造 gate 担保**: pool 内で `missing_where` hard drop が発生しないことを symbol-level + runtime で検証 |

**D-2-c: LLM Ranker with Personality-Rooted Narration**

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/movie/curator.ts` | **新規** | §2.3.3 LLM Ranker。`sourcedFrom` を narration が引用する構造（§6 G6） |
| `tests/unit/coalter/movie/curator.test.ts` | **新規** | narration 5 要素充足（§6 G3: personA_lens / personB_lens / relational_fit / today_hook / veto_guard） |
| `tests/unit/coalter/movie/curatorNarrationCoverage.test.ts` | **新規** | narration 固有情報率 ≥ 80%（§6 G4、LLM-judge mock）/ lens 由来引用率 ≥ 70%（§6 G6） |

**D-2-d: UI 連携 + kill switch**

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/flags.ts` | **修正** | `movieCuratorLiveEnabled` 新設（既定 OFF、env `COALTER_MOVIE_CURATOR_LIVE`） |
| `lib/coalter/movieOrchestrator.ts` | **修正（最小）** | flag ON 時のみ curator ルート、OFF 時は完全既存フロー。**§11.A 禁触（既存 behavior 不変）**は OFF 既定で成立 |
| `tests/unit/coalter/movieCuratorLiveFlag.test.ts` | **新規** | flag invariant |
| `tests/unit/coalter/movieOrchestratorShadowInvariance.test.ts` | **新規** | flag OFF で既存 orchestrator 挙動 1 bit 不変 |

**WHERE 空欄 Skeleton UI**: 実 UI 組込は layout plan §5（Stage 3 preview E2E）で扱う。D-2 では**データ構造として WHERE を nullable** にするのみ。

#### D-2 Gate 充足条件（= Phase M1 gate、三段式 §6）

- [ ] G1: top-1「観たい」率 ≥ 50%（E-2 canary で測る、D-2 単体ではサンプル shadow）
- [ ] G2: Stage 3 到達率 ≥ 60%（D-3 完了後に測る、D-2 単体では未達）
- [ ] G3: narration 5 要素充足率 ≥ 90%（unit test で 100% 必須、実 LLM では shadow で測る）
- [ ] G4: narration 固有情報率 ≥ 80%（shadow / E-2 canary）
- [ ] G5: Soft filter 精度（D-3 完了後）
- [ ] G6: narration の lens 由来引用率 ≥ 70%（shadow / E-2 canary）
- [ ] **B1 構造 gate**: Stage 2 Curate コードに `missing_where` reject ロジックが存在しない（コードレビュー + `candidatePoolNoMissingWhereDrop.test.ts` で検証）
- [ ] flag OFF 既定で `tests/unit/coalter/` 全 PASS（Step C 累積回帰ゼロ）

#### D-2 ロールバック

- `movieCuratorLiveEnabled` flag OFF（既定）→ 本番影響ゼロ
- `COALTER_THREE_STAGE=false`（grand kill switch、§M3）が利用可
- コード revert は commit 単位 d → c → b → a

### 3.3 D-3（= Phase M2）— Stage 3 Resolve（theater fact authority）

**正本節**: 三段式 §2.4 / §6 Phase M2 / §6 Phase M2 Bug-2 接続（B1-B3 / H1-H5）

**目的**: Stage 3 Resolve で theater fact を公式サイト → eiga.com → Yahoo映画 → EXA の 3+1 段 fallback で取る。Concentric Area Expansion（Tier 0→1→2）を実装し、Tier 2 fail 時は誠実に別作品再起動する。

#### D-3 Phase 分解（5 commit）

**D-3-a: theaterResolver 基盤**

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/movie/theaterResolver.ts` | **新規** | 3+1 段 fallback fetcher（公式 → eiga → Yahoo → EXA）。§2.4.2 準拠 |
| `tests/unit/coalter/movie/theaterResolver.test.ts` | **新規** | mock fetch で 3+1 段 fallback の順序 / timeout / fallback 選択の決定性 |
| `tests/unit/coalter/movie/theaterResolverFallbackSource.test.ts` | **新規** | `stage3FallbackSourceUsed` diagnostics の正確性（§6 新規 diagnostics） |

**D-3-b: adjacency table + Concentric Area Expansion**

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/movie/adjacencyTable.ts` | **新規** | 主要駅 50 の adjacency data（§6 Phase M2）。静的データとして JSON / TS 定数化 |
| `lib/coalter/movie/areaExpansion.ts` | **新規** | Tier 0 → 1 → 2 のループ実装（§2.4.1） |
| `tests/unit/coalter/movie/adjacencyTable.test.ts` | **新規** | 50 駅全収録 / 対称性（A→B と B→A が一致） |
| `tests/unit/coalter/movie/areaExpansion.test.ts` | **新規** | Tier 0 success / Tier 0 fail → Tier 1 拡張 / Tier 1 fail → Tier 2 拡張 / Tier 2 fail → alt signal |

**D-3-c: Tier fail state + 別作品再起動 narration**

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/movie/tierFailNarration.ts` | **新規** | §2.4 / §4 の `{ state: "tier2_fail", message: "この近辺では上映が弱い", altSignal: true }` 生成。2 人理解を根拠に謝る narration（§0.5 存在論） |
| `tests/unit/coalter/movie/tierFailNarration.test.ts` | **新規** | §6 B3: tier2_fail state の構造 + narration が lens 由来を引用 |

**D-3-d: Stage 3 prefetch 投機実行**

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/movie/stage3Prefetch.ts` | **新規** | Stage 2 top 候補に対して Stage 3 prefetch（§6 Phase M2）。budget 内で投機的並列 fetch |
| `tests/unit/coalter/movie/stage3Prefetch.test.ts` | **新規** | budget 超過時の切り捨て / race condition 安全性 |

**D-3-e: flag / orchestrator 組込 + diagnostics**

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `lib/coalter/flags.ts` | **修正** | `COALTER_THREE_STAGE` grand kill switch 新設（既定 OFF、env `COALTER_THREE_STAGE`） |
| `lib/coalter/movieOrchestrator.ts` | **修正** | flag ON 時のみ三段式（Stage 2 Curate + Stage 3 Resolve）、OFF 時は現行単一段。§6「旧実装の温存条件」整合 |
| `lib/coalter/movie/diagnostics.ts` | **新規** | `[CoAlter] movie.stage3.diagnostics` 名前空間（§6 新規 diagnostics 5 フィールド） |
| `tests/unit/coalter/threeStageGrandKillSwitch.test.ts` | **新規** | flag OFF で現行単一段が 1 bit 不変 |
| `tests/unit/coalter/movie/stage3Diagnostics.test.ts` | **新規** | 5 新規フィールド emit の正確性 |

#### D-3 Gate 充足条件（= Phase M2 gate、三段式 §6）

**構造 gate（B1-B3）**:
- [ ] B1: Stage 2 Curate コード内に `missing_where` reject ロジックが**存在しない**（`grep -n "missing_where" lib/coalter/movie/curator.ts lib/coalter/movie/candidatePool.ts` → 0 件、D-2 gate で既達）
- [ ] B2: `theaterResolver.ts` に 3+1 段 fallback（公式 → eiga → Yahoo → EXA）が実装
- [ ] B3: Tier 2 fail 時 `{ state: "tier2_fail", altSignal: true }` を返し、narration + 別作品提案を出す

**品質 gate（H1-H5）**:
- [ ] H1: Tier 0 劇場確定率 ≥ 55%（E-2 canary）
- [ ] H2: Tier 0+1 劇場確定率 ≥ 75%（E-2 canary）
- [ ] H3: Tier 2 fail 再起動率 ≥ 60%（E-2 canary、手動評価補足）
- [ ] H4: 1 分 budget 超過率 ≤ 10%（shadow + E-2 canary）
- [ ] H5: narration 一貫性（Stage 2 narration + Tier 2 謝罪 narration が同人格）→ 手動評価 PASS

**移行期 maintenance gate（層 3、M2 期間中の preview 観測）**:
- [ ] `searchCandidatesCount ≥ 5` 中央値（Step C 累積維持）
- [ ] `catalogCount ≥ 5` 中央値
- [ ] `rankedCount ≥ 3` 中央値
- [ ] `missingWhereRejectCount ≤ catalog の 30%`（旧 ranker 観測）

#### D-3 ロールバック

- `COALTER_THREE_STAGE=false`（grand kill switch）→ 即時現行単一段に戻る
- commit 単位 revert は D-3-e → d → c → b → a

### 3.4 Step D 完了後の状態

- `lib/coalter/understanding/` が稼働、movie 以外（food / travel）にも適用可能な共通基盤
- `lib/coalter/movie/` が Stage 2 Curate + Stage 3 Resolve を持つ
- `COALTER_THREE_STAGE=true` で三段式 live 起動可能（CEO 審議後のみ flip）
- Bug-2 構造 gate B1-B3 充足、品質 gate H1-H5 は shadow / canary で実測へ
- 旧実装（webConnector `parseMovieScreenings` / movieRanker `missing_where` drop）は温存、Stage 3 本稼働後に別 rev で削除審議

---

## 4. Step E — 観測（B-6 shadow → live canary → 本番 flip）

**前提**: D-1 完了で E-1 並走可、D-3 完了で E-2 canary 可、E-2 合格で E-3 本番 flip 審議

### 4.1 E-1 — B-6 shadow 観測（understandingShadowMovie ON）

**正本**: handoff §3 「live smoke 運用束」6 harness table / B-5 runtime shadow 接続（既着地）

**目的**: D-1 完成後に `COALTER_UNDERSTANDING_SHADOW_MOVIE=true` を preview 環境で有効化し、U1-U5（§6 M0 gate）を**実分布**で測る。本流挙動は 1 bit も変わらない（shadow 並走、§11.A 整合）。

**手順**:
1. preview 環境で `COALTER_UNDERSTANDING_SHADOW_MOVIE=true` 設定
2. 既存 preview プロトコル（handoff §7.4 「preview 30 件 full observation gate」）で movie セッション 30 件収集
3. `[CoAlter] understanding.diagnostics` ログ（§11.C）を集計 → U1-U5 判定
4. 結果を `docs/coalter-handoff-2026-04-22.md` §8 に rev 追記（observation log）

**Gate**: U1 ≥ 95% / U2 ≥ 90% / U3 ≥ 0.6 / U4 ≤ 5s / U5 ≥ 95%

**ロールバック**: `COALTER_UNDERSTANDING_SHADOW_MOVIE=false`（env 外す）→ 即 pre-B-5 状態

### 4.2 E-2 — live integration canary（D-3 完了後）

**正本**: 三段式 §6 Phase M2 / master §5 CEO 承認原則

**目的**: D-3 完成後、**限定ペア**（CEO 指定の内部ペア or invite-only preview ペア）で `COALTER_THREE_STAGE=true` を有効化し、H1-H5 品質 gate を実測する。

**手順**:
1. 限定ペア対象に `COALTER_THREE_STAGE=true` 設定（pair-scoped env or feature gate）
2. 最低 20 セッション観測
3. `[CoAlter] movie.stage3.diagnostics` 集計 → H1-H5 判定
4. H1-H5 のいずれか未達 → 該当 D-3 Phase に戻る（gate 未達分析 doc 起草）

**Gate**: H1 ≥ 55% / H2 ≥ 75% / H3 ≥ 60% / H4 ≤ 10% / H5 手動 PASS

**ロールバック**: `COALTER_THREE_STAGE=false` → 即現行単一段

### 4.3 E-3 — 本番 flip 審議（CEO 審議必須）

**目的**: E-2 canary 合格後、全ペアに対する `COALTER_THREE_STAGE=true` の本番 flip を CEO が審議する。

**CEO 審議材料**:
1. E-1 U1-U5 実測結果
2. E-2 H1-H5 実測結果 + 構造 gate B1-B3 コードレビュー結果
3. 旧実装（webConnector `parseMovieScreenings` / movieRanker `missing_where` drop）の削除時期案
4. narration 一貫性の人手 QA レポート（CoAlter 存在論 §0.5 に照らした）

**CEO 承認後**:
- 本番 env に `COALTER_THREE_STAGE=true` 反映（CEO 直接判断、Ops Unit 実行）
- `docs/decision-log.md` に記録（`[日付] [Build Unit] [三段式本番 flip] [承認: CEO]`）
- Phase M3「監査と定着」に移行（§6 Phase M3）

---

## 5. Kill switch 地図（全 flag 既定一覧）

| env key | flag | 既定 | ON 時の挙動 | 影響範囲 |
|---|---|---|---|---|
| `COALTER_BOOKING_HANDOFF_ENABLED` | `bookingHandoffEnabled` | **ON** | 既存（candidate detail → bottom sheet） | Phase A legacy |
| `COALTER_STAGE1_LIVE` | `stage1LiveEnabled` | OFF | /api/coalter/invoke で Stage 1 呼ぶ | invoke response |
| `COALTER_STAGE1_NARRATION` | `stage1NarrationEnabled` | OFF | todayReading を narration に反映 | proposal card |
| `COALTER_PAIR_ONBOARDING` | `pairOnboardingEnabled` | OFF | pair activate 時 seed row / cold-start 保護 | activate / invoke |
| `COALTER_FOOD_LENS_WIRED` | `foodLensWired` | OFF | engine food branch で Stage 1 起動 | food 経路 |
| **`COALTER_UNDERSTANDING_SHADOW_MOVIE`** | `understandingShadowMovie` | **OFF** | **E-1 で ON**: movie V2 と shadow 並走 | movie shadow（本流不変） |
| `COALTER_FOOD_TIER_LOOP` | `foodTierLoop` | OFF | foodOrchestrator で tier loop | food |
| `COALTER_U3_ABOLITION_*` | `isU3AbolitionActive(theme)` | OFF（全 theme） | per-theme で NO_SEARCH_PATTERNS 撤廃 | webConnector |
| **`COALTER_UNDERSTANDING_LIVE`** | `understandingLiveEnabled` (D-1-e 新設) | **OFF** | runUnderstanding を実流で使う | understanding 層 |
| **`COALTER_MOVIE_CURATOR_LIVE`** | `movieCuratorLiveEnabled` (D-2-d 新設) | **OFF** | movieOrchestrator で curator ルート | movie curate |
| **`COALTER_THREE_STAGE`** | grand kill switch (D-3-e 新設) | **OFF** | 三段式全体（M1+M2）起動 | movie 全体 |

**原則**:
- 新規 flag は全て**既定 OFF**で merge
- CEO 承認なしに env で ON しない（preview 観測のみ例外）
- 本番反映は Ops Unit が CEO 承認を受けて実行

---

## 6. 全体 Gate / 完了条件

### 6.1 Step C 完了判定（Bug-1）

| 条件 | 充足方法 |
|---|---|
| ① recall | preview `searchCandidatesCount ≥ 5` 中央値 |
| ② precision | preview で non-actionable emotional noise skip 維持 |
| ③ 回帰ゼロ | `tests/unit/coalter/` 全 PASS |
| ④ narration 接続 | CEO preview 確認 |

### 6.2 Step D 完了判定（Bug-2 三段式）

| 条件 | 充足方法 |
|---|---|
| M0 gate U1-U5 | E-1 shadow 実測 |
| M1 gate G1-G6 | E-2 canary 実測 |
| M2 構造 gate B1-B3 | コードレビュー + unit test |
| M2 品質 gate H1-H5 | E-2 canary 実測 |
| 移行期 maintenance gate | preview 継続観測 |

### 6.3 Step E 完了判定

| 条件 | 充足方法 |
|---|---|
| E-1 U1-U5 達成 | preview 30 件観測 |
| E-2 H1-H5 達成 | 限定ペア 20 セッション観測 |
| E-3 本番 flip | CEO 審議承認 |

### 6.4 本流修正系統 全完了

- Step C / D / E 全て gate 達成
- 旧実装（webConnector `parseMovieScreenings` / movieRanker）削除審議が CEO 承認
- handoff §8 北極星 3 指標が三段式構造下で再解釈済（§6 層 2）

---

## 7. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| Bug-1 Phase 3 で webConnector 修正中に回帰 | Step D 着手不能 | Phase 1/2 新規、Phase 3 最小差分。`tests/unit/coalter/` 全 PASS を commit gate |
| D-1 Understanding の LLM 出力が不安定 | U1-U5 未達 | temperature 低 / snapshot test / shadow 観測で実分布確認 |
| D-2 Curate の narration が lens 由来を引用しない | G4 / G6 未達 | prompt 明示 + unit test で LLM-judge mock / E-2 canary で人手 QA |
| D-3 theaterResolver 公式サイト差異大 | B2 未達 | 3+1 段 fallback で吸収 / EXA が最後の砦 / `stage3FallbackSourceUsed` で観測 |
| COALTER_THREE_STAGE flip 後に本番不具合 | ユーザー影響 | kill switch で即戻す / 限定ペア canary で事前検出 / 旧実装温存で fallback |
| State Safety 違反（stash / reset --hard） | 変更消失 | §0.3 機械的遵守 / Hook でブロック / 3 ファイル毎 WIP commit |

---

## 8. 本書の触らない境界線（再掲）

| 領域 | 正本 | 凍結理由 |
|---|---|---|
| Phase 2 3-mode body | `coalter-phase2-3mode-design.md` | CEO 6.D 合格済 |
| Phase 2 凍結 6 項目 | handoff §4.1 | 不可侵 |
| `webConnector.parseMovieScreenings` / `NEAR_WINDOW` / theater regex | 三段式 §6 旧実装温存 | Stage 3 本稼働まで fallback |
| `movieOrchestrator` 既存 ranker フロー | 三段式 §6 旧実装温存 | 移行期 maintenance gate |
| `movieCatalog.ts` | 三段式 §11.A | 禁触 |
| Core UX / Presence / Pattern / 上部レイヤー | layout plan に委譲 | 本書スコープ外 |
| 統合契約 4 契約点不可侵条文 | integration §1.6 / §2.6 / §3.6 / §4.5 | rev 追記禁止 |
| Runtime 契約 3 論点不可侵条文 | runtime §1.7 / §2.9 / §3.7 | rev 追記禁止 |

---

## 9. 着手順序（新セッション即時開始版）

新セッションはこの順序で 1 日単位に進める:

1. **Day 1**: Phase 1 commit（EMOTION_TAG_LEXEMES 正本化）→ PASS 確認
2. **Day 1-2**: Phase 2 commit（extractEmotionTags + 失敗独立）→ PASS 確認
3. **Day 2-3**: Phase 3 commit（decideSearch 再設計 + 3 系統テスト）→ PASS 確認
4. **Day 3-4**: CEO preview レビュー（narration 接続確認）→ Step C 完了判定
5. **Day 4-5**: D-1-a 型定義 → D-1-b ObservationBundle → D-1-c Fusion → D-1-d todayReader → D-1-e flag（各 commit、累積回帰ゼロ）
6. **Day 5-6**: E-1 shadow 開始（preview 30 件観測、並行して D-2 着手）
7. **Day 6-8**: D-2-a → D-2-b → D-2-c → D-2-d（各 commit）
8. **Day 8-10**: D-3-a → D-3-b → D-3-c → D-3-d → D-3-e（各 commit）
9. **Day 10-12**: E-2 canary（限定ペア 20 セッション）→ H1-H5 判定
10. **Day 12+**: E-3 CEO 審議 → 本番 flip or gate 未達で D-2/D-3 戻し

**マイルストーン**:
- Milestone M-C: Step C 完了（Bug-1 §8.4 4 条件）
- Milestone M-D0: D-1 完了（U1-U5 shadow 観測可能）
- Milestone M-D1: D-2 完了（構造 gate B1 達成）
- Milestone M-D2: D-3 完了（構造 gate B2/B3 達成）
- Milestone M-E: H1-H5 合格 → CEO 本番 flip 審議

---

## 10. 改訂履歴

| 日付 | 版 | 変更内容 | 承認 |
|---|---|---|---|
| 2026-04-24 | v0.1 DRAFT | 初稿起草。Step C / D / E を Phase 分解、commit 粒度 / 変更ファイル / テスト / gate / ロールバック / kill switch 地図を網羅 | CEO 承認待ち |

---

**🎯 結論（v0.1 DRAFT）**: 本書は Bug-1 / Bug-2 / 三段式の**実装手順書**。既存正本 doc（Bug-1 v0.2 / 三段式 rev 3.2 / 統合契約 v0.1 rev 1 / runtime 契約 v0.1）を**新規解釈せず**、Phase 分解と commit 粒度で実装順序を固定する。新セッションは本書冒頭から順に commit を重ねれば、Step C/D/E と E-1/E-2/E-3 が論理的に達成される。レイアウト系統は `docs/coalter-implementation-plan-layout.md` に委譲。
