# P1 — CLEAN DB BUILD RUNBOOK（設計・手順書のみ / 2026-06-25）

> **本書は owner 向け手順書（docs-only）。実行はしない。** 新 Supabase project 作成・migration apply・env 設定・Vercel 設定・deploy は **CEO GO + DB owner 同席**まで一切実行しない。
> **P1-RUNBOOK-REVIEW-CLOSE（2026-06-25）で最終化**: CEO 採用済み。migration 数 **201 再確認済み**（新規増なし・最新 `20260624120000_stargazer_star_maps_clean_prod`）。
> 方針確定（既決）: D-1=**③ 新クリーンプロジェクト**／migration=**local main 201（staging と 1:1 一致・P0 実証）**／rows 移植なし／fashion/commerce/rendezvous は本線非混入（page=D-7・API=D-9/9b・cron=D-8/8b で `MAINLINE_SCOPE_ONLY` 封じ込め済）。
> 親: `…-master-runbook-20260625.md`（全体）/ `…-p0-preflight-findings`（migration 201 reconcile）。
> **正本コードの最新 tip（SHA は本書更新で進むため固定値を信用せず下記で確認）**:
>   - branch `main`・worktree `/Users/haradataishi/Culcept-main-reflect-20260604`。
>   - **常に最新 = backup branch `backup/local-main-after-freeze-roundup-20260624` と同期**。
>   - tip 実値の確認コマンド: `git -C /Users/haradataishi/Culcept-main-reflect-20260604 log --oneline -1`。
>   - REVIEW-CLOSE 直前 tip = `90b037636`（本 close commit で +1）。**owner は apply 直前に上記コマンドで実 tip を確認**。

---

## 0. 前提・登場人物
- **実行者**: CEO（決裁）+ DB owner（Supabase project owner・DB password 保持・`supabase db push` 実行）。**Claude は手順設計のみ**（DB password/secret 非扱い・production 非接続）。
- **正本コード**: local main（branch `main`・worktree `/Users/haradataishi/Culcept-main-reflect-20260604`・最新 tip は冒頭の確認コマンド参照）。**origin/main は `5a0c0f7ec` で凍結**（push=本番デプロイゆえ P4 まで触らない）。
- **正本 schema**: `supabase/migrations/` の **201 本**（最新 `20260624120000_stargazer_star_maps_clean_prod`）。staging 適用済みと double-side gap ゼロ（P0 実証）。

---

## 1. 新 Supabase project 作成手順（owner・dashboard）
1. Supabase dashboard → 対象 org で **New project**。
2. 下記「§2 確認項目」を入力（name/region/plan/DB password/org）。
3. project 作成後、**project ref**（`xxxxxxxxxxxxxxxxxxxx`）と **DB password** を owner が安全に保管（password manager・Claude には渡さない）。
4. **既存 staging(`hjcrvndumgiovyfdacwc`) / legacy production(`aljavfujeqcwnqryjmhl`) とは別の新規 project**であることを ref で二重確認（取り違え厳禁）。

## 2. project 名 / region / plan / password / org 確認項目
| 項目 | 推奨 / 確認 |
|---|---|
| **org** | 既存 org（請求先確認）。rendezvous 用とは将来分離だが本 project は本線。 |
| **name** | 例 `aneurasync-production`（staging/legacy と判別可能な名前）。 |
| **region** | 主要ユーザー地域（日本中心なら `Northeast Asia (Tokyo) ap-northeast-1`）。staging と同 region 推奨（latency 整合）。 |
| **plan** | 本番運用に足る plan（Pro 以上推奨・cron/PITR/backup 要件で判断）。 |
| **DB password** | 強固・owner が password manager 保管。**Claude 非扱い**。`db push`/psql で使用。 |
| **PITR / backup** | 有効化（rollback 方針 §10 の DB 復元前提）。 |

## 2b. ★ REF 取り違え防止表（apply 前に必ず照合）
| 役割 | project ref | 本 P1 で |
|---|---|---|
| **legacy production**（fashion 397table・archive 保存） | `aljavfujeqcwnqryjmhl` | ❌ **絶対に link/apply しない** |
| **staging**（migration 検証元・温存） | `hjcrvndumgiovyfdacwc` | ❌ apply しない（read-only 照合のみ済） |
| **new production candidate**（本 P1 で新規作成） | `<NEW_REF>`（作成後に確定） | ✅ **ここにだけ** link/apply |
> `<NEW_REF>` が上記 legacy/staging のどちらかと一致したら **即 STOP**。

## 3. local main 201 migrations fresh apply 手順（owner）
> **新 project（`<NEW_REF>`）にのみ** apply。staging/legacy には触れない。CLI link ref を毎回二重確認。

