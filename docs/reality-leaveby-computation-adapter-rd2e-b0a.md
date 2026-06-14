# RD2e-b0A — LeaveBy Adapter: duration value / buffer catalog / subtraction / walker 精緻化（docs-only）

- 日付: 2026-06-14 / 作成: leaveBy adapter 精緻化セッション
- 位置づけ: RD2e-b0（`09bd5ebe`）の方向は正しいが、**duration 値の供給元・over-precision・buffer catalog・subtraction algorithm・RD2e-a walker hole** が曖昧/未定義（GPT 監査 + 独立 adversarial verify `wf_20a3e3bb`）。RD2e-b 実装前に確定する。
- 規律: **コードを書かない**（docs-only）。adapter 実装・provider 接続・currentLocation・weather・RC2a・UI・production には進まない。
- 上流: RD2e-b0 `09bd5ebe` + RD2e-a `1eab2900`（型 + walker）。

---

## 0. 独立検証で見つけた 2 つの構造ギャップ（GPT を超える発見・CEO ①⑦）

adversarial verify（`wf_20a3e3bb`）が GPT 指摘外の重大ギャップを 2 件発見:

1. **duration 値のチャネルがどこにも存在しない（high・blocker）**: `RouteEtaProviderResultV0` も `RouteEtaCapabilityV0` も **bool（durationSignalPresent/timeEstimateUsableForPlanning）と enum/opaque ref のみ**で、**所要の minutes を一切持たない**（leak 規律で raw を排除してきた帰結）。`leaveBy = arrival − duration − buffer` の **duration 項に供給元がない** → RD2e-b は現状の型では計算不能。
2. **RD2e-b0 doc の `makeRealityInstantJst` 再利用は誤り（high）**: 同 helper は **Date を取り getTime/getTimezoneOffset を使う impure**（pure core の IO scan で禁止）→ RD2e-b は新規 pure `instantMinusMinutes` が必要（§4）。

→ **duration 値は capability に混ぜず、private coordinate handle と同型の internal-only 並行チャネル**で供給する（§1）。これは別 slice（RD2d-b-VALUE・§7）。

---

## 1. Planning-grade time estimate value contract（CEO 必須 1・§0-1 反映）

`leaveBy` 計算へ渡してよい **internal-only な duration 値オブジェクト**:

```
PlanningGradeTimeEstimateForLeaveByV0 = {
  schemaVersion: 0;
  timeEstimateRef: string;            // opaque ref（capability/識別）
  kind: "point" | "range" | "upper_bound" | "scheduled" | "user_confirmed";
  durationUpperBoundMinutes: number;  // **integer ≥ 0**・leaveBy が使う保守端
  durationLowerBoundMinutes: number | null;  // range のみ
  unit: "minutes";
  durationBasis: PlanningGradeTimeSource;  // external_route/scheduled/user_confirmed/cached_route（heuristic/none 不可）
  sourceRefs: ReadonlyArray<string>;  // opaque
  evidenceRefs: ReadonlyArray<LeaveByEvidenceRef>;
  freshnessRef: string;               // fetchedAt 相当（fresh 必須）
  scopeRef: string;                   // 対象 trip(origin/dest/mode/arrival)への束縛
  confidence: LeaveByConfidence;
  usableForLeaveByComputation: boolean;  // = capability.timeEstimateUsableForPlanning（独立 source of truth にしない）
  displayPolicy: "internalReference" | "debugOnly";  // **internal only**
}
```

- **不変条件**:
  - **`durationSignalPresent` だけ / heuristic / stale / unknown freshness からは作れない**（usableForLeaveByComputation false → 値オブジェクトを leaveBy に渡さない）。
  - **`durationUpperBoundMinutes` は integer**（`Number.isInteger`・fractional 23.4567 は COORD_PATTERN を誤発火させる + false precision・§2）。
  - `usableForLeaveByComputation` は **capability の `timeEstimateUsableForPlanning` と一致**（DAG と別 source にしない・overclaim 防止）。
  - **INV-DURATION-INTERNAL**: 値オブジェクトは **capability の JSON identity に nest しない**（capability=flags のまま・consumer-safe byte-for-byte 維持）・**consumer payload に出さない**・raw provider payload/route response を持たない。
  - scopeRef で **その trip 専用**（別 trip に流用しない）。

---

## 2. duration value safety（CEO 必須 2・over-precision 裁定）

point ETA は **median**（中央値）→ そのまま使うと **約 50% 遅刻**。leaveBy は「行動に最も近い派生量」ゆえ最も保守的に:

