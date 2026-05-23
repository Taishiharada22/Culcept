# Phase 3-M-3d Bugfix Closeout Audit (= FlowTab disclosure missing 修正 smoke PASS + freeze)

**作成日**: 2026-05-23
**承認**: CEO + GPT 合議 (= 2026-05-23 M-3d bugfix `98cd6b2a` の CEO visual smoke 再実施 PASS)
**範囲**: M-3d bugfix の closeout + freeze 宣言 + smoke PASS 記録 + supersedes 記録 + M phase 完結への接続
**前提**: M-3d impl `0352bdae` (= superseded) + M-3d bugfix `98cd6b2a` (= freeze 対象)

> 本 audit は **docs only**。 CEO smoke PASS の正式記録、 `98cd6b2a` を freeze 対象として確定、 `0352bdae` を superseded として記録、 M full closeout への接続点を明文化。

---

## 0. CEO Visual Smoke 結果 (= 再実施、 2026-05-23)

### 0.1 PASS 確認項目 (= CEO + GPT 明示、 9 項目)

| # | 確認項目 | 結果 |
|---|---|---|
| 1 | FlowTab / リストタブで「詳細」 が表示される | ✅ **PASS** (= bugfix 直接効果) |
| 2 | tap で「余白 N 分」 / 「不足 N 分」 表示 | ✅ PASS |
| 3 | 「閉じる」 で消える | ✅ PASS |
| 4 | 別の日でも独立して展開できる | ✅ PASS (= per-day state 動作確認) |
| 5 | CalendarTab 既存挙動に大きな崩れなし | ✅ PASS (= backward compat 100%) |
| 6 | MapTab 既存挙動に大きな崩れなし | ✅ PASS (= 完全不変) |
| 7 | warning / recommendation / optimization 文言なし | ✅ PASS |
| 8 | amber / orange / red なし | ✅ PASS |
| 9 | icon / warning badge なし | ✅ PASS |

### 0.2 機械検証との対応

| Smoke 確認 | 機械検証対応 |
|---|---|
| ① FlowTab で「詳細」 表示 | `flowTabFeasibilityDisclosureWiring.test.ts §3` (= stableEmptyExpanded + fallback chain regression、 3 件) |
| ② tap で展開 | `§5` (= per-day curry handler + applyDisclosureAction) |
| ③ 「閉じる」 で消える | `§3` (= state machine collapse 経由) |
| ④ 別の日で独立展開 | `§3` (= per-day state、 Record<isoDate, ExpandedTransitionIndices>) |
| ⑤ CalendarTab 既存不変 | `calendarTabFeasibilityDisclosureWiring.test.ts §11` (= MapTab/FlowTab 影響なし) |
| ⑥ MapTab 既存不変 | `mapTabFeasibilityDisclosureWiring.test.ts §4` (= post-M-3d 仕様、 hook 独立性) |
| ⑦ 警告文言なし | `§9` (= comment 除外 grep) |
| ⑧ amber/orange/red なし | `§9` (= grep) |
| ⑨ icon/badge なし | `§9` (= grep) |

→ **9 項目全件 visual + 機械の二重保証**で M-3d bugfix 成立。

---

## 1. Bugfix 達成事項

### 1.1 root cause の確定 + 修正

| 項目 | 詳細 |
|---|---|
| **根本原因** | FlowTab の `expandedByDay[iso]` が user tap 前 `undefined` → DayGraphTimeline `canDisclose` 判定で false → 「詳細」 hint 非表示 |
| **MapTab/FlowTab 差分** | MapTab/CalendarTab は `useState(resetAllDisclosures)` で初期空 Set、 FlowTab は `Record<>({})` で各 key undefined |
| **修正** | `useMemo(() => resetAllDisclosures(), [])` で stable empty set、 `dayExpanded = expandedByDay[iso] ?? stableEmptyExpanded` で fallback |
| **修正範囲** | FlowTab.tsx の 1 関数 + 1 行 (= 既存 wiring に変更を最小化) |

### 1.2 機械保証 + harden 規約整合性

