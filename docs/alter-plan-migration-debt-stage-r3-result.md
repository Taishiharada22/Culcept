# Stage R3 Result — staging replay 完走 + 7 項目 pass 固定

起草日: 2026-05-27
親 phase: migration-debt-phase → migration-debt-repair → Stage R3
CEO 確定: 2026-05-27 (R3 完了扱い)

---

## §1. 完了宣言

**Stage R3 (= staging clean reset + 全 migration replay 完走) は本日 2026-05-27 をもって正式に完了。**

- staging (`hjcrvndumgiovyfdacwc`) の schema_migrations と repo migrations directory が **177 / 177 完全同期**
- CEO 指定 7 項目検証 すべて **PASS**
- 自律 retry / repair / recovery 0 件、 失敗時即停止 + CEO 判断 を厳守
- production / production data には一切手を触れず

---

## §2. 達成 commit chain (本 phase、 feat/migration-debt-phase-readiness branch)

| # | commit | 内容 | 効果 |
|---|--------|------|------|
| 1 | (前段) `86c6353d` | Layer 1 Minimal Base 補完 file 構築 + sanitize 7 ルール | base 構築 |
| 2 | (前段) `a80e3774` | Stage R2-1 sanitize ルール + 7 件適用表 確定 | doc |
| 3 | (前段) `d96f4c39` | Layer 1 Base Functions 前置 migration 追加 | function dependency 解消 |
| 4 | (前段) `5c14fb2e` | 3 段再分割 — prereq tables + 補完 file 修正 | function resolve 順序確定 |
| 5 | **`61b4fc13`** | **Layer 1 historical-shape 補正 (constellation_* shape、 baseline_home_* 除外)** | `20260324100000` 通過 |
| 6 | **`7a25aebb`** | **user_style_vector prereq (`20260324190000`) 追加** | `20260324200000` 通過 |
| 7 | **`f0484775`** | **stargazer_axis_scores prereq (`20260407190000`) + bulk audit doc 追加** | `20260407200000` 通過 |
| 8 | **`0ff1197e`** | **duplicate timestamp 解消 — 後発 2 file rename (+100)** | `20260430` 区間通過 |

本 phase で **新規追加した prereq = 5 file (Layer 1 3 + user_style_vector 1 + stargazer_axis_scores 1)**、 **rename = 2 file**。

---

## §3. 数値検証

| 項目 | 値 |
|---|---|
| staging schema_migrations row 数 | **177** |
| repo migrations file 数 | **177** |
| 末尾 migration | `20260520120000_coalter_mirror_app_settings.sql` (両者一致) |
| duplicate timestamp | **0** (rename で解消) |
| 既知 prereq debt | **0** (bulk audit で網羅、 §4 参照) |
| ERROR / FATAL during reset | **0** |
| linked ref (作業中) | `hjcrvndumgiovyfdacwc` (staging) |
| linked ref (復旧後) | `aljavfujeqcwnqryjmhl` (production) |

---

## §4. 7 項目検証 (= CEO 指定、 staging 上で実行、 すべて PASS)

| # | 項目 | 期待 | 結果 |
|---|------|------|------|
| 1 | schema_migrations row 数 | 177 | ✅ PASS |
| 2 | 2 functions 存在 (`generate_public_id`, `is_admin`) | 2 行 | ✅ PASS |
| 3 | Layer 1 7 base tables 存在 | 7 行 | ✅ PASS |
| 4 | `real_face_sessions` 存在 | NOT NULL | ✅ PASS |
| 5 | `notifications.data` column | 1 行 (data \| jsonb) | ✅ PASS |
| 6 | `app_admins` 存在 | NOT NULL | ✅ PASS |
| 7 | `profiles` + `notifications` policy 数 | 2 行、 各 policy 数非ゼロ | ✅ PASS |

検証 SQL 全体は `docs/alter-plan-migration-debt-stage-r3-bulk-audit-result.md` §6 関連箇所、 および本 result 末尾 §7 に retain。

---

## §5. bulk audit 仮説の実証

`docs/alter-plan-migration-debt-stage-r3-bulk-audit-result.md` で行った機械監査の予言:

> 既知 8 件 (Layer 1 七つ + `user_style_vector`) の prereq 化 + 今回の **stargazer_axis_scores** のみで repo 全 migration の前提 relation は飽和する。 Layer 2 以降の bulk discovery は不要。

