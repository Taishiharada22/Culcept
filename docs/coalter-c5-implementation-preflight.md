# C5 implementation preflight: CoAlter response persistence（docs-only）

> **preflight フェーズ。policy 追加 / migration 作成 / write 実装はしない。** 実装は CEO gate 後。
> base: local main `bcf84157c` / branch: `claude/coalter-logic-resume-20260621`
> 前提（実機 PASS）: C2-a/verify/2-b/C3 smoke。participant write=既存 policy で成功・非participant/詐称/coalter行/他session=fail-closed。
>   **coalter insert policy は現状なし（deny）**。production/personality/axis/Travel 不触。
> 関連: docs/coalter-c5-response-persistence-rls-design.md（RLS 設計）/ docs/coalter-c3-*-smoke-result.md。

作成: 2026-06-21 / Build Unit / 承認待ち: CEO（特に §2 残余リスク受容）

---

## 0. C5 のゴールと現状ギャップ

CoAlter 応答（`author_kind='coalter'`・`author_user_id IS NULL`）を `plan_coalter_session_messages` に保存する。
現状ギャップ:
- DB: **coalter insert policy 不在**（C3 で coalter 行 insert は RLS 拒否を実証）。
- code: store/port は **participant insert のみ**（`insertParticipantMessageRow`）。coalter 行を読む写像はあるが **書く経路がない**。
- brain: C4 `buildCoAlterBrainPreview`（pure・保存なし）は存在。**persist への配線がない**。

---

## 1. policy migration 案（**提案のみ・本書では migration file を作らない**）

C5 で追加する DDL は **coalter-insert policy 1 本のみ**（新 table/列/関数なし）。将来 `supabase/migrations/<ts>_plan_coalter_message_insert_coalter.sql` として CEO gate 後に作成:
```sql
-- additive・既存 policy 不変更・staging で smoke 後に CEO apply gate
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
- read は **既存 `message_select_member`** で OK（participant は coalter message も読める・C2-b 実証）。新 read policy 不要。
- UPDATE/DELETE policy は依然なし（message immutable）。read_cursors HOLD のまま。
- 既存 `message_insert_participant` と併存（participant 行 + coalter 行の2系統 insert）。

---

## 2. 残余リスクの明文化

**限定 user-RLS policy（§1）は「session の participant なら coalter 行を insert できる」。** よって:
- **悪意ある participant が REST 直叩きで、自分が属する session に任意 body の偽 CoAlter message を作れる。**
- 影響範囲: **自分が participant の private 1〜2 人 session のみ**（他 session 不可・非 participant 不可視）。
- 害: 相手に「CoAlter がこう言った」と見せて誘導する social-engineering。技術的破壊力は低いが
  **「CoAlter 発話の真正性」が DB 層で保証されない**。
- 根本原因: body 生成（brain）は TS/server だが、**write 許可が participant の RLS** なので、
  server action を経由しない直 insert を DB 層で区別できない。

→ **これを MVP で受容するか**が C5 最大の CEO 判断（§8）。

---

## 3. 代替案比較

| 案 | 仕組み | forge 防止 | service_role | SECURITY DEFINER | 複雑さ | 判定 |
|---|---|---|---|---|---|---|
| **A. 限定 user-RLS policy** | participant が自 session に coalter 行を insert | ❌（自 session 内で forge 可） | 不要 | 不要 | 最小（policy 1本） | **MVP 候補** |
| B. signed server action / nonce | server が body+HMAC 署名 → 検証列を trigger/関数で照合 | ✅（client は署名を作れない） | 不要 | 実質要（検証関数/trigger） | 高（秘密鍵管理+検証層） | 将来 hardening |
| C. SECURITY DEFINER RPC | definer 関数のみ coalter 行 insert・table は coalter policy なし（直 insert deny） | △（直 insert は防ぐが RPC body 引数は client 由来→forge 残る） | 不要 | **要** | 中（関数+grant+search_path 固定） | 部分的 |
| D. service_role server-only | server が service_role で RLS bypass insert | ✅（client 到達不可） | **要（app code 禁止）** | 不要 | 中（隔離 writer） | **CEO 禁止（app code に service_role）** |

**重要**: forge を**完全に消す**には「client が複製できない server 専用経路」が必要（D の service_role か、B の署名検証）。
A・C は直叩き forge を完全には消さない。D は CEO 禁止。
→ 「forge を消す」を hard 要件にするなら **B（署名）か、隔離した service_role writer（app code 外の独立 service）** が要る。

### 受容しない場合の最有力代替（非永続）
**E. coalter 応答を永続しない（C4 ephemeral preview のまま）**: participant message のみ永続（C3）、
CoAlter 応答は **毎回 server で再生成して表示するだけ（保存しない）**。forge 書込問題が**構造的に発生しない**。
→ 「真正性 hard・でも service_role 入れたくない」なら **E が最も安全**（C5 永続を保留）。

---

## 4. 推奨案

- **MVP（forge 受容できる場合）= A（限定 user-RLS policy）+ server-action body discipline**。
  - body は **server action が brain から生成**・client から coalter body を受けない（§5）。
  - 想定 write 経路は server action のみ。直叩き forge は「private 少人数・低害」として受容。
  - 将来 hardening として **B（署名）** を残置（真正性要件が上がった時に追加・policy に署名検証列を足す）。
- **MVP（forge 受容できない場合）= E（C4 ephemeral preview のまま・C5 永続を保留）**。
  - participant message のみ永続。CoAlter 応答は表示専用（保存しない）。後日 B/隔離 writer が整ったら永続化。

→ **どちらにするかは CEO の §2 受容判断**で決まる。Build Unit の中立推奨: **まず E で出して体験を見て、真正性が必要になったら B、永続が要れば A+将来 B**。

---

## 5. brain→persist 配線案（**実装は gate 後**）

```
participant が会話 → [server action / route（server-only）]
  ① user-RLS で session の participant messages を read（既存 GET 相当）
  ② mapNewSessionMessagesToTurns → buildCoAlterBrainPreview（C4・pure・DB/LLM なし）
       → previewText（= CoAlter body・**server 生成のみ**）
  ③ 新 store/port メソッド insertCoAlterMessageRow で coalter 行を insert
       （author_kind='coalter'・author_user_id NULL・visibility='shared'・body=previewText・client_message_id NULL）
       → §1 policy で user-RLS（participant context）が許可
