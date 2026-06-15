# U1-minimal-0 — startTimeSource 永続化設計（manual + ICS-timed のみ）docs-only

- 日付: 2026-06-15 / 位置づけ: U1（`docs/reality-leaveby-upstream-provenance-u1-u2-0.md`）の**最小 scope 第 1 片**。RD2e-SUPPLY が honest に fixed arrival を供給するには `startTimeSource` を **creation 時に persist** する必要がある（read-path では all-day 00:00 と実時刻が区別不能）。本書は **manual + ICS-timed の 2 path** に限定し、念密に・漏れなく設計する。
- scope を最小に割る理由（CEO）: corner-cut でなく**詳細プランの精度を上げるため**。他 7 path（template[=manual 扱い]/google/microsoft/shift_image/pdf/image/chat）は **fail-closed 既定**で本片の対象外（各々別 scoped slice で完全設計）。
- 規律: 本書は**コードを書かない**。DB migration 実行・production 反映は CEO 承認（Operating Rules）。実装は local。
- 方法（CEO ①②③ + ultracode）: **adversarial workflow（`wf_68719869`・5 grounding + 2 critique・file:line 根拠）**で creation/mapper/DB/migration を監査。下記は確認事実。

---

## 0. grounded path map（実コード）

**Manual**: `AddAnchorModal.tsx`（startTime を HH:MM 入力）→ `anchor-input-form.ts::buildAnchorInputFromForm`（`CreateExternalAnchorInput` 構築）→ `anchor-fetch.ts::createAnchorBundle`（POST `/api/plan/anchors`）→ `app/api/plan/anchors/route.ts::POST`（auth）→ **`external-anchor-repository-supabase.ts::createSourceWithAnchors`（単一 choke point・404-623）** → `anchorInsertPayload`（266-300・line 282 で `confirmed_at`）/ `anchorInsertPayloadForRpc`（333-361）。

