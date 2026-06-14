# RD2e-b0 — LeaveBy Computation Adapter Design（設計提出のみ・コード禁止）

- 日付: 2026-06-14 / 作成: leaveBy computation adapter 設計セッション
- 位置づけ: RD2e-a（`1eab2900`）で `LeaveByComputationV0`（leaveBy instant の型 + walker）を確定した。RD2e-b0 は **実 leaveBy instant を計算する adapter** をどう設計するか — capability 入力・arrivalTargetInstant/buffer の供給元・origin temporal validity・absolute instant 減算・JST/date 跨ぎ・computedAt identity 外・no currentLocation/no user-facing — を確定する。
- 規律: **コードを書かない**（docs-only）。実減算 adapter・route/timeEstimate provider 接続・RC2a/MovementReality 変更・departure line・user-facing copy・notification・currentLocation 取得・production には進まない。
- 上流: RD2e-a `1eab2900`（型 + walker）+ RD2e-0A 補正（`cab4df6e`）+ RD2d-a-A/a-B（capability）。

---

## 0. 前提を疑う（CEO ① — adapter は「減算」でなく「全 precondition の合流 + 1 回の絶対時刻演算」）

leaveBy adapter は単純な「− 算」でなく、**全 precondition（planning-grade time estimate・arrival target・buffer・origin temporal validity・freshness）を合流させ、揃った時のみ 1 回の絶対 instant 演算**を行う。揃わなければ uncomputed（fake leaveBy を作らない・RD2e-a walker が backstop）。

> adapter は **`createComputedLeaveBy`（planning-grade source/非 current_location origin のみ受理）を呼べる時だけ呼ぶ**。precondition が欠ければ `createUncomputedLeaveBy`。RD2e-a の型制約が「heuristic/none/current_location から leaveBy」を構造排除し、adapter walker が forged を検出。

---

## 1. timeEstimateUsableForPlanning capability をどう入力にするか（CEO 論点）

- 入力は **`RouteEtaCapabilityV0`**（RD2d-a-A・依存注入で受け取る・adapter は capability を作らない）。
- adapter は capability から:
  - `planning.timeEstimateUsableForPlanning === true` を **gate**（false → uncomputed）。
  - `duration.durationBasis`（planning-grade か）→ `PlanningGradeTimeSource` に写像（heuristic/none → uncomputed）。
  - `sourceTimeEstimateRef` ← capability の evidence/identity（opaque ref・raw 座標なし）。
  - freshness（capability は fresh + fetchedAtRef を要求済・RD2d-a-B）→ stale なら uncomputed。
- **絶対則**: **`durationSignalPresent` だけ / `arrivalProjectionKnown` だけでは computed しない**（`timeEstimateUsableForPlanning` のみ）。heuristic capability → uncomputed。

---

## 2. arrivalTargetInstant の供給元（CEO 論点）

- arrivalTargetInstant = 到着すべき**絶対時刻** = **event startTime + fixedness**（event anchor 由来・依存注入）。
- 供給: event の subjectiveDate + startTime（HH:MM）を **JST 絶対 instant に変換**（§5）。fixedness が soft なら confidence を下げる。
- arrival target 不明（startTime なし）→ uncomputed（何時までに着くか不明）。
- arrivalTargetInstant は `LeaveByTimeContractV0` に載る（identity-bearing）。

---

## 3. bufferPolicy の供給元（CEO 論点）

- buffer = **buffer policy 解決器（依存注入）**が verb/rigidity/mode から `LeaveByBufferPolicyV0`（bufferPolicyId/Kind/coarseBucket/evidence/confidence/staleness）を返す。
- adapter は buffer policy を**計算しない**（注入された policy を consume）。buffer 解決不能 → uncomputed。
- **粗い bucket（small/medium/large）→ 分換算は policy 解決器の責務**（adapter は bucket → 分の coarse 変換をするが、精密分数を捏造しない・保守値）。weather friction は v0 加味しない（RD2e-0 §8 HOLD）。

---

