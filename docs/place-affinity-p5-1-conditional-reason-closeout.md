# Place Affinity P5.1 条件付き reason-only（順位不変・flag OFF・dev-only）closeout

> 2026-06-09 / Build Unit / P5 案A の条件付き拡張。★順位不変・reason のみ・flag OFF commit・dev server で CEO smoke。

---

## 実装した（P5.1 条件付き reason-only）
- **`placeAffinityReasonUi.placeCandidateBestReason(canonicalText, p2, p3List)`**: 条件付き（p3List を優先順）で該当 place が skew + sufficient なら「{この時間帯/週末/雨の日 …}に**選ばれやすい**場所のようです」。無ければ無条件 P2（「よく行く」）に fallback。
  - `conditionPhrase`: timeband→**「この時間帯」**（★具体時刻を露わさない・privacy）・weekday→「平日/週末」・weather→ラベル（雨の日/雪の日…）。
- **`placeConditionAffinity.placeConditionLabel`** export（weather ラベル再利用）。
- **`PlaceCandidatesPanel`**: optional props `anchorStartTime`/`anchorDateISO` を追加。flag ON 時、観測から P2 + 条件付き P3List（timeband=予定時刻・weekday=予定日・**優先順 この時間帯 > 平日/週末**）を build し、各候補に best reason を **順位不変**で付与。
- **`AnchorFormFields`**: `anchorStartTime={form.startTime}` `anchorDateISO={form.date}` を渡す。

## ★安全境界（CEO P5.1 方針厳守）
- **ranking 変更なし**（combiner を順位に使わない・並びは P1A-2a のまま・reason のみ）。
- **flag OFF（dev-only）**: flag OFF → signals=null → reason 全 null＝完全不変。
- **sparse 沈黙**: P3 not_enough / skew false / occasional / 未訪問 → 沈黙。
- **sensitive/redacted/readOnly 由来なし**: P2/P3 集計時に redacted 除外済（destKey null）。
- **raw 非表示**: score/visitCount/strength/confidence/内部値を出さない（reason 文字列のみ）。人格診断にしない。
- **external 依存なし**: 条件は **anchor の予定時刻/日付から derive**（timeband/weekday）。weather は今回扱わない（A2 hook/route 依存ゆえ fast-follow）。新規データ保存なし・DB なし。

## テスト / tsc / lint
- `placeAffinityReasonUi` **13 tests**（P5 7 + P5.1 6：timeband「この時間帯」/weekday/weather/優先順/fallback/skew・occasional・not_enough 沈黙/raw 非含有）。compose dir 回帰 PASS。tsc footprint 0。eslint clean。

## ★dev smoke 観点（CEO 実機・dev server 起動済）
flag ON で /plan の予定追加（時刻・日付を入れる）→ 場所候補:
1. **特定の時間帯によく選んだ場所**が、その時間帯の予定で候補に出たとき「この時間帯に選ばれやすい場所のようです」が出るか。
2. **平日/週末に偏る場所** → 「平日/週末に選ばれやすい場所のようです」。
3. 条件 reason が出ないとき無条件「よく行く場所のようです」に落ちるか。薄い/未訪問 → **沈黙**か。
4. ★**候補の並び順が変わっていない**か。時刻に具体値（数字）が出ていないか（「この時間帯」表現）。
5. flag OFF で消えるか。

→ smoke PASS なら flag OFF のまま main 着地。

## 次（weather 条件は fast-follow）
「雨の日に選ばれやすい」は useTodayWeather(A2 hook/route)依存ゆえ別増分（A2 weather coupling の可否は CEO 判断）。
