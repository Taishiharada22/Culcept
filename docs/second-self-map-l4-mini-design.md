# Second Self Map — L4 mini design（cold-start partial-pooling・階層 shrinkage）

> 2026-06-05 / **設計・計画のみ・実装は CEO GO 後** / 前提: v0 + L1（L1-a 観測前方記録 + L1-b OD 条件付き belief）main 着地済（`3d3d24a8`）。
> 上位: `docs/second-self-map-implementation-plan.md`（L4=cold-start partial-pooling）/ `docs/second-self-map-wave1-l1b-mini-design.md`。

---

## 0. 目的（一言）
L1-b の **hard fallback**（「legKey が弱ければ odKey に丸ごと切替」）を、**混ぜる・縮約する・cold-start でも賢く出す** partial-pooling へ進化させる。leg 固有データと OD 一般化を**滑らかに blend**し、観測の少ない leg でも自然な「今日のあなたなら」を出す。**pure layer・既存 v0/L1 を壊さない**。

## 1. L1-b の限界（L4 が直す点）
- L1-b は**離散スイッチ**: legKey が moderate+ なら legKey、cold なら odKey に**丸ごと**切替。
  - 弱い legKey（例 2 観測）は自分のデータを**捨てて** odKey へジャンプ → 情報損失・不連続。
  - legKey が閾値を跨いだ瞬間に belief が**飛ぶ**（2→3 観測で挙動が変わる）。
- L4 は**連続 blend**: leg のデータ量に応じて「OD prior 寄り → leg 固有寄り」へ**滑らかに移行**（shrinkage）。

## 2. 数理（Dirichlet-multinomial / empirical-Bayes shrinkage）
leg の precision 加重 mode 数を `c_leg[m]`（合計 `n_leg`）、OD レベルの分布（prior）を `p_OD[m]` とする。
```
pooled[m] = c_leg[m] + κ · p_OD[m]          （κ = prior の等価観測数 = pseudo-count）
share[m]  = pooled[m] / (n_leg + κ)
topMode   = argmax_m pooled[m] ,  topShare = max_m share[m]
```
- `n_leg → ∞`: `share → c_leg/n_leg`（**leg 支配＝v0**）。
- `n_leg → 0`: `share → p_OD`（**cold-start は OD prior**）。
- κ=3 なら leg が OD prior を上回るのに概ね 3+ 観測。κ は prior の強さ（tunable・**v0-F tuning 同様データが溜まってから較正**）。

## 3. 階層（nested priors・leg ← 具体 → 一般）
各レベルの分布が**親レベルへ shrink**する再帰構造：
```
leg            ← odKey × timeband × weekday        （最特定 prior）
odKey×tb×wd    ← odKey × weekday
odKey×wd       ← odKey
odKey          ← global marginal
global marginal ← （root・uniform へ弱く or 無 prior）
```
各レベル: `p_level[m] = (c_level[m] + κ_level · p_parent[m]) / (n_level + κ_level)`。
- **global marginal** = 全観測の mode 分布（「このユーザーは概ね電車」）＝真の cold-start prior（leg も OD も新規な時の最終 seed）。κ_global は**小さく**（弱い一般 prior・新規 leg+OD を過剰 surface させない）。

## 4. 退行ゼロ・legKey 優先の保存（L4 は L1/v0 を limit として含む）
- **empty obs** → OD prior 空 → `κ·p_OD=0` → `pooled=c_leg` → **v0 完全同一（退行ゼロ）**。
- **強い legKey**（大 n_leg）→ `κ·p_OD` が相対的に無視可能 → leg 支配 ≈ v0（**近似的に override しない**）。
- L1-b との差分 = **弱い legKey**: L1-b は捨てて OD へジャンプ／L4 は **leg の弱データ + OD prior を blend**（情報を活かし滑らか）。これが CEO 指定の「混ぜる・縮約・cold-start でも賢く」。

