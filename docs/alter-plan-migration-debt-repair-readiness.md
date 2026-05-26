# Migration Debt Repair Readiness（小 phase）

**起草日**: 2026-05-26
**起草者**: AI 執行部（Build Unit）
**親 phase**: `migration-debt-phase`（main 派生）
**現 branch**: `feat/migration-debt-phase-readiness`
**status**: CEO 承認待ち（着手前停止）
**先行 phase**:
- `Stage B1` で staging push 試行 → 2 file 目で失敗 → 中止判断（CEO）→ 本 phase へ移行

---

## §0 — phase 定義 / 範囲

### 何をするか

Stage B1 staging push 失敗の **root cause を確定し**、repo migration 列を clean environment で最後まで再生できる状態に**戻す設計を起草する**。

### 何をしないか

- **本 phase では実 push しない**
- **本 phase では production を触らない**
- **本 phase では staging を初期化しない**
- **本 phase では migration file を delete / rename しない**
- 起草段階は **doc のみ**。実行 step は Stage 別に CEO 個別承認

### 親 phase との関係

- migration-debt-phase の本来目的「repo migration 列を clean environment で再生」が、Stage B1 で「再生不能」と判明。
- ⇒ 親 phase の前提が崩れた。**親 phase 続行には、本 small phase の完了が前提**。

---

## §1 — 発生事実（Stage B1 結果）

### 1.1 実行

- branch: `feat/migration-debt-phase-readiness`（main 派生）
- linked: `hjcrvndumgiovyfdacwc`（staging）
- 実行コマンド: `echo "y" | supabase db push --linked`
- 実行時刻: 2026-05-26（Stop 2 直前）

### 1.2 結果

| 状態 | 件数 | 詳細 |
|---|---|---|
| ✅ 適用成功 | 1 file | `20260202010849_experiment_assignments.sql` |
| ❌ 適用失敗 | 1 file | `20260202100000_notification_preferences.sql` |
| ⏸ 未実行（残り） | 170 file | 失敗 file 以降は全て stop |

### 1.3 失敗 error

```
ERROR: relation "notifications" does not exist (SQLSTATE 42P01)
At statement: 13
ALTER TABLE notifications ADD COLUMN data JSONB;
```

### 1.4 部分適用状態

- staging `supabase_migrations.schema_migrations` row 数 = **1**
- staging public schema: `experiment_assignments` 関連 table のみ存在
- staging auth schema: 既存 2 ユーザー / 40 session 維持（変化なし）

### 1.5 production 完全未接触

- Push 試行は staging のみ。production link 切替は Step 1 以後（forensic 段階）。
- production への push / DROP / DELETE 系操作は**一切実行していない**。

---

## §2 — Read-only forensic 結果

本 §は production link 復帰後（read-only）に実施した調査結果。

### 2.1 repo 全期間で `notifications` table を CREATE する migration が**存在したことがない**

- `grep -rE "CREATE TABLE.*notifications\b" supabase/migrations/` → **0 件**
- git log 全期間で `CREATE TABLE IF NOT EXISTS notifications` を加える commit → **0 件**
- `git log --diff-filter=D --name-only` で削除済 migration file → **0 件**

⇒ **「削除済 migration」仮説は否定**。

### 2.2 失敗 file（`20260202100000_notification_preferences.sql`）の初回 commit

- commit: `541b6844 feat: 通知詳細設定機能` (2026-02-02)
- 同 commit の含まれる migration: **`notification_preferences.sql` 1 file のみ**
- ⇒ この commit は「`notifications` table が既に存在している前提」で migration を書いた

### 2.3 production には `notifications` table が**実在**

- production schema dump（read-only）で確認:
  ```sql
  CREATE TABLE IF NOT EXISTS "public"."notifications" (
      "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
      "user_id" "uuid" NOT NULL,
      "type" "text" NOT NULL,
      "title" "text" NOT NULL,
      "body" "text",
      "link" "text",
      "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
      "read_at" timestamp with time zone,
      "data" "jsonb"                              -- ← この column が問題の中心
  );
  ```
