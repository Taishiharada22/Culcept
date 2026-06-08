# A2-10 — weatherKind capture（on-device・derived-only・privacy 方針厳守）closeout

> 2026-06-09 / Build Unit / CEO 承認の privacy 方針を守る範囲で実装。on-device only・derived category のみ・sensitive 除外。

A2-9 mini-design + privacy review の方針で、本人 weather reaction を将来学べるよう **weatherKind を安全に観測開始**。

---

## 実装した
- **`MobilityObservation` に optional `weatherKind?: WeatherKind`** を additive 拡張（後方互換）。
- **`buildObservation`**: 入力に `weatherKind?` を追加。★**redacted（sensitive）でない ∧ valid WeatherKind のときだけ**付与。invalid/undefined/source 不明は付けない（捏造しない）。
- **`isObservation`（parse guard）**: weatherKind は任意・present は valid のみ（**旧 obs は weatherKind なしで valid＝後方互換**・invalid weatherKind の obs は drop＝fail-safe）。`cloneObservation` は weatherKind を保持。
- **`isWeatherKind`**（contextModifier・export）: WeatherKind の runtime guard。
- **`clearMobilityObservations()`**: 観測ログ全消去（**opt-out / clear 導線のデータ層**・local・fail-open）。
- **MapTab capture**: `buildObservation({…, weatherKind: todayWeather?.value})`。`todayWeather` は `useTodayWeather`（A2-7）由来。

## ★privacy 方針の遵守（CEO 採用方針）
| 方針 | 実装 |
|---|---|
| on-device only | localStorage のみ（既存 MobilityObservation 同様）。DB/server/network なし。 |
| derived-only / category のみ | 保存は `weatherKind`（rain/snow/storm/heat/cold/normal）だけ。 |
| raw weather/温度/降水 非保存 | weatherKind は category。raw 値は受け取りも保存もしない。 |
| raw location/GPS/座標/officeCode/住所/場所 非保存 | weatherKind に含まれない（居住地 day-level category）。 |
| sensitive/redacted/readOnly 除外 | readOnly→obs 自体 null。redacted→weatherKind 付けない。 |
| bounded 60日 | 既存 `MAX_OBSERVATION_DAYS=60` を継承（weatherKind も日次 cap）。 |
| sufficient gate | A2-11 で設計（capture は記録のみ・personal 反映しない）。 |
| opt-out / clear | `clearMobilityObservations()`（データ層・UI 導線は A2-11/将来）。 |
| belief 汚さない | weatherKind は観測の metadata。belief(L1-b repertoire) は読まない/書かない。 |
| 決定時 overlay | personal reaction は未実装（A2-11 設計）。 |

- ★**dev/dogfood のみ capture**: `todayWeather` は `isContextModifierEnabled()`（flag ON ∧ 非 production）のときだけ非 null → **production では weatherKind を保存しない**（production exposure / server collection なし）。

## テスト / tsc / lint
- 観測 store +8 tests（normal×valid→保存 / redacted→付けない / invalid・undefined→付けない / 全 category / 後方互換 parse / invalid weatherKind drop / save→load / clear）。store 計 **29 PASS**・mobility **452 PASS**。tsc footprint **0**・eslint clean。

## ★やっていないこと（CEO 制約）
DB / production exposure / server sync / raw weather/location/GPS/JMA text/officeCode 保存 / personal weather reaction の反映・UI 表示 / personality・trait label / calibration / push・PR / Vercel / Reality apply。

## 次
A2-11 weather reaction readiness / personal overlay mini-design（何件で personal化可・一般則 vs 本人固有の優先・thin data fallback・UI が人格診断にならないか）。実 personal 反映は止める。
