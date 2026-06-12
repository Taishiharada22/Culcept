# TalkBridge-T1b-2 closeout + next-branch design（docs-only）

**作成日**: 2026-06-12
**ステータス**: docs-only。**実装なし**（CEO 指示: read-only identity フェーズを締め、send/realtime/既読/useCoAlter の前に最も安全な次分岐を決める）。
**親**: [coalter-plan-tab-talk-migration-design.md](coalter-plan-tab-talk-migration-design.md) §4 / [coalter-plan-tab-talkbridge-t1b-closeout.md](coalter-plan-tab-talkbridge-t1b-closeout.md)（T1b closeout）/ [coalter-plan-tab-backend-contract-draft.md](coalter-plan-tab-backend-contract-draft.md)（UI 契約）
**位置づけ**: TalkBridge の **read-only identity フェーズ（T1a→T1a訂正→T1b→T1b-2）の締め**。ここから先（send/realtime/既読/useCoAlter）は書き込み・相互作用フェーズで、**全て HOLD**。

---

## §1 T1b-2 closeout summary

### §1.1 commit
`ae749cc9` — feat(plan): TalkBridge-T1b-2 resolved participant metadata。
（系譜: T1a `311487e0` → 訂正 `ed152ccd` → T1b `0f09291a` → closeout `8832281c` → T1b-2 `ae749cc9`。）

### §1.2 identityState モデル（grounded・`coalterChatAdapter.ts`）
`source?` optional を **discriminated union** に置換:

| identityState | 意味 | source field | 生成元 |
|---|---|---|---|
| `"unresolved"` | 匿名 read-only preview（表示名も source も不明） | **なし** | `deriveAnonymousTalkParticipants`（T1b 匿名・enrich 失敗時の継続形） |
| `"display_resolved"` | 表示名は判明したが source 未確定 | **なし** | counterpart に displayName あり ∧ connectionId 欠落 |
| `"resolved"` | 正規 `CoAlterParticipantSource` を持つ | **必須** | fixture(`plan_session`) / counterpart(`culcept_relation`) / 自分側(`self`・後述) |

`CoAlterParticipantSource` = `self | talk_pair_member | culcept_relation | plan_session`（各 required field・TravelCore `ParticipantSourceRef` と 1:1）。

### §1.3 display / source 分離（双方向で実装・grounded）
- displayName あり ∧ connectionId なし → `display_resolved`（**source を捏造しない**）。
- displayName なし ∧ connectionId あり → `resolved` + `culcept_relation` だが**表示は匿名ラベル維持**（**名前を捏造しない**）。
- ⇒ 「名前が出せること」と「source が解決したこと」は独立に符号化される。

### §1.4 capabilities state（enrich 後も不変・grounded）
talk_thread adapter は `{ read: "live", send: "none", realtime: false, readReceipts: false, coalterInvoke: false }`。metadata 解決は participant の identity を加点するだけで capability を一切変えない。`getViewer()` は依然 `null`（read-only に send 主体を作らない）。

### §1.5 fail-closed 挙動
metadata 取得（既存 `GET /api/talk/threads` 1 回・dedupe）が失敗/threadId 不掲載/counterpart.userId 欠落/invalid/network 例外のいずれでも、live messages 表示は **T1b の匿名のまま継続**（enrich は加点のみ・readState 不干渉・fake source なし）。messages 自体の fail-closed（401/403/404/empty/error → fixture + unavailable バッジ）は T1b と同じ。

### §1.6 guardrail（恒久化）
`/plan` の coalter フォルダに **service_role / supabase import / useCoAlter import / `/api/coalter` リテラル / 既読・typing URL リテラル**が存在しないことを **fs ベースの source guard テスト**で恒久検証。表示名解決は既存 `/api/talk/threads` route の**内部実装**（service_role）に read-only 依存するのみで、/plan 自身は admin client を持たない。

### §1.7 意図的に未実装
send / POST・PATCH・DELETE / read receipt / typing / Realtime / `useCoAlter` / `/api/coalter/*` / 新 API / migration / DB write / route 変更 / thread picker / **Plan Intelligence 投影** / 認証済み self（send authority）。

---

## §2 identity authority rules（最重要・CEO 2026-06-12 指摘の固定）

### §2.1 `resolved` は send を自動的に authorize しない
`identityState: "resolved"` は「表示・consume してよい解決済み identity」を意味するだけで、**書き込み権限を一切含意しない**。read-only view で `resolved` を表示することと、その participant として送信できることは別概念。

