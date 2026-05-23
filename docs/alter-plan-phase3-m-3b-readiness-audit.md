# Phase 3-M-3b Readiness Audit (= MapTab UI 接続 — observational disclosure 思想 + 7 候補評価)

**作成日**: 2026-05-23
**承認**: CEO + GPT 合議 (= 2026-05-23 M-3a 完全 freeze 後、 「M-3b UI 実装には進まない、 readiness audit のみ、 pure helper / static view model test / design-only docs なら連続 OK」 指示)
**範囲**: 「不足 N 分」 を **MapTab UI に出すべきか / 出すならどう出すか** の本質的判断 + 7 表示 pattern 評価 + ユーザー心理シナリオ + observational disclosure 思想 + pure layer 実装可否

> 本 audit は **docs only + pure layer (= UI 接続なし) まで**。 MapTab / Calendar / Flow への UI 実装 (= M-3c 以降) は **絶対に進まない**、 CEO 別承認 + visual smoke 必須。

---

## 0. ゴールから逆算 (= 上位思想の根本確認)

Aneurasync の中心問い:
> **「自分って、 そういう人間だったのか」**

これは **user 自身が自分の傾向に能動的に気付く体験**。 AI が「不足だ」 「危険だ」 と教えるのではなく、 **user が観測しに行ったときに静かに見える** 設計が思想に整合する。

### M-3b の本質的論点 (= 警告 vs 観測)

| Trigger | ユーザー体験 | Aneurasync 整合性 |
|---|---|---|
| 押し付けられた表示 | **「AI が指摘した」** | ❌ 反 Aneurasync (= AI が判断を提示) |
| 自分で見に行った表示 | **「自分で観測した」** | ✅ Aneurasync 思想極致 |

→ **「不足 40 分」 を勝手に表示する pattern は反 Aneurasync**。 「ユーザーが観測しに行ったときに静かに見える」 設計が core。

これを **「observational disclosure」 思想**として永続規約化する。

---

## 1. 7 表示 pattern の評価

### 1.1 候補一覧

| Option | 内容 | 説明 |
|---|---|---|
| α | 常時表示 + 控えめ styling | movement line 下に薄く常時表示 (= 例: text-slate-300 italic) |
| **β** | **操作後展開 (= tap / expand で表示)** | 既存 movement line を tap → 「余白 N 分」 展開 |
| γ | hybrid (= 余白常時 / 不足 expand) | 「余裕あり」 は常時 positive、 「不足」 は隠す |
| δ | all on-demand | 全て隠す、 user 操作で一括表示 |
| ε | ambient indicator + detail | 小さい dot 等で存在示唆、 tap で詳細 |
| ζ | default off + user 設定で常時化可能 | 設定で「観測モード」 を能動選択 |
| η | MapTab limited expansion (= 専用 detail area) | MapTab 内の専用 area で展開 |

### 1.2 評価軸

| Option | Aneurasync 整合性 | 警告化リスク | 実装複雑性 | 発見性 (= user が機能を知る) | 採用 |
|---|---|---|---|---|---|
| α 常時控えめ | 中 | 中 (= 圧の可能性) | 低 | 高 | ❌ |
| **β 操作後展開** | **高** | **低** | 中 | 中 | ✅ **採用候補 1** |
| γ hybrid | 中 (= 偏見) | 中 | 中 | 中 | ❌ |
| **δ all on-demand** | **高** | **低** | 中 | 中-低 | ✅ **採用候補 2** |
| ε ambient indicator + detail | 高 | 中 (= dot 設計次第) | 中 | 高 | ⚠️ ambient indicator 設計が鍵 |
| ζ default off + 設定常時化 | **最高** | **0** | 高 (= 設定 UI 必要) | 低 | △ scope 大、 M-3c+ で検討 |
| η MapTab limited expansion | 高 | 低 | 低-中 | 中 | ✅ **採用候補 3 (= 段階的 path)** |

### 1.3 自律推奨

**第 1 候補: β / δ の組み合わせ + η の段階的 path**

