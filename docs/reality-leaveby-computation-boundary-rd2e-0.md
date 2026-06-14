# RD2e-0 — LeaveBy Computation Boundary Design（設計提出のみ・コード禁止）

- 日付: 2026-06-14 / 作成: leaveBy computation boundary 設計セッション
- 位置づけ: RD2d 系で `leaveByComputable`（route/ETA capability の tier-1 内部計算可能性）を確定した。RD2e-0 は **`leaveByComputable=true` から実 leaveBy 時刻を作る条件**を設計する — buffer policy・arrival target・origin temporal validity・stale 拒否・departure line との分離・user-facing/notification/action gate・weather friction の扱い。
- 規律: **コードを書かない**（docs-only）。leaveBy 実装・currentLocation 取得・weather API・departure line 文面・notification・UI/RC2a 接続・production には進まない。
- 上流: RD2d-a-A `2faf8a2d`（leaveByComputable=tier-1）+ RD2d-0A `6656f0bf` §6（origin temporal validity）+ RD2-0 `39fb0144` §5（leaveBy 条件）+ RD2d-a-B `88448f61`（walker evidence）。

---

## 0. 前提を疑う（CEO ① — leaveBy 時刻は capability でなく「行動に最も近い派生量」）

`leaveByComputable`（RD2d-a-A）は「内部計算**できる**」のみ＝ tier-1。実 leaveBy 時刻（「○時○分に出る」）は**行動に最も近い派生量**で、誤れば**実世界で遅刻**させる。よって:

> **leaveByComputable=true でも、実 leaveBy 時刻を出してよいとは限らない**。実時刻の生成には arrival target・origin の **出発時刻における妥当性**・buffer policy・freshness（stale 拒否）が全て揃う必要があり、出した後も **display/action は別 gate**（RJ2/Permission/delivery）。「捏造しない reality OS」を**移動所要の最終出力**まで貫く。

leaveBy は「capability の延長」でなく「**行動境界**」。誤った確信が最も危険な層。

---

## 1. leaveByComputable から実 leaveBy 時刻を作る条件（CEO 論点・全条件 AND）

`leaveByComputable=true`（= timeEstimateUsableForPlanning ∧ arrivalTargetScoped ∧ originUsableForLeaveBy ∧ bufferKnown ∧ ¬originConflict）に**加えて**、実時刻生成は以下が**全て**必要:

1. **arrival target known**（到着すべき時刻・§3）
2. **planning-grade ETA fresh**（RD2d-a-B: fetchedAtRef 必須・stale/expired 拒否・§5）
3. **origin が出発時刻に妥当**（RD2d-0A §6: future departure で current_location 不可・§4）
4. **buffer policy known**（§2）
5. **confidence/evidence present**（各供給の evidence）

→ leaveBy 時刻 = arrival target − ETA − buffer（origin から）。**1 つでも欠ければ leaveBy 時刻 null**（leaveByComputable=true でも実時刻を出さない）。

---

## 2. buffer policy（CEO 論点・未実装・要設計）

- buffer = 到着前の余裕（準備・誤差吸収）。**verb/rigidity/mode 別**（work strict→大・social soft→小・徒歩→小・車→交通余裕）。
- **v0 は固定 conservative buffer**（過小評価で遅刻を誘発しない方を選ぶ）。buffer には **evidence**（なぜその値か）。
- **fake しない**: 根拠なき精密 buffer（「+7 分」等）を出さない。buffer は粗い保守値 + 理由。
- weather friction（§7）を **qualitative に**加味しうるが分単位 delay を断定しない。

---

## 3. arrival target（CEO 論点）

- arrival target = 到着すべき時刻。**event startTime + fixedness**（rigid event は厳守・soft は緩い）。
- arrival target 不明 → **leaveBy 時刻を出さない**（何時までに着くか不明なら逆算できない）。
- fixedness が soft なら leaveBy も「目安」扱い（断定度を下げる・RD2d-a-A の confidence と整合）。

---

## 4. origin temporal validity（CEO 論点・RD2d-0A §6 適用）

