# Production 化 P0 Preflight — 棚卸し結果（2026-06-25）

> read-only / docs-only。production 非接続（staging へ read-only link→migration list→即 unlink・DB write/apply ゼロ）。
> 親設計: `docs/production-ization-master-runbook-20260625.md`。worktree=local main `f8490a131`。

## 0. 結論ヘッドライン
- ✅ **migration lineage は完全クリーン**: local main **201** == staging 適用 **201**、双方向 gap ゼロ（1:1）。過去メモの「274」「203」は**誤り**（前者は別カウント／後者は awk 誤集計）。→ clean production は**この検証済み 201 set をそのまま新 DB に fresh apply すればよい**（D-1 の③が綺麗に成立・②も可）。
- ✅ Supabase link = **none**（production `aljavfujeqcwnqryjmhl` に未接続・staging `hjcrvndumgiovyfdacwc` も list 後 unlink 済）。
- ⚠️ **最大の未決＝route scope 封じ込め**: fashion/commerce/dating の旧 route surface が多数現存。本番で notFound/inert にする精査が deploy 前に必要（本 P0 では存在確認まで・gating 精査は専用パス）。

## 1. Migration reconcile（P0 目玉・201==201）
- 手順: staging `hjcrvndumgiovyfdacwc` へ read-only link（ref 二重確認）→ `supabase migration list --linked` → 14桁版番号で Local 列/Remote 列を抽出し comm 差分 → unlink。
- 結果:
  - local migration files = **201**
  - staging 適用済み(Remote) = **201**
  - **staging のみ適用（repo 欠落）= 空**
  - **repo のみ（staging 未適用）= 空**
  - 最新 = `20260624120000_stargazer_star_maps_clean_prod`（両側一致）
- → **drift ゼロ・欠落ゼロ**。clean production の正本 = この 201 set。

## 2. 本番 env キー棚卸し（値は非表示・キー名のみ）
| 区分 | キー | clean prod |
|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY`・`SUPABASE_URL`/`_ANON_KEY`/`_SERVICE_ROLE_KEY` | **必須**（新 DB の値に差替） |
| LLM | `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY`/`EXA_API_KEY` + `*_MODEL*` | 必須（Gemini「Budget 0 invalid」は要修正） |
| Calendar OAuth | `GOOGLE_CALENDAR_CLIENT_ID/SECRET/REDIRECT_URI`・`MICROSOFT_CALENDAR_*` | 必須・**redirect URI を本番ドメイン+新 project に再設定** |
| 暗号/内部 | `OAUTH_STATE_SECRET`・`OAUTH_TOKEN_ENCRYPTION_KEY`・`CRON_SECRET`・`AI_INTERNAL_API_KEY`・`INTERNAL_API_KEY` | 必須（本番値を新規発行推奨） |
| Maps | `GOOGLE_MAPS_API_KEY` | 必須（Travel 地図） |
| 監視/通知 | `NEXT_PUBLIC_SENTRY_DSN`・`SLACK_WEBHOOK_URL` | 推奨 |
| 学習 | `STUDENT_PROVIDER_API_KEY` | flag 次第 |
| **fashion 遺物（除外候補）** | **`STRIPE_WEBHOOK_SECRET`**・bucket `SUPABASE_DROP_IMAGES_BUCKET`/`SUPABASE_SHOP_BUCKET` | ❌ commerce archive ゆえ不要 |

## 3. Auth / OAuth / Storage（clean DB で再現が要る非 migration 設定）
- **Auth = email/password（`signInWithPassword`）**。social login での認証はなし → 設定単純。
- Google/Microsoft OAuth は **Calendar 連携用**（login でない）。新 project + 本番ドメインで **redirect URI 再登録**が要。
- Storage bucket 実使用: `user-avatar`（AVATAR_BUCKET）・body-color avatar assets・`rendezvous-photos`（rendezvous→分離）・`identity-verification`・（`shop`/`drop-images`=fashion）。→ clean prod は **mainline bucket（avatar/body-color/identity）を作成**、fashion bucket 不要、rendezvous-photos は分離側。

## 4. ⚠️ Route scope 封じ込め（最大の未決・deploy 前ゲート）
`app/(culcept)/` 直下に **本線 + 大量の旧 surface** が混在:
- **本線（残す）**: `plan` `calendar` `origin` `genome-card` `stargazer`(観測) `talk` `messages` `my-page` `settings` `sns` `login/logout/welcome/start/auth`。
- **fashion/commerce/dating（archive・本番封じ込め対象）**: `wardrobe` `auction` `ranking` `products` `ar-shop` `shops` `drops` `checkout` `orders` `my-drops` `try-on` `turntable` `3d-viewer` `avatar-fitting` `coordinate` `feed` `for-you` `items` `match` `stylist` `visual-search` `style-drive` `style-quiz` `style-profile` `explore` `tribes` 他。
- **rendezvous（別 project 分離）**: `/rendezvous` route + cron 3本（`rendezvous-anima-generation`/`-candidate-generation`/`-notification-dispatch`）。
- **本 P0 では存在確認のみ**。各 route が「flag/notFound で既に inert か / 直 URL で開くか」の **gating 精査は inconclusive**（page.tsx の構造が route ごとに異なり一括 grep で判定不能）。→ **専用の scope-confinement 監査を deploy(P4) 前に実施**し、本番封じ込め方式（notFound gate 一括 / route 削除 / 非リンク放置）を確定する必要がある。

## 5. P0 由来で runbook に追加すべき項目
- D-1 補足: migration が 201 完全一致ゆえ、③new-project は「新 project に 201 fresh apply」で確定的に再現可能（推奨度上昇）。②promote は staging の test junk cleanup が残課題。
- 新規 D-7: **route scope 封じ込め方式**（fashion/rendezvous を本番でどう inert 化するか）。deploy 前ゲート。
- 新規 D-8: **本番 cron の取捨**（vercel.json 6本中 rendezvous-notification は分離方針で除外。stargazer-growth/student-monitor×3/ai-auto-eval は本線として残すか）。
- Gemini provider 設定（「Budget 0 invalid」）を P2 で修正。

## 6. G0 ゲート（CEO レビュー事項）
1. migration 201==201 クリーン確定の承認（→ clean DB は 201 set で構築）。
2. D-1 を③new-project で確定するか（P0 で②の cleanup 課題が明確化）。
3. D-7 route scope 封じ込め監査の実施可否（read-only・次の P0 サブステップ推奨）。
4. D-8 cron 取捨。

## 7. 実行しないことの確認
production 接続/apply/`db push`/migration/SQL/DB write/seed/origin push/secret 投入/DNS 一切**未実施**。staging は read-only `migration list` のみ（link→list→unlink・write ゼロ）。本書は docs のみ。

---
read-only / docs-only。production 非接続・staging read-only・DB write/apply/origin push ゼロ。
