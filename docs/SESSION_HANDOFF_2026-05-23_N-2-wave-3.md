# セッション引き継ぎドキュメント — Phase 3-N-2 Wave 3 + 環境負荷切り分け

**作成日**: 2026-05-23
**作成元 session ID**: `77374bc6-0fa7-44b9-bc2a-a2bb21127ca5`
**作成目的**: 新 session への外科的引き継ぎ (= 開始 → 今 → これから → ゴール の全構造)
**対象 reader**: 新 session の Claude code (= context として直接読む)

---

## 0. ゴール (= 最上位、 これを見失うな)

### 短期ゴール (= このセッション群の目的)
**Phase 3-N-2 phase を閉じる** (= /plan の visual 規約「規約 24-extended」 を plan 全 interactive surface に適用完成)

### 中期ゴール
**/plan complete** (= Phase 3-N の全範囲 = N-1 Home/Plan polish 〜 N-5 まで完了)

### 長期ゴール (= CEO 方針 2026年3月)
**Stargazer 深層観測の完成** (= 性格・判断特性の深層観測エンジンを中核体験として磨き上げる)

### 今月の成功条件 (= CEO 方針)
1. コア機能の完成
2. 初期ユーザー獲得
3. 世界観の確立
4. デプロイ可能状態

### 今はやらないこと (= 永続禁止)
- マネタイズ設計
- 大規模マーケティング
- Counter-Factual generation / Arrival Risk Memory / Routes API
- warning / recommendation / optimization 文言
- amber / orange / red 警告色、 icon / badge / warning box
- localStorage / DB / env / package / dependency 変更
- Deploy readiness / Stargazer pivot / 初期ユーザー獲得 (= /plan complete 前)

---

## 1. セッション開始時点 (= 引き継ぎ前状態)

### 1.1 直前 context (= 前 session の最終状態)

| 項目 | 値 |
|---|---|
| 直前 commit | `94bcd220` (= N-2 wave 2 impl 着地) |
| 直前 doc | `73a7405d` (= N-2 wave 2 plan audit) |
| frozen branches | 56 件 (= K/L/M phase + N-1 + N-2 wave 1) |
| 全 plan tests | 2652 PASS |
| 規約 24 状態 | plan 主要 6 file 9 箇所適用済 (= wave 2 で完成想定だったが border surface に residual 発覚) |

### 1.2 CEO + GPT 指示 (= session 開始時)

> visual smoke 6件とも問題ありません。 PASS として進めてください。
> 次は予定どおり、 1. wave 2 closeout audit、 2. freeze 宣言、 3. wave 3 plan audit の順で進めてください。

### 1.3 CEO 前提 4 点 (= session 全体で維持)

1. **brand color には戻さない**
2. **slate 系 focus-visible 規約を維持**
3. **wave 2 は visual-only closeout として閉じる**
4. **他候補を混ぜず、 wave 3 は残候補 P-002〜P-008 の再評価から始める**

### 1.4 CEO 方針 7 点 (= 思考原則、 全 session で適用)

| # | 原則 |
|---|---|
| ① | 前提を疑い、 ゆっくり考え抜いてからコードを書け |
| ② | 時間をかけて自立推論、 文献等のリサーチ、 分析、 精査、 思考を行え |
| ③ | シンプルな法案から始め、 論理的に思考しろ |
| ④ | 外科的に緻密に修正しろ |
| ⑤ | 目標駆動で、 ゴールから逆算して実行しろ |
| ⑥ | 人間と同等レベルの推論力、 思考力、 組み立て力、 理解力をつけさせる設計をしろ |
| ⑦ | もっと良くなる設計やロジック、 人間の能力を超越できる革新的なアイデアを引き出して、 組み込め |

---

## 2. このセッションで行なった全タスク (= 時系列、 外科的)

### Phase A: Wave 2 Closeout + Freeze + Wave 3 Plan (= CEO 指示 3 step)

#### Step A-1: Wave 2 Closeout Audit (= commit `41461b95`)

- **branch**: `docs/plan-phase3-n-2-wave-2-closeout-audit`
- **doc**: `docs/alter-plan-phase3-n-2-wave-2-closeout-audit.md` (= 234 lines)
- **decision-log 追記**: 「[2026-05-23] [Build/Product] Phase 3-N-2 Wave 2 Closeout Audit」
- **内容**:
  - visual smoke 6 件 PASS 正式記録 (= MapTab card / FlowTab card / CalendarTab card / AddAnchorModal / EditAnchorModal / Tab navigation)
  - freeze 宣言: `94bcd220` を frozen 確定
  - frozen branches **59 件** に増加
  - Visual-Only Closeout 性格明示 (= 機能変更 0)
  - 規約 24 全展開完成 (= plan 主要 6 file 11 箇所統一)
  - GPT 補正反映の 26 regression tests (= 否定系 3 + 肯定系 1)
  - 達成事項言語化: 7 構造的 + 11 数値的 + 4 思想的
- **commit message**: `docs(plan): Phase 3-N-2 Wave 2 Closeout Audit — visual smoke PASS 6 件 + freeze 宣言 + 規約 24 全展開完成 (= plan 全 11 箇所統一)`

#### Step A-2: Freeze 宣言 (= 上記 commit 内に含まれる)

- `feat/alter-plan-phase3-n-2-wave-2-focus-ring-regime-applied` @ `94bcd220` 正式 frozen 記録
- decision-log + 本 closeout audit 内に明示

#### Step A-3: Wave 3 Plan Audit (= commit `051662a9`)

- **branch**: `docs/plan-phase3-n-2-wave-3-plan-audit`
- **doc**: `docs/alter-plan-phase3-n-2-wave-3-plan-audit.md` (= 506 lines)
- **内容**:
  - **§1 残候補 P-002〜P-008 detailed 再評価** (= CEO 明示順序通り、 全 7 件 wave 3 不採用):
    - P-002 spacing: 既に統一、 CEO 具体提案待ち
    - P-003 hint span 位置: smoke PASS で違和感なし
    - P-004 padding: 視覚階層に意味あり
    - P-005 header tone: 各 tab 機能差を反映した意図的差
    - P-006 Modal animation: plan 範囲外
    - P-007 Empty state copy: 既に統一感 (= wave 2 plan で確定済)
    - P-008 swipe boundary: plan 範囲外
  - **§2 重大発見 P-010** (= 規約 24 の border 拡張、 wave 2 P-009 と同 pattern):
    - AnchorFormFields.tsx: 10 places `focus:border-indigo-400 focus:outline-none` (完全違反)
    - ProposalChip.tsx: 1 place `focus:border-slate-400 focus:outline-none` (部分違反、 slate-400 だが focus:)
    - 計 **11 違反箇所**
  - **§3 wave 3 範囲確定**: P-010 のみ (= 2 file 11 line + 8 tests 提案、 後に 10 tests に増加)
  - **§4-7 実装プロトコル + risk 評価 + smoke 計画 + 連続 GO 判定**
  - **§9 CEO 判断 5 件**: 連続 GO 承認 / 「規約 24-extended」 命名 / Option A 採用 / smoke 5 件 / 次の進行
  - **「規約 24-extended」 命名提案**:
    > すべての focus surface (= ring / border / outline) は `focus-visible:` + `slate-*` を使い、 `focus:` (= focus-visible なし) と brand color (= indigo, purple) を組み合わせない。
