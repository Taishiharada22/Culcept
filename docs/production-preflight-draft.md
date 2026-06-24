# Production 昇格 Preflight チェックリスト（草案・実行しない）

> 📝 草案（INT-5 read-only 調査・2026-06-24）。実行 GO ではない。
> 対象 branch `integration/freeze-roundup-on-a9eedce69-20260623`@`a6657e3d4`（base `a9eedce69`=local main）。
> CLAUDE.md Operating Rules: 本番反映/DB apply/課金/法務/外部連携/一斉通知/対外公開は**すべて CEO 明示承認**。CEO GO なしに実行しない。flag 点火は段階的・production-only flag は別 GO（本 deploy は default OFF 維持）。

## 0. このリリースの正体
- コード = freeze-roundup 統合（Travel UI/repository/Supabase write fix・LifeOps vertical・評価OS shadow 等）。実行系の新機能はすべて flag 裏（default OFF）。
- DB = migration 8本（§5）。staging applied・**production 完全未接続**。
- 挙動変更 = env flag 未設定（既定）では既存挙動と完全同一（fixture/localStorage/404-inert）。**この deploy 自体はユーザー可視挙動を変えない**前提。

## 1. Production ref / 環境（最初の二重確認ゲート）
- [ ] production ref = `aljavfujeqcwnqryjmhl` / staging ref = `hjcrvndumgiovyfdacwc`（混同厳禁・誤 push で prod 直撃の事故源）
- [ ] CLI link 状態を `cat supabase/.temp/project-ref` で目視。apply 時のみ意図的に prod re-link し作業前後で2回確認。`.temp/`/`.branches/` は gitignore 済（landmine 除去・commit 対象外）
- [ ] **⚠ `.canary-trigger.json`**: tracked で production ref 保持。`vercel.json` ignoreCommand が本 file 変更時に build trigger → **本 deploy では変更しない**
- [ ] Vercel production env（`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` 等）が production プロジェクトを指す
- [ ] flag env が production 未設定（=既定 OFF・§6）

## 2. Read-only snapshot（変更前固定）
- [ ] コード: `git rev-parse HEAD` / `git log --oneline -5` / `git status --short`（deploy 対象 commit 確定）
- [ ] DB schema: `supabase db dump --schema public -f backup/prod-schema-pre-s3.sql`（**untracked・commit しない**）
- [ ] `supabase migration list`（apply 前）・RLS/policy snapshot（rollback 比較ベースライン）

## 3. Backup・Rollback
- [ ] schema backup（§2）。8本すべて additive（IF NOT EXISTS / ADD COLUMN / policy 追加）でデータ backfill なし → データ backup 不要。policy hardening（#7/#8）は旧 policy 定義を記録（rollback 復元用）
- [ ] コード rollback = Vercel Instant Rollback（再 build 不要）or revert 再 deploy
- [ ] DB rollback = 各 migration ヘッダの rollback SQL（travel/location/duration = `DROP TABLE CASCADE`・external_anchors = 列 DROP 慎重・policy = 旧 owner-only へ戻す）
- [ ] 原則: flag OFF なら新 table 不参照 → **コード rollback だけで実害ゼロ**。DB DROP は孤児行不在確認後の最終手段

## 4. 統合 main 健全性ゲート（deploy 前）
- [ ] branch/status/log 3 点確認（CLAUDE.md Rule 8）
- [ ] origin/main（`5a0c0f7ec`）と本 branch の merge-base 確認。**main 直 push / whole merge / origin-main 更新は CEO 承認案件**
- [ ] tsc 55 維持 / tests 退化ゼロ（INT-5: full suite 21979 passed・1 failed=B-1 のみ）
- [ ] **🔴 B-1**: travelAdapterExternalLinksAttach base failure（ledger）。**production 昇格前に owning session で expectation 更新 or 明示 xfail/受容を CEO 判断**
- [ ] flags default OFF 確認（§6）

