# Stage B1 Readiness — Staging 一括 push (= Scenario B、 Path β、 CEO 個別承認)

**Date**: 2026-05-26
**Branch**: `feat/migration-debt-phase-readiness` (= main 派生)
**Parent readiness**: `docs/alter-plan-migration-debt-phase-readiness.md` (= Scenario B 採用 / Path β 確定)
**Status**: 🟡 readiness only (= docs-only、 起草後 再停止、 実行は CEO 個別承認 後)
**Scope**: Stage B1 (= staging culcept-staging に 175 file 一括 push) の **手順 + 安全停止 point** を確定

---

## 0. 背景 — Stage B1 の位置付け

Migration debt phase readiness (= 親 doc) で **Scenario B (= staging 同期 → production 同期) + Path β (= stage 別 readiness / stage 別 GO)** が CEO 確定 (= 2026-05-26)。

Stage B1 は 4 stage の最初:

```
Stage B1 (= 本 readiness): staging 一括 push (= 175 file)
Stage B2: staging 検証 (= 個別検証セット)
Stage B3: production 8 file push (= 一括、 staging 検証 PASS 後)
Stage B4: 完了確認 + link 戻し + decision-log 更新
```

各 stage は **独立 readiness + 独立 CEO GO** で進む。

### 0.1 Stage B1 不変原則

- **staging のみ touch** (= production link は実行前後で必ず確認、 staging に切替 → 完了後 production 戻し)
- **CEO 個別承認 stop**: 4 stop point で必ず CEO GO 取る (= AI 自律で全実行しない、 §3 参照)
- **read-only → dry-run → CEO GO → 実 push** の順序を厳守
- **重複 timestamp 4 file の SQL review** を pre-flight に含める (= 親 readiness §3 採用、 「保持」 推奨だが SQL review 後最終確定)
- **失敗時は即停止 + CEO 報告** (= 自律で recovery しない、 §4 参照)
- 本 readiness 起草 commit 着地 → Stage B1 実行 GO は CEO 個別判断

---

## 1. 前提条件 (= Stage B1 着手前確認)

### 1.1 staging に user data の不在 (= 確認 必須)

**仮定**: culcept-staging は dev project、 user 0 / data 無視可能

**確認方法** (= AI 自律で実行可、 read-only):
- Stage B1 着手前に staging link 後、 主要 table の row count を read-only 確認
- 確認 table 例 (= 既存 production にあって staging には未適用、 ただし staging に空 table が偶発的に手動作成されてる可能性は微小):
  - `auth.users` (= Supabase Auth 標準)
  - 既存 schema の中身 (= 全件未適用なので table 自体存在しないはず、 確認は補強)

**confirm 結果**:
- ⚠️ もし user / data 検出 → CEO 報告 + Stage B1 着手停止
- ✅ user / data 不在 → Stage B1 着手 GO 候補

### 1.2 重複 timestamp 4 file SQL review (= 親 readiness §3 採用後)

対象:
- `20260430100000_external_anchors.sql`
- `20260430100000_coalter_memory_items_realtime.sql`
- `20260430110000_plan_drift_events.sql`
- `20260430110000_coalter_memory_items_replica_full.sql`

**review 観点**:
1. 各 file の SQL 内容 (= CREATE TABLE / ALTER / RLS 等の作用範囲)
2. 同 timestamp 内の 2 file 間で **依存関係** (= FK / trigger / 参照) があるか
3. 順序問題が **data 結果に影響** するか
4. 「保持で進める」 か 「rename が必要」 か 最終確定

**判断**:
- ✅ 順序非依存 → 親 readiness 推奨通り **「保持」 で進める** (= rename しない)
- ⚠️ 順序依存検出 → CEO 報告 + 別 sub-stage で rename 検討
- 本 readiness では SQL review の **方法** と **判断 criteria** を定義、 実 review は実行時

### 1.3 既存 `notifications` table SQL error 扱い (= CEO 確定 「試行確認」)

- 旧 phase の P3-A-1 local 起動で発覚した bug
- 「先に編集せず、 staging 試行時に再現するか確認」 が CEO 判断
- Stage B1 実 push 時に該当 file 到達点で **失敗するか観測**
- 失敗時 → 即停止 + CEO 報告 + 別小 phase で扱う (= §4)

### 1.4 link 状態確認 (= Stage B1 全 step を通して厳守)

- 着手前: link は production (= Culcept Tokyo) のはず (= P3-A-1 phase 終了時の状態)
- Step 1 で staging 切替 → 全 step staging で完結 → 最終 Step で production 戻し
- 途中で link 切替を別 step に挟まない (= 混乱防止)

---

## 2. Pre-flight check (= AI 自律実行可、 read-only)

### 2.1 Step 1: staging link 切替 (= read-only stage)

