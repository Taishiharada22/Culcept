# Place Affinity P6-1 ranking 実反映（別 flag・dev-only・flag OFF commit）closeout

> 2026-06-09 / Build Unit / 候補の実順序を combiner で穏やかに調整。★user-facing ゆえ flag OFF commit → CEO smoke 待ち。

---

## 実装した（P6-1 ranking 実反映）
- **`scorePlaceCandidates`**（combiner から抽出・入力順・未ソート）: per-item の combinedScore。combinePlaceAffinity は内部でこれを使う（挙動不変）。
- **flag `PLACE_AFFINITY_RANKING_ENABLED`**（default OFF・dev-only・**reason-only とは独立**）。
- **`PlaceCandidatesPanel`**: ranking flag ON のとき `rankedDisplayList` で候補を **combinedScore 降順** に並べ替え（現在の表示順を baseline・p2 + p3List[0]＝shadow と同じ signal）。flag OFF → displayListWithReason のまま＝**順位不変**。

## ★安全境界（CEO/GPT 方針厳守）
- **bounded nudge≥0 / clamp（P4 継承）**: familiar/condition-fit を **少し押し上げるだけ**・未訪問を罰しない（探索を潰さない）・明確な general 勝者を覆さない。
- **shadow(P6-0)と同じ signal**（p2 + p3List[0]）→ shadow が観測した並べ替えと**一致**（CEO「shadow で観測してから」を担保）。
- **別 flag・dev-only**: reason だけ/ranking も、を分離。flag OFF/production → 順位不変（完全不変）。
- sufficient gate（薄いデータは general-only）・sensitive 除外（P2/P3 集計時）・座標/住所/raw 値なし・人格診断なし・新規データ/DB/external なし。
- reason（P5.x）が「なぜ上位か」を説明（整合）。

## テスト / tsc / lint
- `scorePlaceCandidates` 3 tests（入力順・未訪問 0・combinePlaceAffinity 整合）+ ranking flag test。combiner/reasonUi/shadow **36 PASS**（refactor 回帰なし）。compose dir PASS。tsc footprint 0。eslint clean。

## ★CEO 実機 smoke（server 起動・両 flag ON）
flag ON（reason + ranking）で /plan 予定追加→場所候補:
1. **よく行く/今日の条件に合う場所** が候補内で **少し上位** に来るか（穏やかに・大きく飛ばない）。
2. **未訪問の良候補**が**下がっていない**か（罰しない）。明確に近い/合う候補が極端に動いていないか。
3. reason（「よく行く/この時間帯に選ばれやすい」）と上位化が**整合**しているか。
4. データ薄なら順位不変か。ranking flag OFF で順位が元に戻るか。dev console の `[place-affinity shadow]` metrics（maxRankShift 小）と一致するか。

→ smoke PASS なら flag OFF のまま main 着地。

## v0 制約
ranking は p3List[0]（最優先条件）で nudge。reason は full p3List（下位条件も表示）→ 稀に「reason は下位条件・nudge は 0」の不一致あり（記録）。