### §2.2 send authority は auth/session user 一致を要求する（inferred self を権限にしない）
- T1b-2 の `self` 解決規則 = 「**非 counterpart sender がちょうど 1 人**ならその 1 人を本人と演繹」。これは threads(自分参加 connection のみ)+messages(参加者 403 ガード)から `sender ∈ {自分, counterpart}` を導いた **best-effort な表示用推論**であり、**認証された事実ではない**。
- ⇒ **inferred self を送信権限にしてはならない**。send が来たとき（T1c）、送信主体は **server-side `supabase.auth.getUser()` から stamp** されなければならない（既存 messages POST route は既に `sender_id: user.id` をサーバで付与している＝この設計が正しい）。**client は sender を主張せず**、body だけを route に渡す。
- 規則化: **TalkBridge read-only 由来の `source: { kind: "self" }` は display claim であって authenticated identity ではない。あらゆる権限判断は self を session から再導出する。** read-only では self ラベルが万一ズレても cosmetic bug に留まる（権限事故にならない）が、この不変条件があって初めてそれが保証される。

### §2.3 `talk_pair_member` は依然 authoritative `coalter_pair_states` 解決を要する
thread metadata からも message からも `talk_pair_member` は生成されない（T1b-2 でテスト固定済み・全ケース走査）。`talk_pair_member` を名乗れるのは `coalter_pair_states` の権威ある解決（consent-gated = M2-B 領域）があるときのみ。

### §2.4 `culcept_relation` は stable connection/relation id + userId を要する
`culcept_relation` は connectionId（genome_connections id）と userId が**両方**あるときのみ割り当てる。どちらか欠ければ source なし（display_resolved or unresolved）。relationId を捏造しない。

### §2.5 display name 単独では source を解決しない
表示名が取れても source は未確定たりうる（§1.3）。名前 → source の昇格は禁止。

---

## §3 next-branch comparison

| 分岐 | 種別 | 書込/相互作用 | 製品ビジョン適合 | リスク | この closeout 後に可か |
|---|---|---|---|---|---|
| **A. thread picker 設計のみ** | docs | なし | 低（「/plan chat = 選ぶ /talk thread」を前提化し legacy 仮定を焼く恐れ） | 低（docs） | 可だが**問いの立て方が疑わしい** |
| **B. CoAlterPlanSession binding 設計のみ** | docs | なし | **高**（契約「one session, two projections」の native。thread は backing store 化） | 低（docs） | **可・最有力** |
| **C. Culcept relation binding 設計のみ** | docs | なし | 中（既知ペアの identity 源。T1b-2 で `culcept_relation` 実証済） | 低（docs） | 可（B の identity 源として併走） |
| **D. read-only realtime preview** | impl | 購読（書込なし）だが channel 衝突・接続コスト | 低（send なしでは価値薄） | 中 | **HOLD**（CEO: no Realtime） |
| **E. send path** | impl | **書込**（/plan→/talk に message 出現） | 高だが前提多数 | 高 | **HOLD** |
| **F. read receipt** | impl | **書込**（相手に「既読」が見える） | — | **最悪（哲学的）** | **HOLD** |
| **G. useCoAlter 統合** | impl | 大（coalter_sessions Realtime・invoke・/api/coalter/*） | 中 | 高 | **HOLD** |

要点: **A/B/C は docs-only で HOLD ラインに触れない。D/E/F/G は全て T1c 以降の実装で HOLD 維持。**

---

## §4 recommendation

### §4.1 最も安全な次分岐 = **B（+ C 併走）: CoAlterPlanSession binding 設計のみ（docs）**
理由:
1. **docs-only でゼロリスク**（HOLD ラインに触れない）。
2. **全てをブロックしている本質的な未決**に答える: 「/plan CoAlter チャットは**何に bind**されるのか」。これが未定のままでは send も picker も realtime も時期尚早（thread を選ぶ UI を作っても、モデルが session-bound なら無駄になる／会話の identity が定まらなければ send できない）。
3. 製品 native モデル（one session, two projections）。thread は識別源でなく backing store になり、participants は `plan_session` source（fixture で既出）から来る。
4. **C を identity 源の片割れとして併走**: plan session の participant は identity 源を要し、grounded なのは `culcept_relation`（genome connection）。B（会話の器）+ C（参加者の出自）で 1 つの binding 設計。
5. **A（thread picker）は明示的に後回し**: 「選ぶ /talk thread」という問い自体が legacy 仮定を呼ぶ。binding モデル（B/C）確定後に、必要なら派生として設計する。

### §4.2 full T1c が HOLD のままである理由
- **send（E）**: §2.2 の session-authority と §4.3 の binding が未解決。client-inferred self を権限化できない。
- **realtime（D）**: send なしでは read-only view をライブ更新する価値がほぼなく、channel 衝突・接続コストだけ増える。
- **read receipt（F）**: §4.4。
- **useCoAlter（G）**: 823 行・CoAlter runtime・`/api/coalter/*` への広域結合。M2-B HOLD とも干渉。

### §4.3 send が許される前に真でなければならないこと
1. **session/thread binding 決定**: /plan message が**どの会話に属するか**が定義済み（plan session か /talk thread か両方か）。
2. **self = session authority**: send は server-side `auth.getUser()` から sender を stamp。client は sender を主張しない。inferred self は cosmetic のみ（§2.2）。
3. **cross-surface acceptance**: /plan 由来 message が **/talk に出現**（相手に通知されうる）ことの明示 CEO 承認。技術でなく product/consent 判断。
4. **idempotency**: 再送・二重 submit で重複 post しない。
5. **failure semantics**: POST 失敗時に message が黙って消えない／二重送信しない UX。

