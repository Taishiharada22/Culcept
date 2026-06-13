# CoAlter UI-track closeout + persistence/send preflight（docs-only）

**作成日**: 2026-06-12
**ステータス**: docs-only。**実装なし**（CEO 指示: CoAlter UI/contract トラックを締め、DB/migration/write/send の前に persistence/send 境界を定義）。
**親**: [coalter-plan-session-binding-design.md](coalter-plan-session-binding-design.md) / [coalter-session-message-closeout-thread-context-preflight.md](coalter-session-message-closeout-thread-context-preflight.md) / [coalter-session-body-closeout-t1b-retire-design.md](coalter-session-body-closeout-t1b-retire-design.md)
**レイヤ構造（CEO 確定 2026-06-12）**:
> header participants = relation/session participant 層 / main chat body = session message 層 /
> previous conversation = 分離 thread context 層 / Plan Intelligence = fixture/local projection 層 /
> send/persistence/realtime/read receipt/runtime extraction/useCoAlter = **HOLD**

---

## §1 UI-track closeout summary

### §1.1 commits（実装 + docs closeout）
| slice | commit | 種別 |
|---|---|---|
| B-1 session binding skeleton（contract v0.1） | `9ec8d4ac` | impl（型のみ） |
| C-1 relation metadata binding（read-only・genome-connections） | `78135fcf` | impl |
| C-1 closeout + message branch design | `f5b52473` | docs |
| session message skeleton（contract） | `75a21e23` | impl（型のみ） |
| session message closeout + thread context preflight | `aa3f4c91` | docs |
| TalkBridge-A thread context section（read-only・分離） | `ce534dd1` | impl |
| B session message body wiring（本文 session 化） | `167251c1` | impl |
| B closeout + T1b retire design | `ec1ad69f` | docs |
| legacy T1b chat-live retire/freeze | `a35ed7b2` | impl（cleanup） |

（基盤: TalkBridge-T1a `311487e0`→訂正 `ed152ccd` / T1b `0f09291a` / T1b-2 `ae749cc9` + 各 docs closeout）

### §1.2 final layer map（型/データ源）
| 層 | 描画/データ源 | 型 | 状態 |
|---|---|---|---|
| header participants | C-1 relationBinding(bound) or fixture session participants | `SessionParticipant` | bound 可・fail-closed |
| **main chat body** | `buildSessionMessagesFromFixture` + local echo | **`CoAlterSessionMessage`** | fixture data・author resolved/coalter のみ |
| previous conversation | `useCoAlterThreadContext`（relation→thread・別 card） | `CoAlterChatMessage`（匿名話者） | flag gated・read-only・fail-closed |
| Plan Intelligence | fixture/local state | fixture 型 | local 操作のみ・未接続 |
| send/local echo | `handleSend` → fixture 参加者 → ui.sentMessages | → session message | **local echo のみ**（実 send なし） |
| readState/capability badge | — | — | **撤去済み**（legacy retire・本文に live バッジなし） |

### §1.3 今 structurally 保証されていること
1. **本文は `CoAlterSessionMessage` のみ**（型）・**thread messages は本文に入らない**（別型・別 prop・render test）。
2. **本文 author は resolved participant か coalter のみ**（anonymous variant 不在＋`isResolvedSessionMessageAuthor`）。
3. **thread 話者は SessionParticipant にならない**（context は session 契約を import しない）。
4. **identity 源は C-1 relation のみ**（thread→identity 派生なし）・`talk_pair_member` は authoritative pair-state のみ。
5. **CoAlter は system author**（participants 非包含）。
6. **draft に author なし**（send は server stamp・client は sender 主張しない）。
7. **message body は plain text**（private/per-viewer/slot/投影を構造的に持てない）。
8. **relation 源は genome-connections のみ**（service_role 非依存・`/talk/threads` LIST 不使用・fs guard）。
9. **legacy T1b chat-live は本文経路から撤去**（wasted fetch なし・誤認 live バッジなし・freeze）。

### §1.4 fixture/local-only のまま
session message data（mock・永続化なし）/ Plan Intelligence 全 state / local echo / モード・調整・確定。

### §1.5 HOLD のまま
実 send・persistence store・realtime・read receipt・typing・runtime 抽出・useCoAlter・`/api/coalter/*`・M2-B-2・Plan Intelligence 投影・per-viewer server 担保。

---

## §2 persistence preflight

### §2.1 /plan は自前の session message store を必要とするか → **Yes**
（既定方針・[message branch design §5](coalter-plan-tab-c1-closeout-message-branch-design.md) で承認）。根拠: 既読/realtime/通知が /talk に構造的不波及・solo 対応・CoAlter 発話の保存先・M5 server 担保。

### §2.2 なぜ /talk thread を backing store にしないか（grounded）
- 既存 `coalter_sessions`（migration `20260415100000_coalter.sql`）は **thread-rooted**: `thread_id UUID NOT NULL` + `pair_state_id` FK（→ `coalter_pair_states` も `thread_id NOT NULL UNIQUE`・`thread_type CHECK 'talk'`）。
- 既存 `talk_messages` も **thread-rooted**（thread_id・sender_id・RLS = thread 参加者）。
- ⇒ これらを backing にすると **CoAlterPlanSession が /talk thread に再 root される**（contract v0.1 は participant-rooted・pairStateId 廃止の方針に逆行＝legacy /talk takeover の機構）。
- よって **新 store は participant/session-rooted の別物**。/talk thread は **optional context bridge のみ**（read-only・identity 源でも backing でもない）。

