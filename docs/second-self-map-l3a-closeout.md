# Second Self Map — L3-a closeout（selective forgetting pure bundle・main 着地）

> 2026-06-05 / **L3-a pure 着地**: main `77104e1a`（未配線）。MapTab 配線は別 GO（まだ禁止）。push/Vercel 未実施。
> 上位: `docs/second-self-map-l3-mini-design.md` / `docs/second-self-map-l3b-mini-design.md`。

---

## 1. 実装（pure bundle・1 commit で閉じた）
| 要素 | 内容 |
|---|---|
| `mobilitySelectiveForgetting.ts`（新） | `detectRegimeChange`（leg の explicitCorrection 末尾連続 N で regime-change to Y・change-point=開始日）+ `computeRegimeFactorFn`（古い観測 ×λ・no regime→恒等）+ config（N=2/λ=0.5） |
| builder parameterize | `buildWeightedModeBelief`(beliefReadAdapter) + `buildOdBelief`/`buildGlobalCounts`/`buildPooledBeliefMultiLevel`(mobilityRepertoireBelief) に optional `regimeFactorFn?`（default identity） |
| L3-aware belief | `buildL3PooledBeliefMultiLevel` / `loadL3PooledBeliefMultiLevel`（regimeFactorFn を L4-b に注入・未配線） |

## 2. 核原則の達成（CEO 指定）
- ❌ 素朴 time-decay なし → ✅ **regime-change（矛盾の連続）駆動**（時間単独で発火しない）。
- ✅ 忘れる（削除）でなく **precision を ×λ**（古い確信を少し弱める・λ=0.5・0 でない）。
- ✅ 3 store（selectedModeStore/hypothesisFeedbackStore/mobilityObservationStore）**READ のみ**・新 store なし・Date.now 不使用。
- ✅ **L4 と composable**: L3 が重みを作り L4-b が pool（順序固定 L3→L4・二重緩和なし）。
- ✅ **退行ゼロ**: regime-change なし → regimeFactorFn 恒等 → L4-b と完全同一。

## 3. 検証（main 文脈）
- mobility **174 test PASS**（L3 13 ケース: detector 6 + factorFn 2 + integration 5）・tsc footprint 0・zero-loss。
- 主要 PASS: ①no regime → buildL3 == buildPooled（退行ゼロ）②regime-change（旧 train + 新 walk correction）→ 旧 train を ×λ → topMode が walk に逆転 ③**古い観測は削除されず**（count に残り weight だけ低下）④λ=1 → L4-b 同一 ⑤detector の N 連続/末尾一貫/changePoint。
- **MapTab/store/MobilityLegCard/copy 不変**（未配線・production 挙動変更ゼロ）。

## 4. 着地（pure と配線の分離）
- L3-a pure を main `77104e1a` に squash（merge --squash クリーン・既存非破壊・temp 混入 0）。
- **配線（MapTab を loadL3PooledBeliefMultiLevel に swap）= 別 GO**（CEO: MapTab 配線まだ禁止）。pure の正しさと配線を分離。

## 5. 残（CEO 判断待ち）
- **L3-a 配線**（MapTab swap → smoke 6項目 → 着地 → L3 closeout）= 別 GO。smoke: regime なし→L4-b 同一 / correction 2 回で旧 precision 緩む / 古い観測 削除されず weight 低下 / 新 mode surface しやすく / store READ のみ / UI 不変。
- **L3-b**（OD 単位 + 持続シフト・mini design 済）/ **L4-c**（κ較正）= まだ実装しない。
- push / PR / Vercel / deploy = 禁止（未実施）。

## 6. 参照
- L3 設計: `docs/second-self-map-l3-mini-design.md` / L3-b: `docs/second-self-map-l3b-mini-design.md`
- code: `lib/plan/mobility/mobilitySelectiveForgetting.ts` / `mobilityRepertoireBelief.ts`（buildL3PooledBeliefMultiLevel）