具体的:
- **default = hidden** (= δ all on-demand、 ζ の縮小版)
- **user 操作 → 展開** (= β 操作後展開)
- **MapTab limited から始める** (= η 段階的)
- ambient indicator (= ε) は M-3c 以降で慎重検討 (= dot 設計の警告化リスク)

→ **「observational disclosure」 = β + δ + η の hybrid 思想** を採用。

### 1.4 不採用案の理由

| Option | 不採用理由 |
|---|---|
| α 常時表示 | 圧の可能性、 「不足」 が警告に変質 |
| γ hybrid | 偏見 (= 「余裕」 positive を強調すると inconsistent) |
| ε ambient indicator | dot 色 / size 設計が警告化リスク (= M-3c 別 audit) |
| ζ default off + 設定常時化 | scope 大 (= 設定 UI 必要)、 M-4+ 検討 |

---

## 2. ユーザー心理シナリオ — 5 種以上の推論

### 2.1 シナリオ 1: 朝に MapTab を開いたユーザー (= 当日朝)

**Option α (= 常時表示) の場合**:
- 「10:00 ショッピング → 移動 約 90 分 → 12:50 ロイヤルホスト」 の下に **「不足 40 分」 が出ている**
- → **「今日のスケジュール、 ヤバいかも」 と焦る**
- → AI が判断を押し付けた感、 反 Aneurasync

**Option β (= 操作後展開) の場合**:
- 「10:00 ショッピング → 移動 約 90 分 → 12:50 ロイヤルホスト」 のみ表示
- user が「この移動、 余裕あるかな?」 と気になって tap → 「不足 40 分」 展開
- → **「自分で確認した」 観測体験**、 Aneurasync 整合

### 2.2 シナリオ 2: 暇な時間に過去日を振り返るユーザー

**Option β / δ の場合**:
- 過去日の MapTab を開く → movement line のみ表示
- 「あの日、 余裕あったかな?」 と気になって tap → feasibility 展開
- → **「自分の傾向観察」**、 Aneurasync 中心問いへの直接接続

### 2.3 シナリオ 3: 不足が大きい日 (= 例: 不足 90 分) の user

**Option α の場合**:
- 「不足 90 分」 が常時表示 → **「これじゃ無理だ」 と焦る、 予定を変えたくなる**
- → AI が「変えろ」 と言っているように感じる、 反 Aneurasync

**Option β の場合**:
- movement line のみ表示 → user が「移動 約 N 分」 を見て自分で「余裕ありそう / なさそう」 と感覚的に判断
- 詳細を tap で開いて事実確認 (= 「やっぱり不足だった」 / 「思ったより余裕」)
- → **観測の主導権が user**、 思想整合

### 2.4 シナリオ 4: sensitive 予定 (= 通院) を含む日の user

**全 Option 共通**:
- M-1 / M-2 / M-3a で sensitive proximity は not_applicable → display map から除外
- M-3b でも非表示維持
- → **sensitive 予定の前後で feasibility を出さない** が構造的に保証

→ sensitive 漏洩リスク 0 (= 既存 防御 layer で完結)。

### 2.5 シナリオ 5: 初回 MapTab 訪問の user (= 機能発見性)

**Option β (= 操作後展開) の場合**:
- 何も操作しないと feasibility が **見えない**
- user は「移動 約 N 分」 のみ見て満足、 detail に気付かない可能性
- → **発見性 medium**

**Option δ (= all on-demand) の場合**:
- 専用「観測する」 button 等を MapTab に追加 → 一括展開
- user は button を見て「観測モード」 を能動選択
- → **発見性 high (= button 自体が hint)**

**Option η (= MapTab limited expansion) の場合**:
- MapTab 内に「1 日の構造を詳しく見る」 等の subtle disclosure trigger を配置
- → **発見性 medium-high**

### 2.6 シナリオ 6: 「余白がある」 場合の user 感情

**Option α の場合**:
- 「余白 N 分」 が常時表示 → **「余裕あって良かった」 と安心感**
- 但し「余裕がある = ポジティブ」 を AI が指摘した感
- → 中程度の警告化リスク (= 「不足」 のネガティブ表現と balance を取る必要)

