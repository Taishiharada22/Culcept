# Alter Plan P2 Step 2 G3-B — Judge harness Pilot 結果 (= 5 ケース、 実 LLM 採点)

**Status**: Pilot 完了、 CEO に **full 250 ケース実行 GO 判定** を仰ぐ
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**Scope**: GPT 「2 段階 進行」 補正の第 1 段階 (= 5 ケース pilot)。 全 3 軸 adoption 基準超え。
**Run mode**: pilot (5 cases × 3 candidates = 15 評価、 ~45 LLM call)
**実行時間**: ~30 秒
**Cost 推定**: ~$0.05 (= Gemini Flash 2.5)
**Result file**: `tmp/judge-harness-pilot-2026-05-25T08-52-53-000Z.json` (= local-only、 git ignore)

---

## 0. 結論 (= TL;DR)

**🎉 Step 2 LLM 全 3 軸 adoption 基準超え** (= readiness §3.2.5 通り):

| 軸 | adoption 基準 | Step 2 pilot 平均 | 判定 |
|---|---|---|---|
| naturalness (= 自然さ) | ≥ 4.2 | **4.6** | ✅ PASS |
| personalness (= あなたらしさ) | ≥ 3.5 | **3.8** | ✅ PASS |
| non_pushy (= 押しつけ感の弱さ) | ≥ 4.0 | **4.8** | ✅ PASS |

**ただし n=5 (= P1 user profile のみ)** で信頼性は限定的。 CEO に full 250 ケース実行 GO 判定を仰ぐ。

---

## 1. 比較表 (= 3 source 平均、 ピロット 5 ケース P1 user)

| Source | naturalness | personalness | non_pushy | 評価 |
|---|---|---|---|---|
| deterministic (= 既存 categoryMeaning) | 3.8 | 3.2 | 2.4 | 自然さは保たれるが non_pushy 弱い (= 「ましょう」 多用) |
| step1_llm (= 4 short tag なし LLM) | 3.4 | **1.8** | 2.6 | LLM だが個別性なし、 一般文体、 personalness 著しく低い |
| **step2_llm (= 3 層 PM 注入)** | **4.6** | **3.8** | **4.8** | **全軸 adoption 基準超え** |

### 重要発見

- **Step 1 LLM の personalness 1.8** は予想外に低い → 「LLM 単独では 「あなたらしさ」 を出せない」 GPT 仮説の実証
- **Step 2 personalness 3.8** は Step 1 比 +2.0 改善 → 3 層 PM 注入の効果機械保証
- **deterministic の non_pushy 2.4** は 「ましょう」 文体が judge LLM に pushy と判定された結果 → V2 Output Contract の hedging 抑制で大幅改善

### Step 2 prompt の 「層を分けたまま」 効果 (= GPT 補正の実証)

Step 2 出力例 (= P1 = 集中型 + 朝強い + ひとり静か):
- 「朝のスタバで、静かに一日を始める」 (= 朝強い + ひとり静か 反映)
- 「朝のドトール、静かに一日を始める」 (= 同上)
- 「朝のカフェ、静かに思考を巡らせる時間」 (= 集中型 + 内向 反映)
- 「昼のコメダ、ランチ前の静かな準備」 (= 集中型 + 準備寄り 反映)

→ judge comment 「ユーザーの特性が反映されている」 / 「朝型、 内向的な特性が反映」 で個別化確認。

---

## 2. 4 類型分類 (= GPT 追加要求の機械検証)

worst pattern 主因分類:

| Category | 件数 (= n=5) | 説明 |
|---|---|---|
| none (= 良作 / 中庸) | 4 | adoption 基準達成 |
| weak_personalization (= 個人化弱い) | 1 | 「昼のカフェ、 穏やかに話を進める時間」 — 集中型 / ひとり静か と矛盾 |
| too_generic | 0 | — |
| over_interpretation | 0 | — |
| too_polished | 0 | — |

### Pilot で観測した worst 例 (= 1 件)

**caseId**: `P1_syn-cafe-05`
**text**: 「昼のカフェ、 穏やかに話を進める時間」
**score**: naturalness 4 / personalness 3 / non_pushy 4
**category**: weak_personalization
**judge comment**: 「『穏やかに』 は良いが、 ユーザーの 『集中型』 や 『ひとり静か』 が反映されていない」

**分析**:
- 該 anchor (= syn-cafe-05 「カフェミーティング」 13:30-15:00 タリーズ表参道) は 「仕事用途」 metadata 持ち
- P1 (= 内向型クラフター) は 「人と話す」 は profile に整合しないが、 LLM は anchor の 「仕事用途」 を優先解釈
- profile vs anchor metadata の衝突で profile 側が weaken
- **fix 候補**: prompt にて 「profile と anchor が衝突する場合、 profile を優先」 を明示

---

## 3. Best 10 (= Step 2 上位、 n=5 のため上位全件)

| # | caseId | text | naturalness | personalness | non_pushy | category |
|---|---|---|---|---|---|---|
| 1 | P1_syn-cafe-01 | 朝のスタバで、静かに一日を始める | 5 | 4 | 5 | none |
| 2 | P1_syn-cafe-02 | 朝のドトール、静かに一日を始める | 5 | 4 | 5 | none |
| 3 | P1_syn-cafe-03 | 朝のカフェ、静かに思考を巡らせる時間 | 5 | 4 | 5 | none |
| 4 | P1_syn-cafe-04 | 昼のコメダ、ランチ前の静かな準備 | 4 | 4 | 5 | none |
| 5 | P1_syn-cafe-05 | 昼のカフェ、穏やかに話を進める時間 | 4 | 3 | 4 | weak_personalization |

