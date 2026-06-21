# CoAlter Brain ↔ New Session Bridge + Migration Gap 設計（docs-only）

> **設計フェーズ。コード/DB/migration/SQL/seed は触らない。** 実装は各段階で CEO 承認後。
> base: local main `bcf84157c` / branch: `claude/coalter-logic-resume-20260621`
> 原則: ①前提を疑う ②grounding（file:line）③シンプル→論理 ④外科的 ⑤ゴール逆算。

作成: 2026-06-21 / Build Unit / 承認待ち: CEO

---

## 0. 目的と中心問題

Legacy 系の脳 `runCoAlterPipeline`（thread/pair-rooted・2人固定・DB I/O 内蔵）と、New 系の
participant-rooted session/message system（solo/2人・clean RLS・脳なし）を**どう接続するか**、
そして New 系の **migration gap**（`20260613120000_plan_coalter_session_messages.sql` が main 不在）を
**どう解消するか**を決める。send/write/応答保存/projection/privacy の**実装順**を確定する。

**中心問題**: 脳は legacy 構造に深く結合しており（`supabase` client + `pairStateId` + `userAId` + `userBId` +
legacy `CoAlterSession` を要求し内部で DB 読込）、New session（participant-rooted・thread/pair なし）から
**そのままは呼べない**。この gap を安全な順序で埋める。

---

## 1. New session system の現在の構造（grounding）

| 部品 | 実体 | 状態 |
|---|---|---|
| sessions | `plan_coalter_sessions`（mode daily/travel・plan_window JSONB・stage・attached_thread_id nullable・created_by） | DDL は **main 不在**（§3）。app は参照する |
| participants | `plan_coalter_session_participants`（session_id, user_id, source_kind・PK(session_id,user_id)）＝**RLS の核** | 同上 |
| messages | `plan_coalter_session_messages`（id, session_id, author_kind{participant,coalter}, author_user_id, kind{chat,system_event}, visibility='shared', body, client_message_id, created_at） | 同上 |
| store | `app/(culcept)/plan/tabs/coalter/coalterSessionMessageStore.ts`（`listSessionMessages`/`appendParticipantMessage`） | ✅ main 在 |
| supabase port | `app/api/coalter/_lib/coalterSessionMessageSupabasePort.ts`（PARTICIPANTS/MESSAGES のみ query・participant insert・idempotency 23505→re-fetch） | ✅ main 在 |
| route | `app/api/coalter/sessions/[sessionId]/messages/route.ts`（GET=list・POST=send）→ `sendRouteHandler.ts` | ✅ main 在 |
| flags | `coalterReadMessages`(read)・`coalterSendMessages`(send)・`coalterDevSessionId`・server `PLAN_COALTER_READ_LOCAL`/`PLAN_COALTER_SEND_LOCAL` | ✅ main 在・**全 default OFF**（UX-5a-1） |

**gate（UX-5a-1）**: GET = `read ∨ send`（`sendRouteHandler.ts:56`）/ POST = `send` のみ（`:82`）。author は server stamp（`auth.uid()`）・client は author を出せない。

**特性**: participant-rooted（solo=1 可）・session-rooted（thread/pair_state を持たない）・author server-stamp・
`author_kind='coalter'` は **schema room のみ（insert 経路 HOLD）**・message immutable・read_cursor は deny。

---

## 2. Legacy system の現在の構造（grounding）

| 部品 | 実体 |
|---|---|
| 脳 | `runCoAlterPipeline(supabase, input: CoAlterInput, session: CoAlterSession, pairStateId, userAId, userBId, options?)` → `Promise<CoAlterOutput>`（`lib/coalter/engine.ts:15`）。5層 L1-L5 + `dispatchCoAlter`（decision/negotiate/clarify）+ LLM（orchestrator 内） |
| 出力 | `CoAlterOutput`（`types.ts:1254`）= `proposalCard: ProposalCard` + 任意 `card?: CoAlterCard`（3-mode discriminated union） |
| messages | `coalter_messages`（role user_a/user_b/coalter・metadata JSONB に proposalCard/card/routerTrace）。invoke が **運用 write 中**（`invoke/route.ts:196`） |
| pair | `coalter_pair_states`（thread-rooted・user_a/user_b 固定・consent state enabled 必須） |
| migrations | **14 本 main 在**（`20260415100000_coalter.sql` 他・§2 一覧）。脳の DB 依存はこちら |
| 起動 | `POST /api/coalter/invoke`（auth → pair_states by thread_id → participant 確認 → session insert → pipeline → coalter_messages insert） |