- **frozen branches**: 60 件
- **commit message**: `docs(plan): Phase 3-N-2 Wave 3 Plan Audit — 残候補 P-002〜P-008 再評価 + 新発見 P-010 + 連続 GO 判定 (= 規約 24-extended border 拡張)`

### Phase B: CEO + GPT 判断 + 補正 1 点

CEO + GPT の判断:
> wave 3 impl 自体は妥当です。 進め方も概ね正しいです。
> ただし、 そのまま盲目的に GO ではなく、 1点だけ補正して進めるのがいいです。

**補正 1 点** (= 本質明示化):
- brand color をやめる (= 必須)
- `focus:` を `focus-visible:` にする (= 必須)
- focus visibility を失わない (= 必須)
- 「slate-300 固定」 自体は目的化しない (= visibility 優先で 300/400 選択)

**test 補正**:
- 否定系 3: `focus:border-indigo` / `focus-visible:border-indigo` / `focus:border-slate` 不在
- 肯定系 1: `focus-visible:border-slate-*` 存在

### Phase C: Wave 3 Impl (= commit `0f6b0ae6` + `c15beff4`)

#### Step C-1: 実装 (= `0f6b0ae6`)

- **branch**: `feat/alter-plan-phase3-n-2-wave-3-focus-border-regime-extended`
- **変更 file** (= 3 件):

| file | 変更 |
|---|---|
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | L 190, 202, 213, 286, 350, 404, 437, 448, 463, 525 (= 10 line) `focus:border-indigo-400 focus:outline-none` → `focus:outline-none focus-visible:border-slate-300` |
| `app/(culcept)/plan/components/ProposalChip.tsx` | L 122 (= 1 line) `focus:border-slate-400 focus:outline-none` → `focus:outline-none focus-visible:border-slate-400` (= **slate-400 維持**、 GPT 補正反映) |
| `tests/unit/plan/planComponentsFocusBorderRegimeWiring.test.ts` | 新規 (= 10 tests、 2 file × 4 invariants + 2 cross-file) |

- **検証結果**:
  - 新規 regression tests: **10 PASS**
  - 全 plan tests: **2662 PASS** (= 2652 → +10、 0 fail)
  - edited files tsc: **clean** (= 0 errors)
  - 違反 grep (= approved scope): **全 0 hit**
  - 肯定系 grep: `focus-visible:border-slate-300` 10 箇所 + `focus-visible:border-slate-400` 1 箇所
- **commit message**: `feat(plan): Phase 3-N-2 Wave 3 — P-010 規約 24-extended (= focus border 拡張、 11 line 修正 + 10 regression tests、 2662 PASS)`

#### Step C-2: decision-log 追記 (= `c15beff4`)

- decision-log に「[2026-05-23] [Build/Product] Phase 3-N-2 Wave 3 Impl 着地」 entry 追加
- **commit message**: `docs(plan): decision-log — Phase 3-N-2 Wave 3 Impl 着地記録 (= P-010 規約 24-extended、 11 line + 10 tests + 残発見 surface)`

### Phase D: GPT 表現補正 3 点 (= commit `4b77d896`)

GPT 指摘:
> `PlaceCandidatesPanel.tsx L453` に `focus-visible:border-indigo-300` が残っているなら、
> 「違反 grep 全0 hit」 「brand color をやめる ✅」 は plan 全体については言い切れません。
> 正確には 「wave 3 approved scope は完了、 ただし residual 1 箇所あり」 です。
> tsc 表現も full pass ではなく `edited files tsc-clean` と表現してください。

#### 補正 3 点

| 項目 | 補正前 | 補正後 |
|---|---|---|
| 違反 grep | 「全 0 hit」 | **「wave 3 approved scope 内で 0 hit、 PlaceCandidatesPanel L 453 は scope 外 residual」** |
| brand color | 「やめる ✅」 | **「approved scope で完了、 plan 全体としては L 453 residual あり」** |
| tsc | 「編集 file 0 errors」 | **「edited files tsc-clean (= full tsc は OOM、 pre-existing errors は無関係)」** |

- **commit message**: `docs(plan): decision-log — Wave 3 Impl entry 表現補正 (= GPT 指摘 3 点反映、 approved scope / plan 全体の論理区別)`

### Phase E: 残発見 surface (= L 453)

**PlaceCandidatesPanel.tsx L 453**: `focus-visible:border-indigo-300`
- 文脈: L 451 `hover:border-indigo-300` と paired (= mouse hover / keyboard focus の visual parity)
- 厳密に GPT 「brand color をやめる」 原則違反 (= keyboard 限定 + brand color)
- wave 3 plan で意図的に scope 外として残した:
  - PlaceCandidatesPanel は wave 2 で focus ring 適用済 file
  - CEO 前提 ④ 「他候補を混ぜず」 遵守 (= wave 3 plan 時点で surface したが含めず)
- **GPT 推奨**: a) wave 3a で 1 line 修正 (= 規約 24-extended をきれいに閉じる)
- **代替**: b) exception 管理 (= 視覚 parity の例外として明示)

### Phase F: CEO Smoke 試行 → 環境問題発覚

CEO: 「ページが重くて応答しないため、 現時点では visual smoke の判定ができません」

CEO 指示: 「smoke 続けても環境負荷の影響を見てしまう、 一旦 smoke 判定は保留」

### Phase G: 切り分け作業 (= 3 軸)

| Q | 結果 | 根拠 |
|---|---|---|
| ① wave 3 が原因か | **No** | 11 line Tailwind class 変更のみ、 runtime 影響 0 |
| ② 環境問題か | **Yes** | swap 81.6% → 87.3%、 Chrome 103% CPU、 Spotlight mds 66.9% + mdworker 30%+ CPU |
| ③ 変更ファイルに runtime 重くする変更があるか | **No** | 新規 component / hook / effect / state / DOM 構造 0 |

### Phase H: `.next` 削除 + dev server 再起動 (= CEO 指示)

CEO 指示: 「`.next` だけ削除して、 dev server を再起動。 ただし安全確認を入れる」

実行 (= 全 5 step、 想定外 0):
1. `pwd` = `/Users/haradataishi/Culcept` 確認 ✅
2. 既存 dev server (PID 13044) SIGTERM 停止 ✅
3. `rm -rf .next` (= 4.5 GB → 0) ✅
4. `npm run dev` 起動 (PID 53698、 port 3000 LISTEN) ✅
5. curl localhost:3000 = HTTP 200、 36590 bytes、 20.7s cold compile ✅

