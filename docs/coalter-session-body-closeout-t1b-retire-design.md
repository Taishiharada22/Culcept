# B session-body closeout + legacy T1b thread-as-body retire/freeze 設計（docs-only）

**作成日**: 2026-06-12
**ステータス**: docs-only。**実装なし**（CEO 指示: session-body wiring フェーズを締め、旧 T1b thread-as-body が本文へ再侵入できないことを保証）。
**親**: [coalter-session-message-closeout-thread-context-preflight.md](coalter-session-message-closeout-thread-context-preflight.md) / [coalter-plan-tab-talk-migration-design.md](coalter-plan-tab-talk-migration-design.md) §4
**製品レイヤ構造（CEO 確定 2026-06-12）**:
> header participants = relation/session participant 層 / main chat body = session message 層 /
> previous conversation = 分離した thread context 層 / Plan Intelligence = まだ fixture/local projection 層

---

## §1 B closeout summary

### §1.1 commit / files
`167251c1` — feat(plan): B session message body wiring。
変更: `CoAlterTab.tsx`（本文を session message 化）/ `CoAlterChatPanel.tsx`（prop を CoAlterSessionMessage[]+SessionParticipant[] へ）/ `coalterSessionBodyWiring.test.tsx`（新規・renderToStaticMarkup 5）/ migration design §4。modified code 2 + test 1。

### §1.2 今 `CoAlterSessionMessage` から描画されるもの
- **メインチャット本文**: `buildSessionMessagesFromFixture(session)` + ローカル送信分（`toSessionMessageFromFixture`）。
- author 解決は `buildSessionParticipantsFromFixture`（**resolved SessionParticipant**・匿名なし）。author=human(userId)/coalter(system)。
- body=plain text・createdAt=表示時刻・reactions=共有。CoAlter は system author で表示。

### §1.3 fixture-only のまま残るもの
session message の data（fixture mock・永続化なし）/ Plan Intelligence 全 state（conditions/candidates/adjustments）/ local echo / モード・調整・確定。

### §1.4 未接続のまま残るもの
永続化 store / send（実送信）/ realtime / 既読 / runtime 抽出 / useCoAlter / Plan Intelligence 投影 / per-viewer server 担保。

---

## §2 現在のレイヤマップ（post-B）

| 層 | 描画/状態の source | 型 | 状態 |
|---|---|---|---|
| header participants | C-1 `relationBinding`（bound）or fixture session participants | `SessionParticipant` | bound 可・fail-closed fixture |
| **main session chat body** | `buildSessionMessagesFromFixture` + local echo | **`CoAlterSessionMessage`** | fixture data・author resolved/coalter のみ |
| previous conversation context | `useCoAlterThreadContext`（threadId 由来・別 card） | `CoAlterChatMessage`（匿名話者） | flag gated・read-only・fail-closed |
| Plan Intelligence panel | fixture/local state | fixture 型 | local 操作のみ |
| send / local echo | `handleSend` → `chatAdapter.getViewer()`（fixture viewer）→ ui.sentMessages | ChatMessageFixture→session message | **local echo のみ**（実 send なし） |
| readState / capability badge | `useCoAlterChatAdapter`（**legacy adapter**） | readState/sendMode | **§4 で要整理**（body は live でない） |

---

## §3 legacy T1b thread-as-body assessment（grounded）

### §3.1 thread messages が本文に再侵入できるか → **構造的に不可（型で封じ済み）**
- CoAlterChatPanel の本文 prop は **`sessionMessages: readonly CoAlterSessionMessage[]`**。thread messages は `CoAlterChatMessage[]`（author:string・別型）＝**代入不可**。
- CoAlterTab は本文を `buildSessionMessagesFromFixture` からのみ生成し、**`chatAdapter.getInitialMessages()` を本文に渡さない**（grep 確認: CoAlterTab は chatAdapter の `capabilities.send`/`getViewer`/`readState` のみ使用）。
- render test `coalterSessionBodyWiring` が「thread context messages は session message 配列に含まれない」を固定。
- ⇒ **thread messages は context section（CoAlterThreadContextSection・別 card）でしか描画されない**。

### §3.2 context section に **まだ必要**な T1b/T1b-2 資産（KEEP）
`fetchTalkThreadMessagesOnce` / `readTalkThreadDeduped` / `mapTalkMessagesToView` / `deriveAnonymousTalkParticipants` / `TalkThreadReadFailure` / view 型 `CoAlterChatMessage`・`CoAlterChatParticipant`。これらは `useCoAlterThreadContext`（TalkBridge-A）が使用。**残す**。