**Option β / δ の場合**:
- 常時非表示 → user が観測しに行く → 「余裕あった」 と発見
- → **発見の喜び**、 Aneurasync 整合

### 2.7 シナリオ 7: 「警告に見える」 失敗 case

**Option α + 視覚悪化** (= 想像):
- 「不足 40 分」 が **太字** で常時表示
- 色が **red 系**
- → 完全に警告 UI、 Aneurasync 思想破壊

**Option β でも視覚悪化** (= 想像):
- tap で展開、 但し展開 area に **⚠ 記号** や red 色
- → 操作後でも警告化、 思想破壊

→ **どの Option を選んでも、 styling 規約厳守が core**。 「警告化要素 5 dimension」 (= M-2 audit) が永続適用。

---

## 3. 「observational disclosure」 思想の永続規約化

### 3.1 4 原則

1. **default = hidden** (= push 表示禁止、 user 操作で初めて表示)
2. **user action が disclosure trigger** (= tap / expand / 設定変更等)
3. **disclosure 内容は中立** (= 「余白 / 不足 N 分」 のみ、 NG 文言永続禁止)
4. **disclosure styling は slate 系限定** (= M-2 audit 継承、 警告色禁止)

### 3.2 「観測の主導権を user に渡す」 設計

- M layer の UI は **「user が観測しに行ったときに静かに現れる」**
- 「AI が指摘する」 pattern は完全禁止
- 「気付かせる」 pattern も慎重 (= ambient indicator は dot 設計次第で警告化)

### 3.3 既存 K / L view との関係

- **K view (= 「→ 移動」 固定)**: 常時表示維持 (= 既存)
- **L-4d (= 「移動 約 N 分」 / 「移動」)**: 常時表示維持 (= 既存)
- **M-3b (= 「余白 / 不足 N 分」)**: **default hidden、 user 操作で表示**

→ K / L は「事実の表記」、 M は「事実の評価につながりやすい数値」 (= 余白 / 不足) なので、 disclosure 行動を伴う。

---

## 4. 表示しない条件 (= 構造的保証、 既存 + 追加)

### 4.1 既存 防御 (= M-1 / M-2 / M-3a で確立済)

| 条件 | 動作 |
|---|---|
| sensitive proximity transition | M-1 で not_applicable、 M-2a で map 除外、 M-3a で表示なし |
| unresolved movement | 同上 |
| location_unknown | 同上 |
| not_applicable | 同上 |

### 4.2 M-3b で追加すべき条件 (= 思想的整合)

| 条件 | 動作 (= 提案) |
|---|---|
| default state | hidden (= 何も表示しない) |
| user 操作 (= 「観測する」) | "expanded" state に遷移、 表示 |
| user 操作 (= 「閉じる」) | "hidden" state に遷移、 非表示 |
| 過密 UI (= 7 day 全件展開等) | M-3c 別 audit で慎重判断 |

---

## 5. 表示位置の候補 (= UI 接続時の hint、 M-3c 検討事項)

### 5.1 候補

| 位置 | 説明 | 評価 |
|---|---|---|
| **A. movement line の直下に補助行 (= expand 後)** | tap で「移動 約 N 分」 の直下に「余白 N 分」 が現れる | ✅ 第 1 候補 |
| B. modal / sheet | tap で modal が開き、 詳細を見る | ⚠️ 過剰 UI、 SelectedAnchorCard と整合悪い |
| C. SelectedAnchorCard 内 summary | 選択日全体の summary | ❌ day-level summary は M-4+ 範囲 |
| D. tooltip / hover (= desktop) | mobile では不適 | ❌ mobile-first 整合悪い |

→ **第 1 候補: A (= movement line 直下の expand 補助行)**

### 5.2 UI 実装の具体的 spec (= M-3c 設計時の hint)

**default state**:
```
10:00-11:00 ショッピング
→ 移動 約 90 分           ← L-4d 既存表示、 常時
12:00-13:00 ロイヤルホスト
```