## 4. originTemporalValidity の扱い（CEO 論点・RD2d-0A §6 + RD2e-a 裁定 A）

- origin = RD2c `OriginInferenceV0`（依存注入）。adapter は origin の **出発時刻妥当性**を見る:
  - `user_confirmed_origin` / `previous_event_end` → `ComputedOriginKind` に写像・evidence あり → 可。
  - `home_assumed` / `work_assumed` → assumed（可・confidence 下げる）。
  - **`current_location_candidate` → RD2e-b でも不可**（RD2e-a 裁定 A・uncomputed）。
- **絶対則**: **currentLocation を出発 origin にしない**（取得もしない）。origin evidence なし → uncomputed。

---

## 5. absolute instant subtraction（CEO 論点・核心演算）

- leaveByInstant = **arrivalTargetInstant − travelDurationMinutes − bufferMinutes**（全て絶対 instant 上で・JST）。
- **絶対則（時間契約）**:
  - **絶対 instant で演算**（minuteOfDay/HH だけで計算しない）。
  - **date 跨ぎを正しく扱う**（前日 23:50 出発等）。
  - **JST 固定**（browser local TZ 禁止・§6）。
  - travelDurationMinutes は **planning-grade estimate**（capability から・heuristic 不可）。
  - bufferMinutes は **粗い bucket → 保守的分**（精密捏造しない）。
- 演算は **純粋な時刻計算**。**⚠ RD2e-b0A 補正（監査 wf_20a3e3bb）**: 既存 `makeRealityInstantJst` は **Date を取り getTime/getTimezoneOffset を使う impure** ゆえ pure core で使えない（IO scan 禁止）。RD2e-b は **新規 pure `instantMinusMinutes`（closed-form epoch-minute 演算・Date 不使用）**を作る（RD2e-b0A §4）。

---

## 6. timezone / JST / date 跨ぎ（CEO 論点）

- **v0 は JST 固定**（`LeaveByTimezone="JST"`・`LeaveByInstantV0.timezone="JST"`）。**browser local timezone / Date local getter を使わない**（既存 realityInstant の JST 規律を consume・依存注入）。
- subjectiveDate（JST 主観日）+ targetEventDate を `timeContract` に載せ、**date 跨ぎを無視しない**（leaveBy が前日になるケースを正しく表現）。
- instant は ISO 絶対（+09:00 offset）・minuteOfDay だけにしない。

---

## 7. computedAt identity 外（CEO 論点）

- `computedAt` = 計算時刻（再計算で変わる）→ **identity 対象外**（timeContract に含めない・RD2e-a walker が enforce 済）。
- identity-bearing は `timeContract`（origin/dest/mode/arrival/subjectiveDate）+ source。computedAt は top-level で識別子に使わない。
- adapter は computedAt を注入された clock-ref（依存注入・pure 化のため外部供給）から載せる。

---

## 8. no currentLocation / no user-facing / no notification（CEO 論点・絶対境界）

- **currentLocation 取得なし・geolocation なし**（origin に current_location_candidate を使わない・§4）。
- adapter は **leaveByInstantComputed（internal）まで**。**departure line / user-facing copy / notification / proposal / action を作らない**（RJ2e/Permission/delivery の別 gate）。
- `leaveByInstantComputed=true` は display/action を含意しない（RD2e-a internal-only）。

---

## 9. fake 禁止 field（絶対境界）

| 禁止 | 内容 |
|---|---|
| fake leaveBy | precondition 欠落で computed しない（uncomputed） |
| stale leaveBy | stale time estimate/origin/buffer で computed しない |
| heuristic leaveBy | heuristic capability から computed しない |
| browser local time | JST 固定・local TZ getter 不使用 |
| minuteOfDay 演算 | 絶対 instant で計算（date 跨ぎ込み） |
| currentLocation | 取得しない・leaveBy origin にしない |
| 精密 buffer | 根拠なき精密分数を出さない（粗い bucket + 保守値） |
| weather delay | 分単位 delay を加味しない（v0 HOLD） |
| departure line/copy/notification | 作らない（別 gate） |
| raw 座標/route response | leaveBy に載せない |

