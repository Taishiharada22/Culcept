# RD2e-b0B-A — LeaveBy Adapter 前提確定（calendar / seconds / bounds / buffer binding / arrival provenance / uncomputed priority / instantMinusMinutes tests）docs-only

- 日付: 2026-06-15 / 位置づけ: RD2e-b0B（`815f1714`）の 7 ブロッカーを RD2e-b 実装**前**に確定する。GPT 監査 7 点を独立裁定し、見落としを補う。
- 規律: **コードを書かない**。`instantMinusMinutes` 実装・leaveBy adapter 実装・RC2a/MovementReality/currentLocation/geolocation/route provider/weather/UI/DB write/Supabase/localStorage/notification/external/production には進まない。
- 上流確定: RD2d-b-VALUE 実装済（`c99afd46`・`PlanningGradeDurationValueV0` + `bindDurationValueToCapability`）/ RD2e-a・a-A（`LeaveByComputationV0` + `isCanonicalJstIso` + `leaveByAtOrBeforeArrival`）/ buffer catalog small5/medium15/large30（RD2e-b0A §3）。

---

## 0. 独立裁定サマリ（GPT 7 点 + 自己発見 4 点）

| # | GPT 指摘 | 裁定 | 理由 |
|---|---|---|---|
| 1 | regex だけでは暦妥当性を保証できない | **採用** | 自分の b0B の穴。`2026-02-31`/`2026-13-01`/`24:00`/`23:60` が regex を通り、`instantMinusMinutes` が**存在しない日付から計算**する silent corruption になる |
| 2 | seconds 扱い未定義 | **採用・A（ss=00 固定）** | 既存は分粒度・duration/buffer は minutes・秒は過剰精密。さらに **whole-minute epoch** 化で秒演算を完全排除（自己発見 a） |
| 3 | duration/buffer 上限未定義 | **採用** | 異常値で leaveBy が year 1900 へ飛ぶ。bounds + **post-subtraction range guard**（自己発見 b） |
| 4 | buffer binding が弱い | **採用** | buffer も leaveBy 燃料。別 scope 混入は危険。**単一 leaveByScopeKey** で duration/buffer/arrival を一括束縛（自己発見 c） |
| 5 | arrivalTargetInstant の source/evidence 不在 | **採用** | bare string は trace 不能。構造化 + fixedness/confidence gate |
| 6 | uncomputed reason 優先順位 | **採用** | 多重欠落で reason が不安定 → test/trace 弱化。**first-failing-gate-wins** の決定表 |
| 7 | instantMinusMinutes property tests | **採用** | calendar/rollover/leap/monotonicity/canonical/no-Date + **composition 等価性**（自己発見 d） |

**自己発見（GPT を超える・CEO ⑦）**: (a) seconds=00 なら **whole-minute epoch** で演算 → 秒丸めバグの全クラスを消す。(b) **post-subtraction year range guard** で「massive value → year 1900」を出力時に直接封じる。(c) **単一 scope key** が duration/buffer/arrival を一括束縛（三者の出所一致を 1 つの key で保証）。(d) **composition 等価性** `minus(minus(t,a),b) == minus(t,a+b)` が「duration+buffer を 1 回で引く」設計の正しさを証明し、二重丸めを排除する。

---

## 1. calendar-valid canonical JST ISO（CEO 必須 1）

`isCanonicalJstIso`（RD2e-a-A・実装済）は**形式**のみ（regex）。RD2e-b は**その上に** calendar + 分粒度を重ねた新 guard `isCalendarValidMinuteJstIso` を**入力検証に使う**（既存関数は不変・additive）。

