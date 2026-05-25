# Phase 3-N Readiness Audit (= N 責務確定 + Home/Plan polish 棚卸し + N-1 最小 scope + /plan final closeout 残工程)

**作成日**: 2026-05-23
**承認**: CEO + GPT 合議 (= 2026-05-23 M full closeout audit `618bca18` 着地後、 「Phase 3-N readiness audit に進む」 指示)
**範囲**: N の責務確定 + Counter-Factual/Pattern の元計画 + Home/Plan polish の現状棚卸し + N-1 最小 scope + N でやらないこと + /plan final closeout 残工程 + CEO 判断材料
**前提**: 50 frozen branches + M phase 完了 (= `618bca18`) + /plan complete 前は別軸 pivot 禁止

> 本 audit は **docs only**。 N の責務範囲を確定し、 N-1 最小 scope を提案、 CEO 判断材料を提示する。 実装には進まない。

---

## 0. ゴールから逆算 (= /plan complete の最終形)

### 0.1 /plan complete の構成要素

> CEO 補正 (= 2026-05-23): 「/plan の計画を最後まで完了させる」 後に Deploy / Stargazer / 別軸へ進む。

**/plan complete の構成要素 (= 自律推論で再確認)**:
1. **観測層 4 層構造** (= K/L/M/N) の完成
2. **Home/Plan UI の polish** (= デザイン / レイアウト / 導線 / swipe / tab 体験)
3. **/plan final closeout audit** (= J/K/L/M/N + Home/Plan UI の完了監査)

### 0.2 現在地 (= 棚卸し)

| 構成 | 状態 |
|---|---|
| **観測層 4 層構造の K** | ✅ 完了 (= DayGraph) |
| **観測層 4 層構造の L** | ✅ 完了 (= Mobility Truth) |
| **観測層 4 層構造の M** | ✅ **完了** (= Day Feasibility Truth、 M-3d-bugfix まで) |
| **観測層 4 層構造の N** | ⏸️ **未着手** (= Counter-Factual / Pattern Truth Layer + CEO 補正で Home/Plan polish) |
| Home/Plan UI polish | ⏳ **partial** (= Phase 1/2 完了、 Phase 3 + polish 未完) |
| /plan final closeout audit | ⏸️ 未着手 (= N 完了後) |

### 0.3 本 audit の中心問い

> **「Phase 3-N の責務範囲は何か?」**

- 元計画 (= `alter-plan-phase3-l-transport-design.md` §0.3): Counter-Factual / Pattern Truth Layer
- CEO 補正 (= 2026-05-23): 上記 + Home/Plan final surface polish

→ N の責務を **元計画 + CEO 補正** の両方を含む形で確定する。

---

## 1. N の元計画責務 (= Counter-Factual / Pattern Truth Layer)

### 1.1 元計画上の N の定義 (= `alter-plan-phase3-l-transport-design.md` §0.3)

```
Layer 0 (= K-1):  予定と空白の構造
Layer 1 (= 3-L):  移動の存在と所要時間 (= Truth Layer)
Layer 2 (= 3-M):  間に合うか (= Risk Layer)
Layer 3 (= 3-N):  Counter-Factual (= 別の 1 日の選択肢)
```

### 1.2 N の責務 (= Counter-Factual 解釈)

| 候補解釈 | 内容 | 元計画整合 |
|---|---|---|
| 候補 A: Counter-Factual 反事実シナリオ | 「もし違う選択をしたら」 の差分観測 | 元計画明示 |
| 候補 B: Pattern Truth Layer | 複数日 pattern の観測 (= 「自分はこういう傾向」) | M phase Readiness で言及 |
| 候補 C: 両者統合 | A + B 両方 | 自律推論 |

### 1.3 「Aneurasync 中心問い」 との接続

> 「自分って、 そういう人間だったのか」

- **Counter-Factual**: 「あの日違う選択をしていたら」 → 別バージョンの自分の観測
- **Pattern**: 複数日の傾向 → 「自分はこういうリズムで動く人間」

