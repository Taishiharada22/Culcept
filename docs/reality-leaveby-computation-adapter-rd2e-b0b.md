# RD2e-b0B — LeaveBy Adapter Final Implementation Design（設計提出のみ・コード禁止）

- 日付: 2026-06-15 / 作成: RD2d-b-VALUE 実装完了（`c99afd46`）を受けた leaveBy adapter 実装直前設計
- 位置づけ: RD2e-b0（`docs/reality-leaveby-computation-adapter-rd2e-b0.md`）+ RD2e-b0A（同 `-rd2e-b0a.md`）の設計を、**実装済の二鍵 duration value channel**（`lib/plan/realityCore/routeEtaDurationValue.ts`）と**実装済の leaveBy computation 型/walker**（`lib/plan/realityCore/leaveByComputation.ts`・RD2e-a/a-A）の上に**接地**させ、RD2e-b で書くコードの shape を確定する。
- 規律: **コードを書かない**（docs-only）。leaveBy 実計算・currentLocation・departure line・notification・RC2a・UI・production には進まない。本書は RD2e-b 実装 GO の前提資料。
- 上流の確定事実:
  - **二鍵 value 実装済（`c99afd46`）**: `PlanningGradeDurationValueV0`（`durationUpperBoundMinutes` integer/%5・server-only）+ `bindDurationValueToCapability(value, capability) → {matched, violations, usableAfterBinding}`。
  - **leaveBy 型/walker 実装済（RD2e-a/a-A）**: `LeaveByComputationV0`・`createComputedLeaveBy`/`createUncomputedLeaveBy`・`leaveByComputationViolations`・`isCanonicalJstIso(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/)`・`leaveByAtOrBeforeArrival(a,b)=a<=b`（lexicographic）。
  - **buffer catalog 確定（RD2e-b0A §3）**: `small=5` / `medium=15` / `large=30`（minutes・固定 catalog・provider 任意値禁止）。

---

## 0. 前提を疑う（CEO ① — RD2e-b は「減算器」ではなく「二鍵照合 → 1 回の絶対時刻演算 → fail-closed 着地」）

`leaveBy = arrival − duration − buffer` は一見ただの引き算だが、危険は**引き算そのものではなく前提の検証漏れ**にある。RD2e-b の本質は:

1. **二鍵照合**（capability flag + value full-basis binding が揃うかを `bindDurationValueToCapability` で再確認）。揃わなければ即 `uncomputed`。
2. **全 precondition の合流**（arrivalTargetInstant 存在・canonical JST・originTemporalValidity・buffer catalog 値）。
3. **1 回の絶対時刻演算**（`instantMinusMinutes` を **Date を使わず** civil-date 算術で実行）。
4. **fail-closed 着地**（いずれか欠けたら数値を捏造せず `uncomputed`・尊厳は保つが行動指示はしない）。

→ adapter は「duration があるから引く」のではなく「**二鍵が揃い、かつ全 precondition が揃ったときだけ 1 回だけ引く**」。

---

## 1. capability + durationValue binding verification（CEO 必須・二鍵照合）

RD2e-b の入力は **(capability, durationValue, arrivalTargetInstant, bufferBucket, originTemporalValidity)**。最初の門は二鍵照合:

```
const bind = bindDurationValueToCapability(durationValue, capability);
if (!bind.usableAfterBinding) return createUncomputedLeaveBy("two_key_unsatisfied", ...);
```

- `usableAfterBinding` = `matched`（full basis 一致）∧ `value.usableForLeaveByComputation` ∧ `capability.planning.timeEstimateUsableForPlanning`。**短縮 key 一致だけでは通さない**（RD2d-b-B 補正・実装済）。
- `durationValue === null` → 即 `uncomputed("no_duration_value")`。capability だけでは minutes が無い（flag-only）。
- **value 単体の `usableForLeaveByComputation=true` を信用しない**: 必ず `bindDurationValueToCapability` を**再実行**して capability と照合する（value の自己申告フラグを bypass しない）。
- binding mismatch（`bind.matched=false`）→ `uncomputed("binding_mismatch")`・`bind.violations`（field 名のみ・raw echo なし）を trace に残す。

**不変条件**: capability と value が**別供給元由来**（例: 古い value + 新しい capability）でも、full basis 不一致で弾かれる。これが「数値あるが能力なし / 能力あるが数値なし」両方の捏造を排除する核心。

---

## 2. arrivalTargetInstant supply（CEO 必須）