```
isCalendarValidMinuteJstIso(s) :=
  1. /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+09:00$/  // offset は +09:00 固定（他 offset 不可）
  2. 分解 Y,Mo,D,h,m,sec
  3. sec === "00"                       // seconds policy A（§2）。00 以外は invalid
  4. 2000 ≤ Y ≤ 2100                    // 表現可能域（§3 range guard と一致）
  5. 1 ≤ Mo ≤ 12
  6. 0 ≤ h ≤ 23  ∧  0 ≤ m ≤ 59
  7. 1 ≤ D ≤ daysInMonth(Y,Mo)          // 月別日数・閏 2 月対応
```
- `isLeap(Y) := (Y%4===0 ∧ Y%100≠0) ∨ Y%400===0`
- `daysInMonth = [31, isLeap?29:28, 31,30,31,30,31,31,30,31,30,31][Mo-1]`
- **弾く例**: `2026-02-31`（D>28）/ `2026-13-01`（Mo>12）/ `2026-00-01`（Mo<1）/ `2026-06-12T24:00:00`（h>23）/ `T23:60:00`（m>59）/ `T23:59:60`（sec≠00）/ `…+00:00`（offset 違反）。
- invalid calendar date → adapter は **uncomputed**（§6 優先順位）。`instantMinusMinutes` も domain 外として null。

---

## 2. seconds policy（CEO 必須 2・裁定 A）

**裁定: A（seconds は必ず `00`）**。00 以外は **uncomputed**（A を policy、enforcement は C 相当 = reject）。

- 理由: 既存思想は 1 分刻み / duration・buffer は minutes / 秒は過剰精密 / leaveBy を秒単位にしない。
- **演算は whole-minute epoch**（自己発見 a）: ss=00 を前提に `epochMinutes = daysFromCivil(Y,Mo,D)*1440 + h*60 + m`。秒を一切扱わない → 秒丸め・閏秒・秒キャリーのバグクラスが**構造的に存在しない**。
- 上流 arrivalTarget 供給側が ss=00 に正規化する責務（truncate ではなく「分粒度で供給」）。RD2e-b は非 00 を信用せず uncomputed。
- 出力 `leaveByInstant` も ss=`00`（minute epoch から再構成ゆえ必然）。

---

## 3. duration / buffer bounds（CEO 必須 3・v0 conservative）

value channel が integer/%5/≥0 を保証しても、**異常に大きい値**は leaveBy を不自然にする。adapter は value を信用せず**再検証**する（defense in depth）。

| 定数 | v0 値 | 根拠 |
|---|---|---|
| `MAX_DURATION_MINUTES` | **1440**（24h） | 日次プランの単一脚 ETA が 24h 超は異常 |
| `MAX_BUFFER_MINUTES` | **60** | catalog 最大 30 に対し防御余裕（catalog 外は別途 uncomputed） |
| `MAX_TOTAL_SUBTRACTION_MINUTES` | **1440** | leaveBy は arrival の 24h 超前にしない |
| `EPOCH_YEAR_MIN / MAX` | **2000 / 2100** | 表現可能域（§1 と一致） |

- **abnormal duration**（`>MAX_DURATION` / `<0` / 非 integer / `Infinity` / `NaN`）→ uncomputed。`Number.isFinite ∧ Number.isInteger ∧ 0≤v≤MAX` を満たさなければ即 fail-closed。
- **abnormal buffer** 同様（catalog 由来ゆえ通常は {5,15,30} だが防御再検証）。
- `total = durationUpperBoundMinutes + bufferMinutes`。`total > MAX_TOTAL_SUBTRACTION` → uncomputed。
- **post-subtraction range guard**（自己発見 b）: 減算後の `Y' ∉ [2000,2100]` → `uncomputed("subtraction_out_of_range")`。これが「massive value で year 1900 へ飛ぶ」を**出力時点で直接封じる**。

---

## 4. buffer binding contract（CEO 必須 4・単一 scope key）

buffer も leaveBy を動かす燃料。duration が capability に full-basis bind されるのに buffer が裸 bucket だと**別 scope の buffer が混入**し得る。

`BufferPolicyForLeaveByV0`（RD2e-b の入力型・docs 確定）:
```
bufferPolicyId        : string          // 短縮 key でなく policy 識別
bufferKind            : "small"|"medium"|"large"   // catalog 連動（→ 5/15/30）
bufferScopeRef        : string
targetNodeId          : string
subjectiveDate        : string
transportMode         : TransportModeV0  // relevant な場合
sourceRefs            : string[]
evidenceRefs          : string[]
freshness             : "valid"|"stale"|"unknown"
displayPolicy         : "hidden"         // internal-only
```

