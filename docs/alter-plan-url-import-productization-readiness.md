# URL Import Productization readiness（取り込み体験の分かりやすさ向上）

- **対象**: ICS URL import（Track A）を「URL を知っている人だけの機能」から「誰でも取り込み完了まで辿り着ける体験」へ。
- **状態**: **readiness のみ（実装未着手）**。scope / 前提検証 / surgical 法案 / 決定事項 / stop point の整理。
- **branch**: `feat/plan-url-import-productization`（main 派生・独立トラック）。
- **背景**: Apple native CalDAV は deferred（公開URLでかなり被覆できるため）。代わりに URL import を磨けば Google/Outlook/Apple すべての「公開カレンダー」取り込みが一気に使いやすくなり、費用対効果が高い。
- **日付**: 2026-05-30。CEO 方針 ①〜⑦（前提を疑う / 自立リサーチ / シンプル法案 / 外科的 / 目標駆動 / 革新）。

---

## §0. 結論（先出し・前提検証の結果）

GPT 提案（サービス選択→ガイド→賢い判定→preview→人間向けエラー）を**実コードで検証**したところ、**一部はすでに実装済**だった。鵜呑みにせず、真の gap に絞る。

| GPT v1 項目 | 実態（grounded） | 判断 |
|---|---|---|
| preview を追加（取得テスト→件数→最新予定） | **既存**。URL flow も `buildIcsPreview` → 件数 / 各予定 check / 重複警告つき preview 状態（`IcsImportModal` の `handleUrlFetch`） | **不要**（既にある） |
| エラーを人間向けに | **既存**。`reasonToMessage` が 13 種を日本語化（URL形式 / https・webcal / 認証情報 / ポート / 内部アドレス / ホスト無し / リダイレクト / timeout / サイズ / iCalendar非該当 / サーバー応答 / 取得失敗） | **微補正のみ**（weak な所だけ） |
| サービス選択を先に | modal は既に Google/Outlook(OAuth) + file + URL の hub。ただし **URL は汎用1欄でサービス別ガイド無し** | **真の gap**（ただし下記補正） |
| URL取得ガイドをその場で | **無い**（placeholder と 1 行のみ） | **真の gap（最重要）** |
| 貼付内容を賢く判定（.ics 本文→ファイル誘導等） | **無い**。`BEGIN:VCALENDAR` 本文を貼ると `invalid_url`→「URLの形式が正しくありません」（正しいが不親切） | **真の gap** |

**→ surgical v1 = ①サービス別 URL 取得ガイド ②賢い貼付判定 ③エラー微補正。preview は再実装しない。full ウィザード再構築もしない（over-engineering 回避・④外科的）。**

**重要な前提補正（GPT との差）**: 「サービス選択を先に出す」を素直にやると、Google/Outlook ユーザーを**より難しい URL 経路**へ誘導してしまう（本来 OAuth ワンクリックが正解）。よって **OAuth ボタンは主役のまま据え置き、ガイドは「OAuth を使わない / Apple など公開URL で取り込む人」向けの補助**として設計する。これが「Apple も実質サポートしやすくなる」狙いと完全一致する。

---

## §1. 現状 inventory（実コード）

- **入口**: `app/(culcept)/plan/components/IcsImportModal.tsx`（idle view）
  - Google 接続（OAuth toggle + import）/ Outlook 接続（OAuth toggle + import）/ 「または」/ **.ics ファイル input** / **URL 副導線**（placeholder `https://… / webcal://…`、label「または公開カレンダーの URL から（Outlook / Apple / Google 等）」、ボタン「取り込む」）/ 手入力切替リンク。
- **URL flow**: `handleUrlFetch` → `fetchIcsFromUrlAction(url)` → `buildIcsPreview` → **preview 状態（既存・file と共通）** → 承認 → `importIcsAnchorsAction`（dedup 既存）。
- **取得 + 安全**: `lib/plan/ics/icsUrlFetch.ts`（`importIcsFromUrl` + SSRF guard `normalizeIcsUrl`/`isBlockedIp`、webcal→https、https限定、内部IP遮断、size/timeout、`not_calendar_body` 判定あり）。
- **エラー**: `reasonToMessage`（13 種、log 衛生で detail 非露出）。
- **欠けているもの**: (a) サービス別の「URL をどこで取るか」案内、(b) 貼付文字列の即時分類（特に .ics 本文の取り違え）、(c) 一部エラー文の行動喚起不足。

---

## §2. surgical v1 法案（③シンプル / ④外科的）

### U1. Smart paste classifier（pure client module + tests）— **革新の核**
- 新 pure module `lib/plan/ics/urlInputClassify.ts`（I/O 無し・deterministic・単体テスト可）。
- 入力文字列を即時分類（server 往復前・client で）:
  | 分類 | 判定 | UI feedback |
  |---|---|---|
  | `ics_body` | `BEGIN:VCALENDAR` で始まる | 「これは .ics ファイルの**中身**です。下のファイル取り込みを使ってください」+ **ファイル導線へ1タップ** |
  | `webcal` | `webcal://` | 「✓ 購読リンク形式（Apple 等）。取り込めます」 |
  | `https_ics_like` | `https://` かつ `.ics`/既知カレンダーhost（calendar.google.com / outlook.office365.com / *-caldav.icloud.com 等）を含む | 「✓ カレンダー URL のようです」 |
  | `https_page_guess` | `https://` だが上記に該当しない | 「公開カレンダー URL ではなく**ページ URL**かもしれません。取得を試せます」（soft warn・ブロックしない） |
  | `empty` / `garbage` | 空 / scheme 無し | ボタン無効 or 「URL を貼ってください」 |
