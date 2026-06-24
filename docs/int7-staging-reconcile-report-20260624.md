# INT-7 — staging read-only 照合レポート（2026-06-24）

> integration `integration/freeze-roundup-on-a9eedce69-20260623`@`07a8ae192` の migration 8本 ↔ staging（`hjcrvndumgiovyfdacwc`）実状態を **read-only** で照合。
> **production には一切接続していない**。staging への write・apply も一切なし。production preflight は INT-10。

## 0. 実行環境・安全確認
- **link 状態（remote command 前にファイル読みで確認）**:
  - integration worktree: **link なし**
  - `Culcept-int-battery`: **`hjcrvndumgiovyfdacwc`（staging）link 中** → ここでのみ read-only コマンド実行
  - 🔴 **harness worktree（nervous-joliot）: `aljavfujeqcwnqryjmhl`（production）link 中** ← MEMORY 警告の事故源。**ここでは一切 remote command を打たなかった**
- 実行コマンド = **read-only のみ**: `supabase migration list --linked` / `supabase inspect db table-stats --linked`（int-battery=staging で実行・両方とも DB への write なし・パスワード prompt なし＝link キャッシュ利用）。
- `supabase db dump` は **Docker 依存**（未起動）で実行不可 → DDL レベルの dump は取得できず（後述の finer 照合が未完の理由）。

## 1. migration 8本の staging 適用状況（version レベル）

`supabase migration list --linked`（staging）の Remote 列で全 8 本が適用済み（Local 列が空なのは int-battery=a9eedce69 にファイルが無いだけ・staging 適用とは無関係）:

| # | version | migration | staging schema_migrations |
|---|---|---|---|
| 1 | 20260613120000 | plan_coalter_session_messages | ✅ 適用済み |
| 2 | 20260615100000 | external_anchors_start_time_provenance | ✅ 適用済み |
| 3 | 20260616100000 | duration_confirmations | ✅ 適用済み |
| 4 | 20260621100000 | create_travel_core | ✅ 適用済み |
| 5 | 20260621100100 | create_travel_movement_memories | ✅ 適用済み |
| 6 | 20260621100200 | create_location_notes | ✅ 適用済み |
| 7 | 20260621100300 | harden_location_note_saves_insert | ✅ 適用済み |
| 8 | 20260621100400 | harden_itinerary_link_insert | ✅ 適用済み |

## 2. オブジェクト実体の確認（table レベル・partial-apply リスク排除）

`supabase inspect db table-stats --linked`（staging・280 table）で対象 15 table が**物理的に実在**:

✅ plan_coalter_sessions / plan_coalter_session_participants / plan_coalter_session_messages / plan_coalter_session_read_cursors / duration_confirmations / travel_trips / travel_days / travel_photos / travel_reservations / travel_itinerary_items / travel_movement_legs / travel_memories / location_notes / location_note_saves / location_note_to_itinerary

→ **version 記録だけでなく実 table が存在**＝「記録だけ進んだ partial apply」リスクは table レベルで**排除**。

## 3. 未検証（finer 照合・CEO 環境 / staging smoke で実施推奨）
以下は Docker（`db dump`）または psql 直接接続（DB パスワード＝Claude が扱えない認証情報）が必要で**本 INT-7 では未確認**:
- `external_anchors` の ADD COLUMN 4本（start_time_source / is_all_day_placeholder / timezone_of_record / start_time_provenance_recorded_at）の実在
- `location_note_saves` / `travel_itinerary_items` / `location_note_to_itinerary` の **INSERT policy hardening**（#7/#8 の WITH CHECK 本文）が反映されているか
- FK `confdeltype`（CASCADE / SET NULL）が repo 期待と一致するか
- RLS enabled / owner-only policy の本文

→ 検証 SQL は `docs/int7-staging-reconcile-plan.md` §2-B〜2-E に記載済み。CEO 環境（Docker 起動 or psql 接続）または staging smoke 時に実行する。

## 4. repo migration 8本の分類（CEO item 4）
| 区分 | 対象 |
|---|---|
| **staging 適用済み（version + table 実在）** | **8本すべて** |
| staging 未適用 | なし |
| staging に schema ありだが履歴なし | 検出されず（version 全記録） |
| staging にも未存在 | なし |
| **production apply 候補** | **8本すべて**（production 未接続・INT-10 で確認） |
| apply 不要候補（staging） | 8本（既適用のため staging への再 apply 不要） |

## 5. staging との差分
- **コード（repo 8本）↔ staging：差分なし**（8本とも適用済み・15 table 実在）。staging は本 8 migration について**最新状態**。
- 注: staging の local migration 履歴（int-battery 側）は a9eedce69 ベースで 8本のファイルを持たないが、これは**ファイルの所在問題**であり staging DB の適用状態とは独立（staging DB は適用済み）。integration worktree（8本のファイルを持つ）を staging に link すれば Local=Remote で同期表示になる。

## 6. production apply 計画（INT-10 で確定・本 INT-7 では未接続）
- **apply 順序**（依存順 = version 昇順）: 20260613 → 20260615 → 20260616 → **20260621100000(travel_core)** → 100100(movement) → 100200(location_notes) → 100300/100400(harden)。travel ブロックは #4→(#5,#6)→(#7,#8) の依存（#6 が #4 の itinerary_items に FK 後付け・harden は対象 policy 既存が前提）。
- **production preflight**: `docs/production-preflight-draft.md` §5。二重 ref 確認（`aljavfujeqcwnqryjmhl` を目視）+ backup + `migration list` で remote-only=0 確認 + `db push` + apply 後 structural 検証 + 完了後 unlink。
- **CEO 承認案件**（production DB apply = CLAUDE.md Operating Rules）。

## 7. production 前 blocker（本 INT-7 由来 / 既存）
- 🔴 **harness worktree が production link 中**（`aljavfujeqcwnqryjmhl`）= 誤 `db push` で prod 直撃の事故源。**production 作業前に link を staging へ明示切替 + 二重確認、または harness の link を解除**することを強く推奨（本 INT-7 では harness を一切触らず回避）。
- 🟡 finer 照合（columns/policies/constraints/FK cascade）未完（§3）→ CEO 環境で実施。
- （既存 B-1 / B-2 / B-3 / B-4 は別 ledger）。

## 8. rollback 注意点
- 8本すべて additive（`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN`(NULL可) / policy `DROP IF EXISTS→CREATE`）・executable な破壊操作ゼロ（INT-5 A5 確認）。
- production rollback は各 migration ヘッダの rollback SQL（travel/location/duration = `DROP TABLE CASCADE`・external_anchors = 列 DROP 慎重・policy = 旧 owner-only へ戻す）。flag OFF なら新 table 不参照のためコード rollback だけで実害ゼロ。
- #6 location_notes は唯一の公開 select 経路（published は Phase G まで未運用）→ RLS 単独レビュー必須。

## 9. cleanup
- int-battery（staging link）/ harness（production link）の link は**変更していない**（read-only のみ）。`supabase/.temp` は gitignore 済で commit 対象外。
- 本レポートのみ integration worktree に commit（docs-only）。`.env.local` 作成なし・staging/production write なし。

**結論：staging は本 8 migration について最新状態（version + table 実在で確認）。finer 照合と production apply は CEO GO（INT-10）で。**