**単一 leaveByScopeKey**（自己発見 c）:
```
leaveByScopeKey(x) := targetNodeId :: subjectiveDate :: transportMode
```
- 不変条件: `scopeKey(duration.binding) === scopeKey(buffer) === scopeKey(arrivalTarget) === scopeKey(capability.identity)`。1 つでも不一致 → `uncomputed("buffer_scope_mismatch")`（出所の異なる燃料を合成しない）。
- `bufferKind ∉ catalog` → `uncomputed("buffer_unknown")`。
- `freshness ∈ {stale, unknown}` → `uncomputed("buffer_unknown")`（古い/不明な余裕で leaveBy を作らない）。
- buffer minutes は catalog 解決のみ（provider/LLM 任意分数値を受けない・RD2e-b0A §3）。

---

## 5. arrival target provenance（CEO 必須 5）

arrivalTargetInstant を bare string にしない。trace 可能な構造化入力にする。

`ArrivalTargetForLeaveByV0`（RD2e-b の入力型・docs 確定）:
```
arrivalTargetInstant  : string   // isCalendarValidMinuteJstIso green（§1）
arrivalTargetRef      : string
targetNodeId          : string
targetEventDate       : string   // = capability.subjectiveDate と一致必須
transportMode         : TransportModeV0
sourceRefs            : string[]
evidenceRefs          : string[]
fixedness             : "fixed"|"tentative"|"movable"   // RD2d-0A event anchor 連動
startTimeProvenance   : "confirmed"|"inferred"|"default"
confidence            : "high"|"medium"|"low"
displayPolicy         : "hidden"   // internal-only
```

- `arrivalTargetInstant` 非 calendar-valid → `uncomputed("arrival_target_invalid")`。
- `fixedness ≠ "fixed"`（tentative/movable）→ `uncomputed("arrival_not_fixed")`。**v0 conservative**: 出発時刻の意味を持つ leaveBy は到着が固定の時のみ計算（動く予定で leaveBy を出さない）。
- `confidence === "low"` → `uncomputed("arrival_low_confidence")`。
- `targetEventDate ≠ capability.subjectiveDate` または scopeKey 不一致 → `uncomputed("arrival_scope_mismatch")`。
- `startTimeProvenance === "default"`（既定値の仮置き）→ v0 では `uncomputed("arrival_not_fixed")` に合流（推測既定で leaveBy を作らない）。

---

## 6. uncomputed reason priority（CEO 必須 6・first-failing-gate-wins）

多重欠落でも reason を安定させるため、adapter は**この順で gate を評価し、最初に落ちた gate の reason を返す**（決定的）。下位番号ほど fundamental/cheap。

| 順 | gate | reason code |
|---|---|---|
| 1 | 入力 shape（5 入力の null/型） | `input_shape_invalid` |
| 2 | 二鍵 binding（duration↔capability full basis + 全燃料 scopeKey 一致） | `binding_mismatch` |
| 3 | duration value 欠如/unusable | `duration_value_missing_or_unusable` |
| 4 | arrival target 欠如/invalid/not_fixed/low_confidence/scope | `arrival_target_invalid` |
| 5 | buffer 欠如/scope mismatch/stale/unknown bucket | `buffer_invalid` |
| 6 | origin temporal invalid / origin conflict | `origin_temporal_invalid` |
| 7 | 減算失敗 / range 越え | `subtraction_failed` / `subtraction_out_of_range` |

- **trace 保持**: 返す reason は 1 つ（最初の失敗）だが、`bindDurationValueToCapability` の violations 等の safe code は trace に残す（raw echo なし）。
- この固定順により、同じ多重欠落入力に対し reason が**毎回同一**（test 安定 + trace 再現性）。

---

## 7. instantMinusMinutes 実装契約 + test plan（CEO 必須 7）