| kind | leaveBy が使う duration |
|---|---|
| `range` | **upper bound（遅い端）**（= 早い出発 = 安全） |
| `upper_bound` | そのまま |
| `point` | **そのまま使わない** → point を保守膨張（point + margin・ceil 5min）し、**かつ buffer bucket を 1 段上げる（small→medium 必須）** |
| `scheduled`（時刻表） | authoritative point として可（統計 median でない） |
| `user_confirmed` | authoritative point として可 |

- **絶対則**: **average duration / heuristic duration / stale cache duration から leaveBy を作らない**。**provider の point median を最新の安全線にしない**。**5 分粒度に ceil**（false minute precision を作らない）。
- **walker 不変条件**: `kind==='point' && bufferCoarseBucket==='small'` は **violation**（最も危険な組合せを禁止）。

---

## 3. buffer bucket → minutes catalog（CEO 必須 3・固定 catalog）

**動的計算せず固定 catalog lookup**（const 化・例外なし）:

| bucket | minutes（v0 conservative・integer） |
|---|---|
| `small` | **5** |
| `medium` | **15** |
| `large` | **30** |
| unknown | **uncomputed**（silent 0 にしない） |

- **絶対則**: dynamic calculation なし・weather delay 加味なし（HOLD）・user-facing copy なし。policy 解決器が bucket を選び、**固定 catalog が分に写す**（精密分数を捏造しない）。source/evidence/confidence は値オブジェクト/buffer に保持。bucket→minutes は identity に入れてよい（固定写像）が computedAt とは分ける。

---

## 4. absolute instant subtraction contract（CEO 必須 4・新規 pure 演算）

`leaveByInstant = arrivalTargetInstant − durationUpperBoundMinutes − bufferMinutes`（全て分・絶対 instant・JST）。

- **新規 pure `instantMinusMinutes(instantISO, minutes)`**（`makeRealityInstantJst` は impure ゆえ使わない）:
  - **closed-form epoch-minute 演算**（Date 不使用・day-number 算法で年月日→通日→分、減算、再構成）。
  - 入力 ISO は **canonical `YYYY-MM-DDTHH:MM:SS+09:00`**（§5 regex）。出力も同形・zero-padded。
- **安全条件（table）**:

| 条件 | 規律 |
|---|---|
| duration unit | integer minutes ≥ 0（負/非整数 → uncomputed） |
| buffer unit | integer minutes ≥ 0（catalog 由来） |
| date crossing | **正しく扱う**（cross-midnight で前日 leaveBy・month/year rollover も） |
| invalid ISO | parse 不能 → uncomputed（throw しない・raw を出さない） |
| negative duration | 防止（≥0 のみ） |
| leaveBy ≤ arrival | post-check（leaveBy が arrival 後 → violation/uncomputed） |
| DST | JST v0 は DST なし → **型で +09:00 固定**（他 offset 禁止） |
| monotonicity | duration/buffer が増えると leaveBy は**早くなる**（property test 必須） |
| computedAt | identity 対象外 |

---

## 5. RD2e-a walker 確認（CEO 必須 5・HOLE 確定 → RD2e-a-A micro-fix 候補）

**監査確定**: `leaveByComputationViolations`（`leaveByComputation.ts`）は **`leaveByInstant.instant <= arrivalTargetInstant` を検証していない**（instant の空/`T` 有無のみ）。`createComputedLeaveBy` は任意 instant を受けるので、**arrival 後の leaveBy が素通り**する（real hole）。

→ **RD2e-a-A walker micro-fix 候補（RD2e-b 実装前に CEO GO 推奨）**:
- **canonical JST ISO regex**（`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$`）を leaveByInstant.instant / arrivalTargetInstant / evaluatedAt に強制（**これで lexicographic 比較 = 時系列比較が健全**・JST 固定 offset・DST なし）。
- **`leaveByInstant.instant <= arrivalTargetInstant`**（equality 可・after は violation）— lexicographic string 比較（Date 不使用・canonical 前提）。
- **cross-midnight の leaveBy 日付は violation でない**（前日出発を許す・fixture で確認）。
- 任意: evaluatedAt ordering。
- source-scan test #15/#19（Date/IO なし）を green 維持。

> RD2e-a-A は walker + 型 + fixtures のみ（計算しない）。RD2e-a が任意 instant を受ける schema slice ゆえ、walker が強くないと負 duration/sign-bug leaveBy を backstop できない。

---

## 6. currentLocation no-use（CEO 必須 6・RD2e-b0 にも明文化）

