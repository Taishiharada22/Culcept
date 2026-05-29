# Track B Phase 2 — Apple (iCloud) Calendar 取り込み readiness

- **対象**: Aneurasync Plan の外部カレンダー取り込みに Apple (iCloud) を追加する判断材料。
- **状態**: **readiness のみ（実装未着手）**。本書は scope / 難所 / 設計法案 / stop point の整理。
- **branch**: `feat/track-b-apple-caldav`（Outlook と方式が大きく異なるため独立トラック）。
- **前提コンテキスト**: Google (OAuth) ✅ / Outlook (OAuth `/consumers/`) ✅ / ICS URL import (Track A, SSRF-guarded) ✅ が main 着地済。Apple は残る主要プロバイダ。
- **日付**: 2026-05-30。CEO 方針①〜⑧（前提を疑う / 自立リサーチ / シンプル法案 / 外科的 / 目標駆動）に基づき起草。

---

## §0. 結論（先出し）

1. **Apple は OAuth / REST カレンダー API を持たない（実測確認）。** Web サーバから iCloud カレンダーへ programmatic にアクセスする native 経路は **CalDAV + app-specific password（HTTP Basic over SSL）のみ**。EventKit は native iOS/macOS アプリ専用で本 Web アプリ対象外。「Sign in with Apple」は認証専用でカレンダーデータ非対応。
2. **「公開派」は既に Track A で被覆済。** iCloud の「Public Calendar」機能で `webcal://` URL を発行でき、それは既存の SSRF-guarded ICS URL import（`lib/plan/ics/icsUrlFetch.ts`、webcal→https rewrite 済・コメントに「Apple iCloud webcal」を対象明記）でそのまま取り込める。
3. **推奨スコープ（前提を疑った結論）**:
   - **Tier 1（実装ゼロ・即時）**: 「Apple は公開カレンダー URL で取り込めます」を UI で案内し Track A に流す。**今月の目標（初期ユーザー / デプロイ可能）に対しては Tier 1 で Apple を“一応”被覆できる。**
   - **Tier 2（scoped・CEO gate）**: 非公開 / 全カレンダー / 認証情報ベースを望むユーザー向けの native CalDAV。**app-specific password の摩擦と信頼コストが大きい**ため、ユーザー需要が見えてからの着手でも遅くない。着手する場合も **one-shot 無保存**（後述）で最小実装する。
4. つまり「Apple = native CalDAV を今すぐ作る」という GPT/一般通念の前提は、**現フェーズの目標に対しては必ずしも真ではない**。Tier 1 を即時の回答にし、Tier 2 は本書で難所を見切った上で CEO 判断とする。

---

## §1. 前提検証（リサーチ結果・出典付き）

| 論点 | 結論 | 根拠 |
|------|------|------|
| Apple OAuth/REST API | **存在しない** | onecal.io / Apple Developer Forums / Aurinko。"Apple doesn't provide OAuth for CalDAV; only Apple ID + app-specific passwords" |
| 唯一の native 経路 | **CalDAV**（RFC 4791）@ `caldav.icloud.com` | Apple Developer Docs (CalDAV) / Aurinko |
| 認証 | **app-specific password**（16桁 `xxxx-xxxx-xxxx-xxxx`）+ Apple ID email、Basic over SSL。2FA 必須環境のため通常 PW 不可 | onecal.io / Apple Support |
| discovery | ①PROPFIND `/` → `current-user-principal`（例 `/200385701/principal/`）②PROPFIND `/[uid]/principal/` → `calendar-home-set` → **partition host**（例 `https://p34-caldav.icloud.com/[uid]/calendars/`）③PROPFIND calendars → collection 列挙 + `supported-calendar-component-set` | Aurinko / RFC 4791 |
| イベント取得 | REPORT `calendar-query` + `<c:time-range start end>` → **iCalendar(VEVENT) を XML で wrap して返す** | Aurinko / RFC 4791 |
| **host partitioning** | `caldav.icloud.com` は認証後 `pNN-caldav.icloud.com` に振り分け。**calendar-home-set で返る host を以降使う**（難所） | Aurinko |
| 返却フォーマット | **iCalendar / VEVENT** = `.ics` と同形 → **既存 `ical.js` parser で流用可** | Aurinko |
| Track A 被覆 | iCloud Public Calendar → `webcal://` read-only URL。既存 ICS URL import が対応 | Apple Support / Macworld |
| Unified API (Nylas/Aurinko/OneCal) | **不採用**。外部依存 + コスト + ユーザー認証情報を第三者へ送信 = privacy 方針/「外部連携は慎重」に反する | onecal.io |