**結果: 仮説 100% 実証**。
- staging reset 通過時に発覚した新規 debt = `0 件`
- 唯一の追加 blocker = duplicate timestamp (= 別軸の問題、 prereq debt とは無関係)
- 1,197 op / 256 unique relation 走査の精度確認

---

## §6. 残課題 (= R3 scope 外、 R4 / 後段 phase へ送り)

### §6-A. production に未適用 4 file (= R4 で扱う)

| # | File | 由来 |
|---|------|------|
| 1 | `20260430100100_external_anchors.sql` | 本 phase rename (元 `20260430100000`) |
| 2 | `20260430110100_plan_drift_events.sql` | 本 phase rename (元 `20260430110000`) |
| 3 | `20260519100000_create_external_anchor_bundle.sql` | 既存 file、 未適用 |
| 4 | `20260520120000_coalter_mirror_app_settings.sql` | 既存 file、 未適用 |

production には coalter 旧 timestamp 2 file (`20260430100000` / `20260430110000`) が schema_migrations に既存 (= 5/01 commit 反映済)、 これらは触らない。

### §6-B. 別 branch 未取り込み (= 本 debt branch には未存在)

| File | 別 branch commit | phase |
|------|------------------|-------|
| `20260526100000_p3_ics_import.sql` | `fd6d827a` (PR P3 W3) | 別 phase |
| `20260526110000_p3_a_1_1_calendar_oauth.sql` | `8e443eb7` (PR P3-A-1-1-a) | 別 phase |

これらは debt branch の scope 外。 main merge 後の通常 push で扱う。

### §6-C. constellation→archetype rename drift (Stage R4 候補で確認)

`20260330200000_rename_constellation_to_archetype.sql` は idempotent wrap 済で replay 安全。 ただし production 上の現実 column 名が `archetype_*` か `constellation_*` のまま残っているかは別途確認推奨 (= bulk audit §6 で記録済、 production apply 前確認 candidate)。

---

## §7. 検証 SQL (= 再現可能なエビデンス、 後段 verify でも流用可能)

```sql
-- 検証 1
SELECT COUNT(*) AS row_count FROM supabase_migrations.schema_migrations;

-- 検証 2
SELECT proname FROM pg_proc
WHERE proname IN ('generate_public_id', 'is_admin')
ORDER BY proname;

-- 検証 3
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'notifications', 'stargazer_profiles',
                     'stargazer_observations', 'stargazer_core_star',
                     'stargazer_resolved_types', 'stargazer_orbit_snapshots')
ORDER BY table_name;

-- 検証 4
SELECT to_regclass('public.real_face_sessions') AS exists;

-- 検証 5
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'notifications' AND column_name = 'data';

-- 検証 6
SELECT to_regclass('public.app_admins') AS exists;

-- 検証 7
SELECT tablename, COUNT(*) AS policy_count FROM pg_policies
WHERE tablename IN ('profiles', 'notifications')
GROUP BY tablename
ORDER BY tablename;
```

---

## §8. 関連 doc

- `docs/alter-plan-migration-debt-phase-readiness.md` (親 readiness、 §1.2 production state 当時記録)
- `docs/alter-plan-migration-debt-repair-readiness.md` (repair scope)
- `docs/alter-plan-migration-debt-stage-r1-result.md` (forensic audit、 Layer 1 candidate 抽出)
- `docs/alter-plan-migration-debt-stage-r2-redesign-readiness.md` (L-A/L-B/L-C/L-D 4 層構造)
- `docs/alter-plan-migration-debt-stage-r2-1-layer1-base-readiness.md` (sanitize 7 ルール)
- `docs/alter-plan-migration-debt-stage-r3-staging-replay-readiness.md` (R3 起草時)
- `docs/alter-plan-migration-debt-stage-r3-bulk-audit-result.md` (B-base bulk audit、 1,197 op / 256 relation)
- `docs/alter-plan-migration-debt-stage-r4-production-apply-readiness.md` (次 phase 設計 — 本 commit で同時起草)

---

## §9. 次手

→ Stage R4 (= production 側の apply / repair 方針設計) へ移行。 本 commit で R4 readiness を docs-only で並列起草。

production apply / repair の実行は **CEO 個別承認** を必要とし、 R4 readiness が確定するまで停止。