→ 両者とも Aneurasync 中心問いに直結。 但し scope 大、 単一 phase で完結困難。

### 1.4 「Arrival Risk Memory との境界」 (= 永続禁止再確認)

`alter-plan-phase3-l-transport-design.md` §14 で定義済:

| 項目 | M | N (= Pattern Truth) | Arrival Risk Memory (= **永続禁止**) |
|---|---|---|---|
| 観測対象 | 1 日内余白/不足 | 複数日 pattern | 個別予定の遅刻リスク評価 |
| 出力 | 「余白/不足 N 分」 | (TBD) | 「遅刻リスク 70%」 |
| 性質 | 量的中立 | 観測のみ | 評価 / 警告 |

**N は Arrival Risk Memory ではない**。 「Pattern 観測」 と「リスク評価」 は別 concept。

---

## 2. CEO 補正で追加された Home/Plan polish 責務

### 2.1 CEO 明示 (= 2026-05-23)

> 「N に Home / Plan final surface polish を含めて計画する」
> 「Home デザイン / レイアウト / Plan 導線 / swipe / tab 体験」 が未完了項目

### 2.2 Home/Plan polish の構成要素 (= 自律推論で分解)

| 構成 | 内容 |
|---|---|
| **Home デザイン** | AneurasyncHome 全体の visual 完成度 |
| **Home レイアウト** | spacing / sizing / 配置の完成度 |
| **Plan 導線** | Home → Plan への遷移 体験 (= swipe) |
| **swipe 体験** | HomeSwipeContainer の動き / lock / smoothness |
| **tab 体験** | Plan 内の MapTab / CalendarTab / FlowTab 切替 |
| **その他 polish** | コピー / icon / micro-interaction 等 |

### 2.3 Home/Plan polish の現状棚卸し (= 過去 docs より)

#### 2.3.1 Phase 1: Home Swipe UI integration (= 完了)

- **Status**: PASS (CEO 視覚 smoke 2026-05-20 確認)
- `docs/alter-plan-home-swipe-full-plan-pane-phase1-complete.md` 参照
- Home → swipe → Plan 本体 pane の構造完成

#### 2.3.2 Phase 2-A: CalendarTab 月ビュー化 (= 完了)

- **Status**: 実装完了、 CEO local smoke PASS、 commit `6e37ad38` で frozen
- branch: `feat/alter-plan-phase2-a-calendar-week-strip`
- CalendarTab は **既に月ビュー化済**

#### 2.3.3 Phase 2-B: FlowTab image thumbnail リスト (= 完了)

- **Status**: 実装完了、 CEO local smoke PASS、 commit `99e7c02a` で frozen
- branch: `feat/alter-plan-phase2-b-flow-list`
- FlowTab は **既に image thumbnail 化済**

#### 2.3.4 Phase 2-C: MapTab Google Maps integration (= 実装済、 v2 採択待ちあり)

- **Status**: v1 実装済、 v2 採択待ち
- `docs/alter-plan-phase2-c-map-tab-mini-design.md` 参照
- MapTab は **Google Maps integration 済** (= 確認: `useGoogleMapsScript` import あり)

#### 2.3.5 Phase 3 (= 旧 Home Swipe Phase 3): 空き日 → ALTER 提案 flow (= **未着手**)

- 予定なし日タップ → ALTER 自然質問
- 提案チップ → おすすめ提案 (= タイトル + 画像) → 1tap で予定作成
- Stargazer / Alter engine 接続が必要
- これは Phase 3-N の Home/Plan polish と統合可能

### 2.4 Home/Plan polish の **真の残範囲**