**脳の結合（重要）**: `runCoAlterPipeline` は **pure ではない**。引数に `supabase` client を取り、内部で
L1 profile load・L3 message fetch・fairness ledger・previous state を **DB から読む**。`pairStateId`/`userAId`/`userBId`
を要求し **2 人固定**（solo 非対応）。thread/pair_state 前提。

---

## 3. New 系 migration gap の正確な内容

- **app/lib が期待する table/column**:
  - `plan_coalter_session_participants`（session_id, user_id, source_kind）
  - `plan_coalter_session_messages`（id, session_id, author_kind, author_user_id, kind, visibility, body, client_message_id, created_at）
  - （port は `plan_coalter_sessions` を直接 query しない＝session 作成経路は別途。read_cursors/projections も未使用）
- **期待する policy**（RLS）: participant own-row select / session select member / message select member /
  **message insert = participant（author_user_id=auth.uid()）** / **coalter insert = deny（policy 未作成）** / message immutable / read_cursor deny。
- **main に存在しない migration**: `supabase/migrations/20260613120000_plan_coalter_session_messages.sql`（4 テーブル + RLS・全文既知）。
  UX-5a-1 は **path 単位統合**で app/lib + flag を取り込んだが、**migration（DDL）は対象外だった**ため gap が生じた。
- **復元 vs 新規作り直し**:
  - **復元を推奨**。当該 migration は practical-diffie で **local apply + RLS smoke 16/16 PASS** 済みの**実証済み資産**（byte 既知）。
    additive・legacy 不 ALTER/DROP・破壊なし。新規作り直しは smoke をやり直す無駄 + drift リスク。
  - 手順（C1・CEO gate）: 当該 file を main tree に**そのまま復元**（migration **追加は本フェーズ禁止**＝C1 で CEO 承認後）。
    その後の **staging apply は別 DB gate**（§9）。production は触らない。

---

## 4. Brain bridge 方針

**制約の核**: 脳は `supabase + pairStateId + userAId + userBId + legacy CoAlterSession` を要求し DB I/O 内蔵。
New session（participant-rooted・thread/pair なし・solo 可）から**直接は呼べない**。

### participant message → brain input への変換
New session の `plan_coalter_session_messages`（participant の body 列）を、脳が解析する会話列
（`ConversationTurn[]` = `{senderId, body, createdAt}`・`types.ts:262`）へ写す pure adapter を作る。
これは**純変換**（DB 不要・New messages → ConversationTurn[]）。

### brain output をどこに返すか（3 案）
| 案 | 内容 | 評価 |
|---|---|---|
| **A. full adapter** | New session から legacy 入力（pairStateId/userA/B/CoAlterSession）を**合成**して `runCoAlterPipeline` をフル起動 | ❌ 重い・危険。pairStateId は fairness ledger の key で**捏造不可**。solo で 2 人前提が破綻。DB 結合をそのまま引き込む |
| **B. pure core 抽出 → preview**（**推奨初手**） | 脳の **DB 非依存な決定論部分**（`conversationParser` の解析・`dispatchCoAlter` の mode router・proposal の骨格）を抽出し、New session の ConversationTurn[] に対して **preview 応答**を生成（**保存しない**） | ✅ 安全。DB/pair 結合を避ける・solo 可・preview のみ＝RLS HOLD を踏まない |
| **C. legacy 並行運用** | 脳は Legacy `/api/coalter/invoke`（thread 経路）のまま、New session は当面読むだけ | ⚠️ New に脳が来ない・2系統の溝が残る |

### 最初は保存せず preview 返却（推奨）
**B を初手**に採用。New session の participant 会話 → pure adapter → 脳の pure core → **CoAlter preview 応答を API レスポンスで返すだけ（DB 書込なし）**。これにより:
- coalter insert の RLS HOLD（§5）を**踏まない**
- LLM を使う部分は **flag 配下で後段**（preview は決定論部分から・段階制）
- solo/2人どちらも preview 可（pair 前提を持ち込まない）

### 保存する場合の最小安全条件（後段 C5）
保存は preview が安定し、§5 の RLS 設計が決まってから。最小条件:
- author_kind='coalter' の **insert 経路を user-RLS で安全に作れること**（§5）
- projection/privacy（§6）が先に在ること（raw 会話を相手に漏らさない）
- flag 多層（brain preview ∧ response persist ∧ server gate）＋ staging only

---

## 5. CoAlter response の保存方針

### user message と CoAlter message を同じ table に保存するか
**同じ `plan_coalter_session_messages` に保存**（schema は既に `author_kind ∈ {participant, coalter}` の room を持つ）。
分離 table は作らない（時系列の一体性・projection が同一 source を引ける）。

