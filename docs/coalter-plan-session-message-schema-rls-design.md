# /plan CoAlter session message — schema / RLS design（docs-only）

**作成日**: 2026-06-13
**ステータス**: **docs-only**。実装・DB 変更・migration・Supabase client・persistence・route・send・realtime・read receipt・runtime 抽出・Plan Intelligence 投影は **含まない**（各 GO 待ち）。
**正本前提**: [coalter-ui-track-closeout-persistence-preflight.md](coalter-ui-track-closeout-persistence-preflight.md) §2 / [coalterSessionMessageRepository.ts](../app/(culcept)/plan/tabs/coalter/coalterSessionMessageRepository.ts)（pure 契約・型は本設計と整合）。
**grounded against**: `supabase/migrations/20260415100000_coalter.sql`（legacy /talk-coupled CoAlter）。

> ⚠ **この文書は設計であって migration ではない**。以下の SQL 風スケッチは **shape の説明用**であり、列・型・制約・index・命名・default は **migration draft（別 GO）で確定**する。本書はどのファイルにも DDL を流さない。
>
> ⚠ **CEO note 反映**: `ServerStampedAuthorContext`（TS）は **境界の型であって最終的なセキュリティ機構ではない**。実 send/persistence は本書の RLS + DB 制約 + server-side `auth.getUser()` + server-stamped author_user_id + membership 検査で多層に担保する（型だけに依存しない）。

---

## §0 なぜ新スキーマか（legacy を backing にしない・grounded）

| | legacy `coalter_*`（thread/pair-rooted） | 新 `plan_coalter_*`（participant/session-rooted） |
|---|---|---|
| root | `coalter_pair_states.thread_id NOT NULL UNIQUE`（thread が consent の root） | **session + participant membership**（thread は root でない） |
| membership | `user_a`/`user_b` 2 列固定（**2 名厳密・solo 不可**） | `plan_coalter_session_participants` 行（**1〜N・solo 可**） |
| message author | `role IN ('user_a','user_b','coalter')` | `author_kind ∈ {participant,coalter}` + `author_user_id`（role enum でない） |
| message body | `content TEXT` + **`metadata JSONB`**（projection が混ざりうる） | **`body TEXT` 共有のみ**・projection は**別テーブル**（M5 境界） |
| thread | `thread_id NOT NULL`（必須・root） | `attached_thread_id` **nullable・optional bridge のみ** |
| RLS 述語 | session→`coalter_pair_states` join → `auth.uid() IN (user_a,user_b)` | session→`plan_coalter_session_participants` の EXISTS（pair/thread 非依存） |

⇒ legacy `coalter_sessions`/`coalter_messages`/`talk_messages` を backing にすると **session が /talk thread に再 root**され（contract v0.1 = participant-rooted の方針に逆行＝legacy /talk takeover）、かつ **2 名固定・solo 不可・metadata に projection 混入**を継承する。よって **新 4 テーブル（additive・legacy 不変更）**。

---

## §1 提案テーブル（high-level）

1. `plan_coalter_sessions` — session 本体（誰と誰がいつのプランを組むか）
2. `plan_coalter_session_participants` — 参加者 membership 正本（**RLS の核**）
3. `plan_coalter_session_messages` — 共有 session message（chat body の正本）
4. `plan_coalter_session_read_cursors` —（optional・後/opt-in）per-user 既読カーソル
5. `plan_coalter_session_projections` —（optional・**過度に規定しない**）per-viewer projection の置き場（M5・別 GO）

---

## §2 各テーブル設計

### §2.1 `plan_coalter_sessions`
- **purpose**: 1 プラン session = 1 行。binding（mode/window/stage/optional thread bridge）。
- **core columns（shape・確定でない）**:
  ```
  id                 UUID PK default gen_random_uuid()
  mode               TEXT NOT NULL CHECK (mode IN (...CoAlterPlanMode...))
  plan_window        JSONB NOT NULL          -- {date} | {start,end,nights} (CoAlterPlanWindow)。`window` は SQL 予約語のため plan_window
  stage              TEXT NOT NULL CHECK (stage IN ('understanding','curating','resolving','confirmed'))
  attached_thread_id UUID NULL               -- optional bridge only（§2.1 注）
  created_by         UUID NOT NULL REFERENCES auth.users(id)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
  ```
