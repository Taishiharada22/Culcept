# P3 Phase B Readiness — Google Calendar end-to-end 完成 (= 短く 1 枚)

起草日: 2026-05-28
親 phase: P3 Completion → Phase B (= Google Calendar 本流完成)
CEO 確定: 2026-05-28 (Phase A pass 後、 Phase B readiness 起草)

---

## §0. Scope (= 完成条件)

**Phase B 完成 = Google Calendar import が end-to-end で通る:**

1. **connect**: OAuth flow (= GET /api/oauth/google/connect → callback)
2. **events fetch**: Google Calendar API から event list 取得
3. **mapping**: `googleEventsToAnchorMapper` で `ExternalAnchorInput[]` 変換 (= sourceType="google_calendar")
4. **save**: 既存 `createSourceWithAnchors` 経由で atomic insert (= Phase A と同経路)
5. **UI 反映**: Plan UI で Google import event 表示
6. **disconnect**: GET /api/oauth/google/disconnect で connection 解除

**Phase B 完成に含めない (= 後段):**
- Outlook / 他 provider
- background sync の高度化
- 多 calendar 運用の磨き込み
- token refresh 失敗時の retry 高度化

---

## §1. 前提 (= Phase A 完了後の固定状態)

| 項目 | 値 |
|------|------|
| branch | `feat/p3-completion` (= Phase A 着地済、 同 branch で継続) |
| 本 phase 着手前 commit | 6 件 (= Phase A 5 件 + 本 Phase B readiness 1 件) |
| linked ref (CLI) | `hjcrvndumgiovyfdacwc` (staging) |
| `.env.local` URL | smoke 前に **staging 必須** (= readiness §4-X 厳守) |
| Phase A 動作確認済 module | `external_anchor_sources` / `external_anchors` / `create_external_anchor_bundle` / `IcsImportModal` 流用 |
| 既存 freeze branch | `feat/alter-plan-p3-a-1-google-readiness` (HEAD `18aa6111`、 Phase B cherry-pick 対象) |

---

## §2. 既存資産の棚卸 (= freeze branch から取り込む対象)

### §2.1 OAuth scaffold (= 完成済、 cherry-pick)

| 資産 | 状態 | freeze branch path |
|------|------|------|
| `app/api/oauth/google/connect/route.ts` (= state + scope + redirect) | 完成 | cherry-pick |
| `app/api/oauth/google/callback/route.ts` (= 6 条件 unit test) | 完成 | cherry-pick |
| `app/api/oauth/google/status/route.ts` | 完成 | cherry-pick |
| `app/api/oauth/google/disconnect/route.ts` | 完成 | cherry-pick |
| `user_calendar_connections` migration (= schema-only) | 完成 | cherry-pick (= **staging で apply 確認必要**) |

### §2.2 Google Calendar 連携 lib (= 完成済、 cherry-pick)

| 資産 | 状態 |
|------|------|
| `lib/external-anchors/googleCalendarEvents.ts` (= fetch + mapper) | 完成 |
| `lib/external-anchors/refreshGoogleAccessToken.ts` (= refresh helper) | 完成 |
| 関連 unit tests | 完成 |

### §2.3 UI 資産 (= 完成済、 cherry-pick)

| 資産 | 状態 |
|------|------|
| `app/(culcept)/plan/components/CalendarConnectBanner.tsx` (= OAuth callback 後の banner) | 完成 |
| `app/(culcept)/settings/integrations/CalendarConnectionSection.tsx` (= 設定画面) | 完成 |
| `app/(culcept)/settings/integrations/connectionDisplay.ts` (= helper) | 完成 |
| `app/(culcept)/settings/integrations/page.tsx` (= settings page entry) | 完成 |
| 関連 unit tests | 完成 |

### §2.4 PlanClient.tsx に戻す Google 部分 (= 手動移植)

Phase A で手動削除した Google 関連を復活:
- `CalendarConnectBanner` import + render
- `usePathname` / `useRouter` / `useSearchParams` import
- `parseBannerStatus` + `bannerStatus` state
- `clearCalendarQuery` + `handleBannerRetry` callback
- `<CalendarConnectBanner status={...} onRetry={...} onDismiss={...} />` render

### §2.5 未完の「本流」 部分 (= Phase B 新規実装)

CEO の「Google: 土台はかなりできた、 でも取り込み＆反映の本流はまだ未完」 の核心:

- **Google import action** (= ICS の `importIcsAnchors.ts` と並列、 `importGoogleAnchors.ts` 新規)
  - 認証チェック (= access token 取得 / refresh)
  - Google Calendar events fetch
  - `googleEventsToAnchorMapper` で `ExternalAnchorInput[]` 変換
  - 既存 anchors との UID dedup
  - `createSourceWithAnchors` で atomic insert (= sourceType="google_calendar")
