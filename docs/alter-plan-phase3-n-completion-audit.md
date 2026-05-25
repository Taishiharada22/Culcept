# Phase 3-N Plan Completion Audit (= N 全責務確定 + 5 phase 分割 + /plan complete 条件)

**作成日**: 2026-05-23
**承認**: CEO + GPT 訂正 (= 2026-05-23 「N-1 完了 = /plan complete は不採用、 N 全責務を漏れなく確定」 指示)
**範囲**: N の全責務を **元計画 + CEO 補正** で漏れなく確定 + 5 phase 分割提示 (= GPT 明示 N-1〜N-5) + /plan complete 条件 5 件 + 「やらない」 判断は CEO 明示承認必要 + 内部矛盾発見の surface
**前提**: M phase 完了 (= `618bca18`) + 51 frozen branches + /plan complete 前は別軸 pivot 禁止

> 本 audit は **docs only**。 N の全責務を **勝手に縮小せず**、 全 5 phase を CEO 判断材料として提示する。 「defer / scope 外化」 判断は CEO 明示承認のみで可能。 元計画と M readiness audit の N 定義に **矛盾** を発見、 CEO 確認必要。

---

## 0. 補正への対応 (= GPT 訂正反映)

### 0.1 訂正前 (= Phase 3-N readiness audit `11e18134`) の問題

| 訂正前 | 問題 |
|---|---|
| 「N-1 完了 = /plan complete」 | ❌ 勝手な scope 縮小、 CEO 方針違反 |
| 「Counter-Factual / Pattern は N-2 / 別 phase / 中長期保留」 | ❌ 勝手な defer、 CEO 明示承認なし |
| 「空き日 → ALTER flow は別軸推奨」 | ❌ 勝手な scope 外化、 CEO 明示承認なし |
| 自律推奨で 段階分割型 Y 確定 | ⚠️ 自律で進行できる範囲 (= 棚卸し doc) のみ確定すべき |

### 0.2 訂正後 (= 本 audit) の対応

| 訂正後 | 対応 |
|---|---|
| N の全責務を漏れなく確定 | ✅ 元計画 + CEO 補正の全項目を保持 |
| 5 phase 分割 (= N-1〜N-5) で提示 | ✅ GPT 明示の分割案を採用 |
| 「やらない」 判断は CEO 明示承認のみ | ✅ Claude 側で defer / scope 外化しない |
| /plan complete = N 全 5 phase 完了 + final closeout | ✅ 「N-1 完了 = /plan complete」 撤回 |
| 矛盾発見 (= Counter-Factual の永続禁止 vs 元計画) | ✅ CEO に surface、 判断委ねる |

---

## 1. N の全責務 (= 元計画 + CEO 補正の漏れなき棚卸し)

### 1.1 元 Phase 3 docs 上の N の責務

**1.1.1 `alter-plan-phase3-l-transport-design.md` §0.3 (= 2026-05-22)**:

```
Layer 0 (= K-1):  予定と空白の構造
Layer 1 (= 3-L):  移動の存在と所要時間 (= Truth Layer)
Layer 2 (= 3-M):  間に合うか (= Risk Layer)
Layer 3 (= 3-N):  Counter-Factual (= 別の 1 日の選択肢)
```

→ **N = Counter-Factual (= 反事実シナリオ、 別の 1 日の選択肢)**

**1.1.2 `alter-plan-phase3-m-readiness-audit.md` §0 / §9 (= 2026-05-23、 M phase 着手前)**:

```
| N = 複数日 pattern 観測 (= Pattern Truth Layer) | 別 phase | 未着手 |
| N 候補 1 | 複数日 pattern 観測 (= Pattern Truth Layer) | ✅ 観測のみ (= 設計次第) |
| 永続禁止 | Counterfactual generation | 推奨に近づく |
```

→ **N = Pattern Truth Layer (= 複数日傾向観測、 観測のみ)**
→ **Counterfactual generation は永続禁止** (= 「推奨に近づく」、 思想違反)

**1.1.3 `alter-plan-home-swipe-full-plan-pane-phase1-complete.md` §2.3 (= 別ロードマップ Phase 3)**:

