# Second Self Map — L4-b closeout + L4-c 較正方針 + MapTab 配線判断

> 2026-06-05 / code branch `claude/second-self-map-wave1-l1`（L4-b HEAD `8ce05b27`・未配線・main 未着地）
> L4-b（multi-level shrinkage + global marginal）実装完了。本書は closeout・L4-c 方針・配線判断の整理。
> **L4-c 実装 / MapTab 配線 / production 反映は CEO 判断待ち。**

---

## 1. L4-b closeout（実装・検証）
- chain: `leg ← odKey×timeband×weekday ← odKey×weekday ← odKey ← global marginal`（relax timeband 先・単一）。
- **★effSize 伝播 + `min(κ, parent.effSize)` cap**: global を弱い seed 化（effSize≤κ_global=1）→ **global-only は過剰 surface しない**。
- per-level κ `{leg:3, context:3, global:1}`（const・較正は L4-c）。**root 空（uniform seed なし）→ 厳密退行ゼロ**。
- 強 legKey guard（strength==="strong"）/ redacted・unknown 除外 / feedback JOIN precision / selectedStore 正本（L4-a と一貫）。
- **additive**: `buildPooledBeliefMultiLevel` / `loadPooledBeliefMultiLevel` 追加。L4-a `buildPooledBelief`・L1-b `buildRepertoireBelief`・v0 温存。
- **検証**: mobility **155 test PASS**（L4-b 20 必須ケース＝19 unit + 1 audit）・tsc footprint 0・MapTab/store 不変（未配線）。
  - 主要 PASS: empty→v0 / root uniform なし / strong 厳密 / cold+OD→prior / global 弱(total=κ_global) / global-only 非過剰 / ctx 最優先 / ctx 薄→fallback / contested→topShare低 / correction・confirmation・stale・redacted・unknown / L4-a・L1-b 温存 / 正本 / fetch 不呼出。
- **closeout: L4-b は green・pure・未配線**。

## 2. L4-c 較正方針（κ calibration・設計のみ・実装は判断待ち）
**目的**: 固定 κ `{3,3,1}` を、surface 精度（surfaced mode が実選択と一致）を最大化する data-driven 値へ。over/under-pooling を避ける。

**手法（候補）**:
1. **held-out 予測検証（leave-one-out）**: 各観測を他観測由来の pooled belief で予測 → topMode 一致率を測り、κ を一致率最大化で選ぶ（最も実務的・実データ依存）。
2. **周辺尤度（empirical Bayes）**: 階層 Dirichlet-multinomial の marginal likelihood を最大化する κ（原理的・実装重い）。
3. **使用シグナル heuristic**: ①pooled surface 後の correction 率（高→aggressive→κ↓）②cold leg surface の確認/訂正比 ③global-only surface 率（≈0 であるべき・>0 なら κ_global↓）。

**起動条件**: 十分なデータ（例: ≥N leg × ≥M 観測 + ≥K correction で精度測定可）が溜まってから。それまで固定 κ。**「勘でなくデータ」**（v0-F tuning と同じ原則）。

**安全制約**: κ は bounded（例 [1,10]）+ 単調（**κ_global ≤ κ_context ≤ κ_leg**・global を最弱に保つ）。per-level（κ_leg / κ_context / κ_global）を個別 or 同時較正。

**scope**: L4-c = 較正ロジック（pure・観測から最適 κ 算出）+ 適用（κ を data-dependent に）。**実装は CEO GO 後**。

## 3. MapTab 配線判断（整理・production 反映は CEO 判断待ち）
**現状**: MapTab → `loadRepertoireBelief`（L1-b hard fallback・既に live・main 着地済）。L4-a `loadPooledBelief`・L4-b `loadPooledBeliefMultiLevel` は**定義済・未配線**。

**配線先の選択肢**:
| 選択 | 挙動 | 備考 |
|---|---|---|
| L1-b 維持（現状） | hard fallback（legKey 弱→OD） | 変更なし・保守的 |
| L4-a（2-level） | 連続 blend（legKey←odKey・固定κ） | 滑らか・global なし |
| **L4-b（multi-level）** | context×OD×global 多レベル shrinkage | 最も賢い・global で cold-start 補助・effSize で過剰抑制 |

**timing の選択肢**:
- **A: 今配線**（L4-b へ swap）。退行ゼロ＝即時変化なし・データ蓄積で自動的に pooling が効く。固定 κ は未較正（L4-c 前）だが effSize-weakening + correction 捕捉で自己補正寄り。
- **B: データ蓄積 + offline 検証後に配線**（L4-c κ 較正後 or 実データで pooling 挙動を確認後）。最も慎重・L4 benefit は遅延。

**論点**:
- 3 関数すべて empty obs → v0（退行ゼロ）。**現状データゼロ**（L1-a 着地直後）→ 今配線しても暫くは v0 同一・即時差なし。
- L4-b の固定 κ 挙動は**実データ未検証**。今配線＝未検証 pooling が蓄積に伴い production に出る。
- L4-b は effSize-weakening で global 過剰 surface を構造的に抑制 → 3 つの中で**最も安全に配線可能**。

**推奨（Claude lean）**: **Path B 寄り**。L1-b は既に live で十分。データを L1-a/L1-b で溜め、pooling 挙動を実データで一度検証（+ 可能なら L4-c κ）してから L4-b へ swap。理由＝production に未検証 pooling を出すより、データで裏取りしてからが「整合性と世界観優先」に合う。ただし Path A（今配線）も退行ゼロ + effSize-safe で低リスクなので、CEO がスピードを取るなら可。
**いずれも production 反映 = CEO 承認案件**。

## 4. 次アクション（判断待ち）
- L4-c 実装（κ 較正）= 判断待ち（データ蓄積後）。
- MapTab 配線（L4-b swap）= 判断待ち（Path A/B）。
- main 着地（L4-a/L4-b を main へ squash）= 判断待ち。
- push / PR / GitHub / deploy = 禁止遵守（未実施）。

## 5. 参照
- L4 全体: `docs/second-self-map-l4-mini-design.md` / L4-b: `docs/second-self-map-l4b-mini-design.md`
- code: `lib/plan/mobility/mobilityRepertoireBelief.ts`（buildPooledBeliefMultiLevel / buildPooledBelief / buildRepertoireBelief）
