# session message skeleton closeout + thread context attach preflight（docs-only）

**作成日**: 2026-06-12
**ステータス**: docs-only。**実装なし**（CEO 指示: session message 契約フェーズを締め、optional `/talk` thread を「分離した文脈」として後で見せる方法を設計）。
**親**: [coalter-plan-tab-c1-closeout-message-branch-design.md](coalter-plan-tab-c1-closeout-message-branch-design.md)（§4 thread attach 制約 / §5 message model）/ [coalter-plan-session-binding-design.md](coalter-plan-session-binding-design.md)（B+C・`attachedThreadRef?`）/ [coalter-plan-tab-talkbridge-t1b2-closeout.md](coalter-plan-tab-talkbridge-t1b2-closeout.md)
**核**: thread message は **session chat body にならない**。optional な「これまでの会話」**文脈**として、本文とは別セクションで read-only 表示する。

---

## §1 session message skeleton closeout

### §1.1 commit / files
`75a21e23` — feat(plan): session message skeleton。
新規: `coalterSessionMessageContract.ts`（型/契約 + pure helpers + fixture mapper）/ `coalterSessionMessageContract.test.ts`（8 tests）。modified code 0（純 additive）。

### §1.2 message 契約が保証すること
1. **session-bound**: `CoAlterSessionMessage` は `sessionId` 属。正本は CoAlterPlanSession であって /talk thread ではない。**`threadId` を要求しない**。
2. **author は resolved human participant か `coalter` のみ**（`{kind:"participant",userId}` | `{kind:"coalter"}`）。**anonymous/unresolved variant が型に存在しない** ＋ `isResolvedSessionMessageAuthor` が未知 userId を弾く ＝「永続 message author は resolved participant か system」。
3. **draft に author なし**（`CoAlterSessionMessageDraft = {kind:"chat",body}`）。送信主体は send 時 server stamp（client は sender 主張しない・t1b2/C-1 self authority）。
4. **CoAlter は system author**（participants 非包含・B-1 `COALTER_SYSTEM_AUTHOR` 共有）。
5. **message ⊥ projection**: `body: string`（plain text）。private 条件・per-viewer rationale・抽出 slot・投影を **body に入れない**（型で構造的に不可）。visibility 常に `"shared"`。`EvidenceRef` は **projection→message の id 参照のみ**（content 非複製・逆向きなし）。
6. **thread message と別 shape**: `CoAlterChatMessage`（author:string・text）↔ `CoAlterSessionMessage`（author:object・body・sessionId）は代入不可（@ts-expect-error 固定）＝混同・複製を型で防ぐ。

### §1.3 型のみ / fixture-only / 未接続
- **型のみ**: 契約・helper・mapper（runtime send/persistence なし）。
- **fixture-only**: chat body（現状 fixture/adapter 経由で描画。session message 契約は consume 側未配線）。
- **未接続**: 永続化 store・send・realtime・既読・thread attach・条件抽出・Plan 投影。

### §1.4 ★運用 invariant（CEO important note の昇格）
`body: string` は projection field を**構造的に**防ぐが、**生成（将来の CoAlter 発話生成・ユーザー入力整形）が private rationale / private 制約を共有 message text に書き込むことは型では防げない**。
- **invariant**: message body は **共有の会話/イベント内容のみ**。private/per-viewer な材料（本人向け理由・private 条件・viewer 別要約）は **projection/condition 構造**に置く。**共有 body に private を“文章として”混ぜない**。
- これは send/生成フェーズの validator（将来）で機械的に検査する（本書はルールを固定するのみ）。

---

## §2 thread context attach preflight

