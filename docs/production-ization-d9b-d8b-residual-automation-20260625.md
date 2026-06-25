# Production 化 D-9b（unknown API cleanup）+ D-8b（residual automation）（2026-06-25）

> proxy.ts + .github workflow 編集。dev HTTP 検証のみ。production 非接続・DB/origin push ゼロ。
> 親: `…-d9-api-d8-cron-confinement-20260625.md`。worktree=local main `5a67d6950`。

## 0. 結論
- **自動実行口の全数調査**: Vercel cron(D-8 済) 以外の deploy-auto は **GitHub Actions の `expire-orders.yml`（毎5分・commerce）唯一**。pg_cron/supabase scheduled = **なし**。setInterval は全て feature-scoped client timer（D-7/D-9 で feature が 404→load されず非作動）。
- **D-8b**: `expire-orders.yml` の **schedule(毎5分) 除去**（workflow_dispatch のみ残置＝自動発火停止）。endpoint は gate で 404 no-op の二重防御。
- **D-9b**: `outbound`(drops 購入/リンク追跡) + `test`(test ログイン・auth bypass hygiene) を archive API に追加（2件）。
- dev HTTP: flag ON→outbound/test/expire-orders 404・mainline 不変 / flag OFF→405/400 復帰。tsc55。

## 1. GitHub workflows / scheduled jobs 一覧
| workflow | trigger | 分類 | 本番 |
|---|---|---|---|
| `ci.yml` | PR/push→main | mainline CI（tsc/test） | ✅ 維持 |
| **`expire-orders.yml`** | **`schedule */5`** + dispatch | **commerce（orders expire）** | ❌ **schedule 除去（D-8b）** |
| `staging-smoke.yml` | workflow_dispatch + PR | mainline smoke（手動/PR） | ✅ 維持（自動 schedule なし） |

- pg_cron / cron.schedule / supabase_functions（migrations）= **0**（DB レベル scheduled なし）。
- setInterval（lib/app）= 全て `"use client"` の feature-scoped timer（`rendezvous/observatoryCollector`・`auction/AuctionPageClient`・plan/coalter UI 等）。該当 page/API が D-7/D-9 で 404→feature 非 load→timer 非作動。**deploy-auto ではない**。

## 2. commerce/fashion/rendezvous 系の自動実行口
- **唯一の能動 deploy-auto = `expire-orders.yml`**（毎5分 `curl https://culcept.vercel.app/api/cron/expire-orders`）。commerce。→ D-8b で停止。
- Vercel cron rendezvous-notification-dispatch は D-8 で除去済。candidate/anima-generation は vercel 非掲載＝自動発火なし。

## 3. 無効化 / no-op / 維持の判断
| 対象 | 判断 |
|---|---|
| `expire-orders.yml` schedule | **除去**（自動発火停止・手動 dispatch のみ残置・commerce 復活余地確保） |
| `/api/cron/expire-orders` endpoint | gate で 404 no-op（二重防御・D-9 済） |
| `ci.yml` / `staging-smoke.yml` | 維持（mainline・自動 schedule なし or PR/push 限定） |
| setInterval 群 | 不要（feature gate で間接封じ込め済） |
| pg_cron | 該当なし |

## 4. `outbound` API の分類
- **drops/commerce 確定**: `POST /api/outbound` は `drop_outbound_events` に `drop_id`/`kind(buy\|link)`/`url` を insert＝**drop の購入/リンククリック追跡**。`/api/outbound/export` も同系。
- → 本線 production で不要・legacy commerce 由来 → **封じる**（archive 追加）。`/api/admin/outbound/*`(insights/export) は admin-gated ゆえ維持（admin 内 commerce 分析・低リスク・別途）。

## 5. 追加封じ込みが必要だった API / workflow
- **API（archive 追加）**: `/api/outbound`（drops 追跡）・`/api/test`（test ログイン・**本番 auth bypass hygiene**）。
- **workflow**: `expire-orders.yml`（schedule 除去）。
- drops 追跡他（`checkout`/`stripe`/`recommendations`）は D-9 で既に archive。

## 6. mainline 影響なし確認
- mainline×{outbound,test} prefix 衝突 = ゼロ。`/api/origin`(journal 401/complete 405)・`/api/account`(delete)・`/api/health`(200)・`/api/tour-states`(401) は flag ON でも **非 404＝reachable**（実エンドポイントで実証）。
- 誤検出注意: `/api/origin/entries`・`/api/account` root の 404 は **root route 不在の自然 404**（gate 由来でない・origin/account は archive list 外）。
- `/plan`/login/baseline/Stargazer/Alter/Origin/Calendar/Travel/LifeOps に影響なし。

## 7. dev HTTP 検証
| | flag ON | flag OFF |
|---|---|---|
| `/api/outbound`・`/api/outbound/export`・`/api/test/login` | **404** | 405 / 400（reachable 復帰） |
| mainline（health/origin-journal/origin-complete/tour-states） | 非404（200/401/405） | 不変 |

## 8. tsc / test
tsc = **55**（proxy.ts エラー0）・relevant test 退化なし・一時 flag は `.env.local`(symlink) から撤去済（dev OFF）。

## 9. docs file
本書 + 親 D-9/D-8 doc。

## 10〜11. commit / backup
（commit 後追記。backup=`backup/local-main-after-freeze-roundup-20260624`）

## 12. P1 clean DB 構築 runbook へ進めるか
✅ **進める前提が完成**: deploy 時に勝手に動く口を **page(D-7)/API(D-9/D-9b)/Vercel cron(D-8)/GitHub Actions(D-8b)** の全層で封じる/止める状態を確立。残 residual = 実質ゼロ（admin/outbound は admin-gated・outbound 本体は封じ込め済）。`MAINLINE_SCOPE_ONLY=true`（本番 env・P2）+ expire-orders schedule 除去で legacy/commerce/rendezvous は本番で 404・非発火。

---
proxy.ts/.github workflow への flag-gated 実装（dev 検証のみ）。production 非接続・deploy/DB/origin push ゼロ。
