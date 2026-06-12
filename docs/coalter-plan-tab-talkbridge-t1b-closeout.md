# TalkBridge-T1b closeout + read-only identity hardening（docs-only）

**作成日**: 2026-06-12
**ステータス**: docs-only。**実装なし**（CEO 指示: closeout + 識別境界の明文化を、send/realtime/既読 着手の前に行う）。
**親**: [coalter-plan-tab-talk-migration-design.md](coalter-plan-tab-talk-migration-design.md)（§4 段階計画）/ [coalter-plan-tab-backend-contract-draft.md](coalter-plan-tab-backend-contract-draft.md)（UI 契約）
**目的**: T1c（send / realtime / read receipt）に進む前に、**識別（identity）の境界**を固定する。read-only preview で許される妥協（匿名 A/B・`source?` optional）が、書き込み・相互作用フェーズに**暗黙の恒久モデルとして漏れ出さない**ための contract。

---

## §1 T1b closeout summary

### §1.1 commit
`0f09291a` — feat(plan): TalkBridge-T1b read-only live thread preview。
（前提: T1a `311487e0` + 契約訂正 `ed152ccd`。UI レイアウトは `cdcad393`。）

### §1.2 実装された read-only 挙動
- **解決 hook** `useCoAlterChatAdapter`（`app/(culcept)/plan/tabs/coalter/useCoAlterChatAdapter.ts`）が async を内包し、UI には同期 `CoAlterChatAdapter` + `readState`（`fixture | loading | live | unavailable`）だけを渡す。
- **gate**: `resolveLiveReadTarget({ liveEnabled, devThreadId })` — `NEXT_PUBLIC_PLAN_COALTER_CHAT_LIVE` ON ∧ `NEXT_PUBLIC_PLAN_COALTER_DEV_THREAD_ID` 非空のときのみ live read 対象を返す。どちらか欠ければ `null`（fixture・fetch 0）。
- **GET ちょうど 1 回**: `fetchTalkThreadMessagesOnce(threadId, fetchImpl)` が既存 `GET /api/talk/threads/[threadId]/messages` を 1 回読む。`readTalkThreadDeduped`（module-level in-flight map）で React StrictMode の dev 二重 mount でも 1 回に収束。解決後は map から削除（cache でもポーリングでもない）。
- **GET-only を型で担保**: `fetchImpl: (url: string) => Promise<Response>` は method/init/body を渡す口を持たない ⇒ **POST/PATCH/DELETE が構文上発行できない**。
- **写像（pure）**: `mapTalkMessagesToView` が `senderId → author` / body 空 + mediaUrl → 「（画像）」/ reaction type → 絵文字（`/talk` `GENOME_REACTIONS` と同値: resonance→∞ など）/ `createdAt` → `HH:mm`。`deriveAnonymousTalkParticipants` が sender 出現順に「メンバー A/B」（tone 交互）を生成。
- **adapter** `createTalkThreadReadonlyAdapter`: `provider = { kind: "talk_thread", threadId }`、`getViewer() = null`。

### §1.3 capabilities state（grounded・`coalterChatAdapter.ts`）
| adapter | read | send | realtime | readReceipts | coalterInvoke |
|---|---|---|---|---|---|
| fixture | `fixture` | `local_echo` | false | false | false |
| talk_thread（T1b） | `live` | **`none`** | false | false | false |

- `send: "none"` = **local echo も不可**（実 thread に偽メッセージを乗せない）。UI は入力欄を disabled にし「閲覧のみ（送信は次の段階で有効になります）」を表示。
- 各 capability は独立 field。flag は read-only gate であって、1 つで全機能を ON にする単一スイッチではない（T1a 訂正で型固定済み）。

### §1.4 fail-closed 挙動（grounded・`TalkThreadReadFailure`）
`unauthorized(401) / forbidden(403) / not_found(404) / http_error(その他) / empty(ok だが 0 件) / invalid_payload / network_error` の**すべて**で throw せず、hook は `readState = "unavailable"` を返し **fixture を表示し続ける**。UI は「ライブ読み込みは利用できません — サンプルを表示中」バッジ。CoAlter タブは壊れない。