### §2.3 将来必要になりうる table/RLS（**high-level のみ・スキーマ確定でない**）
> ⚠ 以下は方向性メモ。**列・型・制約・命名・index は migration preflight（別 slice）で確定**。本書では規定しない。
- `plan_coalter_sessions`（id / mode / window / stage / attached_thread_ref nullable / created_at）— **thread_id を必須にしない**。
- `plan_coalter_session_participants`（session_id FK / user_id / source_kind ∈ {self,talk_pair_member,culcept_relation,plan_session}）— participant 正本。
- `plan_coalter_session_messages`（id / session_id FK / author_kind ∈ {participant,coalter} / author_user_id nullable / kind ∈ {chat,system_event} / body text / created_at）— **body は shared text のみ**（projection 列を持たない・§4）。
- **RLS**: session 参加者のみ（`plan_coalter_session_participants` の membership で判定・**thread/pair_states に依存しない**）。書き込みは server stamp（§3）。
- projection（private 条件・per-viewer rationale・抽出 slot）は **別 table**（message に混ぜない・§4）。

### §2.4 migration の前に決めるべきこと
1. session 作成の trigger/owner（誰がいつ session を作るか・consent §3.5 [binding design]）。
2. participant 正本の持ち方（join table vs array・source_kind の永続化粒度）。
3. message id 採番（server uuid）・順序（created_at + tiebreak）。
4. read 状態の持ち方（per-user read cursor を session store 側に持つ＝/talk 不波及・§5）。
5. M5 projection の table 分離設計（§4）。
6. solo session の表現（participants 1 名）。
7. canary/staging gating（production hard block・既存パターン踏襲）。

### §2.5 今は docs-only のまま
スキーマ確定 / migration / 実 DB / repository 実装 / write は **すべて別 GO**。次の実装候補は §6（pure interface + in-memory harness まで・実 DB なし）。

---

## §3 send authority model（不変・client から authority を取らない）
1. **draft に author なし**（`CoAlterSessionMessageDraft = {kind:"chat",body}`）。client は内容のみ送る。
2. **sender は server で認証 user から stamp**（route が `auth.getUser()` → author_user_id を付与）。既存 `talk_messages` POST が `sender_id: user.id` を server stamp する設計と同型。
3. **client は sender authority を提供しない**（inferred self は cosmetic・送信主体にしない・t1b2/C-1 規則）。
4. **participant membership は server-side で検査**（送信者が session participant か・RLS + route 二重）。
5. **CoAlter/system author は別ルール**（人間 send とは別経路・CoAlter 発話は system が生成・participants の主語にしない）。
- ⇒ send 実装の前提（§6 以降の GO）: §2 の store + 上記 authority。本書はルールを固定するのみ。

## §4 privacy / M5 boundary
1. **message body は shared**（会話/イベント内容のみ）。
2. **private/per-viewer projection は別構造**（private 条件・本人向け rationale・viewer 別 payload は message body に入れない＝型 + table 分離）。
3. **thread context は既定で extraction 入力にしない**（相手過去発言の解析は別 GO + privacy review）。
4. **Plan Intelligence 投影は server-side filtering 設計が前提**（per-viewer の出し分けは server で行う）。
5. **client-only の privacy filtering 禁止**（漏洩防止は server 担保・client filter は信頼しない）。

## §5 read receipt / realtime boundary
1. **read receipt は最後尾 or 明示 opt-in のみ**（自動既読禁止）。
2. **/plan で見ることが /talk を変えない**（read 状態は §2.4-4 の session-store 側 cursor で持ち、/talk read_at を触らない）。
3. **realtime は persistence/send の意味論が先**（何を購読するか＝session store の確定が前提）。channel は `plan-talk:*` でなく session channel に分離。
4. **typing presence はまだ**（send より後・相手への ephemeral 副作用）。

## §6 推奨次実装オプション（承認後・各 GO・**実 DB/send なし**）
推奨順（既存 skeleton パターン B-1/session message skeleton 踏襲）:
1. **pure repository interface/types only**（additive・型のみ）: `SessionMessageRepository`（list/append draft の interface）+ 入出力型。実装なし・DB なし・fetch なし。
2. **local in-memory repository test harness**（pure・テストのみ）: in-memory 実装で interface を満たし、append（server-stamp author を模した injection）・list・participant guard を unit test。**実 DB/migration/route なし**。
3. **docs-only schema/RLS design**（§2.3 を列・型・RLS まで具体化した別 docs）。
- これら 3 は **実 DB/migration/send を一切含まない**（型・pure・docs）。実 DB/migration/route/send は **それぞれ別の明示 GO**。

## §7 handoff（logic 側 T2/T3）
- 提供可: resolved participants（C-1）/ session message 契約（型・fixture data）/ thread context（表示専用・別層）。
- まだ仮定するな: session messages が永続/実会話であること・thread が extraction 入力であること・send/realtime の存在・projection の server 担保。
- runtime 抽出・Plan Intelligence 投影は未着手（各 GO）。

## §8 CEO 判断待ち
1. 次実装 = **§6-1+2（pure repository interface + in-memory harness）** で良いか（or §6-3 schema/RLS docs 先行）。
2. §2.1「/plan 自前 session message store（thread backing にしない）」の最終承認（方向は承認済み・実装 GO はまだ）。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