```bash
supabase link --project-ref hjcrvndumgiovyfdacwc
cat supabase/.temp/project-ref  # = hjcrvndumgiovyfdacwc 確認
supabase projects list | grep -E "LINKED|●"  # = ● が culcept-staging に
```

確認: link が staging に切替済

### 2.2 Step 2: staging migration list 確認

```bash
supabase migration list --linked
```

確認:
- 175 file 全て未適用 (= REMOTE 列空) 想定通りか
- 既に適用された file が混入していないか

### 2.3 Step 3: dry-run

```bash
supabase db push --dry-run
```

確認:
- 175 file 全て push 計画に含まれているか
- 出力に明示的なエラーがないか (= dry-run でも syntax 不正は検出される)

### 2.4 Step 4: 重複 timestamp 4 file SQL review (= §1.2 採用)

各 file を psql 不要で読み込み:
- 4 file の SQL content を 1 通り読む
- 依存関係を §1.2 review 観点 4 項で評価
- 結論: 「保持で進める」 / 「rename 必要」 / 「順序非依存確認済」 等を明示

### 2.5 Step 5: staging user / data 確認 (= §1.1 採用)

具体的方法 (= AI が実行可):
- `supabase db remote query` 系で `SELECT count(*) FROM auth.users` 等を試行 (= ただし auth スキーマ参照可能性 要確認)
- もしくは Supabase Studio (= staging) で GUI 確認
- 確認結果を CEO に報告

### 2.6 Pre-flight check 結果報告

すべて PASS なら → **CEO 個別承認 stop 1** で待機。 失敗時は §4 へ。

---

## 3. CEO 個別承認 stop points (= 4 つ)

Path β 不変原則: **AI 自律で全実行しない、 各 stop で CEO GO 取る**

### Stop 1: pre-flight check 完了報告 → 実 push GO 判断

- §2 すべて PASS の状態で報告
- CEO 判断:
  - ⬜ Stage B1 実 push GO (= Step 6 へ)
  - ⬜ pre-flight 補正必要 (= 再 dry-run / SQL review 補足)
  - ⬜ Stage B1 中止 (= 別 path 採用)

### Step 6: 実 push 実行 (= CEO GO 取得後)

```bash
supabase db push
```

注:
- interactive prompt が出る可能性 → `--password` flag 要否確認
- 175 file の順次 apply 中、 既存 `notifications` SQL error で停止する可能性
- 停止時 → 即 CEO 報告 (= §4 失敗時対応)

### Stop 2: 実 push 完了報告 → Stage B2 着手 GO 判断

- 実 push 結果 (= 全 file PASS / 部分失敗 / 全失敗) を報告
- CEO 判断:
  - ⬜ Stage B1 完了、 Stage B2 readiness 起草 GO
  - ⬜ Stage B1 部分完了 → 残 file の対応方針確定
  - ⬜ Stage B1 失敗 → rollback or 別 stage で扱う

### Step 7: 部分検証 (= 即時 PASS 確認、 詳細検証は Stage B2)

- 新 table 数件存在確認 (= `\d user_calendar_connections` 等、 ただし psql access 要確認)
- supabase migration list で REMOTE 列に日時表示確認

### Stop 3: link を production に戻す GO 判断

- staging push 完了状態で、 link を production に戻す前に CEO 確認
- 通常は即時戻し OK だが、 念のため stop
- CEO 判断:
  - ⬜ link 戻し GO (= Step 8 へ)
  - ⬜ 追加検証 staging で必要 → link 維持

### Step 8: link を production に戻す (= 安全状態復帰)

```bash
supabase link --project-ref aljavfujeqcwnqryjmhl
cat supabase/.temp/project-ref  # = aljavfujeqcwnqryjmhl 確認
```

### Stop 4: Stage B1 完了報告 + decision-log 更新 GO 判断

- Stage B1 全 step 終了
- decision-log + Migration debt phase readiness に結果を追記
- atomic docs commit (= Stage B1 結果記録)
- CEO 判断:
  - ⬜ Stage B2 readiness 起草着手
  - ⬜ Stage B1 まで一旦凍結

---

## 4. 失敗時の対応 (= 自律で recovery しない)

### 4.1 `notifications` table SQL error 再現 (= §1.3 「試行確認」 採用)

- 該当 migration apply 時に staging で `ALTER TABLE notifications ADD COLUMN data JSONB` 等が失敗するか観測
- 失敗時:
  - **即停止** (= 残 file の apply 試行禁止)
  - CEO 報告 (= 失敗 file 名 + error message + log)
  - 別小 phase で対応:
    - option a: 該当 migration file の修正 (= IF NOT EXISTS 追加 等)
    - option b: 該当 migration を skip して別途 apply
    - option c: migration history 手動修復
  - 本 readiness 範囲外、 CEO 個別判断

### 4.2 部分失敗 (= 一部 file PASS、 一部 file fail)

