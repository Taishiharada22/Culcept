# C3-preflight: participant send（既存 policy で participant message 書込）設計（docs-only）

> **preflight フェーズ。実装/POST/INSERT/migration/policy 追加はしない。** 実行は CEO gate 後。
> base: local main `bcf84157c` / branch: `claude/coalter-logic-resume-20260621`
> 前提（実機 PASS）: C2-a apply / C2-a-verify / C2-b dummy seed + RLS read smoke。
>   staging dummy session（`dddddddd-c2b0-…`）存在・participant read 可・非 participant read 不可・
>   **coalter insert policy はまだ無い（C5）**・read_cursors policy なし。
> 境界: production / 性格 / axis / Travel personalization 不触（plan_coalter_* のみ）。

作成: 2026-06-21 / Build Unit / 承認待ち: CEO

---

## 0. C3 の位置づけ

C2-b は participant message を **psql（postgres ロール・RLS bypass）で seed** して read を検証した。
C3 は **user-RLS の participant 書込経路**（既存 `message_insert_participant` policy）が
「participant が自 session に自分名義で書ける／他は書けない」を**実機で検証**する。
**新コード・新 policy・新 migration は不要**（既存実装の write 経路確認）。CoAlter 応答保存は C5（別）。

---

## 1. participant send の対象 route / server action

- **route**: `POST /api/coalter/sessions/[sessionId]/messages`（`app/api/coalter/sessions/[sessionId]/messages/route.ts`）
  → 薄い wrapper が `supabaseServer()`（user-RLS client）を `handleCoAlterSend` に注入。
- **handler**: `handleCoAlterSend`（`app/api/coalter/_lib/sendRouteHandler.ts`）。流れ:
  1. `planCoAlterSendLocalEnabled()`（`PLAN_COALTER_SEND_LOCAL`）OFF → **404**
  2. `supabase.auth.getUser()` → 未認証 **401**（authority の唯一の源）
  3. body parse → invalid は 400
  4. **FORBIDDEN_BODY_KEYS**（author/userId/source 等）を送れば **400 author_not_allowed**（client は author を主張不可）
  5. `body`（text）必須 → 無ければ 422
  6. `store.appendParticipantMessage({ draft:{kind:'chat',body}, authorContext: stampServerAuthContext(user.id), clientMessageId })`
- **store/port**: `coalterSessionMessageStore` → `coalterSessionMessageSupabasePort.insertParticipantMessageRow`。
- **client**: CoAlterTab `handleSendUnified` → `useCoAlterLiveSession.send` → `coalterLiveSessionClient.postLiveSessionMessageOnce`。

---

## 2. 既存 read flag / send flag の関係

| flag | env | 層 | 役割 |
|---|---|---|---|
| `coalterReadMessages` | `NEXT_PUBLIC_PLAN_COALTER_READ_MESSAGES` | client | live read 有効化（GET） |
| `coalterSendMessages` | `NEXT_PUBLIC_PLAN_COALTER_SEND_MESSAGES` | client | live 時に送信を実 route へ回す |
| `planCoAlterReadLocalEnabled()` | `PLAN_COALTER_READ_LOCAL` | server | GET gate（**read ∨ send**） |
| `planCoAlterSendLocalEnabled()` | `PLAN_COALTER_SEND_LOCAL` | server | **POST gate（send のみ）** |

- GET = read ∨ send（send 有効時は send→refetch のため read も通る）。POST = send のみ。
- C3 は **send を ON** にする（read も連動して通る）。UX-5a-1 の分離設計通り。

---

## 3. send flag OFF 時の挙動

- **server**: `PLAN_COALTER_SEND_LOCAL` OFF → POST は **404**（write 経路 dormant）。
- **client**: `coalterSendMessages` OFF → `handleSendUnified` は **local echo**（state のみ・POST しない）。
- → **DB write ゼロ**（本番デフォルト・現行挙動）。

---

## 4. send flag ON 時に書く table / columns

- table: **`plan_coalter_session_messages`** のみ（port `insertParticipantMessageRow`）。
- columns（insert payload）:
  | column | 値 | 制御 |
  |---|---|---|
  | `session_id` | route param `sessionId` | URL |
  | `author_kind` | `'participant'` **固定** | port ハードコード |
  | `author_user_id` | **server-stamped `auth.uid()`** | `stampServerAuthContext(user.id)`・client 詐称不可 |
  | `kind` | `'chat'` | draft |
  | `visibility` | `'shared'` **固定** | port ハードコード（CHECK と一致） |
  | `body` | client text | body のみ受ける |
  | `client_message_id` | optional（冪等） | 23505→既存返し |
- **coalter 列は書かない**（author_kind は 'participant' 固定・author NULL にしない）。

---

## 5. author_kind / author_user_id / body / session_id の制御

- `author_kind='participant'`・`visibility='shared'` は **port 固定**（client が変えられない）。
- `author_user_id` = **server auth の id のみ**（`auth.getUser()`→stamp）。client が author/userId/source を送れば **400**。
- `body` = client 提供 text（participant の発話）。**participant の body は client 由来で正当**（CoAlter body と違い）。
- `session_id` = route param。RLS が「その session の participant か」を最終判定。