owner 端末で local main worktree（`/Users/haradataishi/Culcept-main-reflect-20260604`・branch `main`）へ移動し、以下を順に実行（**コピペ可・`<NEW_REF>` を実値に置換**）:

```bash
cd /Users/haradataishi/Culcept-main-reflect-20260604

# 0) 正本 tip 確認（冒頭の値と一致を確認）
git log --oneline -1

# 1) 新 project に link（DB password を対話入力）
supabase link --project-ref <NEW_REF>

# 2) link 先 ref 二重確認（<NEW_REF> であること・aljav…/hjcrv… でないこと）
cat supabase/.temp/project-ref
#   → <NEW_REF> でなければ STOP（supabase unlink して中止）

# 3) pending 確認（fresh project は 適用済み0 / pending 201 のはず）
supabase migration list --linked
#   → pending が 201 でなければ STOP（ref 取り違え or 既適用疑い）

# 4) fresh apply（201 本を順次適用・冪等）
supabase db push
#   → エラーが出たら STOP（§4 で部分適用状態を確認・owner 判断）

# 5) apply 後 read-only 確認（§4 の全項目・dashboard SQL editor で実施）

# 6) link 残置しない
supabase unlink
cat supabase/.temp/project-ref   # → 空/なし を確認
```

### ★ STOP 条件（1つでも該当したら中断・apply しない / unlink して退避）
1. **`cat supabase/.temp/project-ref` が `<NEW_REF>` でない**（legacy `aljavfujeqcwnqryjmhl` / staging `hjcrvndumgiovyfdacwc` に link した）。
2. **`migration list --linked` の pending が 201 でない**（fresh のはずが既適用 or 数不一致）。
3. **`supabase db push` が失敗**（部分適用の可能性→§4 で実態確認・owner 判断・安易に再 push しない）。
4. **§4 の確認に失敗**: RLS が主要 table で off / policies 0 / 主要 table（profiles・stargazer_*・plan_*・travel・lifeops・coalter_*・genome_*）不在 / **`stargazer_star_maps` 不在 or user_id UNIQUE 欠落** / storage bucket（`talk_media`・`identity-verification`）不在。
5. **service_role / DB password / env 値が画面・ログ・docs に露出しそう**（即停止・出力しない・owner のみが扱う）。

## 4. apply 前後の確認項目
| 確認 | 方法（dashboard SQL editor or `migration list`） | 期待 |
|---|---|---|
| migration count | `supabase migration list --linked` | **201 適用済み**（pending 0） |
| table count | `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'` | staging と同水準（数十〜・migration 由来） |
| RLS enabled | `SELECT relname FROM pg_class WHERE relrowsecurity` に主要 table | 主要 table で RLS on |
| policies | `SELECT count(*) FROM pg_policies WHERE schemaname='public'` | 0 でない（owner-only 等が存在） |
| **`stargazer_star_maps`** | `SELECT to_regclass('public.stargazer_star_maps')` + 列 `id/user_id(UNIQUE)/core_star/live_sky/axis_beliefs/core_traits/observation_depth/created_at/updated_at` | 実在・user_id UNIQUE・owner-only RLS（login/baseline gate の要） |
| profiles / stargazer_profiles / stargazer_axis_snapshots / stargazer_observations / stargazer_core_star | `to_regclass` | 全実在（Stargazer 正本） |
| plan 系（plan_seeds_structured_only / plan_seed_duration_evidences / plan_drift_events / alter_morning_plan_history 等） | `to_regclass` | 実在（/plan 本線） |
| travel 系（travel_movement_memories / location_notes / itinerary link） | `to_regclass` | 実在（Travel/Location Notes） |
| lifeops 系（lifeops_structured ほか） | `to_regclass` | 実在 |
| coalter 系（coalter_plan_shelf / coalter_presence_states / coalter_memory_items / coalter_handoff_events 等） | `to_regclass` | 実在（CoAlter） |
| genome 系（genome_connections / talk_threads / talk_messages / genome_card_talk） | `to_regclass` | 実在（Genome Card/Talk） |
| storage buckets（migration 作成） | `SELECT id FROM storage.buckets` | **`talk_media`・`identity-verification`** 実在（migration `20260324210000`/`20260328100000` 由来） |
| FK CASCADE（account 削除の孤児防止） | `pg_constraint` confdeltype='c' for stargazer_* | star_maps 等 user_id FK が ON DELETE CASCADE |

