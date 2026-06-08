# A2-6 — Weather 配線（JMA → context modifier）closeout

> 2026-06-09 / Build Unit / CEO 判断「weather 配線」。pure mapper + 隔離 route + flag-gated client hook。全レイヤ fail-open。

A2 context modifier に「今日の実天気」を入れ、文脈 reason を本物にする。dev/dogfood のみ（production hard block）。

---

## audit の核心（前提を疑った点）
- jma.ts は **server-only**（`fetch` 使用）→ client から呼べない。
- /plan client に物理天気の cache は **無い**（`useInnerWeather` は感情天気）。month API は weather_daily を返すが client 未消費＝threading が侵襲的。
- → **最も外科的・隔離的・fail-open** な「専用 server route + flag-gated client hook」を選択（既存 route は一切触らない）。
- A2 は production hard block ゆえ weather source は **dev/dogfood で動けば十分**（production 級不要）。

## 実装した
- **A2-6a pure mapper**（`weatherMapping.ts`）: `weatherDailyToWeatherKind(WeatherDailyLike)` → rain/heat/cold/normal。優先=降水>heat>cold>normal。★**snow は cold 扱い**（「雨」と誤ラベルしない＝A2-1 で tilt なし・保守的 under-claim）。**データ皆無→null**（捏造しない）。閾値=pop≥60/heat≥30/cold≤3（固定・較正 backlog）。9 tests。入力は構造的（jma.ts 非依存＝server コードを引き込まない）。
- **A2-6b route**（`app/api/plan/today-weather/route.ts`）: server で auth→office code（`user_weather_settings`）→`fetchJmaDailyForecast`→今日(JST)を mapper で WeatherKind 化→`{weather}`。★**全段 fail-open**（未認証/office 無/JMA 失敗/例外→`{weather:null}` 200）。★出力は **category のみ**（office code/座標/住所は server 内に留め client に渡さない＝sensitive-free）。
- **A2-6b hook**（`useTodayWeather.ts`）: `isContextModifierEnabled()` のときだけ mount 1 回 fetch（**production/flag OFF は fetch しない**）。fail-open。`Sourced<WeatherKind>|null` を返す。
- **bridge**（`buildDayContextSnapshot` に optional weather を additive）+ **CalendarTab**（hook→snapshot 供給・deps 追加）。
- `Sourced<T>` を export（hook/bridge 用）。

## ★安全境界（全 stop gate 準拠）
- external API: JMA は **server-only（既存 fetchJmaDailyForecast 再利用）**・public・key 不要・fail-open。client は route 越しのみ。
- production: A2 は hard block。client hook は flag ON のときだけ fetch ＝ **production では route を呼ばない**。route 単体も出力は無害な category。
- sensitive: location は server 内に留め、client/snapshot に渡るのは WeatherKind のみ。
- belief/DB write: なし（DB は read-only=既存 user_weather_settings の参照のみ）。
- 既存 route/挙動: **一切触らない**（隔離した新規 route のみ追加）。flag OFF で contextReason=null＝完全不変。

## テスト / tsc / lint
- weatherMapping **9 tests**・context dir 計 **56 PASS**。eslint clean。tsc footprint **0**（後述で確認）。
- route/hook は IO ゆえ unit でなく **server-health smoke** で担保（pure-core tested / thin-shell smoke）。

## ★v0 制約（honest）
- snow の移動負担は under-model（cold 扱い＝tilt なし・誤ラベル回避優先）。snow-aware tightening は将来。
- pop≥60/heat30/cold3 は固定（較正 backlog）。今日 = JST 暦日（日本前提）。
- 天気の tilt は一般則（rain/heat→tightens slight・grounding="general"）。本人の天気別反応の personal 化は条件×行動の捕捉が要る（将来・別 gate）。

---

## smoke 観点（dev/dogfood）
flag ON で /plan を開くと、`/api/plan/today-weather` が 1 回呼ばれ、雨/猛暑の日は文脈 reason に天気が効く（「今日は雨があるので、普段より少し余白を…」）。穏やかな日や取得失敗は天気要素なし（degrade）。production では呼ばれない。

## 次
A2-6 で weather が文脈に入った。残る A2 前進＝天気の personal 化（条件×行動捕捉）・energy/travel 完全履歴 baseline（DB）・production 露出。いずれも CEO 判断 or 新規データ基盤。
