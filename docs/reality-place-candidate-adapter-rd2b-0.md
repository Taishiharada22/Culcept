# RD2b-0 — Place Candidate Adapter Design（設計提出のみ・コード禁止）

- 日付: 2026-06-14 / 作成: place candidate adapter 設計セッション
- 位置づけ: RD2a で `PlaceResolutionV0`（場所解決の段階・不変条件）を型として確定した。RD2b-0 は **locationText → place candidate（unresolved/selected/confirmed）への adapter** をどう設計するか — 既存 `placeResolver` を consume するか・external API gate・raw place data の internal 扱い・RC2a placeCertainty への接続条件・dogfood generic 表示 — を確定する。
- 規律: **コードを書かない**（docs-only）。provider 実行・Places/Google Maps/geocode API 接続・currentLocation 取得・UI/Alter tab/本線/RC2a compile 変更・production には進まない。
- 上流: RD2a `0b7e8f90`（PlaceResolution 型）+ RD2-0 `39fb0144`（§2 + §2.1 補正）。

---

## 0. 前提を疑う（CEO ① — adapter は「解決」でなく「段階の写像」）

RD2b の adapter が**してはいけない**こと: locationText を受け取って「解決済み（confirmed）」を返すこと。RD2-0/RD2a の核心（CEO 補正）は **整形状態 ≠ 確認**。よって adapter の責務は:

> **locationText / placeResolver 出力 / 本人確認イベント を、`PlaceResolutionV0` の正しい stage に写像する**こと。adapter は確信度を**上げない**。確信度は **入力の provenance が決める**（locationText のみ→unknown、候補→unresolved、本人確認→confirmed）。

adapter は「賢く解決する」装置ではなく「provenance を段階に正直に写す」装置。RD0/RD1/RD2-0 で一貫する規律: **捏造しない・便利に補完しない**。

---

## 1. adapter の入力・出力（境界）

### 1.1 入力（provenance 別・3 系統）

| 系統 | 入力 | 由来 | 写像先 stage |
|---|---|---|---|
| A. text only | `anchor.locationText`（文字列のみ・未解決） | external anchor | `location_text_only`（unknown） / 無→`missing_place` |
| B. resolver candidate | `placeResolver` 出力（候補 N・confidence・座標） | 既存 placeResolver（**RD2b は呼ばない**・将来 RD2b 実装で gate 越しに consume） | candidate 数/拮抗で `candidate_unresolved` / `ambiguous_place` / `candidate_selected`（inferred） |
| C. confirmation event | 本人選択 / persisted selected / explicit confirmation / trusted exact source | UI 選択・DB persisted・信頼 source | `exact_confirmed`（confirmed・ConfirmedPlaceSource のみ） |

### 1.2 出力

`PlaceResolutionV0`（RD2a 型）。adapter は constructor（`createLocationTextOnlyResolution` 等）を呼ぶだけ・**新 field を作らない**・**raw を出力に載せない**（candidateRef は opaque）。

---

## 2. 既存 placeResolver を consume するか（CEO 論点 1・独立裁定）

### 2.1 裁定: **consume する。ただし RD2b は「型 adapter の設計」まで・実呼び出しは RD2b 実装（別 GO）+ external API gate**

- `placeResolver`（`lib/alter-morning/placeResolver.ts`）は **Places API + Web fallback + cache + HARD_SANITY_KM** を持つ成熟実装。**再発明しない**（RD0/RD1 規律）。
- ただし placeResolver は **external API（Places）を叩く** → RD2b-0（docs-only）でも RD2b 実装でも **API gate 必須**（§3）。
- **RD2b の adapter 層は placeResolver の出力 shape にのみ依存**（依存性注入）。adapter 自体は pure（placeResolver を import しない・provider を引数で受ける）→ RD2a と同じ純粋性・test 可能性。

### 2.2 adapter の純粋性（RD1a の listAnchors 注入と同型）

```
type PlaceCandidateProvider = (locationText: string) => Promise<ProviderCandidateResult>;  // 将来 RD2b 実装で placeResolver を注入
adapter(input, { provider })  // provider 未注入なら text-only / missing に倒す（fail-honest）
```

- adapter は **provider を import せず引数注入** → placeResolver/Places API を adapter コードから構造的に分離。RD2a の純粋性を維持。
- provider が無ければ `location_text_only`（候補を作らない）。**provider 失敗 → candidate を捏造しない**（unknown 維持）。

---

## 3. external API gate（CEO 論点 2）

