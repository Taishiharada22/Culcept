# Stage R4 Result — production 4 file 完了固定

起草日: 2026-05-27
親 phase: migration-debt-phase → migration-debt-repair → Stage R4 (Scenario β 採用)
CEO 確定: 2026-05-27 (R4 完了扱い)

---

## §1. 完了宣言

**Stage R4 (= production 4 file 適用 phase) は 2026-05-27 をもって正式に完了。**

- production schema_migrations に **4 file 全部 row 存在** (= history 整合)
- object 実体 (= 2 table + 1 function + 2 table + 3 trigger + 1 policy + N index) **全部存在**
- 動作影響 **0** (= Step 1 で P3 foundation enable、 Step 2-4 は既存維持)
- 自律 retry / repair / recovery 0 件、 失敗時即停止 + CEO 判断を厳守
- production schema 書き込みは Step 1 (= CEO 手動 SQL Editor 1 回) のみ

---

## §2. 各 Step 着地状況

| Step | File | 着地経路 | object | history | 確証根拠 |
|------|------|---------|--------|---------|---------|
| Step 1 | `20260430100100_external_anchors.sql` | **今日 CEO 手動 apply** | ✅ | ✅ | Verify 1-1 ~ 1-5 全 pass |
| Step 2 | `20260519100000_create_external_anchor_bundle.sql` | **de facto 完了** (= 過去 apply 済) | ✅ | ✅ | SQL B で signature + body_length = 3198 chars が migration file 内容と整合 |
| Step 3 | `20260430110100_plan_drift_events.sql` | **de facto 完了** (= 過去 apply 済) | ✅ | ✅ | SQL C で object_exists + history_exists 両 true |
| Step 4-a | `20260520120000_coalter_mirror_app_settings.sql` (app_settings) | **de facto 完了** | ✅ | ✅ | SQL C 両 true |
| Step 4-b | 同上 (coalter_mirror_kill_switch_audit) | **de facto 完了** | ✅ | ✅ | SQL C 両 true |

---

## §3. Step 1 詳細 (= 今日唯一の apply)

### §3.1 実施記録

- 実施者: CEO (= Production Supabase Dashboard SQL Editor、 service_role 経由)
- 実施タイミング: 2026-05-27 (本セッション中)
- file: `supabase/migrations/20260430100100_external_anchors.sql` (= 元 `20260430100000_external_anchors.sql` を本 debt phase で rename した後発 file)

### §3.2 適用 SQL 統計

