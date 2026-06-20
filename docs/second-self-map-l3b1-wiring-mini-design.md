# Second Self Map — L3-b-1 配線 mini design（OD regime を live に）

> 2026-06-05 / **設計のみ・配線/production/main 着地は判断待ち（別 GO）** / 前提: L3-b-1 pure 実装済（branch `claude/second-self-map-l3b1`・`b1ba476d`・mobility 203 test・tsc 0・未配線）。
> 上位: `docs/second-self-map-l3b-mini-design.md`。L3-a 配線（`loadL3PooledBeliefMultiLevel`）が現 live。

---

## 0. 目的
L3-b-1（OD 単位 regime-change）を MapTab の belief source に接続し、**場所のパターン変化が OD 全 leg に波及**する状態を live にする。L3-a 配線と同型の 1 行 swap。

## 1. 変更（最小・1 行 + import）
- `app/(culcept)/plan/tabs/MapTab.tsx`:
  - import: `loadL3PooledBeliefMultiLevel` → `loadL3bPooledBeliefMultiLevel`
  - belief source: `loadL3PooledBeliefMultiLevel(repertoireQuery)` → `loadL3bPooledBeliefMultiLevel(repertoireQuery)`
- **それ以外は触らない**（MobilityLegCard / copy / store / repertoireQuery 構築は不変）。

## 2. 即時挙動（production への影響）
- **correction 未蓄積 → L3-a/L4-b と完全同一**（退行ゼロ）。L3-b-1 は OD に **2 件以上**の同方向 correction が貯まって初めて効く。
- 同一 OD の別 leg に correction が分散しても OD として 2 件 → その OD の全 leg の古い確信を ×λ_od(0.7) で緩和。
- leg 固有 regime があればその leg は leg 優先（λ_leg=0.5）。二重緩和なし。

## 3. wire smoke（配線 GO 後の必須項目・案）
loadL3b を save→load round-trip で検証（L3-a wire smoke と同型 + OD 固有）:
1. regime なし → `loadL3bPooledBeliefMultiLevel` == `loadL3PooledBeliefMultiLevel` == `loadPooledBeliefMultiLevel`（退行ゼロ）
2. 同一 OD・別 leg に walk correction 2 回 → **その OD の別 leg（observation のみ）の belief も walk 寄りに**（OD 波及）
3. leg 固有 regime がある leg は leg 優先（OD と二重緩和しない）
4. 別 OD には漏れない
5. 古い観測は削除されず weight だけ低下
6. selectedModeStore / hypothesisFeedbackStore / mobilityObservationStore は READ のみ
7. fetch / Google API / DB を呼ばない
8. MobilityLegCard 描画・copy 不変

## 4. 着地（判断待ち）
- pure green（済）→ **配線 GO 待ち** → MapTab swap + wire smoke → green なら squash で main 着地 → L3-b-1 closeout。
- ★L3-a 配線と同様、pure と配線を分離。配線・production 反映・main 着地は CEO 判断後。

## 5. リスク / 非機能
| 論点 | 方針 |
|---|---|
| OD 過剰波及 | λ_od=0.7（leg 0.5 より緩い）+ 同方向連続 2 + stale/redacted 除外 + dedup-by-day で保守的 |
| L3-a live との整合 | combined factor は leg 優先で L3-a を包含（leg regime のみの leg は L3-a と同一挙動） |
| 退行 | regime なし → 恒等 → 現 live（L3-a）と完全同一 |
| 既存 UI | MapTab belief source 1 行のみ・MobilityLegCard/copy/store 不変 |

## 6. 参照
- L3-b 全体: `docs/second-self-map-l3b-mini-design.md`
- code: `lib/plan/mobility/mobilitySelectiveForgetting.ts`（computeOdRegimeChange / computeCombinedRegimeFactorFn）/ `mobilityRepertoireBelief.ts`（buildL3b / loadL3bPooledBeliefMultiLevel）
- L3-a 配線前例: `docs/second-self-map-l3a-closeout.md` §4
