# P4-PROFILES-GRANT-RLS-FIX-PLAN（2026-06-26）

> 新 clean prod（`plodugvgmdkusifdrdfz`）の 42501 を、コード読取と migration 監査だけで確定した修正計画。
> **本書は計画 + ドラフト。Supabase db push / SQL 実行 / migration up / seed / redeploy / flag ON / origin push は一切していない。**
> CEO 提供の生テスト: `code 42501 / permission denied for table profiles / hint: GRANT SELECT ON public.profiles TO anon`。

## 結論（先に1行）
**env/key 問題ではない。新 clean prod に「public schema の role GRANT」が付いていない**（migration が GRANT を持たず Supabase 既定の自動 grant に依存 → clean prod で未適用）。**RLS と owner policy は健全**。欠けているのは GRANT だけ。**profiles 単独でなく全 table 系統的**。

---

## 1. `profiles` owner column
- **owner = `id`**（`supabase/migrations/20260101000000_layer1_minimal_base.sql:50-102`）
  - PK = `id`（L77-78）、`id` は `auth.users(id)` への FK・`ON DELETE CASCADE`（L101-102）。
  - つまり 1 user = profiles.id = `auth.uid()`。RLS policy も `auth.uid() = id` で owner 判定。

## 2. baseline route の update 条件
- `app/api/baseline/route.ts`: `supabaseAdmin.from("profiles").update({...}).eq("id", user.id)`
  - **client = `supabaseAdmin`（service_role）**。RLS を bypass する＝**service_role に profiles の UPDATE 権限が必要**。
- 参考: stargazer 観測保存は `app/api/stargazer/observations/route.ts:76` で **`supabaseServer()`（authenticated session）** を使い insert/upsert/update → **authenticated に各 table の権限 + RLS policy が必要**。
- health は `app/api/health/route.ts` で **anon** が `profiles.select("id", head)` → **anon に profiles SELECT が必要**。

## 3. 既存 GRANT の有無
- **無し（全 migration を通して 0）**。
  - `grant ... profiles` … 0 件。
  - `grant ... on all tables` / `alter default privileges` / `grant usage on schema public` … **migration 全体で 0 件**。
- ⇒ 全 table が Supabase の「既定 default privileges による自動 grant」に依存。staging（通常 project）は効いていたが clean prod では未適用 → 42501。**これが系統的欠落の核心。**

## 4. 既存 RLS / policy の有無（profiles）
- **RLS 有効**（L106 `ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;`）。
- **owner-only policy 完備**（追加不要）:
  - `profiles_select_own` FOR SELECT USING `auth.uid()=id`（L118）
  - `profiles_update_own` FOR UPDATE USING `auth.uid()=id`（L121）
  - `profiles_upsert_own` FOR INSERT WITH CHECK `auth.uid()=id`（L124）
  - `user own profiles`（authenticated・id=auth.uid）（L127）/ `admin all profiles`（is_admin）（L115）
- stargazer 主要保存先も RLS+policy 在: `stargazer_star_maps`(RLS+select/insert/update/delete own)・`stargazer_observations`・`stargazer_profiles`。
- ⇒ **policy 側に欠落なし。新規 policy は作らない**（壊さない）。

## 5. 欠けている権限（=修正対象）
| role | 必要権限 | 現状 | 影響している症状 |
|---|---|---|---|
| `service_role` | profiles ほか全 table の ALL | 未付与 | **baseline 保存 500/失敗** |
| `authenticated` | stargazer_* ほか全 table の ALL（RLS が行保護） | 未付与 | **stargazer 観測/俳句 保存失敗** |
| `anon` | 最小（schema USAGE・関数 EXECUTE・profiles SELECT） | 未付与 | **/api/health 503（supabase=error）** |

## 6. 最小 idempotent migration 案
- ファイル（ドラフト・未適用）: `supabase/migrations/20260626120000_restore_schema_grants_clean_prod.sql`
- **安全側を既定**にした（理由は §RLS カバレッジ警告）:
  - `authenticated` / `service_role` … 全 table/sequence に ALL + default privileges。
  - `anon` … schema USAGE + 全関数 EXECUTE + **`profiles` SELECT のみ**（health 用）。
- これで 3 症状（baseline=service_role / stargazer=authenticated / health=anon→profiles）を full 解消。
- policy 追加なし・冪等（再実行 no-op）。

