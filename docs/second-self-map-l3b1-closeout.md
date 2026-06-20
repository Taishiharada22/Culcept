# Second Self Map — L3-b-1 closeout（OD 単位 regime-change・pure + 配線・main 着地 live）

> 2026-06-06 / **L3-b-1 完全 live**: main `0cc5217b`（pure `b1ba476d` + 配線 `54304b68` を squash 着地）。push/Vercel 未実施。
> 上位: `docs/second-self-map-l3b-mini-design.md` / 配線: `docs/second-self-map-l3b1-wiring-mini-design.md`。

---

## 1. 何を解いたか
L3-a（legKey 単位）の限界 = **同じ OD の別 leg（別 anchor 実体）に regime-change が波及しない**。L3-b-1 はこれを解く：場所のパターン変化（explicitCorrection）を **odKey 単位で集約**し、その OD の全 leg に selective forgetting を波及。

## 2. 実装（additive・L3-a 非破壊）
| 要素 | 内容 |
|---|---|
| `computeOdRegimeChange` | OD の explicitCorrection を **dedup-by-day**（同日複数 leg→一致なら 1 signal・矛盾日除外）+ **redacted/sensitive 除外** + **stale 除外**（selected 最終≠chosenMode）+ 同方向連続 N → OD regime。change-point=連続開始日 |
| `computeCombinedRegimeFactorFn` | L3-a(leg) + L3-b-1(OD) を 1 factor に統合。**leg 優先 + OD fallback**（leg regime あれば λ_leg、無ければ OD regime なら λ_od、どちらも無ければ 1）。**regimeFactor 1 つ・二重緩和なし** |
| `buildL3b`/`loadL3bPooledBeliefMultiLevel` | combined factor を L4-b の builder に注入 |
| 配線 | MapTab `loadL3PooledBeliefMultiLevel` → `loadL3bPooledBeliefMultiLevel`（1 行） |

config（GPT 確定）: streakN=2 / λ_leg=0.5 / **λ_od=0.7**（OD は複数 leg 波及で leg より緩い relaxation＝保守的）。

## 3. 核原則の達成
- ✅ **退行ゼロ**: leg/OD どちらの regime も無ければ恒等 → L3-a/L4-b と完全同一。OD correction 未蓄積 → 即時 production 不変。
- ✅ **削除でない**: 古い観測は ×λ のみ・count に残る。
- ✅ **二重緩和なし**: leg regime のある leg は leg のみ（OD で追加緩和しない）。
- ✅ **privacy**: redacted/sensitive observation は OD 集約に使わない。
- ✅ **強信号のみ**: explicitCorrection（仮説への明示反抗）だけを OD へ。selected-only 持続シフト（L3-b-2）は誤検出リスク高で後回し。
- ✅ **素朴 decay でない**: 時間単独で発火しない（OD の矛盾の連続が trigger）。3 store READ のみ・Date 不使用。

## 4. 検証（main 文脈・`0cc5217b`）
- mobility **213 test PASS**（pure 21 + wire smoke 11 = 32 が L3-b-1）・tsc footprint 0・zero-loss。
- **wire smoke 核（波及）**: 同一 OD の別 leg(観測のみ) の belief が OD regime で変化（`loadL3b(LEG2) ≠ loadL3(LEG2)`・古い train が ×λ_od で低下）。L3-a は波及しない。
- pure 21: 1回不発火/2回発火/異方向/confirmation・selected・stale・redacted 除外/changePoint/leg 優先/OD fallback/別 OD 非漏洩/削除でない/time decay なし/Date 不使用/READ のみ/fetch なし。
- **MapTab/MobilityLegCard/copy/store 不変**（belief source 1 行のみ・READ のみ）。

## 5. 着地
- pure squash（main `b1ba476d`→着地時 `0cc5217b`）+ 配線を 1 squash で main 固定。merge --squash クリーン・既存非破壊・temp 0・push/PR/Vercel なし。

## 6. 残（CEO 判断待ち）
- **L3-b-2**（持続シフト検出・selected の K 連続矛盾）= L3-b-1 closeout 後に改めて判断（GPT: 誤検出リスク高で慎重に）。K=3-4 / λ=0.7。
- **L4-c**（κ較正）/ **L3-c**（streakN/λ 較正）= 実データ後。
- push / PR / Vercel / deploy = 禁止（未実施）。

## 7. 参照
- code: `lib/plan/mobility/mobilitySelectiveForgetting.ts`（computeOdRegimeChange / computeCombinedRegimeFactorFn）/ `mobilityRepertoireBelief.ts`（buildL3b / loadL3bPooledBeliefMultiLevel）
- test: `tests/unit/plan/mobility/mobilityOdRegimeChange.test.ts`（pure 21）/ `l3b1WireSmoke.test.ts`（wire 11）
- L3-b 設計: `docs/second-self-map-l3b-mini-design.md` / L3-a 前例: `docs/second-self-map-l3a-closeout.md`
