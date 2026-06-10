# Life Ops — A-4-c10 M1 CHECK Extension Migration Draft Mini-Design（**draft のみ・apply 禁止**）

> 2026-06-11 / CEO・GPT 指示「write smoke の前提となる CHECK 拡張 migration を **draft のみ**設計。staging/production apply・write smoke・UI は禁止」。
> draft: `supabase/migrations/20260611090000_extend_prm_learning_events_lifeops_done.sql`（**未 apply**・plan_seeds 先例と同じ draft-in-repo 方式）。

---

## 1. 既存 CHECK 制約の監査結果

| column | 現 CHECK | 定義形 | 想定 constraint name |
|---|---|---|---|
| action | IN ('accept','dismiss','later') | **無名 inline** | `prm_learning_events_action_check`（PG 自動命名規約） |
| signal | IN ('adoption','non_adoption','deferral') | 無名 inline | `prm_learning_events_signal_check` |
| band | NULL or IN(morning/afternoon/evening) | 無名 inline | 変更なし |
| confidence_band | IN (high/medium/low) | 無名 inline | 変更なし |
| duration_min | NULL or ≥0 | 無名 inline | 変更なし |
| **source_kind** | **IN ('seed_explicit','correction')** | 無名 inline | `prm_learning_events_source_kind_check` |
- 無名 inline → **apply 前に実名確認が必須**（§7 checklist の query）。draft は `DROP CONSTRAINT IF EXISTS 想定名` + **明示名で再 ADD**（以後の変更を容易に）。

## 2. 追加する constraint 値（既存値は全保持・additive のみ）
`source_kind += 'lifeops'` ／ `action += 'done'` ／ `signal += 'completion'`（3 拡張を**同一 migration に同梱**＝c9 提案どおり・write smoke と将来 done を 1 gate で揃える）。

## 3. Migration draft 内容
superset CHECK への置換（DROP IF EXISTS → 名前付き ADD）×3。**既存 row は新制約を自明に満たす**（invalid 化ゼロ・即時検証）。RLS/index/order/他列に不変更。単一 tx。

## 4. Rollback / revert 方針
- **前提**: 新値 row が 0 件（`SELECT count(*) … WHERE source_kind='lifeops' OR action='done' OR signal='completion'`）。
- 残存時は先に **Life Ops 行のみ削除/隔離**（`DELETE … WHERE handle LIKE 'lifeops:%'`＝既存 seed/correction 行に不接触）→ narrow CHECK を再 ADD（SQL は draft 末尾に全文）。

## 5. Affected reader / writer / tests（監査）

| 対象 | 影響 | 対応 |
|---|---|---|
| c8 read adapter（lifeops） | 'done' を**読まない**（ACTIONS enum 外＝設計どおり・done 対応は将来 slice） | **lock test 追加**（done 行 drop を明示固定） |
| c8 二重識別 | CEO 方針「handle prefix ∧ source_kind='lifeops'」 | adapter に optional `source_kind` 追加（present ∧ ≠'lifeops' → drop・未指定は prefix のみ＝後方互換）+ test |
| **R1 episodic memory（私の所管）** | reader 実 consumer（memory ports→dev preview page）に lifeops 行が**混入しうる** | **先回り防御 filter 実装済**（`memory-episodic`: handle 'lifeops:' を episodic 化しない・migration 前でも無害）+ test |
| A1 review-decision route（他track） | M1 読み consumer。lifeops 行混入で dry-run 集計/label map（seed_explicit/correction のみ）に未知値 | **申し送り**（A1 所管）: lifeops 行 exclude（source_kind/prefix filter）を write 解禁前に推奨 |
| A1 dry-run label maps（dry-run-aggregation/prm-dry-run-projection/memory-model/second-self-presenter） | 'lifeops' label 未定義（表示欠落リスク・実害は混入時のみ） | 同上申し送り |
| c9 writer | migration 後にそのまま insert 可（row は既に source_kind='lifeops'） | 変更不要（contract 済） |
| 型 union（EvidenceSourceLabel 等） | 既存 union は拡張**しない**（plan-seed 文脈を汚さない・lifeops は独自 shape） | 変更なし（c9 設計どおり） |

## 6. A-4-c8 / c9 との整合
- c9 row（source_kind='lifeops'）→ migration 後 insert 可 → c8（prefix ∧ source_kind）→ 同一観測（roundtrip 維持・test）。
- `done` 追加後: **cadence の正式ソース＝done のみ**・c8 の tentative `accept` proxy は **done 読み対応 slice で退役**（本 slice では c8 挙動を大きく変えない＝CEO 指示・done は drop のまま lock）。

## 7. Staging apply 前 checklist（**apply は別 GO**）
1. branch/ref: staging `hjcrvndumgiovyfdacwc` を確認・**production `aljav…` でない**こと（`supabase/.temp/project-ref` と link 先を照合）。
2. service_role を使わない運用確認（migration は CLI link 経由・anon/auth と無関係だが env 汚染なきこと）。
3. **constraint 実名確認**: `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='prm_learning_events'::regclass AND contype='c';` → 想定名と不一致なら draft を実名に修正。
4. row count before: `SELECT count(*) FROM prm_learning_events;`（変化しないこと）。
5. apply → 再度 constraint 確認（3 値が新 IN リスト）→ row count 不変確認。
6. **write smoke は別 GO**（c9 §7 の条件: lifeops 1 行のみ・read-after-write lifeops_prefix=1・cleanup→0・counts log のみ）。
7. cleanup 手順: rollback §4（lifeops 行 0 確認 → narrow CHECK 戻し）。

## 8. 本 slice の検証
draft SQL は **apply しない**（local static validation=SQL 構文・既存 migration 形式との整合の目視+lint 相当）。コード変更は c8 二重識別・episodic 防御 filter・lock tests のみ（挙動は additive 防御）。