```
- **client から coalter body を受け取らない**（participant の send body とは別経路・server が brain で生成）。
- 新規 code（gate 後）: port `insertCoAlterMessageRow`（author_kind='coalter' ハードコード・body 引数は server 生成値のみ）
  + store `appendCoAlterMessage` + server action。**service_role/SECURITY DEFINER を app code に入れない**（A 採用時）。
- brain は C4 の決定論 preview core から開始（LLM は後段・flag 配下）。

---

## 6. C5 smoke plan（**policy 追加後・staging dummy のみ・gate 後**）

C2-b dummy session で psql・user-RLS（SET ROLE authenticated）:
1. **coalter insert 正常系**: participant context で coalter 行（author NULL・body='（CoAlter）まとめました'）→ **成功**（新 policy）
2. **participant read**: coalter message が participant に見える（member）
3. **non participant read**: 0（fail-closed）
4. **participant spoof**: coalter 行に author_user_id を入れる → **失敗**（CHECK shape）
5. **bad author / 非 participant**: 非 participant が coalter insert → **失敗**（policy EXISTS 偽）
6. **other session**: 非 member session への coalter insert → **失敗**
7. **immutable**: coalter message UPDATE/DELETE → **失敗**（policy なし）
8. **C3 退行なし**: participant insert は引き続き成功（既存 policy 不変）
- 全 transaction 内 ROLLBACK で純増書込ゼロ（C3 と同方式）。production/性格/axis 不触。

---

## 7. cleanup / rollback

- policy rollback（staging 限定・additive で clean）:
  `DROP POLICY IF EXISTS "plan_coalter_message_insert_coalter_by_participant" ON plan_coalter_session_messages;`
- smoke は ROLLBACK 主体＝書込残さない。万一 commit した dummy coalter 行は
  `DELETE FROM plan_coalter_session_messages WHERE author_kind='coalter' AND session_id='dddddddd-c2b0-…';`（staging 限定）。
- production には policy/seed/SQL を一切適用しない（全段階）。

---

## 8. 実装 GO 前の停止条件（CEO 判断事項）

1. **【最重要】残余 forge リスクの受容可否**（§2）: A 採用（受容）か E 採用（非永続・保留）か。
2. A 採用時: coalter-insert policy migration の **作成 + staging apply は別 CEO gate**（C2-a 同様 re-link/dry-run/apply）。
3. brain→persist server action 実装（新 port/store メソッド）は code gate。**service_role/SECURITY DEFINER を app code に入れない**を維持。
4. LLM 応答生成は後段・flag 配下（MVP は C4 決定論 preview から）。
5. smoke は staging dummy のみ・production/personality/axis/Travel 不触。
6. C5 着手は本 preflight の CEO 承認後。

---

## 報告（CEO 向け要点）

1. **policy migration 案**: `…insert_coalter_by_participant`（author_kind='coalter' ∧ author NULL ∧ 自 session participant）1 本。read は既存で OK。
2. **残余リスク**: participant が REST 直叩きで自 private session に偽 CoAlter 行を作れる（他 session/非 participant 不可・低害・真正性 DB 非保証）。
3. **代替案比較**: A 限定 policy（最小・forge 残）/ B 署名（forge 防・複雑）/ C DEFINER（部分的）/ D service_role（禁止）/ **E 非永続 preview（forge 構造的に発生せず）**。
4. **推奨**: 受容可→A+server body discipline（将来 B hardening）。受容不可→E（C4 ephemeral・永続保留）。中立推奨は「E で出す→必要なら B/A」。
5. **brain→persist 配線**: participant messages read → C4 brain core で body server 生成 → 新 insertCoAlterMessageRow（coalter 行）。client から coalter body を受けない。
6. **C5 smoke plan**: policy 追加後 staging dummy で coalter insert 正常/read/異常系/immutable/C3 退行なし（全 ROLLBACK）。
7. **rollback**: DROP POLICY + （必要時）coalter 行 DELETE（staging 限定）。
8. **CEO 判断点**: ①forge 受容可否（A vs E）②policy apply gate ③service_role/DEFINER 不使用維持 ④LLM 後段。