- placeResolver は Places API（外部送信）を使う → **CEO 承認 + production gate + 法務（locationText の外部送信・PII）**まで HOLD。
- gate 構造（既存 geocode API の sensitive skip と同方針）:
  - **sensitive anchor（medical/legal/exam 等）の locationText は外部送信しない**（既存 geocode `sensitive skip` 準拠）。
  - flag（server-only・default OFF）+ operator/owner-RLS（dogfood は operator のみ）。
  - **dogfood では Places API を叩かない選択肢**（text-only / municipality coords[座標 table・API 不要] まで）を default に。RD2b 実装で API consume は別 flag。
- **RD2b-0（docs-only）では API を一切叩かない**。設計のみ。

---

## 4. candidate_unresolved への落とし方（CEO 論点 3）

| placeResolver 出力 | 写像 | 根拠 |
|---|---|---|
| 候補 0 | `location_text_only`（locationText あり）/ `missing_place`（なし） | 解決できなかった |
| 候補 1・confidence < high | `candidate_unresolved`（unknown） | top-1 を confirmed にしない（CEO #1） |
| 候補 ≥2・拮抗 | `ambiguous_place`（unknown） | 断定しない |
| 候補 1・本人未選択 | `candidate_unresolved`（unknown） | 選択 provenance なし |

- **絶対則**: placeResolver の confidence が high でも **本人確認 provenance が無ければ candidate 止まり**（unknown/inferred）。confidence は「resolver の自信」であって「本人の確認」ではない。
- municipality/prefecture coords（API 不要・座標 table）は **粗い候補** → `candidate_unresolved`（座標はあるが exact place ではない）。

---

## 5. candidate_selected の条件（CEO 論点 4）

`candidate_selected`（inferred）に上げてよいのは:
- placeResolver 候補を **canonical 化**して 1 つに**選択**した（だが本人確認前） — `canonical_text` source。
- **ただし inferred 止まり**（confirmed にしない）。`missingInputs: [not_confirmed]` を保持。

→ canonical 化・選択は「整形・絞り込み」であって「確認」ではない（CEO 補正核心）。selected ≠ confirmed。

---

## 6. exact_confirmed の永続化条件（CEO 論点 5）

confirmed に上げてよいのは **確認 provenance**（ConfirmedPlaceSource）のみ:
- **user_selected**: 本人が候補から明示選択（UI イベント）。
- **persisted_selected**: 本人選択が DB に永続化された（再訪時も confirmed）。
- **user_confirmed**: 本人が「この場所で合っている」と明示確認。
- **trusted_exact_source**: 信頼できる exact source（例: 予約確定の会場・本人が登録した固定地点）。

### 6.1 永続化の境界（RD2b では設計のみ・DB write しない）

- confirmed の **provenance（誰がいつ確認したか）を field-level evidenceRefs に残す**（RD2a `PlaceResolutionEvidenceRef`）。
- 永続化（persisted_selected）は **DB write を伴う** → **CEO + production gate + RLS 設計**まで HOLD。RD2b-0/RD2b 実装（型・adapter）では **永続化しない**（confirmation event を受け取って confirmed を返すだけ・保存は別 slice）。
- **整形状態を永続化しても confirmed にならない**（canonical text を保存 ≠ 確認を保存）。永続化すべきは **確認イベントの provenance**。

---

## 7. raw place data / lat / lng / placeId の internal 扱い（CEO 論点 6）

- placeResolver は **raw lat/lng/placeId/address** を返す → これらは **internal のみ**（RD2a `PlaceResolutionV0` は raw field を持たない・candidateRef は opaque）。
- adapter は raw を **opaqueRef（内部ハンドル・hash 等）+ candidateCount** に圧縮して candidateRef に載せる。**raw を PlaceResolutionV0 に載せない**。
- consumer（dogfood/Alter tab）には **stage/certaintyStatus/genericized のみ**（RD2d projection・raw 座標/placeId 非露出）。
- leak guard: PlaceResolutionV0 を JSON 化して lat/lng/placeId/locationText/address が出ないことを検証（RD2a walker の FORBIDDEN_RAW_FIELDS + 将来 adapter test で serialization scan）。

---

## 8. RC2a placeCertainty への接続条件（CEO 論点 7・honest 構造維持）

- adapter 出力 `PlaceResolutionV0.certaintyStatus`（unknown/inferred/confirmed）を **RC2a `compileEventRealityNodes` の placeCertainty status に写す**。
- **接続は RD2c/RD2 後段（別 GO）**。RD2b-0/RD2b 実装では **RC2a compile を変更しない**（adapter は PlaceResolutionV0 を返すまで・RC2a への注入は別 slice）。
- **honest 維持**: provider 未注入/失敗/text-only → `certaintyStatus: unknown` → placeCertainty unknown（現状と同じ・捏造しない）。供給があって初めて inferred/confirmed に動く。
- RC2a の既存 `placeCertainty unknown`（`location_text_present_unresolved`）は **adapter 接続後も default**（confirmation provenance が無い限り）。

