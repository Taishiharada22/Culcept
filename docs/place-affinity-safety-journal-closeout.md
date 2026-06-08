# Place Affinity 検証基盤（dogfood safety journal）closeout

> 2026-06-09 / Build Unit / A1-13 dogfood safety journal 型。データが出る前に検証枠を用意。dev-only・派生サマリーのみ・flag OFF。

---

## 実装した
- `placeAffinitySafetyJournal.ts`（local-only・derived のみ）:
  - `summarizePlaceAffinityShadow(shadow, p2)` → 派生サマリー `PlaceAffinitySafetyEntry`（counts + boolean のみ）。★安全不変条件 `excessiveShift`（maxRankShift>許容2＝clamp が効いていれば起きない）。
  - `recordPlaceAffinitySafetyEntry` / `loadPlaceAffinitySafetyJournal`（localStorage・fail-open・上限 200・raw 排除 parse）。
  - `assessPlaceAffinitySafety(journal)` → `insufficient`(<10) / `unstable`(懸念あり) / `stable_safe`(≥10 ∧ 懸念ゼロ)。
  - `PLACE_AFFINITY_ROLLBACK_CONDITIONS`（excessiveShift→ranking OFF 等）。
- `PlaceCandidatesPanel`: P6-0 shadow useEffect で（dogfood＝reason flag ON ∧ dev のみ）派生サマリーを journal に記録。

## ★安全境界
- **派生サマリーのみ保存**: place 名/placeKey/座標/raw score/visitCount/strength を保存しない（counts と boolean のみ）。test で raw 非含有を機械保証。
- local-only / fail-open / DB・network なし / 件数上限 / 記録は dogfood のみ（reason flag ON ∧ dev・production は記録しない）。
- belief 非汚染・新規 external なし。

## 目的（蓄積後の検証）
dogfood で観測が貯まるにつれ、ranking の **bounded 性**（clamp で maxRankShift が小さい＝over-personalization が起きていない）を実データで検証する。`assessPlaceAffinitySafety` が `stable_safe` になって初めて ranking flag の広い有効化を検討できる（A1 の「shadow→stable→activation」型）。

## テスト / tsc / lint
- safety journal **8 tests**（summarize 派生/excessiveShift・raw 非含有・assess insufficient/stable_safe/unstable・rollback）。compose dir PASS。tsc footprint 0。eslint clean。

## ★Place Affinity 完了（自律範囲）
P2/P3/P4 engine + P5/5.1/5.2 reason-only + P5.3 shadow 検証 + P6-0 shadow 観測 + P6-1 ranking + 検証基盤(safety journal)。**全 flag OFF/dogfood。残=実データ蓄積→assess stable_safe→enable 判断（CEO）。安全に自律で進める Place Affinity code は完全に出尽くした。**
