# Life Ops — A-4-c31 Structured Source Input Contract + Writer Gate Mini-Design

> 2026-06-11 / CEO・GPT GO（c30 finding 起点）。**禁止**: UI 入力フォーム・PlanClient 追加・production write/enable・
> migration 追加/apply・external API・calendar/free text 推定・notification・R4・push/PR/merge。**実 write smoke も本 slice では実行しない**（計画のみ）。

---

## 1. Audit（10 確認点への回答）

1. **insert contract**: c27 schema（c28 staging 実在・POST 監査済み）。payload は {user_id, source_type, category_id, menu, due_at,
   last_completed_at, typical_interval_days, occurrence_key, confidence, status} — **id/created_at/updated_at は省略**（DB DEFAULT・c12 の
   「明示 null は DEFAULT を殺す」教訓の適用）。
2. **RLS/user_id**: writer adapter が **auth context の userId を注入**（c9 writer と同 pattern）。client からは構造化 input のみ＝
   user_id/DB id/raw row を**受け取る口が型に存在しない**。
3. **辞書 validation**: `parseLifeOpsFeedbackHandle` roundtrip（全層共通の単一 firewall）を insert 前に必須通過。
4. **入力 shape**: deadline=`{sourceType,categoryId,menu?,dueDateISO}`／cadence=`{sourceType,categoryId,menu?,lastCompletedAtISO?,typicalIntervalDays?}`。
   DB CHECK と同じ shape validation を app 層でも実施（deadline=dueDate 必須／cadence=last か interval の少なくとも一方／interval∈(0,730] 整数）。
5. **occurrenceKey 生成規則（c30 finding の恒久対応）**: **deterministic・pure helper 固定・now/開始時刻は使わない**。
   deadline=`{categoryId}:{menu?}:{dueDate YYYY-MM-DD}`（c26 `deriveLifeOpsOccurrenceKey` 既存・due date 由来）／
   cadence=`{categoryId}:{menu?}:cadence`（新 helper・cadence は occurrence 概念がないため固定 suffix）。
   **builder が常に自動生成**＝呼び元が occurrence_key を渡す口を持たない（手書き値の混入が構造的に不可能）。
6. **duplicate 防止**: pure guard=同 source_type ∧ category_id ∧ menu(null 同値) ∧ occurrence_key ∧ status=active が既存 →
   `already_exists`（insert しない・2 件作らない）。existing rows は**呼び元が c27 reader で読んで注入**（c9 cooldown と同 pattern・writer は
   insert 1 query のみ＝隠れ read なし）。**DB unique index は設計のみ**（partial unique on (user_id, source_type, category_id,
   COALESCE(menu,''), occurrence_key) WHERE status='active'・migration 追加は別 slice）。
7. **update vs insert**: c31 は **insert のみ**（新規登録の最小経路）。期日変更=既存を archive→新 insert（occurrence が変わる＝履歴が事実として残る）
   を将来方針とし、UPDATE writer は UI 設計 slice で判断。
8. **archived/disabled**: writer は status='active' 固定で作成。archive 化（status 変更）は別 writer（将来）・reader/duplicate guard は active のみ対象（既存）。
9. **writer gate**: `isLifeOpsStructuredSourceWriteAllowed` = master(`LIFEOPS_REALDATA_READONLY`) ∧ **`LIFEOPS_STRUCTURED_SOURCE_WRITE`（新 dormant）**
   ∧ staging allowlist ∧ production deny。default OFF・production は flag ON でも false。
10. **cleanup/smoke 方針（計画のみ・実行は別 GO）**: c12 方式の guarded 1-row write smoke 案=GO env 必須・preflight（staging/prod/service_role）・
    before structured_active=0・builder 経由 1 件 insert（tax_filing/due+14d）→ read-after-write（reader→normalizer=1・**occurrence_key が
    `tax_filing::{dueDate}` であることを検証**=c30 finding の回帰 lock）→ duplicate guard 実証（同 input 再 write→already_exists・insert 0）→
    exact cleanup（occurrence_key 完全一致+source_type+status）→ 0。

## 2. 実装ファイル
新 `lifeops-structured-write.ts`（pure: input 型・validation+builder[occurrence 自動生成・confidence='high' 固定=明示 user 入力]・
duplicate guard・gate）／`lifeops-structured-source.ts`（+cadence occurrence helper）／新 `lifeops-structured-writer.ts`
（server-only skeleton: gate→validate/build→duplicate→insert 1 件・fail-open・**呼び元なし=dormant**）／featureFlags(+write dormant)／
新 test（GPT 16 lock）／docs/log。
