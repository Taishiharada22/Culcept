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
| Stage 1 Understand（三段式 M0 共通基盤） | ✅ rev 3.1（2026-04-20、CEO lock 済） | 🔴 未着手（shadow 解禁実行待ち） | — | `docs/coalter-movie-three-stage-design.md` §11-13 |
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

### Step B: Understanding 共通基盤（三段式 M0）

- `lib/coalter/understanding/` 新設（全ファイル、既存 code touch 0）
- shadow モード解禁（CEO lock 2026-04-20 済、実行待ち）
- Gate: U1-U5（`coalter-movie-three-stage-design.md` §6 Phase M0）

**Step B 完了条件**: U1 ≥ 95% / U2 ≥ 90% / U3 中央値 ≥ 0.6 / U4 p95 ≤ 5s / U5 ≥ 95% を合成 fixture + preview 観測で検証。

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

## 6. 改訂履歴

| 日付 | 版 | 変更内容 | 承認 |
|---|---|---|---|
| 2026-04-24 | 初版 | v1.1 `coalter-core-ux-layered-presence.md` が参照する `handoff-2026-04-22.md` の欠落を埋める bridge として新規作成。現在地 snapshot + Step A-E フロー + 正本 doc 一覧 + 凍結線を集約 | CEO 指示（2026-04-24 本セッション） |
| 2026-04-24 | rev 2 | Step A-4 完了反映: live smoke harness の docstring-as-spec を CEO 承認固定として §1 snapshot / §2 Step A-4 + Step A 完了条件 / §3 正本 doc 一覧 を更新。A-4 判定根拠（類似 harness 統一 / 3 判断軸 / 補強 3 点）を明文化。Step A 4 サブタスクすべて完了、Step B 着手条件を満たす状態に遷移 | CEO 指示「(a) docstring 継続 + 最小補強 3 点実施 + bridge doc 更新」（2026-04-24 本セッション） |