条件遵守:
- Metis 側に一切触らない ✅
- `.next` 以外は削除しない ✅
- git reset / restore / clean / stash 不使用 ✅

### Phase I: 「何も変わらない」 → 根本原因 deep dive

CEO: 「何も変わらない。 ページが応答しない。 コードは全て完成されてる？ 何か根本的な問題がある？」

切り分け結果:

#### dev server log の確認 (= コード正常の証拠)
- 多数の API が **200 応答**:
  - `GET /api/body-color/profile 200 in 9.6s (compile 8.6s)`
  - `GET /api/calendar/month 200 in 9.8s`
  - `GET /api/plan/anchors 200 in 3.3s`
  - `GET /api/baseline 200 in 1783ms 初回 → 195ms 2回目` (= キャッシュ効果)
- `/plan` は HTTP **307 → /login?next=%2Fplan** (= 認証 redirect、 未ログイン時)

#### 環境 memory 悪化
- swap used: 5013.62 MB → **6255.19 MB** (= 87.3%、 thrashing 直前)
- pages free: 3925 (= 約 63 MB)
- swap total 6144 → 7168 MB (= macOS が自動拡張)

#### dev server 自体は軽い
- next-server PID 53698: CPU **0.0%**、 RSS **20 MB**

**結論**: コード正常、 環境 thrashing が「ページ応答しない」 の主因。

### Phase J: マシン特定 + port 確認

CEO: 「chrome は air は localhost:3001 だけ、 mini と連携？ claude 以外重いものはほぼないはず」

#### 発見

| 項目 | 結果 |
|---|---|
| hostname | **MacBook Air M1、 memory 8 GB** |
| mini 連携 | **無し** (= SSH なし、 network mount なし、 全 local disk) |
| port 3000 | next-server LISTEN (= 私が立てた) |
| port 3001 | **誰も LISTEN なし** |
| metis-mvp eslint | **28 分間稼働中** (= PID 46741 + 46758、 40 MB) |
| playwright MCP × 3 個 | 並走 |
| VS Code Helper plugins | 6+ instance |

### Phase K: CEO 修正 → Adobe kill + swap 説明

CEO: 「間違えてた、 port 3000 であってる。 swap って何？ adobe 関連は閉じてください」

#### Adobe kill 実行 (= 12 個)
- 3213 Creative Cloud (main) / 3449 CCXProcess / 3460 AdobeIPCBroker
- 3934 Creative Cloud UI Helper (GPU) / 7745 storage / 7746 network / 7770 Renderer
- 7771 Adobe Desktop Service / 7795 Core Sync / 7805 Crash Processor
- 7786 LiveType Helper / 7823 Creative Cloud Libraries Synchronizer
- → **約 530 MB 解放** (= swap 87.3% → 79.9%)

#### swap 説明 (= CEO 質問)
- 物理 RAM (= Air 8 GB) が満杯になった時、 OS が SSD に逃がす領域
- swap アクセスは RAM の 100-1000 倍遅い
- 今 6.2 GB が swap = ブラウザ rendering / dev server compile が SSD 読み書きで遅延

### Phase L: Claude が主因か検証 (= CEO 質問)

CEO: 「Claude のセッション量が多すぎて圧迫しているってこと？」

#### 全 process RSS ranking で実証

| PID | RSS | Process |
|---|---|---|
| **7980** | **1.04 GB** | **Claude Helper (Renderer)** ← 単独最大 |
| 8453 | 234 MB | Claude code (= 私のセッション) |
| 7853 | 150 MB | Claude desktop app (main) |
| 10733 | 105 MB | Claude code (別 session) |
| 9002 | 94 MB | Claude code (別 session) |
| 409 | 76 MB | WindowServer |
| 758 | 64 MB | 日本語 IME |
| 7857, 7859 | 59 + 34 MB | Claude Helper × 2 |
| 53698 | **24 MB** | **next-server (= 私の dev server)** ← 極めて軽い |

#### Claude 関連合計

| 内訳 | 容量 |
|---|---|
| Claude Helper (Renderer) PID 7980 | 1.04 GB |
| Claude code × 3 session | 433 MB |
| Claude desktop app + Helper × 多数 | 243 MB |
| **Claude 全体合計** | **約 1.72 GB** (= 全 memory の 22%) |

#### Adobe 残り
- 703 ACCFinderSync + 704 Adobe Context Menu Extension: kill signal 受理 (= system extension)
- 7797 acc.installer.v2: **operation not permitted** (= root 権限必要、 影響軽微)

**結論**: **Yes、 Claude が単独最大の memory consumer**。 特に PID 7980 Claude Helper (Renderer) が **1.04 GB** を占有。 dev server は 24 MB のみ = 完全に無罪。 wave 3 コードも無罪。

---

## 3. 現状 (= 引き継ぎ時点)

### 3.1 git 状態

| 項目 | 値 |
|---|---|
| current branch | `feat/alter-plan-phase3-n-2-wave-3-focus-border-regime-extended` |
| HEAD commit | `4b77d896` (= GPT 表現補正反映) |
| commits on branch | 3 (= `0f6b0ae6` impl / `c15beff4` decision-log / `4b77d896` 表現補正) |
| 全 plan tests | 2662 PASS |
| edited files tsc | clean |
| 違反 grep (approved scope) | 0 hit |

### 3.2 frozen branches (= 60 件)

- 既存 56 (= K/L/M phase + N-1 + N-2 wave 1)
- N-2 wave 2 plan audit `73a7405d`
- N-2 wave 2 impl `94bcd220`
- N-2 wave 2 closeout audit `41461b95`
- N-2 wave 3 plan audit `051662a9`
- (wave 3 impl `4b77d896` はまだ **freeze 候補**、 smoke 待ち)

### 3.3 dev server / 環境

| 項目 | 値 |
|---|---|
| dev server PID | 53698 (= next-server v16.1.6) |
| port | 3000 LISTEN |
| ブラウザ smoke | **未実施** (= 環境負荷で判定不能、 CEO 保留) |
| swap | 5724 MB used / 7168 MB total (= **79.9%**) |
| pages free | ~72 MB |
| Claude Helper (Renderer) | **1.04 GB** 占有 (= 主因) |

### 3.4 wave 3 状態

| 項目 | 状態 |
|---|---|
| wave 3 approved scope (= 2 file 11 line) | ✅ **完了** |
| approved scope 内 違反 grep | ✅ 全 0 hit |
| plan 全体での residual | ⚠️ **L 453 1 箇所** (= PlaceCandidatesPanel `focus-visible:border-indigo-300`) |
| N-2 phase 完了 | ❌ **まだ言わない** (= L 453 判断待ち) |
| visual smoke 判定 | ⏸️ **保留** (= 環境負荷で判定不能) |