## 5. Auth 設定（Supabase dashboard・migration では入らない）
> config.toml は **local 用**（site_url=127.0.0.1）。本番 project は dashboard で設定。
1. **email/password**: Email provider 有効・`enable_signup` on（新規登録可）。確認メール要否は CEO 判断。
2. **Site URL**: 本番ドメイン（暫定 `https://culcept.vercel.app`、custom domain なら P5 で更新）。
3. **Redirect URLs (allowlist)**: `https://<本番ドメイン>/auth/callback`・`/auth/reset-password`・必要な next パス。proxy の PUBLIC_PATHS（`/auth/callback`・`/auth/reset-password`）と整合。
4. **Google OAuth（Calendar 連携用・login でない）**: Google Cloud Console の OAuth client に **本番 redirect URI `GOOGLE_CALENDAR_REDIRECT_URI`（本番ドメイン）** を登録。client id/secret は env（§7）。
5. **Microsoft OAuth（Calendar 連携用）**: 同様に `MICROSOFT_CALENDAR_REDIRECT_URI` を Azure app 登録に追加。
6. social login（Google/MS を**認証**に使う）は本線では**不使用**（login=email/password）。OAuth は calendar token 取得専用。

## 6. Storage bucket 設定
| bucket | 由来 | 新 production |
|---|---|---|
| `talk_media` | migration `20260324210000` | ✅ 自動作成（Talk 添付） |
| `identity-verification` | migration `20260328100000` | ✅ 自動作成 |
| `user-avatar`（`SUPABASE_USER_AVATAR_BUCKET`） | env 参照・dashboard 作成 | ✅ 作成（avatar・本線） |
| `body`（`SUPABASE_BODY_BUCKET`） | env 参照（外見分析=凍結） | 🔺 凍結ゆえ任意（作らなくても nav 非露出。作るなら privacy 確認） |
| **`drop-images`（`SUPABASE_DROP_IMAGES_BUCKET`）** | fashion/drops | ❌ **持ち込まない**（archive） |
| **`shop`（`SUPABASE_SHOP_BUCKET`）** | fashion/commerce | ❌ **持ち込まない**（archive） |
| `rendezvous-photos` | rendezvous | ❌ 本線非対象（別 project 分離側） |
- bucket の RLS/public 設定は staging と同方針で owner が設定（migration 作成 bucket は migration の policy 準拠）。

## 7. Vercel env checklist（production・secret は owner 投入・Claude 非扱い）
| キー | 値の出所 | 必須 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`・`SUPABASE_URL` | **新 project URL** | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`・`SUPABASE_ANON_KEY` | 新 project anon key | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | 新 project service_role（**owner 投入・表示しない**） | ✅ |
| `OPENAI_API_KEY`・`ANTHROPIC_API_KEY`・`GEMINI_API_KEY`(+`*_MODEL*`)・`EXA_API_KEY` | 本番 LLM | ✅（Gemini「Budget 0」設定要修正） |
| `GOOGLE_MAPS_API_KEY` | Maps | ✅（Travel 地図） |
| `GOOGLE_CALENDAR_CLIENT_ID/SECRET/REDIRECT_URI`・`MICROSOFT_CALENDAR_*` | OAuth（本番 redirect） | ✅ |
| `OAUTH_STATE_SECRET`・`OAUTH_TOKEN_ENCRYPTION_KEY`・`CRON_SECRET`・`AI_INTERNAL_API_KEY`・`INTERNAL_API_KEY` | 本番値（新規発行推奨） | ✅ |
| `NEXT_PUBLIC_SENTRY_DSN`・`SLACK_WEBHOOK_URL` | 監視/通知 | 推奨 |
| **`MAINLINE_SCOPE_ONLY`** | **`true`**（fashion/rendezvous 封じ込め発火） | ✅ **本番 ON** |
| `STRIPE_WEBHOOK_SECRET`・drop/shop bucket 名 | fashion/commerce | ❌ 不要（archive） |
- preview/production env 分離: production=新 project。preview は staging or 新 project（CEO 判断）・preview は `MAINLINE_SCOPE_ONLY` OFF も可（検証用）。

### 7b. production flag checklist（体験 flag は P3 canary 段階で点火）
- **P1/P2 時点で確定**: `MAINLINE_SCOPE_ONLY=true`（封じ込め）。体験 flag は**全 OFF で deploy 開始**。
- **P3 で段階点火**（別フェーズ）: 段階1 `PLAN_ROUTE_LIVE`→ 段階2 `PLAN_HOME_SWIPE_ENABLED`+`PLAN_ALTER_TAB_ENABLED`+`NEXT_PUBLIC_PLAN_COALTER_TAB_ENABLED`+travel/calendar → 段階3 lifeops/reality write・coalter live。canary=`PLAN_CANARY_USER_IDS`(CEO→少数→全体)。
- **キルスイッチ**: `REALITY_CAPTURE_KILL` は false 維持（true で体験断）。

