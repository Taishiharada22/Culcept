# SR S-save-1 — staging migration apply readiness（計画のみ・apply しない）

> 状態: **readiness（apply 未実施）**。本書は「何を・どう確認して・どう適用し・どう戻すか」を根拠付きで整理する計画書。
> **このフェーズで migration apply / DB write / RPC 実行は行わない**（CEO 別承認後に S-save-1 実行で着手）。
> 前提: S-save-2（saveEnabled server→prop dormant 配線）commit 済（`21069426`）。UI は flag OFF で dormant。

---

## 0. スコープと禁止

- **対象**: staging（`hjcrvndumgiovyfdacwc`）への shift 取り込み保存スキーマ 2 migration の apply 準備。
- **やる（本 readiness）**: 必要 migration 特定 / 適用状態の確認方法 / staging 証明 / production deny / backup・rollback / 確認 SQL / schema 整合 / replace 方針 / cleanup SQL。
- **やらない（禁止・本 readiness 範囲外）**: `supabase db push` / migration apply / `import_shift_roster` 実行 / DB write / `PLAN_SHIFT_IMPORT_SAVE=true` / production 接続 / VLM 再実行 / push・PR。

---

## 1. 必要な migration（2 本・適用順）

| 順 | ファイル | 内容 | 種別 |
|----|---------|------|------|
| ① | `supabase/migrations/20260530100000_sr_shift_import_source_type_and_day_indicators.sql` | `external_anchor_sources.source_type` CHECK に `'shift_image'` 追加 / `external_anchor_sources` に `UNIQUE(id, user_id)` 追加 / `plan_day_indicators` テーブル新設（RLS + composite FK + `UNIQUE(user_id,date)`） | additive |
| ② | `supabase/migrations/20260531100000_sr_shift_import_rpc.sql` | `import_shift_roster(uuid,date,date,jsonb,jsonb,jsonb)` RPC 新設（atomic range-scoped replace） + 関数権限（PUBLIC/anon REVOKE → authenticated GRANT） | additive |

- **適用順は ① → ②**（② header L5 が ① apply 済みを前提と明記）。
- 両ファイル header に「**本 migration は draft 状態。`supabase db push` / apply は CEO 別承認**」と明記（① L35 / ② L39）。
- ① header L36: staging 適用順は「既存 source_type migration（`20260529120000` microsoft）の後」。

---

## 2. staging への適用済み / 未適用の確認方法（read-only）

実 apply 前に、staging に①②が既に入っているかを **2 系統**で確認する（どちらも read-only・書込なし）。

**A. migration 履歴比較（CLI）**
```bash
# 事前に staging に link していること（§3 で証明）
supabase migration list --linked    # local と remote(staging) の差分を表示
# → 20260530100000 / 20260531100000 が remote 側に無ければ「未適用」
```
- 注意: `migration list` は `supabase_migrations.schema_migrations` の記録ベース。**out-of-band 適用や記録欠落で実体と乖離し得る**（Migration debt phase #189/#197 で staging/production 履歴乖離が既知）。よって B のスキーマ実体確認を**正本**とする。

**B. スキーマ実体の read-only 確認（正本・SQL probe）**
```sql
-- ① plan_day_indicators テーブルの存在
SELECT to_regclass('public.plan_day_indicators') IS NOT NULL AS has_table;

-- ① source_type CHECK に shift_image が含まれるか
SELECT pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conname = 'external_anchor_sources_source_type_check';
-- → 'shift_image' を含めば ① 適用済み

-- ② import_shift_roster 関数の存在
SELECT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='import_shift_roster'
) AS has_rpc;
```
- 実行は **SELECT のみ**（DDL/DML なし）。S-save-1 実行時に staging read-only 接続で叩く。
- **予測**: ①② は draft・apply は常に「CEO 別承認」だったため、**staging 未適用の可能性が高い**。ただし確定は B の結果で判定する（推測で進めない）。

---

## 3. apply 対象が staging である証明