| 規約 | 整合性 |
|---|---|
| M-3c-pure-harden: 永続 Set 定数を外部公開しない | ✅ (= `useMemo` は caller-side internal scope) |
| M-3c-pure-harden: caller は always-function-call | ✅ (= `resetAllDisclosures()` 公開 API 経由) |
| M-3c-pure-harden: mutation 攻撃面除去 | ✅ (= FlowTab 内部 useMemo、 外部アクセス path なし) |
| M-3b-pure: default = 全 hidden | ✅ (= 空 Set instance、 hidden 状態維持) |
| M-3c-ui: hidden 時 DOM 不在 | ✅ (= conditional render 維持) |
| M-3d: 「観測の幕間」 = week-level reset | ✅ (= useEffect([weekKey]) 不変) |
| M-3d: month/grid 不変 | ✅ (= CalendarTab 触らない、 backward compat 100%) |

→ **harden 規約に完全整合**、 新たな攻撃面追加なし。

### 1.3 数値的達成

| 項目 | 値 |
|---|---|
| **M-3d bugfix tests** (= FlowTab 拡張) | **42 PASS** (= 36 → +6、 内 3 件は bugfix regression) |
| **全 plan tests regression** | **2625 PASS** (= 2622 → +3) |
| **feasibility / DayGraphTimeline / MapTab / CalendarTab / FlowTab / hooks の tsc errors** | **0** |
| 変更 file | 2 (= FlowTab.tsx + flowTab test) |
| **MapTab / CalendarTab / DayGraphTimeline / lib/plan/\* 改変** | **0** |
| K / L / M-1〜M-3c-ui 既存 file 改変 | **0** |
| DB / env / package / dependency 変更 | **0** |
| 新規 fetch / endpoint / localStorage / runtime telemetry | **0** |

---

## 2. freeze 宣言 + supersedes 記録

### 2.1 freeze 対象 (= 触らない、 追加 commit 禁止)

- **`feat/alter-plan-phase3-m-3d-bugfix-flowtab-disclosure-missing`** @ **`98cd6b2a`**: **frozen** (= CEO smoke PASS で確定)
- M-3d readiness audit `docs/plan-phase3-m-3d-readiness-audit` @ `ed789adc`: **frozen**
- M-3c-ui MapTab-only `feat/alter-plan-phase3-m-3c-ui-maptab-only` @ `e5527f1b`: frozen (= 既存)
- 全既存 frozen branches (= K phase / L phase / M-3a 〜 M-3c-ui)

### 2.2 superseded 記録 (= 個別 freeze せず、 後継で代替)

- **`feat/alter-plan-phase3-m-3d-calendar-flow-feasibility-disclosure`** @ `0352bdae`: **superseded by `98cd6b2a`** (= bugfix 適用前)
- M-3c-pure (= 旧版) `feat/alter-plan-phase3-m-3c-pure-per-transition-disclosure-adapter` @ `11312aa7`: superseded by `399c5783` (= 既存)

### 2.3 凍結 file (= M-3d bugfix 範囲)

- `app/(culcept)/plan/tabs/FlowTab.tsx` (= bugfix 適用済 form、 stable empty set + fallback)
- `tests/unit/plan/flowTabFeasibilityDisclosureWiring.test.ts` (= 42 tests 含 3 bugfix regression)

### 2.4 frozen branches 合計

- **50 frozen branches** (= M-3c-ui closeout 時 49 + M-3d readiness audit + M-3d bugfix + 本 closeout = 51 但し M-3d impl `0352bdae` は superseded 扱いで -1 = **50**)

実態:
- 49 (= M-3c-ui closeout 時) + ed789adc + bugfix closeout = 51
- - `0352bdae` (= superseded) = **50**

### 2.5 凍結原則 (= 永続規約継承)

frozen branch (= 50 件) への追加 commit は **絶対禁止**。 新規変更は別 branch + 別 PR で対応。

---

## 3. 残論点 / Deferred (= M-3d-extend / M-4+ / 構造的)

### 3.1 短期 deferred (= M-3d-extend 候補)

| 項目 | 内容 | 想定 phase |
|---|---|---|
| **N 人 visual smoke** | CEO 1 人 smoke の質的範囲拡張 | M-3d-extend (= 必要に応じて別 phase) |
| **density guard** | FlowTab 7 日 × N transition で UI 圧緩和 (= single-open mode 等) | M-3d-extend (= smoke で「圧体験」 検出時) |

