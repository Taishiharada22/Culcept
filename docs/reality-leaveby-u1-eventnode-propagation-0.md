# U1-EventNode propagation-0 — startTimeSource を DayGraph/EventNode へ伝播（proposal・docs-only）

- 日付: 2026-06-15 / 位置づけ: RD2e-SUPPLY 実装の**前提ブロッカー**。CEO の指示どおり、RD2e-SUPPLY 本体に進む前に「`ExternalAnchor.startTimeSource` が EventNode/DayGraph に伝播しているか」を確認 → **伝播していない**ことを確定したため、RD2e-SUPPLY を止めて本 micro-slice を提案する。
- 規律: 本書は**コードを書かない**（提案）。実装は CEO GO 後。

---

## 0. 伝播確認の結果（evidence・NOT propagated）

| 確認項目 | 結果 |
|---|---|
| `EventNode` に startTimeSource フィールド | **無い**（`dayGraphTypes.ts` EventNode interface・provenance 系フィールドなし） |
| `buildEventNodeFromAnchor` が `anchor.startTimeSource` を読むか | **読まない**（`eventNodes.ts:214-264`・node 構築は anchor の time/sensitive/verb 等のみコピー） |
| dayGraph 層全体の startTimeSource/isAllDayPlaceholder/timezoneOfRecord 参照 | **0 件**（`eventNodes.ts`/`dayGraphTypes.ts`/`buildDayGraph.ts` grep ヒットなし） |
| anchor 層の startTimeSource | **存在**（U1-minimal `87b2f07b`・`ExternalAnchorBase.startTimeSource`） |
| どの層で止まっているか | **`buildEventNodeFromAnchor`（eventNodes.ts:214）**。anchor→EventNode 写像で provenance が落ちている |

→ **結論: U1 startTimeSource は anchor 層で stranded**。RD2e-SUPPLY が DayGraph/EventNode から組むと、arrival fixedness も previous_event_end origin も **常に `unknown`**（honest だが空）になる。`raw anchor を直接読む`のは privacy/層分離違反ゆえ不可。→ **EventNode に startTimeSource を最小伝播するのが正道**。

---

## 1. 最小伝播設計（startTimeSource のみ・privacy-safe）

**EventNode に 1 フィールド追加（optional・additive・fail-closed）**:
```
// dayGraphTypes.ts EventNode
readonly startTimeSource?: StartTimeSource;   // U1: 'user_explicit'|'imported_exact'|'system_inferred'|'assumed_default'|'unknown'
```
**`buildEventNodeFromAnchor`（eventNodes.ts）で写像**:
```
startTimeSource: anchor.startTimeSource ?? "unknown",   // 欠落(draft/in-memory/未 migration)→ unknown(fail-closed)
```

**なぜ startTimeSource だけで十分か**（最小性の根拠）:
- arrival fixedness は arrival event の `startTimeSource ∈ {user_explicit, imported_exact}` を要求。U1 の DB CHECK（`..._start_time_allday_chk`）が **exact ⇒ ¬all-day** を保証するため、`isAllDayPlaceholder` は **冗長**（exact なら必ず非 all-day）。
- previous_event_end origin（U2-minimal）は previous event の `startTimeSource` を要求（`leaveBySupplyOrigin.ts`）。
- → 両 consumer とも **EventNode.startTimeSource 1 つ**で足りる。

---

## 2. 伝播しないもの（privacy・CEO 厳守）

| フィールド | 伝播 | 理由 |
|---|---|---|
| `startTimeSource` | **する** | safe enum・downstream に必須・raw でない |
| `isAllDayPlaceholder` | しない（任意） | exact ⇒ ¬all-day を CHECK が保証ゆえ冗長。trace 目的で足すなら boolean のみ（raw でない） |
| `timezoneOfRecord`（raw tzid） | **しない** | **raw timezone を client に出さない**（CEO）。exactness は startTimeSource が既に encode 済（imported_exact は tzid 在のときのみ・U1 導出）。EventNode は client-facing ゆえ raw tzid を載せない |
| `startTimeProvenanceRecordedAt`（timestamp） | **しない** | downstream 不要・raw timestamp を client に出さない |