- **null/non-null**: `attached_thread_id` は **nullable 必須**（thread なしで session 成立）。mode/stage/created_by/created_at は non-null。
- **PK/FK**: PK=id。`created_by` → auth.users。
- **uniqueness**: id のみ（thread への UNIQUE は **付けない**＝legacy の `UNIQUE(thread_id)` を継承しない）。
- **threadId 可否**: **optional のみ**（`attached_thread_id` nullable・root でも consent でも identity 源でもない・/talk へ書き戻さない）。FK は付けない想定（/talk thread を所有しない・参照のみ。付けるなら別 GO で検討）。
- **pairStateId が root でない理由**: identity 正本は participants（§2.2）。pair state は legacy /talk consent 機構で thread-rooted。ここに pair_state_id を置くと session が再び thread/pair に縛られる。**列として持たない**。

### §2.2 `plan_coalter_session_participants`
- **purpose**: session の人間参加者 membership 正本。**RLS の核述語**。
- **core columns**:
  ```
  session_id   UUID NOT NULL REFERENCES plan_coalter_sessions(id) ON DELETE CASCADE
  user_id      UUID NOT NULL REFERENCES auth.users(id)
  source_kind  TEXT NOT NULL CHECK (source_kind IN ('self','talk_pair_member','culcept_relation','plan_session'))
  -- presentation（displayName/initial/tone）は DB に持たず参加者層が解決する案を推奨（§2.2 注）
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  ```
- **null/non-null**: 全 non-null。
- **PK/FK**: PK=`(session_id, user_id)`（複合・同一 session に同一 user 重複不可）。`session_id`→sessions、`user_id`→auth.users。
- **uniqueness**: `(session_id, user_id)` UNIQUE（= PK）。
- **threadId 可否**: **なし**（membership は thread 非依存）。
- **source_kind**: 参加者の identity 出自（adapter `ParticipantSourceRef` と整合）。**`fixture` は出自にしない**（既存不変）。`talk_pair_member` は authoritative `coalter_pair_states` 解決時のみ（本テーブルへ書く条件は別 GO）。
- 注（presentation）: displayName/initial/tone は **DB に正規化して持たない**のを推奨（raw userId/表示の二重管理回避・参加者層 C-1 relation が解決）。必要になれば後で列追加（additive）。
- 注（CoAlter）: **CoAlter は participant に入れない**（system actor）。本テーブルに coalter 行を作らない。

### §2.3 `plan_coalter_session_messages`
- **purpose**: 共有会話/イベントログの正本（chat body）。`CoAlterSessionMessage` の永続形。
- **core columns**:
  ```
  id               UUID PK default gen_random_uuid()
  session_id       UUID NOT NULL REFERENCES plan_coalter_sessions(id) ON DELETE CASCADE
  author_kind      TEXT NOT NULL CHECK (author_kind IN ('participant','coalter'))
  author_user_id   UUID NULL REFERENCES auth.users(id)   -- participant のみ・coalter は NULL
  kind             TEXT NOT NULL CHECK (kind IN ('chat','system_event'))
  visibility       TEXT NOT NULL DEFAULT 'shared' CHECK (visibility = 'shared')   -- §6
  body             TEXT NOT NULL                          -- 共有テキストのみ・projection を入れない
  client_message_id UUID NULL                             -- idempotency（§4）
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  CHECK (
    (author_kind = 'participant' AND author_user_id IS NOT NULL) OR
    (author_kind = 'coalter'      AND author_user_id IS NULL)
  )
  ```
- **null/non-null**: `author_user_id` は **nullable**（coalter=NULL・participant=NOT NULL を CHECK で連動）。`body`/`session_id`/`author_kind`/`kind`/`visibility`/`created_at` non-null。`client_message_id` nullable（system 経路は不要）。
- **PK/FK**: PK=id。`session_id`→sessions、`author_user_id`→auth.users。
- **uniqueness**: idempotency 用 **`UNIQUE(session_id, author_user_id, client_message_id)`**（participant の retry 重複防止・§4）。`author_user_id` NULL（coalter）は partial unique 対象外にする（NULL 複数許容）。
- **threadId 可否**: **なし**（message は session に属す・thread に属さない）。
- **projection 不在**: legacy `coalter_messages.metadata JSONB` を**継承しない**。private 条件/per-viewer rationale/抽出 slot/Plan Intelligence 投影は **本テーブルに列を作らない**（§6・別テーブル）。`visibility` は単一値 `'shared'` で型レベルの「message は共有」を DB でも固定。
- **pairStateId が root でない理由**: §2.1 と同じ。message も pair/thread に縛らない。