### ⚠️ RLS カバレッジ警告（anon を広げない理由）
- 監査: **enable-RLS 257 行 / create-table 301 行** → **RLS 未有効の public table が ~44 存在する可能性**。
- もし anon に blanket ALL を付与すると、それら非 RLS table が **anon に素通し**（情報漏洩/書込）になる恐れ。
- ⇒ 既定ドラフトは anon を最小に絞った。anon 到達ページ（PUBLIC_PATHS の `/`・`/stargazer` 等）が anon で別 table を読む場合は graceful（`data||[]` fallback）で空表示になるだけで、ハードクラッシュしない設計（過去監査済）。必要が判明した table だけ後追いで `GRANT SELECT ... TO anon` を足す。

### 代替案A（full standard restore = staging parity）— 条件付き
- 検証 SQL #2 で「RLS 未有効の public table が **無い**（または非機密のみ）」と確定できたら、staging と同一の Supabase 標準 posture に切替可:
  ```sql
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  ```
- メリット: 既知 good（staging と完全一致）。デメリット: 非 RLS table があると anon 露出（だから #2 が gate）。

### health を service_role/別 table に変える案（task #3 の比較）
- **不要と判断**。既定ドラフトの `GRANT SELECT ON public.profiles TO anon` で health は通る（anon は RLS により 0 行が返るが**エラーにはならない**＝`supabase:"ok"`/200）。コード変更を伴わない方が最小・安全。
- （将来 health をより堅くしたいなら service_role 化も可だが今回スコープ外。）

## 7. 適用順序案（CEO GO 後・段階）
1. **local（dry-run）**: `supabase db push --dry-run`（または migration の SQL を local DB で実行）→ パース/冪等確認。書込先 local のみ。
2. **staging（`hjcrvndumgiovyfdacwc`）に先行 apply**: ここは元々自動 grant が効いている＝本 migration は実質 no-op のはず（冪等確認・退化ゼロ確認）。CLI link が staging を指していること二重確認。
3. **prod（`plodugvgmdkusifdrdfz`）に apply**: **CEO GO + DB owner（=CEO）実行**。検証 SQL #1/#2 を apply 前後で実行。
4. apply 後検証: `curl https://culcept.vercel.app/api/health` → **200 / supabase:"ok"**（login 不要の合否判定）→ その後 prod login→baseline 1 回保存成功を確認。
- ⚠️ `supabase db push` は他の pending migration を巻き込む恐れ（B-7 の既知 drift）。**この grant migration だけを狙って適用する手段（単体 SQL を Supabase SQL Editor で実行 / 対象 migration だけ apply）を CEO と確定してから**実行。安易な全 push はしない。

## 8. 本番適用前の検証 SQL（read-only・CEO が Supabase SQL Editor で実行）
```sql
-- #1 現状の profiles への role 権限（適用前=空に近い / 適用後=anon:SELECT, authenticated/service_role:全権 を確認）
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='profiles'
ORDER BY grantee, privilege_type;

-- #2 【最重要】RLS 未有効の public table を列挙（anon blanket grant の安全性 gate）
--    0 行なら代替案A（full restore）も安全。行があれば既定ドラフト（anon 最小）を使う or 該当 table に RLS を入れる。
SELECT n.nspname AS schema, c.relname AS table, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false
ORDER BY c.relname;

-- #3 profiles の RLS policy が実在するか（owner-only が効いていること）
SELECT polname, cmd, roles::regrole[]
FROM pg_policy WHERE polrelid='public.profiles'::regclass;

-- #4 service_role が profiles UPDATE を持つか（適用後に true を確認）
SELECT has_table_privilege('service_role','public.profiles','UPDATE') AS svc_update,
       has_table_privilege('authenticated','public.profiles','UPDATE') AS auth_update,
       has_table_privilege('anon','public.profiles','SELECT') AS anon_select;
```

---

## 禁止事項（本セッション）
db push しない / SQL 実行しない / migration up しない / seed しない / env 値表示しない / service_role 表示しない / redeploy しない / flag ON しない / origin/main push しない。

---

## ADDENDUM（2026-06-26）— RLS 未有効 table 実リスト分類 + Plan B 確定版