- `supabase/.temp/project-ref` の現値 = `hjcr…wc` = `STAGING_PROJECT_REF`（`lib/plan/shift/devFixtureHost.ts` 定数）に**一致**（本 readiness 作成時点で read-only 確認済・masked 比較 PASS）。
- ただし `.temp/*` は CLI 管理で揺れる（git status で modified）。**apply 直前に再確認**を必須化:
```bash
cat supabase/.temp/project-ref          # = hjcrvndumgiovyfdacwc であること
supabase projects list                   # linked ● が staging 行であること
```
- S-save-0 の接続先 guard（`isShiftImportSaveConnectionAllowed`）とは別レイヤ。migration apply は CLI link 先で決まるため、**CLI link 先 = staging を人手で証明**してから push する（B1 #183 と同手順）。

## 4. production deny 確認

- `project-ref` ≠ `PRODUCTION_PROJECT_REF`（`alja…hl`）を apply 直前に明示確認（本 readiness 時点では不一致 = OK）。
- `supabase db push` は **link 先にしか効かない**。production に push しない担保は「link 先が staging であること」一点に集約 → §3 の再確認が production deny を兼ねる。
- 追加防御: push 前に `supabase migration list --linked` の出力ヘッダ（Remote database）が staging ref であることを目視。production ref が出たら**即中止**。

---

## 5. apply 前 backup / rollback 方針

**リスク評価（低）**: ①② は **純 additive**。
- ① `source_type` は `DROP CONSTRAINT IF EXISTS → ADD`（旧値 8 種を全部含む新 CHECK。既存 row は全て満たす → 破壊なし。① L19 で明記）。
- ① `plan_day_indicators` は `CREATE TABLE IF NOT EXISTS`（新規・既存データ非接触）。
- ① `UNIQUE(id,user_id)` は PK `id` ゆえ自明に一意（既存 row 影響なし。① L62）。
- ② は `CREATE OR REPLACE FUNCTION`（冪等・既存関数なし）。
- → **既存データの変更・削除なし**。実 DML は S-save-1 では発生しない（RPC 実行は S-save-3 以降）。

**backup**:
- staging のため本番 backup は不要だが、apply 直前に schema snapshot を取得（万一の差分追跡）:
```bash
supabase db dump --linked -f /tmp/staging_preapply_$(date +%Y%m%d).sql   # ※ /tmp、commit しない
```

**rollback SQL**（apply 後に取り消す場合・staging のみ）:
```sql
-- ② RPC 撤去
DROP FUNCTION IF EXISTS import_shift_roster(uuid, date, date, jsonb, jsonb, jsonb);

-- ① plan_day_indicators 撤去（派生データごと。staging のため許容）
DROP TABLE IF EXISTS plan_day_indicators;

-- ① source_type を旧 CHECK に戻す（shift_image を除外）
ALTER TABLE external_anchor_sources DROP CONSTRAINT IF EXISTS external_anchor_sources_source_type_check;
ALTER TABLE external_anchor_sources ADD CONSTRAINT external_anchor_sources_source_type_check
  CHECK (source_type IN ('manual','template','pdf','image','chat','ics','google_calendar','microsoft_calendar'));
-- 注: shift_image row が既にある場合この ADD は失敗する → 先に該当 source を整理（§10 cleanup）。
-- ① UNIQUE(id,user_id) は他に無害なので通常残置（撤去するなら DROP CONSTRAINT external_anchor_sources_id_user_unique）。
```

---

## 6. apply 後の確認 SQL（read-only）

```sql
-- ① テーブル
SELECT to_regclass('public.plan_day_indicators') IS NOT NULL AS has_table;             -- true 期待
-- ① RLS 有効
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.plan_day_indicators'::regclass; -- true 期待
-- ① policy 4 種
SELECT polname FROM pg_policy WHERE polrelid='public.plan_day_indicators'::regclass ORDER BY 1;
-- ① source_type CHECK
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='external_anchor_sources_source_type_check'; -- shift_image 含む
-- ② RPC 存在 + 権限（authenticated のみ EXECUTE / anon 不可）
SELECT proname, proacl FROM pg_proc WHERE proname='import_shift_roster';
```
- すべて SELECT。期待値を満たさなければ S-save-3（flag ON smoke）に進まない。