- arrivalTargetInstant は **canonical JST ISO**（`isCanonicalJstIso` green）で供給される確定到着目標。供給元は RD2d-0A の temporal scope（event anchor の到着目標）であり、**currentLocation でも provider でもない**。
- 非 canonical / null → `uncomputed("arrival_target_missing")`。
- arrivalTargetInstant は capability.identity の `subjectiveDate` と同日であること（date 跨ぎ整合・§5）。不一致は `uncomputed("arrival_date_mismatch")`。
- arrivalTargetInstant は **leaveBy adapter の入力**であって adapter が生成しない（RD2e-b は時刻を「作らない」・引くだけ）。

---

## 3. buffer catalog consume（CEO 必須・RD2e-b0A §3 固定 catalog）

- 入力は **bufferBucket: `"small" | "medium" | "large"`**（離散・provider 任意分数値を受けない）。
- adapter は固定 catalog で minutes に解決: `{ small: 5, medium: 15, large: 30 }`。**catalog 外/null → `uncomputed("buffer_unknown")`**。
- buffer minutes は integer・%5===0（catalog がそう保証）。duration upper bound（%5）と合算しても %5 を保つ。
- **buffer を provider/LLM が動的供給しない**（catalog のみ）。これにより leaveBy の保守性（常に safe な余裕）を型で保証。

---

## 4. origin temporal validity（CEO 必須・RD2d-0A §6 + RD2e-a 裁定 A）

- `originTemporalValidity`: origin が **arrivalTargetInstant の計画時点で有効**か（過去観測の使い回し防止）。`valid | stale | unknown`。
- `stale | unknown` → `uncomputed("origin_temporal_invalid")`。leaveBy は「どこから出るか」が時間的に妥当でなければ計算しない。
- **currentObservationOverrodeConfirmed は常に false**（RD2c・現在観測が user 確認 origin を上書きしない）。違反は `uncomputed`。
- origin conflict（capability.originConflict.originConflictStatus === "conflict"）→ そもそも `capability.leaveBy.leaveByComputable=false` ゆえ §1 で弾かれるが、adapter でも明示再確認（defense in depth）。

---

## 5. instantMinusMinutes pure helper（CEO 必須・核心演算・Date 不使用）

RD2e-b 唯一の新規算術。**`new Date(` / `Date.now` を使わない**（realityCore 純度・resume 安全）。canonical JST ISO 同士なので timezone 変換不要（全て +09:00 固定）。

**契約**: `instantMinusMinutes(instant: string /* canonical JST ISO */, minutes: number /* integer>=0 */): string | null`
- 非 canonical instant / 非 integer minutes / minutes<0 → `null`（呼び出し側で `uncomputed`）。
- 返り値も canonical JST ISO（`isCanonicalJstIso` green）。

**アルゴリズム（pure civil-date 算術・Howard Hinnant days_from_civil）**:
1. 正規表現で `Y, Mo, D, h, m, s` を整数抽出。
2. `days = daysFromCivil(Y, Mo, D)`（閏年含む確定式・分岐のみ・浮動小数なし）。
3. `totalSeconds = days*86400 + h*3600 + m*60 + s`。
4. `totalSeconds -= minutes*60`。
5. `civilFromDays(floor(totalSeconds/86400))` で `Y',Mo',D'` を逆算、剰余で `h',m',s'`。
6. zero-pad して canonical JST ISO 文字列を再構成（`+09:00` 固定）。
- **date 跨ぎ**（深夜出発が前日になる）も civil 算術で正しく処理。`leaveByAtOrBeforeArrival(leaveBy, arrival)` で leaveBy ≤ arrival を最終 assert（RD2e-a-A 実装済・lexicographic 比較ゆえ canonical 同士で chronological）。
- 合算減算は **一度だけ**: `leaveByInstant = instantMinusMinutes(arrivalTargetInstant, durationUpperBoundMinutes + bufferMinutes)`。duration と buffer を別々に 2 回引かない（丸め二重適用回避・両者 %5 ゆえ和も %5）。

---

## 6. uncomputed fallback（CEO 必須・fail-closed）

- 上記いずれかが欠けたら `createUncomputedLeaveBy(reason)` を返す。**数値を捏造しない**・**leaveByInstant を null のまま**にする。
- reason taxonomy（safe code のみ・raw echo なし）: `no_duration_value` / `two_key_unsatisfied` / `binding_mismatch` / `arrival_target_missing` / `arrival_date_mismatch` / `buffer_unknown` / `origin_temporal_invalid` / `origin_conflict` / `subtraction_failed`。
- `instantMinusMinutes` が null（理論上 canonical 検証後は起きないが backstop）→ `uncomputed("subtraction_failed")`。
- `leaveByComputationViolations`（RD2e-a 実装済）で出力を walker。leaveBy>arrival / 非 canonical / displayPolicy visible は **fail-loud**（捏造を emit しない）。