- leaveBy は**未来の出発**についての claim → origin は**出発時刻に妥当**でなければならない（評価時点でなく）。
- **`originUsabilityForLeaveBy`**（RD2d-0A §6）: 
  - `user_confirmed origin` / `previous_event_end`（chain）→ 出発時刻も妥当（可）。
  - `current_location_candidate` → **imminent departure のみ可**（future departure では移動しうるので不可）。
  - `home_assumed`/`work_assumed` → assumed（leaveBy は目安・断定しない）。
- **絶対則（CEO no currentLocation auto-use）**: **currentLocation を自動で出発 origin に使わない**。imminent + 明示 gate（RD2c origin の current_location_candidate・別 opt-in）でのみ。**勝手に「今ここから」で leaveBy を断定しない**。

---

## 5. stale route/ETA 拒否（CEO 論点）

- **stale/expired な ETA から leaveBy 時刻を出さない**（RD2d-a-B: timeEstimateUsableForPlanning は fresh + fetchedAtRef 必須）。
- cache 種別別 freshness（RD2d-0B §6: trafficEta 短命）→ stale なら leaveBy null。
- **「少し古いけど参考」で leaveBy に使わない**（古い所要で出発時刻を断定 = 遅刻リスク）。
- origin の freshness（RD2d-0A §6 `originTemporalFreshness`）も同様（古い現在地で leaveBy を出さない）。

---

## 6. departure line との分離（CEO 論点・3 層分離）

leaveBy には RD2d-a-A の 3 tier がある:
| tier | 意味 | RD2e の射程 |
|---|---|---|
| **leaveByComputable**（RD2d 既存） | 内部計算可能性 | 前提 |
| **leaveByInstantComputed**（RD2e 新） | 実 leaveBy 時刻を**内部で計算**した（§1 全条件） | **RD2e の出力** |
| **departure line / user-facing** | ユーザーに「○時に出ましょう」を**見せる/促す** | **RD2e 射程外**（§7 別 gate） |

- **絶対則**: RD2e は **leaveByInstantComputed（内部時刻）まで**。**departure line 文面・user-facing 表示・通知は作らない**（RJ2e copy / Permission / delivery の別 gate）。**leaveByInstantComputed=true は display/action を含意しない**（RD2d-a-A INV と同型）。

---

## 7. user-facing / notification / action gate（CEO 論点）

- **leaveBy instant を user-facing へ出すのは別 gate**: RJ2e（copy）+ RJ2d（projection・departure line 構造遮断）+ Permission + RJ2f（delivery・v0 無配信）。
- **notification/action（出発促し・リマインド）は更に別 gate**: delivery/intervention（RJ2f HOLD）。
- RD2e は **leaveBy instant を internal に計算するまで**。**copy/notification/proposal/departure line を一切作らない**。
- RD2d-a-A の「computable ⇏ display ⇏ action」を leaveBy instant にも適用。

---

## 8. weather friction は HOLD か（CEO 論点・独立裁定）

- **裁定: weather friction は v0 で HOLD（qualitative のみ）**。
- 理由: weather（JMA は既存）から **分単位 delay を deterministic に出すのは捏造**（降水確率 ≠ 確定遅延）。RD2-0 §5.2 の方針を維持。
- v0 は buffer に **qualitative risk note**（「雨で遅れやすい状況」相当）を粗く加味しうるが、**「+8 分」等の精密 delay は出さない**・**「遅れる/間に合う」断定しない**。
- weather friction の本格導入（friction factor/curve）は **RD2e' 以降（別 GO）**。RD2e v0 は buffer の保守値で吸収。

---

## 9. fake 禁止 / no currentLocation auto-use（CEO 論点・絶対境界）

| 禁止 | 内容 |
|---|---|
| **no fake leaveBy** | 条件（§1）が欠けたら leaveBy 時刻 null。推測で時刻を埋めない |
| stale leaveBy | stale ETA/origin で leaveBy を出さない |
| heuristic leaveBy | heuristic duration から leaveBy を出さない（projection-grade でない・RD2d-a-A） |
| **no currentLocation auto-use** | 現在地を自動で出発 origin にしない（imminent + 明示 gate のみ） |
| departure line | RD2e は文面を作らない（RJ2e/Permission/delivery 別 gate） |
| weather delay 断定 | 分単位 delay を断定しない（qualitative のみ・HOLD） |
| 「遅れる/間に合う」 | 断定しない（feasibility は risk まで） |
| buffer 捏造 | 根拠なき精密 buffer を出さない（保守値 + evidence） |