→ EventNode に載るのは **safe enum 1 つ**。raw anchor / raw timezone / raw timestamp は EventNode に出さない。

---

## 3. recurrence / fail-closed

- **recurrence: 問題なし**（U2 audit G1）。`anchorsForDay` は原 anchor を無改変で返す → 展開 instance も rule の `startTimeSource` を持つ → `buildEventNodeFromAnchor` がそのまま写す。
- **fail-closed**: anchor が startTimeSource を持たない（draft / in-memory / U1 migration 未適用 / U1-rest 未対応 path）→ EventNode.startTimeSource = `'unknown'` → RD2e-SUPPLY で arrival not fixed / origin not valid。**dishonest 補完なし**。

---

## 4. consumer（RD2e-SUPPLY が EventNode.startTimeSource をどう読むか）

- **arrival fixedness**: arrival EventNode の `startTimeSource ∈ {user_explicit, imported_exact}` ∧ confidence → `ArrivalTargetForLeaveByV0.startTimeProvenance='confirmed'`（RD2e-SUPPLY-0A §1-2・RD2e-b-A D4 が再要求）。それ以外 → `inferred`/`default` → uncomputed。
- **previous_event_end origin**: previous EventNode の `startTimeSource` を `PreviousEventForOriginV0.startTimeSource` に渡す（U2-minimal `buildPreviousEventEndOriginValidity` の gate）。
- これにより U1（anchor persist）→ EventNode → RD2e-SUPPLY → RD2e-b の鎖が **honest に**繋がる。

---

## 5. tests 計画（micro-slice 実装時）

1. anchor.startTimeSource='user_explicit' → EventNode.startTimeSource='user_explicit'
2. anchor.startTimeSource='imported_exact' → 伝播
3. anchor.startTimeSource 欠落（undefined）→ EventNode 'unknown'（fail-closed）
4. recurring 展開 instance も rule の startTimeSource を持つ
5. EventNode に timezoneOfRecord / startTimeProvenanceRecordedAt が **載らない**（source-scan・raw timezone 非伝播）
6. 既存 dayGraph テスト無回帰
7. tsc baseline 55

---

## 6. GO 条件 + scope

**GO 条件**: (1) `EventNode.startTimeSource?: StartTimeSource`（optional 追加・`dayGraphTypes.ts`）/ (2) `buildEventNodeFromAnchor` で `anchor.startTimeSource ?? "unknown"` 写像 / (3) raw tzid/timestamp は**載せない** / (4) tests 1-7。**migration なし**（型 + 写像のみ・anchor 層の U1 を再利用）。

**対象外（次 slice）**: RD2e-SUPPLY 本体（本 micro-slice 着地後に GO）/ U1-rest（他 ingestion path の startTimeSource）/ U2-home-work・user-confirmed。

---

## 7. Department Responsibility Matrix（U1-EventNode propagation-0・docs 契約）

| 部門 | 役割 | 責務 |
|---|---|---|
| **Mobility/Build** | R | EventNode フィールド追加・buildEventNodeFromAnchor 写像・fail-closed default |
| **Context/Temporal** | C | recurrence 継承・dayGraph 層整合 |
| **Permission** | C | raw timezone/timestamp を EventNode(client-facing) に出さない |
| **Risk** | C | 欠落→unknown(fail-closed)・dishonest 補完なし |
| **CEO** | A | U1-EventNode propagation 実装 GO → その後 RD2e-SUPPLY GO |

---

## 8. 自己判定

- **RD2e-SUPPLY 本体には進まない**（CEO 指示どおり）。startTimeSource が DayGraph に届いていないことを確認したため。
- 本 micro-slice は **EventNode に safe enum 1 つを additive 伝播 + 写像**だけ（migration なし・privacy 厳守）。最小・低リスク。
- これが着地すれば RD2e-SUPPLY は honest に arrival fixedness / previous_event_end origin を組める。
- 実装は CEO GO 後。本書はコードを含まない。