### §2.1 再利用できる T1b/T1b-2 read-only 資産（すべて GET-only・fail-closed・実績あり）
| 資産（`coalterChatAdapter.ts` / `useCoAlterChatAdapter.ts`） | 役割 | 文脈セクションでの使い方 |
|---|---|---|
| `fetchTalkThreadMessagesOnce(threadId, fetchImpl)` | messages GET 1 回（POST/PATCH/DELETE 構文不可・401/403/404/empty/error fail-closed） | そのまま |
| `readTalkThreadDeduped` | in-flight dedupe（StrictMode 二重 mount でも 1 回） | そのまま |
| `mapTalkMessagesToView` | senderId→author / media placeholder / reaction 絵文字 / HH:mm | そのまま（**文脈セクションの表示**用） |
| `deriveAnonymousTalkParticipants` | 匿名「メンバー A/B」（identityState unresolved） | 文脈の話者ラベルに使用（**session 参加者にしない**・§2.4） |
| `createTalkThreadReadonlyAdapter` | capabilities `read:"live"/send:"none"/realtime:false/readReceipts:false/coalterInvoke:false` | そのまま（read-only 担保） |
| `CoAlterChatMessage` / `CoAlterChatReadState` | view 型・状態（fixture/loading/live/unavailable） | 文脈セクションの型/状態 |

→ **新規 fetch ロジックは不要**。既存 read-only preview を「別セクションに移設」するだけ。

### §2.2 `attachedThreadRef?` は将来 C-1 `genome-connections.threadId` から populate する（**Yes**・grounded）
- grounded: `GET /api/genome-connections` は **`threadId` を返す**（route 実装: accepted connection を `talk_threads` に **user-RLS** で引いて `threadId: threadMap[c.id] ?? null`）。**service_role 非依存**。
- ⇒ C-1 は既にこの payload を fetch 済み（`GenomeConnectionMetadata` で threadId を**意図的に無視**中）。将来 thread attach 時に **threadId を消費フィールドに加えて `attachedThreadRef` を populate** するだけ（additive・新 endpoint なし・新 fetch なし・**`/api/talk/threads` 不使用**）。
- これが **唯一許される populate 経路**: relation（accepted connection）→ その connection の thread。**relation→thread の一方向**。

### §2.3 なぜ relation→thread だけが許されるか
- thread は connection に従属する転送路（C-1/B+C で確定）。relation（accepted connection）が一次・thread は派生。
- relation→thread は「**この相手とのこれまでの会話**」を引くだけで、識別・session 構造に逆流しない。
- 逆（thread→relation/identity/session）を許すと thread が事実上の root に昇格し、legacy /talk takeover の柔らかい形になる。

### §2.4 なぜ thread→identity/session は禁止のままか
- thread の sender から participant identity を作らない（T1b-2 invariant）。文脈セクションの話者は **匿名/表示専用**で、**session.participants（C-1 の resolved identity）には絶対に昇格しない**。
- session の「誰が」は C-1（genome-connections の resolved culcept_relation + server self）が正本。thread 文脈はそこに**寄与しない**。
- thread message から `talk_pair_member` を作らない（既存 invariant 継続）。

### §2.5 なぜ thread picker を使わないか
- picker は「/plan CoAlter = thread を選んで見るもの」という legacy 心象を焼く。
- attach は **relation→thread 自動導出**（threadId は genome-connections 由来）。ユーザーが thread を「選ぶ」概念を出さない。語彙も「これまでの会話」（§3）。

---

## §3 視覚/構造の分離ルール（将来 UI の不変条件・本 slice は実装なし）
1. **session chat body と「これまでの会話」文脈は別セクション**（型・DOM・視覚すべてで分離）。
2. **thread messages を session message の吹き出しリストに混ぜない**（同一 bubble list に入れない）。
3. **thread messages を session messages に複製しない**（§1.2-6 の型非互換 + 運用で二重正本を禁止）。
4. **ラベルは「これまでの会話」or「過去の会話コンテキスト」**。「thread」「スレッド」をユーザー語彙に出さない。
5. 文脈セクションは **read-only バッジ**（T1b の「ライブ閲覧中（読み取り専用）」流儀）+ 入力欄を持たない（send 不可）。
6. **本 slice では UI 実装しない**（preflight のみ）。