### 3.5 CEO 判断待ち項目

| # | 項目 |
|---|---|
| 1 | wave 3 visual smoke 5 件 (= 環境改善後) |
| 2 | L 453 残発見の対応: a) wave 3a 1 line 修正 (GPT 推奨) or b) exception 管理 |
| 3 | 環境負荷の解消方法: Claude desktop 再起動 / 不要 chat タブ閉じ / 別 Claude code session kill |
| 4 | wave 3 closeout audit (= smoke + L 453 判断後) |
| 5 | N-2 phase 完了判定 |

---

## 4. これから何をするか (= 残タスク順序)

### 4.1 即時 (= 環境負荷解消)

**最有力**: CEO 手動操作で memory 解放
- a) Claude desktop を **Cmd+Q** で終了 → 再起動 (= 1 GB 解放、 但しこの session は resume 必要)
- b) Claude UI の不要 chat タブを閉じる (= 各タブごとに renderer 持つため数百 MB 解放可能性)

**私から実行可能**:
- c) 別 Claude code session 2 個 kill (= PID 9002 + 10733、 ~199 MB 解放、 別作業停止)
- d) metis eslint kill (= PID 46741 + 46758、 ~40 MB 解放、 28 分稼働の遺物整理)
- e) VS Code 一時終了 (= 数百 MB 解放、 editor 作業中なら影響)

**やってはいけないこと**:
- ❌ PID 7980 (= Claude Helper Renderer) を直接 kill (= **私のセッションも切れる可能性大**)

### 4.2 環境改善後

#### Step 1: CEO Visual Smoke 5 件
1. AddAnchorModal の入力 field click → mouse 後 stuck indigo border 消える
2. AddAnchorModal の入力 field Tab key → slate-300 border 出現
3. EditAnchorModal の入力 field 動作 同上
4. ProposalChip click → mouse 後 stuck slate-400 border 消える (= slate-400 維持、 GPT 補正)
5. 全 plan tab で AddAnchorModal/EditAnchorModal 起動 + 入力動作 機能不変

#### Step 2: smoke 結果に基づく分岐

**PASS の場合**:
- → Step 3 へ

**FAIL の場合**:
- 該当箇所の class 確認 + revert 候補
- 該当 line revert (= 11 line のうち問題の line のみ)

#### Step 3: L 453 残発見の判断 (= CEO 決定)

| 選択肢 | 内容 | 工数 |
|---|---|---|
| **a) wave 3a で 1 line 修正** (= GPT 推奨) | PlaceCandidatesPanel L 453 `focus-visible:border-indigo-300` → `focus-visible:border-slate-300` | 1 line + 1 test 追加 (= 既存 `planComponentsFocusBorderRegimeWiring.test.ts` に PlaceCandidatesPanel を追加) |
| b) exception 管理 | L 453 を「L 451 hover との visual parity 例外」 として明示記録 | doc のみ、 code 触らず |

GPT 推奨は a) (= 1 line で規約 24-extended をきれいに閉じる)。

#### Step 4: Wave 3 Closeout Audit

- branch: `docs/plan-phase3-n-2-wave-3-closeout-audit`
- doc: `docs/alter-plan-phase3-n-2-wave-3-closeout-audit.md`
- 内容:
  - smoke PASS 5 件 (or 修正後) 記録
  - freeze 宣言 (= `4b77d896` を frozen)
  - L 453 判断結果 (= a wave 3a 実施 or b exception 記録)
  - 規約 24-extended 完成状態 (= a 採用なら plan 全 surface 完全統一、 b なら 1 箇所 exception)
  - decision-log 追記

#### Step 5: Wave 3a Impl (= L 453 a 採用の場合のみ)

- branch: `feat/alter-plan-phase3-n-2-wave-3a-focus-border-residual-fix`
- 変更: PlaceCandidatesPanel.tsx L 453 1 line
- 新規 regression test: 既存 test に PlaceCandidatesPanel 追加 (= TARGET_FILES に追加、 §1-§4 invariants 適用)
- smoke 計画: 1 件 (= PlaceCandidatesPanel button focus 動作確認)

#### Step 6: N-2 phase 完了判定

- N-2 wave 1 / 2 / 3 (+ 3a) 全て completed
- 規約 24-extended が plan 全 surface に完成適用
- → **N-2 phase 完了宣言** → 次の N-3 phase へ

### 4.3 N-2 完了後 (= 次 phase = N-3)

CEO 方針確認待ち。 N 完了 plan audit (`95d15ea6`) で定義された 5 phase 分割の N-3 以降:
- N-3: Counter-Factual / Pattern Truth Layer (= 永続禁止リストとの整合確認必要)
- N-4: Home/Plan polish 残り
- N-5: /plan complete 宣言

---

## 5. 重要 file 一覧 (= 引き継ぎに必要な doc)

### 5.1 設計書 (= 全 frozen、 触らない)

| file | 内容 |
|---|---|
| `docs/alter-plan-phase3-n-completion-audit.md` (`95d15ea6`) | N 全責務漏れなき確定 + 5 phase 分割 |
| `docs/alter-plan-phase3-n-1-closeout-audit.md` (`8f1d7432`) | N-1 polish 候補棚卸し 8 件 |
| `docs/alter-plan-phase3-n-2-wave-1-closeout-audit.md` (`8449bb64`) | wave 1 完了 + 規約 24 確立 |
| `docs/alter-plan-phase3-n-2-wave-2-plan-audit.md` (`73a7405d`) | wave 2 計画 + P-009 発見 |
| `docs/alter-plan-phase3-n-2-wave-2-closeout-audit.md` (`41461b95`) | wave 2 完了 + 規約 24 全展開 |
| `docs/alter-plan-phase3-n-2-wave-3-plan-audit.md` (`051662a9`) | wave 3 計画 + P-010 発見 + 規約 24-extended |
| `docs/decision-log.md` | 全意思決定の正本 (= **2026-05-23 entries に wave 2 closeout + wave 3 plan + wave 3 impl + 表現補正の 4 entry**) |

### 5.2 編集対象 file (= wave 3 で変更済、 freeze 候補)

| file | 状態 |
|---|---|
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | wave 3 で 10 line 変更 (`focus:outline-none focus-visible:border-slate-300`) |
| `app/(culcept)/plan/components/ProposalChip.tsx` | wave 3 で 1 line 変更 (`focus:outline-none focus-visible:border-slate-400`) |
| `tests/unit/plan/planComponentsFocusBorderRegimeWiring.test.ts` | 新規、 10 tests |

### 5.3 残発見 file (= 未着手、 L 453 a) 採用なら touch)

