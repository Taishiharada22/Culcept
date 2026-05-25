# P3-A-1-1 OAuth Flow Scaffold Readiness

**Date**: 2026-05-26
**Branch**: `feat/alter-plan-p3-a-1-google-readiness`
**Parent readiness**: `docs/alter-plan-p3-a-1-google-calendar-readiness.md` (= 12 問全 CEO 確定済)
**Status**: 🟡 readiness only (= code 禁止、 各項 CEO 判断確定まで実装着手しない)

---

## 0. 背景 — なぜ更に 1 段細かい readiness が必要か

CEO 指示 (= 2026-05-26):

> 「OAuth は true risk boundary です。 ここは実装前に 1 段だけ細かく設計した方がよいです。」

P3-A-1 の親 readiness は **判断の枠組み** (= 12 問の選択) を確定した。 本文書は **実装の物理層** (= URL / API / DB / UI 遷移 / failure 経路) を 8 項目で詰める。

### 自立調査結果 (= 既存 Aneurasync auth 実装の現状)

- 認証: **email/password のみ** (= `supabase.auth.signUp` / `signInWithPassword`)
- Google OAuth: **未使用** (= login flow に google keyword なし)
- 既存 callback: `app/(culcept)/auth/callback/route.ts` は Supabase Auth code exchange 用 (= 認証用、 calendar 連携用ではない)
- Supabase Auth provider に Google を有効化することは可能だが、 **現状未有効化**

→ 親 readiness Q1 採用案 「別 OAuth client」 は **完全に clean** (= 既存 Supabase Auth と何の干渉もない)。 calendar 連携は **独自 OAuth flow** として実装する。

---

## 1. 本体 — 8 項目 (= 実装判断書)

### 項目 1. redirect URL 設計

**論点**: Google が callback する URL の設計。 既存 `/auth/callback` (= Supabase Auth 用) との衝突回避。

**選択肢**:
- (a) 既存 `/auth/callback` を流用 + `provider=google_calendar` query で分岐
- (b) **専用 route 新設**: `/api/calendar/google/callback` (= 認証と連携の責務完全分離)
- (c) `/auth/callback/google-calendar` (= 既存 dir 下に sub-route)

**推奨初手**: **(b)**。 理由 = 親 Q1 「別 OAuth client」 の設計と一貫、 既存 Supabase Auth callback を一切触らない (= regression risk 0)、 「API route = サーバー専用処理」 が semantic に合う。

**URL 具体案**:
- Development: `http://localhost:3000/api/calendar/google/callback`
- Production: `https://<aneurasync-domain>/api/calendar/google/callback` (= ⚠️ 実 domain は CEO 確認必要)

**CEO 判断**: ⬜ (a) / ⬜ (b) / ⬜ (c) / ⬜ 補正 (= 例: domain 確定)

---

### 項目 2. Google Cloud Console 設定

**論点**: Google 側の OAuth 2.0 Client 登録手順とコンフィグ範囲。

**必要設定** (= GPT 補正 2026-05-26: project 単位ではなく **client 単位** で分離):
1. **Project**: **既存 Aneurasync project があれば流用優先**、 その中で **別 OAuth client** を作る
   - 分けるべきは Project ではなく Client (= 認証用 client と calendar 連携用 client を別々に登録)
   - 既存 project なしの場合のみ新規作成
2. **OAuth consent screen**:
   - User type: **External** (= 一般ユーザー対象)
   - App name: "Aneurasync"
   - Support email / Developer email: **プロダクト運用で継続管理できる email を固定** (= 個人 email 避ける)
   - Scopes: `calendar.events.readonly` + `calendar.calendarlist.readonly` (= 親 Q2 確定)
   - Test users: 初期は CEO + 検証メンバーのみ (= consent screen "Pending verification" 状態回避)
3. **Credentials > OAuth 2.0 Client ID** (= calendar 連携専用、 認証 client とは別物):
   - Application type: **Web application**
   - Name: "Aneurasync Calendar Integration"
   - Authorized JavaScript origins: dev (= `http://localhost:3000`) + prod (= 上記 domain)
   - Authorized redirect URIs: 項目 1 の URL 2 つ
4. **secret**: Client ID + Client Secret を取得 → `.env.local` (= `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET`)

**CEO 判断必要事項**:
- ⬜ 既存 Aneurasync Google Cloud project の有無確認 (= 流用 or 新規)
- ⬜ Support email (= プロダクト運用 email、 個人不可)
- ⬜ App verification 申請タイミング (= 初期は test users で十分、 開放時に申請)

---

### 項目 3. 既存 Supabase Auth Google provider との関係