**契約**: `instantMinusMinutes(instant: string, minutes: number): string | null`（pure・**Date 不使用**・whole-minute epoch）。
- 前提: `isCalendarValidMinuteJstIso(instant)` ∧ `Number.isInteger(minutes) ∧ 0≤minutes≤MAX_TOTAL_SUBTRACTION_MINUTES`。外れたら `null`。
- アルゴリズム（pure 整数・Howard Hinnant）:
  - `daysFromCivil(Y,Mo,D)` / `civilFromDays(z)`（確定式・分岐のみ・浮動小数なし）。
  - `epochMin = daysFromCivil*1440 + h*60 + m` → `epochMin -= minutes` → `civilFromDays(floorDiv(epochMin,1440))` で逆算、剰余で h,m。
  - 出力 canonical（ss=`00` 固定）。`Y' ∉ [2000,2100]` → `null`。

**property tests plan**（RD2e-b 実装時に必須）:
1. `minus(t, 0)` === t（calendar-valid 入力は同一文字列）
2. `minus("…T10:02:00…", 5)` が時をまたぐ（09:57）
3. `minus("…-12T00:10:00…", 30)` が日をまたぐ（前日 23:40）
4. 月末跨ぎ（`07-01T00:10` − 30 → `06-30T23:40`）
5. 年末跨ぎ（`2027-01-01T00:10` − 30 → `2026-12-31T23:40`）
6. 閏年 `2028-03-01T00:10` − 30 → `2028-02-29T23:40`（2028 は閏）
7. 非閏 `2026-02-29…` は **入力時点で invalid**（§1）→ derive で uncomputed（minus 呼ぶ前に弾く）
8. **monotonicity**: a≤b ⇒ `minus(t,a) ≥ minus(t,b)`（leaveByAtOrBeforeArrival で比較）
9. **composition 等価**（自己発見 d）: `minus(minus(t,a),b)` === `minus(t,a+b)` — 「1 回で引く」設計の正しさを保証・二重丸めなし
10. 出力 canonical（`isCalendarValidMinuteJstIso` green）
11. `minutes` が `Infinity`/`NaN`/非 integer/負/`>MAX` → `null`
12. range 越え（巨大 minutes で Y'<2000）→ `null`
13. **source-scan**: `new Date(` / `Date.now` / `navigator` / `geolocation` / `Math.random` 不在

---

## 8. RD2e-b 入力は internal-only（CEO 必須 8・再確認）

- capability は consumer-safe（flag-only）でよいが、`durationValue` / `BufferPolicyForLeaveByV0` / `ArrivalTargetForLeaveByV0` / `originTemporalValidity` は **internal-only**。
- 出力 `LeaveByComputationV0` も **internal-only**（displayPolicy=hidden・RD2e-a-A walker が visible を禁止）。
- **no consumer DTO / no client props / no RJ2 copy / no notification / no departure line / no RC2a**。leaveBy object を**返すのみ**、consume は別 GO。

---

## 9. Department Responsibility Matrix（RD2e-b0B-A・docs 契約）

| 部門 | 役割 | 責務 |
|---|---|---|
| **Mobility** | R（owning） | calendar guard / minute epoch / bounds / instantMinusMinutes 契約 |
| **Context/Temporal** | C | arrival provenance / fixedness / scopeKey / canonical 供給 |
| **Permission** | C | currentLocation 不使用・origin opaque・internal-only |
| **Risk** | C | fail-closed / uncomputed 優先順位 / range guard / 捏造禁止 |
| **CEO** | A | RD2e-b 実装 GO・RC2a 接続 GO（別） |

---

## 10. RD2e-b 実装 GO 可否 自己判定

- 7 ブロッカーは本書で**全確定**（calendar/seconds=00/bounds/buffer binding/arrival provenance/uncomputed 優先順位/test plan）。自己発見 4 点（minute epoch・range guard・単一 scopeKey・composition 等価）で堅牢性を上げた。
- RD2e-b の新規面積は **`instantMinusMinutes`（pure 整数算術）+ leaveByAdapter（gate 合流）+ 入力型 2 つ（Buffer/Arrival）**。既存実装済部品（value 二鍵・leaveBy 型/walker・buffer catalog）の合流ゆえ外科的。
- 残リスクは civil 算術の月末/閏/年跨ぎ正確性のみ → property tests #1-12 で固める。
- **RD2e-b は実装可能水準**。ただし GO は CEO 専管。本書はコードを含まない。
