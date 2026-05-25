# Alter Plan P2 Step 2 v3.3 — Judge Harness 再評価結果 (= P3 改善、 P4 後退 = 部分失敗)

**Status**: 再評価完了、 **採用判定 NO-GO 推奨** (= 正直報告、 v3.4 / 別 approach 検討要)
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**Scope**: v3.3 small targeted patch (= P3+P4 軸別 hint + few-shot 2 倍化) 後の再評価
**Run mode**: full、 250 cases × 3 candidates = 750 evaluations
**Result file**: `tmp/judge-harness-full-2026-05-25T11-41-31-746Z-entries.json` (= git ignore)

---

## 0. 結論 (= TL;DR)

### v3.3 判定: **部分失敗 (= 採用 NO-GO 推奨)**

| Profile | v3.2 per | **v3.3 per** | Δ | 判定 |
|---|---|---|---|---|
| P1 (集中型) | **4.23 ✅** | **4.02 ✅** | -0.21 | adoption pass 維持 (= 微 regression) |
| P2 (関係エネルギー型) | **4.04 ✅** | **4.08 ✅** | +0.04 | adoption pass 維持 ✅ |
| **P3 (分散型 + 夜強い)** | 3.15 | **3.46** | **+0.31** | △ **near-pass (= 3.4-3.49、 strict 3.5 未達)** |
| **P4 (中庸型)** | 3.09 | **2.93** | **-0.16** | ❌ **後退 (= v3.2 より悪化)** |
| P5 (Phase 1) | 1.70 | 1.69 | -0.01 | n/a (= 設計通り) |

### 重要発見

1. **P3 改善**: +0.31、 near-pass 到達 (= 「分散的閃き」 hint + 「散らした思考」 few-shot が効いた)
2. **P4 後退**: -0.16、 v3.2 より悪化 (= **「振り幅 / バランス / 中和」 hint が誤って働いた**)
3. **P1 微 regression**: -0.21 (= 許容範囲、 adoption pass 維持)
4. weak_personalization: 23.3% → 24.7% (+1.4%、 微増)
5. **「る時間」 ending 60%** = few-shot template 化 signal 継続 (= GPT 警戒項目)

---

## 1. Filtered Averages (= GPT 必須 1)

```
deterministic   n=209  nat=3.31  per=1.78  npu=2.33   (= v3.2 と同等、 期待通り不変)
step1_llm       n=241  nat=3.61  per=1.40  npu=3.22   (= v3.2 と同等)
step2_llm       n=235  nat=4.10  per=3.24  npu=3.93   (= v3.2 から微低下)
```

### v3.2 → v3.3 step2 比較

| 軸 | v3.2 | v3.3 | Δ |
|---|---|---|---|
| naturalness | 4.12 | 4.10 | -0.02 (= 不変) |
| personalness | **3.27** | **3.24** | **-0.03 (= 微低下)** |
| non_pushy | 4.03 | 3.93 | -0.10 |

→ **全体 step2 personalness が v3.2 より微低下** = v3.3 patch は全体としては net negative

---

## 2. P1-P5 別 (= GPT 必須 2、 strict 判定)

| Profile | n | nat | per | npu | strict 判定 | v3.2 比 Δper |
|---|---|---|---|---|---|---|
| P1 | 47 | 4.45 | **4.02** ✅ | 4.30 | ✅ adoption pass (= 維持) | -0.21 (= 軽微 regression) |
| P2 | 48 | 4.04 | **4.08** ✅ | 3.92 | ✅ adoption pass (= 維持) | +0.04 |
| **P3** | 48 | 4.00 | **3.46** | 3.98 | △ near-pass (= 3.4-3.49) | **+0.31** (= 部分改善) |
| **P4** | 44 | 4.02 | **2.93** | 3.91 | ❌ 未達 | **-0.16** (= **後退**) |
| P5 | 48 | 3.98 | 1.69 | 3.54 | n/a (= 設計通り) | -0.01 |

### 分析

- **P3 効いた**: 「分散型 + 夜強い」 hint と 「散らした思考が新しい筋を編む」 「思考が漂い 新しい線を見つける」 few-shot が効果
- **P4 効かなかった (= むしろ後退)**: 「振り幅 / バランス / 中和」 hint と 「振り幅を整えながら踏み出す」 「バランスを取り戻すための一区切り」 few-shot が逆効果
- **P1 微 regression**: v3.3 で system prompt に追加された hint が P1 (静か / 集中) を弱めた可能性 (= 「分散」 「振り幅」 等の語彙が混在)

---

## 3. 4 類型分布 (= GPT 必須 3、 weak_personalization)

| Category | v3.2 | v3.3 | Δ |
|---|---|---|---|
| none (= 良作) | 158 (68.1%) | 155 (66.0%) | -2.1% |
| **weak_personalization** | **54 (23.3%)** | **58 (24.7%)** | **+1.4% ⚠️** (= 微増、 期待外) |
| too_generic | 9 (3.9%) | 14 (6.0%) | +2.1% (= 微増) |
| **over_interpretation** | **11 (4.7%)** | **8 (3.4%)** | **-1.3% ✅** (= 改善) |
| too_polished | 0 (0%) | 0 (0%) | 維持 ✅ |

