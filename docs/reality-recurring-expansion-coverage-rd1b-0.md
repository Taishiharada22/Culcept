# RD1b-0 — Recurring Expansion / Real Data Coverage Design（設計提出のみ・コード禁止）

- 日付: 2026-06-14 / 作成: recurring expansion 設計セッション
- 位置づけ: RD1a（one-off 当日のみ）を拡張し、operator 当日の **recurring anchor を正しく展開**して RC2a に流す設計を確定する。
- 正本: `docs/reality-real-data-wiring-readiness-rd0.md`（RD0）+ RD1a 実装 `9672b207`。
- 規律: **コードを書かない**（docs-only）。recurring expansion / Alter tab / 本線 / production / notification には進まない。
- 検証根拠: §1 は実コードの読み取りに基づく（recurrence-expander.ts / anchorsForDay / eventNodes.ts）。

---

## 0. 前提を疑う（CEO ① — 既存の tested 展開器を再発明しない）

CEO 警告「recurrenceRule 解釈を雑に入れると、当日予定の過剰/過少/重複が起きる」。read-only 監査の結論:

> **recurrence 展開器は既に存在し production で動いている。新規 RRULE parser を書かない。**

- `lib/plan/recurrence-expander.ts` … `expandRecurrence(anchor, range)`（pure・「exceptionDates / validFrom / validUntil を厳密に適用」`:12`・「不正な RRULE / validFrom / dateRange → 空配列」`:161`・UTC 内部 `:11`）。
- 本線 `anchorsForDay`（`app/(culcept)/plan/tabs/_helpers.ts`・`dayGraph/planClientDayGraphHelpers.ts:205` で `resolveAnchorsForDate: (allA, d) => anchorsForDay([...allA], d)`）… **production で /plan が当日 anchor を展開する正本**。
- `eventNodes.ts:298` 「1 日分 anchors（= expanded、**caller 責任**）を受け取る」… DayGraph は展開済を信頼する契約。

**裁定: RD1b は `anchorsForDay`（本線 parity・最有力）または `expandRecurrence`（pure lib）を consume する。** これで「過剰/過少/重複」は **既存の tested 実装に委譲**され、preview が /plan と同じ当日集合を見せる（整合性）。

---

## 1. 既存 recurrence 実装の確認（根拠）

| 項目 | 実装（根拠） | RD1b での扱い |
|---|---|---|
| RRULE 展開 | `expandRecurrence(anchor: RecurringAnchorLike, range: DateRange)`（`recurrence-expander.ts:165`・pure・date 配列返す・UTC midnight ascending `:163`） | **consume**（新規 parser を書かない） |
| exceptionDates | 厳密適用・該当日除外（`:160,183`） | 委譲（cancelled は出さない） |
| validFrom / validUntil | intersection `[max(start,validFrom), min(end,validUntil ?? +∞)]`（`:158,192`） | 委譲（窓外は出さない） |
| 不正 RRULE / validFrom | **空配列**（`:161,175`） | 委譲（不確かは出さない＝過少 > 捏造） |
| 当日 anchor 集合（本線） | `anchorsForDay(allAnchors, date)`（production・/plan が使用） | **consume**（preview を /plan と一致させる） |
| DayGraph 契約 | 「1 日分 expanded・caller 責任」（`eventNodes.ts:298,339`） | RD1b が展開済を渡す |
| timezone | expander は UTC 内部・「表示時ローカル化は UI」（`:11`）。subjectiveDate は JST（RD1a） | §4 で reconcile |

---

## 2. 当日 instance 展開の正本（設計）

RD1a の `selectTodayOneOff`（recurring 除外）を、**当日 anchor 集合の解決**に置き換える:

```
// RD1a: one-off のみ → RD1b: one-off + 当日展開 recurring
todayAnchors = resolveTodayAnchors(allAnchors, subjectiveDate)
//   案 A（推奨・本線 parity）: anchorsForDay(allAnchors, subjectiveDate)
//   案 B（pure lib）: oneOffToday(allAnchors, subjectiveDate)
//                     ++ recurring.flatMap(r => expandRecurrence(r, {start:subjectiveDate, end:subjectiveDate}).length>0
//                          ? [materializeInstance(r, subjectiveDate)] : [])
recurringIncludedCount = todayAnchors.filter(a => a.anchorKind === "recurring" 由来).length
buildDayGraph({ anchors: todayAnchors, date: subjectiveDate }) → RC2a → RJ2 chain → safe DTO（既存）
```

