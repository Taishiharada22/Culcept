# P2 — ENV INVENTORY AUDIT（Vercel Production・key 名と方針のみ / 2026-06-25）

> **値は一切出さない（secret/anon/service_role/DB password 非表示）。Claude は Vercel を編集しない。** key 名と設定方針のみ。
> 前提: clean prod DB ref=`plodugvgmdkusifdrdfz`・URL=`https://plodugvgmdkusifdrdfz.supabase.co`・P1 完了・P2 docs commit `3aed3554f`・origin/main `5a0c0f7ec` 凍結・deploy/push/flag ON 禁止。
> 方式: 最新 main の code から `process.env.*` を全 304 key 列挙し runtime 用途で分類（flag/script/test/shadow は production runtime から除外）。

## ✅ CEO 設定済み（11・確認のみ）
`NEXT_PUBLIC_SUPABASE_URL`・`SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY`・`SUPABASE_ANON_KEY`・`SUPABASE_SERVICE_ROLE_KEY`・`MAINLINE_SCOPE_ONLY=true`・`NEXT_PUBLIC_SITE_URL`・`GEMINI_API_KEY`・`EXA_API_KEY`・`GOOGLE_MAPS_API_KEY`・`NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY`
→ Supabase 5 つが新 project `plodugvgmdkusifdrdfz` の値であることだけ最終確認。

---

## 1. Production env 必須リスト（本番起動・login・DB・AI 中核）
| KEY | scope | client/server | value source | action | note |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production | NEXT_PUBLIC | 新 project URL | ✅ set 済 | `https://plodugvgmdkusifdrdfz.supabase.co` |
| `SUPABASE_URL` | Production | server | 新 project URL | ✅ set 済 | 同上 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production | NEXT_PUBLIC | 新 project anon | ✅ set 済 | client 露出可 |
| `SUPABASE_ANON_KEY` | Production | server | 新 project anon | ✅ set 済 | |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | **server-only** | 新 project service_role | ✅ set 済 | **絶対 NEXT_PUBLIC にしない** |
| `MAINLINE_SCOPE_ONLY` | Production | server | `true`（generated） | ✅ set 済 | fashion/rendezvous 封じ込め |
| `NEXT_PUBLIC_SITE_URL` | Production | NEXT_PUBLIC | production URL | ✅ set 済 | |
| `GEMINI_API_KEY` | Production | server | 既存 API key | ✅ set 済 | |
| `EXA_API_KEY` | Production | server | 既存 API key | ✅ set 済 | |
| `GOOGLE_MAPS_API_KEY` | Production | server | 既存 API key | ✅ set 済 | |
| `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` | Production | NEXT_PUBLIC | 既存（Maps browser 用） | ✅ set 済 | client 露出可・referrer 制限推奨 |
| `OPENAI_API_KEY` | Production | server | 既存 API key（Preview コピー可） | **Add** | AI provider（一部 task）。未設定でも gemini/anthropic で degrade |
| `ANTHROPIC_API_KEY` | Production | server | 既存 API key（コピー可） | **Add** | AI provider |
| `GEMINI_MODEL` / `GEMINI_MODEL_DEFAULT` / `OPENAI_MODEL_DEFAULT` | Production | server | 値（model 名） | **Add** | **Gemini「Budget 0 invalid」回避に thinking 対応 model 指定** |
| `OAUTH_STATE_SECRET` | Production | server | **generated secret**（新規発行推奨） | **Add** | calendar OAuth state |
| `OAUTH_TOKEN_ENCRYPTION_KEY` | Production | server | **generated secret** | **Add** | calendar token 暗号化（無いと連携不可） |
| `CRON_SECRET` | Production | server | **generated secret** | **Add** | Vercel cron 認証（stargazer/student/ai-eval cron） |
| `AI_INTERNAL_API_KEY` | Production | server | generated/既存 | **Add** | 内部 AI API 認証 |
| `INTERNAL_API_KEY` | Production | server | generated/既存 | **Add** | 内部 API 認証 |
| `NEXT_PUBLIC_APP_URL` | Production | NEXT_PUBLIC | production URL | **Add** | 一部リンク生成。SITE_URL と同値で可 |

