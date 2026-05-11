# CoAlter Step D 実装引き継ぎ書 — 正式版 v2

**作成日**: 2026-05-11
**ステータス**: **正式版 v2** (CEO 2026-05-11 補正反映後 / GPT 指摘の grep 致命的 bug 修正後)
**起草者**: 監査セッション (worktree `Culcept-coalter-bug1`、code touch ゼロ / commit ゼロ from monitoring)
**前提**: Bug-1 Step C 監査完了 = Option α 採用 (CEO 2026-05-11)
**rev 履歴**:
- 2026-05-11 案: 初稿 (worktree / branch / Phase 進行 / Step E 統合 / 6 論点提示)
- 2026-05-11 正式 (v1): CEO 補正 3 点反映 (① base = origin/main / ② D-1-d CEO GO 必須 / ③ COALTER_THREE_STAGE = D-2-e 統一) + Alter Morning 混入防止 (§4.4 + §9.12 + §10.1 Gate 5)
- 2026-05-11 正式 v2: GPT 指摘反映 — Alter Morning 検出 grep の致命的誤検出 bug を修正 (`coalter/` の `alter/` 部分文字列にマッチして CoAlter 全 file を誤検出する状態を、path component boundary 制約 + case insensitive で解消)

---

## §0 本書の位置づけと最重要原則

CoAlter プラン全体の **次の本流 = Step D (映画 2 段階分離 / 三段式 movie M1 Curate + M2 Resolve)** に着手するための、新セッション向け自己完結引き継ぎ書 **正式版 v2**。Bug-1 Step C 引き継ぎ書の教訓を反映し、**着手前 self-check で実態を必ず verify** する構造を組み込む。

### §0.1 最重要原則

| 原則 | 内容 |
|---|---|
| **作業隔離** | 専用 worktree `/Users/haradataishi/Culcept-coalter-stepd` (新設)、本作業以外で touch しない |
| **branch 隔離** | 専用 branch `feat/coalter-stepd-movie-three-stage` (新設、**base = `origin/main`**)、既存 branch を直接汚さない |
| **既存 worktree 不可侵** | `Culcept-coalter` / `Culcept-coalter-bug1` / `Culcept-pr9` 等の既存 worktree で本作業しない |
| **Alter Morning 系統不可触** | `alter-morning` / `morning` / `alter/` 系 file への diff ゼロ厳守 (§4.4 + §10 各 commit gate) |
| **正本委譲** | 詳細仕様は正本 doc に委譲。本書は実装手順 + 進行制御 + 事実確認手順のみ |
| **着手前事実確認必須** | §2 self-check で「実装が既に進んでいないか」「Alter Morning との混入がないか」を必ず verify |
| **凍結線厳守** | §4.2 の不可触対象に touch ゼロ |
| **進行制御** | §7 commit 自律 / push CEO 承認後 / D-1-d と D-2-e は着手前 CEO GO 必須 |

### §0.2 本書の番号体系 (handoff rev 6 採用、CEO 2026-05-11 確定)

handoff rev 6 §2 Step D を canonical として採用。mainstream plan §3 の元番号は **対応表として保持**:

| 本書での名称 | handoff rev 6 §2 | mainstream plan §3 元番号 | Phase 名 (三段式) |
|---|---|---|---|
| **Step B** (= 完了済) | Step B | D-1 | M0 Stage 1 Understand |
| **Step D-1** | Step D-1 | D-2 | M1 Stage 2 Curate (movie) |
| **Step D-2** | Step D-2 | D-3 | M2 Stage 3 Resolve (movie) |

→ 本書では **D-1 = M1 Curate, D-2 = M2 Resolve** で統一。mainstream plan §3 を参照する際は「mainstream plan §3.2 (= 元 D-2-a〜D-2-d)」のように元番号を保持。

---

## §1 worktree / branch 設計 (CEO 補正 1 反映)

| 項目 | 値 |
|---|---|
| worktree path | `/Users/haradataishi/Culcept-coalter-stepd` |
| branch 名 | `feat/coalter-stepd-movie-three-stage` |
| **base branch** | **`origin/main`** ← CEO 補正 1 (旧案: `origin/feat/coalter-three-stage`) |
| 既存 `Culcept-coalter-bug1` | **保持** (本 handover self-check 完了後に cleanup 判断) |
| 既存 `feat/coalter-bug1-step-c` | **保持** (同上) |

### §1.1 base 変更の根拠 (CEO 補正 1)

