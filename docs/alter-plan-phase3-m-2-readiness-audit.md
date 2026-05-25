# Phase 3-M-2 Readiness Audit (= Feasibility Display Formatter、 M-2a/M-2b 連続 GO 判定)

**作成日**: 2026-05-23
**承認**: CEO + GPT 合議 (= 2026-05-23 M-1 着地後、 「M-2 readiness audit に進む、 audit 結果が low-risk なら M-2a + M-2b 連続実装 OK、 UI 接続前に停止」 指示)
**範囲**: M-1 補正 2 件 永続規約化 + M-2 責務定義 + 表示文言契約 + 視覚階層 + privacy 強化 + 革新アイデア + M-2a/M-2b 連続 GO 判定

> 本 audit は **docs only**。 M-2a/M-2b (= pure formatter + contract) が low-risk 確認できれば連続実装に進む。
> UI 接続 / Calendar/Map/Flow 改変 / Arrival Risk / localStorage 等の危険境界で停止。

---

## 0. M-1 補正 2 件の永続規約化

### 0.1 補正 1: M-1 着地報告の file 数記載 訂正

**当時の記述** (= 2026-05-23 M-1 commit `fd2808f8` decision-log):
> 「新規 files 5 (= 3 lib + 2 tests + 1 audit doc)」

→ 数不整合。 正確には以下:

| commit | 新規 file 数 | 内訳 |
|---|---|---|
| `27419eed` (= M readiness audit) | **1** | `docs/alter-plan-phase3-m-readiness-audit.md` |
| `fd2808f8` (= M-1 impl) | **5** | 3 lib (= types / contract / helper) + 2 tests |
| **合計** | **6** | docs 1 + 実装 5 |

→ 本 audit 以降の記録では「audit doc commit と impl commit を分けて記述」 を **永続規約**とする。

### 0.2 補正 2: M-1 helper の privacy discipline 強化記録 (= L-3c と同水準)

**M-1 helper の内部処理**:
- `dayFeasibilityComputation.ts` の `computeSingleTransitionFeasibility` 内で `transition.fromNodeId` / `transition.toNodeId` を引数で受け取り、 `findEventNodeById` で graph.nodes から EventNode を逆引き
- EventNode の `endTime` / `startTime` を読み取り、 余白を計算

**Output / warnings / trace に nodeId / anchorId / locationText が漏れないことの明示検証**:

| 項目 | 検証 |
|---|---|
| `FeasibilitySlackView` の field set | `transitionIndex` / `status` / `slackMin?` / `shortfallMin?` のみ — nodeId / anchorId / locationText 不在 |
| `DayFeasibilityResult` top-level | `feasibilityByTransitionKey` / `counts` のみ — top PII 不在 |
| `transitionKey` 形式 | `transition_${index}` 単独 (= L-3c 非 PII 形式継承) — nodeId 不含 |
| 内部 mutation の有無 | graph / overlay を mutate しない (= test §7 で確認済) |
| warnings field の存在 | M-1 は warnings field を **持たない設計** (= L-3c の overlay と異なる、 M はより minimal) |
| trace field の存在 | M-1 は trace field を **持たない設計** (= L-3a cascade と異なる) |

**永続規約**:
- M output / warnings / trace 等の **公開 view** に nodeId / anchorId / locationText / title / userId を **持たせない**
- M-1 既存 `feasibilityIntegrityContract.ts` の `noPiiInFeasibilityView` / `noPiiInResultTopLevel` 2 invariants で機械保証済
- **L-3c と同 privacy discipline が M-1 で既に確立されている**
- M-2 以降も本規約を継承

---

## 1. ゴールから逆算 (= 上位思想の確認)