### A. RLS 未有効 public table（migration 静的差分・26 件・`if` は解析ノイズ）
| 分類 | table | mainline 関与 |
|---|---|---|
| **archive/legacy（fashion/luxury/body/style/shoe/calendar-outfit）** | garment_color_profiles, garment_fit_profiles, luxury_cards, luxury_impressions, luxury_lane_scores, luxury_lanes, luxury_results, shoe_width_master, style_drive_battles, style_drive_votes, user_body_avatar_jobs, user_body_avatar_profiles, user_body_measurements, user_body_profiles, user_personal_color_profiles, calendar_outfits | 無（MAINLINE_SCOPE_ONLY 404）。grant 不要 |
| **mainline だが今回 3 経路スコープ外** | calendar_events（/plan calendar）, stargazer_axis_scores, stargazer_weight_calibration | 将来。投入時に RLS 整備 → 最小 grant |
| **infra/admin** | app_admins（is_admin が参照）, experiment_assignments, ceo_skill_runs | backend/admin |
| **rendezvous（分離予定）** | rendezvous_chat_milestones, rendezvous_growth_nudges, rendezvous_score_history | 分離対象 |
| **3 経路で必要（baseline）** | **user_weather_settings** | ✅ ただし **service_role 限定**で付与＝非露出 |

→ **blanket（Plan A）は不可**: archive 系を含む 26 table が anon/authenticated に露出する。Plan A 採用には先に RLS 一括整備が前提。

### B. Plan B（table-specific minimal）= 採用案（安全検証済）
anon/authenticated へ付与する 9 table は**全て RLS 有効 + owner 書込 policy 在**（python 静的検証済）:
| table | anon | authenticated | service_role | RLS+policy |
|---|---|---|---|---|
| profiles | SELECT | ALL | ALL | ✅ select/update/insert own + admin |
| stargazer_observations / resolved_types / star_maps / profiles / axis_snapshots / daily_states / footprint_summaries | – | ALL | – | ✅ owner insert/select(/update) |
| rendezvous_ideal_partner_profiles | – | ALL | ALL | ✅ owner insert/select/update |
| user_weather_settings | – | **–** | ALL | RLS無効 → **service_role 限定で非露出** |
| rendezvous_profiles | – | – | ALL | ✅（service_role 書込のみ） |

- health（anon→profiles）/ baseline（service_role）/ stargazer 保存（authenticated）を full 解消。
- **RLS 無効 table を anon/authenticated に一切渡さない**＝露出ゼロ。
- migration: `supabase/migrations/20260626120000_restore_schema_grants_clean_prod.sql`（Plan B に更新済）。

### C. live DB で CEO が確認する read-only SQL（apply 前後）
```sql
-- B-1 適用前: 3 経路 table に grant が無い（=42501 の裏取り）
SELECT grantee, table_name, string_agg(privilege_type,',' ORDER BY privilege_type) priv
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name IN ('profiles','user_weather_settings','rendezvous_profiles',
        'rendezvous_ideal_partner_profiles','stargazer_observations','stargazer_resolved_types',
        'stargazer_star_maps','stargazer_profiles','stargazer_axis_snapshots',
        'stargazer_daily_states','stargazer_footprint_summaries')
  AND grantee IN ('anon','authenticated','service_role')
GROUP BY grantee, table_name ORDER BY table_name, grantee;

-- B-2 RLS 未有効 public table の live 実リスト（静的差分 26 と突き合わせ）
SELECT c.relname AS tbl, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false
ORDER BY c.relname;

-- B-5 is_admin() が SECURITY DEFINER か（authenticated の profiles SELECT が通る前提）
SELECT proname, prosecdef AS security_definer
FROM pg_proc WHERE proname='is_admin';

-- 適用後: 期待 grant を確認
SELECT has_table_privilege('service_role','public.profiles','UPDATE') svc_prof_upd,
       has_table_privilege('authenticated','public.stargazer_star_maps','INSERT') auth_star_ins,
       has_table_privilege('anon','public.profiles','SELECT') anon_prof_sel;
```

## CEO 判断待ち
- ☑ 暫定方針 **Plan B（table-specific minimal）** で migration ドラフト確定（anon/authenticated 露出ゼロを検証済）。
- ☐ live DB で **B-1/B-2/B-5** 実行 → (a) 3 経路 table に grant 不在、(b) RLS 未有効 live リストが静的差分 26 と一致、(c) is_admin が SECURITY DEFINER、を確認。
- ☐ B-5 が SECURITY INVOKER なら `app_admins` への authenticated SELECT を最小追補（要なら追記）。
- ☐ 適用手段（Supabase SQL Editor で本 SQL を単体実行 推奨／全 db push は B-7 drift 巻込みゆえ回避）。
- ☐ 適用先順序（local→staging で冪等確認→prod）と **prod 実行 GO（CEO=owner）**。
- ☐ 適用後 `curl https://culcept.vercel.app/api/health` = 200/supabase:"ok" → prod login→baseline 1 回保存成功で closeout。