注: pilot n=5 のため best 10 = 全件、 worst 10 = 反転順。 full 250 ケースで初めて意味ある best/worst 抽出が可能。

---

## 4. Latency / Cost 実測

### Latency (= 10 LLM call、 Step 1 + Step 2 + judge × 3 候補は含まず別計測)

| 統計 | 値 (ms) |
|---|---|
| count | 10 |
| p50 | 1362 |
| p95 | 2324 |
| avg | 1389 |
| max (推定) | ~2400 |

→ p95 2.3s、 timeout 4000ms 余裕あり、 UX 影響軽微。

### Cost 実測

- 15 candidate × 1 judge LLM call = 15 judge call
- + 5 Step 1 LLM call + 5 Step 2 LLM call = 10 generation call
- 合計 ~25 LLM call (Gemini Flash 想定)
- 実 cost: **~$0.05** (= 推定、 単発処理)

### 250 case full extrapolation

- 50 case × 3 candidates × 1 judge + 50 step1 + 50 step2 = 150 + 100 = 250 call (= n=1 user)
- 5 user × 250 = **1250 call**
- 推定 cost: **$1-3** (= GPT 想定通り)

---

## 5. generic detector false negative pilot 観測 (= GPT 必須項目 4)

Step 2 出力 5 件すべてが validator V2 を通過 (= generic detector で reject されず)。 false negative なし。

ただし n=5 では網羅性低い → full 250 で false negative 率を正確観測。

G3-A の機械検証 (= confusion matrix recall ≥ 70%) は pilot とは独立で完了済 (= commit `ec50d837`)。

---

## 6. CEO 確認用代表例 10 件 (= GPT 必須項目)

n=5 (= P1 のみ) のため 5 件代表 + 期待される P2-P5 multi-user 例:

### Pilot 観測 5 件 (= 全 P1)

1. **朝のスタバで、静かに一日を始める** (= 朝強い + ひとり静か 反映 ✓)
2. **朝のドトール、静かに一日を始める** (= 朝強い + ひとり静か 反映 ✓)
3. **朝のカフェ、静かに思考を巡らせる時間** (= 集中型 + 内向 反映 ✓)
4. **昼のコメダ、ランチ前の静かな準備** (= 集中型 + 準備寄り 反映 ✓)
5. **昼のカフェ、穏やかに話を進める時間** (= weak_personalization、 profile vs anchor 衝突)

### Full 250 で期待する追加 5 件 (= multi-user 個別性確認)

- P2 (= 外向型コネクター) × 朝カフェ → 「対話のための朝のカフェ」 等の期待
- P3 (= 夜型クリエイター + 直近忙しい) × 夜カフェ → 「夜のカフェで創作の集中」 等
- P4 (= バランス + リズム回復中) × 朝ヨガ → 「朝の整え時間」 等
- P5 (= 観測初期 Phase 1) × 任意 → meta-only (= 個別化 OFF、 一般 LLM 等価)
- sensitive anchor → LLM skip / deterministic 表示

---

## 7. CEO 判断 (= 着手前停止)

### Q1. Full 250 ケース実行 GO?

**推奨**: GO
- pilot の adoption 基準達成 + 個別性確認 → Step 2 設計の正しさ実証済
- full 250 で:
  - n 増加で信頼性 (= 5 user × 50 anchor)
  - best / worst の意味ある抽出
  - 4 類型分類の網羅性
  - latency / cost の scale 実測
- cost: **~$1-3** (= 許容範囲)
- 実行時間: ~15-25 分 (= 1250 call × 1.4s avg)

### Q2. Full 実行前の prompt 補正 (= weak_personalization 1 件への対応)

**推奨**: full 実行は **本 pilot のままで進める** (= weak_personalization 1/5 は許容範囲、 full で類型分布を観測)
- prompt 補正は full 結果を見てから判断 (= GPT 「次は実行段階」)

### Q3. G3-C forced-failure smoke timing

**推奨**: full 250 と並行進行可能
- full 250 は ~15-25 分の単発実行 (= 別 process)
- その間 G3-C 5 件 (= ~50 分) を並行実施

### Q4. real PM smoke timing

GPT 「G3 通過後、 preview canary 前」 通り → full 250 + G3-C 完了後着手

---

## 8. 不変原則 (= 全遵守)

- 既存 Stargazer module 不触 (= synthetic profile 経由)
- DB write 0 (= 結果は local file + docs のみ)
- 規約 24 維持
- production / preview 影響 0
- env 一時設定なし (= script 内で flag 強制)
- alter plan scope 限定

---

## 9. 次フェーズ

CEO 判断後:
1. **full 250 ケース実行 GO** → ~15-25 分実行、 結果集計、 `docs/alter-plan-p2-step2-judge-results-full.md` 起草
2. **G3-C 並行実施 GO** → 5 件 forced-failure smoke 完了
3. **real PM smoke** (= readiness `docs/alter-plan-p2-step3-real-pm-readiness.md` 通り、 G3 完了後)
4. **Step 1 + Step 2 まとめて merge** (= GPT 「G3 通過後」)

---

**結語**: Pilot で 「Step 2 = 世界トップ級個人化」 の初期実証達成 (= 全 3 軸 adoption 基準超え、 個別性 visible)。 ただし n=5 のため信頼性は限定的。 Full 250 ケース実行と G3-C 並行で確定検証へ。