- supabase CLI は失敗 file で stop する設計
- 既 apply 済 file は staging に反映済 → 状態は 「中間」
- 即停止 + CEO 報告
- recovery 案:
  - 失敗 file の SQL 修正 + 再 push
  - 失敗 file を skip flag で次に進める
  - staging 全 reset (= `supabase db reset --linked`、 staging のみ、 危険)

### 4.3 全失敗 (= 1 file 目から fail)

- 通常 link 不備 / network / auth 問題
- pre-flight check で防げているはずだが、 万一の場合
- 即停止 + CEO 報告 + 別 phase で原因究明

### 4.4 想定外の警告 / 不審なメッセージ

- dry-run で出ない警告が実 push で出る場合
- 即停止 + CEO 報告 + 内容 review

### 4.5 link が想定外の project に切替わっている

- 例: 何かの操作で link が変わった
- 各 step 前に `cat supabase/.temp/project-ref` で必ず確認
- 想定と異なれば即停止 + CEO 報告

---

## 5. Stage B1 完了後の動き

### 5.1 完了条件

- ✅ staging に 175 file 適用済 (= REMOTE 列に日時表示、 list 全件)
- ✅ link が production に戻り
- ✅ decision-log + readiness に結果記録
- ✅ atomic docs commit 着地

### 5.2 次の動き = Stage B2 readiness 起草

Stage B2 (= staging 検証、 個別検証セット):
- migration health
- `external_anchors` table 動作
- 関連 RPC (= `create_external_anchor_bundle` 等)
- P3 に必要な table / policy / index (= `user_calendar_connections` 等)
- P3 connect / callback / status / banner に関わる最低限の動作確認

各検証項目を Stage B2 readiness で定義。 検証実行 + 結果報告 → Stage B3 GO 判断。

### 5.3 Stage B1 失敗 / 部分完了の場合

- Stage B2 着手しない
- 失敗内容に応じて別小 phase で扱う
- CEO 判断後の path に従う

---

## 6. 着手禁止事項 (= 本 readiness 不変原則)

- ❌ `supabase db push` を本 readiness 起草中に実行しない
- ❌ link 切替を本 readiness 起草中に行わない
- ❌ Stage B2 / B3 / B4 の内容を本 readiness に書かない (= 各 stage 別 readiness)
- ❌ Production への push を本 readiness 範囲に含めない (= Stage B3 範疇)
- ❌ 重複 timestamp の rename を本 readiness 内で実行しない (= SQL review 結果次第、 別 sub-stage)
- ❌ `notifications` migration の事前編集を行わない (= CEO 確定 「試行確認」)
- ❌ 親 phase (= P3-A-1) の branch に commit 追加しない (= freeze 維持)

---

## 7. 参照

- `docs/alter-plan-migration-debt-phase-readiness.md` (= 親 readiness、 同 branch、 Scenario B 採用 + Path β 確定)
- `docs/alter-plan-migration-apply-plan.md` (= P3-A-1 branch、 D-e 採用時の初期整理)
- `docs/alter-plan-p3-a-1-closeout.md` (= P3-A-1 branch、 freeze 状態 + 再開条件 3 step)
- `docs/decision-log.md` (= P3-A-1 branch、 2026-05-26 entry、 D-e + 着地宣言)

注: 上記 P3-A-1 branch 参照 doc は本 branch (= main 派生) には存在しないが、 内容は親 readiness §1 に再整理済。

---

## 8. 不変原則 (= 本 readiness 自身の)

- 本 readiness は **docs-only**、 起草 commit 着地で停止
- Stage B1 実行は CEO 個別 GO (= 副判断 4 確定)
- 4 stop point で必ず CEO 判断を取る (= AI 自律 全実行禁止)
- 本 readiness 確定後の追加要素 (= 例: 既存 migration bug 詳細修正手順) は **別 sub-readiness**
- 失敗時の自律 recovery 禁止 (= 即停止 + 報告)

---

## 9. CEO 判断必要事項 (= 本 readiness 着地後、 Stage B1 着手前)

⬜ **Stage B1 着手 GO** = Pre-flight check (= §2) を AI が実行 → Stop 1 で実 push GO を CEO 判断
⬜ **着手タイミング** = 即時 / 別優先後
⬜ **個別補正** = §2 / §3 / §4 のいずれかに補正
⬜ **Path β 不変原則 維持確認** = 4 stop point + CEO 個別承認 + read-only / dry-run / 実 push 順序

---

## 10. 結論 (= 本 readiness core)

**Stage B1 = staging に 175 file 一括 push を、 AI が pre-flight check + dry-run まで read-only で実行し、 4 stop point で CEO 判断を取りながら段階的に進める。 失敗時は即停止 + CEO 報告。 Stage B2 readiness は本 stage 完了後に起草。**

本 readiness 起草着地 → Stage B1 着手 GO は CEO 個別判断。