- **materializeInstance(r, date)**: recurring anchor を当日の `ExternalAnchor` instance にする（date=subjectiveDate・startTime/endTime/rigidity/locationText/companions/sensitiveCategory/sourceId は recurring から継承）。**新規意味を足さない**（RC2a が honest に処理）。
- **裁定**: 案 A（`anchorsForDay`）を推奨（production と同じ当日集合・整合性・既に tested）。pure lib に寄せるなら案 B（`expandRecurrence` consume）。どちらも **新規 RRULE 解釈を書かない**。

---

## 3. exceptionDates / validFrom / validUntil / 不正 RRULE

- 全て `expandRecurrence` / `anchorsForDay` が厳密適用済（§1）。RD1b は**その結果を信頼**する。
- **不正 RRULE / validFrom 欠落 → 空**（当日に出さない）。**過少 > 過剰/捏造**（CEO 警告の正面回答）。
- cancelled（exceptionDates）/ 窓外（validFrom/validUntil）→ 当日 events に**含めない**。

---

## 4. timezone（JST v0 明示）

- 当日選択は **JST subjectiveDate**（RD1a・`makeRealityInstantJst`）。
- `expandRecurrence` は UTC 内部だが入出力は **date 文字列（YYYY-MM-DD）**。subjectiveDate を range `[subjectiveDate, subjectiveDate]` として渡せば、**「その JST 日に occur するか」**を date 粒度で判定（DST なし・JST 固定 UTC+9 なので date 境界は安定）。
- recurring の `startTime`（HH:mm wall-clock）は one-off と同じく **JST wall-clock として RC2a が解釈**（`toSubjectiveMin`）。追加 TZ 変換なし。
- **明示**: v0 は **JST 固定**（多 TZ は将来・別 slice）。

---

## 5. duplicate handling（捏造しない）

- **同 anchor の二重 materialize を防ぐ**: instance id は recurring id + date で決定的（同日に同 recurring を 2 回入れない）。
- **one-off + recurring が同一現実 event のとき**: 同 timeWindow → RJ1b の **exact_time_collision_ambiguous**（「衝突か重複か未確定」・**duplicate と断定しない**）が既に処理（RJ1b-A）。RD1b は**新たに duplicate 判定しない**（RJ1b に委譲）。
- **externalUid dedup**: ics 由来は import 時に同 UID dedup 済（external-anchor）。preview では追加 dedup しない（過剰結合を避ける・RJ1b ambiguity が safety net）。

---

## 6. one-off と recurring の同日混在

- `todayAnchors` = one-off 当日 + recurring 当日 instance（merge）。buildDayGraph/eventNodes は「one_off + recurring 混在の expanded」を受ける契約（`eventNodes.ts:338` `anchorKind === "recurring"` 分岐あり）。
- RC2a は混在を honest に処理（各 event の place→unknown 等は §RD0 と同じ）。
- safe DTO: `summary` を `{ includedOneOffCount, includedRecurringCount }`（RD1a の `recurringExcludedCount` → `includedRecurringCount` に変わる）。**count のみ**（raw anchor 不渡し）。

---

## 7. sourceId / externalUid 扱い

- recurring instance は sourceId / externalUid を**継承**（provenance・rigidity provenance は sourceType 由来）。これは **internal**（snapshot 由来 hash・client safe DTO に出さない）。
- **client へ recurrenceRule / sourceId / externalUid / companions を渡さない**（RD1a の leak guard token を維持・`title` 含む）。

---

## 8. fake 禁止（recurring でも捏造しない）

- 展開は **deterministic RRULE 適用**であって fake ではない。ただし:
  - 不正 RRULE → occurrence を**でっち上げない**（空）。
  - exceptionDates/validFrom/validUntil → 窓外を**出さない**。
  - recurring instance の place/route/ETA/leaveBy/otherPeople は one-off と同じく **RC2a が unknown/knownFalse**（companions 無→otherPeople unknown）。新規 fake 経路なし。

---

## 9. tests（実装時・必須）

