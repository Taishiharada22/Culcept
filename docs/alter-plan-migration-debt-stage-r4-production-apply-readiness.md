# Stage R4 Readiness — production 側の apply / repair 方針設計 (docs-only)

起草日: 2026-05-27
親 phase: migration-debt-phase → migration-debt-repair → Stage R4
CEO 確定: 2026-05-27 (R3 完了後の docs-only 設計 phase、 production apply / repair はまだ実行しない)

---

## §0. 本 phase の scope (= 何を決め、 何をしないか)

### scope に含まれる (= 本 readiness で決める)

- production に未適用の **4 file** をどう apply するか方針確定
- 各 file の冪等性 / 副作用 / rollback 可能性の精査
- 採用 scenario の比較と推奨
- 実行 phase (= R4 実行 phase) の前提条件・安全条件
- production 適用前の最終 verify SQL 設計

### scope に含まれない (= 本 readiness では決めない)

- 実 SQL の production への投入 (= 別 phase で CEO 個別承認)
- `20260526100000_*` / `20260526110000_*` (= 別 branch 未取り込み 2 file)
- main branch への merge 戦略 (= 本 phase 終了後、 通常 PR フロー)
- production data 操作 (= read-only verify SQL のみ)

---

## §1. 現状把握 (= 2026-05-27 production 状態、 read-only 確認済)

### §1.1 production (`aljavfujeqcwnqryjmhl`) 適用済 173 / 未適用 4

`supabase migration list --linked` (2026-05-27) で確認、 REMOTE 列が空の file:

| # | File | 由来 | 種別 | size |
|---|------|------|------|------|
| 1 | `20260430100100_external_anchors.sql` | 本 debt phase rename (= 元 `20260430100000`) | DDL (= CREATE TABLE × 2 + indexes + RLS + policies + CHECK + RPC) | 13.7 KB |
| 2 | `20260430110100_plan_drift_events.sql` | 本 debt phase rename (= 元 `20260430110000`) | DDL (= W1-6 plan analytics) | 12.4 KB |
| 3 | `20260519100000_create_external_anchor_bundle.sql` | 既存 file、 production 未到達 | DDL (= CREATE OR REPLACE FUNCTION + REVOKE / GRANT、 全 idempotent) | 7.8 KB |
| 4 | `20260520120000_coalter_mirror_app_settings.sql` | 既存 file、 production 未到達 | DDL (= coalter app_settings mirror) | (要確認) |

### §1.2 production の duplicate timestamp 状況 (= 重要事実)

production schema_migrations には:
- `20260430100000` row が **既存** (= 5/01 commit `6a0f6d4b` = coalter_memory_items_realtime.sql apply 履歴)
- `20260430110000` row が **既存** (= 同上、 coalter_memory_items_replica_full.sql)

本 debt phase の rename (= 後発 2 file を `+100` にずらした) によって、 production の既存 row と衝突しない新 timestamp で apply 可能 になった。

→ production に対する apply は **既存 row を一切 touch せず、 4 file の新規 row を追加する形式** で完結可能。

### §1.3 production schema 実体の事前確認 (= w1z runbook 起草時)

`docs/alter-plan-w1z-production-migration-apply-runbook.md` §2 で記録された期待値 (= 当時の調査):
- `external_anchor_sources table` = false
- `external_anchors table` = false
- `create_external_anchor_bundle function` = false

これらは現時点でも未存在の見込み (= production 4 file 未適用、 schema 実体も無し)。 R4 実行 phase の Step 0 (= apply 直前 verify) で再確認必須。

---

## §2. 4 file 各々の精査

### §2.1 `20260430100100_external_anchors.sql`

- 種別: DDL (= CREATE TABLE × 2 + indexes + RLS + policies + CHECK 制約)
- 冪等性: **部分的に冪等**
  - `CREATE TABLE IF NOT EXISTS` ✅ 冪等
  - `CREATE INDEX IF NOT EXISTS` ✅ 冪等
  - `CREATE POLICY ... ON ...` ❌ **非冪等** (= 2 回目で `policy already exists` error)
- application 影響: P3 全体 (= ICS import + Google OAuth) の foundation table
- rollback 可能: ✅ `DROP TABLE IF EXISTS external_anchors CASCADE; DROP TABLE IF EXISTS external_anchor_sources CASCADE;`
- 詳細: `docs/alter-plan-w1z-production-migration-apply-runbook.md` §3 Step 1

### §2.2 `20260430110100_plan_drift_events.sql`

- 種別: DDL (= W1-6 plan analytics table、 application code 参照 0 件 = 過去 audit)
- 冪等性: 要精査 (未読、 R4 実行 phase で詳細確認)
- application 影響: 低 (= W1-6 領域、 当時 CEO 制約 「W1-6 不触」 で apply 保留経緯あり)
- rollback 可能: 要精査
- 注意: 本 phase で rename 済、 production 既存 row との衝突無し

