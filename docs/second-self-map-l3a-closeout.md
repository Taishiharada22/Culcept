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

## 4. 着地（pure と配線を分離 → 両方着地・L3-a 完全 live）
- L3-a pure を main `77104e1a` に squash（pure 層を先に固定）。
- **L3-a 配線 着地（2026-06-05・GPT 監査 GO）**: MapTab belief を `loadL3PooledBeliefMultiLevel` に swap（1 行）+ wire smoke を main `7c394a40` に squash。**selective forgetting が live**。
  - 検証: wire smoke **12 項目 PASS**（regime なし→L4-b 同一 / 1 回不発火 / 同方向 2 回発火 / 古い weight↓・削除でない / selected のみ不発火 / confirmation 不発火 / stale 不使用 / READ のみ / fetch なし）・mobility **182 test**・tsc footprint 0・zero-loss・MobilityLegCard/copy/store 不変・push なし。
  - production: belief source が L3-aware に。**correction 未蓄積 → 即時は L4-b 同一**（退行ゼロ）・同方向 explicitCorrection 2 回で selective forgetting が効き始める。

## 5. 残（CEO 判断待ち）
- **L3-b**（OD 単位 regime-change + 持続シフト検出・mini design 済 `docs/second-self-map-l3b-mini-design.md`）= 次フェーズ（判断点 4）。
- **L4-c**（κ較正）= 実データ後。
- push / PR / Vercel / deploy = 禁止（未実施）。

## 6. 参照
- L3 設計: `docs/second-self-map-l3-mini-design.md` / L3-b: `docs/second-self-map-l3b-mini-design.md`
- code: `lib/plan/mobility/mobilitySelectiveForgetting.ts` / `mobilityRepertoireBelief.ts`（buildL3PooledBeliefMultiLevel）