## 2. Production env 推奨リスト（本番機能・監視）
| KEY | scope | client/server | value source | action | note |
|---|---|---|---|---|---|
| `GOOGLE_CALENDAR_CLIENT_ID` / `_CLIENT_SECRET` | Production | server | 既存（コピー可） | Add | /plan の Google Calendar 取り込み |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Production | server | **production URL に修正** | Add | 例 `https://<本番>/...callback`。Google 側にも登録 |
| `MICROSOFT_CALENDAR_CLIENT_ID` / `_CLIENT_SECRET` | Production | server | 既存（コピー可） | Add | Outlook 取り込み |
| `MICROSOFT_CALENDAR_REDIRECT_URI` | Production | server | **production URL に修正** | Add | Azure app 側にも登録 |
| `NEXT_PUBLIC_SENTRY_DSN` | Production | NEXT_PUBLIC | 既存（コピー可） | Add | client error 監視（未設定で Sentry 無効） |
| `SENTRY_DSN` | Production | server | 既存（コピー可） | Add | server error 監視 |
| `SLACK_WEBHOOK_URL` | Production | server | 既存（コピー可） | Add | ops 通知 |
| `GENOME_SHARE_SECRET` | Production | server | generated/既存 | Add | **Genome Card 共有リンク署名**（mainline genome・無いと share 不可） |

## 3. Production env 任意リスト（後でよい / 機能を使うなら）
| KEY | client/server | note |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | 両方 | Web Push 通知。push を使うなら3点セット。未設定で push 無効（本体は動く） |
| `STUDENT_PROVIDER_ENABLED` / `_ENDPOINT` / `_API_KEY` / `_MODEL` / `_TIMEOUT_MS` / `_MAX_PROMPT_CHARS` / `_ROLLOUT_PERCENT` | server | 学習 student provider。既定 OFF で可。使うなら一式 |
| `STARGAZER_ANON_ENABLED` | server | 匿名 stargazer 許可。CEO 判断 |
| `SUPABASE_USER_AVATAR_BUCKET` | server | avatar bucket 名。avatar upload を使うなら設定 + dashboard で bucket 作成 |
| 各 SHADOW/MONITOR（`IDENTITY_*`/`ORBITER_*`/`STARGAZER_SHADOW_*`） | server | 影学習・監視の tuning。既定で動く＝後で。launch には不要 |