### §3.1 T1b の placement 是正（設計メモ）
T1b は thread messages を**本文（main bubble list）に**置いた（read-only preview）。新方向では thread は**別セクション**。⇒ thread context section 実装時、T1b の thread-as-body 表示を **本文から文脈セクションへ relocate** し、本文は session 側（fixture or session message）に戻す。これは T1b の機能削減ではなく **配置の是正**（read-only・fail-closed は不変）。

---

## §4 安全制約（文脈 attach の不変条件）
- **GET-only**（fetchImpl `(url)=>Response` 形・既存資産）。
- **read-only**（capabilities read:"live"/send:"none" 維持）。
- **既読を付けない**（viewing in /plan ≠ marking read in /talk）。
- **write なし / send なし / Realtime なし**。
- **`/api/coalter/*` 不使用 / useCoAlter import なし**。
- threadId 源は **genome-connections のみ**（`/api/talk/threads` を relation/attach に使わない・C-1 確定）。messages 読みは既存 `/api/talk/threads/[id]/messages` GET（T1b と同一）。
- **fail-closed**: threadId 不在 / fetch 失敗 / empty → **文脈セクションを出さない**（no-context・本文は不変）。
- **thread から identity を推論しない**（§2.4）。

## §5 session message / projection 境界（再確認 + 拡張）
- message body は **shared**（§1.2-5）。private/per-viewer は projection が持つ。
- **thread 文脈は既定で extraction input にしない**: 「これまでの会話」を読んで条件/slot を抽出するのは **既定で行わない**（表示のみ）。
- 将来 thread 文脈を抽出入力に使う場合は **別の明示 GO + privacy review が必須**（相手の過去発言を解析対象にする＝同意・M5・最小開示の判断が要る）。本書はこの gate を固定。
- 抽出結果（条件/slot）は **projection/condition 構造**へ（message body にも thread message にも書き戻さない）。

## §6 推奨次実装スライス（承認後・GO 別）

両候補とも read-only・fixture/既存資産・no persistence。**推奨は A**（このフェーズの直接の続き）。

### A（推奨）= thread context section skeleton（read-only・視覚分離）
- 既存 T1b/T1b-2 資産を **新セクション「これまでの会話」** に移設（§2.1）。本文（session 側）と分離（§3）。
- `attachedThreadRef` を C-1 `genome-connections.threadId` から populate（§2.2・additive・新 fetch/endpoint なし）。
- T1b の thread-as-body を文脈セクションへ relocate（§3.1）。session body は fixture のまま（B 未着手）。
- 理由: thread-context 分離（CEO が今設計中のもの）を直接実装・read-only/additive・既存 GET-only fail-closed 資産の再配置のみで最小リスク。

### B（代替）= session message fixture-to-contract wiring
- chat 本文を `CoAlterSessionMessage`（fixture-mapped）から描画（contract を live body 源に昇格）。no fetch/persistence。
- 理由: 本文の正本を session message に確定してから文脈を「横に」付けたい場合の順序。ただし T1b の live-thread body 経路との coexistence 整理（§3.1）を内包し、A より rendering 変更が大きい。

### §6.1 どちらでも先に決める点（設計）
T1b の thread-as-body をどう扱うか（§3.1 relocate）。A は「本文 fixture + 文脈に thread」、B は「本文 session message + 文脈は後」。**A→B の順**（文脈分離を先に確立 → 本文を session message 化）を本書は推奨。

## §7 handoff（logic 側 T2/T3）
- 変わらず: **participants は信用してよい・session messages は型として信用してよい（が fixture data）・thread 文脈は extraction input ではない**。
- thread 文脈が将来出ても、それは **表示専用の別セクション**であり、T2/T3 の抽出対象・identity 源にしてはならない（§5 / §2.4）。
- runtime 抽出・Plan Intelligence 投影は未着手（各 GO）。

## §8 CEO 判断待ち
1. 次実装 = **A（thread context section skeleton）** で良いか（or B 先行）。
2. `attachedThreadRef` を genome-connections.threadId から populate する方針（§2.2）の承認。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