### 分析

- ✅ over_interpretation -1.3% (= v3.3 hint で 「深い」 系語彙が減少)
- ⚠️ **weak_personalization +1.4%** (= GPT 期待減少と逆、 net negative)
- ⚠️ too_generic +2.1% (= P4 hint が generic 寄りに働いた可能性)
- ✅ too_polished 0% 維持 (= 文体テンプレ化なし、 GPT 要件遵守)

---

## 4. Top 10 / Worst 10 (= GPT 必須 4)

```python
import json
top10 = ...  # personalness + naturalness 上位 10
```

(注: P1+P2 の adoption pass 例は v3.2 と類似、 ここでは省略。 重要は **P3+P4 観察**)

### P3 サンプル (= 改善した user の代表例)

- 「深夜のオフィス、 散らした思考が新しい筋を編む」 (= n5 p5 u5、 hint 通り 「散らした思考」 反映)
- 「夜のカフェ、 思考が漂い新しい線を見つける」 (= n5 p5 u5、 few-shot 通り)
- 「深夜の自宅、 思考が拡がる時間」 (= n4 p4 u4、 「拡がる」 で分散性 visible)

→ P3 では hint が効いた case が visible に。

### P4 サンプル (= 後退した user の代表例)

- 「朝の自宅、 整える時間」 (= n3 p2 u4、 v3.2 同様の generic)
- 「朝のオフィス、 一日の振り幅を整える」 (= n4 p3 u4、 「振り幅」 入っているが judge が generic 判定)
- 「夜の自宅で バランスを取り戻す時間」 (= n4 p2 u3、 「バランス」 入っているが個別感薄い)

→ **P4 hint が 「機械的反復」 になり、 judge LLM に generic 判定された**

---

## 5. Few-shot template 化観察 (= GPT 拡張 5: comma + 文長 + 終わり方 + 比喩)

| 観点 | v3.2 | v3.3 | 判定 |
|---|---|---|---|
| **Length range** | 18-26 字 (8 span) | **16-29 字 (13 span)** | ✅ 大幅多様化 (= comma 散らし効果) |
| **Comma 使用** | 全件 1 個 | 1 個 29 件 + 2 個 1 件 | ⚠️ ほぼ uniform (= わずか散らし) |
| **Ending top** | 10 種 | **「る時間」 60% dominant** | ⚠️ template 化進行 (= 警戒) |
| **Metaphor** | 観察なし | 2/30 (= 7%) | ✅ 適度 |

### 重要警戒

- **「る時間」 ending が 60% (= 18/30)** = v3.2 から悪化、 few-shot の影響が強く出ている
- LLM が 「〜時間」 で文を締めるパターンを学習 = template 化 signal

---

## 6. Env revert 完了確認 (= GPT 必須 5)

```bash
$ grep -E "PLAN_ALTER_NOTE_LIVE|PLAN_PERSONAL_MODEL_INTEGRATION|v3.3 re-eval" .env.local
(empty output)
```

→ ✅ **完全 revert**:
- `PLAN_ALTER_NOTE_LIVE=true` 削除済
- `PLAN_PERSONAL_MODEL_INTEGRATION=true` 削除済
- `# v3.3 re-eval session` comment 削除済

---

## 7. なぜ v3.3 は失敗したか (= 根因分析、 思考原則 ① 前提を疑う)

### 7.1 P3 改善が効いた理由

- **「分散的閃き / 思考の漂流」 hint** が judge LLM に 「dispersive な軸」 を伝えられた
- few-shot 「散らした思考が新しい筋を編む」 が **具体的な意味方向** を学習させた
- 「分散型」 という profile uniqueness が **明確** (= 集中型と対極で identification 容易)

### 7.2 P4 後退の理由 (= 重要)

#### Hypothesis 1: 「振り幅 / バランス / 中和」 hint が抽象すぎた

- 「振り幅」 「中和」 等は **専門語彙** で、 判官 LLM が 「自然な日本語」 として評価しにくい
- 結果、 LLM は hint をそのまま使う (= 「振り幅を整えながら」) が、 judge は 「機械的反復」 と判定
- 「自然 vs 個別性」 の trade-off で **自然性が勝って個別性が立たない**

#### Hypothesis 2: 中庸型自体が判定難

- 「中庸 = バランス」 は judge LLM にとって **唯一性が薄い概念**
- どんな active 語彙を使っても 「平均的」 と判定されがち
- → **中庸型を strict 3.5 に到達させるのは synthetic dataset では本質的に困難** な可能性

#### Hypothesis 3: P4 profile の synthetic 表現自体が弱い