- `CREATE TABLE IF NOT EXISTS external_anchor_sources` × 1 (= 8 column + 3 CHECK + 1 FK to auth.users)
- `CREATE TABLE IF NOT EXISTS external_anchors` × 1 (= 18 column + 6 CHECK + 1 FK to external_anchor_sources)
- `CREATE INDEX` × 5 (= 2 + 3)
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` × 2
- `CREATE POLICY` × 8 (= 4 × 2 table)
- `COMMENT ON TABLE / COLUMN` × 14
- 末尾: `INSERT INTO supabase_migrations.schema_migrations VALUES ('20260430100100', 'external_anchors', '{}'::jsonb);`

### §3.3 Verify 全 pass

doc `alter-plan-migration-debt-stage-r4-step-0-pre-flight.md` §3.1 の 検証 1-1 ~ 1-5 全項目 PASS:
- 1-1: 2 table 存在 + RLS = true
- 1-2a/b: policy 数 = 4 × 2 + 名前 8 個列挙
- 1-3: CHECK 制約 (= discriminated union 各種)
- 1-4: index 名前 7 個列挙
- 1-5: schema_migrations row INSERT 確認

→ §4.4 「object 実体 + history 整合」 完了条件 単独 Step として満たした。

---

## §4. Step 2-4 de facto 完了の根拠

### §4.1 経緯

R4 readiness §1.1 で「未適用 4 file」 と私が判定したのは、 `supabase migration list --linked` の REMOTE 列が空表示だったため (= 2026-05-27 起草時点での観察)。

しかし、 Step 2 着手 Pre-flight (= doc §3.0 拡張) で:
1. CEO 報告: `function_exists = true`、 `schema_migrations 20260519100000` 既存
2. 自立 read-only 再確認: SQL C で全 4 step `object_exists = true` + `history_exists = true`

→ **migration list の表示は production 実態と乖離していた**。 実態は **全 4 file が過去のいずれかのタイミングで既に apply 済**。

### §4.2 Step 2 内容整合性確認 (= SQL B)

| 項目 | 期待 | 実態 | 判定 |
|------|------|------|------|
| `proname` | `create_external_anchor_bundle` | `create_external_anchor_bundle` | ✅ |
| `is_security_definer` | false (= SECURITY INVOKER) | false | ✅ |
| `pronargs` | 3 | 3 | ✅ |
| `args` | `uuid, jsonb, jsonb` | `p_user_id uuid, p_source jsonb, p_anchors jsonb` | ✅ |
| `body_length` | 約 2500-4000 chars | **3198 chars** | ✅ 期待範囲内 |

→ Step 2 function は migration file `20260519100000_create_external_anchor_bundle.sql` と内容整合 (= 完全一致は §7 deferred で sanity check 候補)。

### §4.3 Step 3 / 4 内容整合性確認 (= 未実施、 deferred)

Step 3 (`plan_drift_events` table) と Step 4 (`app_settings` + `coalter_mirror_kill_switch_audit` + triggers + functions) の **column / CHECK / index / policy / trigger / function 内容の完全一致確認は本 phase では実施せず**。

根拠:
- object + history 両立 (= §4.4 完了条件) は確認済
- app code 参照は plan_drift_events = 0 件、 Mirror Channel = 未稼働 = **動作影響 0**
- 完全 sanity check は migration-debt phase closeout doc の deferred §5-a に明記、 後段で実施

---

## §5. 動作影響評価

| Step | application 影響 | 評価根拠 |
|------|------------------|---------|
| Step 1 (`external_anchors`) | **P3 機能 enable** | external_anchors foundation 完成、 P3 ICS import + Google OAuth が production で動作可能になる |
| Step 2 (`create_external_anchor_bundle`) | **影響なし** (= 既存維持) | 過去から apply 済、 P3 W1-Y RPC が既に稼働していた |
| Step 3 (`plan_drift_events`) | **影響なし** | app code から `.from("plan_drift_events")` 参照 = 0 件 (= W1-5 系の追跡用、 production で参照されていない) |
| Step 4 (`app_settings` + audit) | **影響なし** | CoAlter Mirror Channel 未稼働 (= Phase E-2-α 未着手)、 kill switch flag が読まれていない |

→ Step 1 を「P3 機能 production 解禁」 と表現可能、 Step 2-4 は本 phase 着地の副産物として history 整合性回復のみ。

---

## §6. CLI / SQL Editor の表示乖離 (= 重大観察)

### §6.1 観察

- `supabase migration list --linked` の REMOTE 列が **空** だった migration version (= 20260519100000 / 20260430110100 / 20260520120000) が、 production SQL Editor 直接 query では **schema_migrations に row 既存**
- Step 2 着手前 Pre-flight で CEO が SQL Editor 経由で確認したことで矛盾発覚

### §6.2 推測される原因 (= 確定せず、 後段調査)

- CLI の表示が cache か遅延
- schema_migrations の column 構造差 (= production は古い schema、 `inserted_at` 不在)
- 認証 / pooler の経路差で読み取り権限 / 結果差異

### §6.3 影響

- CLI 出力を盲信できない → 今後の migration phase では SQL Editor 直接 query + object 実体確認 を併用
- 詳細追究は migration-debt phase の **deferred §5-b** で記録

---

## §7. 関連 doc

- `docs/alter-plan-migration-debt-stage-r3-result.md` (前 stage 完了)
- `docs/alter-plan-migration-debt-stage-r4-production-apply-readiness.md` (R4 readiness)
- `docs/alter-plan-migration-debt-stage-r4-step-0-pre-flight.md` (Step 0 pre-flight、 軽補正反映済)
- `docs/alter-plan-migration-debt-phase-closeout.md` (本 commit で同時起草、 phase 全体 closeout)
- `docs/alter-plan-migration-debt-phase-readiness.md` (= 親 readiness)
