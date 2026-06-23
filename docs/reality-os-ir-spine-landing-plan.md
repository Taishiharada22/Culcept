# Reality IR スパイン 着地計画（read-only 調査・docs-only）

- **作成日**: 2026-06-23
- **worktree**: `/Users/haradataishi/Culcept-task-store-a9eedce69`
- **branch**: `claude/task-store-migration-on-a9eedce69-20260623`（base = local main `a9eedce69`・包含確認済）
- **source（参照のみ・書換なし）**: 旧RO `claude/xenodochial-chatelet-0023b2` @ `42ab074bc`
- **状態**: docs-only。**実コード移植・runtime 実装・PredictionLedger 実装は未着手**（別 GO）。本書は「何を・どの順で・どんな衝突予測で着地するか」の計画のみ。
- **位置づけ**: ロードマップ P1（スパイン統合 + IR 着地）の read-only 設計。canonical task kernel(13本)を「孤立 ⭕️」→「on-base ⭕️」へ進める前提工程。

---

## 0. 結論（先出し）

Reality IR スパインの compile closure は **realityCore 25本**。うち **11本は既に新branch に着地済**（C1/C2 で carry 済）、**要着地は realityCore 14本 + 外部新規 `lib/plan/canonicalHash.ts` 1本 = 計15本**。

- **欠落している外部依存は `canonicalHash` ただ1つ**（graphIdentity が import・a9eedce69 に不在）。他の外部依存（dayGraph / dayState / external-anchor / reality-authority / reality-permission / transport / stargazer-alterHomeAdapter / timeOfDay）は **すべて a9eedce69 に存在**。
- 15本はすべて a9eedce69 に**存在しない新規パス**（additive）。a9eedce69 は realityCore を一切持たない → **git 衝突は予測ゼロ**（C1/C2 の13本が conflict ゼロで載ったのと同型）。
- 真の注意点は git 衝突でなく **型/契約ドリフト**（後述 §3）。per-tier の tsc gate で吸収する。

---

## 1. IR スパイン依存閉包（25本・seed→BFS on 42ab074bc）

seed = `realityJudgmentInput` / `realityGraphSnapshot` / `realityFrame` / `realityGraphEdge` / `realityInstant` / `realityChange` / `realityAttribute`。realityCore 内部 `./X`（`import("./X")` 含む）を不動点まで追跡 → 25本。

### 既に新branch に着地済（11本・再着地不要）
`eventRealityNode` / `leaveByAdapter` / `leaveByComputation` / `leaveByLines` / `realityAttribute` / `routeEtaCapability` / `routeEtaDurationValue` / `routeEtaProviderAdapter` / `routeEtaSafety` / `scheduledWorkBlock` / `taskRealityNode`
（※ on-branch 13本のうち `canonicalTask` / `compileEventRealityNodes` は IR スパイン閉包外）

### 🔶 要着地（realityCore 14本）
`commitmentSignal` / `decisionDebt` / `graphIdentity` / `momentSnapshot` / `movementReality` / `realityChange` / `realityDiff` / `realityFrame` / `realityGraphEdge` / `realityGraphSnapshot` / `realityInstant` / `realityJudgmentInput` / `taskEdgePrep` / `taskOutcome`

### 🔶 要着地（外部新規 1本）
`lib/plan/canonicalHash.ts` — `graphIdentity` の唯一の欠落依存。**self-contained pure**（import ゼロ確認済）。realityCore 外だが pure 依存 tail として同梱必須。

---

## 2. 着地順序（topological / Kahn・各時点で依存解決済）

| tier | 着地ファイル | 依存（解決済前提） |
|---|---|---|
| **前提** | `lib/plan/canonicalHash.ts` | なし（pure・graphIdentity 前提） |
| **0** | `commitmentSignal` / `graphIdentity` / `movementReality` / `realityInstant` / `taskOutcome` | 未着地 realityCore 依存なし（外部 + on-branch のみ） |
| **1** | `decisionDebt` / `taskEdgePrep` | commitmentSignal / scheduledWorkBlock(on-branch) |
| **2** | `momentSnapshot` | commitmentSignal / movementReality / ern(on-branch) 等 |
| **3** | `realityGraphSnapshot` | commitmentSignal / momentSnapshot / decisionDebt / movementReality |
| **4** | `realityFrame` / **`realityJudgmentInput`（キーストーン）** | realityGraphSnapshot |
| **5** | `realityDiff` / `realityGraphEdge` | eventRealityNode(on-branch) / realityFrame |
| **6** | `realityChange` | realityDiff |