### §2.3 `20260519100000_create_external_anchor_bundle.sql`

- 種別: DDL (= `CREATE OR REPLACE FUNCTION` + REVOKE / GRANT)
- 冪等性: ✅ **完全冪等** (= OR REPLACE)
- application 影響: P3 W1-Y RPC (= external_anchor_bundle の atomic creation)
- 依存: §2.1 の `external_anchors` table が事前に存在する必要あり
- rollback 可能: ✅ `DROP FUNCTION IF EXISTS create_external_anchor_bundle(...);`
- 詳細: `docs/alter-plan-w1z-production-migration-apply-runbook.md` §3 Step 2

### §2.4 `20260520120000_coalter_mirror_app_settings.sql`

- 種別: DDL (= coalter app_settings mirror、 内容未読)
- 冪等性: 要精査
- application 影響: 要精査 (= coalter Phase 系の延長と推測)
- rollback 可能: 要精査

→ R4 実行 phase の Step 0 readiness 補正で各 file 内容を完全レビュー。

---

## §3. 採用可能 scenario 比較

| # | Scenario | 内容 | 利点 | リスク | 工数 | reliability |
|---|----------|------|------|--------|------|-----------|
| **α** | **CLI 一括 push** (= `supabase db push --linked` を production link で実行、 4 file 自動 apply) | 最短、 CLI 標準フロー | policies 非冪等問題で再 run 不可、 失敗 1 件で全 rollback 困難、 CEO 制御細かさ低い | 10 分 | ⚠️ 中 |
| **β** ✅ | **Dashboard 個別 SQL Editor apply** (= 4 file を SQL Editor で 1 つずつ実行、 各 file 後に verify SQL) | CEO 視認性最大、 失敗時即停止、 各 file 後の状態確認可能、 既存 w1z runbook の延長 | 手動操作、 CEO 時間消費 | 30-45 分 | ✅ 高 |
| γ | **dump / restore** (= production を dump → 別 project に restore → 補正 → swap) | 完全 atomic、 rollback 容易 | 大ごと、 swap タイミングで sub-second downtime、 P3 機能は当面不要なので overkill | 数時間 | ⚠️ 中 |
| δ | **defer** (= 当面 production 未適用のまま、 P3 機能 OFF 維持) | 0 工数 | 永続的 debt 残存、 P3 W3 / P3-A-1 系の production 検証が永遠に進まない | 0 | ❌ 低 (= ゴール未達) |

### §3.2 推奨: **Scenario β (= Dashboard 個別 SQL Editor apply、 4 file)**

#### 推奨理由 (= 3 行)

1. **CEO 視認性最大** — 1 file ずつ実行 → 検証 → CEO 確認 → 次 file の sequential フロー、 production 直 push の不安が排除される
2. **既存 w1z runbook の延長で組める** — §2.1 (`external_anchors.sql`) は w1z runbook で既に詳細 SQL Editor 手順が用意されている、 流用最大化
3. **policies 非冪等問題を回避** — CLI 一括 push (= α) なら同 file 内 policies CREATE が 2 回目で失敗するが、 SQL Editor 1 回 apply なら policies 初回 set で完結

#### 不採用 scenario の却下理由

- α ❌ 却下: policies 非冪等 (`external_anchors.sql` 内 CREATE POLICY × N)、 CLI 一括は再 run safety が低い、 CEO 制御の粒度が file 単位より荒い
- γ ❌ 却下: production 4 file apply に対して overkill、 dump-restore は別軸の大規模オペレーション
- δ ❌ 却下: ゴール未達、 R3 完走の意義 (= 統合 history の確立) を失う

### §3.3 採用時の前提条件

- **前提 a**: production schema 実体が §1.3 の期待値 (= 4 table / 1 function 不在) であることを apply 直前に再確認
- **前提 b**: production user data 影響なし (= 全 DDL、 ADD COLUMN / 新 table / 新 function、 既存 data に対する DESTRUCTIVE 操作なし) を SQL レビューで確認
- **前提 c**: 各 file apply 後に schema_migrations に新規 row が INSERT されることを確認 (= history sync 完了)
- **前提 d**: CEO が Supabase Dashboard (`aljavfujeqcwnqryjmhl` production project) の SQL Editor にアクセス可能

---

## §4. 推奨実行手順 (= R4 実行 phase の骨格、 各 Step に CEO 個別承認)