---

## 10. RD2e 実装候補（次段・各々別 GO）

| slice | 内容 | 接続 |
|---|---|---|
| **RD2e-a** | `LeaveByComputationV0` schema/types + walker（leaveByInstantComputed・buffer policy 型・origin temporal validity・全条件 AND）pure | なし |
| **RD2e-b** | leaveBy adapter（leaveByComputable capability + arrival target + buffer + origin temporal → leaveByInstant・pure・依存注入） | なし |
| **RD2e'**（weather friction・別 GO） | weather friction を qualitative に加味（JMA consume・分 delay 断定しない） | weather（gate） |
| **RC2a 接続**（別 GO） | leaveBy → movementReality（honest 維持） | なし |
| **RJ2e/delivery 接続**（別 GO・最後） | leaveBy instant → departure line copy / user-facing / notification | RJ2/Permission/delivery（gate） |

- **推奨**: RD2e-a（型・pure）→ RD2e-b（adapter・pure）→ RC2a 接続 → RJ2e/delivery（最後・別 gate）。weather friction は RD2e'（別 GO）。

---

## 11. Department Responsibility Matrix（RD2e-0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Mobility**（leaveBy 境界設計）+ **Build**（時刻計算の technical safety） |
| consultedDepartments | Permission（origin temporal・currentLocation gate）・Communication（departure line 分離）・Risk（stale/weather/遅刻）・Context（arrival target/weather） |
| blockingDepartments | **CEO**（RD2e-a 実装 GO・weather/delivery は別 gate）+ Permission + production gate |
| outputs | RD2e-0 設計（leaveBy instant 条件・buffer policy・arrival target・origin temporal validity・stale 拒否・departure line 分離・user-facing/notification gate・weather friction HOLD・fake 禁止・RD2e-a 候補）。**コードなし** |
| safetyGate | **leaveByComputable ⇏ leaveBy instant（全条件 AND 必須）**・**leaveByInstantComputed ⇏ display/action（departure line/notification は別 gate）**・**stale ETA/origin で leaveBy を出さない**・**heuristic から leaveBy を出さない**・**currentLocation を自動で出発 origin にしない**・**weather delay を分単位で断定しない（qualitative・HOLD）**・**fake leaveBy なし**・buffer は保守値 + evidence・production gate 未通過 |
| traceRefs | RD2d-a-A leaveByComputable / RD2d-0A §6 origin temporal / RD2-0 §5 leaveBy 条件 / RJ2d departure line 構造遮断 |

---

## 12. 自己判定

- **RD2e-0 は設計 ready**。leaveBy instant は **行動境界**（capability の延長でなく）。leaveByComputable=true でも **全条件 AND（arrival target・origin 出発時刻妥当・fresh ETA・buffer）**が揃わなければ実時刻を出さない。出しても **display/action は別 gate**。
- **RD2e-a 実装 GO は CEO 専管**。型・walker（pure）を先に・weather friction と delivery は別 gate（最後）。
- 革新点（CEO ⑦）: **leaveBy を「最も行動に近い派生量」として最も厳格に gate** — `leaveByComputable`（計算可能）→ `leaveByInstantComputed`（時刻計算）→ `departure line`（表示）→ `notification`（行動促し）の **4 段を厳格分離**し、各段で別 gate を要求。「アプリが古い所要や勝手な現在地で出発時刻を断定して遅刻させる」事故を、stale 拒否 + origin temporal validity + currentLocation auto-use 禁止 + weather delay 非断定で構造排除。捏造しない reality OS を**移動の最終行動**まで貫く。
- code 変更ゼロ・UI/storage/API/DB write/location/notification/external read 不接触・tree clean・production gate 未通過。