| Layer | 責務 | 状態 |
|---|---|---|
| K = 時間構造観測 | DayGraph、 anchor 表記 | 完了 |
| L = 移動観測 (= Mobility Truth Layer) | overlay、 「移動 約 N 分」 | 完了 |
| M-1 = 余白観測 pure data (= Feasibility Truth Layer) | types / contract / helper | 完了 |
| **M-2 = 余白表記 pure layer (= Feasibility Display Layer)** | **本 audit 対象** | 着手前 |
| M-3+ = UI 接続 | (= 別 phase) | 未着手 |
| N 以降 = pattern observation | (= 別 phase) | 未着手 |

**M-2 の本質的論点** (= CEO 指示):
> 「不足 N 分」 を出しても **警告に見えない** 設計

---

## 2. M-2 の責務定義

### 2.1 core 責務

**M-2 = Feasibility Display Layer** = `DayFeasibilityResult` を **pure display view** に変換する formatter + contract。

具体:
- input: `DayFeasibilityResult` (= M-1 output)
- output: `FeasibilityDisplayResult` (= 「余白 N 分」 / 「不足 N 分」 の display map)
- UI 接続なし (= M-3+ で別 audit)
- 「不足」 を警告に見せない文言 / 視覚階層を規約化

### 2.2 L-4a / L-4b との対称性

| 項目 | L (Mobility) | M (Feasibility) |
|---|---|---|
| pure data | L-3c OverlayResult | M-1 DayFeasibilityResult |
| pure formatter | L-4a MovementDisplayFormatter | M-2a FeasibilityDisplayFormatter |
| display contract | L-4b MovementDisplayContract | M-2b FeasibilityDisplayContract |
| UI 接続 | L-4d MapTab-only / L-4d-b1/b2 | M-3+ (= 別 audit) |

→ M-2 は **L-4a/L-4b と完全対称**の pure layer。

---

## 3. 表示文言契約 — 「不足を警告に見せない」 設計

### 3.1 OK 文言 (= M-2 output に許容)

- 「余白 N 分」 (= variant "slack")
- 「不足 N 分」 (= variant "shortfall")
- (= not_applicable は表示しない、 map から除外)

### 3.2 NG 文言 list — 拡張 (= M-1 audit + 新規追加)

**M-1 audit で既に列挙**:
- 「ギリギリ」 「快適」 「便利」 「最適」 「注意」 「警告」 「危険」 「リスク」 「遅刻」
- 「急いで」 「お急ぎ」 「早めに」

**M-2 で **新規追加** (= 「不足を警告に見せない」 ための追加禁止)**:

| 禁止 | 理由 |
|---|---|
| **「間に合わない」** | 推測 / 警告 |
| 「おすすめ」 / 「推奨」 / 「提案」 | recommendation |
| 「推測」 / 「予測」 / 「予想」 | 確率 / リスク評価に近接 |
| **「あと N 分」** | 緊急感 |
| **「もう少し」** | 緊急感 / 曖昧 |
| **「足りない」** / 「余る」 | 相対表現、 「余白 / 不足」 厳守 |
| **「ピッタリ」** / 「ちょうど」 | 質的評価 |
| **記号 (= ⚠️ / ❗ / ❌ / ‼)** | 警告的記号 |
| 「Achtung」 / "warning" / "alert" / 等の外国語 | 警告 |
| 「OK」 / "OK" / 「OK!」 | 肯定的評価、 中立から外れる |
| 「!」 (= 半角 / 全角) | 強調 / 緊急感 |
| 「?」 (= 半角 / 全角) | 疑問 / 不安感 |

### 3.3 OK 正規表現 (= 完全一致のみ)

```typescript
const OK_DISPLAY_TEXT_PATTERNS: ReadonlyArray<RegExp> = [
  /^余白 \d+ 分$/,
  /^不足 \d+ 分$/,
];
```

→ 上記 2 pattern 以外の文言を機械的に reject。

### 3.4 数値の round 規約

- `Math.round(slack)` で整数化のみ (= L-4a と同 pattern)
- 5 分単位 round 等の印象操作なし
- 60+ 分でも「60 分」 「120 分」 で表記 (= 「1 時間」 「2 時間」 等の単位変換しない、 緊張感差を生まない)