- P4 = 「中庸型 + 朝強い + 直近休息余裕」 = uniqueness が薄い
- 実 user (= 実 Stargazer Personal Model) なら 「中庸の中の個性」 が明確に出る可能性
- → **real PM smoke で見るべき疑い**

### 7.3 P1 微 regression の理由

- v3.3 で 「分散」 「振り幅」 等の hint が prompt 末尾に追加された
- P1 (= 集中型 / ひとり静か) でも prompt 全文を読んで影響を受ける
- 軽微だが 「静か / 集中」 軸の rigid さが薄れた可能性

### 7.4 「る時間」 ending dominance の理由

- v3.2 few-shot 4 例中 3 例が 「〜時間」 で終わる (= P1/P2/P4 例)
- v3.3 で例を 6 例に増やしても、 4/6 は 「〜時間」 ending
- → LLM が ending pattern を強く学習、 「る時間」 で固定化

---

## 8. CEO 判定 (= 着手前停止、 重要)

### Q1: v3.3 採用?

**推奨 NO-GO (= 不採用)**:
- P3 のみ部分改善 (= near-pass、 strict 3.5 未達)
- **P4 後退** (= -0.16、 v3.2 より悪化)
- P1 軽微 regression (= -0.21)
- 全体 step2 per: 3.27 → 3.24 (= net negative)
- → v3.2 を base として維持、 v3.3 は不採用

### Q2: 次の選択肢

#### Option A: v3.2 維持 + real PM smoke へ直接進む
- 理由: P3+P4 の synthetic limitation の疑い (= Hypothesis 3)
- 実 user PM (= Stargazer 軸データ) で 「中庸の中の個性」 が visible になる可能性
- GPT 「real PM smoke 直行 NG」 だったが、 v3.3 失敗で次の選択肢として浮上
- ただし GPT の懸念 (= 「prompt の弱さと real PM 効き方が混ざる」) は残る

#### Option B: v3.4 で P4 のみ別 approach
- P3 改善 patch は keep、 **P4 hint を全面書き直し**
- approach: 「中庸 = バランス」 ではなく **「ニュートラルの中の動き」** で立てる
  - 例 hint: 「中庸型 = 偏りを持たない user は、 anchor の **状況自体** に注意を向けやすい」
  - example: 「朝のオフィス、 一日の流れを観察しながら入る」 (= profile 反映ではなく **observation 軸** で個別化)
- few-shot で P4 例を 「整える / バランス」 系から **観察軸** に切替
- 工数: 1-2 patch、 ~30 分実装 + 25-30 分 re-eval

#### Option C: v3.3 部分採用 (= P3 hint だけ keep、 P4 hint revert)
- P3 hint と few-shot は v3.3 のまま、 P4 hint と few-shot は v3.2 に戻す
- 期待: P3 改善維持 + P4 v3.2 比不変
- ただし adoption pass は P1+P2 のみ、 strict 全達成は未だ

### Q3: 「る時間」 ending template 化への対応

- Option A: few-shot に 「〜とき」 「〜踏み出す」 等の non-「時間」 ending 例を増やす
- Option B: 現状監視 (= naturalness 維持優先)

### Q4: real PM smoke timing

- v3.3 failure を踏まえ、 real PM smoke 着手 timing 再考:
  - 早めに着手 (= Option A): synthetic limitation の疑いを実 PM で検証
  - v3.4 後に着手 (= Option B): synthetic で P3+P4 両方 adoption 達成してから

---

## 9. 不変原則 (= 全遵守)

- env / DB / package / dependency 変更 0 (= 完全 revert 済)
- 既存 Stargazer module 完全 frozen
- broad rewrite 禁止 (= v3.3 patch も 2 file 段落追加のみ)
- 規約 24 維持
- regression 0 (= 3280 tests PASS)
- 正直報告 (= v3.3 失敗を隠さず提示)

---

## 10. 次フェーズ (= CEO 判定後)

CEO Q1-Q4 判定後:

### Option A 採用時
1. v3.3 不採用、 branch revert
2. v3.2 base で local main 統合 (= 既に main に統合済、 v3.3 は捨てる)
3. real PM smoke 着手 (= Step 3、 readiness 起草済)

### Option B 採用時
1. v3.3 branch 上に v3.4 small patch 追加
2. G3-B 再 run (= 4 度目)
3. 採用判定 → real PM smoke

### Option C 採用時
1. v3.3 patch から P4 部分のみ revert (= P3 keep)
2. G3-B 再 run
3. 採用判定 → real PM smoke

---

**結語**: v3.3 は **P3 部分改善 + P4 後退** で、 GPT「strict 3.5 両者達成」 基準を満たさず **採用 NO-GO 推奨**。 P4 失敗の主因は 「振り幅 / バランス / 中和」 hint の **抽象性 + 専門語彙性**。 次の選択肢 (= Option A real PM 直行 / Option B v3.4 P4 別 approach / Option C v3.3 部分採用) を CEO 判定。