```
Step 0 (= Pre-flight、 docs-only 補正可能):
  各 file SQL の最終レビュー
  production 実体不在確認 SQL (= §1.3 期待値 再確認)
  CEO 各 file 個別承認

Step 1 (= external_anchors.sql apply):
  Dashboard SQL Editor で 20260430100100_external_anchors.sql を paste → Run
  verify SQL × 4 (tables / RLS / CHECK / indexes)
  schema_migrations への INSERT 確認
  → CEO 確認 → Step 2

Step 2 (= create_external_anchor_bundle.sql apply):
  Dashboard SQL Editor で 20260519100000_create_external_anchor_bundle.sql を paste → Run
  verify SQL (function 存在 + SECURITY mode)
  schema_migrations への INSERT 確認
  → CEO 確認 → Step 3

Step 3 (= plan_drift_events.sql apply):
  Dashboard SQL Editor で 20260430110100_plan_drift_events.sql を paste → Run
  verify SQL (= R4 Step 0 で起草)
  schema_migrations への INSERT 確認
  → CEO 確認 → Step 4

Step 4 (= coalter_mirror_app_settings.sql apply):
  Dashboard SQL Editor で 20260520120000_coalter_mirror_app_settings.sql を paste → Run
  verify SQL (= R4 Step 0 で起草)
  schema_migrations への INSERT 確認
  → CEO 確認 → Step 5

Step 5 (= 完了確認 + R4 result 固定):
  production migration list で 4 file の REMOTE 列に日時表示確認
  staging-production migration_list 完全一致確認
  decision-log + R4 result doc 起草
```

---

## §5. リスク分析と緩和策

| リスク | 影響 | 緩和策 |
|--------|------|--------|
| policies 非冪等 (`external_anchors.sql`) で再 run が壊れる | apply 中の途中失敗 → 修復困難 | β 採用で **初回 1 回 apply** に限定、 失敗時は rollback SQL を §2.1 から流用 |
| `20260430110100_plan_drift_events.sql` 内容未精査 | apply 時に予期せぬ DDL error | R4 Step 0 で内容 full review、 SQL Editor で apply 前 dry-run (= EXPLAIN 等) |
| `20260520120000_coalter_mirror_app_settings.sql` 内容未精査 | 同上 | 同上 |
| schema_migrations への INSERT が CLI 経由ではなく SQL Editor 経由になる場合の version 登録漏れ | history mismatch、 次回 CLI push で order 失敗 | 各 file apply 後に `INSERT INTO supabase_migrations.schema_migrations(version, name, statements)` を手動で実行 (= w1z runbook 既存パターン) |
| production user data 副作用 | データ破壊 | 全 4 file が DDL (= 新 table / 新 function / ADD COLUMN)、 既存 data には touch しない方針を SQL レビューで二重確認 |

---

## §6. 残課題 (= R4 で扱わない)

1. **別 branch 2 file (`20260526100000` / `20260526110000`)**: P3 W3 / P3-A-1-1 branch に存在、 main merge 後に通常 push で適用
2. **constellation→archetype drift** の物理確認: production 上の現実 column 名確認 (= `archetype_*` か `constellation_*` のまま残っているか)、 R4 完了後または独立 phase
3. **staging-production 双方向同期の確立**: 今後の通常運用フローの整備 (= 別 phase)

---

## §7. 開始条件 (= R4 起動可能になる条件)

- ✅ R3 完了 (= staging replay 完走 + 7 項目 pass)
- ✅ production link 復旧 (= `aljavfujeqcwnqryjmhl`)
- ✅ R4 readiness 起草完了 (= 本 doc)
- ⏳ CEO による R4 readiness レビュー + 採用 scenario 確定
- ⏳ R4 Step 0 (= 各 file SQL レビュー + CEO 個別承認) 完了

---

## §8. 関連 doc

- `docs/alter-plan-migration-debt-stage-r3-result.md` (本 commit で同時起草、 R3 完了固定)
- `docs/alter-plan-migration-debt-stage-r3-bulk-audit-result.md` (bulk audit、 R4 の relation 一覧の根拠)
- `docs/alter-plan-w1z-production-migration-apply-runbook.md` (R4 Step 1 / Step 2 の SQL Editor 手順の元設計)
- `docs/alter-plan-w1z-production-migration-decision.md` (= w1z decision 履歴)
- `docs/alter-plan-migration-debt-phase-readiness.md` §1.2 (5/26 時点の production state、 §1.1 で更新済)

---

## §9. 本 readiness 確定までの CEO 判断ポイント

1. **採用 scenario** (= α / β / γ / δ): 推奨 β
2. **実行 phase 細分割**: §4 の Step 0-5 で OK か
3. **R4 Step 0 起動タイミング**: 本 readiness 確定後すぐか、 別 phase 間隔か
4. **production 各 file SQL レビュー**: 全 4 file を 1 通り readiness 補正で精査するか、 R4 Step 0 で初回精査するか
5. **rollback / kill switch**: w1z runbook 既存の rollback SQL でカバーされるか、 追加設計が必要か
