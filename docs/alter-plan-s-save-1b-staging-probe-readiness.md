# SR S-save-1B — staging link 証明 / schema probe readiness（read-only・apply しない）

> 状態: **readiness（probe 未実行）**。本書は「staging に正しく向いているか」「必要 schema が実在するか」を
> **read-only で確認する手順**を整理する。**DB write / migration apply / db push / RPC 実行は行わない**。
> 前提: S-save-1A（payload CHECK-mirror contract）commit 済（`da2d6aca`）。rigidity 整合リスクは解消（Case A）。
> 関連: S-save-1 readiness（`80b9b637`、`docs/alter-plan-s-save-1-migration-readiness.md`）§2–4 を本書で深掘り。

---

## 0. スコープと禁止

- **やる（本 readiness）**: ① link=staging の 3 ソース証明手順、② production deny、③ schema 実体 probe の SELECT 群、
  ④ migration list の補助扱い、⑤ 実体正本の理由、⑥ probe の write 非発生保証、⑦ 1C dry-run 進行条件。
- **やらない（禁止）**: probe の実行（live 接続）すら本 readiness では行わない（手順整理のみ）。
  `supabase db push` / migration apply / RPC 実行 / DB write / `PLAN_SHIFT_IMPORT_SAVE=true` / production 接続 / push。

---

## 1. staging link をどう証明するか（3 ソース一致）

単一ソースを信用しない。以下 **3 つが全て staging ref（`hjcrvndumgiovyfdacwc`）で一致**して初めて「staging に向いている」と確定する。

| # | ソース | 確認コマンド | 性質 |
|---|--------|------------|------|
| A | CLI link 記録 | `cat supabase/.temp/project-ref` | CLI 管理・**揺れる**（git status で modified 既知） |
| B | リモート link マーカー | `supabase projects list` の ● 行 | Supabase 側の現 link（auth token 必要・read-only） |
| C | probe 接続先 | probe を流す接続文字列（§3 transport）に含まれる ref | **実際に SELECT が当たる先**＝最重要 |

- **A 単独は不可**（`.temp/*` は CLI で書き換わる）。**C が最終的に意味を持つ**（probe が当たる DB こそ確認対象）。
- S-save-1 時点の観測: A = `hjcr…wc` = staging（masked 確認済）。ただし **probe 実行直前に A/B/C を再取得**して一致を確認する（stale 防止）。
- 不一致が 1 つでもあれば **停止**（link 状態が曖昧なまま probe しない）。

## 2. production ref でないことをどう確認するか

- 上記 A/B/C の各 ref が `PRODUCTION_PROJECT_REF`（`aljavfujeqcwnqryjmhl`、`lib/plan/shift/devFixtureHost.ts`）と**不一致**であることを確認。
- 特に **C（probe 接続文字列）に production ref が含まれないこと**を目視。含まれたら **即中止**。
- 判定論理は S-save-0 の `isShiftImportSaveConnectionAllowed` と同型 = **staging allowlist（含む）∧ production deny（含まない）**。これを probe 接続に人手適用する。
- アプリ実行の保存 guard（S-save-0）とは別レイヤ。probe / migration は CLI/psql 接続先で決まるため、**接続先 ref を人手で allowlist∧deny** する。

## 3. schema probe で何を SELECT するか（read-only SQL）

**transport（どう流すか）**: 以下のいずれか。**推奨は B（dashboard SQL editor）**＝credential を手元で扱わず、画面上で「staging プロジェクト」を目視確認できる。
- A. `psql "<staging 接続文字列>" -c "<SQL>"` — 接続文字列に staging ref 含有を §2 で確認してから。DB 認証情報が必要（CEO が実行時に用意・**Claude は値を扱わない / 出力しない**）。
- B. **Supabase dashboard → staging プロジェクト → SQL Editor**（推奨）— プロジェクト名で staging を目視、SELECT のみ貼り付け実行。

**probe SQL（全て system catalog への SELECT。write を一切含まない）**:
```sql
BEGIN;
SET TRANSACTION READ ONLY;   -- 物理的に write 不能（INSERT/UPDATE/DDL は error）

-- ① plan_day_indicators テーブル実在
SELECT to_regclass('public.plan_day_indicators') IS NOT NULL AS has_plan_day_indicators;

-- ② source_type CHECK に shift_image が含まれるか
SELECT pg_get_constraintdef(oid) AS source_type_check_def
FROM pg_constraint
WHERE conname = 'external_anchor_sources_source_type_check';

-- ③ import_shift_roster 関数の実在 + 引数 signature
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'import_shift_roster';

-- ④（補助）保存先 external_anchors の rigidity CHECK 実在（payload 前提の裏取り）
SELECT pg_get_constraintdef(oid) AS rigidity_check_def
FROM pg_constraint
WHERE conrelid = 'public.external_anchors'::regclass AND conname LIKE '%rigidity%';

-- ⑤（補助）plan_day_indicators の RLS + policy + UNIQUE（適用済時のみ意味を持つ）
SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.plan_day_indicators');
SELECT polname FROM pg_policy WHERE polrelid = to_regclass('public.plan_day_indicators') ORDER BY 1;

ROLLBACK;  -- 何も変えずに閉じる
```
- ④ は「external_anchors 側 CHECK が `'hard'|'soft'`」を DB 実体でも裏取り（S-save-1A は app 側で確認済 → DB 側も一致を確認して二重化）。
- ③ の args 期待値: `uuid, date, date, jsonb, jsonb, jsonb`（migration `20260531100000` L44-51 と一致）。