### §4.4 read receipt が特に危険な理由
- **見るだけ**で相手側 /talk の**永続状態（read_at / read cursor）を変える**＝相手が「既読」を見る。
- 不変条件「viewing in /plan must not change /talk state」に正面衝突。
- 相手が opt-in していない文脈（/plan を覗いた）で既読が伝わる驚き。
- ⇒ **自動既読は禁止**。やるとしても明示 opt-in の能動操作に限り、追加順序でも最後尾。

---

## §5 logic side（T2/T3）への handoff 含意

### §5.1 TalkBridge が今 T2/T3 に保証できること
- **read-only な participant / message view 契約**（`CoAlterChatParticipant`（identityState 付き）/ `CoAlterChatMessage`）が安定・source 正直。
- **identity は解決状態で型付け**: `resolved` は必ず実 `CoAlterParticipantSource`（4 kind の 1 つ・required field 完備）を持つ。`display_resolved` / `unresolved` は source を持たない。**silent な undefined-source は存在しない**。
- **捏造 identity なし**: `talk_pair_member` は権威 pair state なしに現れない／`culcept_relation` は必ず実 connection id を持つ／`self` は best-effort cosmetic で **authority ではない**（§2.2）。
- **provider/data-mode ⊥ participant source**（T2 が依拠する三直交分離の 2 軸）。
- **capabilities は read-only かつ独立 field**: T2/T3 は send/realtime 等が全 off であることを型で確認でき、書込能力の存在を仮定してはならない。

### §5.2 thread/session binding が解けるまで T2/T3 に提供できないもの
- **plan session ↔ 会話の対応**（binding 未確定）⇒ message **書込**・session スコープ永続化は不可。
- **認証済み self**（send authority）。T2/T3 は cosmetic self を acting user として扱ってはならない。
- **session を跨ぐ安定 participant identity**: read-only preview は thread 単位で都度解決。永続 participant registry はない。
- **per-viewer payload（契約 M5）**: 解決済み・認証済み identity を要し、read-only preview からは出せない。

### §5.3 runtime extraction / Plan Intelligence 投影は未着手
- TalkBridge は **表示のみ**を供給。slot/intent の runtime 抽出（T2 runtime・別 flag・OFF）は**しない**。
- 左 Plan Intelligence パネルへの**投影もしない**（T4 / 別 GO）。chat と plan 両パネルは独立のまま。T1b-2 は chat の participant identity だけを触った。
- **travel T2 への注記**: 本 `CoAlterParticipantSource` は TravelCore `ParticipantSourceRef` と 1:1。ただし TalkBridge が現に**産出する**のは `plan_session`(fixture) / `culcept_relation`(live counterpart) / `self`(cosmetic) のみで、`talk_pair_member` は産出しない。T2/T3 は `talk_pair_member` を「authoritative pair-state 解決経由のみ・TalkBridge は出さない」と扱うこと。

---

## §6 不変条件（この closeout が固定/再確認するルール）
1. `resolved` は表示・consume の許可であって **send authority ではない**。
2. send authority は **server-side auth/session user から導出**。inferred self を権限化しない。
3. `talk_pair_member` は authoritative `coalter_pair_states` 解決時のみ（message/metadata から不生成）。
4. `culcept_relation` は stable connection id + userId 必須。relationId 捏造禁止。
5. display name 単独で source を解決しない。
6. read receipt は自動で付けない（viewing in /plan ≠ marking read）。
7. capabilities は read-only・独立 field のまま。`/plan` に service_role を持ち込まない。
8. `/talk`・`ChatClient.tsx`・上部レイヤーは不接触。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
