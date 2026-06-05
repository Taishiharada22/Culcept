# Second Self Map — L4-b mini design（multi-level 階層 + global marginal）

> 2026-06-05 / **設計のみ・実装 GO 待ち** / 前提: L4-a（2-level pooling・legKey←odKey marginal）実装済（branch claude/second-self-map-wave1-l1・commit `0b4f404e`・136 mobility test）。
> 上位: `docs/second-self-map-l4-mini-design.md`（L4 全体）。

---

## 0. 目的
L4-a の **2-level（legKey ← odKey marginal）** を、**context-conditioned 多レベル**（odKey×timeband×weekday → … → odKey）+ **global marginal**（真の cold-start seed）へ拡張。leg の prior を「この場所・この時間帯・この曜日では」まで精緻化し、leg も OD も新規な時はユーザーの全体傾向に弱く寄せる。**pure・additive・退行ゼロ保存**は L4-a と同じ。

## 1. L4-a の限界（L4-b が直す点）
- L4-a の prior = **odKey marginal（全 context 平均）**。timeband/weekday を区別しない（朝の徒歩傾向も夜のタクシー傾向も混ざる）。
- L4-a は **新 OD（観測ゼロ）に prior がない** → v0/沈黙。ユーザーの全体傾向（global）を使えない。

## 2. 多レベル recursion（nested priors・再帰 shrinkage）
各レベルの分布は**親レベルへ shrink**する：
```
shrink(counts, parentShares, κ):
  blended[m] = counts[m] + κ · parentShares[m]
  shares[m]  = blended[m] / (Σ counts + κ)        （Σ counts = n_level）
```
chain（最特定 → 一般・単一親）：
```
p_global    = globalShares                                  （root・全観測 mode 分布）
p_odKey     = shrink(odKey 全 context, p_global, κ_g)
p_odKey_wd  = shrink(odKey×weekday,    p_odKey,  κ_p)
p_ctx       = shrink(odKey×tb×weekday, p_odKey_wd, κ_p)     （最特定 context prior）
pooled_leg[m] = c_leg[m] + κ_leg · p_ctx[m]   /  total = n_leg + κ_leg
```
- leg は **counts** を返す（ModeBelief・total=n_leg+κ_leg）。中間レベルは **shares** を返す。
- ★relax-order（最特定からどの条件を先に緩めるか）は decision（本案は timeband を先に緩める: tb×wd → wd → odKey）。

## 3. global marginal（真の cold-start seed）
- `p_global[m] = Σ_全観測 precision 加重 counts[m] / 総和`（全 leg 横断・ユーザーの全体 mode 傾向）。
- 「この人は概ね電車」を新規 leg+OD に弱く与える。**κ_g は小**（過剰 surface 抑制）。
- 計算: 全 observation を 1 scan（mode=selectedStore 正本・redacted/unknown 除外・feedback JOIN）。pure・O(全観測)。

## 4. ★退行ゼロの厳密保存（最重要・root 設計）
- **root prior = 空（uniform seed しない）**: global 観測ゼロ → p_global 空 → 全レベル空 → leg prior 空 → `pooled=c_leg` → **v0 完全同一**。
- uniform-root（全 mode 均等を弱く与える）案は、empty obs でも微小 smear が乗り **v0 と厳密非同一**になるため**不採用**（変種として記録）。
- 強 legKey guard（strength==="strong"）は L4-a と同じく維持（厳密 legKey）。

## 5. pure 境界 / 既存非破壊（L4-a と同じ）
- **pure**: globalShares 集計 / 各レベル shrink / `buildPooledBeliefMultiLevel(obs, selected, feedback, query, κ-config)`。
- **additive**: L4-a の `buildPooledBelief`（2-level）も温存 or 内部で multi-level に統合（decision）。`buildRepertoireBelief`(L1-b) は温存。
- **未配線**: MapTab swap（production 反映）は L4-b でもしない（別途 CEO 承認）。
- **READ のみ**・新 store なし・Google/DB/push なし・素朴 decay なし・copy 触らない。

## 6. 段階
| phase | 内容 | 純度 |
|---|---|---|
| **L4-b-1** | global marginal 追加（3-level: leg ← odKey ← global）。新 OD でも global prior。 | pure |
| **L4-b-2** | context 多レベル（odKey×tb×wd → odKey×wd → odKey）。relax-order 固定。 | pure |
| **L4-c** | per-level κ 較正（empirical-Bayes・実データ後）。 | pure |
| 配線 | MapTab swap（loadPooledBelief 系）= production 反映 | wiring（別 GO） |

## 7. リスク / 独立論点
| 論点 | 方針 |
|---|---|
| relax-order（tb 先 vs wd 先 vs branch 合成） | 単一 chain（tb 先）で開始。branch 合成は過剰複雑（避ける） |
| per-level κ の数 | L4-b は単一 κ or 少数（κ_leg, κ_g）固定。較正は L4-c |
| global の過剰 surface | κ_g 小・gate moderate+ 閾値据え置き・root 空 |
| 退行ゼロ厳密性 | root 空（uniform seed しない）・強 guard 維持 |
| 計算量（全観測 scan for global） | O(全観測)・60日×100leg 上限内・pure |
| L4-a との関係 | buildPooledBelief(2-level) 温存 or multi-level に内部統合（decision 5） |

## 8. CEO 判断点（L4-b 実装 GO 前）
1. relax-order = **timeband 先**（odKey×tb×wd → odKey×wd → odKey → global）で良いか。
2. global marginal を **L4-b-1 で先に**（3-level）→ context 多レベルは L4-b-2、の順で良いか。
3. root = **空（uniform seed しない・厳密退行ゼロ）** で良いか。
4. κ は当面 **単一 κ=3**（全レベル）で良いか、per-level（κ_leg 大・κ_g 小）にするか（較正は L4-c）。
5. L4-a の 2-level `buildPooledBelief` は **温存（additive）** か、multi-level に**内部統合**するか。

## 9. 参照
- L4 全体: `docs/second-self-map-l4-mini-design.md`
- L4-a code: `lib/plan/mobility/mobilityRepertoireBelief.ts`（buildPooledBelief）
- L1-b（OD aggregation 再利用元）: 同 file（buildOdBelief）
