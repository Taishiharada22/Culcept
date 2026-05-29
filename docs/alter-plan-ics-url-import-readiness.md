# ICS URL Import Readiness — Track A: universal multi-provider (= 短く 1 枚)

起草日: 2026-05-29
親: マルチ provider カレンダー取り込み (= A→B、 CEO 確定 2026-05-29)
位置づけ: **Track A 先行**（= universal ICS URL）。 Track B（provider native）は後段個別。
CEO 確定: 2026-05-29 (= CEO + GPT 承認。 補強 = SSRF 2 項目明記 [#11 非標準ポート拒否 / #12 認証付き取得禁止] + UI は file 主 / URL 副)

---

## §0. Scope (= Track A 完成条件)

**A = ICS 購読 URL からの取り込み**。 server が URL を fetch → **既存 ICS pipeline (parse → map → dedup → save) に流す**。

対象（= 1 機能で横断カバー）:
- Outlook「カレンダーの公開」ICS URL
- Apple iCloud「公開カレンダー」webcal:// URL
- Google「iCal 形式の秘密アドレス」ICS URL
- Yahoo / 任意の CalDAV サーバの ICS export

**含まない (= 後段 / Track B / §7):**
- provider native OAuth（Outlook = Microsoft Graph）/ Apple CalDAV
- 非公開カレンダー（= 公開/秘密リンクで露出していないもの）
- 定期 sync（= cron / webhook）。 v1 は手動取り込み + 手動再取り込みのみ

---

## §1. 前提 (= P3 完成後の固定状態)

| 項目 | 値 |
|------|------|
| main HEAD | `946e3650`（= P3 完成 merge 着地済） |
| branch | `feat/ics-url-import`（= main 派生） |
| 再利用資産 | `lib/plan/ics/*`（parser/mapper/preview/helpers）、 `importIcsAnchorsAction`、 `IcsImportModal`、 `source_type='ics'` |
| linked ref / runtime | smoke は staging 必須（= completion-readiness §4-X 継承）。 production は触らない |

---

## §2. アーキテクチャ判断 (= ①前提を疑う / ③シンプル)

- ICS parser/mapper/save は **provider 非依存（RFC 5545）** → Outlook/Apple の **.ics ファイルは file upload で既に取り込める**。
- 不足は「**URL から .ics を取得**」する 1 step のみ。 fetch は **server-side 必須**（理由: ①browser はクロスオリジン ICS を CORS で fetch 不可 ②SSRF を server で制御する必要）。
- **file flow（既存）**: client が file 読込 → `parseIcsString` → `mapIcsEventsToDrafts` → preview → 承認 → `importIcsAnchorsAction(drafts)` で save。
- **URL flow（新規）**: client が URL を action に渡す → **server が SSRF-guarded fetch + parse + map** → drafts を client に返す → **既存 preview** → 承認 → **既存 `importIcsAnchorsAction(drafts)`** で save。

→ **新規実装は 3 点だけ**。 preview / dedup / save は既存丸ごと再利用:
1. SSRF-guarded fetch + URL 正規化（pure 検証 + fetch）
2. `fetchIcsFromUrlAction`（server action: fetch → parse → map → drafts 返却）
3. `IcsImportModal` に URL 入力 UI

---

## §3. SSRF 対策 (= CEO 最優先、 本 readiness の核)

ユーザー入力 URL を server が叩く以上、 **fail-closed** で内部到達を遮断する。 検証を通らない URL は **fetch しない**。

| # | 対策 | 詳細 |
|---|------|------|
| 1 | **https 限定** | scheme が `https` 以外（http / file / ftp / data / gopher 等）は reject |
| 2 | **webcal→https 変換** | `webcal://` を `https://` に rewrite（= webcal は事実上 https 配信の別名） |
| 3 | **userinfo 除去** | URL の `user:pass@` を reject or 除去（= 認証情報を載せない） |
| 4 | **private/internal IP 遮断** | hostname を DNS 解決 → **全解決 IP が public unicast** であることを検証。 reject: loopback `127/8`・`::1` / private `10/8`・`172.16/12`・`192.168/16`・`fc00::/7` / **link-local `169.254/16`（= cloud metadata `169.254.169.254` 含む、最重要）**・`fe80::/10` / その他 special（`0/8`・`100.64/10` CGNAT・multicast・reserved） |
| 5 | **redirect 再検証** | 自動 redirect 無効（`redirect: "manual"`）→ 各 hop の Location を #1-4 で**再検証**してから手動追従。 max redirect 数制限（= redirect-to-internal / DNS rebinding 緩和） |
| 6 | **timeout** | 10s（AbortController） |
| 7 | **size 上限** | 5MB（= stream 読みで超過 abort + Content-Length 事前チェック） |
| 8 | **content / body 妥当性** | content-type は `text/calendar` を期待（緩く許容）+ **body 先頭が `BEGIN:VCALENDAR`** を確認（= HTML エラーページ等を弾く） |
| 9 | **auth gate** | `fetchIcsFromUrlAction` は `getUser()` 必須（= 匿名による server fetch proxy 化を防止） |
| 10 | **log 衛生** | server log に URL 全体を出さない（= host のみ等）。 secret 漏れ防止 |
| 11 | **非標準ポート拒否**（= CEO 補強） | port は空（= 443 default）または `443` のみ許可。 それ以外（例 `:8080` / `:8443`）は reject（= 内部サービスポート叩き防止） |
| 12 | **認証付き取得禁止**（= CEO 補強） | fetch に credentials を一切付けない: cookie 送らない（`credentials: "omit"`）/ `Authorization`・bearer・custom auth header を付与しない / URL userinfo は #3 で reject。 **公開リソースのみ取得**（= 内部 API を user 資格で叩く経路を作らない） |

**IP 表記回避の潰し込み（= ④⑥⑦、 ナイーブ実装が破られる点）**: `127.0.0.1` を `2130706433`（10 進）/ `0x7f000001`（16 進）/ `0177.0.0.1`（8 進）/ `::ffff:127.0.0.1`（IPv4-mapped IPv6）で偽装する古典的 SSRF bypass を塞ぐ。 → WHATWG `new URL()` は IPv4 を canonical dotted-decimal へ正規化する性質を利用しつつ、 **IP literal は canonical 化して range 判定**、 **hostname は DNS 解決して全 IP を range 判定**、 **IPv4-mapped IPv6 は埋め込み IPv4 を抽出して再判定**する。

**正直な limitation（= §7 残課題）**: 完全な DNS rebinding 対策（= 解決 IP を pin して fetch）は Node fetch では難。 v1 は「解決 → 検証 → fetch + redirect manual 再検証」で実務上十分とし、 IP pin は後段。

---

## §4. 実装単位 (= 段階、 各段で validation + stop)

| 段 | 成果物 | 内容 |
|----|--------|------|
| **A-1** | `lib/plan/ics/icsUrlFetch.ts` | URL 正規化（webcal→https / userinfo 除去）+ SSRF 検証（scheme / host / IP range、 **pure 関数で単体 test**）+ fetch（timeout / size / content-type / redirect manual）→ `{ok:true, icsText} \| {ok:false, reason}` |
| **A-2** | `app/(culcept)/plan/_actions/fetchIcsFromUrl.ts` | server action: auth → A-1 fetch → `parseIcsString` → `mapIcsEventsToDrafts` → `{ok:true, drafts, warnings} \| {ok:false, error}` |
| **A-3** | `IcsImportModal.tsx` 改修 | **file import を主導線、 URL import を副導線**（= CEO 補強）。 URL 入力 + ボタン → A-2 → **既存 preview** に流す → 承認で既存 `importIcsAnchorsAction`。 視覚的に file を上位/既定、 URL は控えめな従配置 |
| **A-4** | 単体 test | A-1 の SSRF 判定を**網羅**（各 IP range / scheme / webcal 変換 / userinfo / redirect / size / content-type）+ A-2 を fetch mock で網羅 |

- **source**: `importIcsAnchorsAction` の `notes` を「ICS URL から取り込み」に出し分け（= provenance）。 `source_type='ics'` のまま。 **URL は v1 で永続化しない**（= 再取り込みは URL 再入力、 dedup で冪等）。

---

## §5. invariants

1. **`source_type='ics'` 再利用、 migration 追加なし**（= CEO 条件 3）。
2. **既存 file flow を壊さない**（= URL flow は追加経路、 既存 test 全 PASS 維持）。
3. **SSRF 検証 fail-closed**（= 検証 NG は fetch しない）。
4. 二重表示防止 = 既存 externalUid dedup + onSuccess 全 refetch（= P3 と同一）。
5. sync なし（= CEO 条件 4、 手動取り込み / 手動再取り込みで十分）。
6. production runtime 触らない / secret・URL を log/chat に出さない。

---

## §6. 検証 + stop point

1. 実装は A-1 → A-2 → A-3 の段階、 各段で **vitest + source tsc baseline（1114）不変 / 新規 error 0**。
2. **SSRF 負例 test を必須**（= `169.254.169.254` / `localhost` / private IP / `http://` / redirect-to-internal を **reject 確認**）。
3. **staging smoke は CEO 承認 gate**（= 実 Outlook / Apple / Google の ICS URL で取り込み）。 Claude は smoke 自体を実行しない。
4. 各段完了で停止 + 報告（= 自律で次段に進まない）。

---

## §7. 残課題 (= 後段 / Track B)

1. **DNS rebinding 完全 pin**（= 解決 IP 固定 fetch）。
2. **URL 永続化 + ワンクリック再取り込み**（= sync 前段。 v1 は URL 非永続）。
3. **定期 sync**（= cron / webhook）。
4. **Track B: provider native** — Outlook = Microsoft Graph OAuth（Google 相当のフルビルド、 外部連携 + API キー = CEO 承認）/ Apple = CalDAV（app-specific password、 OAuth 不可）。 **非公開カレンダー**はここで対応。

---

## §8. CEO 確認 stop point (= 承認済、 2026-05-29)

| 論点 | 判断 |
|------|------|
| readiness 承認 → A-1 着手 | **GO** |
| SSRF 設計（§3）十分性 | **概ね十分** + 補強 2 項目（#11 非標準ポート拒否 / #12 認証付き取得禁止） |
| `source_type='ics'` 再利用 + URL 非永続（v1） | **OK** |
| UI 配置 | IcsImportModal 同居、 **file 主 / URL 副** |

進め方（= CEO + GPT）: **A-1 → A-2 → A-3、 実装後いったん stop。 staging smoke は別承認。**

→ 各段で vitest + tsc baseline 不変を確認しつつ atomic commit。 A-3 まで実装したら停止・報告。