---

## 7. `import_shift_roster` RPC が存在するか

- **定義は存在**: `supabase/migrations/20260531100000_sr_shift_import_rpc.sql` L44–190。signature `import_shift_roster(uuid, date, date, jsonb, jsonb, jsonb) RETURNS jsonb`、`SECURITY INVOKER` + `SET search_path`、`authenticated` に EXECUTE 付与（L204）。
- **staging に適用済みかは未確認**（§2-B の probe で判定）。app 側は `createSupabaseShiftImportRpcClient`（`importShiftRosterAction`）から `client.rpc('import_shift_roster', …)` を呼ぶ前提で配線済（apply されるまで呼べば 404/関数なしエラー）。
- contract は DB なし unit test 済（② L40-41 が `tests/unit/plan/shift/shiftImportRepositoryRpc.test.ts` を参照）。実 SQL 挙動の検証は apply + staging smoke（S-save-4）で行う。

---

## 8. 必要 schema（external_anchor_sources / external_anchors / plan_day_indicators）

RPC が読み書きする 3 テーブルの整合（read-only 確認済の根拠付き）。

**external_anchor_sources**（既存）
- `source_type` に `'shift_image'` 追加（① 必要）。`UNIQUE(id,user_id)` 追加（① 必要・composite FK 前提）。
- RPC は `INSERT (user_id, source_type, original_filename)`（② L154-156）→ `original_filename` 列が必要（既存）。

**external_anchors**（既存・`supabase/migrations/20260430100100_external_anchors.sql`）— RPC INSERT 列の存在を確認済:
- `source_id UUID NOT NULL`（L128）/ `rigidity TEXT CHECK IN ('hard','soft')`（L149-150）/ `confirmed_at TIMESTAMPTZ NOT NULL`（L156）/ `anchor_kind CHECK IN ('one_off','recurring')`（L170-171）/ `date DATE`（L174）。
- RPC は `anchor_kind='one_off'` + `date` 指定で INSERT（② L160-166）→ one_off CHECK（L191-193「one_off → date 必須」）を満たす。**整合 OK**。
- **⚠ 要 apply 前確認（correctness gate）**: RPC は `e->>'rigidity'` をそのまま INSERT。external_anchors の CHECK は `'hard'|'soft'` のみ。よって **anchor payload の rigidity が必ず `'hard'`/`'soft'` であること**を S-save-3 前に確認する（`shiftRosterProjection.ts` の出力 or `shiftImportRepositoryRpc` の anchor 整形を点検。grep 上 projection 型に rigidity が明示露出していないため、repo 側 default を要トレース）。不一致だと RPC が CHECK 違反 → 全 rollback（safe だが保存失敗）。

**plan_day_indicators**（① で新設）— RPC INSERT 列（② L170-175）:
- `(user_id, source_id, date, kind, label, counts_as_public_holiday, raw_code, semantic_type, source_type)`。
- 制約: `kind IN ('off','off_request')`（① L88-89）/ `label btrim<>''`（L92-93）/ `UNIQUE(user_id,date)`（L110）/ `source_required`（L118-120）/ composite owner FK（L125-128）。
- **⚠ 要確認**: indicator payload の `kind` が `'off'|'off_request'` であること、`label` が非空であること（projection 出力 `countsAsPublicHoliday` は確認済 = `shiftRosterProjection.ts` L56/126）。

---

## 9. 同月再取り込み replace / supersede 確認方針

RPC の **range-scoped replace** が正しく「同月の前回 shift_image 取り込みのみ」を置換することを確認する（② L126-176）。