## 5. Migration 差分（8本）
| # | file | ドメイン | 種別 | staging | rollback |
|---|---|---|---|---|---|
| 1 | 20260613120000 coalter_session | /plan session | additive table+RLS | applied | DROP table 群 |
| 2 | 20260615100000 external_anchors | 4列+RPC | ALTER ADD(NULL可)+RPC | applied | 列 DROP（慎重） |
| 3 | 20260616100000 duration_confirmations | duration store | additive table+RLS | applied | DROP CASCADE |
| 4 | 20260621100000 travel_core | travel 5 table | additive+owner RLS | applied(staging) | DROP CASCADE |
| 5 | 20260621100100 movement_memories | legs/memories | additive 2 table | applied(staging) | DROP CASCADE |
| 6 | 20260621100200 location_notes | notes/saves/link（**公開 select**） | additive 3 table（最高リスク） | applied(staging) | DROP CASCADE |
| 7 | 20260621100300 harden saves | saves INSERT policy | policy revise | applied(staging) | 旧 owner-only へ |
| 8 | 20260621100400 harden itinerary | itinerary/link INSERT policy | policy revise | applied(staging) | 旧 owner-only へ |

**apply 前ゲート（CEO GO + 二重 ref + backup 後）**: prod re-link → `cat .temp/project-ref`=prod 目視 → `migration list` で remote-only=0 → backup 後 `db push` → apply 後 list で 8本 applied-both → structural 検証（10 table・RLS 10/10・hardened INSERT policy 3）→ **完了後 `supabase unlink`**。
**⚠** #6 location_notes は唯一の非 owner-only 読取（公開 select）。published は Phase G まで未運用だが RLS 単独レビュー必須。

## 6. Deploy 対象 commit と flag 既定
- [ ] deploy 対象 = 統合 main 最終 commit（CEO 承認時の main HEAD 再確定）
- [ ] Vercel: GitHub 連携・md-only 差分は build skip・`.canary-trigger.json` 変更で build 強制
- [ ] production-only flag は別 GO（default OFF 維持）: `NEXT_PUBLIC_PLAN_TRAVEL_DAY_DETAIL_ENABLED`/`_MAP_LIVE_ENABLED`/`_SUPABASE_REPO_ENABLED`・`PLAN_TRAVEL_PERSONALIZATION_REAL_READ`・`NEXT_PUBLIC_PLAN_COALTER_ENGINE_LIVE`/`PLAN_COALTER_PERSONALIZATION_REAL_READ`
- [ ] 外部 API（Places/Routes/affiliate）は CEO 承認+API キー案件（本 deploy 含めない）

## 7. Post-deploy smoke（flag OFF 前提＝既存挙動不変）
- [ ] build 成功・Vercel Ready
- [ ] 既存導線無回帰: `/`・`/plan`・`/calendar`・`/stargazer` が 200（console error 0）
- [ ] flag OFF 経路: CalendarTab で Travel day detail entry が出ない・Travel は fixture/localStorage
- [ ] 404-inert: `/api/plan/coalter/intelligence`・`/api/plan/travel-personalization` が flag OFF で 404
- [ ] DB 健全性: `/api/stargazer/profile` が migration 後も 200・必要 field 返却（新 table が既存 query を壊さない）
- [ ] cron 無回帰（vercel.json 既存 cron 6 本）・5xx/例外スパイク無し（15-30 分監視）
- [ ] 新 table が空（flag OFF ゆえ write ゼロ）

## 8. privacy / RLS / consent 監査（昇格前必須）
- [ ] 全 travel_*/location_note_*/duration_confirmations の user_id→auth.users が ON DELETE CASCADE（孤児化回避・account/delete 整合）
- [ ] 観測書込 consent ゲート（既知 GAP・real-read flag 点火前に解消必須）
- [ ] location_notes published を Phase G まで未運用

## 9. Rollback 基準
build 失敗 / 既存導線が 200 でない / flag OFF なのに新挙動露出 / 既存 API 回帰 / 5xx スパイク / RLS 露出 / migration list 乖離 → **コード rollback 優先（flag OFF なら止血）→ 影響継続時のみ DB down（孤児行不在確認後）**。

## 10. 承認・記録
- [ ] CEO 明示 GO: ①main 統合 ②production apply ③production deploy ④flag 点火（段階）— **各々独立した承認案件**
- [ ] `docs/decision-log.md` に `[日付][Build/Ops][決定][承認: CEO]` 記録
- [ ] B-1 blocker の処遇を deploy 判断に明記

> 本書は草案・read-only。apply/deploy/push/link/flag 点火は CEO 明示 GO 後、各ステップ単位で承認を得て行う。