---

## 7. 絶対境界（CEO 必須・no currentLocation / no user-facing / no notification / no RC2a）

RD2e-b が **してはいけない**こと（型/実装で封じる）:
- **currentLocation を読まない / navigator / geolocation を使わない**（origin は供給済の opaque・現在地観測を新規取得しない）。
- **user-facing copy を生成しない**（leaveByInstant は internal computation object・displayPolicy=hidden 固定・RD2e-a-A walker が visible を禁止）。
- **notification / push を出さない**。
- **departure line（出発線の演出）を作らない**（leaveBy 計算 ≠ departure line・後者は別 gate）。
- **RC2a / MovementReality に接続しない**（leaveBy object を返すのみ・consume は別 GO）。
- **external route API を叩かない**（duration は供給済 value・adapter は算術のみ）。
- **Date.now / new Date / Math.random を使わない**（civil 算術のみ）。

---

## 8. RD2e-b 実装候補（次段・CEO GO 必須）

| slice | 内容 | 新規 |
|---|---|---|
| **RD2e-b** | `leaveByAdapter`（pure）: 二鍵照合 → precondition 合流 → `instantMinusMinutes` 1 回 → `createComputedLeaveBy` or `createUncomputedLeaveBy` + walker。`instantMinusMinutes`（civil 算術 pure helper）+ buffer catalog resolve。 | `lib/plan/realityCore/leaveByAdapter.ts` + `tests/unit/leaveByAdapter.test.ts` |
| **RD2e-b'** | （将来）leaveBy object の consume（departure line / proposal）— **別 GO・本 slice 外** | — |

**RD2e-b 実装 GO 条件（必須チェックリスト）**:
- 入力 (capability, durationValue, arrivalTargetInstant, bufferBucket, originTemporalValidity) のみ。currentLocation 取得なし。
- `bindDurationValueToCapability` を**必ず再実行**（value 自己フラグを信用しない）。
- `instantMinusMinutes` は Date 不使用・canonical in/out・date 跨ぎ正・null fail-closed。
- 1 回減算（duration+buffer 和）・leaveBy≤arrival assert・walker green。
- uncomputed fallback 全 reason・数値捏造なし・displayPolicy hidden。
- no user-facing / no notification / no departure line / no RC2a / no external。
- tests: 二鍵満足→computed / 二鍵不満足→uncomputed / binding mismatch→uncomputed / null duration→uncomputed / buffer 各 bucket / arrival 非 canonical→uncomputed / origin stale→uncomputed / date 跨ぎ減算正 / leaveBy≤arrival / 1 回減算（二重丸めなし）/ source-scan（Date/navigator/notification なし）/ tsc 55。

---

## 9. Department Responsibility Matrix（RD2e-b0B・docs 契約）

| 部門 | 役割 | RD2e-b0B での責務 |
|---|---|---|
| **Mobility** | R（owning） | leaveBy adapter 算術・二鍵照合・instantMinusMinutes・buffer catalog |
| **Context/Temporal** | C | arrivalTargetInstant 供給契約・originTemporalValidity・canonical JST |
| **Permission** | C | origin opaque 規律・currentLocation 不使用の保証 |
| **Risk** | C | fail-closed 着地・uncomputed taxonomy・捏造禁止 |
| **Communication** | C | leaveBy object が user-facing でないことの保証（displayPolicy hidden） |
| **CEO** | A（承認） | RD2e-b 実装 GO・RC2a 接続 GO（別） |

---

## 10. 自己判定

- RD2d-b-VALUE 実装（`c99afd46`）で **duration の数値供給**が確立し、二鍵照合 primitive（`bindDurationValueToCapability`）も実装済。leaveBy adapter は **既存の実装済部品（value + leaveBy 型/walker + buffer catalog）の合流 + 1 個の新規 pure 算術（`instantMinusMinutes`）** だけで構成でき、新規面積が小さい（外科的）。
- 残る唯一の実装リスクは `instantMinusMinutes` の civil 算術正確性（date 跨ぎ・閏年）。これは Date を使わず確定式で書き、date 跨ぎ/閏年/月末の test で固める。
- **RD2e-b は実装可能水準**。ただし GO は CEO 専管。本書は実装直前設計であり、コードは書いていない。
