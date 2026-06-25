# P2 — Vercel ENV PREFLIGHT（CEO 設定用 checklist / 2026-06-25）

> **本書は設定 checklist（docs-only）。Claude は Vercel を変更しない・secret 値を扱わない/出力しない。** env は **CEO が Vercel dashboard で設定**。production deploy / origin/main push / flag 点火は **まだしない**（P4/P3 別 GO）。
> 前提: P1 完了。**production DB = `plodugvgmdkusifdrdfz`**（201/201・star_maps 他実在）。worktree=local main（branch `main`・tip は `git -C /Users/haradataishi/Culcept-main-reflect-20260604 log --oneline -1`）。

## 0. 重要な順序・原則
- **`NEXT_PUBLIC_*` は build 時に inline される** → production deploy（P4）の**前**に Vercel production env へ設定が必要（後から足しても再 build まで client に乗らない）。
- secret（anon/service_role/各 API key/OAuth secret/暗号鍵）は **新 project dashboard → Settings → API / 各 provider から CEO が取得**し Vercel に入力。**Claude は値を見ない・出力しない**。
- env は **Production / Preview を分離**（Production=新 project `plodugvgmdkusifdrdfz`。Preview=staging or 新 project は CEO 判断）。
- **体験 flag は全 OFF で開始**（P3 canary 点火）。**`MAINLINE_SCOPE_ONLY=true`**（fashion/rendezvous 封じ込め発火）。

## 1. ★ 必須 env（mainline・これが無いと動かない）
| key | 値の出所 | 区分 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` | 新 project URL（`https://plodugvgmdkusifdrdfz.supabase.co`） | 接続 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY` | 新 project anon key（dashboard→API） | 接続 |
| `SUPABASE_SERVICE_ROLE_KEY` | 新 project service_role（**CEO 投入・表示しない**） | 接続（server） |
| `OPENAI_API_KEY` / `OPENAI_MODEL_DEFAULT` | 本番 LLM | AI |
| `ANTHROPIC_API_KEY` | 本番 LLM | AI |
| `GEMINI_API_KEY` / `GEMINI_MODEL` / `GEMINI_MODEL_DEFAULT` | 本番 LLM（**「Budget 0 invalid」回避の model 設定要**） | AI |
| `EXA_API_KEY` | 検索 | AI |
| `GOOGLE_MAPS_API_KEY`（server）/ `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY`（client） | Maps（Travel/朝） | Maps |
| `GOOGLE_CALENDAR_CLIENT_ID/SECRET/REDIRECT_URI` | OAuth（**本番ドメインの redirect URI**） | Calendar 連携 |
| `MICROSOFT_CALENDAR_CLIENT_ID/SECRET/REDIRECT_URI` | OAuth（同上） | Calendar 連携 |
| `OAUTH_STATE_SECRET` / `OAUTH_TOKEN_ENCRYPTION_KEY` | 本番値（**新規発行推奨**） | 暗号 |
| `CRON_SECRET` | 本番値（新規発行・Vercel cron 認証） | cron |
| `AI_INTERNAL_API_KEY` / `INTERNAL_API_KEY` | 本番値（内部 API 認証） | 内部 |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` | 本番ドメイン（暫定 `https://culcept.vercel.app`） | URL |
| **`MAINLINE_SCOPE_ONLY`** | **`true`** | 封じ込め |

## 2. 推奨 env（監視・通知・任意機能）
| key | 用途 | 設定 |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | error 監視（未設定で Sentry 無効） | 推奨 |
| `SLACK_WEBHOOK_URL` | ops 通知 | 推奨 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`（+ server VAPID 秘密鍵があれば） | Web Push 通知 | push を使うなら |
| `NEXT_PUBLIC_TURN_URL` / `_USERNAME` / `_CREDENTIAL` | WebRTC TURN（talk 音声） | 音声を使うなら |
| `STUDENT_PROVIDER_*`（ENABLED/ENDPOINT/API_KEY/MODEL 等） | 学習 student provider | flag 次第（既定 OFF 可） |
| `STARGAZER_ANON_ENABLED` | 匿名 stargazer | CEO 判断 |

## 3. ★ 除外 env（fashion/commerce・新 production に入れない）
| key | 理由 |
|---|---|
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | commerce（archive） |
| `SUPABASE_DROP_IMAGES_BUCKET` / `SUPABASE_SHOP_BUCKET` | fashion/drops/shops bucket（archive・新 project に作らない） |
| `SUPABASE_BODY_BUCKET` | 外見分析（凍結）→ 任意（入れなくてよい） |
| `SUPABASE_USER_AVATAR_BUCKET` | avatar（本線）→ 入れる（bucket は dashboard 作成要） |

## 4. 自動・触らない
- `VERCEL_URL` … Vercel が自動付与（設定不要）。

## 5. ★ production flag checklist（P2 時点）
- **`MAINLINE_SCOPE_ONLY=true`**（必須・page/API/cron の fashion・rendezvous を 404/非発火）。
- **体験 flag は全て未設定＝OFF で deploy 開始**（`PLAN_ROUTE_LIVE`/`PLAN_HOME_SWIPE_ENABLED`/`PLAN_ALTER_TAB_ENABLED`/`NEXT_PUBLIC_PLAN_COALTER_TAB_ENABLED`/travel/lifeops/reality/coalter live 等）。
- **キルスイッチ `REALITY_CAPTURE_KILL` は設定しない（=false）**（true で体験断）。
- 体験 flag の点火は **P3（canary 段階・別 GO）**: 段階1 `PLAN_ROUTE_LIVE` → 段階2 swipe/alterTab/coalterTab/travel/calendar → 段階3 write/live。canary=`PLAN_CANARY_USER_IDS`。

## 6. CEO が Vercel dashboard で行う操作（preflight 後）
1. Vercel project → Settings → Environment Variables → **Production** scope。
2. §1 必須を全入力（Supabase は新 project `plodugvgmdkusifdrdfz` の値・service_role は表示しない運用）。
3. §2 推奨を要否で入力。§3 除外は**入れない**。
4. **`MAINLINE_SCOPE_ONLY=true`** を入力・体験 flag は入れない（OFF）。
5. OAuth redirect URI（Google/Microsoft）を本番ドメインで各 provider 側にも登録。
6. user-avatar bucket を新 project dashboard で作成（必要時）。
7. **deploy はまだしない**（P4 で origin/main push＝CEO 別 GO）。

## 7. STOP / 注意
- **service_role / DB password / 各 secret 値を chat・ログ・docs に貼らない**（Claude も出力しない）。
- 新 project URL/anon は client 露出前提（NEXT_PUBLIC）だが、**service_role は server 専用・絶対に NEXT_PUBLIC にしない**。
- env 設定だけでは本番は変わらない（deploy=P4 で初めて反映）。env 設定後に誤って deploy しないこと。
- Gemini「Budget 0 invalid」は model 設定不備 → P2 で `GEMINI_MODEL*` を thinking 対応 model に設定 or 該当機能 flag OFF。

## 8. 次（P3/P4・別 GO）
- P3: 体験 flag canary 段階点火（env 追加 + 再 deploy）。
- P4: **origin/main を local main へ push → Vercel 本番 deploy**（不可逆・単独 GO）。push 前に §1 env が Production scope に入っていること（特に NEXT_PUBLIC）を確認。

---
docs-only。Vercel 変更・production deploy・origin push・flag 点火・secret 出力 一切なし。
