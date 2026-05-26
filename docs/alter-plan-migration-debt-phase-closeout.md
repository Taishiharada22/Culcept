# Migration Debt Phase — Closeout

起草日: 2026-05-27
親 phase: migration-debt-phase (= migration-debt-repair)
CEO 確定: 2026-05-27 (全 phase 完了 + 本流復帰準備)

---

## §1. Phase 完了宣言

**migration-debt phase は 2026-05-27 をもって正式に完了。**

R1 / R1.5 / R2 / R3 / R4 全 stage 着地。 production schema_migrations と repo migrations の整合性回復、 staging clean reset replay 完走、 P3 foundation production 適用達成。

---

## §2. 全 stage 振り返り

| Stage | 内容 | 主要成果物 | 状態 |
|-------|------|------------|------|
| **R1** | forensic audit、 Layer 1 candidate 抽出 | `alter-plan-migration-debt-stage-r1-result.md` (= 4 zone 構造) | ✅ |
| **R1.5** | `real_face_sessions` 異常分離 | `alter-plan-migration-debt-stage-r1-5-result.md` | ✅ α-later 確定 |
| **R2** | 4 層構造 redesign + sanitize 7 ルール | `alter-plan-migration-debt-stage-r2-redesign-readiness.md` / `alter-plan-migration-debt-stage-r2-1-layer1-base-readiness.md` | ✅ |
| **R3** | staging clean reset + 全 migration replay 完走 | `alter-plan-migration-debt-stage-r3-result.md` (= 177/177 同期) | ✅ |
| **R4** | production 4 file 完了 | `alter-plan-migration-debt-stage-r4-result.md` (= Step 1 apply + Step 2-4 de facto) | ✅ |

---

## §3. 達成事項 (= phase 全体の核心成果)

### §3.1 Repo migrations 整合性回復

- **Layer 1 prereq 7 件** (= profiles / notifications / stargazer 5 件) の historical-shape 補完
- **user_style_vector prereq 1 件** (= 20260324190000) の historical-shape 補完
- **stargazer_axis_scores prereq 1 件** (= 20260407190000) の minimal-shape 補完
- **duplicate timestamp 解消** (= 後発 2 file rename: `20260430100000_external_anchors` → `20260430100100`、 同様に plan_drift_events)
- **base functions migration** (= generate_public_id + is_admin) の前置追加
- 計 **9 prereq + 2 rename + 1 base functions** で history 完全整合

### §3.2 Staging 完全回復

- 完全空状態 → 177 file 全 apply 完走
- schema_migrations row 数 = 177
- 7 項目検証 全 PASS

### §3.3 Production 整合性確定

- 4 file 全部 production schema_migrations に row 存在
- object 実体 (= table / function / index / policy / trigger) 全部存在
- Step 1 (= `external_anchors.sql`) 今日 CEO 手動 apply、 残 3 step は de facto 完了確認

### §3.4 Bulk audit 仮説の実証

R3 Stage で実施した bulk audit (= `alter-plan-migration-debt-stage-r3-bulk-audit-result.md`、 1,197 op / 256 relation 走査) の予言「既知 8 件 + stargazer_axis_scores のみで repo 全 migration の前提 relation は飽和」 を **100% 実証**。

### §3.5 安全運用ルールの確立

- **partial state のまま push しない** (= 全 reset 試行で厳守)
- **失敗時即停止 + CEO 報告** (= 自律 retry / repair / recovery 0 件)
- **apply → verify → INSERT → stop 順序** (= R4 Step 0 §6.0)
- **object 実体 + history 両立を完了条件にする** (= R4 Step 0 §4.4)
- **production には書き込み最小** (= 本 phase の production 書き込みは Step 1 = 1 回のみ)

---

## §4. 本 session commit chain (= feat/migration-debt-phase-readiness branch)

| # | commit | 内容 |
|---|--------|------|
| 1 | `5c14fb2e` | 3 段再分割 (prereq + 補完 file 修正) |
| 2 | `61b4fc13` | Layer 1 historical-shape 補正 |
| 3 | `7a25aebb` | user_style_vector historical-shape prereq 追加 |
| 4 | `f0484775` | stargazer_axis_scores prereq + bulk audit doc |
| 5 | `0ff1197e` | duplicate timestamp 解消 (rename) |
| 6 | `6b1d9e76` | R3 完了固定 + R4 readiness 起草 |
| 7 | `d2499fa4` | R4 Step 0 pre-flight 4 file 精査 |
| 8 | `a490ee9f` | R4 Step 0 軽補正 (名前確認 / version 未登録 / INSERT 順序) |
| (本 commit) | — | R4 result + closeout 起草 + deferred items |

---

## §5. Deferred Items (= 本 phase で扱わず、 後段で実施)

### §5-a. content sanity check (= Step 3 / Step 4 table 構造完全一致確認)

#### 残課題

R4 Step 2-4 は de facto 完了として扱ったが、 **production table の column / CHECK / index / policy / trigger / function 内容が migration file と完全一致するか**の sanity check は未実施。

