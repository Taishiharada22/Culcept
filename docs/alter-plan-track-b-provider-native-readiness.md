# Track B Readiness — provider native 連携 (= 非公開カレンダー、 短く 1 枚)

起草日: 2026-05-29
親: マルチ provider カレンダー取り込み → Track B (= A→B の B)
位置づけ: Track A (= universal ICS URL) main 着地後の後段。 **Phase 1 = Outlook 先行を推奨**、 Apple は後段。
CEO 確定: (未) — 実装前 readiness、 CEO 承認待ち

---

## §0. Scope (= Track B が埋めるもの)

**Track B = 各 provider の native 連携で「非公開カレンダー」を取り込む。**

Track A (= ICS URL) は **公開/秘密リンクで露出した**カレンダーをカバー。 Track B は **公開していない**個人/仕事カレンダーを OAuth 等で直接繋ぐ。

**Phase 1 (= 本 readiness の主対象): Outlook / Microsoft 365**
- Microsoft Graph API (OAuth2)。 Google OAuth (P3 Phase B) と**ほぼ同型** → 高再利用。

**Phase 2 (= 後段、 別承認): Apple iCloud**
- CalDAV のみ (= OAuth 不可、 app-specific password)。 パラダイムが異なり重い。 → §5 で deferred 推奨。

**含まない (= 後段)**: 定期 sync 高度化 (cron/webhook) / per-calendar 選択の磨き込み / 他 provider (Yahoo 等は Track A の ICS URL で足りる)。

---

## §1. 前提 (= Track A merge 後の固定状態)

| 項目 | 値 |
|------|------|
| main HEAD | `17674877` (= Track A merge 着地) |
| branch | `feat/track-b-provider-native` (= main 派生) |
| 既存 OAuth 基盤 | `lib/oauth/*` (Google) + `app/api/calendar/google/*` routes |
| connection 基盤 | `user_calendar_connections` は **provider CHECK が既に `('google','microsoft')` を許可** (= migration 20260526110000)。 connection repo も `provider: "google"\|"microsoft"` 対応 |
| token 暗号化 | `tokenCrypto.ts` (AES-256-GCM、 provider 非依存) |

---

## §2. 再利用 vs 新規 (= Outlook、 ①前提を疑った棚卸し)

**結論: connection / token / 保存経路の基盤は Microsoft 対応済。 新規は MS 固有の OAuth/API/mapper + UI + source_type のみ。**

| 領域 | 再利用 | 新規 (= MS 固有) |
|------|--------|------------------|
| token 暗号化 | ✅ `tokenCrypto` そのまま | — |
| connection 保存 | ✅ `calendarConnectionRepository` (provider="microsoft") | — (migration 不要) |
| OAuth state | ✅ `googleCalendarState` を generic 流用 (or 複製) | — |
| 取得→保存経路 | ✅ `createSourceWithAnchors` + externalUid dedup | — |
| import action パターン | ✅ `importGoogleAnchors*` の構造 | `importMicrosoftAnchors*` (新規、 同型) |
| OAuth routes | パターン | `app/api/calendar/microsoft/{connect,callback,status,disconnect}` (新規) |
| events fetch | パターン | `microsoftCalendarEvents.ts` (= Graph `/me/calendarView` or `/me/events`) |
| event → draft mapper | パターン | `microsoftEventsToAnchorMapper.ts` (= Graph event shape、 **TZ は Track A 教訓を適用: app 表示 TZ=JST の wall-clock**) |
| source_type | — | **`'microsoft_calendar'` 追加 (= migration、 CEO gate)**。 ICS の 'ics' / Google の 'google_calendar' と同パターン |
| 設定 UI | パターン (= 連携セクション) | Microsoft connect toggle + import trigger |

---

## §3. Outlook 実装計画 (= Google を mirror、 段階 + stop)

| 段 | 成果物 | 内容 |
|----|--------|------|
| **TB-0** | 前提 (= CEO 専管、 §4) | Azure AD (Entra) app 登録 + MS OAuth credentials + env。 **これが無いと着手不可** |
| **TB-1** | migration draft | `external_anchor_sources.source_type` CHECK に `'microsoft_calendar'` 追加 (= schema-only、 apply は CEO) |
| **TB-2** | OAuth routes | `microsoft/{connect,callback,status,disconnect}` (= state + scope `Calendars.Read offline_access` + token 交換 + connection upsert)。 unit test mock |
| **TB-3** | events fetch + mapper | `microsoftCalendarEvents.ts` (Graph) + `microsoftEventsToAnchorMapper.ts` (= TZ wall-clock 適用、 純粋 + DI test) |
| **TB-4** | import action + UI | `importMicrosoftAnchors` + 設定/modal の Microsoft connect+import trigger |
| **TB-5** | staging smoke | 実 MS account で connect→fetch→save→JST 表示 (= CEO gate) |