---

## 4. 視覚階層 (= K-3c-iii / L-4d 整合)

### 4.1 tier 設計

**M-2 専用 tier**: `"tier_2_movement_aux"` (= 「移動補助情報」)

意味:
- K-3c-iii 階層 2 (= slate-300 / italic / dashed) の **同階層 sub-information**
- L-4a の `tier_2_movement` (= 移動本体) の **補助情報**として位置付け
- caller (= 将来 UI 接続層) は同階層 styling を適用する hint

→ K-3c-iii の **「予定」 (= 階層 3) より弱く、 「→ 移動」 (= 階層 2 本体) より少しさらに弱い**。

### 4.2 color discipline (= 永続)

- ✅ slate のみ (= L-4d / K-3c-iii と同)
- ❌ amber / orange / red / yellow / rose / pink 全件禁止
- ❌ green / blue (= positive 強調も避ける、 中立維持)
- → slate-400 〜 slate-500 程度の範囲

### 4.3 「余白」 と「不足」 を同 styling

これは「不足を警告に見せない」 設計の核心:
- 「余白 50 分」 と「不足 50 分」 は **完全同 color / 完全同 font / 完全同 size**
- 違いは label の文言のみ (= 「余白」 vs 「不足」)
- caller (= UI 接続層) はこれを厳守する hint を本 audit で固定

### 4.4 confidence band を発火させない

L-4a の `confidenceBand` (= soft/strong) のような visual 変化は M-2 では発火させない (= 全 view が同 visual tone)。 これは:
- 「不足」 を別 visual で強調しない
- 「余白」 を別 visual で強調しない
- 全て同じ tone (= 完全中立)

---

## 5. Privacy / Sensitive

### 5.1 nodeId / anchorId / locationText の漏洩防止 (= L-3c 同水準)

M-1 で既に確立済 (= §0.2)。 M-2 でも同 discipline 継承:
- `FeasibilityDisplayView` の field set: `transitionIndex` / `displayText` / `variant` / `tier` のみ
- nodeId / anchorId / locationText / title / userId / 等 PII field 不在
- `transitionKey` は `transition_${index}` 形式 (= L-3c 継承)

### 5.2 sensitive proximity の扱い

**M-1 で既に not_applicable 化**:
- L overlay で sensitive proximity transition は cascade early-exit で unresolved
- M-1 で unresolved → not_applicable
- M-2a formatter で not_applicable は **map から除外** (= 表示しない)

→ sensitive 予定の前後で **「不足あり」 等の表示が発生しない**。 sensitive を推測させる可能性 0。

### 5.3 余白 / 不足の表示が sensitive 予定を推測させる可能性 ?

検討:
- 「sensitive 予定 X の前後で『不足 60 分』 が表示」 → sensitive 予定の location を推測可能?

→ M-2a で not_applicable を除外することで、 sensitive proximity transition には **何も表示しない**。 K view fallback で「→ 移動」 のみ表示される (= sensitive proximity の存在は既に K view に出ているが、 これは K-3c-iii の規約で許容済)。

→ M-2 で **新たに sensitive を推測させる経路は発生しない**。

### 5.4 not_applicable view の扱い (= 設計確定)

- M-1 では `feasibilityByTransitionKey` に not_applicable view を含めて保持 (= 集計に必要)
- M-2a で formatter は not_applicable を **`feasibilityDisplayByTransitionKey` から除外**
- caller は `map.has(key)` で render 判断 (= 該当 key なしなら表示しない)

これは L-4a の `variant: "unresolved"` (= 「→ 移動」 表示) と異なる挙動:
- L-4a unresolved → 「→ 移動」 表示 (= K view fallback と同形)
- M-2a not_applicable → **何も表示しない** (= 余白 / 不足の根拠なし)

