# Production 化 P0 — Route Scope 封じ込め監査（D-7 / 2026-06-25）

> read-only / docs-only。production 非接続・DB 非接触。実 HTTP 到達性は **local dev server（main-reflect・全 flag ON・staging 接続）**で実証。
> 親: `docs/production-ization-master-runbook-20260625.md` / `…-p0-preflight-findings-20260625.md`。worktree=local main `b6d152d27`。

## 0. 結論ヘッドライン
- **gating モデル判明**: 認証は **`proxy.ts`（Next.js 16 で `middleware.ts` がリネームされた global middleware）**に一元化。`PUBLIC_PATHS`/`PUBLIC_PREFIXES` 以外は **全 route が login 必須**（未認証→307 `/login?next=`）。`find middleware.*` で出なかったのは Next16 の rename が理由。
- **scope/feature gate は無い**: 認証さえ通れば mainline も fashion も rendezvous も **直 URL で到達可能**（admin/ceo のみ layout で role-gate 追加）。
- **✅ 封じ込めの理想点 = `proxy.ts`**: ここに flag-gated な「archived prefix → 404」を 1 箇所足せば、**~25 の fashion route + rendezvous を本番で一括封じ込め**できる（route 個別編集 ~25 ファイルが不要）。
- これは **deploy(P4) 前の必須ゲート D-7**。実装は CEO GO 後（小〜中規模）。

## 1. 実証した gating モデル（proxy.ts）
- `proxy.ts`: 全 request で `supabase.auth.getUser()` → token refresh + security headers + `/api/` rate-limit。
- **PUBLIC（認証不要）**: 完全一致 `/` `/login` `/auth/reset-password` `/auth/callback` `/offline` `/opengraph-image` `/type` ／ prefix `/legal/` `/api/`(各 route で判断) `/public/` `/type/` `/stargazer`(後ログイン型) ／ 静的ファイル拡張子。
- **それ以外**: `user` 無し → `307 /login?next=<path>`。
- **実 HTTP 実証**（dev server）: `/wardrobe /auction /ranking /tribes /try-on /products /shops /drops /rendezvous /explore /for-you /feed` すべて **307 → /login**（= 認証ゲート稼働）。`/plan` も同様（既に確認済）。
- → **grep 推論「fashion は auth 無で完全開放」は誤りだった**（page.tsx に getUser が無くても proxy.ts が全 route を auth gate）。実証が推論に勝った例。

## 2. Route 分類（本番 scope）
### 残す（mainline・本番 core）
`/`(Home) `plan` `calendar` `origin` `genome-card` `stargazer`(観測) `talk` `messages` `my-page` `settings` `sns` ＋ infra(`login/logout/welcome/start/auth/offline`) ＋ `type`(公開アーキタイプ) ＋ `body-color`(genome physical)。