```
Phase 3: 空き日 → ALTER 提案 flow (別 wave)
- 予定なし日タップ → ALTER 自然質問
- 提案チップ → おすすめ提案 (= タイトル + 画像) → 1tap で予定作成
- Stargazer / Alter engine 接続が必要 (大型設計)
```

→ **空き日 → ALTER flow** (= 別ロードマップ Phase 3、 Stargazer engine 接続)

### 1.2 **矛盾発見** (= CEO 確認必要)

| docs | N の定義 |
|---|---|
| L transport-design (= 2026-05-22) | N = Counter-Factual |
| **M readiness audit (= 2026-05-23、 newer)** | **Counterfactual generation は永続禁止** |

**自律推論**:
- L transport-design は **元計画**、 観測 4 層構造を素描
- M readiness audit は **観測 layer 設計の精緻化**で、 「Counterfactual = 推奨に近づく」 → 思想違反と判定
- M readiness audit の方が **思想整合性** が高い (= Aneurasync 中心問い「観測のみ、 評価/推奨/警告禁止」)

**CEO 判断必要** (= 自律で決めない):
- A. **N = Pattern Truth Layer のみ** (= Counterfactual は永続禁止に整合、 M readiness audit 解釈採用)
- B. **N = Counter-Factual + Pattern 両方** (= L transport-design 元計画維持、 但し Counterfactual の思想整合性は別途検討)
- C. N = Counter-Factual を 「**観測のみ**」 形に再定義 (= 「もし違う選択をしたら」 を生成せず、 過去の自分の選択を観測する形)

### 1.3 CEO 補正で追加された項目 (= 2026-05-23)

> 「N に Home / Plan final surface polish を含めて計画する」
> 「Home デザイン / レイアウト / Plan 導線 / swipe / tab 体験」 が未完了項目

**自律推論で分解**:

| 構成 | 内容 | 既存進捗 |
|---|---|---|
| **(1) Home design polish** | AneurasyncHome の visual 完成度 | ⏳ partial (= 「Home 微調整完了」 in MEMORY 2026-03-30) |
| **(2) Home layout polish** | spacing / sizing / 配置 | ⏳ partial |
| **(3) Plan 全体の見た目** | tab UI / FAB / 各 tab visual 完成度 | ⏳ partial (= Phase 2-A/B/C 完了済、 細部 polish 余地) |
| **(4) Home → Plan swipe 体験** | HomeSwipeContainer の smoothness / lock | ✅ Phase 1 完了済 (= CEO smoke PASS) |
| **(5) Calendar / Flow / Map tab の統一感** | 3 tab の visual / interaction 統一 | ⏳ partial (= M-3c-ui/M-3d で disclosure UI 統一済) |
| **(6) 空き日 / 予定なし日の見え方** | empty state UX | ⏳ partial (= FlowTab 「予定なし」 inline button あり) |
| **(7) dev smoke で見えた違和感** | CEO smoke で発見した具体項目 | TBD (= N-1 棚卸し audit で確定) |

### 1.4 **N の全責務一覧** (= 元計画 + CEO 補正、 漏れなき形)

| # | 責務 | 出典 | scope |
|---|---|---|---|
| **1** | Counter-Factual (= 反事実 / 別の 1 日選択肢) | 元計画 L transport-design §0.3 | 大 (= 矛盾あり、 CEO 確認必要) |
| **2** | Pattern Truth Layer (= 複数日傾向観測) | 元計画 M readiness §0 / §9 | 大 (= 観測のみ、 思想整合 ✅) |
| **3** | 空き日 → ALTER 提案 flow | 別ロードマップ Phase 3 | 大 (= Stargazer engine 接続) |
| **4** | Home design / layout polish | CEO 補正 | 小-中 |
| **5** | Plan 全体の見た目 + tab 統一感 | CEO 補正 | 小-中 |
| **6** | swipe 体験 polish | CEO 補正 | 小 |
| **7** | 空き日 / 予定なし日の見え方 | CEO 補正 | 小-中 |
| **8** | dev smoke 違和感 | CEO 補正 | TBD (= 棚卸し後確定) |

---

## 2. N を 5 phase に分割 (= GPT 明示)

### 2.1 分割案 (= GPT 明示 5 件 を採用)