→ K view の「→ 移動」 は引き続き表示される (= K view 単独で完結)。 M-2 はそこに余白 / 不足を**追加するか / しないか**を判断する layer。

---

## 6. 革新的アイデア (= 自律推論で導出、 GPT 案を超える)

### 6.1 革新 1: 「警告化要素 5 dimension」 の機械検証

警告化要素を 5 次元で分解:
1. **色** — slate のみ
2. **形容詞** — NG list
3. **記号** — ⚠️ / ❗ 等を NG list
4. **強調** — tier 階層維持
5. **動詞命令** — 「急いで」 等 NG

各 dimension を M-2b contract で機械検証。

### 6.2 革新 2: 「不足を警告に見せない」 ための 3 重防御

- **layer 1: 文言** — 「不足 N 分」 (= 中立)、 NG 文言不在
- **layer 2: 視覚** — slate のみ、 amber/orange/red 禁止
- **layer 3: 構造** — 「余白」 と「不足」 完全同 styling

3 重で警告化を防ぐ。

### 6.3 革新 3: 「not_applicable は表示しない」 設計判断

- L-4a unresolved は「→ 移動」 表示 (= fallback)
- M-2a not_applicable は **何も表示しない** (= 根拠なし)

これは「観測のみ」 思想の極致:
- 観測できないものは表示しない
- 「該当なし」 と表記すること自体が「該当があるかもしれない」 という推測を呼ぶ → 除外が clean

### 6.4 革新 4: 新 tier「tier_2_movement_aux」

L-4a の `tier_2_movement` の補助情報として階層化:
- 同 slate 階調
- 但し「補助」 という意味で sub-tier として扱う
- caller は L view の隣 / 下に小さく配置可能

### 6.5 革新 5: 「同 transitionKey での L + M 結合」 (= UI 接続時の hint)

- L-4a output: `transition_0` → 「移動 約 25 分」
- M-2a output: `transition_0` → 「余白 95 分」

caller (= UI 接続層) は同 key で結合可能。 但し UI 接続は M-3+ で別 audit。 M-2 は data 提供のみ。

### 6.6 革新 6: 「Counterfactual / Arrival Risk への dispense」

M-2 で「不足あり」 を表示しても、 これは:
- 観測の事実 (= 「移動が予定の余白を超える」)
- 評価ではない (= 「だから遅刻する」 と言わない)
- 推測ではない (= 「だから危険」 と言わない)

ユーザーは「不足 N 分」 を見て自分で判断:
- 「もっと早く出よう」 → user judgment (= M は推奨しない)
- 「移動手段を変えよう」 → user judgment (= M は推奨しない)
- 「予定を動かそう」 → user judgment (= M は推奨しない)

→ M はあくまで観測の表記。 user の自由意思を尊重 (= Aneurasync 思想)。

### 6.7 革新 7: 「per-transition のみ、 day-level は M-3+」

M-2 は **per-transition view のみ**。 day-level summary (= 「1 日合計余白 N 分」) は別 phase:
- per-transition view は事実の表記
- day-level summary は集計 (= 統計的解釈に近接)

→ M-2 範囲外。

---

## 7. M-2a/M-2b 最小 scope (= L-4a/L-4b と対称、 連続 GO 判定)

### 7.1 M-2a 着地物

- `lib/plan/feasibility/feasibilityDisplayFormatter.ts`
  - `FeasibilityDisplayView` type (= transitionIndex / displayText / variant / tier)
  - `FeasibilityDisplayResult` type (= feasibilityDisplayByTransitionKey + counts)
  - `formatFeasibilityForDisplay(result)` pure function

### 7.2 M-2b 着地物

