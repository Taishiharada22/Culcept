# SR A1 confusable warning 過剰調整 readiness（docs-only）

> 区分: **readiness（docs-only）**。設計の整理のみ。**実装は本書提出後の CEO 判断待ち**。
> A3 smoke-lite の副次観測「confusable 19/31（61%）soft 発火」を受けた調整トラック。
> 保存 block は引き続きしない（confusable は soft 維持）。VLM は回さない。

---

## 0. 目的 / 位置づけ

A3 smoke-lite（`public/shift-demo-july.png`・VLM 1回）で **confusable が 31 日中 19 日（61%）に soft 発火**した。soft（非ブロック）だが、実画面で cell amber が大半に点くと「**本当に見るべき日**」が埋もれる。本書は confusable warning を「見やすい精度」へ調整する設計を整理する（A1 のチューニング・A3 とは別軸）。

中心問い：**「この日の amber は、人が本当に原稿照合すべき日か？」** — 全部疑うのではなく、誤読リスクが高い日に絞る。

---

## 1. 現状（A1 実装事実・file:line）

- ペア定義: `HARADA_CONFUSABLE_PAIRS = [["E","E-18"],["H","HREQ"],["H","N"]]`（`shiftConfusableCodes.ts` L29-33）。
- 検出: `detectConfusableCells` → `ConfusableCodeHint[]`。**severity は常に `"soft"` 単一**（L83）・**confidence 非依存**（高 conf でも flag・L10）・各該当セル 1 件。
- 駆動先（**現状 panel と cell amber が同一 set**）:
  - panel: `shiftDraftRiskModel` の `confusable_code` hint（soft・`shiftDraftRiskModel.ts` L209-221）。
  - cell amber: `ShiftReviewGrid` の `confusableDays`（`detectConfusableCells` 由来・L226-234）→ `needsReview = blankRisk || confusable`（A1B）。
- → **tier が無い**ため、E/E-18 も H/N も同じ重みで cell amber を点ける。

---

## 2. 診断（19/31 の内訳・H が主因）

### コード別（実 smoke-lite 結果）
| code | 出現日 | 件数 | 所属ペア |
|---|---|---|---|
| E | 13, 26 | 2 | E↔E-18 |
| E-18 | 4, 18, 30 | 3 | E↔E-18 |
| H | 3,9,10,16,17,23,24,29,31 | **9** | H↔HREQ **かつ** H↔N |
| HREQ | 2 | 1 | H↔HREQ |
| N | 6,14,20,27 | 4 | H↔N |
| **計** | | **19** | |

### ペア別
- E↔E-18: 5 セル
- H↔HREQ: 10 セル（H 9 + HREQ 1）
- H↔N: 13 セル（H 9 + N 4）

### 核心
**H（公休）が支配的（9/19）**。H はロスターで最頻のコードであり、かつ **2 ペア（H/HREQ・H/N）の基底**。よって「H が出るたびに amber」が flood の主因。E/E-18 は 5 セルで限定的。

---

## 3. CEO 暫定推奨の批判的評価（鵜呑みにしない）

CEO 推奨: `E/E-18=strong / H/HREQ=medium / H/N=weak（cell amber から外す or panel summary のみ）`。

**評価**: tier 化の方向は妥当。ただし **tier だけでは flood が十分に減らない**。理由：H/N を weak（panel のみ）にしても、**H は H/HREQ（medium）経由で cell amber に残る**（H の effective tier = max(medium, weak) = medium）。
- H/N weak 化で **減るのは N（4 セル）だけ**。cell amber は 19 → **15**（H 9 が残るため、依然 48%）。

→ tier に加えて **2 つの refinement** を提案（CEO 案を超える設計・rule #6/#7）:

### refinement A: directionality（at-risk な「出力」だけ flag）
誤読リスクは**方向性がある**。flag は VLM の **出力 rawCode** に付くので、「その出力が**実は別コードの誤読**かもしれない」ものだけ flag すれば良い:
- 出力 `"E"` … 実は E-18 を**接尾辞落とし**で読んだ可能性 → **at-risk**。
- 出力 `"E-18"` … 接尾辞を**幻覚で足す**ことは稀 → **信頼できる**（flag 不要）。
- 出力 `"H"` … 実は HREQ を**接尾辞落とし**で読んだ可能性 → at-risk。
- 出力 `"HREQ"` … 信頼できる（flag 不要）。
- H↔N … 同長・単字で対称 → 双方 at-risk（ただし weak）。

→ **directionality を入れると、E-18(3) と HREQ(1) は flag から外れる**（信頼できる出力）。より正確かつ flag が減る。

### refinement B: cell amber は tier で絞り、panel は summary 化
- cell amber: **strong（+medium）** の at-risk 出力のみ。
- panel: 残り（weak 含む）を **件数 summary**（「X 日に似た形のコードがあります」）で 1 行化。

### 効き目の試算（directionality + tier）
| 出力 | tier | at-risk? | cell amber | panel |
|---|---|---|---|---|
| E（2日） | strong | ✓ | **点く** | 含む |
| E-18（3日） | strong | ✗（信頼） | 消える | — |
| H（9日） | medium（via H/HREQ） | ✓ | **点く** | 含む |
| HREQ（1日） | medium | ✗（信頼） | 消える | — |
| N（4日） | weak（via H/N） | △ | **消える** | summary のみ |