**論点**: 親 Q1 で 「別 OAuth client」 確定済。 本項目は **既存 supabase に何も加えない** ことを物理層で確定する。

**確定事項** (= 自立調査結果):
- 既存 Supabase Auth に Google provider を **追加しない**
- 既存 `/auth/callback` route を **触らない**
- token は Supabase Auth の session storage (= cookie / localStorage) ではなく、 **新規 DB column** (= 項目 5 で確定) に保管

**根拠**: 認証 (= 「あなたが誰か」) と連携 (= 「あなたの calendar を読む許可」) は責務が違う。 disconnect が sign-out を巻き込まない設計が clean。

**追加検討**: 将来 Google sign-in を Aneurasync 認証として追加する場合は **別 phase**。 P3-A-1-1 では一切触らない。

**CEO 判断**: ⬜ 確認のみ (= 「既存 Supabase Auth は触らない」 で合意)

---

### 項目 4. 別 OAuth client の具体フロー

**論点**: connect button tap から token 取得完了までの sequence 設計。

**フロー (= 推奨初手)**:

```
1. user 「Google を接続」 tap (= Plan header)
   ↓
2. GET /api/calendar/google/connect
   - state token 生成 (= CSRF 防止、 cookie に signed cookie で保管)
   - scope = "calendar.events.readonly calendar.calendarlist.readonly"
   - access_type=offline (= refresh_token 取得必須、 これだけで通常 refresh_token は確保される)
   - prompt 制御 (= GPT 補正 2026-05-26):
     - 初回 connect: `prompt=consent` (= refresh_token 確実発行のため)
     - 再接続 / refresh_token 再取得時: `prompt=consent` (= 再 reapproval 必要時のみ)
     - 通常 reconnect: prompt 指定なし (= UX 軽量、 同意 screen を毎回出さない)
   - Google OAuth URL 構築 → 302 redirect
   ↓
3. Google consent screen (= user 同意)
   ↓
4. Google → GET /api/calendar/google/callback?code=...&state=...
   - state cookie verify (= CSRF check)
   - code → token exchange (= access_token + refresh_token + expires_in)
   - supabase.auth.getUser() で userId 取得
   - DB persist (= 項目 5、 暗号化 column)
   ↓
5. GET / → Plan tab へ自動 redirect + 接続済 toast
   - 背景で initial sync (= 親 Q4 過去 30 + 未来 90 日) を fire-and-forget
```

**選択肢 (= 詳細決定事項)**:
- **state 保管**: ⬜ signed cookie (= 推奨、 stateless) / ⬜ DB temporary table
- **PKCE 採用**: ⬜ yes (= 推奨、 mobile 対応 + 一般 best practice) / ⬜ no (= 古典 OAuth flow)
- **prompt 制御**: ✅ **採用 (= GPT 補正 2026-05-26)** = 初回 connect + refresh_token 再取得時のみ `prompt=consent`、 通常 reconnect は prompt 指定なし

**CEO 判断**: 上記 3 つの選択肢 + 全体フロー GO / 補正

---

### 項目 5. token refresh / revoke / disconnect

**論点**: refresh_token 暗号化保管 + 期限切れ前 refresh + 切断時の正しい revoke。

**DB schema 案** (= 親 Q3 採用案 「Supabase column + 暗号化」 を具体化):

```sql
-- 新 table: user_calendar_connections
CREATE TABLE user_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  -- ⚠️ 暗号化 column (= 方式は実装時確定、 GPT 補正 2026-05-26: readiness で掘りすぎず)
  --    候補: pgsodium / pgcrypto / Supabase Vault — どれを採用するかは migration draft 時に確定
  refresh_token_encrypted bytea NOT NULL,
  -- access_token は短命なので暗号化保管せず、 都度 refresh で取得
  -- ただし期限切れ判定用に expires_at は保管
  access_token_expires_at timestamptz,
  scopes text[] NOT NULL,  -- 取得した scope を記録
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  -- per-calendar の取り込み ON/OFF 制御は別 table (= 項目 8)
  UNIQUE (user_id, provider)
);
ALTER TABLE user_calendar_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_connection_select" ON user_calendar_connections
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_connection_modify" ON user_calendar_connections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**refresh 戦略**:
- access_token 期限切れ 5 分前に **lazy refresh** (= 必要時に自動 refresh、 background cron 不要)
- refresh 失敗 (= refresh_token 無効) → 接続 status を `revoked` に変更 + 親 Q6 banner 表示

**revoke / disconnect 手順**:
1. user 「Google を切断」 tap (= 設定画面、 項目 8)
2. confirm modal (= 「取り込み済 data を保持しますか?」 親 Q11 採用案)
3. user 選択受領後:
   - Google revocation endpoint (= `https://oauth2.googleapis.com/revoke`) を叩く
   - `user_calendar_connections` row 削除
   - data は user 選択に従う (= 保持 / 削除)