### §2.4 `plan_coalter_session_read_cursors`（optional・後/opt-in）
- **purpose**: per-user 既読位置。**/talk `read_at` を一切触らない**ための session 内独立カーソル。
- **core columns**:
  ```
  session_id           UUID NOT NULL REFERENCES plan_coalter_sessions(id) ON DELETE CASCADE
  user_id              UUID NOT NULL REFERENCES auth.users(id)
  last_read_message_id UUID NULL REFERENCES plan_coalter_session_messages(id)
  last_read_at         TIMESTAMPTZ NULL
  ```
- **PK**: `(session_id, user_id)`。
- 注: **本 slice では作らない**（read receipt は後/opt-in・§5）。設計として置き場のみ定義。

### §2.5 `plan_coalter_session_projections`（optional・過度に規定しない）
- **purpose**: per-viewer / private projection の置き場（M5）。**message body と分離**。
- shape は **finalize しない**（per-viewer payload の形が未確定・runtime 抽出/Plan Intelligence 投影が GO になってから）。最小の制約だけ明記:
  - 必ず `viewer_user_id` を持ち、**server-filtered**（client に全行を返さない・§6）。
  - message を参照するなら **id 参照のみ**（`CoAlterSessionMessageEvidenceRef`・content 複製しない）。
- **本 slice では作らない**。

---

## §3 RLS モデル

### §3.1 核述語: session membership
```sql
-- 「呼び出し元が当該 session の participant か」
EXISTS (
  SELECT 1 FROM plan_coalter_session_participants p
  WHERE p.session_id = <row>.session_id
    AND p.user_id = auth.uid()
)
```
- **`/talk` thread 参加者に依存しない**（thread_id を述語に使わない）。
- **`coalter_pair_states` に依存しない**（legacy pair join を使わない）。
- membership 正本は `plan_coalter_session_participants` のみ。

### §3.2 read policy（SELECT）
- `plan_coalter_sessions`: 自分が participant の session のみ（§2.2 を EXISTS join）。
- `plan_coalter_session_participants`: 自分が属す session の参加者行のみ。
- `plan_coalter_session_messages`: §3.1 の述語（session participant のみ）。
- → 共有 body は participant 全員に見える（M5 の per-viewer 差分は projection 側・§6）。

### §3.3 insert policy（INSERT・送信の DB 層担保）
- `plan_coalter_session_messages`（**participant 経路**）の WITH CHECK:
  ```sql
  author_kind = 'participant'
  AND author_user_id = auth.uid()          -- ★ server-stamped author = 呼び出し本人（client 詐称不可）
  AND EXISTS (membership predicate §3.1)    -- ★ 本人が participant
  ```
  ⇒ DB 層でも「**author_user_id は必ず auth.uid()**」を強制。client が他人の author を主張しても RLS が弾く（型 `ServerStampedAuthorContext` と二重）。
- **coalter（system）行は user-RLS の insert policy では作れない**（`author_user_id IS NULL` ≠ `auth.uid()`）。→ **system/CoAlter は別の server-only 経路**（service_role か `SECURITY DEFINER` 関数）で insert（§4）。**これは初の特権 runtime write になりうる＝CEO 判断事項**（人間 send 経路は user-RLS のまま service_role 非依存）。

### §3.4 update / delete policy（assumptions）
- **MVP は message を immutable**とする想定（編集/削除なし）→ UPDATE/DELETE policy は付けない（= 不許可）。
- reactions / read cursor は別経路（reactions の編集が要るなら別テーブル/別 policy・後 GO）。
- session の stage 遷移など `plan_coalter_sessions` の UPDATE は participant のみ（§3.1）に限定する想定（別 GO で確定）。

### §3.5 server route guard assumptions
- 実 send route（HOLD・将来）は RLS に**加えて**:
  - `auth.getUser()` で server-side に user を確定（client の主張を信用しない）。
  - `author_user_id = user.id` を server で stamp（draft からではない）。
  - membership を route でも先行チェック（fail-fast・RLS は最後の砦）。
- **RLS と route guard の二層**（どちらか一方に依存しない）。

### §3.6 なぜ client-only privacy filtering では不十分か
- client filter は **全行を一度 client に渡してから隠す**＝漏洩済み。RLS / server projection で **そもそも返さない**のが唯一の担保。
- per-viewer の出し分け（M5）は **server で filter**（§6）。client の表示制御は cosmetic にすぎない。

---

