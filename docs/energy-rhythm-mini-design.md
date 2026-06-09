# Energy Rhythm / Time-of-Day Fit — mini-design + pure layer（v0）

> 2026-06-09 / Build Unit / PRG 軸。既存観測のみ・pure・read-only・新規データ/DB/UI/external なし・Life Ops 非接続。

「この人はいつ活動しているか（どの時間帯で動きやすいか）」を**断定せず観測ベース**で読む。秘書 OS が「いつ提案すれば実際に動いてもらえるか」を知るための判断材料。

---

## 1. audit（既存データで何が honest に読めるか）
（詳細は audit レポート。要点のみ）
- ★**MobilityObservation**（`mobilityObservationStore`）: `timeband`（朝/昼/夕方/夜）× weekday × weatherKind?・60日・local・redacted でも **timeband は保持**（非 location）。→ **主信号**。
- **movementEvent**: ISO 時刻あり（parse 要）だが actualArrival null 多・completedAt=記録時刻で交絡 → v0 不使用。
- **A0 reason "tired"**: feedback store に **timeband/timestamp なし**（per-leg）→ ★**fatigue を時間帯に置けない**（join 不可・新データ要）→ v0 不使用。
- **dismiss/later**（`proposal/dismissLog`）: timestamp あり。但し ★**proposal=生活行動候補に近接**（movement tolerance で CEO が避けた領域）+ 提案品質交絡 → ★**Life Ops 近接 stop gate 回避のため v0 不使用**。
- **baseEnergyLevel/innerWeather**: ★**day-level singleton**・Stargazer API 依存（非 pure-local）・per-timeband なし → v0 不使用。
- **dayGraph density**: ★**day-level のみ**（per-timeband count なし）→ energy rhythm は density の時間帯分解版に相当。
- ★結論: **新規データ保存なし**で安全に読めるのは MobilityObservation の **timeband 分布**のみ。

## 2. mini-design（構成概念）
### ★3 軸の峻別（CEO 要求・冗長回避）
| 軸 | 測るもの | 信号 |
|---|---|---|
| personal pace（A1） | 移動に**かかる時間** | actual duration |
| movement tolerance | **どう動くか/負荷回避**（effort） | mode-effort skew |
| **energy rhythm（本軸）** | **いつ活動するか**（presence） | timeband 別の観測**数分布** |
- ★energy rhythm は movement tolerance が触れない **presence 次元**。両者は同じ timeband 軸の**別レンズ**（effort vs presence）で**冗長でない**。

### 設計原則
- ★**trait にしない・人格化しない**: 「朝型です」「夜に弱い人です」を**禁止**。→「{時間帯}は活動の記録が多い/少なめの時間帯のようです」観測トーン。
- ★**本人 baseline 比**: 各 timeband の share を**均等（1/4）と比較**し、本人がどこに活動を**集中**させているかを読む（within-person・population trait でない）。
- ★**「活動の記録」レベルで止める**（honesty）: v0 は presence=**記録**を読む。energy/movability への接続は秘書 OS 側の解釈。physiological energy を測定したと**主張しない**。
- insufficient data は沈黙（sufficient gate）・偽数値なし（出力 level enum + 実カウント）・sensitive は timeband のみ使用（OD 不扱い）。
- pure / Date 不使用 / DB・network なし / belief 非汚染 / UI なし。

### ★schedule 交絡への対処（最重要・原則⑦）
- presence は **schedule 駆動**（予定があるから動く）で energy 駆動でない交絡が強い。
- ★**weekend を自然実験に**: 平日=義務的（仕事 schedule）/ **週末=裁量的**。呼び側が **weekend 観測のみ**を渡せば、より「自然な活動時間帯」に近い信号が出る（schedule 交絡を剥がす honest な手法）。core は observations[] を受けるだけ・scope は呼び側が weekday で pre-filter。
- v0 reason は「記録」レベルゆえ交絡があっても**過剰主張にならない**。

### chronopsychology 接地（断定せず）
- 二過程モデル（Borbély: homeostatic+circadian）でアラートネスは日内変動するが、本 v0 は**行動 presence=下流の交絡した readout** を読むのみで circadian phase を**測らない**。
- chronotype（MEQ 等の朝型/夜型）は**質問紙 trait**ゆえ**採らない**。観測された行動だけを扱う。

### 関係整理（CEO 要求）
- **weekday/weekend**: ★core 関係（weekend=裁量信号）。呼び側 scope で扱う。
- **weather**: energy rhythm の主次元でない（weather は mode/tolerance に効く）。雨天が活動抑制する交絡は注記のみ・v0 除外。
- **density**: dayGraph density=day-level 総量 / energy rhythm=その**時間帯分布**。energy rhythm は density の細粒度版。
- **movement tolerance**: 直交（effort vs presence）。「夕方は負荷回避（tolerance）」＋「朝は活動多い（rhythm）」は補完レンズ。
- **place affinity**: 直交（where vs when）。

## 3. 実装する（pure layer・未配線）
`lib/plan/mobility/energyRhythm.ts`:
- `buildEnergyRhythm(observations, config)` → `{status, totalObserved, signals[]}`。timeband 別 count → share を均等(1/4)比較し、`highSkew/lowSkew` 超で `high`/`low` signal（typical は沈黙）。sufficient gate(`minTotalForReady`)。
- `energyRhythmReasonLine(signal)` → 「{朝/昼/夕方/夜}は活動の記録が多い/少なめの時間帯のようです。」観測トーン・trait/数字/「型」なし。
- ★pure・read-only・新規データなし・DB/UI/external なし・belief 非汚染・timeband のみ使用。tests / tsc footprint 0。

## 4. 次設計（★UI/Day Rehearsal 反映は mini-design まで・実装は CEO）
- **UI 表示**: 「活動の時間帯プロフィール」を /plan のどこに控えめに（観測トーン・沈黙原則・flag OFF/dev-only）= user-facing UI stop gate → 設計のみ。
- **Day Rehearsal 反映**: 「朝に活動が集中」を rehearsal の時間帯別 viability/strain に personal modifier で反映（★A2 規律=belief 書き戻さない/widenUncertainty/sufficient gate/Life Ops 非接続）= 実反映 stop gate → 設計のみ。
- **fatigue-by-timeband 増分**: feedback entry に timeband を持たせる（新データ=stop gate）or 安全な skip 信号が出たら 見送り/後回し by time を足す（将来）。
- **weekend-scoped rhythm**: weekend 観測のみの裁量信号（pure 可・次増分）。

## ★stop gate
UI 表示 / Day Rehearsal 実反映 / 新規データ保存 / Life Ops（dismiss/proposal）接続 / DB / external / 人格診断（朝型/夜型）→ 停止。pure/readiness/mini-design は自律可。

## 次
energy rhythm pure layer 着地（未配線）→ 次増分（weekend-scoped）or UI/Day Rehearsal 反映 mini-design。