**CEO 判断**: ⬜ DB schema 案 GO / ⬜ refresh 戦略 GO / ⬜ revoke 手順 GO

---

### 項目 6. 初回接続後の UI 遷移

**論点**: callback 完了瞬間から user が何を見るかの詳細遷移。

**遷移案** (= 親 Q12 採用案 「pattern card 1 枚」 = 軽い驚き):

```
[ 完了 callback 0ms ]
    ↓ Plan tab に redirect
[ Plan tab 表示 + subtle progress 表示 ~ 数秒〜30秒 ]
    - 上部 banner: 「Google カレンダーから取り込んでいます…」 (= 邪魔しない 1 行)
    - 既存 Plan 表示はそのまま (= 黒画面禁止)
    ↓ initial sync 完了
[ pattern card 1 枚 提示 ]
    - skeleton: 「あなたの calendar から、 こんな pattern が見えました」
    - 1 行 dynamic 部分 (= 例: 「火曜午前が一番予定が集中していますね」)
    - 詳細 logic は **Phase Next-1 で確定**、 v1 は最低限の statistics ベース
    - card を tap or 「閉じる」 で通常 Plan view へ
```

**選択肢 (= 詳細決定事項)**:
- **progress 表示**: ⬜ subtle banner (推奨) / ⬜ modal / ⬜ なし (= silent)
- **pattern card display時間**: ⬜ user 操作まで残す (推奨) / ⬜ 自動 dismiss (= 5 秒等)
- **pattern card v1 内容**: ⬜ statistics only (= 「火曜午前が集中」 等の頻度系) / ⬜ Phase Next-1 待ち (= P3-A-1-1 では skeleton のみ)

**推奨初手**: statistics only の最小実装で v1、 詳細文体や深い解釈は Phase Next-1。

**⚠️ 不変原則 (= GPT 補正 2026-05-26、 明文化強化)**:
- pattern card は **本当に 1 枚だけ**
- **「明日の予定提案」 等の予定生成 logic は P3-A-1-1 で実装しない** (= 自動提案禁止)
- 自動予定生成は Phase Next-1 (= Rhythm baseline 学習) / Next-2 (= 1 日構成権限の Alter 委譲) 範疇
- P3-A-1-1 の役割は **「制約取り込みが動いた、 軽い驚き 1 枚」 まで**

**CEO 判断**: 上記 3 つの選択肢 + 全体遷移 GO / 補正

---

### 項目 7. failure 時の戻り先

**論点**: OAuth flow の各 fail point での復帰先設計。

**failure 経路一覧**:

| 失敗 point | 動作 |
|----------|------|
| user が Google consent で **キャンセル** | Plan tab + 軽い toast 「接続をやめました、 また後で」 (= 親 Q6 silent degrade 系) |
| user が **scope を一部拒否** | Plan tab + banner 「カレンダー読み取り許可が必要です、 再度お試しください」 + 再連携 button |
| state cookie **mismatch / 期限切れ** | Plan tab + banner 「セキュリティチェックに失敗しました、 もう一度お試しください」 (= CSRF 疑い、 log 出力) |
| Google API **rate limit / down** | Plan tab + banner 「Google 側に問題が発生しています、 しばらくしてから再試行してください」 + `.ics` fallback link (= 親 Q7 採用案 (a) 常設) |
| code exchange **失敗** (= server side error) | Plan tab + banner 「接続中にエラーが発生しました、 再試行してください」 + 再連携 button |
| DB write **失敗** (= 既に user_calendar_connections row 存在 - 競合) | sliently 既存 row update (= idempotent) |

**設計原則**:
- 失敗時に user を /login に戻さない (= 連携失敗 ≠ 認証失敗)
- 失敗 banner は dismissible (= user が情報を読んだら閉じれる)
- `.ics` fallback link は **すべての failure banner に併設** (= 親 Q7 整合)

**CEO 判断**: ⬜ 全 failure 経路 GO / ⬜ 個別補正

---

### 項目 8. settings 側の管理導線

**論点**: 接続後の管理 UI。 親 Q5 採用案 「Plan header (= 主導線) + 設定画面 (= 管理)」 の管理側を具体化。

**設定画面構造案** (= マイページ > 設定 > 連携):