### §1.5 意図的に未実装（deliberately unimplemented）
send / POST・PATCH・DELETE / read receipt / typing presence / Realtime 購読 / `useCoAlter` import / `/api/coalter/*` / 新 API / migration / DB write / service_role 配線 / **thread picker** / **Plan Intelligence 側への投影** / **sender 表示名の解決**。
（T1b は「1 GET で読み取り表示」に意図的に留めた。上記はすべて後続フェーズ・各 CEO GO。）

---

## §2 read-only identity hardening 設計

### §2.1 なぜ T1b で sender 表示名が未解決なのか（grounded）
- `GET /api/talk/threads/[threadId]/messages` のレスポンスは `senderId`（UUID）のみで、**表示名を含まない**（`route.ts` の enriched 形: id/senderId/body/createdAt/readAt/mediaUrl/reactions）。
- 表示名は `auth.users.user_metadata.display_name` にあり、**anon/user RLS では読めない**。`GET /api/talk/threads` は名前解決を行うが、その実装は **`SUPABASE_SERVICE_ROLE_KEY` の admin client（`admin.auth.admin.getUserById`）**に依存している。
- ⇒ T1b が選んだ「messages を 1 GET」境界の内側には、表示名は**構造的に存在しない**。名前を出すには別 GET（threads 一覧）か別経路が要り、それは T1b scope 外。だから匿名にした（推測で名前を捏造しない）。

### §2.2 なぜ匿名「メンバー A/B」は read-only preview 限定で許されるのか
- 匿名ラベルは **表示プレースホルダ**であって identity の主張ではない。read-only では「誰がどの発言をしたか」を位置・色で見分けられれば、吹き出し文法の描画検証には十分。
- しかし相互作用が入った瞬間に**実 identity が要る**:
  - send は「誰として送るか（self）」と「どの相手へ」を要求する。
  - read receipt / fairness ledger / per-viewer payload（契約 M5）は participant を**キー**にする。
  - @mention・consent・撤退判断はすべて identity を主語にする。
- 「メンバー A」は送信主体にも consent 主体にも fairness キーにもなれない。⇒ 匿名は**書き込み・相互作用の前に必ず解決へ置き換える** preview 専用の便宜。

### §2.3 なぜ `source?: CoAlterParticipantSource` は temporary なのか
- optional `source` は read-only preview の「identity 未解決」を**正直に**符号化したもの。
- だが optional な identity field は潜在的 footgun: 下流が `source === undefined` を安定状態として扱い始める／既定値で埋め始める恐れ（**CEO note #2 が指す危険そのもの**）。
- **hardening 規則**: `source` を optional にしてよいのは **read-only preview 経路のみ**。書き込み・相互作用しうる経路は **resolved な `source` を必須にする**。
- 将来の型分離（T1b-2 設計案・本書 §2.4）:
  ```ts
  type CoAlterChatParticipant =
    | { identityState: "unresolved"; id; name /*anon*/; initial; tone }      // read-only preview のみ
    | { identityState: "resolved";   id; name; initial; tone;
        source: CoAlterParticipantSource }                                   // 相互作用が要求
  ```
  `identityState` の discriminant で「未解決が暗黙の恒久状態になる」ことを型で防ぐ。相互作用コードは `identityState: "resolved"` を要求できる。

### §2.4 解決済み participant のあるべき姿
resolved participant は次を持つ:
1. 実表示名 + initial（**権威ある解決ステップ由来**: threads 一覧 / genome card / CoAlterPlanSession / Culcept relation のいずれか）。
2. 具体的な `source: CoAlterParticipantSource`（self / talk_pair_member / culcept_relation / plan_session のいずれか）+ 必須 field（userId 等）。
3. source は**解決ステップから導出**する。**メッセージから推論しない**。

### §2.5 thread sender を `talk_pair_member` に潰さない方法（重要）
- thread message の `senderId` が言うのは「ある talk thread で誰が発言したか」だけ。これは次を**意味しない**:
  - その人が /plan ユーザーの CoAlter **pair**である（thread は active な `coalter_pair_states` なしでも存在しうる）。
  - その関係が /plan の partner モデルである。