| Phase | 内容 | 性質 | 規模 | CEO 判断 |
|---|---|---|---|---|
| **N-1** | Home/Plan final surface audit (= 全 Plan/Home 体験棚卸し + CEO smoke) | docs + smoke | 小 | 連続 OK if low-risk |
| **N-2** | small polish wave implementation (= 1 wave / 1-2 件、 都度 smoke) | 実装 (= 小 wave 累積) | 中 | 各 wave で CEO 承認 |
| **N-3** | empty day → ALTER flow readiness + implementation | readiness + 実装 | 大 (= Stargazer engine 接続) | readiness 後 CEO 判断 |
| **N-4** | Counter-Factual / Pattern Truth Layer readiness + implementation | readiness + 実装 | 大 (= 観測 layer 拡張、 矛盾の解消も含む) | readiness 後 CEO 判断 |
| **N-5** | /plan final closeout audit (= J/K/L/M/N の完了監査) | docs + 完了監査 | 小 | 全前提完了後 CEO 認定 |

### 2.2 各 phase の責務マッピング (= N 全責務 8 件 → 5 phase)

| N 全責務 | 担当 phase |
|---|---|
| 1. Counter-Factual | **N-4** |
| 2. Pattern Truth Layer | **N-4** |
| 3. 空き日 → ALTER flow | **N-3** |
| 4. Home design / layout polish | N-1 → N-2 |
| 5. Plan 全体見た目 + tab 統一感 | N-1 → N-2 |
| 6. swipe 体験 polish | N-1 → N-2 |
| 7. 空き日 / 予定なし日の見え方 | N-1 → N-2 (= N-3 と関連) |
| 8. dev smoke 違和感 | N-1 → N-2 |

→ **N-1/N-2 は polish 系、 N-3/N-4 は新規 layer / engine 接続、 N-5 は最終監査**。

### 2.3 各 phase の依存関係 (= 順序候補)

**Path 候補 1 (= 自然順序)**:
```
N-1 (= 棚卸し) → N-2 (= polish 実装) → N-3 (= ALTER flow) → N-4 (= Counter-Factual / Pattern) → N-5 (= final closeout)
```

**Path 候補 2 (= 並列可能性、 ただし audit 順は維持)**:
```
N-1 (= 棚卸し)
 ├→ N-2 (= polish 実装)
 ├→ N-3 readiness audit (= ALTER flow 設計)
 └→ N-4 readiness audit (= Counter-Factual / Pattern 設計)
N-3 + N-4 実装 (= CEO 判断で順序 / 並列)
   ↓
N-5 final closeout
```

**自律推奨**: **Path 候補 1 (= 自然順序)**、 但し各 readiness audit は並列着手可能 (= 実装は順次)。

---

## 3. 各 phase の責務詳細

### 3.1 N-1: Home/Plan final surface audit (= 連続 GO 候補)

**内容**:
- 全 Plan/Home 体験を CEO smoke で棚卸し
- polish 候補リストを CEO 判断で確定
- 各候補に priority / scope / risk を付与
- N-2 wave 計画の作成

**進め方**:
- docs only (= 実装に進まない)
- CEO smoke で具体的な「気になった項目」 を直接拾う
- 1 doc に candidate list 整理

**low-risk 判定**:
- ✅ 実装変更 0
- ✅ frozen branches への追加 commit 0
- ✅ DB / env / package / dependency 変更 0
- ✅ Aneurasync 整合性 (= 思想保護)

→ **本 audit 完了後、 N-1 に連続 GO 可能**。

### 3.2 N-2: small polish wave implementation

**内容**:
- N-1 で確定した候補から優先順 1-2 件ずつ wave で実装
- 各 wave で CEO smoke
- 大規模 refactor / 新 tab 追加 / 機能追加 は禁止

**進め方**:
- 1 wave = 1-2 件の polish のみ
- 各 wave で CEO 承認 + smoke
- 累積で N-1 候補リストを消化

### 3.3 N-3: empty day → ALTER flow readiness + implementation

**内容**:
- 予定なし日タップ → ALTER 自然質問
- 提案チップ → おすすめ提案 (= タイトル + 画像) → 1tap で予定作成
- **Stargazer / Alter engine 接続が必要 (= 大型設計)**

**注意**:
- これは「Stargazer pivot」 ではなく「**Plan 内で既存 Stargazer engine を呼ぶ統合**」
- 但し engine 接続範囲、 fail-safe、 privacy、 cost cap 等が必要
- readiness audit で実装可否判定 + scope 確定