| file | 内容 |
|---|---|
| `app/(culcept)/plan/components/PlaceCandidatesPanel.tsx` L 453 | `focus-visible:border-indigo-300` (= 規約 24-extended 違反 residual) |

### 5.4 永続禁止 (= 全 session 共通、 絶対 touch しない)

- frozen branches (= 60 件) への追加 commit
- M phase の追加変更
- M-2a / L-4a 文言の変更
- wave 1 / wave 2 適用済 file の focus ring 部分 (= 規約 24 違反復活禁止)
- Arrival Risk Memory / Counterfactual generation / Routes API / 実 API 連携
- warning / recommendation / optimization 文言
- amber / orange / red / icon / badge / warning box
- localStorage / persist
- DB / env / package / dependency 変更
- runtime telemetry sink
- fetch / push / gh / reset / restore / stash / branch delete
- Deploy readiness / Stargazer pivot / 初期ユーザー獲得 (= /plan complete 前)
- brand color (= indigo, purple) の focus context での復活
- slate 系 focus-visible 規約からの離脱

---

## 6. 規約 24-extended (= 思想的核心、 全 session 共通)

### 6.1 規約 24 (= wave 1 で確立、 wave 2 で plan 全展開)

> すべての focus ring は `focus-visible:` + `slate-300` を使い、 `focus:` (= focus-visible なし) と brand color (= indigo, purple) を組み合わせない。

### 6.2 規約 24-extended (= wave 3 で確立、 border surface まで拡張)

> すべての focus surface (= ring / border / outline) は `focus-visible:` + `slate-*` を使い、 `focus:` (= focus-visible なし) と brand color (= indigo, purple) を組み合わせない。

### 6.3 本質 (= GPT 補正反映)

- **brand color をやめる** (= 必須)
- **`focus:` を `focus-visible:` にする** (= 必須)
- **focus visibility を失わない** (= 必須)
- 「slate-300 固定」 自体は目的化しない (= visibility 優先で 300/400 選択、 既存階調尊重)

### 6.4 思想接続 (= Aneurasync 中心問い)

> 「自分って、 そういう人間だったのか」

- 「観測の幕間」 = 観測しない時は静か (= mouse click 後の stuck visual 排除)
- 「観測層 OS visual 規約」 = brand color 焼き付きを排除、 slate-* 階調で統一
- 警告化リスク 0 を維持 (= amber/orange/red 完全排除)
- 思想保護を visual で機械保証 (= regression tests で永続化)

---

## 7. 新セッションでまず確認すること

### 7.1 環境状態

```bash
# branch 確認
git branch --show-current
# → feat/alter-plan-phase3-n-2-wave-3-focus-border-regime-extended (= 想定)

# HEAD 確認
git log --oneline --max-count=5
# → 4b77d896 / c15beff4 / 0f6b0ae6 / 051662a9 / 41461b95

# 状態確認
git status --short
# → docs/decision-log.md は committed、 .png は untracked (= 無関係)

# dev server 状態
lsof -i :3000 2>&1 | grep LISTEN

# memory 状態
sysctl vm.swapusage
```

### 7.2 wave 3 検証

```bash
# 全 plan tests 確認
npx vitest run tests/unit/plan/ 2>&1 | tail -5
# → 2662 PASS 期待

# 違反 grep 確認 (= approved scope 0 hit 期待)
grep -rn "focus:border\|focus-visible:border-indigo" app/\(culcept\)/plan/ --include="*.tsx" | grep -v "PlaceCandidatesPanel.tsx:451"
# → AnchorFormFields, ProposalChip では 0 hit、 PlaceCandidatesPanel L 453 residual のみ
```

### 7.3 CEO 確認事項 (= session 開始時)

1. CEO Visual Smoke を実施するか? (= 環境改善後)
2. L 453 を a) wave 3a で修正 or b) exception 管理 のどちらか?
3. 環境負荷の解消方法は CEO 手動 (= Claude desktop 再起動) か、 私から追加 kill か?

### 7.4 思考原則 (= CEO 7 原則、 session 全体で適用)

1. 前提を疑い、 ゆっくり考え抜いてからコードを書け
2. 時間をかけて自立推論、 文献等のリサーチ、 分析、 精査、 思考を行え
3. シンプルな法案から始め、 論理的に思考しろ
4. 外科的に緻密に修正しろ
5. 目標駆動で、 ゴールから逆算して実行しろ
6. 人間と同等レベルの推論力、 思考力、 組み立て力、 理解力をつけさせる設計をしろ
7. もっと良くなる設計やロジック、 人間の能力を超越できる革新的なアイデアを引き出して、 組み込め

---

## 8. 引き継ぎ要約 (= 30 秒で読める TL;DR)

### 何が起きていた
- N-2 wave 2 closeout audit 着地 (`41461b95`)
- N-2 wave 3 plan audit で **新発見 P-010** (= 規約 24 の border 拡張、 2 file 11 箇所) → CEO + GPT GO 判定 + 補正 1 点
- N-2 wave 3 impl 着地 (`0f6b0ae6` + `c15beff4` + `4b77d896`)、 2662 PASS、 approved scope 完了
- **残発見**: PlaceCandidatesPanel L 453 `focus-visible:border-indigo-300` (= scope 外 residual、 GPT 推奨で wave 3a or exception)

### 今止まっている理由
- CEO visual smoke を試みたが、 **ページが応答しない**
- 切り分け結果: **wave 3 は無罪** (= 11 line Tailwind class)、 **環境負荷が主因** (= swap 79.9%、 Claude Helper Renderer PID 7980 が 1.04 GB 単独占有)
- Adobe 12 個 kill 済 (= ~530 MB 解放) だが依然厳しい

### 次にやること
1. **環境負荷の解消** (= CEO 手動で Claude desktop 再起動 推奨)
2. **CEO Visual Smoke 5 件**
3. **L 453 判断** (= GPT 推奨 a: wave 3a で 1 line 修正)
4. **wave 3 closeout audit**
5. **N-2 phase 完了判定**

### ゴール
- 短期: **N-2 phase 完了** (= 規約 24-extended を plan 全 surface に適用)
- 中期: /plan complete
- 長期: Stargazer 深層観測完成

---

**完了**: このドキュメントは新 session の context として直接読める形式で構成。 frozen branches / 永続禁止リスト / 規約 24-extended 思想 / 残タスク順序 / ゴール の全構造を網羅。 新 session 開始時は §7 確認手順から開始することを推奨。

---

# Addendum (= 2026-05-23、 GPT 補正 7 点 + 現在地・詰まり・確認・次工程 5 ブロック)