- `lib/plan/feasibility/feasibilityDisplayContract.ts`
  - `FEASIBILITY_DISPLAY_CONTRACT` (= literal record、 6 invariants)
  - `FeasibilityDisplayContractError`
  - `assertFeasibilityDisplayCompliance` / `assertFeasibilityDisplayResultCompliance`
  - 6 invariants:
    1. `noPiiInDisplayText`
    2. `noPiiInViewKeys` (= 16 forbidden keys)
    3. `tierIsTier2MovementAux`
    4. `variantIsOneOfTwo` (= "slack" / "shortfall")
    5. `noNgWordingInDisplayText` (= 30+ NG word substring)
    6. `displayTextMatchesOkPattern` (= 2 OK 正規表現)

### 7.3 tests

- `tests/unit/plan/feasibilityDisplayFormatter.test.ts`
- `tests/unit/plan/feasibilityDisplayContract.test.ts`

### 7.4 type 設計確定

```typescript
export type FeasibilityDisplayTier = "tier_2_movement_aux";
export type FeasibilityDisplayVariant = "slack" | "shortfall";

export interface FeasibilityDisplayView {
  readonly transitionIndex: number;
  readonly displayText: string;  // 「余白 N 分」 or 「不足 N 分」
  readonly variant: FeasibilityDisplayVariant;
  readonly tier: FeasibilityDisplayTier;
}

export interface FeasibilityDisplayResult {
  readonly feasibilityDisplayByTransitionKey: ReadonlyMap<string, FeasibilityDisplayView>;
  readonly counts: {
    readonly slack: number;
    readonly shortfall: number;
  };
}
```

### 7.5 formatter 規則

```typescript
export function formatFeasibilityForDisplay(
  result: DayFeasibilityResult,
): FeasibilityDisplayResult {
  // not_applicable view は map から除外 (= 該当なしは表示しない)
  // sufficient → variant "slack"、 「余白 N 分」
  // insufficient → variant "shortfall"、 「不足 N 分」
}
```

---

## 8. STOP 条件 (= 連続 GO 着手前 必須クリア)

| STOP 条件 | M-2a/M-2b 範囲 |
|---|---|
| UI 表示が必要 | ❌ 不要 (= pure data) |
| Calendar / Map / Flow を触る必要 | ❌ 不要 |
| Arrival Risk Memory が必要 | ❌ 不要 |
| warning / recommendation / optimization に近づく | ❌ 不要 (= NG list 機械検証) |
| localStorage / DB / telemetry / API が必要 | ❌ 不要 |
| K / L / M-1 types を破壊的に変える必要 | ❌ 不要 (= 読み取りのみ) |

→ **全 6 STOP 条件未抵触**。 M-2a/M-2b 連続実装 GO 判定成立。

---

## 9. low-risk 連続実装可能範囲

| 項目 | 着手 |
|---|---|
| M-2a pure formatter | ✅ |
| M-2b display contract | ✅ |
| tests | ✅ |
| ❌ UI 接続 (= MapTab/Calendar/Flow) | NO (= M-3+ 別 audit) |
| ❌ DB / env / package / dependency 変更 | NO |
| ❌ localStorage / runtime telemetry sink | NO |
| ❌ Arrival Risk Memory | NO |
| ❌ Counterfactual / mode 推定 / Routes API | NO |

---

## 10. UI 接続前の残リスク (= M-3+ 着手前 確認事項)

| リスク | 内容 |
|---|---|
| 「不足 N 分」 が UI で警告に見える | 視覚階層 / 色 / 強調を M-3 で慎重に設計 |
| L 「移動 約 N 分」 と M 「不足 N 分」 の隣接表示 | tier 階調差で識別、 但し同 slate 系 |
| Calendar / Flow / MapTab 全展開 | L-4d-b1/b2 と同 pattern (= 段階的拡張) |
| 「不足」 表示が user に圧を与える | M-3 で UX 設計 + visual smoke 必須 |
| sensitive 予定の前後表示 | M-1 / M-2 の not_applicable 除外で防御済 |

---

## 11. CEO 判断ポイント (= 本 audit 着地後)