- **grounded な自然解決**: talk thread は `genome_connections`（requester_id / target_id）に紐づく（messages route も threads route も connection で参加判定）。⇒ thread の相手は本来 **`culcept_relation`（relationId = connection_id）**として解決されるべきで、**`talk_pair_member` ではない**。`talk_pair_member` は別途 `coalter_pair_states` の権威ある解決があるときだけ名乗れる（= M2-B consent-gated 領域）。
- **invariant（恒久ルール）**: `talk_pair_member` は **明示的・権威ある `coalter_pair_states` 解決があるときのみ**割り当てる。**thread にメッセージがある事実から導出してはならない**。T1b の匿名・source なしは既にこれを守っている。本書はこれを invariant として固定する。

### §2.6 TravelCore `ParticipantSourceRef` との整合
- TravelCore（`lib/shared/travel/core-types.ts`, `44c0a1f1`）の `ParticipantSourceRef` = `self | talk_pair_member | culcept_relation | plan_session`（各 required field）。`CoAlterParticipantSource` は 1:1 で写す。
- hardening 後も整合は保たれる: **resolved 時**、participant は上記 4 kind のちょうど 1 つを完全な field で持つ ⇒ TravelCore `ParticipantSourceRef` に**代入可能な値**を生む。
- preview 中の optional は **transport-state の譲歩**であって identity モデルの分岐ではない（resolved に至れば TravelCore と同一）。

---

## §3 thread resolution 設計オプション

| オプション | 何をするか | 解決される identity | status / 適性 |
|---|---|---|---|
| (a) dev threadId env 注入（現行） | `NEXT_PUBLIC_PLAN_COALTER_DEV_THREAD_ID` を 1 個固定 | なし（匿名のまま） | **dev/local 検証専用**。product thread-resolution strategy ではない（CEO note #4）。零 UI・決定論的だが単一固定。 |
| (b) thread picker（将来） | `GET /api/talk/threads` で一覧 → ユーザーが選ぶ | counterpart 名（threads route 経由＝**既存 service_role 解決を内包**） | **product surface 判断が要る**。「/plan chat = 選ぶ /talk thread」という心象モデルを前提化する危険。binding モデル確定まで保留。実装は別 GO。 |
| (c) CoAlterPlanSession participant binding（将来） | チャットを /talk thread でなく **plan session** に紐づける | `plan_session`（session.participants） | 契約「one session, two projections」と最整合。/plan CoAlter（2人専属プランナー）の本筋。thread は識別源でなく backing store になる。 |
| (d) Culcept relation binding（将来） | genome connection（既知ペア）に紐づける | `culcept_relation`（relationId = connection_id） | 「既知の二人」に自然。thread の自然解決（§2.5）とも一致。 |

### §3.1 旧 `/talk` pair を既定にする危険
- すべての /plan ペアが `coalter_pair_states` を持つわけではない。
- /talk thread は `genome_connections` に紐づく（pair ではない）。
- /plan の future partner モデルは**未決**（travel memory: 3 区別 = 旧 pair state / Culcept relation / 新 CoAlterPlanSession.participants）。pair を既定化すると、CEO が繰り返し警告してきた legacy 仮定を焼き込む。
- `coalter_pair_states` は M2-B consent-gated 領域 ⇒ 早期に引くと T1 が **HOLD 中の M2-B に結合**する。
- **結論**: thread sender → identity 解決は **`culcept_relation`（genome connection）を第一候補**にし、`talk_pair_member` は M2-B 権威解決があるときだけ。既定は pair ではない。

---

## §4 T1c リスク評価

各項目の「blast radius（相手側 /talk に見える副作用）」で評価:

