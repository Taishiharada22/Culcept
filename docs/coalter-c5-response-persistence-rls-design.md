# C5: CoAlter Response Persistence RLS 設計（docs-only）

> **設計フェーズ。policy 追加 / migration / write 実装はしない。** 実行は CEO gate 後。
> base: local main `bcf84157c` / branch: `claude/coalter-logic-resume-20260621`
> 前提（実機確認済み）: C2-a apply / C2-a-verify / C2-b dummy seed + RLS read smoke すべて PASS。
>   participant 読める・非 participant 読めない・**coalter insert policy はまだ無い（deny）**・read_cursors policy なし。
> 境界: production / 性格 / axis / Travel personalization は不触（plan_coalter_* のみ）。

作成: 2026-06-21 / Build Unit / 承認待ち: CEO

---

## 0. 問題定義

CoAlter の応答（`author_kind='coalter'`・`author_user_id IS NULL`）を `plan_coalter_session_messages` に保存したい。
だが現状 **coalter insert policy は意図的に未作成（deny）**。participant insert policy は
`author_kind='participant' AND author_user_id=auth.uid()` を要求するため、**coalter 行（author NULL）は誰も insert できない**。
→ C5 は「**誰の権限で・どの境界で** coalter 行を書くか」を決める。

---

## 1. CoAlter generated message を保存する主体は何か

- **body の生成主体 = サーバー（Next.js server action / route・server-only）**。
  C4 の brain preview core（`analyzeConversation` 由来の決定論出力、将来は LLM）が body を**サーバー側で生成**する。
  **client は coalter の body を渡さない**（client は participant メッセージしか送らない）。
- **DB への書込主体 = 「その session の participant として認証された user-RLS client」**（後述の限定 policy 経由）。
  CoAlter は participant 行に入らない system actor だが、**書込トリガは participant の行動**（送信→CoAlter 応答）。

→ 整理: **body は server 生成・write は participant 認証の user-RLS**。CoAlter 自体は DB ロールを持たない。

---

## 2. user-RLS で保存するか / server-only actor を作るか

**第一候補 = user-RLS（限定 coalter-insert policy）**。server-only actor（service_role / 専用 DB ロール）は作らない。
- 理由: server action は **participant の auth context** を既に持つ（`auth.getUser()`）。その user-RLS client で、
  **「自分が participant の session に限り」coalter 行を insert** できる policy を足せば、service_role も SECURITY DEFINER も不要。
- 代替（不採用）: service_role client を server action に持たせる → **CEO 禁止**（app code に service_role を入れない）。

---

## 3. `source_kind` / `sender` / `visibility` の制御

| 項目 | coalter message での値 | 制御 |
|---|---|---|
| `author_kind` | `'coalter'` 固定 | policy WITH CHECK + 既存 CHECK 制約 |
| `author_user_id` | `NULL` 固定 | 既存 CHECK `plan_coalter_msg_author_shape`（coalter ⇔ NULL） |
| `visibility` | `'shared'` 固定 | 既存 CHECK `visibility='shared'` |
| `kind` | `'chat'`（or `'system_event'`） | 既存 CHECK |
| `client_message_id` | `NULL`（coalter は冪等トークン不要） | 設計規約（idempotency partial unique は author NOT NULL のみ対象） |
| `body` | **server 生成**（brain 出力） | server action 規約（client から coalter body を受けない） |
| `source_kind` | ※ messages に source_kind 列は無い（participants 専用） | — |

★ `source_kind` は `plan_coalter_session_participants` の列（`self`/`talk_pair_member`/`culcept_relation`/`plan_session`）。
CoAlter は participant でないため source_kind を持たない。coalter message には sender 概念を持ち込まない。

---

## 4. participant が CoAlter message を読める条件

**新 policy 不要**。既存 `plan_coalter_message_select_member`（FOR SELECT・member）が
session の全 message（participant + coalter 両方）を participant に見せる。C2-b smoke で participant=messages2 を実証済み。
→ coalter message も「session の participant」なら読める（member 条件）。

## 5. 非 participant が読めない条件

**新 policy 不要**。同 `message_select_member`（EXISTS participant）が非 member を遮断。
C2-b smoke で非 participant=0 を実証済み。coalter message も同様に非 member には不可視。

---

## 6. app code に service_role を持ち込まない設計

- server action は **user-RLS client（`supabaseServer()` = anon/authed cookie 由来）のみ**を使う。
- coalter 行の insert は **限定 policy**（§8）が user-RLS で許す。service_role client を import/構築しない。
- 既存 `coalterSessionMessageSupabasePort` も service_role 非依存（inject のみ）。C5 もこの house style を踏襲。

---

## 7. SECURITY DEFINER の要否 → **MVP では不要**

- **不要な理由**: §8 の限定 user-RLS policy で「participant が自 session に coalter 行を insert」を **RLS 内で完結**できる。
  SECURITY DEFINER 関数を介さずとも書ける。
- **SECURITY DEFINER でも解けない問題**: 仮に DEFINER 関数にしても body は呼出引数（client 由来になり得る）。
  「偽 coalter body」を構造的に防ぐのは body の **server 生成規約**であって DEFINER 権限ではない。
  → DEFINER は複雑さを足すが forge 問題を消さない。MVP では採用しない。