**expanded state (= user tap 後)**:
```
10:00-11:00 ショッピング
→ 移動 約 90 分           ← L-4d 表示
  余白 30 分                ← M-3b 補助行 (= slate-300 italic text-xs)
12:00-13:00 ロイヤルホスト
```

**styling 規約** (= M-2 audit 継承):
- text-slate-300 / 400 (= 「→ 移動」 と同 or 少しさらに弱く)
- italic / text-xs
- amber / orange / red 禁止
- 太字 / 大 size / 強 border 禁止
- chip / badge にしない

---

## 6. 革新的アイデア (= 自律推論で導出)

### 6.1 革新 1: 「observational disclosure」 思想の確立

これは Aneurasync の中心問い (= 自分で気づく体験) と UI 設計の本質的接続点:
- 「観測の主導権を user に渡す」 設計
- 「AI が指摘する」 pattern は完全排除
- M layer 以降の全 UI で永続規約化

### 6.2 革新 2: pure disclosure state machine

UI を作らずに UI 規範を pure layer で確立する:
- `FeasibilityDisclosureState` (= "hidden" | "previewing" | "expanded")
- `nextDisclosureState(current, action)` pure function
- 副作用なし、 deterministic、 UI 接続前に state machine logic を確立

これは「**UI 規範を data として表現**」 する革新的 pattern。 将来 UI が実装される時、 この state machine に従う約束として機能。

### 6.3 革新 3: 「default hidden」 を構造保証

DEFAULT_DISCLOSURE_STATE = "hidden" を pure layer で固定:
- 「push 表示」 が構造的に不可能になる
- 「user 操作 → 表示」 だけが許可される pattern

### 6.4 革新 4: 「7 候補評価」 を docs 化

将来「常時表示にしたい」 という温度が上がったときの **歯止め** として記録:
- 7 候補それぞれを評価
- 不採用案の理由を明示
- ユーザー心理シナリオで補強

### 6.5 革新 5: 「user action は明示」

passive_idle (= 何もしない action) を許容し、 state 不変を保証:
- user が「観測する意図がない」 場合に表示されない
- これは「主導権を user に渡す」 思想の構造的実装

### 6.6 革新 6: 「previewing state」 は M-3b では未使用、 hook として保持

将来 ambient indicator pattern (= ε) を検討する余地を残すため、 "previewing" を type に含める:
- M-3b では未使用
- M-4+ で ambient indicator を慎重設計するときに使う候補
- これは「forward compatibility」 革新

### 6.7 革新 7: 「contract で disclosure pattern を機械保証」

state machine の不変条件:
- default は "hidden"
- passive_idle で state 不変
- 未知 action で state 不変
- "hidden" → "expanded" は request_expand のみ
- "expanded" → "hidden" は request_collapse のみ

これら不変条件を contract function で機械保証。

---

## 7. M-3b-pure 最小 scope (= 連続 GO 判定)

### 7.1 着地物 (= UI 接続なし、 pure layer のみ)

| File | 内容 |
|---|---|
| `lib/plan/feasibility/feasibilityDisclosureState.ts` | State / Action types + nextDisclosureState pure function + DEFAULT_DISCLOSURE_STATE + 不変条件 |
| `tests/unit/plan/feasibilityDisclosureState.test.ts` | 全 state × 全 action transition test + default + 不変条件 |

### 7.2 type 設計確定

```typescript
/**
 * Feasibility disclosure state — user に対する開示 state。
 *
 * - "hidden":      非表示 (= default、 圧防止)
 * - "previewing":  preview hint (= M-3b では未使用、 M-4+ ambient indicator 用予約)
 * - "expanded":    詳細展開 (= 「余白 / 不足 N 分」 表示)
 */
export type FeasibilityDisclosureState = "hidden" | "previewing" | "expanded";

/**
 * User action — disclosure state を変更する操作。
 *
 * - "request_expand":   user が詳細を開く意図 (= tap / expand 等)
 * - "request_collapse": user が詳細を閉じる意図
 * - "passive_idle":     何もしない (= 圧防止 default)
 */
export type FeasibilityDisclosureAction =
  | "request_expand"
  | "request_collapse"
  | "passive_idle";

export const DEFAULT_DISCLOSURE_STATE: FeasibilityDisclosureState = "hidden";
```

