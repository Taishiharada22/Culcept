# Place Affinity P6-0 shadow ranking 観測（dev console・順序不変）closeout

> 2026-06-09 / Build Unit / A1-8 pattern。★順序を変えない・metrics のみ console.debug・flag OFF/production は完全不変。

---

## 実装した
- `placeAffinityShadowRanking.shadowInputsFromDisplayOrder(orderedKeys)`: 現在の表示順 → shadow 用 `CombinerInput[]`（generalScore=n−index）。pure。
- `PlaceCandidatesPanel`: flag ON/dev のとき useEffect で `buildShadowRanking`（現在の候補順を baseline に P4 combiner の並べ替えを **適用せず** 算出）→ **metrics のみ** console.debug。

## ★安全境界（CEO/GPT 方針厳守）
- ★**順序を変えない**: displayListWithReason は不変・render も従来順。shadow は **観測のみ**（combiner を ranking に使わない）。
- **flag OFF/production → 何もしない**（isPlaceAffinityReasonEnabled gate・完全不変）。
- **place 名/placeKey/座標を出さない**: console.debug は `{candidateCount, orderChanged, changedPositionCount, maxRankShift, personalAppliedCount}` の **集約 metrics のみ**。
- 新規データ/DB/external なし・人格診断なし。combiner の bounded 性（maxRankShift 小）を実データで検証する dev 観測。

## テスト / tsc / lint
- shadow `placeAffinityShadowRanking` **7 tests**（+P6-0: shadowInputsFromDisplayOrder generalScore=n−index・round-trip 順序不変）。eslint clean（exhaustive-deps 含む）。tsc footprint 0。

## smoke 観点（server-health + dev console）
flag ON で /plan 予定追加→場所候補が出ると、dev console に `[place-affinity shadow] {candidateCount, orderChanged, ...}` が出る。★候補の**表示順は変わらない**。データ薄なら orderChanged=false / personalAppliedCount=0。

## 次（P6-1 は design まで・停止）
P6-1 ranking 実反映（候補の実順序を combiner で変える）= 候補挙動が変わる UI stop gate。**design 済（P5.3 doc）・実装は CEO 判断**。P6-0 で蓄積データの並べ替え傾向を観測してから判断。
