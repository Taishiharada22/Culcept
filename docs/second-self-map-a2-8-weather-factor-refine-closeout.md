# A2-8 — Weather factor 精密化（snow/storm 独立化）closeout

> 2026-06-09 / Build Unit / pure・定性・偽数値なし・mode 不変・既存 A2 gate 配下。

v0 で under-model だった snow を「沈黙」から「注意」へ。storm を独立カテゴリ化。

---

## 再監査（前提を疑う）
- **snow→cold→沈黙は under-model**: 雪は移動を実際に妨げる（滑る/遅延/徒歩減速）。雪の日に沈黙はユーザーに不誠実。→ snow を独立カテゴリ化し tightens(slight)。
- **storm** は JMA icon にあり既存 rain 扱いだった → 独立カテゴリ化（荒天の注意）。
- **wind は JMA `WeatherDaily` に field が無い**（icon=sun/cloud/rain/snow/storm/fog/unknown のみ）→ A2-8 対象外。wind を出すには jma.ts の parse 拡張＝共有 weather module 変更＝stop gate「external API 依存が増える」に該当ゆえ**やらない**（将来）。
- **cold（雪でない）** は tilt なしのまま（寒さ単独は移動を強く妨げない＝descriptive・honest）。

## 実装した
- **WeatherKind** を `rain|snow|storm|heat|cold|normal` に additive 拡張。
- **`weatherMapping`**: icon の降水/荒天を独立化（優先 storm>snow>rain>heat>cold>normal・pop≥60→rain・データ皆無→null）。誤ラベルしない。
- **day-level factor**（contextModifier）: `WEATHER_TILT_BASIS` で 雨/雪/荒天/暑さ → tightens(**slight**・全 adverse 一律 slight＝断定/警告回避)・各 honest basis。cold/normal → tilt なし。reason 文言は 雨/雪/荒天/暑さ を区別（数字フリー）。
- **leg-level note**（mobilityHypothesis + explanationCopy + contextBridge）: DecisionContext/ContextNote に snow/storm を拡張。屋外露出 mode × (雨/雪/荒天/暑さ) で「今日は雪/荒天なので、◯◯は少し負担かも」注意。★**mode は変えない**（contextNote のみ）。`contextToDecisionContext` が snow/storm を投影。

## ★安全境界（CEO stop gate 準拠）
- 偽の係数/確率/スコア: なし（定性 direction×strength のみ・全 adverse は slight）。
- JMA raw 文言を UI に出さない（icon/数値を出さず、固定の仮説トーン copy のみ）。
- mode を変えない（todayLikelyMode は belief 由来・weather は注意だけ）。
- source 不明なら沈黙（unknown source は factor/note を出さない・データ皆無は null）。
- 既存 A2 gate 配下（day-level は flag ON のみ・leg-level は useTodayWeather=dev-gated 経由）。production 露出なし。
- 断定/警告っぽくしない: 全 adverse weather を slight に統一（単独で「tighter」に振らない・aggregate は他要素と合わさって初めて effく）。

## テスト / tsc / lint
- weatherMapping（snow→snow/storm→storm/cold）・contextModifier（雨雪荒天暑さ→tightens slight・cold/normal→none）・mobilityGuidance（snow/storm 注意・mode 不変）・contextBridge（snow/storm 投影）更新/追加。
- context + mobility tests PASS・tsc footprint 0・eslint clean（後述で確認）。

## ★v0 制約
- 全 adverse weather は一律 slight（severity を strength で差をつけない＝保守・断定回避）。storm の severity は basis 文言でのみ表現。
- wind 未対応（JMA field 拡張が要る）。閾値固定（pop60/heat30/cold3）。天気 tilt は一般則（personal 化は A2-9 で audit+design）。

## 次
A2-9 weather personal化 audit + mini-design（一般則 weather modifier と本人固有 weather reaction の分離・weather×movement 観測の捕捉設計）→ ★mini-design で停止（実装/新規データ/DB/sensitive 判断はしない）。