> **追記理由**: handoff 本文 (= §0〜§8) は 80 点。 但しそのまま新 session へ渡すと「N-2 後の残工程が誤って縮む」 危険あり。 GPT 指摘:
>   - post-handoff commit / HEAD 状態が本文に未反映
>   - N-3/N-4/N-5 順序の補正必要 (= 空き日 ALTER flow が落ちる危険)
>   - Counter-Factual の generation vs Observation の区別が曖昧
>   - L453 を「判断待ち」 と並列に書いていたが、 標準進路は wave 3a 修正
>   - 環境負荷対策が kill 系並列で危険
>   - dev server 起動 flag (= PLAN_ROUTE_LIVE / PLAN_HOME_SWIPE_ENABLED) が未明示
>   - Stargazer pivot 禁止が弱い
>
> 本 addendum で 7 点を補正し、 「現在地・詰まり・確認・次工程」 を新 session 向けに明文化する。

---

## A. 必須補正 Addendum (= 7 点)

### A-1. post-handoff commit / HEAD 状態を明確化

handoff 本文 §3.1 では `HEAD commit: 4b77d896` と書いてある。 但し実際にはこの handoff doc 自体が次の commit (`ed94835c`) として積まれた。

**commit 階層 (= 新 session が見る git log)**:

| commit | 種別 | 内容 |
|---|---|---|
| `ed94835c` | docs | SESSION_HANDOFF doc commit (= 本 doc) |
| `4b77d896` | docs | Wave 3 impl の GPT 表現補正 (= 実質最終 impl commit) |
| `c15beff4` | docs | Wave 3 impl decision-log 追記 |
| `0f6b0ae6` | feat | Wave 3 impl 本体 (= 11 line + 10 tests) |
| `051662a9` | docs | Wave 3 plan audit |
| `41461b95` | docs | Wave 2 closeout audit |
| `94bcd220` | feat | Wave 2 impl (= frozen `94bcd220`) |
| `73a7405d` | docs | Wave 2 plan audit (= frozen) |

**新 session 冒頭で必ず確認**:

```bash
git branch --show-current
git log --oneline --max-count=8
git status --short --untracked-files=all
```

**重要**:
- 現在 HEAD = `ed94835c` (= 本 addendum commit 後) なら、 `4b77d896` は HEAD ではなく「Wave 3 impl の実質最終 commit」 として扱う
- handoff commit 後に未 commit 差分がないか確認

### A-2. N 完了までの順序 (= 本文 §4 を補正、 N-3 縮みリスク排除)

handoff 本文 §4.3 では:
> N-3: Counter-Factual / Pattern Truth Layer
> N-4: Home/Plan polish 残り
> N-5: /plan complete 宣言

これは **不十分**。 「空き日 → ALTER flow」 が落ちている。 また Counter-Factual の扱いが曖昧。

**正しい順序** (= 本 addendum で確定):

| Phase | 内容 |
|---|---|
| **N-2** | Home/Plan polish wave completion。 Wave 3 + (必要なら) Wave 3a を完了し、 規約 24-extended を plan focus surface 全体に閉じる |
| **N-3** | **空き日 → ALTER flow** readiness + implementation。 勝手に defer しない。 CEO 明示 defer がない限り実装対象 |
| **N-4** | **Pattern Truth Layer + Counter-Factual Observation** readiness + implementation。 Counter-Factual **generation ではない** |
| **N-5** | final /plan closeout audit。 ここで初めて /plan complete 判定 |

→ N-3 をいきなり Counter-Factual / Pattern にしない。 「空き日 → ALTER flow」 が先。

### A-3. Counter-Factual の再定義 (= generation vs Observation)

handoff 本文 §0「今はやらないこと」 に `Counter-Factual generation` と書いた一方、 §4.3 で `N-3: Counter-Factual / Pattern Truth Layer` とも書いた。 これは **矛盾**。

**正確な定義** (= 本 addendum で確定):

**禁止** (= 永続):
- Counter-Factual **generation**
- AI が別の 1 日を提案すること
- 「おすすめ」 「こっちの方が良い」 「最適化」
- warning / recommendation / optimization 文言
- Arrival Risk Memory

**許可** (= N-4 で実装対象):
- Counter-Factual **Observation** (= 観測)
- 選ばれなかった余地の観測
- 過去 / 現在の自分の選択構造の差分観測
- 予定なし日と予定あり日の構造差分
- Pattern Truth Layer としての中立観測

→ N-4 ではこの定義を採用。 AI が「別の 1 日を生成」 することは永続禁止、 user の選択構造を「観測」 することは許可。

### A-4. L453 residual の標準進路 (= 本文 §4.2 Step 3 を補正)

handoff 本文 §4.2 Step 3 では a) wave 3a or b) exception を **並列** に書いた。 但し方針は /plan を最後まで完了させること。 規約 24-extended を閉じるなら、 **標準進路は wave 3a 修正**。

**確定**:

| 進路 | 採用条件 |
|---|---|
| **a) wave 3a で 1 line 修正** (= 標準進路) | デフォルト |
| b) exception 管理 | **CEO が明示的に例外を選んだ場合のみ** |

**a) の具体**:
- `PlaceCandidatesPanel.tsx` L 453 `focus-visible:border-indigo-300` → `focus-visible:border-slate-300` (or 視認性上必要なら `slate-400`)
- 既存 regression test `tests/unit/plan/planComponentsFocusBorderRegimeWiring.test.ts` に PlaceCandidatesPanel を追加 (= TARGET_FILES に 3 件目として)

### A-5. 環境負荷対応の安全規約 (= 本文 §4.1 を補正)

handoff 本文 §4.1 で kill 候補 a-e を **並列** に書いた。 これは危険。 新 session が独断で kill する可能性がある。

**確定優先順** (= 本 addendum で確定):

1. **CEO 手動で Claude Desktop 再起動 or 不要タブ閉じ** (= 最優先、 最大効果)
2. **Mac 再起動も選択肢** (= swap 強制クリア)
3. 他 Claude code session / metis eslint / VS Code kill は **CEO 明示承認後のみ**
4. **PID 7980 Claude Helper Renderer を直接 kill しない** (= 私の session も切れる)
5. 他 session / Metis 作業が保存済か確認してから kill

**新 session ルール**:
- kill 系操作は **CEO 明示承認後のみ**
- 独断で `kill <PID>` 実行禁止

### A-6. dev server / flag 確認 (= 本文 §7.1 を強化)

過去に `/plan 404` 原因 = flag 不足。 新 session 復旧時は必ず確認:

**必要 flag**:
- `PLAN_ROUTE_LIVE=true`
- `PLAN_HOME_SWIPE_ENABLED=true`

**確認手順**:

```bash
# .env.local に flag があるか
cat .env.local | grep -E "PLAN_ROUTE_LIVE|PLAN_HOME_SWIPE_ENABLED"
```

- `.env.local` にあるなら `npm run dev` で OK
- ない場合は runtime env 付きで起動:

```bash
PLAN_ROUTE_LIVE=true PLAN_HOME_SWIPE_ENABLED=true PORT=3000 NODE_OPTIONS=--max-old-space-size=8192 npm run dev
```