### 7.3 state machine 規則

```
Current State    + Action            → Next State
"hidden"         + "request_expand"  → "expanded"
"hidden"         + "request_collapse"→ "hidden"   (= 既に hidden、 不変)
"hidden"         + "passive_idle"    → "hidden"   (= 不変、 圧防止)
"expanded"       + "request_expand"  → "expanded" (= 既に expanded、 不変)
"expanded"       + "request_collapse"→ "hidden"
"expanded"       + "passive_idle"    → "expanded" (= 不変)
"previewing"     + "request_expand"  → "expanded"
"previewing"     + "request_collapse"→ "hidden"
"previewing"     + "passive_idle"    → "previewing" (= 不変)
```

→ "previewing" は forward compat、 M-3b では default では入らない。

---

## 8. STOP 条件 (= M-3b-pure 着手前 必須クリア)

| STOP 条件 | M-3b-pure 範囲 |
|---|---|
| MapTab / Calendar / Flow を触る必要 | ❌ 不要 (= pure layer のみ) |
| UI に「不足 N 分」 を表示する必要 | ❌ 不要 (= state machine logic のみ) |
| style / layout 判断が必要 | ❌ 不要 (= UI 接続前) |
| Arrival Risk / warning / recommendation / optimization に近づく | ❌ 不要 |
| localStorage / DB / telemetry / API が必要 | ❌ 不要 |
| amber / orange / red / 警告記号が出る | ❌ 不要 |
| K / L / M-1 / M-2 / M-3a types を破壊的に変える必要 | ❌ 不要 |

→ **全 7 STOP 条件未抵触**。 M-3b-pure 連続実装 GO 判定 成立。

---

## 9. low-risk 連続実装範囲

| 項目 | 着手 |
|---|---|
| pure disclosure state machine (= types + function) | ✅ |
| contract (= 不変条件 + assert function) | ✅ |
| tests (= 全 state × 全 action) | ✅ |
| ❌ MapTab / Calendar / Flow UI 接続 | NO (= M-3c 別 audit) |
| ❌ ambient indicator UI 設計 | NO (= M-4+ 検討) |
| ❌ 設定 UI / ユーザー設定 | NO (= M-4+ 検討) |
| ❌ DB / env / package / dependency 変更 | NO |
| ❌ localStorage / runtime telemetry sink | NO |
| ❌ Arrival Risk Memory / mode / distance / Routes API | NO |

---

## 10. UI 接続前の残リスク (= M-3c 着手前 確認事項)

| リスク | 内容 |
|---|---|
| 「不足 N 分」 が UI で警告に見える | observational disclosure 思想 + styling 規約厳守 |
| user が disclosure trigger を見つけられない | 発見性 vs 圧の trade-off、 M-3c で UX 設計 |
| 「余白」 と「不足」 を expand area で同 styling 維持 | M-3c での視覚規約厳守 |
| Calendar / Flow への展開 | L-4d-b1/b2 と同 pattern、 M-3c の MapTab smoke 後段階的 |
| sensitive 予定の前後表示 | M-1 / M-2 / M-3a で防御済、 M-3b も継承 |

---

## 11. CEO 判断ポイント (= 本 audit 着地後)

| Q | 内容 | 自律推奨 |
|---|---|---|
| Q1 | 「observational disclosure」 思想を永続規約化 | **YES** |
| Q2 | 7 候補評価で β + δ + η の hybrid (= 「default hidden、 user 操作で表示」) を採用 | **YES** |
| Q3 | M-3b-pure (= pure disclosure state machine) を連続実装 GO | **YES** (= 全 STOP 条件未抵触) |
| Q4 | MapTab UI 接続 (= M-3c) は別 readiness audit + visual smoke 必須 | **YES** |
| Q5 | ambient indicator (= ε) / 設定常時化 (= ζ) は M-4+ で再検討 | **YES** |