| 項目 | 書き込み? | 相手側 /talk への副作用 | 結合先 | リスク |
|---|---|---|---|---|
| **read receipt** | yes（read_at） | **「既読」が相手に見える** | talk_messages 書込 | **最悪（哲学的に）**: /plan で**見るだけ**で /talk 状態が変わる。「viewing in /plan must not change /talk state」原則に正面衝突。自動既読は禁止、やるなら明示 opt-in のみ。 |
| **send** | yes（新 message） | /plan 由来メッセージが /talk に出現 | talk_messages 書込 + **resolved self 必須** + idempotency | 高: cross-surface 書込。送信主体の identity 解決が前提。 |
| **typing presence** | yes（ephemeral） | 「入力中」が相手に見える | Realtime presence publish | 中: send なしでは価値ゼロ。副作用は send UX に従属。 |
| **realtime（購読）** | no | なし（subscribe のみ） | channel 名衝突（`talk:{threadId}`）・接続コスト | **最低（書込なし）**: read-only re-fetch に留めれば相手側副作用ゼロ。要 namespace `plan-talk:{threadId}`。 |
| **useCoAlter** | yes（多数） | coalter_sessions / proposal 等 | 823 行 hook・coalter_sessions Realtime・invoke・plan shelf | 高: CoAlter runtime に広く結合。 |
| **`/api/coalter/*`** | yes（LLM/session/write） | proposal・session 状態 | CoAlter runtime・LLM・consent | **最高**: 実 backend 書込・LLM コスト・consent。最遠。 |

### §4.1 「最初にやるなら最も安全なのは」
- **正直な答え: T1c のどれも『次の最安全ステップ』ではない。** 最安全な次手は T1c の外＝**identity 解決（§5）**。send が来たとき実 sender がある状態を先に作るべき。
- どうしても T1c 内で選ぶなら順序: **realtime（read-only re-fetch・namespaced・送信/既読なし）** → send（idempotency + resolved self） → typing → read receipt（**自動禁止・明示 opt-in のみ**） → useCoAlter / `/api/coalter/*`（最後）。
- realtime-read-only は書込ゼロで最安全だが、send がない限り**ユーザー価値がほぼない**（read-only view をライブ更新する意味が薄い）。⇒ 価値とリスクの両面で「identity 解決が先」を支持する。

---

## §5 closeout 後に推奨する次スライス

**第一推奨: T1b-2 = resolved participant metadata（read-only）。** 理由:
1. **read-only のまま**（追加 GET は最小: thread→counterpart 解決）で、匿名 A/B と `source?` undefined の temporary 状態を**解消**できる。
2. CEO の本目的「send/realtime の前に境界を固める」に直接応える（identity を先に hardening）。
3. 下流をすべて unblock する: send は resolved `self` を要求、receipt/typing は resolved identity を要求、plan 投影は実 participant を要求。
4. §2.3 の型分離（`identityState: "unresolved" | "resolved"`）と §2.5 invariant（pair に潰さない）を**コードに落とす**最初の機会。ここで comment hardening（`source?` に「read-only preview 限定・相互作用前に resolved 必須」を明記）も同時に行う。

**T1b-2 が解く CEO 判断 1 点（要確認）**: 表示名の解決経路をどれにするか。
- 候補 A: 既存 `GET /api/talk/threads` を read-only 消費（/plan は新規 service_role を**足さない**が、その endpoint は**内部で service_role を使う**＝/plan の identity 解決がそれに依存する点は honest に要承認）。解決される source = **`culcept_relation`（connection_id）** + `self`。
- 候補 B: 名前解決を**しない**まま、source だけ `culcept_relation` に解決（counterpart の connection は threadId から判るが、名前は出さず「相手 / あなた」等の役割ラベルに留める）。service_role 依存ゼロ。
- いずれも **`talk_pair_member` を名乗らせない**（§2.5）。

**第二候補: thread picker は『設計のみ』**（§3 (b)/(c)/(d) の binding モデル決定）。ただし picker は product surface 判断であり、identity hardening より優先度は低い。**full T1c は推奨しない。**

---

## §6 不変条件（この closeout が固定するルール）
1. `talk_pair_member` は `coalter_pair_states` の権威解決があるときのみ。**thread message から推論しない。**
2. `source` optional は **read-only preview 経路限定**。書き込み・相互作用経路は resolved `source` 必須。
3. /plan の partner 既定を**旧 /talk pair にしない**。thread 相手の第一解決は `culcept_relation`。
4. read receipt は**自動で付けない**（viewing in /plan ≠ marking read in /talk）。
5. capabilities は独立 field のまま（単一 flag で全 ON にしない）。
6. `/talk`・`ChatClient.tsx`・上部レイヤーは不接触。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