### A-7. Stargazer / Deploy / 初期ユーザー獲得への pivot 禁止 (= 強化)

handoff 本文 §0 で長期ゴールとして Stargazer を書いたが、 「/plan complete 前にやらない」 が弱い。

**確定** (= 本 addendum で強化):

Stargazer は **長期ゴール**として記録 OK。 但し **/plan complete 前の次アクションではない**。

**永続禁止** (= 本 addendum で再列挙):
- Deploy readiness audit
- Stargazer pivot
- Rendezvous / Genome pivot
- 初期ユーザー獲得
- 実 API / Routes API
- Arrival Risk Memory
- Counter-Factual generation
- warning / recommendation / optimization 文言
- DB / env / package / dependency 変更
- fetch / push / gh
- reset / restore / stash / branch delete

**次の正しい順序** (= 1 本道):

```
環境改善
  → Wave 3 visual smoke
  → L453 wave 3a 判断/実装
  → Wave 3 closeout audit
  → N-2 phase 完了
  → N-3 空き日 ALTER flow
  → N-4 Pattern Truth Layer + Counter-Factual Observation
  → N-5 final /plan closeout audit
  → /plan complete 宣言
  → (= 初めて) Stargazer 等の次 phase へ
```

---

## B. 現在地・詰まり・確認・次工程 (= 新 session 直読用)

### B-1. 今何をしているか

現在は **Phase 3-N-2 Wave 3** の途中。

**目的**: 規約 24-extended を /plan の focus surface 全体に閉じる。

**Wave 3 approved scope は完了済** (= `0f6b0ae6` + `c15beff4` + `4b77d896`):
- `AnchorFormFields.tsx` 10 箇所 (= `focus:border-indigo-400 focus:outline-none` → `focus:outline-none focus-visible:border-slate-300`)
- `ProposalChip.tsx` 1 箇所 (= `focus:border-slate-400` → `focus-visible:border-slate-400`、 slate-400 維持で GPT 補正反映)
- focus border を `focus:` + brand color から `focus-visible:` + slate 系へ変更
- regression tests 10 件追加 (= `planComponentsFocusBorderRegimeWiring.test.ts`、 否定系 3 + 肯定系 1)
- plan tests **2662 PASS**
- edited files tsc-clean

**但し Wave 3 全体はまだ closeout していない**。 理由:
- visual smoke が未実施 (= 環境負荷で判定不能)
- L453 residual 判断が未完了

### B-2. 何に詰まっているか

**詰まりはコードではない**。

Wave 3 実装は runtime 的に重くなる変更ではなく、 11 line の Tailwind class 変更のみ。 ページが応答しない問題は **環境負荷が主因**。

**確認済**:
- dev server 自体は軽い (= next-server PID 53698 = RSS 24 MB、 CPU 0.0%)
- API は 200 応答 (= dev log で全 endpoint 完走確認)
- `/plan` は未認証時に `/login` redirect (= HTTP 307、 0.1s)
- swap が高い (= 79.9%、 thrashing 直前)
- Claude Helper Renderer (PID 7980) が単独で **1.04 GB** 占有
- MacBook Air M1 8 GB 環境で thrashing 気味

**したがって現時点の blocker**:
1. 環境負荷により CEO visual smoke が判定不能
2. `PlaceCandidatesPanel.tsx` L 453 に `focus-visible:border-indigo-300` residual が 1 箇所
3. Wave 3 closeout / N-2 complete がまだ言えない

### B-3. 次に何を確認するか (= 新 session 開始後、 read-only)

**新 session 開始後、 まず read-only で確認**:

#### 必須確認 10 点

1. `pwd` (= `/Users/haradataishi/Culcept` 期待)
2. `git branch --show-current` (= `feat/alter-plan-phase3-n-2-wave-3-focus-border-regime-extended` 期待)
3. `git log --oneline --max-count=8` (= `ed94835c` が HEAD 期待)
4. `git status --short --untracked-files=all` (= 未 commit 差分なし期待)
5. handoff commit `ed94835c` が HEAD かどうか
6. Wave 3 実装最終 commit `4b77d896` との関係 (= `ed94835c` の親が `4b77d896` 期待)
7. dev server が動いているか (= `lsof -i :3000` で LISTEN 確認)
8. port は 3000 か 3001 か (= 3000 期待、 CEO 確認済)
9. `.env.local` の flag (= `PLAN_ROUTE_LIVE=true` / `PLAN_HOME_SWIPE_ENABLED=true`)
10. swap / memory が改善しているか (= `sysctl vm.swapusage`)

#### 環境安定後の Visual Smoke 5 件

1. AddAnchorModal の input を mouse click して、 stuck indigo border が出ない
2. AddAnchorModal の input を Tab key で focus して、 slate 系 border が出る
3. EditAnchorModal の input も同じ
4. ProposalChip click 後、 stuck slate/brand border が残らない
5. Plan 全 tab で Add/Edit modal 起動と入力動作が壊れていない

### B-4. それができたら次に何をするか

#### visual smoke PASS 後 → L453 residual 処理

**標準進路** (= A-4 で確定): wave 3a で 1 line 修正
- `PlaceCandidatesPanel.tsx` L 453 `focus-visible:border-indigo-300` → `focus-visible:border-slate-300` (or 視認性上必要なら `slate-400`)
- 既存 regression test に `PlaceCandidatesPanel` を追加 (= TARGET_FILES に 3 件目)

#### L453 修正後

1. wave 3a tests (= 既存 + 新規 invariants)
2. plan tests (= 2662 → +X PASS 維持確認)
3. focus grep (= 違反 0 hit、 肯定系 12 箇所 期待)
4. visual smoke 1 件 (= PlaceCandidatesPanel button focus 動作確認)
5. wave 3 closeout audit (= L453 修正含む、 N-2 phase 完了宣言)
6. N-2 phase complete 判定

#### N-2 完了後 (= A-2 で確定)

- **N-3**: 空き日 → ALTER flow readiness + implementation (= 勝手に defer しない)
- **N-4**: Pattern Truth Layer + Counter-Factual **Observation** readiness + implementation (= generation 禁止)
- **N-5**: final /plan closeout audit

### B-5. やってはいけないこと

#### 永続禁止 (= 全 session 共通、 absolutely)

- Deploy readiness audit
- Stargazer / Rendezvous / Genome pivot
- 初期ユーザー獲得
- 実 API / Routes API
- Arrival Risk Memory
- Counter-Factual **generation** (= Observation は OK)
- warning / recommendation / optimization 文言
- DB / env / package / dependency 変更
- fetch / push / gh
- reset / restore / stash / branch delete
- **kill 操作の独断実行** (= CEO 明示承認後のみ)

#### kill 系の運用 (= A-5 で確定)