| Q | 内容 | 自律推奨 |
|---|---|---|
| Q1 | 補正 2 件 (= file 数記載 / privacy discipline) を永続規約化 | **YES** |
| Q2 | M-2 責務「Feasibility Display Layer」 と定義 | **YES** |
| Q3 | NG 文言 list 拡張 (= 記号系 / 緊急感 / 相対表現) を採用 | **YES** |
| Q4 | tier「tier_2_movement_aux」 を採用 | **YES** |
| Q5 | not_applicable view を map から除外 (= 表示しない) | **YES** |
| Q6 | M-2a/M-2b 連続実装 GO | **YES** (= low-risk 判定) |
| Q7 | UI 接続は M-3+ 別 audit | **YES** |

---

## 12. 永続禁止 (= 本 audit 以降に維持)

❌ M-2 で UI 接続 (= M-3+ は別 readiness audit)
❌ M-2 で Calendar / Map / Flow を触る
❌ M-2 で warning / recommendation / optimization / urgency 文言
❌ M-2 で 「ギリギリ」 「快適」 「危険」 「間に合わない」 「あと N 分」 等の質的評価語 / 緊急感表現 / 相対表現
❌ M-2 で 記号 (= ⚠️ / ❗ / ❌ / ‼ / 半角 ! / 半角 ?)
❌ M-2 で DB / env / package / dependency 変更
❌ M-2 で localStorage / runtime telemetry sink
❌ M-2 で Arrival Risk Memory / Counterfactual / mode 推定 / Routes API
❌ K / L / M-1 既存 types 改変
❌ frozen branches への commit (= 38 + 本 commit = 39 branches)

---

## 13. 関連 docs

- `docs/alter-plan-phase3-m-readiness-audit.md` (= M 全体責務定義)
- `docs/alter-plan-phase3-l-4-readiness-audit.md` (= L-4a/L-4b 対称 pattern)
- `docs/alter-plan-phase3-l-closeout-overview.md` (= L 全体 1 doc)
- `docs/decision-log.md`

---

## 14. 着地状態 + freeze 確定

本 commit 着地と同時に `docs/plan-phase3-m-2-readiness-audit` を **frozen 扱い** (= 39 frozen branches 計、 以後 commit 禁止)。

次は M-2a/M-2b 実装 branch を別途切り、 audit 結論 (= low-risk 連続 GO) に従って実装着手。 UI 接続前に停止。

---

## 15. 思想 transmission (= M-2 readiness audit から学ぶ)

1. **警告化要素 5 dimension の機械検証** — 色 / 形容詞 / 記号 / 強調 / 命令 全 dimension で防御
2. **3 重防御** — 文言 / 視覚 / 構造 で「不足を警告に見せない」
3. **not_applicable は map から除外** — 観測できないものは表示しない、 思想極致
4. **新 tier「tier_2_movement_aux」** — L 補助情報の階層化
5. **「ユーザーの自由意思を尊重」** — M は推奨せず、 観測のみ提供、 user が判断

---

## 16. 結語 — M-2 の意義

M-2 = **Feasibility Display Layer** = M-1 の pure data を **警告化しない pure display** に変換する layer。

「不足 N 分」 という事実を表記しつつ、 user に圧を与えない:
- 文言: 中立 (= 「不足 N 分」、 NG 文言不在)
- 視覚: slate 系のみ、 「余白」 と完全同 styling
- 構造: not_applicable は表示しない、 観測根拠のあるもののみ

これは Aneurasync の中心問い (= 「**この機能は、 ユーザーの第二の自己として必要か?**」) に対する M-2 の答え:

> 余白 / 不足の観測表記は、 ユーザーが自分の 1 日の傾向に気付くための **静かな鏡**である。 警告ではなく、 推奨でもなく、 ただ事実を中立に表記する。 ユーザーは鏡を見て、 自分で判断する。

**M-2a/M-2b 連続実装 GO**。 次は実装 branch + pure formatter + contract + tests を着地。