### CoAlter を system participant として扱うか
**扱わない**。CoAlter は `participants` 行に入れない（system actor）。messages 側で `author_kind='coalter'` +
`author_user_id IS NULL`（CHECK 連動）として表現する。これは現 schema 設計と一致。

### RLS でどう守るか / service_role・SECURITY DEFINER が要るか
現状: coalter insert policy は **意図的に未作成＝deny**（user-RLS では coalter 行を書けない）。選択肢:
| 経路 | service_role/DEFINER | 評価 |
|---|---|---|
| **a. user-RLS + 限定 INSERT policy** | **不要** | participant が**自 session に対して** coalter 行を insert する policy を、`author_kind='coalter' AND author_user_id IS NULL AND EXISTS(self が participant)` の WITH CHECK で作る。**応答生成を起動した本人の session に限り**書ける。service_role 不要で実現可能（**推奨・要 RLS 設計 smoke**） |
| b. SECURITY DEFINER 関数 | 必要（DEFINER） | system が任意 session に書ける。柔軟だが特権・監査面が重い |
| c. service_role | 必要 | 最も強い・最も危険。**本フェーズ禁止・採用しない** |

**方針**: **a（user-RLS 限定 policy）を第一候補**として設計（service_role/DEFINER を**不要にできる**見込み）。
ただし「participant が coalter 行を書ける」ことの濫用防止（任意本文の偽 coalter 投稿）を、
**サーバ側 handler が body を脳出力に固定**＋**flag 配下**で抑える。最終可否は C5 の RLS smoke で判定。
**本フェーズでは policy を実装しない（設計のみ）**。

---

## 6. Projection / privacy 方針

- **raw 会話を相手に漏らさない**: messages.body は `visibility='shared'`（共有テキスト）。**private 制約・個人 axes・
  脳の内部 signal は messages に入れない**。per-viewer の差分は **projection 層**（別 table・`plan_coalter_session_projections`・
  現 docs-only/M5）で表現する。message=共有・projection=viewer 別、を厳守。
- **viewer 別 projection / cue / summary**: 脳出力のうち相手に出してよいのは **cue/summary（中立 descriptor）**のみ。
  raw rationale（「B さんは朝が弱いから」等の非共有根拠）は projection で **viewer 自身にのみ**。
  既存 travel 側の `coalter-projection-consume.ts`（cue 化）と同じ「raw を出さず cue/summary」パターンを踏襲。
- **Travel / Plan Intelligence へ渡してよい情報境界**: 渡してよいのは **共有 message body + viewer-safe cue/summary** のみ。
  **private 制約・raw axes・脳内部 state は渡さない**。Plan Intelligence は projection 経由でのみ消費（message を直接読ませない）。

---

## 7. 推奨実装順

| 段階 | 内容 | 種別 | gate |
|---|---|---|---|
| **C0** | 本設計書（docs-only） | docs | CEO 承認（本報告） |
| **C1** | **migration gap 解消**: `20260613120000` を main tree に復元 + 構造 review（apply しない） | migration file 追加 | CEO migration-file gate |
| **C2** | **New session read smoke**: staging re-link + C1 を **staging apply** + seed → read-only 実 message 表示（UX-5a-2） | DB | CEO migration/staging/seed gate |
| **C3** | **send preview only**: participant send を **preview**（local echo / 非永続 or 永続は別）で確認・`PLAN_COALTER_SEND_LOCAL` は段階 | code（一部 DB） | CEO send gate |
| **C4** | **brain preview**（§4-B）: New 会話 → pure adapter → 脳 pure core → **preview 応答返却（保存なし）**・flag 配下 | code（DB なし） | CEO brain-preview gate |
| **C5** | **response persistence**（§5-a）: coalter insert の user-RLS 限定 policy 設計 + RLS smoke → 応答を messages に保存 | migration + DB | CEO RLS/persist gate |
| **C6** | **projection**（§6）: per-viewer projection table + privacy 二層 → Plan Intelligence 接続 | migration + code | CEO projection gate |

★ C1→C2 は DB gate を跨ぐため、**code-only で進めるのは C0（本書）と C4 の一部（pure adapter + 脳 pure core 抽出）**。
C4 の pure 部分は DB 不要なので C1/C2 の前に**先行着工可能**（fixture 会話で preview を作れる）。

---

## 8. flag 設計（全 default OFF・多層 AND）