## 4. Production env 除外リスト（clean production 本線に入れない）
| KEY | 理由 |
|---|---|
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | commerce（archive） |
| `SUPABASE_DROP_IMAGES_BUCKET` / `SUPABASE_SHOP_BUCKET` | fashion/drops/shops bucket（archive） |
| `SUPABASE_BODY_BUCKET` | 外見分析（凍結）→ 入れない（任意） |
| `NEXT_PUBLIC_TURN_URL` / `_USERNAME` / `_CREDENTIAL` | **rendezvous の WebRTC 音声**（`lib/rendezvous/webrtcSignaling.ts`）→ rendezvous 分離ゆえ本線不要 |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` / `_ENDPOINT` | **recommendations（fashion）のみ使用**→ D-9 で 404・本線不要（proxy rate-limit は in-memory） |
| `TOGETHER_API_KEY` / `RUNPOD_API_KEY` | 学習/vision script・外部（app/lib runtime 未使用） |
| `SUPABASE_SERVICE_KEY` | app/lib runtime 未使用（service_role の別名・script のみ）→ 不要 |
| `VERCEL_TOKEN` | CI/deploy token（app runtime env でない） |
| `STAGING_*`（URL/ANON/CEO/USER 各） / `TEST_USER_EMAIL` / `_PASSWORD` | staging/test 専用 |
| 全 **体験 flag**（`PLAN_*`/`REALITY_*`/`COALTER_*`/`LIFEOPS_*`/`STARGAZER_*_LIVE`/`ALTER_MORNING_*`） | **P3 canary で段階点火**・今は入れない（=OFF）。`MAINLINE_SCOPE_ONLY` のみ true |
| `CULCEPT_*` / `*_DOGFOOD_*` / `*_SMOKE_GO` / `*_CLEANUP_*` / `*_EXPORT_*` / `OUT_DIR` / `IMPORT_OWNER_ID` 等 | CLI/script/dogfood 専用（Vercel runtime でない） |
| `REALITY_CAPTURE_KILL` | キルスイッチ・未設定(=false)維持 |

## 5. Preview からコピー可の key
- **AI/外部 API key**: `OPENAI_API_KEY`・`ANTHROPIC_API_KEY`・`GEMINI_API_KEY`・`EXA_API_KEY`・`GOOGLE_MAPS_API_KEY`・`NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY`
- **OAuth client**: `GOOGLE_CALENDAR_CLIENT_ID/SECRET`・`MICROSOFT_CALENDAR_CLIENT_ID/SECRET`（redirect URI は除く）
- **監視/通知**: `NEXT_PUBLIC_SENTRY_DSN`・`SENTRY_DSN`・`SLACK_WEBHOOK_URL`
- model 名（`GEMINI_MODEL*`/`OPENAI_MODEL_DEFAULT`）
> ※「コピー可」= Preview に既存なら同値で可。`OAUTH_*_SECRET`/`CRON_SECRET`/`*_INTERNAL_API_KEY` は **本番用に新規 generate 推奨**（Preview と共有しない方が安全）。

## 6. Preview からコピー禁止の key（必ず production 専用値）
- **Supabase 5**: `NEXT_PUBLIC_SUPABASE_URL`・`SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY`・`SUPABASE_ANON_KEY`・`SUPABASE_SERVICE_ROLE_KEY` → **新 project `plodugvgmdkusifdrdfz` の値**（staging/legacy の値を絶対コピーしない・CEO 設定済）
- **URL 系**: `NEXT_PUBLIC_SITE_URL`・`NEXT_PUBLIC_APP_URL`・`GOOGLE_CALENDAR_REDIRECT_URI`・`MICROSOFT_CALENDAR_REDIRECT_URI` → **production URL** に修正
- 秘密鍵（`OAUTH_STATE_SECRET`/`OAUTH_TOKEN_ENCRYPTION_KEY`/`CRON_SECRET`/`*_INTERNAL_API_KEY`/`GENOME_SHARE_SECRET`）→ 本番用に新規 generate 推奨

## 7. 新 project `plodugvgmdkusifdrdfz` から取得する key
- `NEXT_PUBLIC_SUPABASE_URL` = `https://plodugvgmdkusifdrdfz.supabase.co`
- `SUPABASE_URL` = 同上
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = dashboard → Settings → API → anon key
- `SUPABASE_ANON_KEY` = 同上
- `SUPABASE_SERVICE_ROLE_KEY` = dashboard → Settings → API → service_role（**server-only・非表示**）
→ **5 つとも CEO 設定済み**（新 project 値であることだけ確認）。

## 8. production URL に直す key
- `NEXT_PUBLIC_SITE_URL`（set 済・本番ドメインか確認）
- `NEXT_PUBLIC_APP_URL`（Add・本番ドメイン）
- `GOOGLE_CALENDAR_REDIRECT_URI`（Add・本番ドメイン + Google Cloud Console 側にも登録）
- `MICROSOFT_CALENDAR_REDIRECT_URI`（Add・本番ドメイン + Azure app 側にも登録）

## 9. CEO が Vercel UI で入力する順番（短縮）
1. **Supabase 5（確認のみ・set 済）** — 新 project 値であることを再確認。
2. **`MAINLINE_SCOPE_ONLY=true`（確認・set 済）**。
3. **AI**: `OPENAI_API_KEY`・`ANTHROPIC_API_KEY`・`GEMINI_MODEL*`/`OPENAI_MODEL_DEFAULT`（Gemini はキー set 済・model 指定を追加）。
4. **暗号/内部 secret（新規 generate）**: `OAUTH_STATE_SECRET`・`OAUTH_TOKEN_ENCRYPTION_KEY`・`CRON_SECRET`・`AI_INTERNAL_API_KEY`・`INTERNAL_API_KEY`。
5. **URL**: `NEXT_PUBLIC_APP_URL`（+ SITE_URL 確認）。
6. **OAuth calendar**: Google/Microsoft の CLIENT_ID/SECRET（コピー可）+ **REDIRECT_URI（本番 URL・provider 側にも登録）**。
7. **推奨**: `NEXT_PUBLIC_SENTRY_DSN`・`SENTRY_DSN`・`SLACK_WEBHOOK_URL`・`GENOME_SHARE_SECRET`。
8. **任意**（使うなら）: VAPID 3点 / STUDENT_PROVIDER 一式 / avatar bucket。
9. **除外（§4）は入れない**。体験 flag も入れない（P3）。
> 全て **Production scope**。入力後も **deploy はしない**（P4・別 GO）。