- **UI: import trigger** (= ICS の IcsImportModal と並列、 Google import button or 自動 sync trigger)
- **既存 ICS scope と本来共通の部分** を library 化 (= 必要なら)

---

## §3. 実装順序 (= シンプル法案、 思考原則 ③)

### Step B-1: 既存資産 cherry-pick (= ICS と同パターン)

1. OAuth scaffold (= §2.1) cherry-pick
2. lib (= §2.2) cherry-pick
3. UI 資産 (= §2.3) cherry-pick
4. PlanClient.tsx に Google 関連を**手動移植**で戻す (= §2.4)
5. `user_calendar_connections` migration を **staging apply** (= CEO 個別承認)
6. unit test 全 PASS 確認

### Step B-2: Google import action 新規実装 ✅ 完了 (= 2026-05-29、 commit 480cb915)

1. `app/(culcept)/plan/_actions/importGoogleAnchors.ts` 新規 (= ICS action と並列)
2. token 取得 → events fetch → mapper → dedup → save
   - **取得時間窓 = 「過去 30 日 〜 未来 90 日」で最終確定** (= 親 Q4 採用案)。
     実装定数 `IMPORT_WINDOW_PAST_DAYS=30` / `IMPORT_WINDOW_FUTURE_DAYS=90`、
     SoT は `lib/oauth/importGoogleAnchorsHelpers.ts` §時間窓 + `lib/oauth/googleCalendarEvents.ts` §1.4。
   - 過去の検討段階で出た別案は不採用。 docs / code に旧表現の残骸なし (= grep 確認済)。
3. error handling (= ICS と同パターン、 10 step orchestration を pure core に分離)
4. unit test = 33 test 全 PASS (= `tests/unit/oauth/importGoogleAnchorsHelpers.test.ts`)

### Step B-3: UI trigger 接続 (= connect→import→reflect 本流結線)

**core gap (= B-3 が埋めるもの)**: connect は P3-A-1-1-f で結線済だが、 connect 後に
`importGoogleAnchorsAction()` (= B-2) を呼ぶ trigger が無い。 events fetch→save→反映 の
「本流 trigger」 を結線する (= 実装は `IcsImportModal.tsx` 単一 file)。

1. **UI 接続点**:
   - 既存 Google connect toggle (= P3-A-1-1-f) と同 modal 内、 直下に
     「Google の予定を取り込む」 button を追加 (= `googleStatus === "connected"` 時のみ表示)。
   - tap → `importGoogleAnchorsAction()` (= 引数なし、 server が connection 使い自前 fetch)
     → `importing_google` 進捗 → ok: `submitted` + `onSuccess()` / !ok: `submit_error`。
   - connect と import を 2 modal に割らない (= 同 IcsImportModal 内に同居、 ICS と並列)。

2. **PlanClient 触る範囲 = 触らない**:
   - IcsImportModal は既に `onSuccess → load()` (= 全 anchors refetch) が結線済。
   - Google import は同 `onSuccess` を再利用 → B-3 の変更は **IcsImportModal.tsx 1 file のみ**。

3. **二重表示防止 (= 3 層)**:
   - (a) data 層: B-2 の externalUid dedup (`partitionGoogleDraftsByExistingUids`) で
     re-import 冪等 (= 同 UID skip、 anchor 重複生成なし)。
   - (b) UI 層: `onSuccess → load()` で server canonical state を全 refetch
     (= client side merge を持たない、 stale 重複なし)。
   - (c) semantic 層: OAuth connect banner (「繋がりました」) は connection feedback、
     import feedback (= modal の imported/skipped) と分離。 connect ≠ auto-import
     (= 取り込みは明示 button)。

4. **staging runtime 前提**:
   - B-3 自体は UI wiring + tsc + 既存 suite のみ (= 実 network 呼出なし)。
   - 実 import (= Google fetch) は staging runtime (`SUPABASE_URL=staging`) +
     実 OAuth connection + env (`GOOGLE_CALENDAR_CLIENT_ID/SECRET` + `OAUTH_TOKEN_ENCRYPTION_KEY`)
     を要し、 これは **B-4 smoke (= CEO 承認 gate)**。 production runtime には触れない。

**test 方針**: B-3 新規 unit test なし (= 意図的)。 import logic は B-2 で 33 test 済。
B-3 は thin UI glue (= button + result→state mapping) で、 IcsImportModal は `"use server"`
action を import するため node test env で import 不可 (= pure-core 分離原則の対象、
glue 以上に抽出すべき pure core が無い)。 検証 = tsc 0 new error + 既存 suite green + grep + B-4 smoke。