## 5. gate / copy 相互作用
- pooled の `topShare` が gate（moderate+ で surface）を駆動。confident OD prior を持つ cold leg → pooled が OD 形 → surface（OD mode）。contested OD → 沈黙。強 legKey → v0 同等。
- ★`total = n_leg + κ` のため cold leg でも κ 分の confidence を OD から継承（cold-start でも賢く出す核）。global marginal の κ を小さくして**過剰 surface を抑制**。
- ★copy nuance（要検討）: OD/prior 由来 surface に「いつもは」は厳密には過剰（その leg は未経験）。「この区間では / 似た場所では」変種を検討（L1-b でも既出の論点・現状は同一 copy）。

## 6. pure 境界 / 既存非破壊
- **pure**: global marginal 集計 / 各レベル分布の再帰 shrinkage / `buildPooledBelief(obs, selected, feedback, query, κ-config) → ModeBelief`。precision 加重は `precisionWeight`（export 済）再利用。
- **additive**: `buildRepertoireBelief`（L1-b）は**温存**。L4 は新 `buildPooledBelief` + `loadPooledBelief`。MapTab は `loadRepertoireBelief` → `loadPooledBelief` の **1 行 swap**（production 反映 = CEO 承認）。
- **READ のみ**: selectedModeStore / hypothesisFeedbackStore / mobilityObservationStore 不変。新 store なし。
- 禁則: Google API / DB / network / 素朴 time-decay / 距離→mode / placeId 同等扱い / push なし。

## 7. 段階（pure-first / no-regression）
| phase | 内容 | 純度 |
|---|---|---|
| **L4-a** | 2-level pooling（legKey ← odKey・単一 κ）。L1-b の離散 switch を blend に。退行ゼロ test（empty→v0）+ smoothness test（弱 legKey が blend）。 | pure |
| **L4-b** | multi-level（odKey×tb×wd ← … ← global marginal）。global marginal 集計 + 再帰 shrinkage。 | pure |
| **L4-c** | κ 較正（per-level pseudo-count・empirical-Bayes 推定）。**実データ蓄積後**（勘で決めない）。 | pure |
| 配線 | MapTab swap（loadRepertoireBelief → loadPooledBelief）= production 反映 | wiring（GO） |

## 8. リスク / 独立論点
| 論点 | 方針 |
|---|---|
| κ の値（prior 強さ） | L4-a は固定 κ（例 3）。較正は L4-c・データ後（v0-F tuning 同様「勘でなくデータ」） |
| cold leg+OD の過剰 surface | global marginal の κ を小さく・gate の moderate+ 閾値据え置き |
| 強 legKey の微小 OD 混入で v0 と厳密非同一 | κ·p_OD は大 n_leg で無視可・必要なら「n_leg≥N で純 legKey」guard を追加可 |
| copy「いつもは」の過剰（prior 由来） | 変種 copy を検討（L1-b 既出・別 slice） |
| 多レベルの計算量 | レベル数固定（5）・全 pure・obs scan は L1-b と同 order |
| L1-b を壊す懸念 | buildRepertoireBelief 温存・L4 は additive・MapTab 1 行 swap のみ |

## 9. CEO 判断点（L4 実装 GO 前）
1. **2-level（L4-a）から始める**で良いか（legKey ← odKey・固定 κ）。multi-level + global は L4-b へ。
2. κ 初期値（例 **3**）で良いか。較正は L4-c・データ後で良いか。
3. 強 legKey の「厳密 v0 同一」を保証する **n_leg≥N 純 legKey guard** を入れるか（pooling の純度 vs 退行厳密性）。
4. copy nuance（prior 由来 surface の「いつもは」）は L4 で扱うか別 slice か。
5. buildRepertoireBelief（L1-b）は温存（additive）で良いか、buildPooledBelief に置換するか。

## 10. 参照
- L1-b（前提）: `docs/second-self-map-wave1-l1b-mini-design.md` / code `lib/plan/mobility/mobilityRepertoireBelief.ts`
- L1 closeout: `docs/second-self-map-wave1-l1-closeout.md`
- precision 加重: `docs/second-self-map-v0f-mini-design.md`