## 10. P4 deploy preflight へ進める条件
- ☐ §1 必須 + §2 推奨が **Production scope** に入っている（特に **NEXT_PUBLIC は build 前必須**）。
- ☐ Supabase 5 が新 project `plodugvgmdkusifdrdfz` 値・`MAINLINE_SCOPE_ONLY=true`・体験 flag 未設定（OFF）。
- ☐ OAuth redirect URI が本番 URL + provider 側登録済み。
- ☐ Gemini model 設定済み（Budget 0 回避）。
- ☐ §4 除外を入れていない（特に Stripe・TURN・UPSTASH・staging/test）。
- → 満たせば **P4-DEPLOY-PREFLIGHT**（origin/main push 直前の最終確認）へ。push 自体は不可逆・単独 GO。

---
docs-only。値非表示・Vercel 非編集・`vercel env add` 不実行・deploy/push/flag ON なし・SQL/seed なし。

---

## 11. P2 ENV 入力中の CEO 確認への回答（2026-06-25・値非表示）
**canonical domain = `aneurasync.com`（CEO 決定）。全 URL を統一済。前提=aneurasync.com を Vercel custom domain として接続＋DNS＋live（P5）。未接続なら aneurasync.vercel.app 配信で auth/OAuth が解決せず壊れる。**
- URL env（確定・整合 OK）: `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` = `https://aneurasync.com`。`GOOGLE_CALENDAR_REDIRECT_URI=https://aneurasync.com/api/calendar/google/callback`・`MICROSOFT_CALENDAR_REDIRECT_URI=https://aneurasync.com/api/calendar/microsoft/callback`。
- **callback path（コード実証）**: google/microsoft の callback/connect route が `process.env.*_CALENDAR_REDIRECT_URI` を直接使用（APP_URL fallback なし）→ path は `/api/calendar/{google,microsoft}/callback` で正しい。**provider（Google Cloud Console / Azure）側の登録 redirect も完全一致必須**。
- **Supabase Auth**: Site URL=`https://aneurasync.com` / Redirect allowlist=`/auth/callback`（route 実在 `app/(culcept)/auth/callback/route.ts`）+`/auth/reset-password`。email/password の確認・reset リンクが Site URL 使用。
- **AI_INTERNAL_API_KEY / INTERNAL_API_KEY**: initial deploy をブロックしない（未設定でも throw せず unauthorized/401・user flow 動く）。cron/内部 AI/notifications の認証に必要 → CEO が `openssl rand -base64 32` で生成・設定推奨（値非表示）。
- **GENOME_SHARE_SECRET**: insecure default fallback あり（未設定で動くが share 署名が公開鍵＝偽造可）→ 推奨（security）・生成設定。
- **Sentry/Slack**: 未設定でも initial deploy 可（機能 degrade のみ）。
- **flag 系**: `PLAN_SHIFT_DRAFT_HOST` は host でなく flag（dev route gate）→ 初期は入れない。全 flag 未設定（OFF）・`MAINLINE_SCOPE_ONLY=true` のみ。点火は P3 canary。
- **残り追加 key**（値非表示）: 必須=OPENAI/ANTHROPIC_API_KEY・GEMINI_MODEL(+DEFAULT)/OPENAI_MODEL_DEFAULT・OAUTH_STATE_SECRET・OAUTH_TOKEN_ENCRYPTION_KEY・CRON_SECRET・AI_INTERNAL_API_KEY・INTERNAL_API_KEY・GOOGLE/MICROSOFT_CALENDAR_CLIENT_ID/SECRET。推奨=NEXT_PUBLIC_SENTRY_DSN/SENTRY_DSN/SLACK_WEBHOOK_URL/GENOME_SHARE_SECRET。入れない=PLAN_SHIFT_DRAFT_HOST/全flag/Stripe/TURN/UPSTASH/staging-test。