→ cell amber: 19 → **11**（E 2 + H 9）。E-18/HREQ/N が外れる。
→ **残課題**: H（9）が medium で残るため依然 11/31（35%）。H をさらに減らすには **H/HREQ を weak に降格**するか（→ amber = E のみ = 2/31）、H 自体を cell amber 対象外にする判断が要る（§4 D3）。

---

## 4. CEO 指定 10 論点への設計

| # | 論点 | 設計 |
|---|---|---|
| 1 | 19/31 の内訳 | §2 のとおり（H 9 が主因） |
| 2 | E/E-18 は強く残すか | **YES = strong**。接尾辞落としは実誤読リスクが高い（直す価値最大）。directionality で出力 `"E"` のみ flag |
| 3 | H/HREQ は残すか | **medium**。ただし H が最頻＝flood 主因。directionality で出力 `"H"` のみ flag。**flood 残るなら weak 降格を D3 で判断** |
| 4 | H/N 過剰なら弱める/除外 | **weak**。cell amber から外し **panel summary のみ**（または dev-observation only）。実 smoke で H/N の実誤読は観測されず（全 0.99）＝予防的ペア |
| 5 | severity within soft | **YES**。`tier: "strong"\|"medium"\|"weak"` を `ConfusableCodeHint` に追加（**全て soft 維持**＝非ブロック） |
| 6 | panel 表示と cell dot 表示の分離 | **YES**。cell amber = strong(+medium) の at-risk 出力。panel = 全件（summary 可）。pure 層で `confusableCellAmberDays()` policy helper を分離 |
| 7 | warning 多い時 summary 化 | **YES**。cell-amber 件数が閾値超なら panel を「X 日に似た形のコードがあります」1 行 + 内訳折りたたみへ |
| 8 | 保存 block | **引き続きしない**（confusable は soft 維持・`blockSave` 非参加） |
| 9 | test 方針 | pure unit（tier 割当・directionality・`confusableCellAmberDays` policy）+ render contract（cell amber 件数・panel summary・save active 維持） |
| 10 | 実装分割 | §6 |

---

## 5. CEO 判断を仰ぐ点（実装着手前の gate）

| # | 論点 | 選択肢 | Claude 推奨 |
|---|---|---|---|
| **D1** | tier 値 | E/E-18=strong / H/HREQ=medium / H/N=weak（CEO 案） | **採用** |
| **D2** | directionality | (A) 入れる（at-risk 出力のみ flag・E-18/HREQ を外す） / (B) 入れない（従来どおり両端 flag） | **(A)**。より正確かつ flood 減 |
| **D3** | cell amber の tier | (a) strong のみ（E→2/31・最小） / (b) **strong+medium**（E+H→11/31・CEO 案寄り） / (c) strong+medium だが H/HREQ も weak 降格（E→2/31） | **(b) で開始、H flood が体感過多なら (c)**。smoke で実測してから決める |
| **D4** | summary 閾値 | cell-amber 件数 > N で panel summary 化（N=？） | 例: N=6（=1週間超）で summary |

---

## 6. 想定 sub-step 分割（実装は CEO GO 後）

- **A1-tune-1（pure のみ・CEO「pure/risk model だけで収まるなら GO」に対応）**:
  - `shiftConfusableCodes.ts`: ペアに tier を付与（`ConfusablePairSpec {pair, tier}`）+ `directionality`（at-risk 出力判定）+ `ConfusableCodeHint.tier` 追加 + `confusableCellAmberDays(hints, policy)` policy helper（どの tier を cell amber に出すか）。
  - `shiftDraftRiskModel.ts`: `confusable_code` hint に tier/summary 反映（panel 側）。
  - 単体 test（tier 割当・directionality・cellAmber policy・summary）。
  - **pure + risk model のみ**。UI 非接触 → diff preview で停止。
- **A1-tune-2（UI wiring・最小）**:
  - `ShiftReviewGrid`: cell amber を `confusableCellAmberDays`（pure 決定済）に差し替え。panel summary 表示。
  - render contract 更新（amber 件数減・panel summary・save active 維持）。
  - flag OFF 既定なし（confusable は既に soft 常時。tier は純粋な絞り込みなので段階フラグ不要・必要なら追加）。

---

## 7. scope / 非 scope / 禁止

### scope
- confusable の **tier 化 + directionality + cell amber / panel 分離 + summary**（A1 領域のみ）。

### 非 scope
- read-miss / 空欄分離（A3）・rowLabel（A2）・unknown_code（hard・不変）・blank_risk（D3・不変）。
- confusable を **hard block** にすること（禁止・soft 維持）。

### 禁止（実装着手まで・着手後も）
```
本 readiness 段階: コード/risk model 実装（設計のみ）
全般: VLM 実行 / 保存再実行 / DB write / PLAN_SHIFT_IMPORT_SAVE=true /
  production / push / PR / deploy / raw 画像・base64・VLM raw response commit
```

---

## 8. 結論

- 過剰の核心は **H（公休・最頻 + 2 ペアの基底）**。tier だけでは H が残るため、**directionality（at-risk 出力のみ flag）** を加えると E-18/HREQ が外れ、cell amber 19→11 に。H の更なる削減は **H/HREQ tier 判断（D3）** 次第。
- 全て **soft 維持**（保存 block しない）。cell amber を絞り、残りは panel summary。
- **本書は readiness（docs-only）。実装は CEO 判断（D1-D4）後**。pure/risk model に収まる A1-tune-1 から着手予定。