---

## 10. RD2e-b 実装候補（次段・各々別 GO）

| slice | 内容 | 接続 |
|---|---|---|
| **RD2e-b** | `leaveByComputationAdapter`（pure・依存注入: capability/event arrival/buffer policy/origin/JST clock・全 precondition 合流 + 絶対 instant 演算 → LeaveByComputationV0）+ test | なし |
| **RD2e'**（weather friction・別 GO） | buffer に weather friction を qualitative 加味（JMA consume・分 delay 断定しない） | weather（gate） |
| **RC2a 接続**（別 GO） | leaveBy → movementReality（honest 維持） | なし |
| **RD2e''**（currentLocation origin・別 GO・最後） | imminent window + currentLocation gate（accuracy/freshness/evidence）→ leaveBy origin | currentLocation（gate） |
| **departureLineBoundary / delivery**（別 GO・最後） | leaveBy instant → departure line copy / user-facing / notification | RJ2e/Permission/RJ2f（gate） |

- **推奨**: RD2e-b（pure adapter・依存注入）→ RC2a 接続 → RD2e'（weather）→ RD2e''（currentLocation・最後）→ departure/delivery（最後・別 gate）。

---

## 11. Department Responsibility Matrix（RD2e-b0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Mobility**（leaveBy adapter 設計）+ **Build**（絶対時刻演算/合流の technical safety） |
| consultedDepartments | Permission（origin temporal/currentLocation HOLD）・Communication（departure line 分離）・Risk（stale/遅刻/buffer）・Context（arrival target/weather HOLD） |
| blockingDepartments | **CEO**（RD2e-b 実装 GO・weather/currentLocation/delivery は別 gate）+ Permission + production gate |
| outputs | RD2e-b0 設計（capability 入力・arrival/buffer/origin 供給元・absolute instant 減算・JST/date 跨ぎ・computedAt identity 外・no currentLocation/user-facing・RD2e-b 候補）。**コードなし** |
| safetyGate | **全 precondition 合流時のみ computed（fake leaveBy なし）**・**timeEstimateUsableForPlanning のみ（signal/projection だけ/heuristic 不可）**・**stale で computed しない**・**絶対 instant で演算（minuteOfDay/HH 不可・date 跨ぎ込み・JST 固定・browser TZ 不使用）**・**currentLocation を origin にしない・取得しない**・**buffer は粗い保守値（精密捏造なし・weather HOLD）**・**leaveByInstantComputed internal-only（departure line/copy/notification/action は別 gate）**・computedAt identity 外・raw 不露出・production gate 未通過 |
| traceRefs | RD2e-a leaveBy 型 / RD2d-a-A capability / RD2c origin / RD2d-0A §6 origin temporal / 既存 realityInstant JST |

---

## 12. 自己判定

- **RD2e-b0 は設計 ready**。adapter は **全 precondition の合流器**（単純 − 算でない）。RD2e-a の型制約（planning-grade/非 current_location のみ）+ walker が「heuristic/stale/current_location/fake」leaveBy を構造排除し、adapter は **揃った時だけ 1 回の絶対 instant 演算**。
- **RD2e-b 実装 GO は CEO 専管**。pure adapter（依存注入・絶対 instant・JST）を先に・weather/currentLocation/delivery は各々別 gate（最後）。
- 革新点（CEO ⑦）: **leaveBy adapter を「合流 + 絶対時刻演算」として最厳格に gate** — capability(timeEstimateUsableForPlanning) × arrival target × buffer evidence × origin temporal validity × JST 絶対 instant の **5 入力を全て揃え、1 つでも欠けたら uncomputed**。「古い所要 / 勝手な現在地 / minuteOfDay 計算 / browser TZ / 精密 buffer 捏造」で遅刻させる事故を、RD2e-a の型 + walker + adapter の合流規律で多層に構造排除。捏造しない reality OS を**移動の最終行動時刻**まで貫く。
- code 変更ゼロ・UI/storage/API/DB write/location/notification/external read 不接触・tree clean・production gate 未通過。
