# M0-6A challenge agreement が 60% に留まった理由（切り分けメモ）

**locked 2026-04-20 / M0-6B 着手前の解釈固定**

## TL;DR

`challenge` の modeAgreement 60% (30/50) は
**stub strategy `celebrate-bias` の決定論的 override が構造的に全件を潰している**
結果であり、以下 2 つの可能性は**現段階では棄却**する。

- ❌ synthetic pair の mode 設計不良 — rule-based は 10/10 challenge と判定しており意図通り
- ❌ LLM shadow の弱点 — 実 LLM は未接続。今の数値は全て stub が作った決定論的擬似値

## 計算根拠

`challenge` 50 件 = 10 cases × 5 strategies。各 stub を追う:

| strategy | challenge 判定への挙動 | 期待一致 |
| --- | --- | --- |
| copycat | rule-based と同じ cascade を再現 | 10/10 |
| shifted-energy | `energyBudget` のみ変化、`mode` は変えない | 10/10 |
| **celebrate-bias** | **`arc === "expanding"` を全件 `celebrate` に flip** | **0/10** |
| recover-bias | `fatigueSignal !== "none"` でのみ発火。challenge cases は fatigue=none | 10/10 |
| random-deterministic | hash%5 で 5 mode 回転、challenge 命中期待値 | ~2/10 |
| **合計** | | **~32/50 ≈ 64%** |

観測 30/50 (60%) はこの期待値とほぼ一致する。random-deterministic の実挙動が
FNV-1a hash 入力差で 2 件未満だった分だけ下振れしていると解釈できる。

challenge cases は定義上 `arcOverride: "expanding"` を強制するため、
celebrate-bias の決定論的 flip と完全に衝突する構造。これは意図通りの
「rule-based と食い違う stub で信号が立つかを確認する」という
adversarialStubs 設計目的の裏返しであり、**設計不良ではなく設計の作動**。

## M0-6B での解釈含意

- 実 API shadow 接続後、challenge agreement が **70% 以上に回復** するのが想定経路
  （実 LLM は celebrate-bias のような 1 条件 override は起こしにくい）
- 実 LLM でも **60% 近傍に留まる** 場合は、初めて以下 2 系統の診断に進む:
  1. synthetic: arc=expanding かつ両者 ren-leaning の組合せが自然言語で
     celebrate 解釈されやすい余地を残していないか
  2. LLM: energyBudget や latentNeeds は一致しても mode 解釈で expand→celebrate
     に流れる傾向があるか（実 prompt 側の cascade 弱さ）
- 今は stub 集計なのでこの切り分けは**保留**。観測値が出るまで解釈を固めない。

## 関連ファイル

- [lib/coalter/understanding/__testkit__/adversarialStubs.ts](../lib/coalter/understanding/__testkit__/adversarialStubs.ts) — celebrate-bias 実装
- [lib/coalter/understanding/__testkit__/syntheticPairs.ts](../lib/coalter/understanding/__testkit__/syntheticPairs.ts) — challenge cases 生成
- [scripts/coalter/shadow-replay.ts](../scripts/coalter/shadow-replay.ts) — mode 別集計出力
- [docs/coalter-m0-promotion-gates.md](./coalter-m0-promotion-gates.md) — Gate B-4 定義
