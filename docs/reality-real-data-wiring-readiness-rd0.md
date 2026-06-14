# RD0 — Real Data Wiring Readiness Audit（docs-only / read-only 監査・実装禁止）

- 日付: 2026-06-14 / 作成: real-data wiring readiness 監査セッション
- 位置づけ: fixture preview（RJ2g）から **operator 自身の実データ preview** へ進む前に、RC2a real-data wiring の入力契約・欠損・変換責務・安全境界を**実コードの読み取りで**確定する。
- 規律: **コードを書かない**（docs-only / read-only 監査）。adapter / UI / route 変更なし。
- 検証原則（feedback_verification-protocol）: 全主張に根拠（ファイル:行）。本書は §1–§3 の実コード読み取りに基づく。

---

## 0. 独立裁定（CEO ① 前提を疑え・GPT を鵜呑みにしない）

GPT は新規 **field adapter（`AnchorToRealityGraphInputV0`）** が要ると示唆した。**実コード監査の結論はこれを部分的に否定する**:

> **RC2a（buildDayGraph + compile*）は既に honest な field adapter であり、新規 field 変換は不要。**

`compileEventRealityNodes` / `compileMovementReality` / `compileCommitmentSignals` は、real anchor の field を読み、**欠損は unknown / knownFalse に落とし、fake しない**ことを既に enforce している（§2 根拠）。よって RD0 が確定すべきは **field 変換**ではなく **orchestration（read → subjective-date 選択 → recurring 展開 → assemble）**であり、**真の新規リスクは「recurring anchor 展開 + subjective-date 選択」**（buildDayGraph は recurring を展開しない・§3）。この再フレームが RD0 の核。

---

## 1. real-data source 監査（根拠）

| 項目 | 実装 | 監査結果 |
|---|---|---|
| anchor read | `ExternalAnchorRepository.listAnchors(userId): Promise<ExternalAnchor[]>`（`external-anchor-repository.ts:190`） | **自分の anchor のみ（owner-RLS）**・全件返す（date 未 filter） |
| supabase client | `createSupabaseExternalAnchorRepository`（`external-anchor-repository-supabase.ts:397`・「service_role 一切使わない・anon + RLS のみ」`:22`） | **service_role 禁止・read は select** |
| operator auth | `supabaseServer()` → `auth.getUser()`（RJ2g page 既存） | login user = operator・owner-RLS で自分の行のみ |
| ExternalAnchor field | id/userId/title/startTime/endTime?/locationText?/locationCategory?/rigidity/sourceId/confirmedAt/confidence?/sensitiveCategory?/externalUid?/companions?（`external-anchor.ts:33-77`） | **companions（参加者）/ sensitiveCategory / locationText を保持** |
| one_off vs recurring | one_off: `date`（`:84`）/ recurring: `validFrom`/`validUntil?`/`recurrenceRule`/`exceptionDates?`（`:92-`） | **recurring は date 展開が必要**（§3） |
| date / subjectiveDate / timezone | listAnchors は date 非依存。subjectiveDate は呼び元が決める | **server now → JST subjectiveDate の決定が orchestration の責務** |

---

## 2. RC2a assembler 入力契約監査（fake 禁止は既に enforce・根拠）

| 関数 | 入力 | 出力 field と「欠損時の扱い」（根拠） |
|---|---|---|
| `buildDayGraph({anchors, date, options?})` | anchors + date | graph + content-aware snapshotId（`buildDayGraph.ts:171,198`）。PII（locationText/title/companions）は **NFC→fnv fingerprint**（`:155-162`・pseudonymous） |
| `compileEventRealityNodes` | graph node | **placeCertainty 常に unknown**（`:94-96`「捏造しない」）/ **movementRequired は transition target のみ true・他 unknown**（`:99-104`「不要を断定しない」）/ **leaveBy 常に null + whyUnresolved**（`:114-119`）/ **permissionLevel 不明→blocked 0・v0 上限 2**（`:146-150`）/ fixedness（rigidity 信頼・inferred `:85-87`）/ sensitiveFlagged=node.sensitive（`:208`）/ durationSource（`:205`） |
| `compileMovementReality` | graph | **routeKnown/etaKnown/leaveByKnown 常に knownFalse**（`:123-128`「供給が無いことを判っている=inferred false・捏造でなく欠測の明示・fake ETA/leave-by 禁止 RJ0.2 §8」）/ mobilityStatus "unresolved" |
| `compileCommitmentSignals` | graph node + anchor | **otherPeoplePossible: companions あり→inferred true / verb 弱 / 無信号→unknown**（`:114-122`）/ **reservationOrPaymentPossible: sensitive medical/legal/exam→true / 無信号→unknown**（`:131-135`）/ workOrShiftPossible（verb 弱/unknown）/ fixedStart（rigidity hard） |
| `deriveDecisionDebt` | graph/ern/mv/cs | decisionDebt components（既存・pure） |
| `deriveMomentSnapshot` | instant/momentState/ern/mv/cs/decisionDebt | relevantNodes（active/upcoming）+ **missingInputRefs（criticality "unknown"・source trace 保持 `:186-202`）** |
| `assembleRealityGraph` | ern/mv/cs/momentSnapshot/viewerKey | RealityGraphSnapshotV0 + graphBaseId/snapshotId |
| `deriveMomentState({nowHHMM, segments})` | nowHHMM + segments | segments は **Stage 0 fixture 供給可（[]）**（`deriveMomentState.ts:27`） |