- **RD2e-b adapter は currentLocation input を受け取らない**。
- **`current_location_candidate` origin は uncomputed**（RD2e-a 裁定 A・型 + walker で二重排除）。
- **geolocation import 禁止・browser location 禁止**。
- currentLocation を **sourceTimeEstimate / origin に混ぜない**。
- future **RD2e''（imminent window + currentLocation gate）まで HOLD**。

---

## 7. 前提 slice（RD2e-b 実装前に必要・各々別 CEO GO）

| slice | 内容 | severity |
|---|---|---|
| **RD2d-b-VALUE**（新・監査発見） | provider result/adapter に **internal duration value channel**（`PlanningGradeDurationValueV0`・integer minutes・upper bound）を追加。capability に nest せず並行 return（capability=flags 維持）。leak guard は minutes(integer)を許容しつつ raw scan 継続。**設計確定: `docs/reality-route-eta-duration-value-rd2d-b-value-0.md`（二鍵設計）** | **high（RD2e-b の blocker・設計 done）** |
| ~~**RD2e-a-A**（walker micro-fix）~~ **完了（`9995d752`）** | §5: canonical JST ISO regex + leaveBy ≤ arrival + cross-midnight 許可 + computedAt canonical + displayPolicy visible 禁止。29/29 tests・194/194 併走・tsc 55 | ✅ DONE |
| **RD2d-b-B**（既存 chip `task_e7d407ec`） | adapter provider-exception guard + leak pattern 統一 | provider 拡張前必須 |

- **推奨順**: RD2e-a-A（walker 締め）→ RD2d-b-VALUE（duration 値チャネル）→ RD2e-b（adapter・subtraction）→ RC2a 接続 → RD2e'（weather）→ RD2e''（currentLocation・最後）。

---

## 8. Department Responsibility Matrix（RD2e-b0A・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Mobility** + **Build**（duration value/subtraction の technical safety） |
| consultedDepartments | Permission（origin temporal/currentLocation HOLD）・Communication（departure line 分離）・Risk（over-precision/遅刻/stale）・Context（arrival/weather HOLD） |
| blockingDepartments | **CEO**（RD2d-b-VALUE/RD2e-a-A/RD2e-b 各 GO・weather/currentLocation/delivery 別 gate）+ Permission + production gate |
| outputs | RD2e-b0A 設計（duration value contract・over-precision 裁定・buffer catalog・subtraction contract・RD2e-a walker hole + RD2e-a-A 候補・currentLocation no-use・前提 slice）。**コードなし** |
| safetyGate | **duration 値は internal-only 並行チャネル（capability に nest しない・consumer 不露出・integer minutes）**・**over-precision 禁止（point median をそのまま使わない・upper bound/保守膨張 + buffer 1 段上げ・5 分 ceil）**・**buffer は固定 catalog（dynamic 禁止・weather HOLD・unknown→uncomputed）**・**新規 pure instantMinusMinutes（makeRealityInstantJst 不使用・Date 不使用・canonical ISO・date 跨ぎ・負 duration 防止・leaveBy ≤ arrival・monotonicity）**・**RD2e-a walker に leaveBy ≤ arrival + canonical ISO を追加（RD2e-a-A）**・**currentLocation 不使用/不取得**・production gate 未通過 |
| traceRefs | RD2e-a leaveBy 型/walker / RD2d-a-A capability(flags) / 既存 leak guard(COORD_PATTERN) / realityInstant(impure・consume せず) |

---

## 9. RD2e-b 実装 GO 可否の自己判定

- **判定: RD2e-b はまだ GO 不可**。監査が **duration 値チャネル不在（RD2d-b-VALUE）**と **RD2e-a walker hole（RD2e-a-A）**を発見 → これらが**前提 slice**。RD2e-b0A で設計前提（value contract・over-precision・catalog・subtraction・walker）は確定したが、**前提 2 slice を先に**。
- **推奨**: RD2e-a-A（walker 締め・小）→ RD2d-b-VALUE（duration 値チャネル）→ RD2e-b（adapter）。各々 CEO GO。
- 革新点（CEO ⑥⑦）: **duration 値を capability に混ぜず internal-only 並行チャネル化**（flags=consumer-safe / value=server-only computation fuel の分離）+ **over-precision を「median を使わない・upper bound + 保守 buffer + 5 分 ceil」で構造排除** + **pure closed-form 時刻演算（impure helper を排除）**。「古い/楽観的所要 + 精密 buffer 捏造」で遅刻させる事故を、value contract + subtraction contract + walker で多層に防ぐ。捏造しない reality OS を**移動の最終行動時刻**まで貫く。
- code 変更ゼロ・UI/storage/API/DB write/location/notification/external read 不接触・tree clean・production gate 未通過。