### 3.2 中期 deferred (= M-4+)

| 項目 | 内容 |
|---|---|
| daily counts disclosure | 「今日 余白 3 件 / 不足 1 件」 集計 disclosure |
| progressive trust building | 初回 / 2 回目 / 多日後で disclosure 進化 |
| per-transition counts pattern | 過去統計化 |

### 3.3 構造的 deferred (= M-5+)

| 項目 | 内容 |
|---|---|
| ambient indicator | 「ここに観測あり」 を超控えめ dot 等 |
| 集計 disclosure 別軸 | 「自分の傾向」 を別 UI |
| 共有モード制御 | 共有時 disclosure 非表示 |
| mobile gesture | swipe で expand |

### 3.4 「やらない」 と決めた事項 (= 永続規約)

- 警告色 (= amber/orange/red)
- icon / badge / warning box
- hover-only trigger
- localStorage / persist
- アコーディオン animation
- 「不足を指摘する」 文言
- 永続 Set 定数の外部公開 (= harden)
- per-day state で undefined を渡す (= bugfix で確立)

---

## 4. M-3d の限界 (= 明示認識、 M-3c-ui からの継承 + 追加)

### 4.1 1 人 smoke の限界 (= 継承)

- CEO 1 人で smoke、 N 人検証は別 phase

### 4.2 「不足」 文言の影響範囲 (= 継承)

- M-2a 固定文言、 M-4+ で再検討余地

### 4.3 mode 推定なし (= 継承)

- 全 transition 同様

### 4.4 density guard なし (= M-3d 固有)

- FlowTab 7 日 × N transition の case で UI 圧の可能性
- 1 人 smoke では未検出、 N 人 smoke で潜在的に発見の可能性
- M-3d-extend で必要に応じて追加 audit

### 4.5 per-day state の memory 線形増加 (= M-3d 固有、 軽微)

- `expandedByDay = Record<string, ReadonlySet<number>>` は week 内 7 day 以下
- localStorage 不使用なので persist しない
- session 内 memory のみ、 影響微小

---

## 5. 思想 transmission (= M-3d 完結後の永続規約、 20 件)

1. 観測の主導権を user に渡す
2. default = 全 hidden 永続規約
3. per-transition は M-3b-pure を N-fold lift
4. tab/day 切替で reset = 「観測の幕間」
5. 余白 / 不足 完全同 styling
6. counts は disclosure しない
7. 永続 Set 定数を外部公開しない (= harden)
8. caller は always-function-call (= harden)
9. 「pure 層は堅固、 UI に出す瞬間は別の危険境界」
10. 最小 textual hint「詳細」 で発見性確保 + 警告化回避
11. 三重防御 (= データ層 + 状態層 + 表示層) で push 表示構造的不可能化
12. conditional DOM render (= 視覚 hidden 禁止)
13. 3 props セット AND 条件で disclosure UI 活性化
14. `useState(resetAllDisclosures)` で default hidden 機械保証
15. `useEffect([selectedDate])` で 「観測の幕間」 自動 reset
16. per-tab independent hook
17. per-day disclosure state (= FlowTab、 Record<isoDate, ExpandedTransitionIndices>)
18. 「観測の幕間」 を week-level に lift
19. 「month / grid 不変」 規約 (= CalendarTab)
20. **per-day state pattern では stable empty fallback (= useMemo) を提供する** (= NEW、 bugfix で確立)

---

## 6. M-3d 達成の戦略的位置付け

### 6.1 「観測層 4 層構造 (= K/L/M/N+) の M 担当」 完成

```
Plan tab (= 場所 + 時間 + 移動 + 余白/不足 観測)
├─ K phase: 時間構造観測 ✅
├─ L phase: 移動構造観測 ✅
├─ M phase: 余白/不足観測
│   ├─ M-1 ✅ / M-2 ✅ / M-3a ✅ / M-3b ✅ / M-3c-pure-harden ✅
│   ├─ M-3c-ui (= MapTab) ✅
│   ├─ M-3d (= Calendar/Flow) ✅
│   └─ M-3d-bugfix (= 本 closeout) ✅
└─ N+: 別観測層 + Home/Plan polish (= 元計画 + CEO 補正)
```

→ **M phase 完全完了** (= 3 tab すべてで disclosure UI 成立、 smoke PASS)。