**ICS-timed**: `icsParser.ts::mapIcalEventToParsed`（`ParsedIcsEvent` = uid/summary/**startDateIso**/**isAllDay**[line 306]/**tzid**[309-316]/recurrenceRuleRaw…）→ **`icsToAnchorMapper.ts::mapSingleIcsEventToDraft`（line 181-182: `isAllDay` を読んで startTime='00:00' に使うが draft に残さない・tzid は読まない=DROP）** → `draftToAnchorInput` → `CreateExternalAnchorInput` → 同 choke point。

**DB**: table `external_anchors`（**正規化カラム**・JSON でない）。`start_time TIME NOT NULL`。書き込みは **二重経路**: (1) RPC `create_external_anchor_bundle`（`supabase/migrations/20260602100000_external_anchors_companions.sql`）優先 / (2) function_missing 時 sequential INSERT。Row 型 `ExternalAnchorRow`（114-143）+ `rowToAnchor`（165-235）。更新 `updateAnchor`（728-747）+ `anchor-update-validation.ts` SANITIZED_KEYS。RLS は user_id-scoped で追加カラムを自動カバー（policy 変更不要）。

---

## 1. schema 追加（DB カラム + 型）

`external_anchors` に **4 カラム追加（nullable・additive）**:
| カラム | 型 | 意味 |
|---|---|---|
| `start_time_source` | TEXT | `'user_explicit'`/`'imported_exact'`/`'system_inferred'`/`'assumed_default'`/`'unknown'` |
| `is_all_day_placeholder` | BOOLEAN | all-day import の 00:00 placeholder か（all-day を un-fakeable にする） |
| `timezone_of_record` | TEXT | ICS tzid（imported_exact の honest 根拠・floating は不可） |
| `start_time_confirmed_at` | TIMESTAMPTZ | **時刻**確定の as-of（anchor 存在の `confirmed_at` と別・G5） |

**CHECK 制約（DB レベル強制・critique H4）**:
- `CHECK (start_time_source IS NULL OR start_time_source IN ('user_explicit','imported_exact','system_inferred','assumed_default','unknown'))`
- **cross-field（all-day を exact に偽装不可）**: `CHECK (NOT (start_time_source IN ('user_explicit','imported_exact') AND is_all_day_placeholder IS TRUE))`
- **floating を exact に偽装不可**: `CHECK (NOT (start_time_source = 'imported_exact' AND timezone_of_record IS NULL))`

型追加: `ExternalAnchorBase`（`external-anchor.ts`）+ `ExternalAnchorRow`（`external-anchor-repository-supabase.ts:114-143`・optional `?: string | null`）+ `CreateExternalAnchorInputBase`（`external-anchor-input.ts:37`・**signal field のみ**・下記）。

---

## 2. 「startTimeSource は server-determined」— signal 分離（critique H3/H8）

**client は label を渡さない**（mislabel 防止）。各 path は **honest な signal** だけを input に載せ、**server（anchorInsertPayload + RPC）が label を導出**する。

`CreateExternalAnchorInputBase` に追加する signal（label でない）:
- `startTimeUserEntered?: boolean`（manual 専用・後述）
- `icsIsAllDay?: boolean`（ICS 専用・mapper が `event.isAllDay` から）
- `icsTzid?: string | null`（ICS 専用・mapper が `event.tzid` から）

**server 導出規則（anchorInsertPayload / RPC 共通）**:
```
derive(sourceType, signals):
  manual|template:
    startTimeUserEntered === true  -> 'user_explicit'      (start_time_confirmed_at = nowIso)
    else                           -> 'assumed_default'    (prefill 未編集 = fail-closed)
  ics:
    icsIsAllDay === true           -> 'assumed_default'    (is_all_day_placeholder = true)
    icsIsAllDay !== true && icsTzid (present|'UTC')
                                   -> 'imported_exact'     (timezone_of_record = icsTzid, start_time_confirmed_at = import nowIso)
    icsIsAllDay !== true && !icsTzid
                                   -> 'system_inferred'    (floating: TZ 不明ゆえ exact にしない)
  その他 path（google/microsoft/shift/pdf/image/chat）-> 'unknown'  (本片 scope 外・fail-closed)
  signal 欠落 / 不整合              -> 'unknown'           (default-deny)
```

---

## 3. manual path 変更（user_explicit を typed time に gate・critique H3）

- 問題: form は `mergeInitialState` で startTime を**prefill** する。`sourceType==='manual'` だけで `user_explicit` にすると、ユーザーが触っていない既定値が exact として漏れる。
- 設計: `AnchorFormState`（`anchor-input-form.ts`）に **`startTimeUserEntered: boolean`** 追加。time 入力の **`onChange` でのみ true**（`mergeInitialState` の prefill では false）。`buildAnchorInputFromForm` が `startTimeUserEntered` を input に載せる。
- 結果: prefill 未編集 → `assumed_default`（fixed arrival にならない）。ユーザーが実際に打鍵 → `user_explicit`。
- 触る: `AddAnchorModal.tsx` / `AnchorFormFields`（onChange）/ `anchor-input-form.ts`（state + builder）。

---

## 4. ICS path 変更（isAllDay/tzid を thread・critique H1/H7）

- 問題: `mapSingleIcsEventToDraft`（line 181-182）が `isAllDay` を消費するだけ・`tzid` は未読。
- 設計:
  1. `IcsAnchorDraft` に **`isAllDay: boolean`** + **`tzid: string | null`** 追加。
  2. `mapSingleIcsEventToDraft` で `event.isAllDay` / `event.tzid`（`ParsedIcsEvent` 既存）を draft に**保存**。
  3. `draftToAnchorInput`（`importIcsAnchorsHelpers.ts:77` 周辺・sourceType:'ics'）で `icsIsAllDay`/`icsTzid` を input に載せる。
- 結果: all-day → `assumed_default`（00:00 placeholder・exact 不可）/ timed+tzid → `imported_exact` / timed+floating → `system_inferred`。
- 補足: `IcsImportModal.tsx:1048` は既に「⚠ 時刻 timezone 警告」を出しており floating の UI 認知あり（整合）。

---

## 5. 永続化の二重経路一貫性（critique H2/H6・M divergence）

**両経路 + SQL を必ず同時更新**（片方だけだと provenance が経路依存で不整合）:
1. `anchorInsertPayload`（266-300）: `start_time_source`/`is_all_day_placeholder`/`timezone_of_record`/`start_time_confirmed_at` を conditional 追加（companions と同パターン）。
2. `anchorInsertPayloadForRpc`（333-361）: 同フィールドを JSONB payload に追加。
3. **新 migration で `CREATE OR REPLACE FUNCTION create_external_anchor_bundle`**: INSERT 列 + `a->>'start_time_source'` 等の読取を追加。
4. **test: RPC 経路と sequential 経路の persist 結果が一致**することを assert。
- **`updateAnchor`**: `start_time_source` 等を **`SANITIZED_KEYS`（`anchor-update-validation.ts`）に追加** → client patch で**変更不可**（provenance は server 決定・`confirmedAt`/`sourceId` と同格）。更新時は既存値を保持。
- **read mapper**: `ExternalAnchorRow += optional`、`rowToAnchor` で **`NULL → 'unknown'`（fail-closed coercion）**。`.select('*')` ゆえ query 変更不要だが migration 未適用環境でカラム欠落しても optional ゆえ型壊れない。

---

## 6. migration 計画（additive・no backfill）

新ファイル `supabase/migrations/<YYYYMMDDHHMMSS>_external_anchors_start_time_provenance.sql`:
1. `ALTER TABLE external_anchors ADD COLUMN IF NOT EXISTS start_time_source TEXT;`（+ 他 3 カラム）。DEFAULT 指定なし（既存行 NULL）。
2. 上記 3 CHECK 制約。
3. `COMMENT ON COLUMN` 各カラム。
4. `CREATE OR REPLACE FUNCTION create_external_anchor_bundle`（§5-3）。
5. **backfill しない（critique H・H5）**: 既存 ICS all-day 行は既に `start_time='00:00'` で marker 無し → **provenance は復元不能**。NULL のまま = `'unknown'` = fail-closed。consumer は unknown を「未確定時刻（fixed にしない）」として安全劣化。
- RLS 変更不要（user_id-scoped）。

---

## 7. 不変条件（fail-closed・walker/CHECK で強制）

- **NULL ≡ unknown ≡ fail-closed**（exact でない・fixed arrival にしない）。
- **all-day → exact 不可**（CHECK + is_all_day_placeholder）。
- **floating（tzid 無）timed → exact 不可**（CHECK + system_inferred）。
- **prefill 未編集 manual → user_explicit 不可**（startTimeUserEntered gate）。
- **client は start_time_source を patch 不可**（SANITIZED_KEYS）。
- **proxy 禁止**: `durationSource`/`sourceType` 単独/`confirmed_at` 単独から label を導かない（server 導出は signal ベース）。

---

## 8. RD2e-SUPPLY read 契約（U1-minimal を使う側）

RD2e-SUPPLY は arrival fixedness を決める時、anchor の **`startTimeSource` を READ**（derive しない）:
- `startTimeSource ∈ {user_explicit, imported_exact}` ∧ `is_all_day_placeholder !== true` → fixedness `fixed` 候補（RD2e-SUPPLY-0A §2・RD2e-b-A D4 が confirmed provenance を再要求）。
- `system_inferred` → tentative。`assumed_default`/`unknown`/NULL → reject（`arrival_not_fixed` / `start_time_provenance_missing`）。
- recurrence: 展開 instance は rule の startTimeSource を継承（G1・upgrade 禁止）。

---

## 9. tests 計画（U1-minimal 実装時必須）

1. manual + startTimeUserEntered=true → start_time_source='user_explicit'・start_time_confirmed_at set
2. manual + prefill 未編集（startTimeUserEntered=false）→ 'assumed_default'
3. ICS all-day → 'assumed_default'・is_all_day_placeholder=true（CHECK で exact 不可）
4. ICS timed + tzid → 'imported_exact'・timezone_of_record=tzid
5. ICS timed + floating（tzid 無）→ 'system_inferred'
6. **RPC 経路と sequential 経路で同一 provenance**（divergence なし）
7. updateAnchor が start_time_source を変更しない（SANITIZED_KEYS）・client patch 無効
8. rowToAnchor: NULL → 'unknown'
9. CHECK 制約: ('imported_exact', is_all_day_placeholder=true) を INSERT 拒否
10. CHECK 制約: ('imported_exact', timezone_of_record=NULL) を INSERT 拒否
11. 既存行（NULL）read → 'unknown'・fixed arrival にならない（RD2e-SUPPLY 連携）
12. 他 path（google 等）→ 'unknown'（scope 外 fail-closed）
13. mapper unit: icsIsAllDay/icsTzid が draft→input に thread される
14. tsc baseline 維持（55）

---

## 10. 本片の対象外（次 scoped slices・各々完全設計）

- **U1-rest**: google_calendar / microsoft_calendar（imported_exact 候補・各 mapper 監査要）/ shift_image（辞書 default → system_inferred + user 確認）/ pdf/image/chat（抽出 → inferred）。各 path で signal を honest に。
- **U1-eventnode**: `EventNode` に startTimeSource を伝播（dayGraph 経由で RD2e-SUPPLY が EventNode 起点で読む場合）。本片は anchor 層に persist。
- **U1-recurrence-override**: per-instance override（現状未対応・G6）導入時の instance provenance。

---

## 11. Department Responsibility Matrix（U1-minimal-0・docs 契約）

| 部門 | 役割 | 責務 |
|---|---|---|
| **Mobility/Build** | R | schema 追加・server 導出規則・二重経路一貫性・migration・tests |
| **Context/Temporal** | C | ICS isAllDay/tzid thread・manual touched signal |
| **Permission** | C | provenance server 決定（client mislabel 防止）・SANITIZED_KEYS |
| **Risk** | C | fail-closed（NULL/unknown）・CHECK で all-day/floating を un-fakeable・no backfill |
| **CEO** | A | U1-minimal 実装 GO・**DB migration 実行承認**（local 実装は可・production 反映は別承認） |

---

## 12. U1-minimal 実装 GO 条件 + 自己判定

**GO 条件（漏れなし）**: (1) migration（4 カラム + 3 CHECK + RPC CREATE OR REPLACE）/ (2) 型 3 箇所（ExternalAnchorBase/Row/CreateInputBase signal）/ (3) server 導出（anchorInsertPayload + anchorInsertPayloadForRpc）/ (4) manual form touched signal（AddAnchorModal/AnchorFormFields/anchor-input-form）/ (5) ICS thread（icsParser 既存・IcsAnchorDraft/mapSingleIcsEventToDraft/draftToAnchorInput）/ (6) SANITIZED_KEYS / (7) rowToAnchor NULL→unknown / (8) tests 1-14。

**自己判定**: 本片は **anchor ingestion + DB に踏み込む cross-cutting だが scope は manual+ICS の 2 path に厳密限定**ゆえ surface 制御可能。critique の 4 fail-open（all-day/floating/prefill/二重経路）を CHECK 制約 + signal 分離 + server 導出 + 二重経路同時更新で塞ぐ設計。**実装可能水準**。DB migration 実行は CEO 承認（local 実装・test は可）。コードは書いていない。