## §4 send / write モデル
1. **draft は author を持たない**（`CoAlterSessionMessageDraft = {kind:'chat', body}`）。
2. **server が auth user を author に stamp**（`author_user_id = auth.getUser().id`・RLS WITH CHECK で `= auth.uid()` を強制）。
3. **server が membership を検査**（route 先行 + RLS）。
4. **system/CoAlter は別の server-only 経路**（service_role / SECURITY DEFINER・`author_kind='coalter'`・`author_user_id IS NULL`）。human 経路から coalter を作れない・coalter 経路から human を詐称できない。
5. **idempotency / 重複防止**: client が `client_message_id`（UUID）を 1 送信 1 個生成 → `UNIQUE(session_id, author_user_id, client_message_id)` で retry/二重 tap を吸収（同一 id の 2 回目は no-op/既存返し）。server uuid（行 id）と createdAt は server 採番。
6. **failure semantics**:
   - membership なし → reject（`not_a_participant`・403 相当）。
   - session 不在 → reject（`session_not_found`・404 相当）。
   - body 空 → reject（`empty_body`・422 相当）。
   - 一意制約衝突（idempotency）→ **成功扱い**で既存 message を返す（重複生成しない）。
   - これらは pure 契約 `AppendRejectionReason`（repository）と 1:1。

---

## §5 read receipt / realtime
- **`/talk read_at` を一切 mutate しない**（/plan 閲覧は /talk に副作用ゼロ）。
- 既読が要るなら `plan_coalter_session_read_cursors`（§2.4・session 内・per-user）。**read receipt は後/opt-in**（自動既読禁止）。
- **realtime は session-scoped**: publication は `plan_coalter_session_messages`・購読は RLS（§3.1）で session participant に限定（postgres_changes は RLS 準拠）。**thread-scoped channel を使わない**（legacy は `coalter_sessions` を publish・別物）。
- realtime 自体は **persistence/send の意味論が確定してから**（HOLD）。
- **typing presence は scope 外**。

---

## §6 privacy / M5
1. **message body は shared**（共有会話/イベントのみ）。
2. **private / per-viewer projection は別テーブル**（§2.5・`viewer_user_id` 必須）。message に列を作らない。
3. **shared body に private rationale を書かない**（型 `body:string` は構造的に防ぐが、生成側が書かない運用 invariant も必要・将来 validator）。
4. **projection テーブルは server-filtered**（client に全 viewer 分を返さない）。
5. **thread context は display-only**・既定で extraction input にしない（使うなら別 GO + privacy review）。

---

## §7 migration safety
- **production apply なし**。local/staging も **別承認時のみ**。
- **additive のみ**: 新 4（+optional 1）テーブルの `CREATE TABLE IF NOT EXISTS` だけ。**legacy `coalter_sessions`/`coalter_messages`/`talk_messages` を ALTER/参照しない**（backing にしない）。
- **non-destructive**: DROP / 既存列変更 / data backfill なし。
- **rollback**: 未 consume（runtime 未配線）なら新テーブル DROP で完全 revert 可。
- **feature flag**: runtime 配線は `PLAN_ROUTE_LIVE` に加え **新しい persistence flag（default OFF）** でゲート。テーブルが存在しても consume されない＝footprint 0 で自然待機。
- GitHub suspended / production 不可の現状（local only）と整合。

---

## §8 推奨次実装オプション（本 docs-only の後・各 GO・**実 apply/send なし**）
1. **migration draft only**（新テーブルの `CREATE TABLE` + RLS policy を **migration ファイルに起こすだけ・apply しない**）。レビュー対象＝SQL。
2. **repository adapter skeleton（実 DB write なし）**: §1 の repository interface に対する DB-backed adapter の **型/形だけ**（実 Supabase 呼び出しは stub/未配線）。in-memory harness と同 interface。
3. **local SQL smoke design**: RLS 述語を local/staging で検証する **手順書**（apply は別承認）。
- **いずれも実 apply / 実 send を含まない**。実 apply・送信 route・realtime・read receipt は **それぞれ別の明示 GO**。

---

## §9 CEO 判断待ち
1. **system/CoAlter message の insert 経路**（service_role / SECURITY DEFINER）= 初の特権 runtime write になりうる。人間 send は user-RLS のまま service_role 非依存を維持する方針で良いか。
2. **presentation（displayName 等）を participants テーブルに持たせない**（参加者層が解決）案で良いか。
3. **message は MVP immutable**（UPDATE/DELETE policy なし）で良いか。
4. 次は **§8-1 migration draft（apply しない）** で良いか（or §8-2 adapter skeleton 先行）。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