### 6.2 N 以降に継承可能な template (= M-3d 拡張版)

- 観測層 pipeline 標準 template (= L-4c-pure / M-3a 対称)
- state machine + N-fold lift pattern (= M-3b → M-3c-pure-harden)
- mutation harden pattern (= 永続定数 export なし)
- 三重防御 (= データ層 + 状態層 + 表示層)
- conditional DOM render
- per-tab independent hook (= MapTab/Calendar/Flow 独立 namespace)
- **per-day state + stable fallback pattern** (= M-3d で確立)
- CEO 1 人 smoke + 機械検証の二重保証

---

## 7. 凍結 / 連続 OK / 禁止リスト

### 7.1 凍結対象 (= 触らない)

- 全 50 frozen branches
- M-3d bugfix `98cd6b2a` + 関連 audit/test
- M-3c-ui MapTab-only `e5527f1b` + 関連
- M-3a 〜 M-3c-pure-harden 全 file
- M-1 / M-2 全 file
- K phase / L phase 全 file

### 7.2 連続 OK (= 本 audit のみ)

- `docs/alter-plan-phase3-m-3d-bugfix-closeout-audit.md` 新規作成
- `docs/decision-log.md` 追記
- branch: `docs/plan-phase3-m-3d-bugfix-closeout-audit`

### 7.3 禁止 (= 絶対に進まない)

- frozen branches への追加 commit (= 50 件)
- M-3d bugfix の `98cd6b2a` への変更
- DayGraphTimeline / MapTab / CalendarTab / FlowTab への disclosure 関連変更 (= 別 phase audit + 別 branch 必須)
- 「不足 N 分」 を常時表示
- amber / orange / red / icon / badge / warning box
- localStorage / persist
- Arrival Risk Memory / warning / recommendation / optimization
- DB / env / package / dependency 変更
- runtime telemetry sink / Counterfactual / Routes API / 実 API 連携
- Deploy readiness / Stargazer pivot / 初期 user 獲得 (= /plan complete 後)
- fetch / push / gh / reset / restore / stash / branch delete

---

## 8. 次への接続 (= M full closeout / Phase 3-N readiness audit)

### 8.1 次 Step (= 本 closeout 後)

| Step | 内容 |
|---|---|
| **Step B: M full closeout audit** | M-1〜M-3d 全体俯瞰 + M phase 完了宣言 + 永続規約 20 件 + 残 deferred 確定 |
| **Step C: Phase 3-N readiness audit** | N 責務確定 (= Counter-Factual/Pattern + Home/Plan polish) + N-1 最小 scope + /plan final closeout 残工程 |

### 8.2 進行禁止リスト (= CEO 訂正反映)

以下は **/plan complete 前** に進まない:
- Deploy readiness audit
- 本番 deploy
- Stargazer / Rendezvous / Genome への pivot
- 初期ユーザー獲得
- Routes API / 実交通 API 連携

---

## 9. CEO 報告 + 停止条件

### 9.1 本 audit の到達点

- M-3d bugfix CEO visual smoke PASS の正式記録 (= 9 項目)
- `98cd6b2a` freeze 宣言、 `0352bdae` superseded 記録
- root cause 確定 + 修正の達成事項言語化
- 残論点の deferred 化 (= 短期 / 中期 / 構造的 / やらない)
- M phase 完結への接続 (= 次 doc で詳述)

### 9.2 停止条件 (= 自律推論の境界)

以下のいずれかが発生した場合、 **即停止**:
- frozen branches (= 50 件) への追加 commit
- M-3d bugfix の追加変更 (= 別 phase audit 必要)
- 「不足 N 分」 を常時表示
- amber / orange / red / icon / badge 追加
- Arrival Risk / warning / recommendation / optimization 近接
- localStorage / DB / env / package / dependency 変更
- fetch / endpoint / runtime telemetry sink
- Counterfactual / Routes API / 実 API 連携
- Deploy readiness / 別軸 pivot

---

**完了**: M-3d bugfix closeout audit 着地。 CEO smoke PASS 記録 + freeze 宣言 + supersedes 記録 + 達成事項言語化 + 残論点 deferred 化 + 次 (M full closeout / Phase 3-N readiness audit) への接続点を明文化。
