# Place Affinity P5.2 weather 条件付き reason-only（順位不変・flag OFF・dev-only）closeout

> 2026-06-09 / Build Unit / P5.1 の条件に weather を追加（最優先）。★既存 A2 weather 再利用・新規 API/DB/data なし。

---

## audit（既存資産の再利用）
- `placeCandidateBestReason` / `conditionPhrase` は P5.1 で **既に weather 対応済**（`placeConditionLabel`: rain→「雨の日」/snow→「雪の日」/storm→「荒天の日」/heat→「暑い日」/cold→「寒い日」/normal→null）。テスト済。
- `useTodayWeather()`（A2-6・`Sourced<WeatherKind>|null`・既存 today-weather route 再利用・**A2 flag/非 production gate 内**・fail-open）。
- → P5.2 は **panel に weather condition を最優先で push するだけ**の外科的配線。

## 実装した
- `PlaceCandidatesPanel`: `useTodayWeather()` を呼び、`placeAffinitySignals` の conditions **先頭**に weather condition を push（label 付き=rain/snow/storm/heat/cold のみ・normal/null は沈黙）。
- 優先順: **weather > timeband > weekday > revealed preference(P2)**。
- 文言は既存: 「雨の日に選ばれやすい場所のようです」等。

## ★安全境界（CEO P5.2 方針厳守）
- **既存 A2 weather 再利用**（新規 API/DB/data 保存なし）。weather は today-weather route（A2-6・既存）由来・fail-open。
- **ranking 変更なし**（reason のみ・順位は P1A-2a のまま）。
- **flag OFF→null＝完全不変**（P5 flag OFF → signals null・A2 flag OFF/production → todayWeather null → weather condition なし）。
- weatherKind unknown/null/normal → 沈黙。sparse(P3 not_enough) → 沈黙。sensitive/redacted/readOnly 除外（P3 集計時）。
- **raw weather/JMA text/temperature/precipitation/officeCode を出さない**（label のみ＝「雨の日」等）。raw score/visitCount/strength/内部値 非表示。人格診断にしない。

## テスト / tsc / lint
- `placeAffinityReasonUi` **14 tests**（+P5.2: weather を先頭に置くと timeband より優先）。eslint clean。tsc footprint 0。

## smoke 観点（server-health + dev）
flag ON（P5 + A2）で /plan 予定追加→場所候補: 今日が雨/雪/荒天/暑い日で、その天候に偏って選んだ場所が候補に出たとき「{雨/雪/荒天/暑い}の日に選ばれやすい場所のようです」が最優先で出るか。normal/データ薄は沈黙。順位不変。

## 次（P5.3 候補・自律）
reason priority/fallback の安定化・condition reason 重複抑制・sparse 沈黙保証の強化・reason-only UI 視認性・shadow ranking 検証（pure・順位反映はしない）。ranking 実反映/production/DB/external/予約/通知 は stop gate。