**CEO 判断必要**:
- N-3 を実装するか / 別軸 (= Stargazer 単独 phase) で扱うか / defer か

### 3.4 N-4: Counter-Factual / Pattern Truth Layer readiness + implementation

**内容**:
- **Counter-Factual (= 「もし違う選択をしたら」)** ← **矛盾あり、 CEO 確認必要**
- Pattern Truth Layer (= 複数日傾向観測、 観測のみ)

**矛盾**:
- L transport-design (= 元計画): N = Counter-Factual
- M readiness audit (= 新): Counterfactual generation は永続禁止

**CEO 判断必要**:
- N-4 を 「Pattern Truth Layer のみ」 にするか
- 「Counter-Factual + Pattern」 として元計画通りに進めるか
- Counter-Factual を「観測形」 (= 「過去の自分の選択を観測」) に再定義するか

### 3.5 N-5: /plan final closeout audit

**内容**:
- J / K / L / M / N の全 sub-phase 完了監査
- /plan complete 認定の最終 audit
- Deploy readiness 等への接続点を明文化

**前提**:
- N-1〜N-4 全完了 (= or CEO 明示 defer)
- Home/Plan polish smoke PASS
- 全 frozen branches 一覧確認

---

## 4. /plan complete の条件 (= GPT 明示 5 件)

### 4.1 必須条件

| # | 条件 | 現状 |
|---|---|---|
| 1 | J / K / L / M 完了 | ✅ 達成 (= M phase 完了 `618bca18`) |
| 2 | N で定義された残項目の **実装** または **CEO 明示 defer** | ⏸️ N-1〜N-5 未着手 |
| 3 | Home/Plan polish smoke PASS | ⏸️ N-1/N-2 で達成予定 |
| 4 | final closeout audit PASS | ⏸️ N-5 で達成予定 |
| 5 | その後に初めて Deploy readiness / 別軸 pivot | ❌ /plan complete 前は禁止 |

### 4.2 「実装または CEO 明示 defer」 の意味 (= 重要)

各 phase の各責務について:
- **実装する** (= phase 完了)
- **CEO 明示 defer** (= 「やらない」 を CEO が承認、 docs に記録)

→ Claude 側で勝手に「defer」 「scope 外化」 「中長期保留」 を決めない。 各 phase の readiness audit 結果を CEO に提示、 判断材料を整理し、 CEO 判断後に「実装」 or 「defer」 を確定。

---

## 5. 「やらない」 判断のルール (= GPT 明示)

### 5.1 「やらない」 判断のフロー

1. 各 phase の readiness audit で scope と難易度を整理
2. CEO に提示
3. CEO が 「実装」 or 「明示 defer」 を判断
4. 判断結果を docs に記録 (= decision-log + 該当 phase doc)

### 5.2 「明示 defer」 の条件

- CEO 明示承認 (= text で「N-X は defer する」 等の明示)
- defer 理由の記録
- 「いつ再着手するか」 の暫定 timeline (= 不確定でも OK)

### 5.3 Claude 側で禁止される判断

- 「自律推奨で N-X を defer」 (= ❌)
- 「Counter-Factual は永続禁止のため N-4 を skip」 (= ❌ CEO 確認必要)
- 「空き日 ALTER flow は scope 大のため N-3 を skip」 (= ❌ CEO 確認必要)
- 「N-1 完了で /plan complete」 (= ❌ 完了境界の縮小)
- 「中長期 vision」 / 「将来 phase」 等の曖昧表現 (= 明示 defer 必要)

---

## 6. CEO 判断項目 (= 報告で停止)

### 6.1 N 全責務に関する判断

1. **Counter-Factual と M readiness audit の矛盾**: N-4 に「Counter-Factual」 を含めるか、 「Pattern のみ」 にするか、 「観測形 Counter-Factual」 に再定義するか
2. **N-3 (= 空き日 ALTER flow) を /plan 内で実装するか**: 実装 / 別軸 (= Stargazer 単独 phase) / 明示 defer
3. **N-4 (= Counter-Factual / Pattern) を /plan 内で実装するか**: 実装 / 明示 defer / 観測形に縮小
4. **N-1 連続 GO 判定**: 本 audit 着地後、 N-1 棚卸し audit に連続して進むか
5. **N の進行順序**: Path 候補 1 (= 自然順序) / Path 候補 2 (= 並列 readiness)

