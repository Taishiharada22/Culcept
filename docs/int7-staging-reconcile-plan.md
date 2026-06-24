# INT-7 — staging（ref `hjcrvndumgiovyfdacwc`）read-only 照合計画

> 生成: INT-5（2026-06-24）。**read-only。DB 接続もしない。apply / db push は別 CEO GO。**
> 「staging へ apply 判断する前に、staging 現状と repo 8本の差分をどう読み出すか」の手順書のみ。

## 0. 前提
- branch `integration/freeze-roundup-on-a9eedce69-20260623`@`a6657e3d4`・base `a9eedce69`。base..HEAD で追加 migration = **8本**。
- `supabase/.temp/project-ref` は gitignore 済（link marker は local-only・本 worktree で空）→ link 先は CLI global state 依存・commit から判定不能 → §4 の二重確認必須。

## 1. repo 8本 migration（version ↔ オブジェクト）
| # | version | ファイル | 種別 | 主オブジェクト |
|---|---------|---------|------|----------------|
| 1 | 20260613120000 | plan_coalter_session_messages | CREATE TABLE×4+RLS | plan_coalter_sessions/participants/messages/read_cursors |
| 2 | 20260615100000 | external_anchors_start_time_provenance | **ALTER ADD COLUMN×4**+CHECK×3+RPC | external_anchors に start_time_source 他4列・RPC create_external_anchor_bundle |
| 3 | 20260616100000 | duration_confirmations | CREATE TABLE+trigger+RLS | duration_confirmations（独立 table） |
| 4 | 20260621100000 | create_travel_core | CREATE TABLE×5+FK後付×2+trigger+RLS | travel_trips/days/photos/reservations/itinerary_items |
| 5 | 20260621100100 | create_travel_movement_memories | CREATE TABLE×2+RLS | movement_legs/memories（**依存 #4**） |
| 6 | 20260621100200 | create_location_notes | CREATE TABLE×3+FK後付+RLS（**唯一の cross-user select**） | location_notes/saves/to_itinerary（**依存 #4**） |
| 7 | 20260621100300 | harden_location_note_saves_insert | DROP+CREATE POLICY | saves INSERT を可視 note 限定（**依存 #6**） |
| 8 | 20260621100400 | harden_itinerary_link_insert | DROP+CREATE POLICY×2 | itinerary/link INSERT を自分の day/可視 note 限定（**依存 #4+#6**） |

## 2. staging で読む read-only SQL（接続は別 GO・SQL 案のみ・全 SELECT）
- **2-A 適用済み version**: `SELECT version FROM supabase_migrations.schema_migrations WHERE version IN (8本) ORDER BY version;`（返らない=未適用候補）
- **2-B ADD COLUMN/table 実在**: `information_schema.columns`（external_anchors の4列）+ `information_schema.tables`（repo 期待 15 table）
- **2-C RLS**: `pg_class.relrowsecurity` + `pg_policies`（#7/#8 hardening 判定＝saves/itinerary INSERT policy の with_check に `EXISTS location_notes`/`travel_days` 参照があるか・location_notes_read の qual に published/approved）
- **2-D FK cascade**: `pg_constraint.confdeltype`（user_id→auth.users が `c`=CASCADE / hero_photo・reservation_id・source_note_id が `n`=SET NULL / trip_id・day_id が `c`）。期待と違えば drift（孤児化 privacy リスク）
- **2-E CHECK/RPC/trigger**: external_anchors 3 CHECK・create_external_anchor_bundle RPC・duration/travel updated_at trigger

## 3. 差分の出し方 + apply 順序
1. repo 期待集合 A=8 version。2. staging 実態 B=2-A 返却。3. 第一次差分 A−B=未適用候補。4. 第二次検証（手動止血で記録ズレがあるため version 一致でも 2-B〜2-E で実体確認）: version 記録あり＆オブジェクト欠落=危険 partial drift／記録なし＆存在=記録漏れ。5. 判定表（version×実在）で「適用済み整合/未適用/記録ズレ partial」3 区分。
- **apply 順序 = version 昇順（依存順）**。travel ブロックは **#4 → (#5,#6) → (#7,#8)**。#6 が #4 の itinerary_items に FK 後付け → #4 飛ばし不可。harden #7/#8 は policy revise → 対象 table/policy 既存(#4,#6 適用済)でないと DROP IF EXISTS が no-op で旧 policy 残存=hardening 抜け。**「#4,#6 を当てたら必ず #7,#8 まで」**。

## 4. 安全ゲート（誤 prod 直撃防止・二重確認）
MEMORY 記載「CLI が全 worktree で production `aljavfujeqcwnqryjmhl` link 中」が事故源。staging=`hjcrvndumgiovyfdacwc`。**DB を読む前に**: ①link ref 確認（`supabase projects list` / `.temp/project-ref`）②ref 文字列の目視照合（staging であり production で**ない**）③接続文字列 host 確認 ④本 INT-7 は §2 SELECT のみ（push/migration up/reset/DDL 禁止）⑤実 apply は「CEO 明示承認+staging 検証+backup+link 二重確認」4 ゲートで別セッション。
### preflight（DB 接続前）
- [ ] branch = integration/freeze-roundup-on-a9eedce69-20260623
- [ ] 対象 ref 文字列照合 → `hjcrvndumgiovyfdacwc`（staging）・`aljavfujeqcwnqryjmhl`（prod）でない
- [ ] SELECT のみ（DDL/push なし）・apply しない（別 GO）

## 5. 想定アウトプット（DB 接続 GO 後に埋める）
| version | repo 期待 | schema_migrations 記録 | 実体確認 | 判定 |
|---|---|---|---|---|
| (8本) | (§1) | ? | ? | 適用済み整合 / 未適用 / 記録ズレ |
partial / FK confdeltype 不一致 / hardening 抜けが出たら CEO 報告 → 補修+apply 計画を別 GO で起票。

**本タスクは read-only。DB 接続・apply は別 CEO GO。**
