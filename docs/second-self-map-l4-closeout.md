# Second Self Map — L4 closeout（cold-start partial-pooling・pure + 配線 main 着地）

> 2026-06-05 / **L4 完全着地**: pure `93aa5653`（L4-a+L4-b）+ 配線 `44633d16`（MapTab swap）・main。push/PR/Vercel 未実施。
> 上位: `docs/second-self-map-l4-mini-design.md` / `docs/second-self-map-l4b-mini-design.md` / `docs/second-self-map-l4b-closeout.md`（設計段階）。

---

## 1. 着地サマリ（pure と配線を分離）
| 段階 | commit | 内容 |
|---|---|---|
| L4 pure 着地 | `93aa5653` | L4-a `buildPooledBelief`(2-level) + L4-b `buildPooledBeliefMultiLevel`(multi-level)・**未配線**で固定。cherry-pick(0b4f404e+8ce05b27)で L1 状態の上に L4 デルタのみ squash |
| L4-b 配線 着地 | `44633d16` | MapTab `loadRepertoireBelief → loadPooledBeliefMultiLevel`(1 行 swap)+ targeted smoke |

→ pure の正しさと配線の問題を分離できる構造（CEO 方針）。

## 2. L4-b 設計（live）
- chain: `leg ← odKey×timeband×weekday ← odKey×weekday ← odKey ← global marginal`（relax timeband 先・単一）。
- **★effSize 伝播 + `min(κ, parent.effSize)` cap**: global を弱い seed 化（effSize≤κ_global=1）→ **global-only は過剰 surface しない**。
- per-level κ `{leg:3, context:3, global:1}`（const）・**root 空（uniform seed なし）→ 厳密退行ゼロ**。
- 強 legKey guard（strength==="strong"）/ redacted・unknown 除外 / feedback JOIN precision / selectedStore 正本。
- buildRepertoireBelief(L1-b) / buildPooledBelief(L4-a) / v0 温存（additive）。

## 3. 検証（main 文脈）
- **smoke 7 項目 PASS**（integration）: ①empty→v0/L1 同一 ②strong legKey 非上書き ③cold+OD prior 効く ④global-only 非過剰 surface ⑤context 優先 ⑥redacted/sensitive 不使用 ⑦existing UI/copy/MobilityLegCard 不変。
- mobility **161 test PASS**・tsc footprint 0・zero-loss・MobilityLegCard/selectedModeStore/hypothesisFeedbackStore/mobilityObservationStore 不変・temp 混入 0。
- **production 挙動変更**: belief source が L4-b に。**現状データゼロ → 即時は v0/L1 同一**（退行ゼロ）。観測蓄積で multi-level pooling が段階的に効く（cold leg は OD/context prior・新 OD+global は弱く非過剰）。

## 4. 配線判断（resolved）
設計段階の lean は Path B（データ後）だったが、**CEO 判断 = 今配線（Path A）**。理由＝L4-b は退行ゼロ + effSize-safe で即時リスクなし・pure を先に固定したので pure/配線を分離して問題切り分け可能。

## 5. 残（CEO 判断待ち）
- **L4-c κ 較正**: 固定 κ {3,3,1} → data-driven（held-out / empirical-Bayes / 使用シグナル）。**実データ蓄積後**。`docs/second-self-map-l4b-closeout.md §2`。
- remote push / PR / Vercel / deploy = 禁止（未実施）。
- 次フェーズ = **L3 selective forgetting**（mini design: `docs/second-self-map-l3-mini-design.md`）。

## 6. 全体像（Second Self Map）
| 層 | 状態 |
|---|---|
| v0（仮説 + feedback + 加重 belief） | ✅ main（live） |
| L1（観測前方記録 + OD 条件付き belief） | ✅ main（live） |
| L4-a + L4-b（partial-pooling・multi-level + global） | ✅ main `44633d16`（**live・配線済**） |
| L4-c（κ 較正） | ⏳ データ後 |
| L3（selective forgetting） | mini design 段階 |