- production には `data jsonb` column が**既に存在**

### 2.4 production migration list の正確な状態（前回報告を訂正）

| 区分 | 件数 |
|---|---|
| Both LOCAL & REMOTE applied | **168** |
| LOCAL only（repo にあり、 production 未適用） | **4 timestamp（実 file 数 6、 重複含む）** |
| REMOTE only（production 適用済、 repo に file なし） | **0** |

> ⚠️ 前回 Stop 1 / Stop 2 報告で「production 8 file unapplied」と書いたのは**誤り**。正しくは **4 timestamp（実 file 数 6）**。本 doc が訂正版。

LOCAL only 4 timestamp:
- `20260430100000`（× 2 file: external_anchors / coalter_memory_items_realtime）
- `20260430110000`（× 2 file: plan_drift_events / coalter_memory_items_replica_full）
- `20260519100000`（create_external_anchor_bundle）
- `20260520120000`（coalter_mirror_app_settings）

---

## §3 — 仮説確定

### 3.1 採用仮説: **手動作成（Supabase Studio SQL Editor 経由）**

根拠:
- repo に CREATE migration が**過去にも存在しない**（§2.1）
- production に table が**実在**（§2.3）
- production の `data` column も追加済（§2.3）= notification_preferences.sql の ALTER が**過去に成功した**ことの証拠
- staging で再現できない = **migration として記録されていない操作**が production に存在する

### 3.2 推定タイムライン

```
[2026-02-02 以前のある時点]
   ↓ Supabase Studio SQL Editor で
   ↓ 手動 CREATE TABLE notifications (...)
   │
[2026-02-02 13:46:42] commit 541b6844
   ↓ notification_preferences.sql を repo に追加
   ↓ （production には適用、 staging 未確認）
   │
[2026-02-02 以後〜2026-04-30] 168 migration を順次 production 適用
   ↓ 全て成功（notifications table が既存だったため）
   │
[2026-05-26 Stop 2]
   ↓ staging に migration 一括 push 試行
   ↓ notification_preferences.sql で error
   ↓ （staging には手動作成 step がない）
```

### 3.3 同種 debt が他にも存在する可能性

- 本 phase で確認できたのは `notifications` table のみ
- ただし同じパターン（手動作成 → migration で ALTER）が**他 table にもある可能性**は高い
- 確認手段: production schema dump と repo migration の CREATE TABLE 突合（本 phase §5 で実施提案）

---

## §4 — 影響範囲

### 4.1 production の安定性

- production は現状**動いている**（168 migration 適用済、 application 稼働中）
- 既存 user 2 名 / data 保持されている（staging とは別物）
- **本 phase で production には触らない**

### 4.2 staging の状態

- 1 file 部分適用済（`experiment_assignments` 関連）
- 残り 171 file 未適用
- 既存 user 2 名 / auth data 保持
- public schema は再生不能（手動作成 step が repo にない）

### 4.3 development の制約

- 新規 migration 追加（例: `20260526110000_p3_a_1_1_calendar_oauth.sql`）の **apply path が依然として閉じている**
- ⇒ P3-A-1 phase の「migration apply 後の DB persist」が引き続き hold

### 4.4 本 phase 完了後に解決すべきこと（順序）

1. repo migration 列を clean environment で再生可能な状態にする（本 phase）
2. staging を初期化 + clean push（**別 phase**、本 phase 完了後）
3. P3-A-1 migration を staging で検証（**さらに別 phase**）
4. production push（**さらに別 phase**、 staging 検証後）

---

## §5 — 復旧オプション（CEO 判断材料）

### Option 1: 「不足 migration 補完」案 ⭐ 推奨

#### 手順