- 各段で vitest + source tsc baseline 不変、 atomic commit、 着手前/完了で stop。
- **TZ**: Graph は event 時刻を ISO + `start.timeZone` で返す。 Track A の教訓どおり **app 表示 TZ (JST) の wall-clock に正規化**する (= mapper で統一)。

---

## §4. CEO 専管の前提 (= TB-0、 着手のブロッカー)

Google と同様、 **外部サービス連携 + API キー発行は CEO 専管**。 Outlook は:

1. **Azure portal (Microsoft Entra ID) で app 登録** (= App registration)。
2. **API permission**: Microsoft Graph → Delegated → `Calendars.Read` + `offline_access` (= refresh token)。
3. **Redirect URI 登録**: local = `http://localhost:3000/api/calendar/microsoft/callback`。
4. **credentials を `.env.local` に設定** (= Claude が config/生成値を代行、 client secret は CEO が貼付。 値は commit/chat に出さない):
   - `MICROSOFT_CALENDAR_CLIENT_ID` / `MICROSOFT_CALENDAR_CLIENT_SECRET` / `MICROSOFT_CALENDAR_REDIRECT_URI` / `OAUTH_STATE_SECRET` (= 既存流用) / `OAUTH_TOKEN_ENCRYPTION_KEY` (= 既存流用)。
5. **testing-mode**: MS の app は審査前でも自テナント/Test 範囲で動く (= Google の Test users 教訓に相当、 詳細は TB-5 で確定)。

→ TB-0 が CEO 側で整うまで、 Claude は TB-1〜TB-4 の **コード + unit test (= 実 network なし)** までは進められる。 実 OAuth 動作 (TB-5) は credentials + CEO smoke 必須。

---

## §5. Apple iCloud (= Phase 2、 deferred 推奨)

- **CalDAV のみ** (= Apple は public な REST calendar API を持たない)。 OAuth 不可、 **app-specific password** (appleid.apple.com で生成 → 貼付) + CalDAV プロトコル (PROPFIND / REPORT、 XML)。
- 認証 UX が悪く (= password 手動生成/貼付)、 実装は OAuth と別物 (= 高コスト・低再利用)。
- **Apple の公開カレンダーは Track A (ICS webcal URL) で既にカバー**。 非公開のみが Track B Apple の対象 → 需要を見て別承認で着手。
- → **Phase 1 (Outlook) 完了後に、 demand 次第で Apple readiness を別途起草**。

---

## §6. invariants / security

1. token は `tokenCrypto` で AES-256-GCM 暗号化 (= Google と同、 `\x` hex bytea 書込の修正済経路を流用)。
2. connection は RLS + `provider="microsoft"` で Google と分離。
3. **production 触らない / secret を log・chat・commit に出さない / migration apply は CEO**。
4. source_type `'microsoft_calendar'` 追加以外に schema 変更なし。 externalUid dedup で再取り込み冪等。
5. TZ は app 表示 TZ (JST) wall-clock に正規化 (= Track A 教訓)。

---

## §7. CEO 確認 stop point (= 着手前)

1. **Track B Phase 1 = Outlook 先行**でよいか (= Apple は後段 deferred)。
2. **Azure AD app 登録 (TB-0) は CEO 専管**の認識合わせ — いつ着手可能か (= これが無いと TB-5 smoke 不可、 TB-1〜4 のコードは先行可)。
3. **`source_type='microsoft_calendar'` 追加 migration** 方針でよいか (= 'ics'/'google_calendar' と同パターン)。
4. 進め方: TB-1 → TB-4 をコード+unit test で進め、 TB-5 (実 smoke) は CEO credentials + 承認 gate、 でよいか。

→ 上記承認後、 TB-1 (migration draft) または TB-0 待ちなら TB-2〜4 の準備に着手。 実装着手は CEO 承認後。