---

## 12. 永続禁止 (= 本 audit 以降に維持)

❌ M-3b で MapTab / Calendar / Flow 触る (= M-3c 別 audit)
❌ M で「不足 N 分」 を画面に push 表示 (= default hidden 思想)
❌ M で常時表示 (= observational disclosure 反する)
❌ ambient indicator の dot 色 / size 設計 (= 警告化リスク、 M-4+ 別 audit)
❌ 設定 UI / ユーザー設定 (= M-4+ scope)
❌ M で Arrival Risk Memory / warning / recommendation / optimization 文言
❌ 質的評価語 / 緊急感表現 / 相対表現
❌ 記号 (= ⚠ / ❗ / ❌ / ! / ?)
❌ amber / orange / red / 警告色
❌ mode 表示 / distance 表示 / Routes API / Counterfactual
❌ DB / env / package / dependency 変更
❌ localStorage / runtime telemetry sink
❌ K / L / M-1 / M-2 / M-3a 既存 types 改変
❌ frozen branches への commit (= 42 + 本 commit = 43 branches)
❌ fetch / push / gh / reset / restore / stash / branch delete

---

## 13. 関連 docs

- `docs/alter-plan-phase3-m-3-readiness-audit.md` (= M-3a)
- `docs/alter-plan-phase3-m-2-readiness-audit.md` (= 「不足を警告に見せない」 3 重防御)
- `docs/alter-plan-phase3-l-4d-b-readiness-audit.md` (= L-4d-b 段階的 UI 接続 pattern 参考)
- `docs/decision-log.md`

---

## 14. 着地状態 + freeze 確定

本 commit 着地と同時に `docs/plan-phase3-m-3b-readiness-audit` を **frozen 扱い** (= 43 frozen branches 計、 以後 commit 禁止)。

次は M-3b-pure 実装 branch を別途切り、 audit 結論 (= low-risk pure layer 連続 GO) に従って実装着手。 UI 接続 (= M-3c) は **絶対に進まない**。

---

## 15. 思想 transmission (= M-3b readiness audit から学ぶ)

1. **「observational disclosure」 思想** — 観測の主導権を user に渡す
2. **「default hidden」 を構造保証** — push 表示を構造的に不可能化
3. **「user action は明示」** — passive_idle で state 不変
4. **7 候補評価を docs 化** — 将来「常時表示にしたい」 への歯止め
5. **「pure layer で UI 規範を確立」** — UI を作らずに UI 規範を data として表現
6. **forward compat** — "previewing" を予約、 将来 ambient indicator hook
7. **K / L view との関係明確化** — K/L 常時 (= 事実)、 M expand (= 事実の評価につながる数値)

---

## 16. 結語 — M-3b の意義

M-3b = **observational disclosure UI 規範の確立** = 「不足 N 分」 を画面に出す前に、 **disclosure pattern を pure layer で固定**し、 将来の UI 実装が思想を破壊しないように規範を確立する layer。

**core 革新**:
- 「観測の主導権を user に渡す」 思想を pure state machine で表現
- 「default hidden」 を構造保証
- 「警告化要素 5 dimension」 (= M-2) と「7 候補評価」 (= M-3b) で 2 重防御

Aneurasync の中心問い (= 「**この機能は、 ユーザーの第二の自己として必要か?**」) に対する M-3b の答え:

> 余白 / 不足の観測は、 ユーザーが **能動的に観測しに行ったとき** に静かに現れる。 AI が「不足だ」 と指摘するのではなく、 ユーザーが自分で見に行ったときに事実が見える。 これは「user の主導権」 を尊重する設計であり、 「自分って、 そういう人間だったのか」 体験への直接接続である。

**M-3b-pure 連続実装 GO**。 次は pure state machine + contract + tests を着地。 UI 接続 (= M-3c) は別 audit + CEO smoke 必須。