- **将来 DEFINER / 署名が要るケース**: 「CoAlter 発話の真正性」を hard 要件にする時
  （例: participant が REST 直叩きで偽 coalter 行を作るのを DB 層で完全排除したい）。その時は
  ①server 署名トークン検証付き SECURITY DEFINER 関数、または ②app_origin マーカー + trigger 検証、を別設計。
  **本 C5 では HOLD**（過剰設計を避ける）。

### 残余リスク（明示）
限定 policy は「participant なら coalter 行を insert 可」なので、**悪意ある participant が REST 直叩きで
任意 body の偽 coalter message を自 session に作れる**。緩和:
- (a) 想定書込経路は server action のみ（body=brain 生成）
- (b) blast radius = 自分が属する private 1〜2 人 session のみ（他者 session 不可・非 participant 不可視）
- (c) 必要なら将来 §7 の hardening
→ MVP（private 少人数）では受容可能と判断。CEO 承認事項。

---

## 8. migration/policy 追加が必要なら最小 DDL 案（**本書では適用しない**）

**追加するのは coalter-insert policy 1 本のみ**（新 table・新列・関数なし）:
```sql
-- C5（別 migration・CEO gate 後に作成）。additive・既存 policy 不変更。
CREATE POLICY "plan_coalter_message_insert_coalter_by_participant"
  ON plan_coalter_session_messages
  FOR INSERT
  WITH CHECK (
    author_kind = 'coalter'
    AND author_user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM plan_coalter_session_participants p
      WHERE p.session_id = plan_coalter_session_messages.session_id
        AND p.user_id = auth.uid()
    )
  );
```
- 既存 `message_insert_participant`（participant 行）と**併存**。messages の INSERT は
  「participant が自分名義」または「participant が coalter 名義（author NULL）」のみ許可。
- UPDATE/DELETE policy は依然なし（message immutable 維持）。read_cursors も HOLD のまま。
- ★ これ以外の DDL（table/列/function/SECURITY DEFINER/service_role grant）は**不要**。

---

## 9. C5 smoke の seed/read/write 検証計画（**設計のみ・実行は gate 後**）

C2-b の dummy session（`dddddddd-c2b0-…`）を足場に、psql + SET ROLE authenticated で:
1. **write 正常系**: participant として coalter 行を INSERT（author_kind='coalter'・author NULL・body='（CoAlter）まとめました'）→ 成功
2. **write 異常系①**: participant として **別 session**（自分が participant でない）に coalter INSERT → **失敗（policy）**
3. **write 異常系②**: participant として coalter 行に **author_user_id を入れて** INSERT → **失敗（CHECK shape）**
4. **write 異常系③**: 非 participant（別 uid）として coalter INSERT → **失敗（policy）**
5. **read**: participant が coalter message を読める / 非 participant は 0（既存 select policy・再確認）
6. **immutable**: coalter message の UPDATE/DELETE → **失敗（policy なし）**
→ 全て staging・dummy・read/write を psql で検証。**production/性格/axis 不触**。

---

## 10. rollback 方針

- policy rollback（staging 限定・additive なので clean）:
  ```sql
  DROP POLICY IF EXISTS "plan_coalter_message_insert_coalter_by_participant" ON plan_coalter_session_messages;
  ```
- smoke で書いた dummy coalter 行は `DELETE FROM plan_coalter_session_messages WHERE author_kind='coalter' AND session_id='dddddddd-c2b0-…';`（staging 限定）。
- production には一切適用しない。

---

## 11. C3 send preview と C5 persistence の順序関係

**C3（participant send）→ C5（CoAlter response persistence）を推奨**。
- C3 は **既存 `message_insert_participant` policy**（C2-a-verify 済）を使う＝新 policy 不要・participant 書込経路を先に実機確認。
- C5 は C3 が永続した participant message に対し CoAlter が応答する＝**C3 の上に乗る**。かつ C5 は
  新 coalter-insert policy（§8）+ brain→persist 配線が要り、より重い。
- 依存: C5 の「応答」は participant message の存在が前提＝C3（or seed）が先。
→ 順序 = **C3 send（participant write 実機）→ C5 response（coalter write + policy + brain 配線）**。

---

## 報告（CEO 向け要点）

1. **C5 RLS 設計**: body=server 生成 / write=participant 認証の user-RLS / 新 coalter-insert policy 1 本で完結。read は既存 member policy で OK。
2. **必要 policy 案**: `plan_coalter_message_insert_coalter_by_participant`（FOR INSERT・author_kind='coalter' ∧ author NULL ∧ 自 session participant）1 本のみ。
3. **service_role 不使用方針**: app code に service_role を入れない。user-RLS client + 限定 policy で書く。
4. **SECURITY DEFINER 要否**: **MVP 不要**（policy で完結・DEFINER は forge を消さず複雑さのみ増）。真正性を hard 要件化する時に署名付き DEFINER を別設計。
5. **C3/C5 推奨順序**: C3 send（participant write）→ C5 response persistence（coalter write）。
6. **実装 GO 前の停止条件**:
   - policy 追加 migration は **別 CEO gate**（本書は設計のみ）
   - 残余リスク（participant が偽 coalter を REST 直叩きで作れる）を CEO が **受容するか**の明示承認
   - smoke は staging・dummy のみ（production/性格/axis 不触）を維持
   - C5 着手は C3 完了後を推奨