**線形手順（この順で per-file 着地すれば各段で型解決）**:
```
0. lib/plan/canonicalHash.ts
1. commitmentSignal  2. graphIdentity  3. movementReality  4. realityInstant  5. taskOutcome
6. decisionDebt      7. taskEdgePrep   8. momentSnapshot    9. realityGraphSnapshot
10. realityFrame     11. realityJudgmentInput               12. realityDiff
13. realityGraphEdge 14. realityChange
```
→ キーストーン `realityJudgmentInput`（全 RJ 部署が読む単一正本入力束）は **tier 4**。スパインは「閉包15本を依存順で積み上げ、頂点に realityJudgmentInput が載る」構造。

---

## 3. 衝突予測

| 種別 | 予測 | 根拠／緩和 |
|---|---|---|
| **git マージ衝突** | 🟢 **ゼロ予測** | 15本すべて a9eedce69 に不在の新規パス。additive。realityCore を a9ee は持たない。C1/C2 の13本が conflict ゼロで載った実績と同型 |
| **欠落外部依存** | 🟡 **1件のみ**（`canonicalHash`） | 同梱で解消（tier 前提に配置済）。他の外部依存は全て a9ee 在を確認済 |
| **型/契約ドリフト**（真のリスク） | 🟡 **要 per-tier tsc** | 14本は `42ab074bc`(分岐 533be2e5) 由来。a9ee の外部依存（dayGraphTypes / dayStateTypes / transportTypes / authority / permission-model / alterHomeAdapter 等）が分岐後に shape 変化していれば、着地ファイルが参照する symbol とズレる可能性。**ただし on-branch 11本（同じ外部依存群を使用）が tsc55 で緑＝主要依存は互換**。リスクは低だが、各 tier 着地後に `tsc`(55維持) で機械検知する |
| **byte 一致** | 期待 byte一致 | a9ee は当該15本を持たないため、`git show 42ab074bc:<path>` 由来でそのまま着地（C1/C2 と同じ手法）。着地後 hash 照合で検証 |

---

## 4. 着地の作法（次 GO 時の規律・本書では実行しない）

- **per-file 着地**（`git show 42ab074bc:<path> > <path>`）。**whole-branch merge / cherry-pick of whole commits は禁止**（C1/C2 と同じ path単位）。
- **tier ごとに tsc(55維持) + reality 関連 test を gate**。増分 error が出たら即停止・報告（型ドリフト検知）。
- 着地後に**旧RO と byte一致**を hash で確認。
- `supabase/.temp` / `.branches` / `.env.local` / `.claude/launch.json` / `node_modules` / `next.config.js` / `proxy.ts` は**一切触れない**。docs/コードのみ個別 stage。

---

## 5. 次に code 移植へ進める最小 scope（提案・GO 待ち）

**L1（最小）= tier 前提 + tier 0**：`canonicalHash` + `commitmentSignal` / `graphIdentity` / `movementReality` / `realityInstant` / `taskOutcome`（計6本）を per-file 着地 → tsc55 + test 緑を確認 → docs/closeout。
- 理由：未着地 realityCore 依存ゼロの葉群＋唯一の外部欠落。最も安全に「型ドリフトが無いこと」を実証でき、以降の tier の前提が揃う。
- L2 以降：tier 1→6 を順に（最終 tier 4 で realityJudgmentInput キーストーンが載る）。

---

## 6. DB / migration / env / production 不接触

本調査・本書は **realityCore/canonicalHash の参照と docs 作成のみ**。supabase/migrations・SQL・seed・env・featureFlags・UI・PredictionLedger runtime いずれも**不接触**。production/Supabase 操作ゼロ。