| 残範囲 | 状態 | N で扱うべきか |
|---|---|---|
| Home design 微調整 | TBD (= 具体は CEO 判断) | ✅ N |
| Plan tab UI polish | TBD (= 既存 K/L/M 接続済、 細部 polish) | ✅ N (= optional) |
| swipe 体験 polish | TBD | ✅ N (= 必要時) |
| 「予定なし日 → ALTER flow」 | 未着手 (= 元 Home Swipe Phase 3) | ⚠️ 大規模、 N に含めるか別 wave か CEO 判断 |
| Counter-Factual / Pattern | 未着手 (= 元 Phase 3-N) | ⚠️ 大規模、 別 phase でも可 |

---

## 3. N の責務確定 (= 自律推論で 3 候補比較)

### 3.1 候補比較

| 候補 | N の責務 | scope | 優先 |
|---|---|---|---|
| **候補 X: 統合型 N** | Counter-Factual + Pattern + Home/Plan polish 全部 | 大 | ⚠️ scope 巨大、 単一 phase で完結困難 |
| **候補 Y: 段階分割型 N** | N-1 = Home/Plan polish (= 小 scope) → N-2 = Counter-Factual / Pattern (= 大 scope、 後回し) | 中-大 | ✅ 自律推奨 |
| **候補 Z: polish のみ N** | N = Home/Plan polish のみ、 Counter-Factual / Pattern は別 phase O+ に保留 | 小 | ⚪ 元計画と乖離 |

### 3.2 自律推奨 (= 候補 Y: 段階分割型 N)

**根拠**:
- **/plan complete までの最短 path**: Home/Plan polish が完了すれば /plan の体験が user に届く
- **Counter-Factual / Pattern は大規模設計**: 観測 layer 4 層目だが、 単一 wave で完結困難
- **段階分割**で各 step の risk を制御可能

**N-1 (= 最小 scope)**:
- Home/Plan UI polish (= デザイン / レイアウト / swipe / tab 体験)
- 既存 Phase 2-A/B/C で実装済の部分を **棚卸し + polish**
- 「予定なし日 → ALTER flow」 は scope 大なので N-2 以降

**N-2 (= 別 phase)**:
- 「予定なし日 → ALTER flow」 (= 大規模、 Alter engine 接続必要)
- Counter-Factual / Pattern Truth Layer (= 元計画、 大規模)

### 3.3 候補 Z (= polish のみ) の検討

CEO 上位方針 (= /plan complete → Deploy → Stargazer 等) を考慮すると、 候補 Z (= polish のみ + Counter-Factual/Pattern は別 phase) も妥当:
- /plan complete までは polish に集中
- Counter-Factual / Pattern は Aneurasync の中長期 vision なので別 phase でも可

→ **CEO 判断 必要**: N に Counter-Factual/Pattern を含めるか / 別 phase か。

---

## 4. N-1 最小 scope (= 自律推奨候補)

### 4.1 N-1 の責務 (= Home/Plan polish 最小 scope)

| 項目 | 内容 | 規模 |
|---|---|---|
| **N-1a: 全 Plan 体験棚卸し audit** | 現状の Home swipe → Plan tabs → disclosure 体験を CEO smoke で棚卸し | 小 (= docs + smoke) |
| **N-1b: polish 候補リスト確定** | CEO 判断で具体的な polish 項目を確定 | 小 (= docs) |
| **N-1c: 各 polish の小 wave 実装** | リストの上位から 1-2 件ずつ実装 | 中 (= 各 wave で慎重) |

### 4.2 N-1a (= 全 Plan 体験棚卸し) 詳細

**自律推論で「現状の Plan 体験」 を整理**:

1. Home → swipe → Plan 本体への遷移 (= Phase 1 PASS)
2. Plan 内の tab 切替 (= MapTab / CalendarTab / FlowTab)
3. MapTab 体験: 地図 + 1 日の構造 + feasibility disclosure (= M-3c-ui smoke PASS)
4. CalendarTab 体験: 月ビュー + selected day timeline + feasibility disclosure (= M-3d smoke PASS)
5. FlowTab 体験: 7 日 image thumbnail + each day timeline + feasibility disclosure (= M-3d-bugfix smoke PASS)
6. 予定追加 (= FAB → AddAnchorModal)
7. 予定詳細 (= AnchorDetailModal)
8. 提案 (= ProposalChip、 J-6 phase)
9. swipe で Home に戻る