### 6.2 「やらない」 判断 (= 明示 defer 候補)

| 責務 | CEO 明示 defer の候補理由 |
|---|---|
| Counter-Factual | M readiness audit で「Counterfactual generation 永続禁止」 と明示済、 思想違反のため defer |
| Counter-Factual (= 観測形再定義) | 設計次第で可能、 但し scope 拡大 |
| Pattern Truth Layer | 観測のみで思想整合、 但し scope 大 |
| 空き日 → ALTER flow | Stargazer engine 接続が必要、 大規模設計 |

### 6.3 /plan complete の境界線 (= 確認)

CEO 明示後:
- 「N 全 5 phase 完了」 = /plan complete
- 「N-1 + N-2 + N-5 完了 + N-3/N-4 を CEO 明示 defer」 = /plan complete も成立
- Claude 側で勝手に境界線を縮小しない

---

## 7. 進行禁止リスト (= /plan complete 前)

### 7.1 CEO 明示禁止

- Deploy readiness audit
- 本番 deploy
- Stargazer / Rendezvous / Genome への pivot
- 初期ユーザー獲得
- N 項目の勝手な defer
- Counter-Factual / Pattern の勝手な scope 外化
- empty day ALTER flow の勝手な scope 外化

### 7.2 永続禁止 (= 全 N phase で継承)

- Arrival Risk Memory
- warning / recommendation / optimization 文言
- amber / orange / red 警告色
- icon / badge / warning box
- localStorage / persist
- DB / env / package / dependency 変更
- runtime telemetry sink
- fetch / push / gh / reset / restore / stash / branch delete

### 7.3 連続 GO 可能 (= 本 audit 着地後、 low-risk なら)

- N-1 Home/Plan final surface audit (= docs only、 CEO smoke 計画)
- decision-log 追記
- frozen branches に追加 commit しない

### 7.4 N-1 で禁止 (= 実装はまだ)

- Home/Plan の実装変更
- 各 polish の実装
- 新規 component / hook 追加

---

## 8. 残工程明確化 (= /plan final closeout までの全 step)

### 8.1 残工程

```
[本 audit (= Phase 3-N Plan Completion Audit) ✅]
          ↓
[N-1 Home/Plan Final Surface Audit] (= 連続 OK、 docs only + CEO smoke)
          ↓
[CEO 判断: polish 候補リスト確定 + N-2 wave 計画]
          ↓
[N-2 small polish wave implementation] (= 各 wave 1-2 件、 都度 CEO smoke)
          ↓
[CEO 判断: N-3 を実装するか defer か]
          ↓
[N-3 readiness audit] (= 空き日 ALTER flow 設計、 Stargazer engine 接続検討)
          ↓
[CEO 判断: N-3 実装 / 別軸 / 明示 defer]
          ↓
[N-3 implementation (= CEO 判断後)]
          ↓
[CEO 判断: N-4 を実装するか defer か]
          ↓
[N-4 readiness audit] (= Counter-Factual / Pattern 設計、 矛盾解消)
          ↓
[CEO 判断: N-4 実装 / 観測形再定義 / 明示 defer]
          ↓
[N-4 implementation (= CEO 判断後)]
          ↓
[N-5 /plan final closeout audit] (= J/K/L/M/N 完了監査)
          ↓
[/plan complete 認定]
          ↓
(後): Deploy readiness audit / Stargazer 等の判断
```

### 8.2 想定 timeline (= 不確定、 CEO 判断による)

| Step | 想定期間 | 注意 |
|---|---|---|
| N-1 棚卸し audit + CEO smoke | 1-2 日 | low-risk、 連続 GO 可 |
| N-2 polish 実装 (= 1 wave) | 1-3 日 | 各 wave smoke |
| N-2 全 wave 完了 | 1-3 週間 | 候補数次第 |
| N-3 readiness audit | 1 週間 | Stargazer engine 検討 |
| N-3 implementation | 2-4 週間 | 大規模 |
| N-4 readiness audit | 1 週間 | 矛盾解消 + Pattern 設計 |
| N-4 implementation | 2-4 週間 | 大規模 |
| N-5 final closeout | 1-2 日 | 全前提完了後 |
| **合計 (= 全実装)** | **約 2-3 ヶ月** | 各 CEO 判断による |
| **合計 (= 一部 defer)** | **1-1.5 ヶ月** | CEO 明示 defer 次第 |