**結論: place/ETA/route/leaveBy/otherPeople/permission の fake は RC2a が既に構造的に禁止**（unknown/knownFalse/blocked に落ちる）。real-data wiring で新たに fake する経路を**作らない限り**安全。

---

## 3. gap map（real anchor → RC2a・根拠付き）

| real anchor field | RC2a が使う先 | 欠損時の扱い（fake しない） |
|---|---|---|
| startTime | timeWindow.startHHMM | 必須（無ければ node 不成立） |
| endTime? | timeWindow.endHHMM / **durationSource** | 無 → `assumed_default`（RJ1a は confirmed 衝突にしない） |
| date / validFrom+recurrenceRule | day 帰属 | **one_off=date 一致 / recurring=展開（§3 GAP）** |
| rigidity | fixedness / fixedStart | 常存 |
| locationText? | placeCertainty evidence（**でも unknown**）/ movement placeKnown | 無 → unknown（`place_missing`） |
| locationCategory? | snapshotId 由来 | 無 → null |
| **companions?** | **otherPeoplePossible** | 無 → unknown（`no_companion_signal`・**otherPeople を false 断定しない**） |
| sensitiveCategory? | reservationOrPaymentPossible / sensitiveFlagged | 無 → unknown / 非 flagged |
| sourceId | rigidity provenance（sourceType） | 常存 |
| （anchor に無い）place 解決 / route / ETA / leaveBy | movement | **常に knownFalse/null（fake 禁止）** |
| （anchor に無い）permission | permissionLevel | 常に導出（unknown→blocked・v0 cap 2） |

### 3.1 真の GAP（新規に必要・buildDayGraph に無い）

1. **recurring 展開**: `buildDayGraph` は `input.anchors` を date の events として扱う（`:286` validAnchors filter のみ）。**recurring anchor を subjectiveDate の instance に展開する責務は呼び元**（recurrenceRule/exceptionDates 解釈）。**fixture は one_off のみ**ゆえ未検証。→ 既存の production day-anchor selector があれば consume・無ければ別設計。
2. **subjectiveDate / timezone 決定**: server now（JST）→ subjectiveDate。pure core は時刻を持たないため **orchestration（page）が constant/server-now を注入**。
3. **momentState segments**: Stage 0 は []（fixture）。real day segments を使うかは別判断（v0 は [] 可）。

### 3.2 fake 禁止 field 一覧（RC2a が enforce・wiring で破ってはいけない）

- **place / placeCertainty**（→ unknown・locationText があっても解決しない）
- **route / ETA / leaveBy**（→ knownFalse/null・**絶対に fake しない**・RJ0.2 §8）
- **otherPeople / participants**（companions 無 → unknown・false 断定しない）
- **permission**（不明 → blocked）
- **movementRequired**（transition 無 → unknown・「不要」断定しない）
- **duration**（endTime 無 → assumed_default・explicit と偽らない）

---

## 4. unknown / missingInputRefs 方針

- 欠損は **unknown / knownFalse / null + whyUnresolved/evidenceRefs** で表現（RC2a 既存・捏造しない）。
- `missingInputRefs`（node#field + dedupeKey + criticality "unknown"）は `deriveMomentSnapshot` が自動生成（`momentSnapshot.ts:186-202`）。real-data でも **source trace を失わない**。
- これらは **internal**（client へ渡さない・RJ2g safe DTO に含まれない）。RJ2 chain が unknown を「断定しない判断」に正しく反映する（feasibility unknown / eligibility default-deny）。

---

## 5. safe adapter 設計（orchestration・field 変換でない・consume only）

> 裁定（§0）: 新規 **field adapter は不要**。必要なのは **read-only orchestration**（既存 pure 関数を consume）。

```ts
// 読み取り入力（page が server-side で用意・read-only）
interface OperatorDayRealityPreviewInputV0 {
  readonly operatorUserId: string;       // auth.getUser().id（owner-RLS）
  readonly subjectiveDate: string;       // server now（JST）由来・YYYY-MM-DD
  readonly referenceInstantUtc: Date;    // server now（page 注入・pure core は時刻を持たない）
}

// orchestration（read → 当日選択 → recurring 展開 → RC2a assemble）。**read-only・write/seed/api/localStorage なし**
// 出力 = 既存 RealityGraphSnapshotV0（→ RJ chain → 既存 safe DTO）。**新規 field 変換ロジックを持たない**
async function assembleOperatorDaySnapshot(input, deps): Promise<RealityGraphSnapshotV0>
//   deps.listAnchors(operatorUserId)  // owner-RLS・select のみ
//   → 当日 anchors（one_off date 一致 + recurring 展開[§3.1 GAP]）
//   → buildDayGraph → compile*（既存・honest）→ deriveMomentSnapshot（server instant）→ assembleRealityGraph
```

