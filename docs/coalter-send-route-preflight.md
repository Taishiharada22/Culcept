# CoAlter send-route preflight（docs-only・実装なし）

**作成日**: 2026-06-13 / **ステータス**: 設計のみ。**route 実装は HARD GATE（CEO GO 待ち）**。
**前提**: [schema/RLS design](coalter-plan-session-message-schema-rls-design.md)（local smoke 済）+ DB-backed adapter skeleton（`coalterSessionMessageStore.ts`・commit `35509852`）。

本書は「実 send/write route が将来どう載るか」を定義するだけ。下記の実装・実 fetch・DB write・`/api/coalter/*` 作成は**しない**。

## 1. route shape（案・未実装）
- `POST /api/coalter/sessions/:sessionId/messages`
- body: `{ body: string, clientMessageId?: string }` — **author を受け取らない**（draft 相当）。
- 成功 `201 { message: CoAlterSessionMessage }` / 冪等再送は `200`（既存 message 返し）。
- GET（read）は別 preflight。本書は participant の chat 送信のみ。

## 2. server auth（authority の唯一の源）
1. `const { data:{ user } } = await supabase.auth.getUser()` → 無ければ `401`。
2. `authorContext = stampServerAuthContext(user.id)`（**client 入力からは作らない**）。
3. adapter `appendParticipantMessage({ sessionId, draft:{kind:'chat',body}, authorContext, clientMessageId })` を呼ぶ。
   - route は user-RLS の Supabase client を使う（**service_role 非依存**＝CEO 方針）。port 具象は user-RLS client 上に実装。

## 3. membership check（二層）
- adapter が port 経由で membership を確認し非 member を `not_a_participant` に写像（fail-fast）。
- **最終ゲートは DB RLS**（insert WITH CHECK `author_user_id = auth.uid()` + participant EXISTS）。route/adapter の check はUX用で、RLS を信頼の最後の砦にする。

## 4. idempotency
- client が `clientMessageId`（UUID）を 1 送信 1 個生成。
- DB partial `UNIQUE(session_id, author_user_id, client_message_id)`。port は衝突時に既存行を返す（adapter は `deduped` を成功扱い）。
- ⇒ retry / 二重 tap / 二重 POST で message が重複しない。

## 5. failure semantics（AppendResult → HTTP）
| AppendResult | HTTP |
|---|---|
| `ok:true`（新規） | 201 |
| `ok:true`（idempotent 再送・deduped） | 200 |
| `session_not_found` | 404 |
| `not_a_participant` | 403 |
| `empty_body` | 422 |
| auth 失敗（route 前段） | 401 |
| RLS 拒否（adapter 想定外・最終ゲート） | 403 + 再生成なし（fail-closed） |

- body は plain text 共有のみ（route は private rationale/projection を書かせない）。

## 6. 明示的に **やらないこと**（HARD GATE / 別 GO）
- 実 route 実装・実 Supabase port 具象・実 DB write・`/api/coalter/*` 作成
- system/CoAlter write（service_role / SECURITY DEFINER 経路は未決）
- read receipt / realtime / typing / useCoAlter / Plan Intelligence projection / M2-B-2 / Travel runtime
- migration apply（local smoke 超え）・staging/production・push

## 7. 実装解禁の前提（route GO 時に揃える）
1. migration の local→staging apply（別 GO）。2. user-RLS port 具象（Supabase client）。3. clientMessageId 採番の client 規約。4. error→UI 文言。

→ 次の自律可能ステップはここまで（route 実装は CEO GO）。