- PR #95 (`62dff94b`) と PR #96 (`d066a4ad`) は既に main に反映済み
- Bug-1 Phase 1〜3B Layer 2-C + Step B M0 (Understanding M0-1〜M0-7A + B-5 runtime shadow 並走接続 `47d57a46`) も全て main 反映済み
- catalog parser 強化 3 commit (B'-1 / Bug 1 / Bug 2 = `9a52bfba` / `f7f597e5` / `fcfc3d8b`) も main 反映済み
- 既存 `feat/coalter-three-stage` から base すると新セッションの PR diff に自分の作業以外の commit が混入する
- **`origin/main` から base = PR diff = 自分の Step D commit のみ** で履歴事故が少ない
- `origin/feat/coalter-three-stage` は **参照元として残す** が、作業 base にしない

### §1.2 worktree 作成コマンド (新セッションが §2.1 self-check 後に実行)

```bash
# 既存 worktree (例: /Users/haradataishi/Culcept-coalter) で実行
cd /Users/haradataishi/Culcept-coalter
git fetch origin
git worktree add /Users/haradataishi/Culcept-coalter-stepd \
  -b feat/coalter-stepd-movie-three-stage \
  origin/main
git worktree list
# 期待: /Users/haradataishi/Culcept-coalter-stepd  [feat/coalter-stepd-movie-three-stage] が含まれる
```

---

## §2 着手前 self-check 手順 (Bug-1 教訓 + Alter Morning 混入防止)

新セッションは **§2.1 〜 §2.7 を順次実行**。1 つでも想定外の状態を検出したら即停止 + CEO 報告。

### §2.1 git 状態 self-check

```bash
cd /Users/haradataishi/Culcept-coalter-stepd
git fetch origin
git log --oneline origin/main | head -1
# 期待 (本 handover 起草時点 2026-05-11): d066a4ad Merge pull request #96 ...
git log --oneline origin/feat/coalter-three-stage | head -1
# 参照: 61d1808a or descendant (本作業の base には使わないが、参考確認)
git branch --show-current
# 期待: feat/coalter-stepd-movie-three-stage
git log --oneline | head -3
# 期待: 1 行目は origin/main HEAD と同一 (d066a4ad)
git status
# 期待: clean
git worktree list
# 期待: Culcept-coalter-stepd が一覧に含まれる
npm install
```

### §2.2 Bug-1 Step C 完了 verify (前提確認)

```bash
ls lib/coalter/emotion/{lexemes,types,extract,independence}.ts 2>&1
# 期待: 4 file 全揃い
git log --oneline --grep="Bug-1 Phase" | head -10
# 期待: Phase 1/2/3 + 3B Layer 1/2-A/2-B/2-C commit 列が見える
NODE_OPTIONS="--max-old-space-size=8192" \
  npx vitest run tests/unit/coalter/emotion*.test.ts \
  tests/unit/coalter/decideSearch*.test.ts \
  tests/unit/coalter/webConnectorNoSearchPatternsDeprecated.test.ts 2>&1 | tail -5
# 期待: Bug-1 関連 13 file / 116 tests PASS
```

### §2.3 Step B M0 (Stage 1 Understand) 完了 verify

```bash
ls lib/coalter/understanding/ | wc -l
# 期待: 14 (.ts file 数)
NODE_OPTIONS="--max-old-space-size=8192" \
  npx vitest run tests/unit/coalter/understanding/ 2>&1 | tail -5
# 期待: 14 file / 132 tests PASS
grep -n "understandingShadowMovie\|COALTER_UNDERSTANDING_SHADOW_MOVIE" lib/coalter/flags.ts | head -5
# 期待: B-5 着地後の flag 定義が見える (default false)
git log --oneline 47d57a46 2>&1 | head -1
# 期待: 47d57a46 feat(coalter): wire movie branch understanding shadow (B-5, flag-gated)
```

### §2.4 Step D 着手対象 file の不在 verify (Bug-1 教訓: 過去作業混入チェック)

```bash
ls lib/coalter/movie/ 2>&1
# 期待: No such file or directory (D-1 着手前は movie/ ディレクトリ自体が無い)
grep -n "COALTER_UNDERSTANDING_LIVE\|COALTER_MOVIE_CURATOR_LIVE\|COALTER_THREE_STAGE\|movieCuratorLiveEnabled" lib/coalter/flags.ts 2>&1
# 期待: 0 件 (D-1-d / D-2-e で予定の flag は未実装)
ls tests/unit/coalter/movie/ 2>&1
# 期待: No such file or directory
```

**もし上記いずれかが既に存在していたら**:
- Bug-1 Step C と同じ「過去作業の混入」状態
- **即停止して CEO 報告** (§9 緊急停止条件)
- 内容を読まずに削除しない

### §2.5 catalog parser 強化 3 commit の状態 verify (CEO 2026-04-27 打ち切り判定対象、CEO 2026-05-11 「温存」確定)

```bash
git log --oneline 9a52bfba f7f597e5 fcfc3d8b 2>&1 | head -5
# 期待: 3 commit すべて origin/main に存在 (revert されていない)
git log --oneline origin/main --grep="markdown headings\|reject movie source\|resolve theaters from movie listing" 2>&1 | head -5
# 期待: 同上
```

これらは Step D 期間中は「旧実装として温存」枠 (三段式 §6 「旧実装の温存条件」)。Stage 3 Resolve 本実装完了後の Step E で削除審議 (CEO 別判断)。

### §2.6 tsc baseline 取得 (Node memory 8GB 必須)

```bash
NODE_OPTIONS="--max-old-space-size=8192" \
  npx tsc --noEmit 2>&1 | tee /tmp/tsc-baseline-stepd.txt | grep -E "error TS" | wc -l
# 期待: 約 1099 errors (本 handover 起草時点 = origin/main HEAD の baseline)
```

→ Step D 修正で error 数が baseline を超えないことを各 commit 前に verify。

### §2.7 Alter Morning 混入チェック initial baseline (CEO 2026-05-11 追加補正、GPT 指摘反映 v2)

worktree 作成直後 (commit ゼロ時点) で:

```bash
git diff --name-only origin/main...HEAD | grep -iE '(^|/)(alter-morning|alter)(/|$)|(^|/)morning'
# 期待: 出力なし (commit ゼロのため当然)
```

これは initial baseline 取得。以降の **各 commit 前に同一コマンドを実行** し、出力が空であることを必ず verify (§10 報告プロトコル + §4.4 + §9.12)。

**正規表現の根拠** (CEO 2026-05-11 GPT 指摘反映):
- 旧案 `"alter-morning|morning|alter/"` は **`coalter/` の `alter/` 部分文字列にマッチして CoAlter 全 file を誤検出する致命的バグ** あり (実証済 — Step D で commit する CoAlter file 全てがブロックされる)
- 修正 `(^|/)alter(/|$)` で path component boundary (前後 `/` or 行端) を強制、`coalter/` 誤検出ゼロ
- `(^|/)morning` で `morningRitual.ts` 等の path component 先頭 morning を検出
- `-i` (case insensitive) で `MorningQuestion.tsx` 等 CamelCase も網羅 (CoAlter 誤検出ゼロは case insensitive でも実証済)

---

## §3 全体構造 (CoAlter 進捗 snapshot 2026-05-11)

### §3.1 完了済み

| 領域 | 状態 | 根拠 |
|---|---|---|
| **Phase 2 3-mode body** | ✅ 完了 + 凍結 (CEO 6.D 合格 2026-04-19) | handoff §4.1 凍結 6 項目 |
| **Step A 設計整理** | ✅ 完了 (2026-04-24) | handoff §2 Step A |
| **Step B M0 Stage 1 Understand** | ✅ 完了 (実装 + B-5 runtime shadow 並走接続着地、preview 実測は Step E に統合) | handoff §2 Step B rev 5 |
| **Step C Bug-1** | ✅ 完了 (2026-05-11 監査結果、CEO Option α 採用) | Bug-1 Phase 1/2/3 + 3B Layer 1/2-A/2-B/2-C 全 commit + main 反映 + CEO 2026-04-27 打ち切り判定で実質完了認定 |
| **① レイアウト系統** | ✅ 完了 + production deploy (2026-05-10) | Stage 0.5〜4 全 phase + L4-pre 1〜3 (PR #95 squash merge `62dff94b`、3 旗 ON 反映) |

### §3.2 着手対象 (本書のスコープ)

| 領域 | 状態 | 根拠 |
|---|---|---|
| **Step D-1 (M1 Stage 2 Curate movie)** | ❌ 未着手 | `lib/coalter/movie/` 未作成、`COALTER_MOVIE_CURATOR_LIVE` / `movieCuratorLiveEnabled` flag 未定義 |
| **Step D-2 (M2 Stage 3 Resolve movie)** | ❌ 未着手 | 同上、`COALTER_THREE_STAGE` grand kill switch 未定義 |

### §3.3 別 phase / 後続 (本書のスコープ外)

| 領域 | 担当 | 根拠 |
|---|---|---|
| **Step E 観測 + B-6 preview 実測** | Step D-1/D-2 完了後 | handoff §2 Step E + B-6 執行ポリシー (CEO 2026-05-11 論点 3 確定) |
| **Phase 3B Layer 2-D (food path narration)** | 別 phase (CEO 判断保留中) | foodOrchestrator が narrationEnricher を呼ばない構造的制約 |
| **layout/UI phase (L-1〜L-9)** | 別 phase (CEO 判断保留中) | decision-log 2026-04-27 |
| **重複 commit 6 ペア整理** | 別 task (低優先度、機能影響ゼロ) | back-merge 起因 |
| **catalog parser 強化 3 commit cleanup** | Step E 別判断 (CEO 2026-05-11 「温存」確定) | revert なし、preview deploy なし、Step E まで触らない |
| **Bug-1 narration 接続 効果再観測** | Step D 完了後の Step E で同時実施 | Bug-2 解決で初めて movie path に rank>0 到達、emotion_signals が prose に反映可能 |

---

## §4 正本 doc + 凍結線 + 不可侵条文 + Alter Morning 隔離

### §4.1 正本 doc (本書の根拠、新セッションは着手前必読)

| doc | 役割 | 必読 § |
|---|---|---|
| `docs/coalter-movie-three-stage-design.md` rev 3.2 | **三段式設計書 = Step D 正本 (CEO 2026-05-11 論点 2 で「そのまま採用」確定)** | §0.5 存在論 / §1 設計原則 / §2.3 Stage 2 Curate / §2.4 Stage 3 Resolve / §6 Phase M1/M2 ガイド + Bug-2 接続 / §11 M0 固定事項 |
| `docs/coalter-implementation-plan-mainstream.md` v0.1 | **実装手順書** | §3 Step D (元番号体系、本書付録対応) |
| `docs/coalter-handoff-2026-04-22.md` rev 6 | **bridge handoff** | §1 現在地 snapshot / §2 Step D / §4 凍結線 / 付録 A 凍結原典台帳 |
| `docs/coalter-integration-contract-2026-04-24.md` v0.1 rev 1 FIXED | **P0 統合契約 (4 契約点)** | §1.6 / §2.6 / §3.6 / §4.5 不可侵条文 |
| `docs/coalter-runtime-contract-2026-04-24.md` v0.1 FIXED | **P1 runtime 契約** | §1.7 / §2.9 / §3.7 不可侵条文 |
| `docs/coalter-master-design.md` v1.1 | **全体原則** | §5 起動状態機械 (executor availability 5 状態) |
| `docs/coalter-bug1-emotion-retrieval-design.md` v0.2 | (参照のみ) Bug-1 完了済 | §6.2 narration 接続 / §10 凍結線 |
| `docs/coalter-handoff-2026-04-19-retrieval-investigation.md` | (参照のみ) Bug-2 投資調査原典 | §4.2 / §5.3 / §8 (三段式 §6 から接続) |

### §4.2 コード凍結線 (本作業中 1 bit も touch ゼロ)

| 対象 | 根拠 |
|---|---|
| `lib/coalter/coalterDispatch.ts:141-143` `isExecutorThemeEnabled` (G6) | Phase 2 3-mode CEO 6.D 合格 凍結 |
| `lib/coalter/triggerDetection.ts:180` `theme === "general" or "schedule"` NONE 返し | G6 境界整合 |
| `lib/coalter/foodOrchestrator.ts` 全体 | Phase 2 凍結 6 項目 |
| `lib/coalter/movieRanker.ts:166` `missing_where` hard drop | Stage 3 Resolve 稼働まで fallback (旧実装温存) |
| `lib/coalter/webConnector.ts` の `parseMovieScreenings` / `NEAR_WINDOW` / theater regex | Stage 3 Resolve 稼働まで fallback (旧実装温存) |
| `lib/coalter/movieCatalog.ts` 全体 | 三段式 §11.A 禁触 (現行 movie retrieval 不変性) |
| `lib/coalter/emotion/**` 全体 | Bug-1 Step C 完了済、touch 不要 |
| `lib/coalter/understanding/**` 全体 | Step B M0 完了済、touch 不要 (D-1 では import のみ) |
| `lib/coalter/presence/**` 全体 | ① 系統で本番稼働中 |
| ① 系統 UI / instrumentation 系 | ① 系統で本番稼働中 |
| `lib/coalter/movieOrchestrator.ts` の既存 4-layer pipeline | 三段式 §6 旧実装温存。**D-1-d / D-2-e のみ最小 diff で touch 許容** (新 path 接続のみ、既存 path 不変) |

### §4.3 設計 doc 不可侵条文

| doc | 不可侵 § |
|---|---|
| 統合契約 | §1.6 (canonical surface 二層) / §2.6 (executor×Presence×Action 直交) / §3.6 (Stage 1 vs S4 別物) / §4.5 (Pattern 命名 6 families/7 operational) |
| runtime 契約 | §1.7 / §2.9 / §3.7 (新セッションが正本確認) |
| master design | §5 起動状態機械 (5 状態 + pair 同意フロー) |
| Core UX v1.1 | §15.2 (§1 / §2.3 / §2.4 / §3.1-3.3 / §8.1 / §11) |
| 三段式 rev 3.2 | §0.5 存在論 / §1 設計原則 0-5 / §11 M0 固定事項 / §6 M2 Bug-2 接続 構造 gate B1-B3 |
| Bug-1 v0.2 | §2.3 失敗独立 5 条文 / §10 凍結線整合 |

### §4.4 Alter Morning 系統への touch 禁止 (CEO 2026-05-11 追加補正、GPT 指摘反映 v2、絶対遵守)

CoAlter Step D 作業では **Alter Morning 系統 file への diff を禁止**。Step D は CoAlter 三段式 movie の本流であり、Alter Morning (= 朝の起床導線 / morning plan operation / Stargazer Alter 系) とは別系統。混入リスクを構造的に排除する。

#### §4.4.1 禁止対象 (file path pattern)

`git diff --name-only` で以下の path component pattern にマッチする file は本作業中に **diff ゼロ厳守**:

| pattern | 該当範囲 (例) |
|---|---|
| `(^\|/)alter-morning(/\|$)` | `lib/alter-morning/...` / `app/api/alter-morning/...` / `tests/unit/alter-morning/...` |
| `(^\|/)alter(/\|$)` | `lib/alter/...` / `app/(immersive)/stargazer/alter/...` (alter が path component として独立) |
| `(^\|/)morning` (任意の morning 始まり、case insensitive) | `morningRitual.ts` / `morningPlan.ts` / `MorningQuestion.tsx` / `morning-question/...` 等 |

**重要**: `lib/coalter/...` は `coalter/` の中に `alter/` 部分文字列を含むが、`(^|/)alter(/|$)` の path component boundary 制約により **誤検出されない** (実証済)。

#### §4.4.2 各 commit 前 mandatory verify

各 Phase commit 前に必ず実行:

```bash
git diff --name-only origin/main...HEAD | grep -iE '(^|/)(alter-morning|alter)(/|$)|(^|/)morning'
```

**期待**: 出力 0 行 (空)

**正規表現の根拠** (CEO 2026-05-11 GPT 指摘反映):
- 旧案 `"alter-morning|morning|alter/"` は **`coalter/` の `alter/` 部分文字列にマッチして CoAlter 全 file を誤検出する致命的バグ** あり
- 実証: `echo "lib/coalter/movie/queryDerivation.ts" | grep -E "alter-morning|morning|alter/"` → MATCH (誤検出)
- 修正版: 同 echo を `grep -iE '(^|/)(alter-morning|alter)(/|$)|(^|/)morning'` に通す → no match (誤検出ゼロ実証)
- `(^|/)alter(/|$)` で path component boundary (前後 `/` or 行端) を強制
- `-i` (case insensitive) で `MorningQuestion.tsx` 等 CamelCase も網羅

**もし 1 行でも出力されたら**:
- §9 緊急停止条件 §9.12 該当
- **即停止 + CEO 報告** (commit / push 全停止)
- 自律 revert 禁止 (CEO 判断仰ぐ)

#### §4.4.3 例外規定

なし。Step D の scope は CoAlter `lib/coalter/**` + `tests/unit/coalter/**` + `docs/coalter-*.md` のみ。Alter Morning 系統への変更が必要な場合は本 task の scope 外として CEO に別 task として起草を要請する。

### §4.5 運用凍結

- preview 30 件 full observation gate (handoff §4.3) 維持
- Phase 2 観測インフラ (KPI SQL / diagnostics field) 不変
- live smoke harness 6 本 (handoff §3 「live smoke 運用束」) 不変
- 3 旗 production env (`COALTER_PRESENCE_SPEECH_LLM=true` / `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH=true` / `NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR=true`) + LEGACY OFF (`NEXT_PUBLIC_COALTER_LEGACY_CARD_AUTO_INSERT=false`) 不変

---

## §5 D-1 (M1 Stage 2 Curate movie) Phase 分解

**正本**: 三段式 §2.3 + §6 Phase M1 / mainstream plan §3.2 (元 D-2-a〜D-2-d)

**Gate**: G1〜G6 (品質) + B1 構造 gate (`missing_where` reject ロジックが Stage 2 Curate コードに存在しないこと)

**Phase 分解** (mainstream plan §3.2 準拠、4 commit):

| Phase | mainstream plan § (元番号) | scope | 新規 file |
|---|---|---|---|
| **D-1-a** Query Derivation | §3.2 元 D-2-a | TwoPersonLensToday → movie 軸クエリ変換 | `lib/coalter/movie/queryDerivation.ts` + test |
| **D-1-b** Candidate Pool + Soft Availability Filter | §3.2 元 D-2-b | 3 source candidate pool + soft filter (B1 構造担保) | `lib/coalter/movie/candidatePool.ts` + 2 test (含 B1 構造 test `candidatePoolNoMissingWhereDrop.test.ts`) |
| **D-1-c** LLM Ranker with Personality-Rooted Narration | §3.2 元 D-2-c | §2.3.3 LLM Ranker、5 要素 narration | `lib/coalter/movie/curator.ts` + 2 test (narration 5 要素充足 + 固有情報率) |
| **D-1-d** UI 連携 + kill switch | §3.2 元 D-2-d | flag `movieCuratorLiveEnabled` + movieOrchestrator 最小修正 + flag invariant test | `lib/coalter/flags.ts` 修正 + `lib/coalter/movieOrchestrator.ts` 最小修正 + 2 test (flag invariant + shadow invariance) |

### §5.1 Gate 充足条件 (D-1 = Phase M1 完了時)

- G1: top-1「観たい」率 ≥ 50% (E-2 canary で測る、D-1 単体は shadow)
- G2: Stage 3 到達率 ≥ 60% (D-2 完了後)
- G3: narration 5 要素充足率 ≥ 90% (unit test で 100% 必須)
- G4: narration 固有情報率 ≥ 80% (shadow / E-2)
- G5: Soft filter 精度 (D-2 完了後)
- G6: narration の lens 由来引用率 ≥ 70% (shadow / E-2)
- **B1 構造 gate**: Stage 2 Curate コードに `missing_where` reject ロジックが存在しない (`grep -n "missing_where" lib/coalter/movie/` → 0 件)
- flag OFF 既定で全 coalter test PASS (累積回帰ゼロ)

### §5.2 ロールバック

- `movieCuratorLiveEnabled` flag OFF → 本番影響ゼロ
- `COALTER_THREE_STAGE` grand kill switch (**D-2-e で新設予定**) も同義 (D-2 完了後の roll back 制御)
- D-1-d → D-1-c → D-1-b → D-1-a の順で commit revert

詳細は **三段式 §2.3 + mainstream plan §3.2** を必読。

---

## §6 D-2 (M2 Stage 3 Resolve movie) Phase 分解

**正本**: 三段式 §2.4 + §6 Phase M2 + Bug-2 接続 / mainstream plan §3.3 (元 D-3-a〜D-3-e)

**Gate**: H1〜H5 (品質) + B1〜B3 構造 gate (Bug-2 接続)

**Phase 分解** (mainstream plan §3.3 準拠、5 commit):

| Phase | mainstream plan § (元番号) | scope | 新規 file |
|---|---|---|---|
| **D-2-a** theaterResolver 基盤 | §3.3 元 D-3-a | 3+1 段 fallback fetcher (公式 → eiga → Yahoo → EXA) | `lib/coalter/movie/theaterResolver.ts` + 2 test (含 fallback source diagnostics) |
| **D-2-b** adjacency table + Concentric Area Expansion | §3.3 元 D-3-b | 主要駅 50 adjacency + Tier 0/1/2 ループ | `lib/coalter/movie/adjacencyTable.ts` + `areaExpansion.ts` + 2 test |
| **D-2-c** Tier fail state + 別作品再起動 narration | §3.3 元 D-3-c | tier2_fail state + lens 由来 narration | `lib/coalter/movie/tierFailNarration.ts` + 1 test (B3 構造担保) |
| **D-2-d** Stage 3 prefetch 投機実行 | §3.3 元 D-3-d | Stage 2 top 候補に対し並列 prefetch | `lib/coalter/movie/stage3Prefetch.ts` + 1 test |
| **D-2-e** flag / orchestrator 組込 + diagnostics + **`COALTER_THREE_STAGE` grand kill switch 新設** | §3.3 元 D-3-e | `COALTER_THREE_STAGE` grand kill switch + movieOrchestrator 三段式分岐 + 5 新規 diagnostics | `lib/coalter/flags.ts` 修正 + `movieOrchestrator.ts` 修正 + `movie/diagnostics.ts` 新設 + 2 test |

### §6.1 Gate 充足条件 (D-2 = Phase M2 完了時)

**構造 gate (B1-B3)**:
- B1: Stage 2 Curate コードに `missing_where` reject 存在しない (D-1 gate で既達)
- B2: theaterResolver に 3+1 段 fallback (公式 → eiga → Yahoo → EXA) 実装
- B3: Tier 2 fail 時 `{ state: "tier2_fail", altSignal: true }` を返し narration + 別作品提案

**品質 gate (H1-H5)**:
- H1: Tier 0 劇場確定率 ≥ 55% (E-2 canary)
- H2: Tier 0+1 劇場確定率 ≥ 75% (E-2 canary)
- H3: Tier 2 fail 再起動率 ≥ 60% (E-2 canary、手動評価補足)
- H4: 1 分 budget 超過率 ≤ 10% (shadow + E-2 canary)
- H5: narration 一貫性 (Stage 2 + Tier 2 謝罪 narration が同人格) → 手動評価 PASS

**移行期 maintenance gate** (層 3、M2 期間中の preview 観測):
- `searchCandidatesCount ≥ 5` 中央値 (Step C 累積維持)
- `catalogCount ≥ 5` 中央値
- `rankedCount ≥ 3` 中央値
- `missingWhereRejectCount ≤ catalog の 30%` (旧 ranker 観測)

### §6.2 ロールバック

- `COALTER_THREE_STAGE=false` (**D-2-e 新設の grand kill switch**) → 即現行単一段に戻る
- D-2-e → D-2-d → D-2-c → D-2-b → D-2-a の順で commit revert

詳細は **三段式 §2.4 + §6 Phase M2 + mainstream plan §3.3** を必読。

---

## §7 Phase 進行制御 (CEO 補正 2 反映)

| Phase | commit 作成 | push to origin | 次 Phase 着手 |
|---|---|---|---|
| **D-1-a** | 自律 GO | CEO 受領確認後 | push 完了で自律 GO (D-1-b へ) |
| **D-1-b** | 自律 GO | CEO 受領確認後 | push 完了で自律 GO (D-1-c へ) |
| **D-1-c** | 自律 GO | CEO 受領確認後 | **CEO GO 必須** (D-1-d 着手前) ← CEO 補正 2 |
| **D-1-d** (= D-1 完了) | **CEO GO 受領後着手 → 自律 commit** ← CEO 補正 2 | CEO 受領確認後 | **CEO 別 GO 必須** (D-2 へ) |
| **D-2-a** | 自律 GO (D-2 着手 GO 受領後) | CEO 受領確認後 | push 完了で自律 GO (D-2-b へ) |
| **D-2-b** | 自律 GO | CEO 受領確認後 | push 完了で自律 GO (D-2-c へ) |
| **D-2-c** | 自律 GO | CEO 受領確認後 | push 完了で自律 GO (D-2-d へ) |
| **D-2-d** | 自律 GO | CEO 受領確認後 | **CEO GO 必須** (D-2-e 着手前) |
| **D-2-e** (= D-2 完了) | **CEO GO 受領後着手 → 自律 commit** | CEO 受領確認後 | Step D 完了判定 + Step E 観測準備 (CEO 検証) |

### §7.1 進行制御の理由 (CEO 補正 2 根拠)

- **D-1-a/b/c は新規 file 中心** (movie/queryDerivation.ts / candidatePool.ts / curator.ts、既存 file touch ゼロ)、低 risk → 自律 commit OK
- **D-1-d は既存 file touch** (movieOrchestrator.ts 最小修正 + flags.ts 修正)、新規 file 中心の D-1-a/b/c とリスクレベルが違う → CEO 補正 2 で 2 段 gate 強化:
  - D-1-c push 完了 → **D-1-d 着手前 CEO GO** 仰ぎ
  - D-1-d push 完了 → **D-2 着手前 CEO 別 GO** 仰ぎ
- **D-2-e は grand kill switch + movieOrchestrator 三段式分岐の本接続**、最高 risk → 着手前後 CEO gate (D-2-d push 完了 → D-2-e 着手 CEO GO → D-2-e push 完了 → Step D 完了判定 CEO 検証)

### §7.2 シナリオ別対応 (Bug-1 handover §5.3 と同等)

| Scenario | 対応 |
|---|---|
| **A: 順調進行** | 上記表通り |
| **B: CEO 受領遅延** | standby、code touch / push / 自走判断禁止、WIP commit 不要 |
| **C: 新セッション自身が bug 検出** | 修正 commit を作成 → push 前に報告 → CEO 確認 → 修正版 push GO |
| **D: 既存 test regression 検出** | §9 緊急停止条件 §9.4 → 即停止 + CEO 報告 |
| **E: 凍結線 touch が必要に見える** | §9.7 → 即停止 + CEO 報告 |
| **F: 既存 worktree との差分検出** | §9.11 → 即停止 + CEO 報告 |
| **G: Alter Morning 系統 diff 検出** | §9.12 → 即停止 + CEO 報告 (CEO 補正反映) |

---

## §8 Step E 観測 (Step D 完了後、本書のスコープ外)

**正本**: handoff §2 Step E + B-6 執行ポリシー (CEO 2026-05-11 論点 3 確定)

| 観測対象 | 閾値 | 源 |
|---|---|---|
| **Bug-1 北極星** (Step C 直接成果) | `searchCandidatesCount ≥ 5` 中央値 | preview 30 件 |
| **Bug-2 北極星** (Step D 直接成果) | `catalogCount ≥ 5 / rankedCount ≥ 3 / missingWhereRejectCount ≤ 30%` | preview 30 件 (M2 完成後 `missingWhereRejectCount` は B1 で構造的に 0) |
| **Stage 1 Understand U1-U5** (B-6 統合) | U1 ≥ 95% / U2 ≥ 90% / U3 p50 ≥ 0.6 / U4 p95 ≤ 5s / U5 ≥ 95% | 5 pair × 3 invoke × 72h |
| **Bug-1 narration 接続効果** (条件 4 再観測) | qualitative (CEO 定性確認) | preview 10 サンプル + 内部ペア試用 |

**CEO 方針 2026-04-24 + 2026-05-11**: 観測フェーズは全実装完了後に 1 回で正しく取る (B-6 / Bug-1 narration / Bug-2 北極星 を Stage 2/3 完成後に統合観測)。

**catalog parser 強化 3 commit cleanup**: Step E 別判断 (CEO 2026-05-11 「温存」確定、Step D 期間中は触らない)。

---

## §9 緊急停止条件 (Bug-1 handover の教訓 + CEO 2026-05-11 追加補正 + GPT 指摘 v2 反映)

以下のいずれかが発生したら **即停止 + CEO 報告**:

1. ① 系統 resource を touch する必要が発生
2. 不可侵条文 (§4.3 統合契約 / runtime / master / Core UX v1.1 / 三段式 / Bug-1) を変更する必要が発生
3. mainstream plan / 三段式設計書 / handoff rev 6 / 統合契約 / runtime 契約 / master design 間で論理的矛盾が発生
4. 既存 test の regression 検出 (Step D 修正による副作用)
5. ① 系統の本番稼働に影響を及ぼす変更が必要
6. State Safety Rule 違反のリスク
7. §4.2 凍結線 file に diff が発生 (許容例外: D-1-d / D-2-e の movieOrchestrator + flags.ts 最小修正のみ)
8. global tsc errors が §2.6 baseline (約 1099) を超えた
9. 専用 worktree `Culcept-coalter-stepd` 外で本作業の file を touch する必要
10. `feat/coalter-stepd-movie-three-stage` 以外の branch で本作業の commit を作る必要
11. 既存 worktree (`Culcept-coalter` / `Culcept-coalter-bug1` 等) で `origin/main` が進み、本 worktree base に重要な差分が発生
12. **§4.4 Alter Morning 系統 file (path component pattern `(^|/)(alter-morning|alter)(/|$)|(^|/)morning` case insensitive で検出) への diff を検出** ← CEO 2026-05-11 追加補正 + GPT 指摘 v2 反映
13. §2.4 self-check で Step D 関連 file (`lib/coalter/movie/` / `COALTER_THREE_STAGE` 等) が既に実装済みと判明 (Bug-1 と同じ「過去作業の混入」状態)
14. CEO 2026-04-27 「映画 2 段階分離設計」 = 三段式 rev 3.2 の解釈に疑義 (本書 CEO 2026-05-11 確定済みだが、新セッションが疑義を持った場合)

---

## §10 報告プロトコル

### §10.1 各 commit 前必須 gate (Bug-1 handover の §4.4 + CEO 補正反映 + GPT 指摘 v2 反映)

各 Phase commit 前に **以下 5 gate を全て verify**:

```bash
cd /Users/haradataishi/Culcept-coalter-stepd

# Gate 1: typecheck (baseline 比較)
NODE_OPTIONS="--max-old-space-size=8192" \
  npx tsc --noEmit 2>&1 | grep -E "error TS" | wc -l
# 期待: §2.6 baseline (約 1099) と同じ、Step D 起因の新規 error 0

# Gate 2: test (既存 + 新規 全 PASS、回帰ゼロ)
NODE_OPTIONS="--max-old-space-size=8192" \
  npx vitest run tests/unit/coalter/ 2>&1 | tail -5
# 期待: 全 PASS

# Gate 3: build
npm run build 2>&1 | tail -10
# 期待: 成功

# Gate 4: 凍結線 verify (許容例外: D-1-d / D-2-e の movieOrchestrator + flags.ts のみ)
git diff --name-only | grep -E "foodOrchestrator|coalterDispatch|movieRanker|movieCatalog|presence|UpperLayerMount|MemorySurface|UrgentLayer|ModeSwitcher|instrumentation|emotion/|understanding/"
# 期待: 空 (出力ゼロ)

# Gate 5: Alter Morning 混入 verify (CEO 2026-05-11 追加補正、GPT 指摘 v2 反映)
git diff --name-only origin/main...HEAD | grep -iE '(^|/)(alter-morning|alter)(/|$)|(^|/)morning'
# 期待: 空 (出力ゼロ)
# 注: CoAlter 自身 (lib/coalter/...) は coalter/ の alter/ 部分文字列にもかかわらず
#     (^|/)alter(/|$) の path component 制約で誤検出されない (実証済)
#     -i (case insensitive) で MorningQuestion.tsx 等 CamelCase も網羅
```

**Gate 4 / Gate 5 が 1 行でも出力 → 即停止 + CEO 報告**。

### §10.2 報告タイミング

| timing | 報告必須項目 |
|---|---|
| **§2 self-check 完了時** | §2.1〜§2.7 全結果 + tsc baseline 値 + 着手 GO 仰ぎ |
| **D-1-a / D-1-b commit 完了** (push 前) | sha / 新設 file / §10.1 全 gate PASS / **未 push 状態** |
| **D-1-c commit 完了** (push 前) | 同上 + **D-1-d 着手 GO 待機** (CEO 補正 2) |
| **D-1-c push 完了** | push sha / origin verify / **D-1-d 着手 CEO GO 待機** |
| **D-1-d commit 完了** (push 前) | sha / 新設 file / §10.1 全 gate PASS + movieOrchestrator 最小性 verify / **未 push 状態** |
| **D-1-d push 完了** (= D-1 完了) | push sha / origin verify / **D-2 着手 CEO GO 待機** (自律進行 NG) |
| **D-2-a〜D-2-c commit 完了** (push 前) | sha / 新設 file / §10.1 全 gate PASS / **未 push 状態** |
| **D-2-d commit 完了** (push 前) | 同上 + **D-2-e 着手 CEO GO 待機** |
| **D-2-d push 完了** | push sha / origin verify / **D-2-e 着手 CEO GO 待機** |
| **D-2-e commit 完了** (push 前) | sha / 新設 file / §10.1 全 gate PASS + 構造 gate B1-B3 verify / grand kill switch default OFF verify / **未 push 状態** |
| **D-2-e push 完了** (= D-2 完了) | push sha / origin verify / Step D 完了判定 + Step E 観測準備 CEO 検証待機 |

### §10.3 自律判断ルール

- 進行中に発見する plan / spec 不整合は **canonical spec を採用**、commit msg に NOTE 記録
- 「より良い構造」発見時の自律 refactor 歓迎、ただし **正本帰属の根拠を commit msg / コメントに正確に書く** (cite した spec § が実際にその主張をしているか確認)
- 判断質問で停止するな (正本 doc で全て解決可能)。**plan / spec が矛盾した時のみ** 着手前に CEO 確認

---

## §11 CEO 2026-05-11 確定事項 (旧「論点」を確定として固定)

| 確定事項 | 内容 |
|---|---|
| **論点 1 確定: 番号体系** | handoff rev 6 採用 (D-1 = M1 Curate / D-2 = M2 Resolve)。M0 は Step B として完了扱い |
| **論点 2 確定: 三段式 rev 3.2 そのまま採用** | CEO 2026-04-27 「映画 2 段階分離」= 三段式 Stage 2 (Curate) + Stage 3 (Resolve)。新設計書起草不要 |
| **論点 3 確定: B-6 は Step E 統合のまま** | D-1 完了時点で先行実測しない |
| **論点 4 確定: catalog parser 強化 3 commit 温存** | revert なし、preview deploy なし、Step D 完了後の Step E で別判断 |
| **論点 5 確定: worktree / branch 名 OK** | path: `/Users/haradataishi/Culcept-coalter-stepd` / branch: `feat/coalter-stepd-movie-three-stage` / **base: `origin/main`** (CEO 補正 1) |
| **論点 6 確定: `Culcept-coalter-bug1` 一旦保持** | Step D worktree 作成 + §2 self-check 完了後に cleanup 判断 |
| **追加補正: D-1-d 進行制御** | D-1-c push 完了 → D-1-d **着手 CEO GO 必須** (CEO 補正 2) |
| **追加補正: COALTER_THREE_STAGE phase 統一** | grand kill switch は **D-2-e で新設予定** に統一 (CEO 補正 3) |
| **追加補正: Alter Morning 隔離 grep 修正 (v2)** | `grep -iE '(^|/)(alter-morning|alter)(/|$)|(^|/)morning'` 採用 (CEO 2026-05-11 GPT 指摘反映、旧 grep の `coalter/` 誤検出 致命的 bug 解消) |

---

## §12 完了条件

### §12.1 Step D-1 完了

- D-1-a〜D-1-d 全 4 commit 着地 (origin push 完了)
- G3 (narration 5 要素充足率) 100% (unit test) + B1 構造 gate 0 件
- flag OFF 既定で全 coalter test PASS (累積回帰ゼロ)
- §10.1 全 gate (Gate 1〜5) 全 commit で PASS
- CEO 受領確認 + D-2 着手 CEO GO

### §12.2 Step D-2 完了

- D-2-a〜D-2-e 全 5 commit 着地 (origin push 完了)
- 構造 gate B1-B3 全充足
- flag OFF 既定で全 coalter test PASS
- `COALTER_THREE_STAGE` grand kill switch 実装 + default OFF
- §10.1 全 gate (Gate 1〜5) 全 commit で PASS
- CEO 受領確認

### §12.3 Step D 全体完了 → Step E 観測準備

- D-1 + D-2 完了
- Step E 観測準備 (preview env / B-6 / Bug-1 narration / Bug-2 北極星 統合観測 plan 起草)
- CEO 観測 GO 後、Step E 着手判断は別 task

---

## §13 本 handover の最終扱い

- **本 handover は CEO 2026-05-11 補正反映後 + GPT 指摘 v2 反映後の正式版**
- file 化 timing: docs-only commit を `Culcept-coalter-bug1` worktree (`feat/coalter-bug1-step-c` branch) で実施 (CEO 2026-05-11 指示、push なし)
- 新セッションが Step D 着手時に本 file を参照
- 既存 `Culcept-coalter-bug1` / `feat/coalter-bug1-step-c` は本書 §2 self-check 完了後に cleanup 判断 (CEO 2026-05-11 論点 6 確定)

---

## 付録 A: 番号体系対応表 (handoff rev 6 vs mainstream plan §3)

| 本書 | handoff rev 6 §2 | mainstream plan §3 元番号 | 三段式 Phase | 内容 |
|---|---|---|---|---|
| (Step B 完了) | Step B (B-1〜B-6) | D-1-a〜D-1-e | M0 | Stage 1 Understand 共通基盤 |
| **D-1-a** | Step D-1 | 元 D-2-a | M1 | Query Derivation |
| **D-1-b** | Step D-1 | 元 D-2-b | M1 | Candidate Pool + Soft Filter |
| **D-1-c** | Step D-1 | 元 D-2-c | M1 | LLM Ranker + Narration |
| **D-1-d** | Step D-1 | 元 D-2-d | M1 | UI 連携 + flag (`movieCuratorLiveEnabled`) |
| **D-2-a** | Step D-2 | 元 D-3-a | M2 | theaterResolver 基盤 |
| **D-2-b** | Step D-2 | 元 D-3-b | M2 | adjacency table + Concentric Area Expansion |
| **D-2-c** | Step D-2 | 元 D-3-c | M2 | Tier fail state + 別作品再起動 |
| **D-2-d** | Step D-2 | 元 D-3-d | M2 | Stage 3 prefetch |
| **D-2-e** | Step D-2 | 元 D-3-e | M2 | flag (`COALTER_THREE_STAGE`) + orchestrator 組込 + diagnostics |

---

## 付録 B: 一目で分かる進行マップ

```
┌─────────────────────────────────────────────────────────────────┐
│ §2 着手前 self-check (worktree + git + Bug-1/M0 完了 verify     │
│   + Step D file 不在 verify + Alter Morning baseline + tsc base) │
│   全 ✅ で着手 GO 仰ぎ → CEO GO → D-1-a へ                       │
└────────────────────────────────────┬────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ D-1-a: Query Derivation (新規 file)                              │
│ D-1-b: Candidate Pool + Soft Filter + B1 構造 test (新規 file)   │
│ D-1-c: LLM Ranker + Narration (新規 file)                        │
│   各々 自律 commit → 報告 → CEO 受領 → push GO → push → 自律 GO │
└────────────────────────────────────┬────────────────────────────┘
                                     │ D-1-c push 完了 → CEO GO 必須 (CEO 補正 2)
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ D-1-d: UI 連携 + flag movieCuratorLiveEnabled (既存 touch)       │
│   CEO GO 受領 → 自律 commit → 報告 → CEO 受領 → push GO → push  │
└────────────────────────────────────┬────────────────────────────┘
                                     │ D-1 完了 → D-2 着手 CEO GO 必須
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ D-2-a: theaterResolver 基盤 (新規 file)                          │
│ D-2-b: adjacency + areaExpansion (新規 file)                     │
│ D-2-c: tierFailNarration (新規 file)                             │
│ D-2-d: stage3Prefetch (新規 file)                                │
│   各々 自律 commit → 報告 → CEO 受領 → push GO → push → 自律 GO │
└────────────────────────────────────┬────────────────────────────┘
                                     │ D-2-d push 完了 → D-2-e 着手 CEO GO 必須
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ D-2-e: COALTER_THREE_STAGE grand kill switch + 三段式分岐         │
│   (movieOrchestrator + flags 既存 touch、5 新規 diagnostics)    │
│   CEO GO 受領 → 自律 commit → 報告 → CEO 受領 → push GO → push  │
└────────────────────────────────────┬────────────────────────────┘
                                     │ Step D 完了 → Step E 観測準備 CEO 検証
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step E 観測 (本書スコープ外、CEO 別 task で起草)                  │
│   B-6 統合 + Bug-1 narration 再観測 + Bug-2 北極星 + Step C 累積  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 改訂履歴

| 日付 | 版 | 変更内容 | 承認 |
|---|---|---|---|
| 2026-05-11 | 案 | 初稿: worktree / branch / Phase 進行 / Step E 統合 / 6 論点提示 (チャット内提示のみ) | — |
| 2026-05-11 | 正式 v1 | CEO 補正 3 点反映 (① base = origin/main / ② D-1-d CEO GO 必須 / ③ COALTER_THREE_STAGE = D-2-e 統一) + Alter Morning 混入防止初版 (チャット内提示のみ) | CEO 2026-05-11 |
| 2026-05-11 | 正式 v2 | GPT 指摘反映: Alter Morning 検出 grep の致命的誤検出 bug 修正 (`coalter/` 誤検出を `(^|/)alter(/|$)` の path component boundary 制約 + `-i` case insensitive で解消)。docs-only commit として file 化 | CEO 2026-05-11 |
