# Second Self Map — Wave 1 / L1 closeout（移動レパートリー学習）

> 2026-06-05 / code branch `claude/second-self-map-wave1-l1`（着地前 HEAD `a5aef2a2`）
> L1-a（観測前方記録）+ L1-b（OD 条件付き belief・配線）実装完了。本書は L1 targeted smoke の結果と closeout 記録。

## 1. L1 targeted smoke（CEO 指定 4 観点・integration で決定的検証）
実モジュール経由（`saveSelectedMode` / `saveMobilityObservation` / `buildObservation` / `loadRepertoireBelief` / `resolveMobilityGuidance`）+ mock localStorage round-trip。`tests/unit/plan/mobility/l1RepertoireSmoke.test.ts`。

| 観点 | 期待 | 結果 | 根拠 |
|---|---|---|---|
| **A** empty observation → v0 同一 | 余計な OD 一般化が発火しない | ✅ PASS | `loadRepertoireBelief == loadWeightedModeBelief`・surface train（v0 legKey belief そのまま） |
| **B** legKey cold → odKey fallback | 同 odKey の別 leg 履歴で surface | ✅ PASS | 対象 legKey 履歴ゼロ + inst1..5 walk(同 odKey) → walk surface |
| **C** legKey 強 → odKey 上書きしない | legKey train 優先 | ✅ PASS | legKey 5 train + odKey 10 walk → train surface（override なし） |
| **D** sensitive/redacted は OD 不使用 | surface しない | ✅ PASS | redacted observation は OD 集約から除外 → 沈黙 |

→ **A〜D 全 PASS**。mobility unit 計 **121 test PASS**・tsc footprint 0。

## 2. 自立検証サマリ
- L1-a: 4 次元 adversarial 検証 PASS（禁止 12 / privacy / correctness / test coverage）。
- L1-b: 退行ゼロ test（empty obs → v0 完全同一）+ override しない + 階層 fallback + precision + mode 正本 + redacted/unknown 除外（12 unit）。
- L1 smoke: A/B/C/D（4 integration）。
- 配線監査: MapTab `loadWeightedModeBelief` → `loadRepertoireBelief`・query は observationContext 同源・MobilityLegCard 描画不変。

## 3. 手動確認（任意・実機 localhost:3012・auth は CEO セッション）
L1 は **退行ゼロ＝即時は v0 と同一**（OD 一般化は観測蓄積後）。最小の手動確認：
1. `/plan` Map で leg を開き mode を選ぶ → console で観測が録れているか：
```js
console.log(JSON.parse(localStorage['aneurasync.plan.map.mobilityObservation.v1'] || 'null'));
// → byDay[today][legKey] = {mode, timeband, weekday, originKey, destKey, privacyClass}
```
2. 既存 leg の「いつもは X」が従来通り出る（v0 挙動不変）こと。
> OD 一般化(B)の手動再現は real odKey の一致が必要で煩雑なため、integration test を decisive とする。

## 4. closeout 判断
- **L1 smoke PASS**（自立: A〜D integration + 121 unit + tsc 0 + 退行ゼロ）→ **closeout 可・main 着地へ**。
- L1-c（recency）→ L3（素朴 decay 禁止）。L4（cold-start partial-pooling）→ 次タスク（設計提出）。
- push / PR / GitHub / deploy 未実施（禁止遵守）。

## 5. 参照
- L1 設計: `docs/second-self-map-wave1-l1-mini-design.md` / L1-b: `docs/second-self-map-wave1-l1b-mini-design.md`
- code: `lib/plan/mobility/mobilityObservationStore.ts`（L1-a）/ `mobilityRepertoireBelief.ts`（L1-b）