| flag | env | 層 | 役割 | 既存/新規 |
|---|---|---|---|---|
| read | `NEXT_PUBLIC_PLAN_COALTER_READ_MESSAGES` / server `PLAN_COALTER_READ_LOCAL` | client+server | live read | ✅ 既存（UX-5a-1） |
| send | `NEXT_PUBLIC_PLAN_COALTER_SEND_MESSAGES` / server `PLAN_COALTER_SEND_LOCAL` | client+server | live send（write） | ✅ 既存 |
| **brain preview** | `PLAN_COALTER_BRAIN_PREVIEW`（server） | server | 脳 pure core で preview 応答（**保存しない**） | 🆕 C4 |
| **response persist** | `PLAN_COALTER_RESPONSE_PERSIST`（server） | server | coalter 応答を messages に保存（§5-a・send ∧ 本 flag ∧ RLS） | 🆕 C5 |
| **projection** | `PLAN_COALTER_PROJECTION`（server） | server | per-viewer projection 生成・Plan Intelligence 受け渡し | 🆕 C6 |

原則: capabilities を単一スイッチにしない（read/send/brain/persist/projection を独立 gate）。
brain preview は send/persist と**独立**（読むだけで preview 可）。persist は `send ∧ persist ∧ server gate` の AND。

---

## 9. DB gate（どこから migration/staging apply が必要か・production 禁止範囲）

- **code-only（DB 不要）**: C0（本書）・C4 の pure 部分（adapter + 脳 pure core 抽出・fixture preview）。
- **migration file 追加（CEO gate）**: C1（`20260613120000` 復元）・C5/C6（新 policy/projection migration）。
- **staging apply（CEO DB gate・staging re-link 必須）**: C2 以降の実 read/write/persist。
  ⚠️ **Supabase CLI は現在 production link 中**（`aljavfujeqcwnqryjmhl`）。**DB 作業前に staging `hjcrvndumgiovyfdacwc` へ re-link 必須**。
- **seed（CEO gate）**: C2 の read smoke 用 session+participants（session/participant INSERT policy は HOLD＝user-RLS で作れない→特権 seed は CEO 承認事項）。
- **production**: 全段階で **禁止**（apply/deploy/db push なし）。production 解禁は全 prerequisite 後の**別 CEO gate**。

---

## 10. 最初に実装してよい最小 scope 案

**C4-preview-core（code-only・DB ゼロ・保存なし）を初手に推奨**:
- New session messages → `ConversationTurn[]` への **pure adapter**（決定論・DB 不要）
- 脳の **DB 非依存決定論部分**（conversationParser 解析 / dispatch mode router の pure 部分）を抽出した **pure preview 関数**
- **fixture 会話**に対して CoAlter preview 応答を返す **dev preview**（flag `PLAN_COALTER_BRAIN_PREVIEW` default OFF）
- **保存しない・LLM 呼ばない・DB 触らない・New 系 migration 不要**（preview は messages を fixture 注入）

これにより「New session の会話に CoAlter が反応する」骨格を **DB gate を踏む前に** fixture で証明できる。
migration gap（C1）と staging（C2）は DB gate として**並行に CEO 承認**を取り、code-only の C4-preview-core が先に進む。

---

## 正本（source of truth）判断

- **New 系を session / message / identity の正本に据える**（participant-rooted・solo/2人・clean RLS・author server-stamp）。
- **Legacy 系は「脳ロジック + 既存知見」の source**として扱う（pure core を New に供給・DB 結合部は New 用に再設計）。
- Legacy `coalter_messages`/`coalter_pair_states`/invoke は**当面運用継続（並行期間）**。新規 write は段階的に New 系へ寄せる。
- 旧 `coalter_pair_states`（thread/2人固定）を **New の前提にしない**（T1A 注記と一致）。

---

## リスク

- **R1 脳の DB 結合**: full adapter（§4-A）は pairStateId 捏造不可・solo 破綻。→ preview core 抽出（§4-B）で回避。
- **R2 coalter insert 濫用**: user-RLS 限定 policy（§5-a）は「participant が coalter 行を書ける」ため、handler が body を脳出力に固定しないと偽投稿可能。→ server handler 固定 + flag + C5 smoke で判定。
- **R3 migration drift**: 復元 migration が現 staging/production schema と齟齬。→ staging apply 前に schema review（C1）。
- **R4 privacy 漏れ**: projection 未実装のまま脳を繋ぐと非共有根拠が相手に出る。→ projection（C6）を persist（C5）の前提にする順序厳守。
- **R5 production link 誤爆**: CLI が production link 中。→ DB 作業前 staging re-link 二重確認（§9）。
- **R6 2系統並行の溝**: Legacy/New 並行期間に二重書込・不整合。→ 正本を New に固定し新規 write を段階移行。