**CEO smoke で確認するべき項目**:
- 各画面の visual 完成度
- 動作の smoothness
- spacing / sizing
- copy の中立性 + 正確性
- micro-interaction
- a11y (= keyboard / screen reader)

### 4.3 N-1b (= polish 候補リスト)

CEO smoke + 棚卸し後に、 以下のような候補を確定:

| 候補 | 例 |
|---|---|
| visual polish | spacing / typography / 色階調 |
| layout polish | tab pill 位置 / FAB 位置 / Modal 高さ |
| copy polish | empty state 文言 / hint 文言 |
| swipe polish | 速度 / boundary / animation |
| micro-interaction | tap feedback / loading state |

### 4.4 N-1c (= 各 polish の小 wave 実装)

- 1 wave で 1-2 件の polish のみ
- 各 wave で CEO smoke
- 大規模 refactor は禁止 (= polish のみ)

---

## 5. N でやらないこと (= scope 制御)

### 5.1 N-1 (= polish) でやらないこと

| 項目 | 理由 |
|---|---|
| 大規模 refactor | polish のみ scope |
| 新 tab 追加 | scope 外 |
| disclosure 追加 (= M phase 完了済) | M phase の追加変更禁止 |
| Counter-Factual 実装 | N-2 以降 |
| Pattern Truth Layer 実装 | N-2 以降 |
| Stargazer / Alter engine 接続 | 別軸 |
| 「予定なし日 → ALTER flow」 | N-2 以降 (= 大規模) |
| Routes API / 実 API 連携 | /plan complete 後 |
| Deploy readiness | /plan complete 後 |

### 5.2 N 全体でやらないこと (= 永続規約継承)

- Arrival Risk Memory (= 永続禁止)
- warning / recommendation / optimization 文言 (= 永続禁止)
- amber / orange / red 警告色
- icon / badge / warning box
- localStorage / persist
- DB / env / package / dependency 変更
- runtime telemetry sink
- Counterfactual の実装 (= scope 大、 N-2+)
- 別軸 pivot (= /plan complete 前)
- fetch / push / gh / reset / restore / stash / branch delete

---

## 6. /plan final closeout までの残工程

### 6.1 残工程 (= 自律推論)

```
[本 audit: Phase 3-N readiness audit] (= 本 commit)
          ↓
[N-1a: 全 Plan 体験棚卸し audit] (= 別 doc + CEO smoke)
          ↓
[N-1b: polish 候補リスト確定] (= CEO 判断)
          ↓
[N-1c: 各 polish の小 wave 実装] (= 1 wave / 1-2 件、 CEO smoke 都度)
          ↓
[N-1 closeout audit] (= polish PASS の正式記録)
          ↓
[CEO 判断: N-2 (= Counter-Factual / Pattern) に進むか、 別 phase に保留か]
          ↓
(N-2 を進める場合)
[N-2 readiness audit + 実装 + closeout]
          ↓
[/plan final closeout audit] (= J/K/L/M/N + Home/Plan UI 完了監査)
          ↓
(/plan complete)
          ↓
[Deploy readiness audit] (= /plan complete 後の判断)
```

### 6.2 想定 timeline (= 自律推論、 不確定)

| Step | 想定期間 | 注意 |
|---|---|---|
| N-1a 棚卸し | 1-2 日 | CEO smoke 含む |
| N-1b 候補リスト | 1 日 | CEO 判断 |
| N-1c 小 wave (1 wave) | 1-3 日 | CEO smoke 都度 |
| N-1c 全 wave 完了 | 1-2 週間 | 候補数による |
| N-1 closeout | 1 日 | freeze |
| N-2 (= 進む場合) | 数週間 | 大規模、 別 audit |
| /plan final closeout | 1-2 日 | 完了監査 |

---

