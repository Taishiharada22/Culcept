# Movement Tolerance / 移動耐性 — mini-design + pure layer（未配線）

> 2026-06-09 / Build Unit / PRG 軸。既存観測のみ・pure・read-only・新規データ/DB/UI/external なし。

「この人はどの条件で移動負荷の少ない手段を選びやすいか（負荷を避けやすいか）」を断定せず観測ベースで読む。

---

## 1. audit（既存データで何が分かるか）
- **MobilityObservation**（`mobilityObservationStore`）: `mode` × `weatherKind` / `timeband` / `weekday`（+ destKey）。60日・local。★これが主信号。
- **A0 reason**（`hypothesisFeedbackStore`）: `tired/scenery/cheap/hurry/mood/other`（mode 訂正時のみ・sparse）。明示的回避（tired/hurry）は次増分の corroboration。
- **RouteTransportMode**: walk/car/taxi/train/shinkansen/bus/bicycle/flight/unknown。
- **dismiss/later reason**: proposal/reality 系に存在するが ★**Life Ops/Reality に近いので使わない**（stop gate 回避）。
- **density**: MobilityObservation に無い → 対象外（将来 density tag が要る）。
- **personal pace**（movementEventStore）: 実移動**時間** → 別軸（下記）。
- ★新規データ保存は不要（既存観測のみで mode-effort 信号が取れる）。

## 2. mini-design（構成概念）
### ★personal pace との区別（CEO 明示）
| | personal pace（A1） | movement tolerance（本軸） |
|---|---|---|
| 何を測る | 実移動**時間**の個人差（est との比） | 移動**負荷を受け入れる/避ける傾向** |
| 信号 | movementEventStore の actual duration | mode の physical/exposure 負荷の**条件別シフト** |
| 例 | 「この区間は est より長くかかる」 | 「雨の日は低負荷手段を選びやすい」 |

### 設計原則
- ★**trait にしない・人格化しない**（「移動が苦手な人」と断定しない）→ 条件付き観測トーン「{条件}は移動負荷の少ない手段を選びやすい傾向が見えます」。
- ★**本人 baseline 比**で条件別シフトを読む（A2-4/P3 と同思想）→ 普遍的交絡（距離/天候は誰でも）を本人比で軽減。
- mode-effort: walk/bicycle=高、train/bus/shinkansen=中、car/taxi=低、flight/unknown=除外。「低負荷手段」= 高(walk/bike)でない。
- sufficient gate（薄いデータで断定しない）・redacted 除外（mode のみ使用ゆえ場所 key 不要）・偽数値なし（share は内部・出力は boolean+実カウント）。

### weather/timeband/weekday/place affinity との関係
- weather/timeband/weekday = 条件（観測に在る）。density = 観測に無く対象外。
- place affinity = 「どこが合うか」（場所軸）・直交。移動耐性は「移動の**負荷形態**」の選び方。far place 回避は place affinity の距離信号で別途。

## 3. 実装した（pure layer・未配線）
`lib/plan/mobility/movementTolerance.ts`:
- `modeEffortLevel(mode)` → high/medium/low/null。
- `buildMovementTolerance(observations, config)` → `{status, totalObserved, signals[]}`（条件別 low-load skew が baseline 比 ≥0.2 + sufficient で `avoidsLoadUnderCondition`）。薄い/skew なしは沈黙。
- `movementToleranceReasonLine(signal)` → 観測トーン（人格断定/数字なし）。
- ★pure・read-only・新規データなし・DB/UI/external なし・belief 非汚染。tests / tsc footprint 0。

## 4. 次設計（★UI/Day Rehearsal 反映は mini-design まで・実装は CEO）
- **UI 表示**: 移動耐性 reason を /plan のどこに控えめに出すか（観測トーン・沈黙原則）= user-facing UI stop gate → 設計のみ・CEO 判断。
- **Day Rehearsal 反映**: 「この人は雨の日は低負荷を選びやすい」を rehearsal の friction/viability に反映 = 実反映 stop gate → 設計のみ・CEO 判断。
- **A0 reason corroboration**: tired/hurry の明示的回避を信号に足す（次増分・pure 可）。
- **personal 化の精緻化**: mode-effort proxy の距離交絡を、movementEvent の duration や place 距離で補正（要データ・設計）。

## ★stop gate
UI 表示 / Day Rehearsal 実反映 / 新規データ保存 / Life Ops 接続 / DB / external / 人格診断 → 停止。pure/readiness/mini-design は自律可。

## 次
movement tolerance pure layer 着地（未配線）→ 次の pure 増分（A0 reason corroboration）or UI/Day Rehearsal 反映 mini-design。