### §3.3 retire / freeze すべきもの
- **`createTalkThreadReadonlyAdapter` の body 役**: T1b の thread-as-body adapter。本文に使われなくなった。**freeze（legacy 印・本文経路から切離し）**。
- **`useCoAlterChatAdapter` の chat-live 分岐**: chat-live flag + devThreadId で thread messages を fetch し live adapter を作るが、その `getInitialMessages()` は **本文に消費されない＝wasted fetch**（§4.2）。**retire 候補**。
- **`coalterChatLive` flag + `coalterChatDevThreadId`**: body 役が消えた。**vestigial**（context 用 threadId は relation 由来＝別経路）。**rename/freeze 候補**。
- **CoAlterChatPanel の readState badge**: §4。

### §3.4 不変条件（保証済み）
thread messages は context section のみで描画される。これは **型（CoAlterSessionMessage 本文 prop）+ CoAlterTab の本文 source 限定 + render test** の三重で担保。

---

## §4 readState / capability boundary

### §4.1 readState は今どの層のものか → **legacy adapter 状態**
- `readState`（fixture/loading/live/unavailable）は `useCoAlterChatAdapter` が返す **T1b thread-as-body の読み込み状態**。
- B 後、**本文は session message（fixture・live でない）**。よって readState は **session body の状態ではない**。
- thread context の read-only 状態は context section が **自前のバッジ「読み取り専用」**で表示（§2）。よって readState は context section のものでもない。
- ⇒ readState は **legacy adapter（retire 対象）の状態**。

### §4.2 live thread read バッジが「本文が live」と誤認させる問題
- 現状: chat-live flag ON のとき `readState="live"` → CoAlterChatPanel が「ライブ閲覧中（読み取り専用）」を**本文の上**に表示。だが本文は fixture session message。**誤認**（本文が live だと示唆）。
- 加えて chat-live ON では useCoAlterChatAdapter が thread messages を fetch するが本文に使われない＝**wasted GET**（read-only・無害だが無駄）。
- いずれも **chat-live flag（default OFF）の dev 経路のみ**＝既定 UX は無影響。

### §4.3 推奨（将来 cleanup・本 slice では実装しない）
1. **CoAlterChatPanel から readState prop + badge を撤去**（本文は session・live state を持たない）。context section の read-only バッジは別途維持。
2. **useCoAlterChatAdapter の chat-live 分岐を retire/gate-off**（wasted fetch 停止）。本文は常に fixture session message・send=local_echo に固定。
3. **`createTalkThreadReadonlyAdapter` を legacy として freeze/rename**（context 用の read helpers は別に残す）。
4. `coalterChatLive`/`coalterChatDevThreadId` を deprecated 化（context は relation→thread の `coalterThreadContext` で代替済み）。

---

## §5 safety invariants（この closeout が固定）
1. **main body は `CoAlterSessionMessage` のみ受け取る**（型で固定・thread message 代入不可）。
2. **thread context は `sessionMessages` に入らない**（別 prop・別型・render test 固定）。
3. **thread 話者は `SessionParticipant` にならない**（context は匿名 view 型・session contract を import しない）。
4. **thread→identity/session 派生なし**（identity は C-1 relation のみ・thread から推論しない）。
5. **thread context は既定で extraction/projection 入力にしない**（使う場合は別 GO + privacy review）。
6. **send authority は client-inferred self から来ない**（draft に author なし・send は server stamp・HOLD）。

## §6 推奨次実装スライス（承認後・GO 別）

**推奨 = legacy T1b chat-live thread-as-body の retire/freeze（small cleanup・read-only）**＝§4.3 の 1-4。
- 内容: readState prop/badge 撤去・chat-live 分岐の wasted fetch 停止・`createTalkThreadReadonlyAdapter` の legacy freeze・chat-live flag deprecate。context section（TalkBridge-A）資産は不変。
- 効果: §3.3/§4.2 の wasted fetch + 誤認バッジを解消し、レイヤ構造（§2）を clean に確定（**session body contract closeout freeze を兼ねる**）。
- 安全: 新 fetch ゼロ（むしろ wasted fetch を削減）・本文/context/header 不変・送信なし。

代替: (b) session body contract **closeout freeze のみ**（docs + test 固定で凍結・コード触らず）。(c) **persistence preflight** は更に後（CEO: persistence まだ）。
推奨は (a)＝具体的な技術的負債（wasted fetch・誤認バッジ）を消すため。

## §7 handoff（logic 側 T2/T3）
- 提供できる: resolved participants（C-1）/ session message 契約（本文の型・fixture data）/ thread context（表示専用・別層）。
- まだ仮定するな: session messages が永続/実会話であること・thread が extraction 入力であること・send/realtime の存在。
- runtime 抽出・Plan Intelligence 投影は未着手（各 GO）。

## §8 CEO 判断待ち
1. 次実装 = **legacy T1b chat-live retire/freeze（§6-a）** で良いか（or 凍結のみ §6-b）。
2. readState badge 撤去 + chat-live flag deprecate の方針承認。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