## 8. legacy archive 方針
- **old production(`aljavfujeqcwnqryjmhl`・fashion 397table) は削除しない**。backup 取得の上 **archive 保存**（将来再利用余地・fashion 含む）。
- **rows 移植ゼロ**（全 test data・破棄可）。新 project は空起動。
- fashion/commerce/drops/shops/old-dating/rendezvous は**本線新 production に入れない**（schema は migration に無い or 未作成 bucket・route/API/cron は `MAINLINE_SCOPE_ONLY` 封じ込め）。
- staging(`hjcrvndumgiovyfdacwc`) は **staging として温存**（昇格しない＝③方針）。

## 9. cutover 前 smoke（CEO/owner・**deploy 前に新 project へ向けて検証**）
> 順序: local/staging で機能確認 → 新 project に env 向けた preview/local で authed smoke。
1. **schema smoke（新 project・read-only SQL）**: §4 全項目 green（star_maps/profiles/plan/travel/lifeops/coalter/genome/buckets/RLS/policies）。
2. **authed smoke（新 project 接続の preview or local・CEO ログイン）**:
   - login（email/password）→ baseline → 初回観測（`stargazer_star_maps` row 生成）→ home 到達。
   - home（Alter）→ 横スワイプ Plan pane → **Battery / CoAlter / Calendar / List / Map** 5タブ → 取り込み/シフト表。
   - Travel（day detail/map）・LifeOps card・Origin・Stargazer 深層観測。
   - 各 surface で 42P01/42703/500/console error ゼロ。
3. **封じ込め smoke（`MAINLINE_SCOPE_ONLY=true`）**: fashion/rendezvous page/API/cron が 404、mainline が 200/正常（D-7/D-9 の dev 検証を新 project でも確認）。
4. **Claude はログイン不可**ゆえ authed smoke は CEO 実機。schema smoke は read-only SQL で owner 実施可。

## 10. rollback 方針（各段階で可逆）
| 段階 | rollback |
|---|---|
| **origin/main push 前**（P1-P3） | コード未デプロイ＝影響ゼロ。新 project 破棄で原状（legacy/staging 不変）。 |
| **Vercel deploy 後**（P4） | **Vercel の即時 rollback**（前デプロイへ）。origin/main は backup branch から復元可（force push は最終手段）。 |
| **env 切替後** | Vercel env を旧値へ戻す（production env 履歴）。 |
| **DB project 切替後** | 新 project の PITR/backup から復元、or 旧 legacy/staging に env を戻す（cutover 前なら無影響）。 |
| **domain 切替後**（P5） | DNS を戻す（custom domain 時）。 |
- **不可逆の単独ゲート**: origin/main push（P4・本番発火）・DNS（P5）・legacy 削除（しない方針）。

## 11. 実行ゲート（順次・各 CEO 承認）
1. ☐ **P1 設計完了**（本書）。
2. ☐ **CEO review**（本書承認）。
3. ☐ **DB owner 同席**日程確定。
4. ☐ **apply GO**: 新 project 作成 + 201 fresh apply（§3）+ §4 検証 green。
5. ☐ **env GO**: Vercel production env 設定（§7）+ Auth/Storage/OAuth 設定（§5/§6）。
6. ☐ **cutover smoke GO**: §9 authed smoke green（CEO 実機）。
7. ☐ **origin/main / deploy GO**: origin/main を local main へ push（P4・**単独不可逆ゲート**）→ Vercel 本番デプロイ。
8. ☐ **flag 点火 GO**: P3 canary 段階点火（段階毎再 smoke）。

## 11b. ★ P1 実行は CEO + DB owner 同席が必須（再明記）
- **新 project 作成・`supabase db push`・env 設定は DB owner が実行**（DB password / service_role を扱うため）。**Claude は実行不可**（規約: DB password/secret 非扱い・production 非接続）。
- **CEO は決裁・各ゲート承認・authed smoke（実機）担当**。
- 単独作業禁止: apply は **CEO + owner 同席**（ref 取り違え・STOP 条件の二人確認）。

## 12-15. 記録 / 停止
- 本書は **docs-only / REVIEW-CLOSE 最終版**。新 project 作成・apply・env・deploy・production 接続・DB write 一切**未実施**。
- migration 数 **201 再確認済み**（新規増なし）。古い commit 参照（`4cbb84abe`/`b6d9254d0`）は除去し、最新 tip は確認コマンド + backup branch 同期に統一。
- 次アクション = ゲート2（CEO review 済 → ゲート3 owner 同席日程確定）。承認後にゲート4（owner 同席で実 apply）へ。

---
docs-only。production 非接続・DB write/apply/seed・origin/main push・Vercel env 変更・domain 一切なし。`.env.local`/secret 非扱い。