---

## 6. participant が自分の session にだけ insert できること

既存 `plan_coalter_message_insert_participant`（C2-a-verify で実在確認）:
```
WITH CHECK (author_kind='participant' AND author_user_id=auth.uid()
            AND EXISTS(participant p WHERE p.session_id=NEW.session_id AND p.user_id=auth.uid()))
```
→ **自分が participant の session に・自分名義で**のみ insert 可。他 session は EXISTS が偽で **拒否**。

## 7. 非 participant が insert できないこと

同 policy の EXISTS（membership）が偽 → **拒否**。さらに `author_user_id=auth.uid()` で他人名義も不可。

---

## 8. CoAlter generated message はまだ書かないこと

- C3 は **participant message のみ**（author_kind='participant'）。
- coalter 行（author_kind='coalter'・author NULL）は **書かない**・**書けない**（coalter insert policy は未作成＝C5・現状 deny）。
- send route の port は `author_kind:'participant'` を**ハードコード**＝C3 経由で coalter 行は生成不能。

---

## 9. C3 staging smoke の最小手順（**設計のみ・実行は gate 後**）

C2-b dummy session（`dddddddd-c2b0-…`）+ staging dummy user を足場に、**user-RLS（SET ROLE authenticated + jwt sub）**で:
1. **正常系**: participant として participant message INSERT（author_kind='participant'・author_user_id=self・body='テスト送信'）→ **成功**（既存 policy）
2. **異常系①（他 session）**: participant として自分が member でない session に INSERT → **失敗**
3. **異常系②（author 詐称）**: participant として `author_user_id`=他人 で INSERT → **失敗**（WITH CHECK）
4. **異常系③（非 participant）**: 別 uid で INSERT → **失敗**
5. **異常系④（coalter 行）**: participant として `author_kind='coalter'`/author NULL で INSERT → **失敗**（coalter policy 不在＝C5 が未着であることの確認）
6. **冪等**: 同 `client_message_id` 2回 → 1行（partial unique）
7. **read 反映**: 書いた participant message を participant が read（member）→ 見える / 非 participant → 0
- （任意・重い）**route smoke**: dev server + staging env + flag ON + dummy user ログイン → POST → 201/既存返し。
  flag/store は unit test 済なので **DB 層 user-RLS smoke を主**にする。
- 全て staging・dummy。**production/性格/axis 不触**。

---

## 10. cleanup 方針

- C3 smoke で書いた participant message は staging 限定で削除可:
  `DELETE FROM plan_coalter_session_messages WHERE session_id='dddddddd-c2b0-…' AND body IN ('テスト送信', …);`
- もしくは C2-b dummy session ごと残置（後続 smoke の足場）。**production には一切触れない**。
- cleanup（DELETE）は CEO 指示時のみ・staging 限定。

---

## 11. C5 との境界（分離確認）

| 観点 | C3（本書） | C5 |
|---|---|---|
| 書く author_kind | **participant** | coalter |
| 使う policy | 既存 `message_insert_participant`（追加なし） | 新 `…insert_coalter_by_participant`（追加） |
| body の出所 | **client（participant 発話）** | server 生成（brain） |
| migration | **不要** | policy 1 本追加（別 gate） |
| 残余リスク | なし（author=auth.uid 固定） | participant が偽 coalter 行を作れる（受容判断） |
| brain 配線 | なし | あり（C4→persist） |

→ C3 は **participant write のみ**で coalter insert policy / brain / 新 migration に**一切触れない**。C5 と完全分離。

---

## 報告（CEO 向け要点）

1. **C3 participant send 設計**: 既存 route/handler/store/port で participant message を user-RLS 書込。新コード/policy 不要。
2. **対象 route/action**: `POST /api/coalter/sessions/[sessionId]/messages` → `handleCoAlterSend`（server-stamp author・FORBIDDEN_BODY_KEYS で詐称遮断）。
3. **flag 設計**: client `coalterSendMessages` + server `PLAN_COALTER_SEND_LOCAL`（POST gate）。OFF=404/local echo（write 0）。GET=read∨send。
4. **write 対象 columns**: plan_coalter_session_messages（author_kind='participant' 固定・author_user_id=auth.uid() server-stamp・visibility='shared' 固定・body=client・kind='chat'・client_message_id 冪等）。
5. **RLS 期待値**: participant 自 session self insert=成功 / 他 session・author 詐称・非 participant・coalter 行=失敗 / 冪等=1行。
6. **staging smoke 計画**: C2-b dummy session で user-RLS（SET ROLE authenticated）の participant insert 正常/異常系/冪等/read 反映。任意で route e2e。
7. **cleanup**: smoke 書込を staging 限定 DELETE or 残置（CEO 指示時）。
8. **C5 と分離**: C3=participant write のみ・coalter insert policy/brain/新 migration 不触。C5 と完全分離（§11）。

## 実装 GO 前の停止条件
- C3 実装/POST/INSERT は **別 CEO gate**（本書は preflight のみ）。
- send flag ON での staging write smoke は CEO write gate 後。
- coalter insert / C5 policy には触れない（C3 scope 外）。