### Step B-4: staging end-to-end smoke

1. **smoke 前必須**: `.env.local` を staging 確認 (= readiness §4-X)
2. Google OAuth flow を staging 用 Google account で実行 (= CEO 用意)
3. events fetch → save → UI 反映 を visual 確認
4. payload log (= 既存 `[external-anchor-repo] RPC payload`) で sourceType="google_calendar" 確認
5. Phase B 完了判定

**B-4 前提: Google OAuth env チェックリスト (= 2026-05-29 全 5 変数 未設定を確認)**

B-3 完了後の dev server smoke で connect が `not_configured` で degrade
(`[calendar/google/connect] not configured { hasClientId: false, hasRedirectUri: false, hasStateSecret: false }`)。
**コード不具合ではない** (= B-2 save / B-3 trigger は健全)。 原因 = `.env.local` に Google OAuth
5 変数が全て未設定。 SoT = `.env.example` L76-96。

| env 変数 | 区分 | 取得元 / 形式 | connect の boolean |
|----------|------|--------------|--------------------|
| `GOOGLE_CALENDAR_CLIENT_ID` | secret (= CEO) | Google Cloud Console OAuth client | `hasClientId` |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | secret (= CEO) | 同上 (= callback token 交換 + import refresh で必要) | — |
| `GOOGLE_CALENDAR_REDIRECT_URI` | config | Console 登録値と**完全一致**。 local = `http://localhost:3000/api/calendar/google/callback` | `hasRedirectUri` |
| `OAUTH_STATE_SECRET` | secret (= 生成) | `openssl rand -base64 32` (= 32 bytes base64) | `hasStateSecret` |
| `OAUTH_TOKEN_ENCRYPTION_KEY` | secret (= 生成) | `openssl rand -base64 32` (= **厳密 32 bytes = 44 文字 base64**、 AES-256-GCM、 `tokenCrypto.ts` が長さ検証) | — |

- 手順: ①`.env.local` に 5 変数設定 (= secret 値は commit / docs / chat 載せず) → ②**dev server 再起動**
  (= Next.js は起動時に `.env.local` 読込、 既存 process は古い env のまま) → ③再 connect で 3 boolean = true 確認 → ④B-4 smoke 再開。
- smoke 用 account = `aneurasync@outlook.com` (= §7.3)。

---

## §4. 環境方針 (= Phase A §4 と同等、 教訓継承)

| Phase | linked ref (CLI) | runtime SUPABASE_URL | 用途 |
|-------|------------------|----------------------|------|
| 開発中 (= Step B-1 ~ B-3) | `staging` | **`staging` 必須** | unit test + dev server smoke |
| end-to-end 確認 (= Step B-4) | `staging` | **`staging` 必須** | Google OAuth + import 通し |
| production | **触らない** | **touch しない** | Phase B 内では一切手を出さない |

**production runtime smoke 禁止** (= 恒久ルール、 readiness §4-X)。

---

## §5. CEO 個別承認 stop point (= 5 ヶ所)

| Step | 停止 + CEO 判断 |
|------|---------------|
| B-1 cherry-pick 着手前 | file 一覧確認 (= 17 files 想定、 ICS 除外組) |
| B-1 完了後 | `user_calendar_connections` staging apply CEO 承認 |
| B-2 着手前 | Google import action 設計 mini-readiness 承認 (= ICS pattern と差分の確認) |
| B-2 完了後 | unit test 全 PASS 報告 → B-3 着手判断 |
| B-3 完了後 | dev server smoke 実施前 stop (= staging credentials 確認、 production runtime 防止) |
| B-4 完了後 | Phase B 完了判定 + P3 全体 closeout 判断 |

---

## §6. 残課題 (= Phase B 完成後)

1. **Outlook 対応** (= ICS / Google と同 source 層流用、 別 phase)
2. **背景 sync 高度化** (= cron / webhook)
3. **clean up** (= 1114 件 tsc error、 dev console.log、 unused code 整理)
4. **カレンダータブ再設計** (= UI 全体改修、 別 phase)

---

## §7. CEO 確認 stop point (= 着手前)

次の動きを CEO 確認:

1. **Phase B 着手 GO** か (= 本 readiness 確定後、 Step B-1 cherry-pick 着手)
2. **Google OAuth 用 staging 環境**: Google Cloud Console で staging 用 OAuth client / redirect URI が設定済か
3. **smoke 用 Google account**: CEO 用意の test account (= ICS の aneurasync@outlook.com と同 user 想定)
4. **cherry-pick file list** = freeze branch の Google 系 全件 + PlanClient 手動移植 でよいか

→ 4 点 CEO 確認後、 Step B-1 着手。