- Step 2 (`create_external_anchor_bundle` function): signature + body_length 整合まで確認、 body 内容完全 diff は未実施
- Step 3 (`plan_drift_events` table): object + history 両立確認、 column 数 / CHECK 制約 / index / policy 個別確認は未実施
- Step 4 (`app_settings` + `coalter_mirror_kill_switch_audit` + triggers + functions): 同上

#### 動作影響

**動作影響なし** で本 phase 完了:
- Step 2 = 既稼働
- Step 3 = app code 参照 0 件
- Step 4 = Mirror Channel 未稼働

#### 推奨実施タイミング

通常運用フロー戻り後、 落ち着いたタイミングで read-only 実施。 必須ではない (= 動作異常なし)、 ただし long-term の運用品質のため推奨。

#### 実施手順草案

```sql
-- Step 3 plan_drift_events sanity check 例
-- 1. column 一覧
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'plan_drift_events'
ORDER BY ordinal_position;
-- migration file L39-119 と diff

-- 2. CHECK 制約一覧
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.plan_drift_events'::regclass AND contype = 'c'
ORDER BY conname;

-- 3. index 完全一覧
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'plan_drift_events';

-- 4. policy 完全一覧
SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'plan_drift_events';
```

Step 2 function: `pg_get_functiondef(oid)` で完全 source を取得、 migration file と diff。
Step 4: 上記 3 テンプレートを `app_settings` / `coalter_mirror_kill_switch_audit` + trigger / function に適用。

#### 完了基準

- production object 定義と migration file の SQL が **意味的に一致** (= comment 差は許容、 構造差は要対応)
- 不一致発見時は CEO 判断 (= 修正 migration 追加 or `OR REPLACE` で上書き)

---

### §5-b. `supabase migration list` 信頼性調査

#### 観察 (= 本 phase 内発見)

`supabase migration list --linked` の REMOTE 列が **空** だった migration version (= 20260519100000 / 20260430110100 / 20260520120000) が、 production SQL Editor 直接 query では **schema_migrations に row 既存**。 つまり CLI 出力が production 実態と乖離していた。

R4 Step 2 着手 Pre-flight で発覚。 SQL Editor 経由の `SELECT version FROM supabase_migrations.schema_migrations` で実体確認したことで矛盾検出。

#### 推測される原因 (= 未確定、 後段で再現実験必要)

| 仮説 | 内容 | 確度 |
|------|------|-----|
| α | CLI cache or 表示遅延 | 中 |
| β | schema_migrations の column 構造差 (= production は古い schema、 `inserted_at` 不在で CLI の表示ロジックが正しく扱えない) | **高** (= SQL A エラーで `inserted_at` 不在判明) |
| γ | pooler 経由の認証 / 読み取り権限差 | 低 |
| δ | CLI の build バージョン差 (= v2.75.0 と v2.101.0 で出力差?) | 中 |

#### 影響

- CLI 出力 (= `supabase migration list`) を **盲信できない**
- 今後の migration apply / verify では必ず SQL Editor 直接 query + object 実体確認 を併用する
- 既存 doc (= migration-debt-phase-readiness §1.1 等) の「未適用 file 数」 表記は CLI 出力ベースで誤りだった可能性、 retrospective に確認推奨

#### 推奨実施タイミング

通常運用フロー戻り後、 別 phase で扱う:
- 本 phase の経験を活かした **「migration verify 安全ガイドライン」** doc 起草 (= 各 phase 着手時に必須の Pre-flight pattern)
- 本格的な CLI 挙動調査 (= 別 supabase project でも再現するか、 schema_migrations の column 構造を新しくしたら CLI 動作が変わるか)

#### 実施手順草案

```bash
# 1. CLI version 差確認
supabase --version  # 現在 v2.75.0

# 2. CLI 更新後の挙動再確認
brew upgrade supabase  # v2.101.0 に更新
supabase migration list --linked  # 再確認

# 3. 新しい dev project を作成
supabase projects create ...  # 別 project (= 最新 schema_migrations 形式)

# 4. 同じ migration をその dev project に apply
# 5. CLI 出力と SQL Editor 結果を diff

# 6. fix が CLI 側か schema_migrations 側か特定
```

#### 完了基準

- CLI 挙動の原因特定 (= 仮説 α-δ のどれか確定)
- 「migration verify 安全ガイドライン」 doc を CLAUDE.md に追記 (= 次の migration phase で再発防止)

---

## §6. 別 branch / 別 phase で扱う残作業 (= 本 phase の scope 外)

### §6.1 別 branch 2 file (= main merge 後の通常 push)

| File | 元 branch | commit |
|------|-----------|-------|
| `20260526100000_p3_ics_import.sql` | P3 W3 | `fd6d827a` |
| `20260526110000_p3_a_1_1_calendar_oauth.sql` | P3-A-1-1-a | `8e443eb7` |

これらは debt branch に未取り込み。 main merge 後の通常 PR flow で対応。

### §6.2 constellation→archetype rename drift 物理確認

`20260330200000_rename_constellation_to_archetype.sql` は idempotent wrap 済で staging で問題なく apply された。 ただし production 上で現実 column 名が `archetype_*` か `constellation_*` のままかは別 read-only 確認推奨 (= deferred §5-a の sanity check 範囲)。