- **advisory 原則**: classifier はユーザー補助のみ。**本当の安全ゲートは server の SSRF guard のまま**（classifier を信頼して通す/弾くをしない＝二重判定の事故防止）。`ics_body` だけは即ファイル誘導で server を呼ばない。
- 効果: 失敗 round-trip 削減 + その場で学べる（「貼った瞬間に賢く判定」を pure logic で実現）。

### U2. サービス別 URL 取得ガイド（inline accordion・静的）— **最重要 gap**
- URL 副導線の上に「**URL の取り方がわからない**」展開（案C）。タップで該当サービスの 3-4 手順をその場表示（外部 FAQ に飛ばさない＝「ユーザーに検索させない」）。
  - **Apple/iCloud**（最重要・native deferred の受け皿）: iCloud.com → カレンダー → 共有 → Public Calendar ON → webcal リンクをコピー。
  - **Google**: 設定と共有 → カレンダーの統合 → 「iCal 形式の限定公開 URL」or「公開 URL」をコピー。
  - **Outlook**: 設定 → カレンダーの共有 → 公開 → ICS リンクをコピー。
  - **その他**: 「公開/iCal/ICS リンク」を探す一般ヒント。
- 静的コンテンツ（pure 文言）。OAuth ボタン（Google/Outlook）は主役のまま、ガイドは補助として下段に。

### U3. エラーコピー微補正（weak な所のみ・外科的）
- `not_calendar_body`: 現「iCalendar 形式ではありませんでした」→「…。**ログインが必要なページ**や通常の Web ページかもしれません。公開カレンダーの URL かご確認ください」。
- `fetch_failed` / `http_error`: 行動喚起を 1 句追加（「公開設定になっているかご確認ください」）。
- 他は据え置き（既に十分）。**全面書き換えはしない。**

---

## §3. 革新（⑦）

1. **server 往復ゼロの即時判定**: classifier は client pure。貼った瞬間にフィードバック → 失敗体験を未然に防ぐ。特に `.ics 本文取り違え`（CEO 指摘の実例）を即座にファイル導線へ。
2. **「検索させない」ガイド内蔵**: 取り方を別ページに置かず modal 内 accordion で完結。Apple native を deferred にしても、**公開カレンダーガイドで Apple を実質サポート**（CEO 狙いの達成）。
3. **OAuth 主役・URL 補助の階層化**: サービス選択を素直に作らず、易しい経路（OAuth）を主役に残し、URL は「OAuth 非対応/非選択」の受け皿に位置づける（誤誘導を防ぐ設計判断）。

---

## §4. やらないこと（スコープ防衛）

- **full ウィザード再構築をしない**（modal は既に hub。URL 副導線の強化に留める）。
- **preview を再実装しない**（既存）。
- **OAuth（Google/Outlook）/ .ics ファイル経路を改変しない**（非破壊・additive のみ）。
- classifier を**安全ゲートにしない**（SSRF guard が本ゲート、classifier は advisory）。
- ガイド文言を**過剰メンテ対象にしない**（各プロバイダ UI 変化に追従しすぎない。簡潔・要点のみ + 「最新は各サービスのヘルプ参照」一文）。

---

## §5. 難所 / 決定事項（CEO 確認）

1. **classifier の分類カテゴリ**: 上記 5 分類で良いか（増やすと UX 複雑化）。既知カレンダー host の allowlist 文字列の範囲。
2. **ガイド対象サービス**: Apple / Google / Outlook / その他 の 4 つで良いか。文言の詳しさ（簡潔 vs 図解）。
3. **配置**: URL 副導線 上の inline accordion（案C）で良いか / 別の見せ方か。
4. **OAuth との関係**: 「OAuth ボタン主役・URL ガイド補助」の階層化に同意か（GPT の素直な service-first とは差をつける）。
5. **error 微補正の範囲**: 2 箇所（not_calendar_body / fetch系）に留めるか。

---

## §6. 実装フェーズ案（各 stop・着手は CEO gate）

> 既存トラック踏襲: **test 先閉じ / tsc baseline 不変 / additive 非破壊 / 各フェーズ間 stop / commit 前 self Playwright smoke**。

- **U1**: `urlInputClassify.ts`（pure module）+ 単体テスト（5 分類 + edge）。UI 未接続。→ stop。
- **U2**: ガイド静的コンテンツ module（`urlImportGuide.ts` 仮、サービス別手順データ）+ contract test。UI 未接続。→ stop。
- **U3-impl**: `IcsImportModal` の URL 副導線に classifier feedback + ガイド accordion を **additive 接続**（既存 file/OAuth 非破壊）。render contract test。→ stop。
- **U4**: error 微補正（`reasonToMessage` 2 箇所）+ 既存テスト更新。→ stop。
- **U5**: self Playwright smoke（貼付各ケース / ガイド展開 / .ics本文→ファイル誘導）→ CEO 判断。
- 各段で「既存 Google/Outlook/ICS file 非破壊」「tsc baseline 不変」を不変条件。

---

## §7. 今回の stop

- 本書 = **readiness のみ**。実装（U1 以降）には入らない。
- branch `feat/plan-url-import-productization` に本 doc を commit して停止。
- **CEO 判断待ち**: §5 の 5 決定（特に ①分類カテゴリ ④OAuth階層化）。GO なら U1（pure classifier + test）から開始。
- push/PR/remote は GitHub 復旧後に別判断（現状 local 作業のみ）。