---

## 9. 凍結 / 連続 OK / 禁止リスト

### 9.1 凍結対象 (= 触らない)

- 全 51 frozen branches (= K/L/M phase + 関連 audit)
- M phase 完了 file 全件
- 本 audit (= 着地後 freeze 予定)

### 9.2 連続 OK (= 本 audit + N-1)

- `docs/alter-plan-phase3-n-completion-audit.md` 新規作成 (= 本 commit)
- `docs/decision-log.md` 追記
- `docs/alter-plan-phase3-n-1-home-plan-final-surface-audit.md` 新規作成 (= 連続 OK 判定後)
- branch: `docs/plan-phase3-n-completion-audit` + `docs/plan-phase3-n-1-home-plan-final-surface-audit`

### 9.3 禁止 (= 絶対に進まない)

- frozen branches への追加 commit
- N-1 実装 (= まだ棚卸し audit のみ)
- N-2 以降の実装 (= 各 phase の readiness audit + CEO 判断後)
- N 項目の勝手な defer
- Counter-Factual / Pattern の勝手な scope 外化
- empty day ALTER flow の勝手な scope 外化
- 大規模 refactor
- M phase の追加変更
- Routes API / 実 API 連携 (= /plan complete 後)
- Arrival Risk Memory (= 永続禁止)
- warning / recommendation / optimization 文言 (= 永続禁止)
- amber / orange / red / icon / badge
- localStorage / persist
- DB / env / package / dependency 変更
- runtime telemetry sink
- **Deploy readiness audit / 本番 deploy / Stargazer pivot / 初期 user 獲得** (= /plan complete 後)
- fetch / push / gh / reset / restore / stash / branch delete

---

## 10. CEO 報告 + 停止条件

### 10.1 本 audit の到達点

- N の全責務確定 (= 元計画 + CEO 補正、 漏れなき 8 項目)
- 5 phase 分割提示 (= GPT 明示の N-1〜N-5)
- **矛盾発見の surface** (= L transport-design vs M readiness audit、 Counter-Factual 定義)
- 各 phase の責務マッピング
- /plan complete 条件 5 件確認
- 「やらない」 判断ルール明文化 (= CEO 明示承認のみ)
- 進行禁止リスト整理
- 残工程明確化
- CEO 判断項目 5 件

### 10.2 報告事項

| 項目 | 内容 |
|---|---|
| N の全責務 | 8 件 (= Counter-Factual / Pattern / empty day ALTER + Home/Plan polish 5 件) |
| /plan complete までの残工程 | N-1 → N-2 → (N-3) → (N-4) → N-5 |
| 実装順序 | Path 候補 1 (= 自然順序) 自律推奨 |
| 連続実装可能範囲 | **N-1 Home/Plan Final Surface Audit (= docs only)** まで |
| CEO 判断境界 | 矛盾解消、 各 phase の実装/defer 判断、 N-3/N-4 の進行可否、 順序確認 |

### 10.3 停止条件

以下のいずれかが発生した場合、 **即停止**:
- frozen branches への追加 commit
- N の実装着手 (= 本 audit + N-1 は docs only)
- 大規模 refactor
- N 項目の自律 defer
- Counter-Factual / Pattern の自律 scope 外化
- empty day ALTER flow の自律 scope 外化
- M phase の追加変更
- Arrival Risk / 警告文言 / amber/orange/red / icon 近接
- localStorage / DB / env / package / dependency 変更
- fetch / endpoint / runtime telemetry sink
- Counterfactual generation / Routes API
- **Deploy readiness / 別軸 pivot** (= /plan complete 前)

---

**完了**: Phase 3-N Plan Completion Audit 着地。 N 全責務 8 件確定 + 5 phase 分割 + 矛盾発見 surface + /plan complete 条件 5 件 + 「やらない」 判断ルール + 残工程明確化 + CEO 判断 5 件。 連続実装可能範囲は **N-1 Home/Plan Final Surface Audit (= docs only)** まで。
