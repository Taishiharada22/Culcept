# Production 化 D-9（API 封じ込め）+ D-8（cron 除外）（2026-06-25）

> proxy.ts への flag-gated 実装 + vercel.json 編集。dev HTTP 検証のみ。production 非接続・DB write/apply/origin push ゼロ。
> 親: `…-master-runbook-20260625.md` / `…-route-scope-confinement-audit-20260625.md`(D-7)。worktree=local main `b6d9254d0`。

## 0. 結論
- **D-9**: proxy.ts に `ARCHIVED_API_PREFIXES`（fashion/commerce/dating + rendezvous API + 旧 cron route）を追加し、**`MAINLINE_SCOPE_ONLY=true` 時に 404**。`/api/` は proxy 既定 public ゆえ **public 判定より前**に評価。本線が archive API を fetch しないことを grep 実証（誤 404 なし）。
- **D-8**: `vercel.json` から **`rendezvous-notification-dispatch` cron を除外**（本線 production で発火させない唯一の scheduled rendezvous cron）。他の rendezvous/fashion cron route は vercel.json 非掲載＝Vercel 自動発火なし。`expire-orders`(commerce・github workflow) は gate で 404 no-op 化。
- **dev HTTP 検証**: flag ON → archived API/cron 全 404・mainline API 到達(200/401/400) ／ flag OFF → archived API 405/401 復帰・mainline 不変。tsc55。

## 1. D-9 API 分類（432 route.ts）
### 残す mainline API（封じ込めない）
`plan`(10) `stargazer`(49) `calendar`(17) `coalter`(16) `origin`(15) `talk`(13) `aneurasync`(10) `genome-card`(7) `genome-connections`(3) `notifications`(6) `my-style`(6) `reality`(3) `weather`(4) `orbiter`(4) `push`(2) `auth`(2) `alter-morning`(2) `messages`(1) `baseline`(1) `account`(1) `health`(1) `widget`(1・PWA Inner Weather/SYNC%) `tour-states`(1) `internal`(13・server内部) `ceo`(7・ceo-gated) `admin`(6・admin-gated) `cron`(mainline 分は維持)。
- **frozen identity（D-9 scope 外＝非封じ込め・別判断）**: `body-color`(6) `sns`(8) `personal-color`(1) `eye-profile`(1)。nav 凍結済だが API は本書では塞がない。
- **outbound(2)**: 素性不明 → 保守的に非封じ込め（要 follow-up 確認）。

### 封じる API（archive: fashion/commerce/drops/shops/dating）
`recommendations`(18) `tribes`(5) `avatar-fitting`(3) `watchlist`(2) `wardrobe`(2) `visual-search`(2) `external-shop`(2) `try-on`(1) `tags`(1) `swipe`(1) `stylist`(1) `style-profile`(1) `stripe`(1・commerce) `shoe-width`(1) `search`(1) `reviews`(1) `report`(1・drops) `price-alerts`(1) `items`(1) `garment-profile`(1) `fit-color-score`(1) `discover`(1) `checkout`(1・commerce) `bulk-actions`(1) `auto-pricing`(1) `follows`(1) `uploads`(1・drop-images) `ai-search`(1・brands/price) `suggest`(1・brand/tag)。

### 封じる API（separate: rendezvous）
`rendezvous`(**134**)。

### 封じる cron route（呼出時 404・defense in depth）
`/api/cron/rendezvous-notification-dispatch`・`-candidate-generation`・`-anima-generation`（rendezvous）／`precompute-recommendations`・`expire-orders`・`ai-promotion-review`・`body-color-pipeline`（fashion/commerce）。

## 2. D-8 cron 分類（vercel.json 6本）
| cron | 分類 | 本番 |
|---|---|---|
| `stargazer-growth` | mainline | ✅ 残す |
| **`rendezvous-notification-dispatch`** | rendezvous | ❌ **除外（本書で削除）** |
| `stargazer-student-monitor` | mainline 学習 | ✅ 残す |
| `identity-student-monitor` | mainline 学習 | ✅ 残す |
| `orbiter-student-monitor` | mainline 学習 | ✅ 残す |
| `ai-auto-eval` | mainline AI eval | ✅ 残す |

- vercel.json 非掲載の rendezvous cron（candidate/anima-generation）= Vercel 自動発火なし（route のみ・gate で 404）。
- `expire-orders`（commerce）= `.github/workflows/expire-orders.yml`（5分毎）が prod URL を叩くが、**gate で 404 no-op**。**recommend: workflow も無効化**（本書では未実施・CI ファイルゆえ別途）。

## 3. 実装方式
- **proxy.ts**（D-7 と同 source-of-truth 思想）: `ARCHIVED_API_PREFIXES` + `isArchivedApi()`。handler で `MAINLINE_SCOPE_ONLY && (isArchivedRoute || isArchivedApi)` を **`isPublicRoute` より前**に評価 → 未マッチ path へ rewrite で `not-found.tsx`(404)。flag OFF で完全に従来不変。
- **vercel.json**: rendezvous-notification-dispatch エントリ削除（5本へ）。
- mainline×archive の prefix 衝突 = 静的総当りで **ゼロ**（誤 404 なし）。本線→archive API fetch = grep で **ゼロ**（本線非破壊）。

## 4. dev HTTP 検証
| | flag ON（本番想定） | flag OFF（dev 既定） |
|---|---|---|
| archived API（rendezvous/recommendations/wardrobe/checkout/stripe/swipe/discover/ai-search/suggest） | **全 404** | 405/401（reachable・auth-gated）に復帰 |
| archived cron（rendezvous-notification/expire-orders） | **404** | 401（CRON_SECRET gate）復帰 |
| mainline API（health/baseline/widget/stargazer-profile/plan-anchors/orbiter/weather-subpath/cron-stargazer-growth） | **非404**（200/401/400） | 不変 |
- `/api/weather` root の 404 は root route.ts 不在の自然 404（weather は archive list 外・subpath `/api/weather/location`=400 で reachable）。

## 5. 検証結果サマリ
- tsc = **55**（proxy.ts エラー0）・relevant test 退化なし。
- 一時検証 flag `MAINLINE_SCOPE_ONLY` は `.env.local`(symlink=`/Users/haradataishi/Culcept/.env.local`)から撤去済・dev OFF 復帰。
- production 非接続・DB 操作ゼロ・origin/main `5a0c0f7ec` 不変。

## 6. 残（CEO 判断 / follow-up）
- `expire-orders` github workflow の無効化（gate で no-op 化済だが CI ファイル整理は別途）。
- frozen identity API（body-color/sns/personal-color/eye-profile）を本番で塞ぐか（D-9 scope 外・別判断）。
- `outbound` の素性確定（保守的に非封じ込め中）。
- 本番 env で `MAINLINE_SCOPE_ONLY=true` 投入（P2・CEO/owner）。

## 7. P1（clean DB 構築）へ進めるか
✅ **進める前提が整った**: deploy 時に勝手に動く archive/rendezvous の発火口（page route=D-7・API=D-9・scheduled cron=D-8）を flag 一つ（`MAINLINE_SCOPE_ONLY`）で封じる状態を確立。clean DB 構築（P1）後に本番 env で flag ON すれば、fashion/rendezvous は 404/非発火。

---
proxy.ts/vercel.json への flag-gated 実装（dev 検証のみ）。production 非接続・deploy/DB/origin push ゼロ。`.env.local`/launch.json/node_modules/.next は commit 対象外。
