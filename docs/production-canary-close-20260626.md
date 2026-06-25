# P6 — PRODUCTION CANARY CLOSE（2026-06-26）

> 本番 canary 状態の確定記録（source of truth）。env変更/redeploy/SQL/push は本書時点で未実施。
> production URL（canonical）: https://culcept.vercel.app
> Supabase production project: plodugvgmdkusifdrdfz（clean prod）

## 1. 状態サマリ（green / yellow / off）

### GREEN（本番稼働確認済み）
| 項目 | 根拠 |
|---|---|
| /api/health 200 / supabase:ok | CEO curl |
| baseline 保存 | CEO 実機 |
| stargazer 保存 | CEO 実機 |
| /plan route | CEO 実機（PLAN_ROUTE_LIVE=true） |
| /plan UI shell | CEO 実機 |
| Home→Plan swipe | CEO 実機（PLAN_HOME_SWIPE_ENABLED=true） |
| 予定追加（入口/write） | CEO 実機（external_anchors INSERT 通る） |
| broad authenticated/service_role grant | SQL Editor 適用・verify true |
| RLS disabled public table count = 0 | live SQL |
| auth_app_admins=false / 他 grant true | live verify SQL |
| Alter V2 経路 | ALTER_MORNING_V2_ROUTE_ENABLED=true |
| Alter note（LLM） | PLAN_ALTER_NOTE_LIVE=true（OpenAI fallback で生成） |

### YELLOW（既知・ブロッカーでない）
| 項目 | 内容 | 後手当て |
|---|---|---|
| Gemini primary 失敗 | Budget 0 is invalid. This model only works in thinking mode. | OpenAI fallback で動作中。後で AI_DEFAULT_PROVIDER=openai に寄せる or Gemini thinking budget/model 修正（今は変更しない） |

### OFF 維持（点火しない）
PLAN_SHIFT_IMPORT_SAVE / PLAN_SHIFT_DRAFT_LIVE_ENABLED / PLAN_SHIFT_VLM_INPUT_MODE /
PLAN_PERSONAL_MODEL_INTEGRATION / PLAN_TRAVEL_PERSONALIZATION_REAL_READ /
PLAN_COALTER_PERSONALIZATION_REAL_READ / NEXT_PUBLIC_PLAN_TRAVEL_SUPABASE_REPO_ENABLED /
CoAlter live·engine·relation·thread（NEXT_PUBLIC_PLAN_COALTER_CHAT_LIVE / READ_MESSAGES / SEND_MESSAGES / ENGINE_LIVE / RELATION_LIVE / THREAD_CONTEXT / DEV_*）/
全 REALITY_* / 全 LIFEOPS_* / 全 STARGAZER_FLAGS / dev·local·canary·smoke 系。

## 2. Smoke matrix（canonical culcept.vercel.app・re-verify 用）
| # | 対象 | 期待 | 再検証コマンド/操作 | 現状 |
|---|---|---|---|---|
| 1 | /api/health | 200 / supabase:ok | curl -s https://culcept.vercel.app/api/health | green |
| 2 | /plan（authed） | 描画（shell/予定追加） | login→/plan | green |
| 3 | Home→Plan swipe | Plan pane 到達 | Home で横スワイプ | green |
| 4 | 予定追加 | 保存される | /plan「予定追加」→保存 | green |
| 5 | /api/stargazer/alter | 200・応答（V2） | Alter 導線操作 | green（V2） |
| 6 | /wardrobe 封じ込め | 404 | curl -s -o /dev/null -w "%{http_code}" https://culcept.vercel.app/wardrobe | 要再確認（earlier 404） |
| 7 | /rendezvous 封じ込め | 404 | curl -s -o /dev/null -w "%{http_code}" https://culcept.vercel.app/rendezvous | 要再確認（earlier 404） |

> 封じ込め（6/7）は MAINLINE_SCOPE_ONLY=true ＋最新 proxy.ts で earlier に 404 実証済。close 時に再 curl 推奨。

## 3. Production flags（値なし・authoritative list は CEO 実行）
権威ある一覧: npx vercel env ls production（名前のみ）。
設定確認済み（ON）:
- PLAN_ROUTE_LIVE / PLAN_HOME_SWIPE_ENABLED
- PLAN_COMPOSE_TIMELINE_ENABLED / NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED / PLAN_ALTER_TAB_ENABLED / NEXT_PUBLIC_PLAN_COALTER_TAB_ENABLED
- ALTER_MORNING_V2_ROUTE_ENABLED / PLAN_ALTER_NOTE_LIVE
- MAINLINE_SCOPE_ONLY=true（封じ込め）
infra（値非表示・存在のみ）: Supabase 5 key / AI keys（ANTHROPIC/OPENAI/GEMINI + model defaults・AI_DEFAULT_PROVIDER）/ App URL / OAuth / Maps 等。
> 正確な現状一覧は vercel env ls production の出力で確定（本書は会話ベースの記録）。

## 4. DB hotfix（source of truth）
- migration: supabase/migrations/20260626120000_restore_schema_grants_clean_prod.sql（Option② broad grant）。
- commit: f1f782009（local main）。SQL Editor で staging→prod 適用済。
- 内容: anon 最小 / authenticated broad DML（RLS 保護）/ service_role 広く / app_admins REVOKE / is_admin DEFINER / default privileges。

## 5. Deployment 記録
- 方式: CLI vercel deploy（手動）。現 production は local FS（main 982e65251 系統 = 最新統合）から deploy。
- code lineage: HEAD f1f782009 は 982e65251 に対し SQL+docs のみ追加（コード差分ゼロ）→ 稼働コードは 982e65251 相当。
- 982e65251 = build OOM 対策（package.json max-old-space 7168 / next.config webpackMemoryOptimizations + 新prod 画像ホスト）。

## 6. Git 状態（本書 commit 時点）
- 復元点 HEAD: f1f782009（grant migration 含む canary code/migration 点）
- origin/main: c289039cd（凍結・未更新）
- backup branch: backup/production-canary-f1f782009-20260626（本 close doc を含めて退避）

## 7. push 前チェックリスト（origin/main push = CEO GO 待ち）
- HEAD に grant migration + canary docs を含む
- 差分は build 設定 2 ファイル + migration + docs のみ（機能コード変更なし）
- 稼働中 production と同一 code lineage（982e65251）＝push しても挙動退化なし
- Vercel git-integration 確認: main push で自動 production deploy が走るか（CLI 専用なら GitHub 更新のみ／auto-deploy 連携なら push=本番再 build。build OOM 修正は HEAD に含む）
- push 直前に git fetch で origin/main が他者更新で進んでいないか確認
- secret/env を repo に含めない（含まない＝SQL は grant のみ・値なし）
- CEO の origin/main push GO

## 8. 推奨 P7
- P7-PRODUCTION-UX-GAP-AUDIT: production 上でユーザー体験に届いていない gap を画面/導線/ロジック/LLM/DB/flags で分類。
- 残 yellow: Gemini budget/model 修正 or AI_DEFAULT_PROVIDER=openai（別 canary・CEO GO）。
- CoAlter タブ Apple redesign（claude/coalter-ui-overlay-redesign 未マージ）main 統合（別タスク）。
- origin/main push 判断（git-integration 確認後）。
- 新 flag 点火・REALITY/LIFEOPS/STARGAZER は OFF 維持。

---
本書時点: env変更/redeploy/SQL実行/db push/seed/新flag/CoAlter live/REALITY·LIFEOPS·STARGAZER 点火/origin push — 一切なし。