### 封じ込め対象（fashion/commerce/dating archive・CEO「復活させない」）
`wardrobe` `auction` `ranking` `products` `shops`(+me/* 配下多数) `drops`(+[id]/new/edit) `checkout` `orders` `my-drops` `try-on` `turntable` `3d-viewer` `avatar-fitting` `coordinate` `feed` `for-you` `items` `match` `stylist` `visual-search` `style-drive` `style-quiz` `style-profile` `explore` `eye-analysis` `search` `tribes`。
- 現状: 認証は通る（proxy）が **feature gate 無し→authed user は直 URL で到達**。本番では archive＝到達不可にすべき。

### 別 project 分離（rendezvous・CEO 方針）
- **route**: `app/(immersive)/rendezvous/*`（settings/connection/romance/[candidateId]/topic/mission/explore/partner/invite・10+ page）。※culcept でなく **immersive route group**。
- **api**: `app/api/rendezvous/*`・`app/api/admin/rendezvous/*`・`app/api/internal/rendezvous/*`。
- **cron**: `vercel.json` の `rendezvous-notification-dispatch` ＋ `app/api/cron/rendezvous-anima-generation`・`-candidate-generation`（計3）。
- **admin**: `app/(culcept)/admin/rendezvous`（admin layout で /ceo redirect 保護済）。
- → 分離は「route + api + cron」三面・別 project 移植（CEO の大規模タスク）。本番では**当面 access 不可に封じ込め**。

### 内部（保護済・本番 OK）
`admin/*`（layout で `redirect("/ceo")`）・`ceo/*`（layout `requireCeo` role gate）。

## 3. D-7 推奨: proxy.ts への flag-gated scope gate（最小・単一ファイル）
- **設計**: `proxy.ts` に `ARCHIVED_PREFIXES`（fashion 群 + rendezvous）を追加し、env `MAINLINE_SCOPE_ONLY === "true"`（本番のみ ON・dev は OFF で smoke 継続）の時、該当 prefix を **404（`NextResponse.rewrite(/404)` or notFound 相当）**。
- **長所**: ①1 ファイルで ~25 route + rendezvous を一括封じ込め ②flag で dev/本番出し分け（smoke 不変）③可逆（flag OFF で即戻る）④認証 gate の直後に置けて自然。
- **補完が要る面**:
  - **API**: `/api/` は proxy で public 扱い（各 route 内で認証）。fashion/rendezvous の `/api/*` も封じ込めるなら、proxy の archived 判定を `/api/` にも効かせる or 各 route gate。
  - **cron**: `vercel.json` から rendezvous cron 3本を除外（D-8）。proxy では cron 内部呼び出しを止められない。
  - **nav**: MAIN_NAV は既に mainline のみ（fashion 非掲載）＝リンク経由の露出は無い。proxy gate で直 URL も塞ぐ。
- **代替案**: ①各 route に notFound 追加（~25 ファイル・分散・漏れリスク）②route ディレクトリ削除（最もクリーンだが共有 component 依存の解きほぐしが必要・大規模・不可逆寄り）。→ **proxy 集中が最小リスク・推奨**。

## 4. 実装スコープ（CEO GO 後・本書では実装しない）
1. `proxy.ts`: ARCHIVED_PREFIXES + `MAINLINE_SCOPE_ONLY` gate（fashion + rendezvous route）。（~1 ファイル）
2. `vercel.json`: rendezvous cron 3本除外（D-8）。
3. `/api/` の fashion/rendezvous 封じ込め方針確定（proxy 拡張 or 個別）。
4. dev/preview は `MAINLINE_SCOPE_ONLY` OFF（smoke 継続）、production env で ON。
5. 検証: 本番想定 flag ON で fashion/rendezvous が 404、mainline が 200 を実 HTTP で確認。

## 5. 未決（CEO 判断）
- **D-7**: 封じ込め方式 = proxy 集中 gate（推奨）/ 個別 notFound / route 削除。
- **D-8**: rendezvous cron 3本の本番除外（vercel.json 編集）。+ stargazer-growth/student-monitor×3/ai-auto-eval は本線として残すか。
- **D-9（新）**: fashion/rendezvous の `/api/*` を本番で塞ぐか（route gate or proxy 拡張）。
- rendezvous の別 project 移植本体は CEO の独立タスク（本番封じ込めとは別軸）。

## 6. 実行しないことの確認
コード変更・proxy/vercel.json 編集・production 接続・deploy・DB 操作 一切**未実施**。実 HTTP は local dev のみ（read-only GET）。本書は監査・設計のみ。

---

## 7. D-7 実装（CEO GO「proxy 集中 gate・今実装」2026-06-25）
- **実装**: `proxy.ts` に `MAINLINE_SCOPE_ONLY`（env・既定 OFF）+ `ARCHIVED_PREFIXES`（fashion 26 + `/rendezvous`）+ `isArchivedRoute()` を追加。auth 判定より前に `MAINLINE_SCOPE_ONLY && isArchivedRoute()` なら未マッチ path へ `NextResponse.rewrite` → App Router の `not-found.tsx`（**404**）。flag OFF では block 不実行＝従来不変。
- **静的安全**: mainline 13 prefix × archive 28 prefix の総当り衝突チェック = **衝突ゼロ**（誤 404 なし）。MAIN_NAV/HOME_MORE_NAV に archive 対象なし・本線から archive route への直リンクなし。
- **dev 実 HTTP 検証（local・staging 接続）**:
  - **flag ON**: `/wardrobe /auction /drops /shops /products /try-on /match /feed /for-you /explore /search /tribes /rendezvous` = **全て 404** ／ mainline `/plan /calendar /origin /genome-card /talk /my-page /settings` = 307→login・`/stargazer /type` = 200（**404 化されず到達**）。
  - **flag OFF（dev 既定・smoke 状態）**: `/wardrobe /drops /rendezvous` = 307→login に復帰（封じ込め無効）・mainline 不変。
- **tsc = 55（proxy.ts エラー0）**・test 退化なし。
- **未実施/残**: ① `/api/` の fashion/rendezvous 封じ込め（D-9・proxy では `/api/` は public 先 return ゆえ対象外）② `vercel.json` の rendezvous cron 3本除外（D-8）③ 本番 env で `MAINLINE_SCOPE_ONLY=true` 投入（P2・CEO）。
- **一時検証フラグは撤去済**（`.env.local`=symlink `/Users/haradataishi/Culcept/.env.local` から `MAINLINE_SCOPE_ONLY` 行削除・dev=OFF 復帰）。production 非接続・origin push なし。

---
read-only 監査 + proxy.ts への flag-gated gate 実装（dev 検証のみ）。production 非接続・deploy/DB 操作ゼロ・origin/main push なし。`.env.local`/launch.json/node_modules/.next は commit 対象外。
