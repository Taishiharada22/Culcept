# B — Current-user Participant Binding / Participant Selector Minimal-scope Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。
> 上位文脈: A（richer render）完了後の次 phase。production-input→live UI トラックの participant を「実ユーザー」に。
> 既存基盤: `supabaseServer().auth.getUser()`（read・page.tsx:60-61）/ travel-live server action / `buildTravelSessionEventsFromFormData`。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算。

---

## 1. まず前提を疑う（①）

| 候補 | いま着手すべきか |
|---|---|
| **B. current-user participant binding**（本書） | **推奨・次**。現 panel は participant を **hardcode "P1"（偽）** で送っており、real plan に不誠実。authed user に束ねる小さな auth-read で「誠実な real 入力」になる。新 persistence/外部/production なし |
| C. safe links | **後**（confirmed destination は出せるが外部 gate・participant が偽のままでは時期尚早） |
| D. durable state | **後**（persistence gate） |
| F. M2 soft enrichment | **後**（M2 runtime gate） |
| G. CoAlter display | **後**（CoAlter runtime gate） |

**推奨: B 次。** 根拠（①⑤）: live panel が稼働した今、最小で「**participant を偽 'P1' から authed user へ**」が誠実さの土台。auth-read のみ（write/service_role/persistence/外部なし）でリスク最小。C/D/F/G は participant が実在してから/各 gate ゆえ後。

---

## 2. 現在の制約（§2）

- TravelLivePanel は permissioned field を送る。
- **participant selector は real でない**（panel が `<input type="hidden" name="participantId" value="P1">` を送信）。
- provider は `participantIds`（1-2・非空・unique）を要求。
- **user_id は FormData から読んではならない**。
- 現 server action は **auth を読まず**、`buildTravelSessionEventsFromFormData` が FormData の `participantId` を拾っている（＝client が identity を主張できる状態）。

---

## 3. B の安全 participant モデル（§3）

- **authed current user = participant 1**（`viewerId` = authed user id）。
- participant id は **server auth context のみ**から（`supabaseServer().auth.getUser()`）。
- **client は current user id を渡せない**（FormData participantId は identity として信用しない）。
- companion は **表示ラベル/intent のみ**（許可時）。**companion の実 identity は HOLD**（安全な relation/session source が無い限り）。
- **1-2 participant MVP**（B では実質 **solo = [authUserId]**）。
- **CoAlter pair state を仮定しない**・**M2-B-2 なし**・**`/talk` なし**。

---

## 4. server-side auth read（§4）

- 既存 read 範型を使う: `const supabase = await supabaseServer(); const { data: auth } = await supabase.auth.getUser();`（page.tsx 同型）。
- **read-only のみ**・**Supabase write なし**・**service_role なし**・**admin auth path なし**・**client-provided user_id なし**。
- **fail closed**: `!auth?.user` または `auth.user.is_anonymous` → 中立 `unavailable`（compute せず）。

---

## 5. FormData ルール（§5・participantId を識別 source から外す）

- **許可**: destination / date・dateRange / budget / pace / mobility / red_line / soft_preference / （companion count または placeholder は **明示的に安全な時のみ**）。
- **禁止**: `user_id` / **participantIds を authority として** / auth・session id / slot status / `TravelPlanEngineInput` / raw diagnostics / booking/calendar/action field。
- ★ **`buildTravelSessionEventsFromFormData` から `participantId` 読み取りを除去**（events-only にする）。participant は action が auth から注入。

---

## 6. provider interaction（§6）

- server action が **authed user id を `participantIds[0]` に注入**・**`viewerId` = authed user id**。
- companion 未解決 → **single participant のまま**（provider は 1-2 を許容＝solo OK）。
- `participantIds` は **1-2・unique**。
- 不正 participant 状態 → **fail closed**（invalid・provider 側）。
- **fake generic user を作らない**。

---

## 7. UI 含意（§7）

- current user を **raw id で表示しない**（copy は「あなた」）。
- panel の `hidden participantId="P1"` を**除去**（identity は server 注入）。
- companion UI は **最小 or HOLD**（B では出さない）。
- **invite/send/realtime/read receipt なし**・**CoAlter runtime なし**。

## 8. privacy（§8）

- auth user id は **server-side identity**（client へ raw を出さない・UI に raw userId を render しない）。
- companion 未解決状態は **private relation data を leak しない**。
- **client-only privacy filtering 禁止**。

---

## 9. 将来 test（§9・実装時）

- server action は **`user_id` を FormData から読まない**。
- server action は viewer/current participant を **server auth context から取得**。
- 未認証/anonymous → **fail closed**（unavailable）。
- **current user が `participantIds[0]`** になる。
- 重複 participant 棄却・**>2 participant 棄却**。
- **raw userId を UI に render しない**。
- **client は `participantIds` を override できない**（FormData participantId は無視）。
- **service_role import なし**・**Supabase write なし**・**DB/persistence なし**。
- **CoAlter/useCoAlter なし**・**`/talk` なし**・**send/realtime/read receipt なし**。
- **tsc baseline 不変（55）**・既存 travel tests green。
- ★ 注: 実装時、travel-live action の source-contract を更新（`supabaseServer` の **auth read を許可**・ただし write/service_role/from()/insert は引き続き禁止）。

---

## 10. 実装オプション + 推奨（§10・CEO 承認で着手）

| 案 | 内容 | 評価 |
|---|---|---|
| A. auth-read helper/types only | auth→participant の pure helper/型のみ | 単独だと未消費 |
| **B. server action が current user id を注入（UI 変更なし）** | action: auth read→`participantIds=[authUserId]`/`viewerId`・intake は events-only | ◎ 中核 |
| **C. 最小 UI ラベル「あなた」のみ** | panel から hidden P1 除去・「あなた」表示 | ◎ B と対で必要（偽 P1 を消す） |
| D. companion selector preflight | 後 | HOLD |

**推奨実装スライス: B（server inject）+ C（UI「あなた」）+ intake events-only 化 を 1 phase。**
- action: `supabaseServer().auth.getUser()` → 未認証/anonymous なら unavailable / それ以外 `participantIds=[user.id]`・`viewerId=user.id`。
- `buildTravelSessionEventsFromFormData`: **participantId 読み取りを除去**（events-only）。
- panel: **hidden participantId を除去**・「あなた」ラベル。companion は HOLD。
- **companion selector（D-option）は別 phase**（安全な relation/session source が要る）。

---

## 11. Stop
- 本書（B design）で**停止**。
- B 実装は **CEO 承認まで行わない**。

---

## 出力サマリ
- **前提（①）**: B 次が妥当（panel の偽 "P1" を authed user に束ねる誠実化・auth-read のみで低リスク・C/D/F/G は後）。
- **安全モデル**: authed user = participant 1（`viewerId`）・**identity は server auth context のみ**・client は user_id/participantIds を渡せない・companion は HOLD・solo MVP。
- **auth read**: `supabaseServer().auth.getUser()`（read-only・no write/service_role/admin）・未認証/anonymous は fail closed。
- **変更点**: intake helper を events-only 化（FormData participantId 除去）・action が auth participant 注入・panel は hidden P1 除去 +「あなた」。
- **推奨実装スライス**: **B(server inject) + C(UI「あなた」) + intake events-only** を 1 phase。companion selector は別 phase HOLD。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
