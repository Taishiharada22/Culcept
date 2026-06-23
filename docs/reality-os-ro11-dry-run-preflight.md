# RO-11 — Local-only Canonical Task Migration Dry-Run Preflight

- **作成日**: 2026-06-21
- **branch**: `claude/task-store-migration-rebase-20260621`（base = local main `bcf84157c`）
- **状態**: docs-only。**実行�していない**（local Supabase start / migration apply / SQL / DB 接続なし）。本 doc は dry-run 実行前の条件・手順・停止条件を固定する preflight。
- **scope**: Canonical Task Store Migration / RO-11 のみ。CoAlter / Origin / Travel / root asset / UI / RO 残 pure kernel は扱わない。

---

## 1. 現在の branch / HEAD / commit 連鎖

```
bcf84157c (base = local main・UX-1〜6 統合済)
 └ 032dc81cd  C0-a RO-8〜10 carry-forward manifest (docs)
 └ adc226df1  C0-b RO-branch-wide manifest (docs)
 └ e7088f3cb  C1   realityCore 11本 pure kernel (byte一致・tsc55)
 └ cc004b56f  C2   pure source2 + test4 (closure13・72 tests PASS)
 └ 61ddb7e92  C0〜C2 closeout audit (docs)
 └ 0d9f92690  R2 DB open decisions pack (docs)
 └ 637465bb3  open decisions 13項目 CEO裁定反映 (docs) ← HEAD
```
working tree: **`.temp` 以外 clean**。

## 2. C0〜C2 + R2 裁定済み状態

- **C0**: carry-forward manifest（旧RO `42ab074bc` → 新base path単位選別）確定。
- **C1**: canonical task pure kernel **realityCore 11本** carry（byte一致・tsc 55維持）。
- **C2**: pure source 2 + test 4（closure 13本で閉・vitest 72 PASS）。
- **R2**: DB open decisions **13項目すべて CEO 裁定済**（推奨案全採用・`637465bb3`）。
- kernel は **DB 無しで自己完結（in-memory 投影）**。永続化は次フェーズ。

## 3. RO-11 の目的

local-only で canonical task migration の **dry-run** を行い、`canonical_tasks` schema/RLS/trigger/rollback の健全性を **実DBに触れず local だけ**で実証する。

- ✅ **local-only**（Docker 上の local Supabase のみ）
- 🚫 **staging はまだ不可**（real extraction / 完全 RLS smoke は staging dry-run = 別後続 GO）
- 🚫 **production 絶対不可**

## 4. 実行前の必須条件（現在値・2026-06-21 測定）

| 条件 | 目安 | 現在値 | 判定 |
|---|---|---|---|
| disk 空き | ≥ 5GB（local stack image + volume） | **5.2Gi** | 🟡→🟢 改善（margin 小・start前に再測） |
| Docker 起動 | RUNNING | **RUNNING** | 🟢 |
| Supabase link | production ref でないこと | **unlinked（ref 空）** | 🟢 |
| production ref 不一致 | `cat supabase/.temp/project-ref` ≠ `aljavfujeqcwnqryjmhl` | 空（=production でない） | 🟢 |
| local Supabase start 可否 | `supabase start` 成功 | 未実行（GO待ち） | ⏸ |
| working tree clean | `.temp` 以外差分なし | clean | 🟢 |
| supabase CLI | 利用可 | 2.75.0 | 🟢 |
| sql.draft 所在 | dry-run 対象が参照可能 | **本branch不在**（旧RO `42ab074bc` に温存） | ⚠️ 要 carry 判断 |

> ⚠️ **sql.draft は本 branch に未 carry**。dry-run 実行時に「sql.draft を本 worktree に持ち込む（docs/ として参照 or migration 昇格）」判断が要る。migration 昇格は別 GO。

## 5. migration dry-run の対象

1. **RO-10 sql.draft**（`docs/reality-os-ro10-canonical-task-migration.sql.draft`・旧RO温存）
2. **`canonical_tasks` CREATE TABLE**（id uuid PK / user_id FK / source_task_id / source_kind CHECK 3値 / soft archive `archived_at` / UNIQUE(user_id,source_kind,source_task_id) ほか）
3. **RLS**（owner-only 4 policy・`auth.uid()=user_id`・service_role 不使用）
4. **trigger**（`set_canonical_task_updated_at` neutral 関数）
5. **daily_orbit_state read-only extraction**（[E1]/[E2]・SELECT のみ）
   - ⚠️ local には real data なし → extraction は **0 件想定**（SQL の syntax/plan 検証のみ。real 件数照合は staging dry-run = 別 GO）
6. **two-pass parentId**（[E3]・一時列 `_source_parent_id`）
7. **rollback rehearsal**（DROP TABLE/FUNCTION + 元データ不変 + 再 apply 冪等）

## 6. 停止条件（いずれか該当で即停止・報告）

- 🔴 worktree が **production-linked**（`project-ref` = `aljavfujeqcwnqryjmhl`）
- 🔴 disk 不足（start 前 / 途中で 5GB 未満に低下・ENOSPC 兆候）
- 🔴 Docker 不在 / 停止
- 🔴 `supabase start` 失敗（image pull 失敗・port 競合・auth schema 起動不全）
- 🔴 RLS smoke 失敗（自分 read 不可 / 他者 read 可 / production-url 非 reject）
- 🔴 rollback rehearsal 失敗（DROP 後に残留 / 再 apply 非冪等 / 元データ破壊）
- 🔴 **想定外の write path**（daily_orbit_state への書込・remote 接続・service_role 経路の混入）

## 7. dry-run で許可される操作（local-only）