```
[ 連携 ]
  Google Carendar    [ 接続済 / 最終同期: 2 分前 ]
    取り込み対象 calendar:
      [✓] taishi@aneurasync.com (= primary)
      [✓] 仕事 (= accessRole=owner, default ON)
      [ ] 家族共有 (= accessRole=reader, default OFF、 user toggle で ON 可)
      [ ] 国民の祝日 (Holidays in Japan) (= shared/reader, default OFF)

    再同期 button
    切断 button

  Microsoft Outlook  [ 未接続 ] (= P3-A-2)
    接続 button
```

**DB schema 案** (= per-calendar toggle 制御):

```sql
CREATE TABLE user_calendar_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES user_calendar_connections(id) ON DELETE CASCADE,
  external_calendar_id text NOT NULL,  -- Google calendar.id
  display_name text NOT NULL,           -- "仕事", "家族共有" 等
  access_role text NOT NULL,            -- "owner" | "writer" | "reader"
  is_primary boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT false,  -- 親 Q2 採用案の自動判定 logic で default 設定
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_calendar_id)
);
ALTER TABLE user_calendar_subscriptions ENABLE ROW LEVEL SECURITY;
-- RLS policies: own_subscription_* (= user_id = auth.uid())
```

**default 設定 logic** (= 親 Q2 確定):
- `is_primary=true` → `is_enabled=true` (= 必ず ON)
- `access_role IN ('owner', 'writer')` → `is_enabled=true` (= default ON)
- `access_role='reader'` → `is_enabled=false` (= default OFF、 user が後で ON 可)

**選択肢 (= 詳細決定事項)**:
- **toggle 反映タイミング**: ⬜ 即時 (= 次回 sync から反映、 推奨) / ⬜ 「保存」 button 経由
- **再同期 button**: ⬜ 設定画面のみ / ⬜ Plan header にも (= manual sync は power user 向け、 設定のみで十分)
- **切断時の data**: ⬜ 親 Q11 採用案 (= user 選択 modal) 完全継承

**CEO 判断**: ⬜ 全構造 GO / ⬜ 個別補正

---

## 2. 実装後の sub-step 案 (= readiness 確定後の具体着手)

readiness 8 項目 全 CEO 確定後の段階展開案:

```
P3-A-1-1: OAuth flow scaffold (= 本 readiness 範囲)
  P3-A-1-1-a: migration (= user_calendar_connections + user_calendar_subscriptions + RLS)
  P3-A-1-1-b: env / Google Cloud Console 設定 + .env.local 更新
  P3-A-1-1-c: /api/calendar/google/connect route (= state 生成 + OAuth URL redirect)
  P3-A-1-1-d: /api/calendar/google/callback route (= code exchange + token 暗号化 persist)
  P3-A-1-1-e: token refresh helper (= lazy refresh logic、 server-side only)
  P3-A-1-1-f: Plan header に 「Google を接続」 button (= 親 Q5 + Q7 .ics link 並列)
  P3-A-1-1-g: 設定画面 (= 連携セクション、 toggle / 切断、 項目 8)
  P3-A-1-1-h: failure banner UI (= 項目 7 全経路)
  P3-A-1-1-i: 単体 test (= state / token / refresh / failure paths)
  P3-A-1-1-j: validation + atomic commit + smoke 判断

P3-A-1-2: initial sync (= 親 Q4 過去 30 + 未来 90 日 fetch、 ExternalAnchor 変換、 DB persist)
P3-A-1-3: 差分 sync (= syncToken + cron 接続)
P3-A-1-4: 初回 pattern card 1 枚 (= 項目 6、 v1 statistics only)
P3-A-1-5: 統合 smoke + P3-A-2 (= Outlook) 着手判断
```

---

## 3. 着手禁止事項 (= 不変原則)

- readiness 8 項目 **全 CEO 判断確定** 前の code 着手禁止
- 既存 Supabase Auth (= /auth/callback、 LoginForm 等) には**一切触らない**
- migration apply (= supabase db push) は CEO 個別承認制 (= P3-B の `.ics` migration と同じく HOLD)
- Phase Next の壮大設計を本 readiness に追加流し込み禁止 (= 親 readiness と同じ原則)
- 文書肥大防止: 各項目 15-25 行内に収めた (= 不要な革新案追加禁止)

---

## 4. 参照

- 親 readiness: `docs/alter-plan-p3-a-1-google-calendar-readiness.md` (= 12 問全確定)
- decision-log: 2026-05-26 P3 redefinition + Q2 採用補正 entry
- 既存 callback: `app/(culcept)/auth/callback/route.ts` (= 触らない、 参照のみ)
- 既存 login flow: `app/(culcept)/login/actions.ts` (= email/password、 触らない)
- Supabase client: `lib/supabase/server.ts` / `client.ts`
- Aneurasync 思想: `memory/aneurasync-philosophy.md`