優先順:
1. **CEO 手動で Claude Desktop 再起動 / 不要タブ閉じ** (= 最優先)
2. **Mac 再起動も選択肢** (= swap 強制クリア)
3. 他 Claude code session / metis eslint / VS Code kill は **CEO 明示承認後のみ**
4. **PID 7980 Claude Helper Renderer を直接 kill しない**

---

## C. N-2 完了条件 (= 厳密、 GPT 指定)

**N-2 complete = 以下を全て満たした時のみ**:

| # | 条件 |
|---|---|
| 1 | Wave 1 (= `3d9bf8f5`) / Wave 2 (= `94bcd220`) / Wave 3 (= `4b77d896`) 完了 |
| 2 | L453 residual が wave 3a で修正済、 または CEO 明示の例外管理済 |
| 3 | visual smoke PASS (= Wave 3 5 件 + 必要なら wave 3a 1 件) |
| 4 | Wave 3 closeout audit PASS |
| 5 | decision-log 記録済 |
| 6 | working tree の保存状態が明確 (= 未 commit 差分なし) |

→ 上記 6 条件全達成で **初めて N-2 phase 完了** を宣言。

---

## D. 思想 transmission (= addendum 強化)

### Counter-Factual の正確な扱い (= A-3 再掲)

**禁止**:
> AI が「あなたの 1 日はこうした方が良い」 と提案すること

**許可**:
> AI が「あなたが選ばなかった余地、 過去と現在の選択構造の差分、 予定なし日と予定あり日の差分を、 中立的に観測する」 こと

これは Aneurasync 中心問い 「自分って、 そういう人間だったのか」 に直接接続する。 AI が「より良い 1 日」 を**生成**するのではなく、 user が選んだ余地と選ばなかった余地を**観測**することで、 user 自身が自己の選択構造に気付く。

### 規約 24-extended の完成形 (= N-2 完了時)

> すべての focus surface (= ring / border / outline) は `focus-visible:` + `slate-*` を使い、 `focus:` (= focus-visible なし) と brand color (= indigo, purple) を組み合わせない。

完成形では plan 全 interactive surface (= card / button / field / chip) で:
- mouse click 後の stuck visual 排除 (= 「観測の幕間」)
- brand color 焼き付き排除 (= 「観測しない時は静か」)
- keyboard a11y 維持 (= focus-visible で slate-* 階調)
- regression tests で永続規約化 (= 26 wave 2 + 10 wave 3 + (wave 3a) tests)

---

**完了**: 本 addendum を末尾に追記。 新 session は §0〜§8 を読んだ後、 必ず本 addendum (§A〜§D) も読むこと。 特に:
- §A-2 (= N-3/N-4/N-5 順序補正)
- §A-3 (= Counter-Factual の generation vs Observation)
- §A-4 (= L453 standard route = wave 3a)
- §A-5 (= kill 系 CEO 明示承認後のみ)
- §A-6 (= dev server flag 確認)
- §A-7 (= pivot 禁止強化)
- §B-3 (= 確認 10 点)
- §C (= N-2 完了条件 6 点)

これにより handoff 評価が 80 点 → かなり安全 に向上。

---

# §E. 最新 HEAD 状態 (= 2026-05-23 後刻補正、 GPT 指示)

> **追記理由**: addendum 本体 (= §A〜§D) では HEAD 状態を本文 §3.1 (= `4b77d896`) + §A-1 (= `ed94835c` 期待) の二段で書いた。 但し addendum 自体が次 commit (`b3e03f4e`) として積まれたため、 新 session が見る現 HEAD は `b3e03f4e`。 GPT 指示で本 §E に確定 anchor を置く。

## §E-1. commit 階層 (= 確定、 上から新しい順)

| # | commit | 種別 | 位置 / 内容 |
|---|---|---|---|
| 1 | **`b3e03f4e`** | docs | **最新 handoff addendum commit / 現 HEAD** (= 本 §E 追記後はさらに次 commit が HEAD) |
| 2 | `ed94835c` | docs | handoff 本体 commit (= §0〜§8) |
| 3 | `4b77d896` | docs | **Wave 3 実装側の実質最終 commit** (= GPT 表現補正反映) |
| 4 | `c15beff4` | docs | Wave 3 decision-log 追記 |
| 5 | `0f6b0ae6` | feat | Wave 3 impl 本体 (= 11 line + 10 tests、 2662 PASS) |
| 6 | `051662a9` | docs | Wave 3 plan audit |
| 7 | `41461b95` | docs | Wave 2 closeout audit |
| 8 | `94bcd220` | feat | Wave 2 impl (= frozen) |

## §E-2. branch (= 確定)

```
feat/alter-plan-phase3-n-2-wave-3-focus-border-regime-extended
```

## §E-3. 新 session 開始時の最初の確認コマンド (= GPT 指定)

新 session は **最初にこれを実行**:

```bash
cd /Users/haradataishi/Culcept
pwd
git branch --show-current
git log --oneline --max-count=8
git status --short --untracked-files=all
```

## §E-4. 期待結果 (= GPT 指定、 これと差異があれば停止)

| 項目 | 期待値 |
|---|---|
| pwd | `/Users/haradataishi/Culcept` |
| branch | `feat/alter-plan-phase3-n-2-wave-3-focus-border-regime-extended` |
| HEAD | `b3e03f4e` (= 本 §E 追記前の場合、 追記後はさらに次 commit) |
| HEAD の下 | `ed94835c` が直下に存在 |
| Wave 3 実装最終 | `4b77d896` が log 内に存在 |
| wave 3 関連の未 commit 差分 | **なし** |
| untracked | `supabase/.temp/cli-latest` と PNG 程度なら **scope 外 noise** (= 無視 OK) |

## §E-5. 期待差異時の対応

| 差異 | 対応 |
|---|---|
| HEAD が `b3e03f4e` でない | log を遡って `b3e03f4e` を探す。 別 commit が積まれていれば内容確認 |
| branch が違う | switch せず CEO に確認 |
| wave 3 関連の未 commit 差分あり | 内容確認、 CEO に報告 (= 独断 commit せず) |
| `4b77d896` が log にない | reset / restore が起きた可能性、 即停止 + CEO 報告 |

## §E-6. anchor 確定 (= 新 session の精神的支柱)

新 session が context ゼロから始まる時、 **本 §E が最初の足場**。

- 「branch / HEAD / wave 3 実装の足跡」 が §E-1 で全て分かる
- §E-3 のコマンドで 30 秒で現在地確認できる
- §E-4 と差異あれば即停止 (= 独断進行禁止)

→ §E が新 session の「現在地確定」 の単一 source of truth。

---

**完了**: §E 追記で最新 HEAD anchor 確定。 新 session は §0 → §8 → §A〜§D → §E の順で全読み込み可能。 §E-3 のコマンドで開始直後に現在地確定。 期待差異あれば §E-5 で即停止 + CEO 報告。