## 4. migration list を補助情報としてどう扱うか

- `supabase migration list --linked` は `supabase_migrations.schema_migrations`（**記録テーブル**）の SELECT。
- 用途: `20260530100000` / `20260531100000` が **remote 側に記録されているか**の **ヒント**。
- **最終判定には使わない**。記録は「適用したと主張する行」であって、DDL の成否・手動変更・out-of-band 適用を保証しない。
  staging/production の migration 履歴乖離は既知（#189「list 比較」/ #197「migration debt」）。
- 記録（list）と実体（§3 probe）の**両方を取得し、一致/乖離を明示記録**する。

## 5. schema 実体確認を正本にする理由

- RPC（`import_shift_roster`）が実際に動くかは「**テーブル / 関数 / 制約が物理的に存在するか**」だけで決まる。
- migration 記録は「適用記録」に過ぎず、次のケースで実体と乖離し得る:
  - DDL 途中失敗だが記録だけ残った / `migration repair` で記録のみ書換 / 別経路（dashboard）で手動 DDL。
- よって `to_regclass` / `pg_proc` / `pg_constraint` の **SELECT 結果＝現実のスキーマ**を正本とし、乖離時は実体を信じる。
- これは「箱（schema）が本当にあるか」を保存実行（S-save-3/4）の前に確定するためであり、記録の有無では保存事故（CHECK/関数欠落）を防げない。

## 6. probe 実行時に DB write が起きないこと

- probe SQL は **system catalog（pg_catalog / information_schema）への SELECT のみ**。INSERT / UPDATE / DELETE / DDL を一切含まない。
- `BEGIN; SET TRANSACTION READ ONLY; … ; ROLLBACK;` で囲み、**read-only tx 内では write が error** になる（物理保証）。
- `supabase db push` / migration apply は **この段で実行しない**（記録も実体も変えない）。
- 結果として probe は**冪等・無副作用**（何度流しても DB 状態不変）。
- transport B（dashboard SQL Editor）でも同じ SQL を貼るだけ＝write なし。

## 7. 次の dry-run（1C）に進む条件

以下を**全て満たしたら** 1C（dry-run）へ。1 つでも欠ければ停止して CEO 報告。

- ✅ §1 の link 3 ソース（A/B/C）が **staging で一致**。
- ✅ §2 production ref 不含（A/B/C すべて）。
- ✅ §6 probe が **read-only tx で完了・DB write 0**。
- ✅ §3 probe 結果の解釈が確定:
  - **3 主オブジェクト（②source_type CHECK に shift_image / ①table / ③function）が全て不在** → 未適用 →
    1C dry-run で `20260530100000`+`20260531100000` のみが pending に出ることを確認 → 1D apply（CEO GO）。
  - **全て存在** → 既適用 → apply skip、1E 確認 SQL のみ。
  - **一部のみ存在**（部分適用/乖離）→ **停止して CEO 報告**（原因究明。安易に apply しない）。
- ✅ §4 migration list（補助）と実体の関係を記録（一致 or 乖離を明示）。

---

## 8. transport / credential 境界（独立判断・申し送り）

- schema probe は live staging 接続が要るため、**本 readiness では未実行**（手順確定のみ）。実行は 1B-exec or 1C pre-flight で CEO gate 下。
- **推奨 transport = Supabase dashboard SQL Editor**（staging プロジェクトを画面で目視、SELECT 貼付）。理由: DB 認証情報を Claude が扱わず、接続先を視覚的に staging と確定できる。
- psql transport を採る場合、接続文字列は CEO が実行時に用意し、**Claude は値を出力 / commit しない**（masked 比較のみ）。
- いずれの transport でも §3 の read-only SQL をそのまま使う（write 不能）。

## 9. 次工程順序（再掲・apply はまだ）

```
S-save-1A: payload CHECK-mirror contract / test   ← 完了（da2d6aca）
S-save-1B: staging link / schema probe readiness  ← 本書（probe 未実行）
S-save-1C: dry-run（supabase db push --dry-run）   ← §7 条件成立後・CEO GO
S-save-1D: migration apply（CEO 個別 GO 後）
S-save-1E: apply 後 確認 SQL（§3 を適用後にも流す）
```