- **置換範囲**: `user_id` 一致 × `source_type='shift_image'` × `date ∈ [range_start, range_end)` のみ DELETE（indicators L127-131 / anchors L134-142）。**manual / Google / ICS / Microsoft / 他月は一切触らない**。
- **conflict-safe**: 新 indicator の日に `source_type='manual'` の手動印があれば、**何も書かず** `{status:'conflict', dates}` を返す（手動印を黙って上書きしない・② L111-124）。
- **source GC**: 子（anchors/indicators）を失った shift_image source を削除（② L147-151）。
- **直列化**: `pg_advisory_xact_lock(user × range_start)` で同月二重 submit を直列化（② L76）。
- **INSERT も range 内強制**: 範囲外 date が 1 件でもあれば書込前 RAISE（孤児化防止・② L78-88）。

**staging smoke（S-save-4）での確認シナリオ**:
1. 6月分を取り込み → anchors/indicators が入る。
2. **同じ 6月を再取り込み** → 前回 shift_image 由来のみ置換（件数が二重化しない / 他 source 不変）。
3. 手動休みのある日を含む月を取り込み → `conflict` 返却で**無保存**（手動印保持）。

---

## 10. cleanup SQL（staging テストデータ後始末）

staging smoke 後にテスト保存を消す（特定テストユーザー限定・read 後に実行）。
```sql
-- :uid = テストユーザー UUID（aneurasync@… 等、auth.users から取得）
-- shift_image 由来の anchors を削除
DELETE FROM external_anchors a
USING external_anchor_sources s
WHERE a.source_id = s.id AND s.user_id = :uid AND s.source_type = 'shift_image';
-- shift_image 由来の day_indicators を削除
DELETE FROM plan_day_indicators WHERE user_id = :uid AND source_type = 'shift_image';
-- 孤児 source を削除（RPC step3 と同条件）
DELETE FROM external_anchor_sources s
WHERE s.user_id = :uid AND s.source_type = 'shift_image'
  AND NOT EXISTS (SELECT 1 FROM external_anchors a WHERE a.source_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM plan_day_indicators d WHERE d.source_id = s.id);
```
- ON DELETE CASCADE（① L124/128）があるため source 削除でも派生は消えるが、明示削除で**確定的に空**にしてから次 smoke に入る。

---

## 11. apply 手順（将来 CEO GO 時・B1 #183 準拠。本 readiness では実行しない）

1. **Stop 1（証明）**: §3/§4 — link 先 = staging・production 不一致を人手確認。
2. **Stop 2（未適用確認）**: §2-B の probe で①②が未適用であることを確認（既適用なら skip）。
3. **Stop 3（dry-run）**: `supabase db push --dry-run --linked` で①②のみが対象であることを確認（他 migration が巻き込まれないか）。
4. **Stop 4（apply）**: CEO 個別 GO → `supabase db push --linked`。
5. **Stop 5（確認）**: §6 の確認 SQL 全 PASS。
6. link を元へ戻す（B1 同様、local 開発 link を汚さない）。

各 Stop で CEO 承認を取る（B1 と同じ多段ゲート）。

---

## 12. 残論点 / 申し送り

- **rigidity 整合（§8 ⚠）**: anchor payload の rigidity ∈ {hard,soft} を S-save-3 前にトレース確定（最優先・apply 後の保存失敗を防ぐ）。
- **migration 履歴乖離（§2 注）**: staging/production の履歴乖離が既知（#189/#197）。`migration list` を盲信せず schema 実体（§2-B）で判定。
- **S-save-1 と S-save-3 の分離**: 本 S-save-1 は **schema を入れるだけ**（DB に箱を作る）。flag ON での実保存は S-save-3、実画像 E2E は S-save-4。schema apply ≠ flag ON。
- **次工程順序**: S-save-1（本 apply・CEO 個別承認）→ S-save-3（`PLAN_SHIFT_IMPORT_SAVE=true` staging-only ON smoke）→ S-save-4（実画像→確認→保存→/plan 月 grid 反映）→ S-save-5（env rollback / cleanup）。
