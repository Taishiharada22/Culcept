# Place Affinity P5 案A reason-only UI（flag OFF・smoke 観点提示で停止）

> 2026-06-09 / Build Unit / user-facing ゆえ **flag OFF commit → dev smoke 観点提示 → CEO smoke → main 着地**。
> ★実 flag ON は main に commit しない。本書は smoke 待ちの記録。

---

## 実装した（P5 案A reason-only・順位不変）
- **`placeAffinityReasonUi.ts`**: flag `PLACE_AFFINITY_REASON_UI_ENABLED`(default OFF) + `isPlaceAffinityReasonEnabled()`(flag ∧ 非 production) + `placeCandidatePersonalReason(canonicalText, p2)`（候補 canonical text を正規化 key で P2 destKey と照合 → frequent/habitual のみ「よく行く/ときどき行く場所のようです」・それ以外 null）。
- **`mobilityObservationStore.loadAllObservations()`**: 全観測を flat 配列で read（additive・fail-open・read-only）。
- **`PlaceCandidatesPanel.tsx`**: flag ON のとき `loadAllObservations()→buildPlaceAffinityReadiness` で P2 を 1 回算出し、各候補に `personalReason` を **順位を変えずに** 付与（`displayListWithReason`）。候補行に slate-400 の 1 行を控えめ表示。

## ★安全境界（CEO 方針厳守）
- **順位不変**: combiner を ranking に使わない。並びは P1A-2a のまま。reason を **添えるだけ**。
- **flag default OFF ∧ dev-only**: production hard block。flag OFF → p2=null → personalReason 全 null → **既存挙動完全不変**（loadAllObservations も呼ばない）。
- **断定/人格診断にしない**: 「〜のようです」観測トーン（P2 builder）。「好き/タイプ/性格」なし。
- **raw 非表示**: score/visitCount/strength/confidence/内部値を出さない（reason 文字列のみ・data-testid のみ）。
- **sensitive/redacted/readOnly 由来 reason なし**: P2 集計時に redacted 除外済（destKey null）。
- **raw GPS/座標/住所/placeId 非扱い**: 照合は正規化 locationText のみ。新規データ保存なし・DB/external なし。
- modal/heavy UI なし（候補行の 1 行のみ）。

## テスト / tsc / lint
- `placeAffinityReasonUi` **7 tests**（not_enough/一致/occasional 沈黙/未訪問/正規化一致/raw 非含有/flag）。compose dir 回帰 PASS。eslint clean。tsc footprint 0（後述）。
- 注: 候補一致は「過去に同じ Google 候補を選び locationText が canonical で保存された場合」に成立（destKey=正規化 canonical）。表記の異なる手入力は一致しない（沈黙＝誤 reason を出さない・保守的）。

## ★dev smoke 観点（CEO 実機確認をお願いしたい点）
flag ON（dev override・uncommitted）で /plan の anchor 追加 → 場所候補パネル:
1. **過去によく選んだ場所**（同じ候補を 4 回以上選択済）が候補に出たとき「よく行く場所のようです」が**控えめに**出るか。
2. **観測が薄い**（< 8 件）/ **未訪問**の候補 → **何も出ない**（沈黙）か。
3. ★**候補の並び順が変わっていない**か（P1A-2a の順のまま・reason が増えただけ）。
4. raw 数値/place 名/断定/人格診断に見えないか。既存の typeReason・距離表示・skip 等が壊れていないか。
5. flag OFF に戻すと reason が**消える**（完全不変）か。

→ smoke で違和感があれば修正。**PASS なら flag OFF のまま main 着地**。

## 次（P3 条件付き reason は fast-follow）
本 v0 は P2 無条件（「よく行く」）のみ。「この時間帯/雨の日に選ばれやすい」（P3）は anchor の対象条件（timeband/weather）配線が要るため次増分。
