# Life Ops — A-4-c27 Structured Source Storage Contract / Migration Draft Mini-Design

> 2026-06-11 / CEO・GPT GO。**draft のみ**＝migration apply/staging apply/production apply/DB write smoke/UI 入力/PlanClient 追加/
> production enable・write/notification/R4/external API/calendar・free text 推定/push/PR/merge は**全て禁止**。

---

## 1. Audit（10 確認点への回答）

1. **既存に使える table**: なし（c20 audit 再確認・habit/routine/structured-source 系は不存在。M1=feedback facts 専用で用途違い）→ 新 table。
2. **RLS/owner pattern**: `prm_learning_events` の owner-only（`auth.uid() = user_id`）を踏襲。ただし M1 は append-only（UPDATE policy なし）に対し、
   本 table は**ユーザー編集可能な設定系**（期日修正/archive）→ **owner UPDATE policy を許可**する点が意図的差分。
3. **naming/timestamp/trigger pattern**: `2026MMDDHHMMSS_create_<table>.sql`・per-table 専用 trigger 関数（`plan_seeds_set_updated_at` 方式）を踏襲。
4. **category CHECK vs app validation**: **DB は TEXT + app 層辞書 validation を採用**。理由: L-1 辞書は拡張前提で、DB CHECK に全 category を
   埋め込むと辞書追加のたびに c10/c11 型の CHECK 拡張 migration が必要（負債）。辞書 roundtrip は c26 normalizer が必須経路として test 固定済み
   （reader→DTO→normalizer で unknown は構造的に drop）。**menu は安定 3 値 enum（cut/color/treatment）→ DB CHECK も併用**（非対称は意図的）。
5. **1 table / 2 table**: **1 table**（`lifeops_structured_sources` + `source_type` 判別 + per-type 整合 CHECK）。共有列が大半（owner/category/menu/
   confidence/status/時刻）で、RLS/reader/migration が単一化。型整合は CHECK で担保（deadline 行に cadence 列が混ざれない）。
6. **occurrenceKey**: 本 table に `occurrence_key TEXT NULL` で保持（writer が `deriveLifeOpsOccurrenceKey` で導出・将来 UI slice）。reader→DTO 透過。
7. **archived 等**: `status IN ('active','archived')`（soft archive・候補化は active のみ）。物理 DELETE は owner RLS で可能（GDPR）だが契約上は archive 推奨。
8. **updated_at trigger**: 専用関数 `lifeops_structured_sources_set_updated_at()` + BEFORE UPDATE trigger（既存方式）。
9. **rollback**: 新規 table ゆえ clean DROP（trigger/function/index/policies→table の順・migration 末尾にコメントで同梱）。
10. **database.types**: draft 段階では未更新。**staging apply 後に supabase gen で更新**（apply slice の checklist 項目に予約）。

## 2. Schema（構造化のみ・forbidden column 不存在）

列 = id / user_id / source_type / category_id / menu / due_at / last_completed_at / typical_interval_days / occurrence_key /
confidence / status / created_at / updated_at。**free_text・title・note・memo・description・place_query・url・raw・source_ref・
calendar_title・event_name・store_name・location_name は列として存在しない**（表示名は辞書から導出する方針を維持・static test で恒久 lock）。

CHECK: source_type ∈ {deadline,cadence}／status ∈ {active,archived}／confidence ∈ {high,medium,low}／menu ∈ {cut,color,treatment}∪NULL／
typical_interval_days ∈ (0,730]／**deadline shape**（due_at 必須 ∧ cadence 列 NULL）／**cadence shape**（due_at NULL ∧ last_completed_at か interval の少なくとも一方）。

## 3. 流れ（DB row を candidate へ直接流さない・c26 接続）

```
DB row → column-restricted reader（select 列固定・user_id/id を DTO に出さない）
  → LifeOpsStructuredSourceRow（中間）→ rowsToStructuredSources（status=active のみ・enum 検証）
  → c26 structured DTO → c26 normalizer（辞書 roundtrip・ISO 検証・low drop）→ LifeOpsInputs → cap/collector/representative
```

## 4. flag / gate
`LIFEOPS_STRUCTURED_SOURCE_READONLY`（新 dormant・default OFF）。gate=master(`LIFEOPS_REALDATA_READONLY`) ∧ structured ∧ staging ∧ !production。
**本 slice では consumer 0**（mainline model へは未接続=実 DB read 経路なし・query 0 が構造的）。接続は staging apply 後の別 slice。

## 5. 変更ファイル
migration draft（apply 禁止注記+rollback 同梱）／新 `lifeops-structured-storage.ts`（pure: row DTO+変換+gate）／
新 `lifeops-structured-storage-readonly-source.ts`（server-only reader・型と gate のみ・consumer 0）／featureFlags（dormant 追加）／
新 test（GPT 14 lock）／docs/log。