## 7. 革新的アイデア (= N readiness audit 固有、 5 件)

### 7.1 革新 N-1: 「polish 棚卸し」 を「観測の追加 layer」 として扱う

通常: polish = visual 調整のみ
革新: polish = 「user が Plan を観測した時の体験全体」 の棚卸し → Aneurasync 中心問いとの接続強化

### 7.2 革新 N-2: 「N-1 = 観測体験の最終仕上げ、 N-2 = 観測の次元拡張」 の二分

通常: N = 単一 phase
革新: N-1 (= 同次元の仕上げ) と N-2 (= 次元拡張 = Counter-Factual / Pattern) を二分

利点:
- /plan complete の最短 path 確保 (= N-1)
- 次元拡張 (= N-2) は中長期で慎重に
- CEO 上位方針整合性 (= /plan complete → Deploy → Stargazer)

### 7.3 革新 N-3: 「polish 候補リスト」 を CEO smoke 主導で確定

通常: polish 項目を engineer が提案
革新: CEO smoke で「気になった項目」 を直接拾う → user 視点 100%

### 7.4 革新 N-4: 「観測の幕間 ベースの全体動線確認」

Plan 内の各遷移で「観測の幕間」 (= reset) 体験を統一確認:
- tab 切替 → disclosure state reset
- day 切替 → reset
- week 切替 → reset
- Plan ↔ Home swipe → state preserve (= 同 user context)

革新: 「観測の幕間」 を Home/Plan UI 全体で統一規約化。

### 7.5 革新 N-5: 「ALTER flow を N-2 以降に保留」 = scope 制御

「予定なし日 → ALTER flow」 は Stargazer engine 接続が必要で大規模。 N-1 (= polish のみ) では扱わず、 N-2 で慎重 audit。

---

## 8. CEO 判断項目 (= 報告で停止)

### 8.1 6 件の CEO 判断

1. **N の責務範囲**: 候補 X (= 統合型) / **候補 Y (= 段階分割型、 自律推奨)** / 候補 Z (= polish のみ)
2. **N-1 最小 scope の承認**: 全 Plan 体験棚卸し + polish 候補リスト + 各 polish の小 wave 実装
3. **「予定なし日 → ALTER flow」 の取扱**: N-2 以降 / 別軸 / /plan scope 外
4. **Counter-Factual / Pattern の取扱**: N-2 以降 / 別 phase / 中長期保留
5. **N-1a (= 棚卸し audit) の進め方**: 本 audit 着地 → N-1a 別 doc / 本 audit と並行
6. **/plan complete の境界線**: N-1 完了で /plan complete か、 N-2 まで含めるか

### 8.2 critical boundary (= CEO 必須判断)

| Boundary | 内容 |
|---|---|
| G1: N の scope | 統合 / 段階分割 / polish のみ |
| G2: ALTER flow を N に含めるか | scope 大の Stargazer 接続 |
| G3: Counter-Factual / Pattern の優先度 | /plan complete までに必要か |
| G4: /plan complete の定義 | N-1 完了で OK か N-2 まで必要か |

---

## 9. 自律推奨 + 段階的 path

### 9.1 自律第 1 推奨

**N の責務 = 候補 Y (= 段階分割型)**:
- **N-1**: Home/Plan polish (= 全 Plan 体験棚卸し + 小 wave polish 実装)
- N-2: Counter-Factual / Pattern (= 中長期、 別 phase 着手判断)

**/plan complete = N-1 完了時点**:
- M phase + N-1 (= polish) で 「観測層 OS の完成 + UI 完成度向上」 が成立
- Counter-Factual / Pattern は中長期 vision で別 phase

### 9.2 「予定なし日 → ALTER flow」 の扱い

- N-1 (= polish) には含めない (= scope 大)
- N-2 で扱うか、 別軸 (= Stargazer/Alter engine) で扱うか CEO 判断
- 自律推奨: **別軸 (= Stargazer engine 接続)** で扱う、 N からは外す