出典:
- [onecal: How to integrate iCloud Calendar API](https://www.onecal.io/blog/how-to-integrate-icloud-calendar-api-into-your-app)
- [Aurinko: Demystifying CalDAV (Apple)](https://www.aurinko.io/blog/caldav-apple-calendar-integration/)
- [Apple Developer: CalDAV](https://developer.apple.com/documentation/devicemanagement/caldav)
- [RFC 4791 (CalDAV)](https://datatracker.ietf.org/doc/html/rfc4791)
- [Apple Support: Share a calendar on iCloud.com](https://support.apple.com/guide/icloud/share-a-calendar-mm6b1a9479/icloud)

---

## §2. スコープ表（公開URLで十分 vs native が本当に要る）

| ユーザー状況 / 要件 | Tier 1: Public Calendar → Track A | Tier 2: native CalDAV |
|---|---|---|
| カレンダーを公開してよい | ✅ 十分（実装ゼロ） | （過剰） |
| 非公開のまま取り込みたい | ❌ 不可 | ✅ 必要 |
| 複数 / 全カレンダーをまとめて | △ URL を複数貼る手間 | ✅ 列挙して選択 |
| 認証情報を渡したくない | ✅ URL のみ・認証情報不要 | ❌ app-specific PW 必須 |
| セットアップの軽さ | ○ iCloud.com で公開→URLコピー | △ appleid.apple.com で PW 発行→email+PW 入力 |
| 信頼コスト（第二の自己観点） | 低（URL だけ） | **高（Apple 認証情報を預ける）** |

**判断軸**: 「この機能はユーザーの第二の自己として必要か」。Tier 1 は信頼コストが低く今すぐ価値を出せる。Tier 2 は「非公開 / 全カレンダーを Apple 純正のまま」という明確な需要が確認できてからで、プロダクト整合上も妥当。

---

## §3. Tier 2 native CalDAV 設計法案（シンプル版・③④）

### 3.1 認証 + 保存方針 — **one-shot 無保存**（革新点・⑦/④）

- 現状の取り込みは **手動ボタン**（背景同期ではない）。よって CalDAV も **「Apple ID email + app-specific password を受け取り → 1 回の discovery+fetch に使い → 取り込み後に破棄（DB 保存しない）」** で成立する。
- **なぜ無保存が正解か**: app-specific password は OAuth refresh token と性質が違う。OAuth は第三者保管前提で scoped・revocable に設計されているが、app-specific password は **iCloud サービス群への広い権限**を持ち、第三者保管を想定した代物ではない。手動取り込みモデルなら保存不要 → **最も危険な「Apple 認証情報の保管」を消せる**。
- 再取り込み = 再入力（MVP では許容）。将来 background sync を入れる段で初めて、暗号化保管（既存 `tokenCrypto` の AES-256-GCM 流用）を再検討する。**Phase 2 は read-only / 手動 / 無保存に限定。**
- Google/Outlook（`user_calendar_connections` に refresh_token 暗号保管）とは **接続モデルが異なる**点を UI/データ両面で明確化する。

### 3.2 protocol（read-only サブセット）

1. PROPFIND `/`（Basic auth）→ `current-user-principal`。
2. PROPFIND `[principal]` → `calendar-home-set`（**partition host 取得**）。
3. PROPFIND `[home-set]`（partition host）→ calendar collection 列挙。`supported-calendar-component-set` で **VEVENT 対応 calendar のみ**採用（reminders/tasks 除外）。
4. 各 calendar に REPORT `calendar-query` + `time-range`（取得窓 = 既存 Google/Outlook と同: 過去30/未来90日）→ VEVENT 群。
5. VEVENT を **既存 `icsParser.ts` / `icsToAnchorMapper.ts` に流す**。

### 3.3 流用範囲（新規実装を最小化・外科的）

| レイヤー | 流用 / 新規 | 既存資産 |
|---|---|---|
| iCalendar parse | ♻️ **流用** | `lib/plan/ics/icsParser.ts`（`parseIcsString` / `icalTimeToIso` zone-aware → **⑤ TZ は parser 層で既に解決**: TZID/Z→JST） |
| draft 変換 | ♻️ 流用 | `lib/plan/ics/icsToAnchorMapper.ts` |
| dedup | ♻️ 流用 | externalUid（VEVENT の iCalUID）完全一致 |
| 永続化 | ♻️ 流用 | `createSourceWithAnchors`（sourceType = 新 `'apple_calendar'`） |
| source_type union | 🔧 追記3箇所 | `external-anchor-source.ts` / `-source-input.ts` / `external-anchor-input.ts`（microsoft_calendar と同様、TB-1 と同型） |
| migration | 🆕 新規 draft | `..._track_b_apple_calendar_source_type.sql`（TB-1 mirror、CHECK に 'apple_calendar' 追加） |
| UI modal | 🔧 追記 | `IcsImportModal.tsx` に Apple セクション（**ただし form 型**、後述） |
| **CalDAV client** | 🆕 **唯一の本質的新規** | 無し（discovery + PROPFIND/REPORT XML + Basic auth + host partition） |
| import action | 🆕 新規 | `importAppleAnchors.ts`（one-shot、無保存、DI 結線） |

→ **真に新しいのは CalDAV client モジュールと auth form のみ。** 残り（parse/map/dedup/persist/TZ）は Outlook/ICS と完全共有。

### 3.4 SSRF / セキュリティ方針（Track A より厳格に狭い）

- **host allowlist**: `caldav.icloud.com` + `*-caldav.icloud.com`（partition）のみ許可。Track A は任意 URL 許可（ゆえに重い SSRF guard）だが、CalDAV は **固定 host 族**なので allowlist で十分かつ安全。
- partition host（calendar-home-set の href）は iCloud 認証済応答由来だが、**`*.icloud.com` suffix を必ず検証**してから follow（応答汚染への二重防御）。
- app-specific password は **絶対にログ出力しない**（TB-5 で debug ログを毎回 revert した規律を継承）。エラーログは reason コードのみ。
- 本番は **https 必須**（form POST でパスワードが server に渡るため）。dev localhost は http 許容だが smoke 限定。
- 無保存ゆえ「漏洩面」は import 実行中のメモリ上のみ（DB に残らない）。

### 3.5 dep 判断（CEO 確認事項）

- **選択肢 A: 最小ハンドロール** — fetch + 小さな XML パース（DAV:/CALDAV: namespace）で read-only サブセットのみ実装。新 dep ゼロ、DI/test 文化に合う、コード量中。
- **選択肢 B: `tsdav`**（保守された CalDAV/CardDAV JS client）— コード減、ただし新 dep の vet（依存ツリー・保守状況・ライセンス）が必要。
- **推奨**: read-only サブセットは PROPFIND ×3 + REPORT ×N と小さいので **A（最小ハンドロール）を第一候補**。ただし XML パースの堅牢性次第で B も可。AC-0 で実際の iCloud 応答 XML を見てから確定。

---

## §4. UI 入口（⑤）

- `IcsImportModal.tsx` に **Apple セクションを additive 追加**（Google/Outlook と並ぶ第三の主導線）。既存 2 経路は非破壊。
- **OAuth と決定的に違う点**: redirect ではなく **その場の form**。
  - 入力: Apple ID email + app-specific password（16桁）。
  - **信頼コピー必須**: なぜ必要か / 「取り込みに1回だけ使い、保存しません」/ appleid.apple.com の app-specific password 発行手順への導線。
  - 送信 → `importAppleAnchorsAction(email, appPassword)` → 進捗 →「✅ N 件 取り込みました」（既存 submitted 状態を流用）。
- Tier 1 案内（公開カレンダー URL でも取り込めます）を Apple セクション内に併記し、軽い方へ誘導。

---

## §5. 難所（リスク）リスト

1. **CalDAV XML protocol**: PROPFIND/REPORT のリクエスト body + namespaced 応答パース。Node に WebDAV 標準クライアント無し（dep 判断 §3.5）。
2. **host partition**: `caldav.icloud.com` → `pNN-caldav.icloud.com` の追従 + suffix 検証。誤ると 0 件 or 認証失敗。
3. **app-specific password の UX/信頼**: 「Apple のパスワードを渡す」心理障壁。コピー設計が UX 成否を分ける。誤って通常 Apple PW を入れると 401。
4. **認証エラー種別**: wrong password / 通常PW混入 / アカウントロック / 2FA 不整合 / calendar 無し → ユーザー向け文言マッピング（OAuth の reason 設計を踏襲）。
5. **複数 calendar の扱い**: 全 VEVENT calendar を取り込むか、選択 UI を出すか。MVP は「全 VEVENT calendar をまとめて取り込み + dedup」で start、選択は後段。
6. **component-set フィルタ**: reminders/tasks calendar を除外（VEVENT 対応のみ）。
7. **password 非ログ / https**: server action でパスワードを transient 利用、ログ厳禁、本番 https。
8. **テスト**: CalDAV client は fetch 注入 DI → PROPFIND/REPORT の XML fixture でユニットテスト（Google/MS と同手法、実 iCloud 不要）。
9. **TZ 再確認**: iCloud VEVENT は TZID（例 Asia/Tokyo）or Z。既存 `icalTimeToIso` が両対応済だが、iCloud 特有の VTIMEZONE 表現を fixture で 1 件固定して確認（Track A の 21:00→12:00 教訓の再発防止）。

---

## §6. 実装フェーズ案（各 stop point 付き・着手は CEO gate）

> 既存トラック（ICS/Google/Outlook）の進め方を踏襲: **test 先閉じ / tsc baseline 不変 / atomic commit / 各フェーズ間で stop**。

- **AC-0**: 実 iCloud CalDAV の応答 XML を 1 アカウントで採取（手動 curl 等、CEO 環境）→ discovery/REPORT の実フォーマット確定 + dep 判断（ハンドロール vs tsdav）。**migration draft**（`apple_calendar` source_type、未 apply）。→ stop。
- **AC-1**: CalDAV client モジュール（`lib/oauth/appleCalDavClient.ts` 仮）— discovery 3-step + REPORT time-range、fetch DI、pure、**XML fixture でユニットテスト**。host allowlist + suffix 検証込み。→ stop。
- **AC-2**: source_type union 3 箇所 + mapper に `apple_calendar` 追加。iCloud VEVENT fixture で `icsParser`→draft の TZ/all-day/recurring を固定（既存 mapper 流用確認）。→ stop。
- **AC-3**: `importAppleAnchorsAction`（email + app password → client → parse → map → dedup → persist、**無保存**、DI 結線）+ pure helper のユニットテスト。→ stop。
- **AC-4**: `IcsImportModal` に Apple form セクション（信頼コピー + appleid 導線、additive 非破壊）。→ stop。
- **AC-5**: staging smoke（CEO、実 Apple ID + app-specific password。one-shot 無保存・TZ・dedup 確認）。→ stop / 判定。
- 各 AC で「既存 Google/Outlook/ICS 非破壊」「tsc baseline 不変」を不変条件とする。

---

## §7. 今回の stop

- 本書 = **readiness のみ**。実装（AC-0 以降）には入らない。
- branch `feat/track-b-apple-caldav` に本 doc を commit して停止。
- **CEO 判断待ち**:
  1. **スコープ**: Tier 1 即時案内のみで当面足りるか / Tier 2 native CalDAV に着手するか（着手なら AC-0 から）。
  2. dep 方針（ハンドロール vs tsdav）は AC-0 で実 XML を見てからでも可。
  3. one-shot 無保存の方針（§3.1）承認可否。
- push/PR/remote は GitHub 復旧後に別判断（現状 local 作業のみ）。