1. production schema dump と repo migration の **全 CREATE TABLE 突合**（read-only 監査）
2. 「production にあり、 repo の migration に CREATE がない」table を全リストアップ
3. その table 群を作成する **補完 migration file** を `20260101000000_initial_manual_tables.sql` として新規作成
4. ファイル名 timestamp は repo の最古 migration（`20260202010849`）より前の `20260101000000` などにして**前置**
5. staging を完全初期化 → 補完 file + 既存 172 file = 173 file 一括 push
6. staging で全 file 適用成功を確認
7. その後、 production に対して `supabase migration repair --status applied 20260101000000` で「production には適用済」フラグを立てる（実 SQL は実行しない、 履歴のみ修正）

#### 利点

- production の現状を保持しつつ、 repo の再生可能性を回復
- staging で完全再現できる migration 列が完成
- 他の手動作成 table も同時に修復可能
- 将来の developer onboarding / 新 environment 構築が再現可能になる

#### 注意

- 補完 file は「production にある table 構造の正確な複製」である必要あり
- production schema dump からそのまま CREATE TABLE 抜き出す方式が安全
- 補完 file は `IF NOT EXISTS` で書く（既存 environment 安全）
- staging を完全初期化する step が別 phase で必要

### Option 2: 「失敗 file の修正」案

#### 手順

1. `20260202100000_notification_preferences.sql` の冒頭に `CREATE TABLE IF NOT EXISTS notifications (...)` を追加
2. 同じ file 内に column 定義 + ALTER COLUMN 両方を入れる
3. staging で再 push

#### 利点

- 変更範囲が最小
- file 1 つの修正で済む

#### 欠点

- 「他の手動作成 table」が**いつ顕在化するかわからない**
- 1 file 修正のたびに同じ analysis が必要
- root cause（手動作成パターン）の解決にならず、**先送り**

### Option 3: 「staging 完全初期化 + 段階適用」案

#### 手順

1. staging を Supabase Studio で project reset（全 schema 初期化）
2. repo migration を 1 file ずつ手動適用、 error が出た都度修正
3. 全 file 通るまで繰り返す

#### 利点

- 必ず再生可能になる
- 最も堅実

#### 欠点

- 時間がかかる
- 手動作業が多い
- staging の 2 ユーザー / 40 session が消える（無視可能）

### Option 採用判断（提案）

**Option 1 採用を推奨**。理由:
- root cause（手動作成 / migration 未記録）を根本解決
- 1 度 forensic 全体監査すれば、 残り debt が一括で把握できる
- repo 再生可能性が将来にわたり保証される
- production を touch しない

⚠️ 本 doc は提案のみ。CEO 判断で Option 確定後、別 readiness で実行 step を切る。

---

## §6 — 推奨 Path（CEO 判断後の小 phase 列）

```
[本 phase: Migration Debt Repair Readiness]  ← 今ここ
   ↓ CEO Option 確定
   │
[Stage R1: production schema vs repo CREATE TABLE 全突合 監査]
   ↓ read-only、 不足 table リスト確定
   ↓ Stop 1（CEO 承認）
   │
[Stage R2: 補完 migration file 起草]
   ↓ production schema dump から CREATE TABLE 抽出
   ↓ 補完 file 作成（docs だけ、 push しない）
   ↓ Stop 2（CEO 承認）
   │
[Stage R3: staging 完全初期化 + 補完含む全 push 検証]
   ↓ staging リセット
   ↓ 173 file 一括 push（補完 1 + 既存 172）
   ↓ 全 file 適用成功確認
   ↓ Stop 3（CEO 承認）
   │
[Stage R4: production schema_migrations 履歴調整]
   ↓ supabase migration repair で補完 file を applied フラグ立て
   ↓ production schema は touch しない
   ↓ Stop 4（CEO 承認）
   │
[Stage R5: closeout + decision-log 記録]
   ↓ 親 phase（migration-debt-phase）完了
   │
[Stage S1〜: 元の Path β を再開]
   ↓ staging に新規 4 file（P3-A-1 含む）push
```