### 9.3 段階的 path 提案

```
[本 audit (= Phase 3-N readiness audit) ✅]
          ↓
[N-1a 棚卸し audit] (= 全 Plan 体験 CEO smoke + 整理)
          ↓
[N-1b polish 候補リスト] (= CEO 判断)
          ↓
[N-1c 小 wave 実装] (= 1 wave / 1-2 件、 CEO smoke 都度)
          ↓
[N-1 closeout audit] (= polish 完了宣言)
          ↓
[/plan final closeout audit] (= J/K/L/M/N-1 完了監査)
          ↓
(/plan complete 達成)
          ↓
(後): N-2 (= Counter-Factual / Pattern) / Deploy / Stargazer / 別軸
```

---

## 10. 凍結 / 連続 OK / 禁止リスト

### 10.1 凍結対象 (= 触らない、 51 frozen branches 含む本 audit)

- 全 50 frozen branches (= K/L/M phase + Home Swipe Phase 1-2)
- M phase 完了 file 全件
- 本 audit (= 着地後 freeze 予定)

### 10.2 連続 OK (= 本 audit のみ)

- `docs/alter-plan-phase3-n-readiness-audit.md` 新規作成
- `docs/decision-log.md` 追記
- branch: `docs/plan-phase3-n-readiness-audit`

### 10.3 禁止 (= 絶対に進まない)

- frozen branches への追加 commit
- N-1 実装 (= 本 audit は docs only、 N-1a 棚卸し audit 経由が必要)
- 大規模 refactor
- 新 tab 追加
- M phase の追加変更
- Counter-Factual / Pattern 実装 (= N-2 以降)
- Stargazer / Alter engine 接続 (= 別軸)
- 「予定なし日 → ALTER flow」 (= 別軸 or N-2 以降)
- Routes API / 実 API 連携 (= /plan complete 後)
- Arrival Risk Memory (= 永続禁止)
- warning / recommendation / optimization 文言 (= 永続禁止)
- amber / orange / red / icon / badge / warning box
- localStorage / persist
- DB / env / package / dependency 変更
- runtime telemetry sink
- **Deploy readiness audit / 本番 deploy / Stargazer pivot / 初期 user 獲得** (= /plan complete 後)
- fetch / push / gh / reset / restore / stash / branch delete

---

## 11. CEO 報告 + 停止条件

### 11.1 本 audit の到達点

- N の責務確定 (= 元計画 Counter-Factual/Pattern + CEO 補正 Home/Plan polish)
- N 候補 3 件比較 (= 統合 / 段階分割 / polish のみ)
- 自律推奨 (= 段階分割型 N、 N-1 = polish、 N-2 = Counter-Factual/Pattern)
- Home/Plan polish 現状棚卸し (= Phase 1-2 完了、 Phase 3 未着手、 真の polish 残範囲特定)
- N-1 最小 scope 提案 (= 棚卸し + 候補リスト + 小 wave 実装)
- N でやらないこと一覧
- /plan final closeout までの残工程
- 革新的アイデア 5 件
- CEO 判断項目 6 件

### 11.2 停止条件 (= 自律推論の境界)

以下のいずれかが発生した場合、 **即停止**:
- frozen branches への追加 commit
- 本 audit は docs only、 実装に進まない
- 大規模 refactor の必要性
- Counter-Factual / Pattern の実装着手 (= N-2 別 audit)
- Stargazer engine 接続 (= 別軸)
- Arrival Risk / warning / recommendation / optimization 近接
- localStorage / DB / env / package / dependency 変更
- fetch / endpoint / runtime telemetry sink
- Deploy readiness / 別軸 pivot

---

**完了**: Phase 3-N readiness audit 着地。 N 責務確定 (= 段階分割型自律推奨) + Home/Plan polish 現状棚卸し + N-1 最小 scope + /plan final closeout 残工程 + CEO 判断 6 件。 次は CEO 判断 → N-1a 棚卸し audit (= 別 doc)。