---

## 9. dogfood preview への generic 表示（CEO 論点 8）

| PlaceResolutionV0 stage | dogfood 表現（genericized・raw なし） |
|---|---|
| missing_place / location_text_only | 「場所は未確定」（info_incomplete・地名出さない） |
| candidate_unresolved / ambiguous_place | 「場所の候補はあるが未確定」（候補数も出さない or 粗く） |
| candidate_selected | 「場所はおそらく〜（未確認）」（inferred・地名は genericize/RD2d safe label） |
| exact_confirmed | 「場所あり（確認済）」（具体地名は RD2d で safe label・raw 座標なし） |

- **絶対則**: unknown/inferred のとき **具体地名・座標を語らない**。confirmed でも raw 座標/placeId は出さない（RD2d genericize）。
- departure/ETA/leaveBy は **この slice で語らない**（place のみ・movement は RD2d 以降）。

---

## 10. RD2b 実装候補（次段・別 GO）

| slice | 内容 | API |
|---|---|---|
| **RD2b**（実装） | `placeCandidateAdapter`（pure・provider 注入・PlaceResolutionV0 を返す）+ test。**API 叩かない**（provider は引数・dogfood は municipality coords[table] まで） | なし（adapter は pure） |
| **RD2b'**（API consume・別 GO） | placeResolver を provider として注入（Places API consume）+ external API gate + sensitive skip + 法務 | Places（gate） |
| **RD2c'**（永続化・別 GO） | confirmation event の永続化（persisted_selected）+ DB write + RLS | DB write（gate） |
| **RC2a 接続**（別 GO） | PlaceResolutionV0 → placeCertainty 注入（RC2a compile 変更・honest 維持） | なし |

- **推奨**: RD2b（pure adapter・API なし）を先に → RD2b'（API consume・gate）→ RC2a 接続（別 GO）→ 永続化（最後・DB gate）。**pure・no-API を先・API/DB/RC2a 接続は後ろ + 各 gate**。

---

## 11. Department Responsibility Matrix（RD2b-0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Mobility**（place adapter 設計）+ **Build**（adapter 純粋性・RC2a 接続の technical safety） |
| consultedDepartments | Permission（external API/PII gate・sensitive skip）・Communication（dogfood generic 表示）・Risk（confirmation 永続化）・Context（locationText 由来） |
| blockingDepartments | **CEO**（RD2b 実装 GO・external API/DB write は別 gate）+ Permission + 法務（locationText 外部送信）+ production gate |
| outputs | RD2b-0 設計（adapter 入出力・placeResolver consume 方針・external API gate・candidate 落とし方・selected/confirmed 条件・永続化境界・raw internal 扱い・RC2a 接続条件・dogfood generic・RD2b 候補）。**コードなし** |
| safetyGate | **adapter は確信度を上げない**（provenance が段階を決める）・**locationText だけで confirmed にしない**・**resolver confidence high でも本人確認なしは candidate 止まり**・**confirmed は ConfirmedPlaceSource のみ**・**raw 座標/placeId/locationText は internal**（candidateRef opaque）・**external API は別 gate + sensitive skip + 法務**・**DB write/永続化は別 gate**・**RC2a compile 不変**（接続は別 GO・honest unknown 維持）・dogfood は genericized・production gate 未通過 |
| traceRefs | RD2a placeResolution 型 / 既存 placeResolver（consume 対象・gate 越し）/ geocode sensitive skip / RC2a placeCertainty 接続点 |

---

## 12. 自己判定

- **RD2b-0 は設計 ready**。adapter は **「解決」でなく「provenance → 段階の写像」**（CEO 補正核心を adapter 層でも貫く）。placeResolver は consume するが **adapter は pure（provider 注入）**・実呼び出しと API は RD2b 実装 + gate（別 GO）。
- **RD2b 実装 GO は CEO 専管**。pure adapter（API なし）を先に・Places consume/DB 永続化/RC2a 接続は各々別 gate。
- 革新点（CEO ⑦）: **adapter が確信度を上げない設計** — 多くの地図 adapter は「resolver が高 confidence を返したら解決済み」とするが、本設計は **resolver の自信と本人の確認を厳格に分離**（confidence high → candidate 止まり・confirmed は確認 provenance のみ）。これにより「アプリが勝手に場所を確定して間違える」事故を構造的に排除し、reality OS の誠実さ（捏造しない）を place 供給まで貫く。
- code 変更ゼロ・UI/storage/API/DB write/location/notification/external read 不接触・tree clean・production gate 未通過。