各 Stage は **独立した readiness doc** を起こし、 **CEO 個別承認 4 stop** を経る。

---

## §7 — 不変原則（本 phase 中）

| # | 原則 | 違反検出方法 |
|---|---|---|
| 1 | 本 phase は **doc のみ**、 code 変更なし | git diff で .ts/.tsx/.sql 変更ゼロ確認 |
| 2 | **production schema dump 以外で production に触らない** | linked ref と実行 SQL の audit |
| 3 | staging を完全初期化しない（次 phase でやる） | Supabase Studio operation log |
| 4 | repo の既存 172 migration を **delete / rename しない** | git status で migrations/ の delete / rename ゼロ確認 |
| 5 | 自律 retry / repair / recovery 禁止 | command log audit |
| 6 | 各 Stage は CEO 個別承認 | readiness doc の Stop 番号通り |

---

## §8 — 開始条件 / CEO 承認 stop point

### 開始条件

- ✅ Stage B1 失敗が記録済（本 doc §1）
- ✅ read-only forensic 完了（本 doc §2-3）
- ✅ link は production 復帰済（`aljavfujeqcwnqryjmhl`）
- ✅ 親 phase（migration-debt-phase）の context を維持

### Stop point（本 phase 内）

| Stop | 位置 | CEO 判断対象 |
|---|---|---|
| **Stop F** | 本 doc 起草完了直後 | Option 1 / 2 / 3 採用 + Stage R1 着手 GO |

### Stop F での判断材料

- §5 の 3 Option（推奨: Option 1）
- §6 の推奨 Path（Stage R1-R5）
- §7 の不変原則受諾

---

## §9 — 補正可能性 / risk

### 9.1 補正可能性

- 本 doc は initial 起草。CEO 補正歓迎:
  - Option 増やす（例: 別の rollback 戦略）
  - Stage 分割細かくする / まとめる
  - 不変原則追加
  - production schema dump の保存先指定

### 9.2 risk

| risk | 影響 | 緩和策 |
|---|---|---|
| 補完 migration の table 構造が production と微妙に異なる | clean environment で挙動微差 | dump SQL を一字一句コピー、 IF NOT EXISTS 使用 |
| 他 table にも同種 debt が潜在 | 同じ error が再発 | Stage R1 で全 CREATE TABLE 突合監査 |
| staging 初期化で 2 ユーザー消える | 影響軽微（テスト用） | application data なし、 ロス無視可能 |
| production schema_migrations 履歴調整に migration repair 必要 | repair 操作は schema 変更ではないが慎重に | Stage R4 で CEO 直接実行、 自律 NG |
| 補完 migration の timestamp が古すぎて conflict | 既存 168 file の前置として正常動作するか不明 | Stage R3 staging 検証で確実に確認 |

---

## §10 — 数字 / 事実 unify（本 phase の正本）

- staging Stage B1 push 試行 file 数: **172 file**
- staging Stage B1 適用成功: **1 file**（`20260202010849`）
- staging Stage B1 失敗 file: **1 file**（`20260202100000`）
- production applied migrations: **168 file**（前回 8 file は誤り）
- production unapplied（LOCAL only）: **4 timestamp / 実 file 数 6**
- production schema 中の CREATE TABLE 総数: **397 table**
- repo 全 migration file 数: **172 file**
- 仮説確定: **手動作成（Supabase Studio SQL Editor）**

---

**Stop F** — 本 readiness 起草完了。

CEO 判断仰ぐ:
- A: Option 1 採用 → Stage R1 readiness 起草に進む
- B: Option 2 採用 → 別 readiness で 1 file 修正 patch 設計
- C: Option 3 採用 → 別 readiness で staging リセット手順設計
- D: その他 / 補正