### §6.3 staging-production 双方向同期の運用フロー整備

今後の通常運用 (= 別 phase 着手時) で、 migration が「staging で test → production に safe apply」 のサイクルを回すための運用ルール整備。 本 phase の経験 (= 安全運用ルール §3.5) を反映。

---

## §7. 本流復帰準備

### §7.1 branch 状態

- branch: `feat/migration-debt-phase-readiness`
- 本 session commit 数: **9 件** (= 上記 §4 chain + 本 commit)
- main との関係: 別 PR で merge する判断 (= 通常 PR flow)

### §7.2 復帰の前提

- ✅ R4 完了固定 (= 本 commit §1)
- ✅ phase 全体 closeout 固定 (= 本 commit)
- ✅ deferred items 明記 (= §5-a / §5-b)
- ⏳ branch merge は CEO 判断 (= 別作業、 本流復帰後に対応可能)

### §7.3 本流 = 復帰先

CLAUDE.md の CEO 方針 (= 2026 年 3 月):
- 最優先テーマ: **Stargazer 深層観測の完成**
- 今月の成功条件:
  1. コア機能の完成
  2. 初期ユーザー獲得
  3. 世界観の確立
  4. デプロイ可能状態

本 phase 完了により「4. デプロイ可能状態」 の DB 整合面は前進。 復帰先は前 phase の進行作業 (= Stargazer Human OS / Plan Wave 等) で、 具体的優先順位は CEO 確認後に決定。

---

## §8. 関連 doc 一覧 (= phase 全体の足跡)

### §8.1 phase 起草系

- `docs/alter-plan-migration-debt-phase-readiness.md` (= 親 readiness、 §1.2 で当初判定)
- `docs/alter-plan-migration-debt-repair-readiness.md` (= repair scope)

### §8.2 Stage 別 readiness / result

- R1: `docs/alter-plan-migration-debt-stage-r1-result.md` / `docs/alter-plan-migration-debt-stage-r1-schema-diff-readiness.md`
- R1.5: `docs/alter-plan-migration-debt-stage-r1-5-real-face-anomaly-readiness.md` / `docs/alter-plan-migration-debt-stage-r1-5-result.md`
- R2: `docs/alter-plan-migration-debt-stage-r2-redesign-readiness.md` / `docs/alter-plan-migration-debt-stage-r2-1-layer1-base-readiness.md`
- R3: `docs/alter-plan-migration-debt-stage-r3-staging-replay-readiness.md` / `docs/alter-plan-migration-debt-stage-r3-bulk-audit-result.md` / `docs/alter-plan-migration-debt-stage-r3-result.md`
- R4: `docs/alter-plan-migration-debt-stage-r4-production-apply-readiness.md` / `docs/alter-plan-migration-debt-stage-r4-step-0-pre-flight.md` / `docs/alter-plan-migration-debt-stage-r4-result.md`
- closeout: 本 doc

### §8.3 関連 design / runbook

- `docs/alter-plan-w1z-production-migration-decision.md` (= w1z 検討経緯)
- `docs/alter-plan-w1z-production-migration-apply-runbook.md` (= R4 Step 1 / Step 2 の元手順)
- `docs/alter-plan-foundation-design.md` (= File 1 / File 3 の設計根拠)
- `docs/alter-plan-w1y-rpc-atomicity-mini-design.md` (= File 2 の設計根拠)
- `docs/coalter-aoo-phase-e2-0-sequencing.md` (= File 4 の設計根拠)
- `docs/coalter-aoo-phase-e2-1a-migration-runbook.md` (= File 4 の既存 runbook)

---

## §9. 本 phase で学んだ教訓 (= 後段 phase へのエージェント memo)

1. **CLI を盲信しない**: `supabase migration list` 出力と SQL Editor 直接 query の両軸で確認
2. **bulk audit は早い段階で**: 1 件ずつ叩くより、 一括棚卸で全体像把握
3. **historical shape 優先**: production current shape を base にすると history 整合性が破綻、 historical (= 当時の) shape を base にする
4. **partial state のまま進めない**: 失敗時即停止、 自律 retry / repair / recovery は禁止
5. **`apply → verify → INSERT → stop` 順序厳守**: 先に INSERT すると history 不整合が発生
6. **object 実体 + history 両立で完了**: 片方だけ存在は致命的、 両軸確認で初めて完了
7. **idempotent design の価値**: `IF NOT EXISTS` / `OR REPLACE` / `DO $$ IF EXISTS $$` で wrap された file は再 apply 安全、 raw `CREATE POLICY` 等は 1 回限り
8. **production 書き込みは最小**: 本 phase は Step 1 = 1 回のみ、 link 切替 / read-only query は許容

---

## §10. 本流復帰準備完了宣言

✅ R4 result 固定
✅ closeout 固定
✅ deferred items §5-a / §5-b 明記
✅ 残作業 §6 整理
✅ branch + commit chain §7 整理

→ **本流復帰準備 完了**。 CEO 確認後、 次の本流 phase (= Stargazer / Plan 系) へ着手可能。