1. recurring が当日 occur → todayAnchors に含まれる（instance materialize）
2. recurring が当日 occur しない → 含まれない
3. exceptionDates 該当日 → 除外
4. validFrom 前 / validUntil 後 → 除外
5. 不正 RRULE → 空（当日に出さない・捏造しない）
6. one-off + recurring 同日 merge → 両方 graph に入る
7. 同 recurring を同日に 2 回入れない（duplicate materialize なし）
8. one-off + recurring 同 timeWindow → RJ1b exact_time_collision_ambiguous（duplicate 断定しない）
9. recurring instance: companions 無 → otherPeople unknown / place unknown（fake しない）
10. safe DTO 不変（consumerView/renderedCopy/delivery safe subset・raw anchor/recurrenceRule なし）
11. token leak guard（recurrenceRule/sourceId/externalUid/companions/title 非出現）
12. summary.includedRecurringCount が出る
13. read-only（listAnchors select のみ・write なし）
14. unavailable 時 fixture へ fallback しない
15. build PASS

---

## 10. real preview への追加条件（RD1b 実装 GO 条件・CEO 承認後）

1. **既存展開器 consume**（`anchorsForDay` 推奨 or `expandRecurrence`）・**新規 RRULE parser を書かない**。
2. **過少 > 過剰/捏造**（不正 RRULE/窓外/exception → 出さない）。
3. **duplicate を断定しない**（RJ1b exact_time_collision_ambiguous に委譲）。
4. **JST v0 明示**（多 TZ は将来）。
5. **fake 禁止維持**（place/ETA/otherPeople を RC2a 経由 unknown）。
6. **client safe DTO 不変**（raw anchor/recurrenceRule/sourceId/externalUid/companions/title 不渡し・leak guard 維持）。
7. **fixture/real 分離・no-fallback 維持**（RD1a 踏襲）。
8. **read-only**（listAnchors select のみ・write/seed/api/localStorage/service_role なし）。
9. **三重ガード + flag default OFF + operator auth**（RD1a 同型・production hard block）。
10. tests（§9）+ build PASS + 6 surface module / PlanClient / 本線不接触 + production gate 未通過。

> **重要**: RD1b-0 完了時点で**勝手に実装に進まない**。CEO の RD1b 実装 GO を待つ。

---

## 11. Department Responsibility Matrix（RD1b-0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Build**（recurring 展開の technical safety） |
| consultedDepartments | Permission（owner-RLS）・Communication（surface 不変）・Risk（duplicate ambiguity） |
| blockingDepartments | **CEO**（RD1b 実装 GO・本線/production は別 gate）+ Permission |
| outputs | RD1b-0 設計（既存展開器確認・当日 instance 展開正本・exception/validity・timezone・duplicate・混在・sourceId 扱い・fake 禁止・tests・GO 条件）。**コードなし** |
| safetyGate | **既存 tested 展開器を consume**（新規 RRULE parser 書かない）・**過少 > 過剰/捏造**（不正/窓外は出さない）・**duplicate 断定しない**（RJ1b 委譲）・JST v0・fake 禁止維持・**client safe DTO 不変**（raw anchor/recurrenceRule/sourceId/externalUid/companions/title 不渡し）・fixture/real 分離・no-fallback・read-only・三重ガード+flag OFF+operator auth・**production gate 未通過** |
| traceRefs | anchorsForDay/expandRecurrence（既存）/ RC2a snapshot（internal）/ 既存 safe DTO |

---

## 12. 自己判定

- **判定: RD1b は設計 ready**。核は **既存 `anchorsForDay`/`expandRecurrence` の consume**（新規 RRULE 解釈を書かない）。CEO 警告（過剰/過少/重複）への正面回答 = ①tested 展開器委譲 ②不正は過少 ③duplicate は RJ1b 非断定。
- **ただし RD1b 実装 GO は CEO 専管**。RD1b-0 の CEO 確認 → RD1b 実装 GO の順。Alter tab / 本線 / production / notification は依然 HOLD。
- 革新点（CEO ⑦）: **「展開の正しさを再発明せず、本線と同じ当日集合を見せる」** — preview と /plan が同一の anchorsForDay を使えば、dogfood が「実際に表示される予定」と一致し、reality OS の整合性が保たれる。
- code 変更ゼロ・UI/storage/API/DB write/location/notification/external read 不接触・tree clean・production gate 未通過。