- **read-only / DB read のみ / write なし / localStorage なし / API 追加なし / notification なし**。
- viewerKey = `graphViewerKey(operatorUserId)`（pseudonymous）。
- **client へ渡す safe DTO は変えない**（`RealitySurfaceDogfoodPreviewPayloadV0`・CEO 明示）。internal object を UI に渡さない（RJ2g と同一規律）。
- recurring 展開は **既存 day-anchor selector を consume**（あれば）。無ければ展開は別 slice で設計（fake せず・展開不能 recurring は当日 events に含めない＝過少 ≠ 捏造）。

---

## 6. fixture preview との分離方針（CEO 明示）

- **既存 fixture preview（`/plan/dev-reality-surface` 代表シナリオ）は維持**。
- real-data preview は **別 mode / 別 section**（例: 同 route 内に `mode=real` toggle・または別 sub-route）。
- **real-data unavailable（anchor 0 / assemble throw）時は fixture へ勝手に fallback しない** → Disabled / 空表示（fail-closed）。
- UI 上で **fixture（代表シナリオ）と real（あなたの当日）を明確に区別**（ラベル・見出し）。混同させない。

---

## 7. real-data preview 実装 GO 条件（別 GO・CEO 承認後）

1. **read-only**: `listAnchors` select のみ・write/seed/upsert/insert/update/delete なし・localStorage なし・API route 追加なし・notification なし・service_role 不使用・owner-RLS。
2. **fake 禁止 confirmed**: place/route/ETA/leaveBy/otherPeople/permission/movement を fake しない（RC2a 既存の honest 経路のみ consume・新規 fake 経路を作らない）。
3. **recurring 展開**: 当日 instance を正しく選択（既存 selector consume or 別設計）。展開不能は **当日 events に含めない**（捏造より過少を選ぶ）。
4. **subjectiveDate / timezone / referenceInstant**: server（page）が注入・pure core は時刻を持たない。
5. **missingInputRefs / unknown**: RC2a 自動生成を尊重・internal に留める。
6. **client safe DTO 不変**（`RealitySurfaceDogfoodPreviewPayloadV0`）・internal object を UI に渡さない・token leak guard 再適用（fail-closed）。
7. **fixture / real 分離**（§6・auto-fallback なし・UI 区別）。
8. **三重ガード + flag default OFF + operator auth**（RJ2g 同型・production hard block）。
9. tests: read-only（write 0）/ recurring 展開正当性 / fake 禁止（place/ETA unknown）/ unknown 保持 / safe DTO 不変 / leak guard / 三重ガード / build PASS。
10. **不接触**: PlanClient / Alter tab / product route 不変・既存 RJ2a–2g 不接触。production gate 未通過。

> **重要**: RD0 完了時点で**勝手に実装に進まない**。CEO の real-data preview 実装 GO を待つ。

---

## 8. Department Responsibility Matrix（RD0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Build**（real-data orchestration の技術安全） |
| consultedDepartments | Permission（owner-RLS/auth）・Communication（surface 出力不変）・Product（fixture/real 区別） |
| blockingDepartments | **CEO**（real-data preview GO）+ Permission + production gate |
| outputs | RD0 監査（source 監査・RC2a 入力契約・anchor field map・gap map・fake 禁止 list・unknown 方針・safe adapter 設計・fixture/real 分離・GO 条件）。**コードなし** |
| safetyGate | **RC2a は既に honest（fake 禁止 enforce 済）**・read-only orchestration（listAnchors select のみ・write/api/localStorage なし・service_role 禁止・owner-RLS）・**place/route/ETA/leaveBy/otherPeople/permission を fake しない**・recurring 展開不能は過少（捏造より）・**client safe DTO 不変**・**fixture/real 明確区別・auto-fallback なし**・三重ガード+flag OFF+operator auth・**production gate 未通過** |
| traceRefs | listAnchors（owner-RLS）/ RC2a snapshot / 既存 safe DTO のみ |

---

## 9. 自己判定（real-data wiring に進めるか）

- **判定: real-data wiring は設計 ready（監査後）**。核は **field 変換でなく orchestration**（既存 pure 関数 consume）。fake 禁止は RC2a が既に enforce 済（§2 根拠）。**真の新規作業 = recurring 展開 + subjective-date 選択**（§3.1）で、これも fake せず（展開不能は過少）。
- **ただし実装 GO は CEO 専管**。RD0 の CEO 確認 → real-data preview 実装 GO の順。実 push / 通知 / production / write は依然 HOLD。
- 革新点（CEO ⑦）: **「adapter を作る」のでなく「既存の honest 層をそのまま実データに通す」** — fake 禁止を新規コードで再発明せず、RC2a の構造的誠実さ（unknown/knownFalse）を real-data でも維持する。これが「捏造しない reality OS」の一貫性。
- code 変更ゼロ・UI/storage/API/DB write/location/notification/external read 不接触・tree clean・production gate 未通過。