- ✅ **local Supabase のみ**（Docker 上・`supabase start`）
- ✅ local DB の **CREATE TABLE / CREATE POLICY / CREATE FUNCTION / CREATE TRIGGER / DROP**（rollback rehearsal）
- ✅ **read-only extraction 確認**（[E1]/[E2] SELECT・local の空 data に対し syntax/plan 検証）
- ✅ rollback rehearsal（DROP + 再 apply 冪等確認）
- ✅ projection roundtrip（DB行型 → `CanonicalTaskV0` → `projectCanonicalTaskToRealityNode` → `taskRealityNodeViolations=[]`。検証用の最小行が要る場合は **local-only の test row 可否を CEO に確認**＝§12 open）

## 8. dry-run で禁止される操作

- 🚫 **remote db push**（`supabase db push`）
- 🚫 **staging / production への SQL**
- 🚫 **seed 本番投入**（production/staging へのデータ投入）
- 🚫 **service_role** 経路
- 🚫 **SECURITY DEFINER** 関数
- 🚫 sql.draft の **migration 昇格**（`supabase/migrations/` への .sql 追加）＝別 GO
- 🚫 production 接続 / origin-main・main 直 push / UI・featureFlags 変更

## 9. RO-11 実行手順案（step-by-step checklist・実行は別 GO）

> 各 step は CEO GO 後に着手。1 つでも 🔴 停止条件に当たれば中断・報告。

- [ ] **P0** 事前測定: `df -h /`（≥5GB）/ `docker info`（RUNNING）/ `cat supabase/.temp/project-ref`（空 or 非production）/ `git status`（clean）
- [ ] **P1** sql.draft を本 worktree に **docs として** 用意（migration 昇格はしない・local apply 用の一時 .sql は local 専用で `supabase/migrations/` に置かない方法を別途確定）
- [ ] **P2** `supabase start`（local stack 起動・**remote link しない**）→ 起動後 `supabase status` で local url 確認（127.0.0.1 系であること）
- [ ] **P3** local DB に canonical_tasks `CREATE TABLE` + RLS + trigger 適用（**local のみ**）
- [ ] **P4** migration-check 観点で RLS 漏れ / 破壊的変更 / 依存順序を確認
- [ ] **P5** extraction [E2] audit を local で実行（real data なし → 0 件・SQL 健全性のみ）
- [ ] **P6** two-pass [E3] の SQL 健全性確認（local・dangling=0 想定）
- [ ] **P7** RLS smoke（local 2 user で a/b/c・**test row の local 投入可否は §12 で要確認**）
- [ ] **P8** projection roundtrip 検証（最小行・§12 確認後）
- [ ] **P9** rollback rehearsal（DROP TABLE/FUNCTION → 残留なし → 再 apply 冪等）
- [ ] **P10** `supabase stop`（local stack 停止）→ disk 復元確認
- [ ] **P11** 結果を §10 フォーマットで CEO 報告 → staging dry-run / production の GO 判断は別

## 10. dry-run 成功時の報告フォーマット

```
RO-11 local dry-run 結果（YYYY-MM-DD）
- 環境: local Supabase url=127.0.0.1:xxxx / Docker=RUNNING / link=unlinked
- P0 事前: disk=__Gi / docker=RUNNING / ref=空 / tree=clean
- P3 schema: CREATE TABLE/RLS(4)/trigger = OK/NG
- P5 extraction: total=0 / skipped_no_id=0 / skipped_no_text=0（local 空 data・syntax OK/NG）
- P6 two-pass: dangling=0 / SQL OK/NG
- P7 RLS smoke: (a)自分read=__ (b)他者reject=__ (c)production-url reject=__
- P8 projection: violations=[] OK/NG
- P9 rollback: DROP 残留=なし / 元データ不変=確認 / 再apply冪等=OK/NG
- 判定: local dry-run PASS / FAIL（FAIL は §11）
- 次GO候補: staging dry-run（real extraction + 完全 RLS smoke）は別 CEO GO
```

## 11. dry-run 失敗時の停止 / rollback 方針

- いずれかの step が NG → **その場で中断**し、現状（どの step / エラー全文 / disk・docker・link 状態）を報告。
- local に作った canonical_tasks は **`DROP TABLE public.canonical_tasks CASCADE; DROP FUNCTION public.set_canonical_task_updated_at();`** で除去（local のみ・元 daily_orbit_state は read-only ゆえ無傷）。
- `supabase stop` で local stack 停止・disk 復元。
- **remote には一切触れていないため remote rollback は不要**（local-only の不変条件）。
- 失敗原因が schema/RLS/extraction の論理であれば、sql.draft 改訂は **別 GO**（本 dry-run では改訂しない）。

## 12. 次 GO（CEO 判断待ち）

1. **本 preflight doc を commit**（docs-only）後、**実 local dry-run（§9 P0〜P11）へ進むか** を CEO 判断。
2. **open 論点（dry-run 実行前に確定したい）**:
   - (a) **sql.draft の持ち込み方法**: local apply 用の .sql を `supabase/migrations/` に置かず local 専用で扱う方法（migration 昇格は別 GO のため）。
   - (b) **RLS smoke / projection 用の local test row**: local-only の synthetic insert を許可するか（§8「seed 本番投入」禁止とは別物だが、INSERT 系のため明示確認したい）。許可しない場合、RLS smoke は policy 作成確認まで＝完全 smoke は staging dry-run へ。
   - (c) **local stack の disk 影響**: `supabase start` の image pull 後の実空き再測（現 5.2Gi）。

---

## 停止条件（本 doc）

本 preflight（docs-only）で停止。**local Supabase start / Docker 操作 / migration 昇格 / SQL / DB 接続は実施しない。** 実 dry-run 着手は CEO 明示 GO 後。
