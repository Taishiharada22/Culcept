# C2-preflight: staging apply + seed + read smoke 手順書（docs-only）

> **preflight フェーズ。apply / seed / SQL 実行は一切しない。** C2 本実行は各ステップ CEO 承認後。
> base: local main `bcf84157c` / branch: `claude/coalter-logic-resume-20260621`
> 対象: `supabase/migrations/20260613120000_plan_coalter_session_messages.sql`（C1 で復元済み）
> 原則: production 誤接続を機械的に防ぐ・各ステップに停止条件を置く。

作成: 2026-06-21 / Build Unit / 承認待ち: CEO

---

## 🔴 0. 最重要 STOP 条件（preflight で判明）

**現在の Supabase CLI link = `aljavfujeqcwnqryjmhl`（PRODUCTION）。**
→ **この状態で `supabase db push` / `migration up` を実行すると production に直撃する。C2 本実行は STOP。**
**staging `hjcrvndumgiovyfdacwc` へ re-link し二重確認するまで、いかなる apply も行わない。**

---

## 1. 現在の project-ref（read-only 確認済み）

```
$ cat supabase/.temp/project-ref
aljavfujeqcwnqryjmhl        ← 🔴 PRODUCTION
```
| ref | 環境 | 判定 |
|---|---|---|
| `aljavfujeqcwnqryjmhl` | production | 🔴 apply 禁止 |
| `hjcrvndumgiovyfdacwc` | staging | 🟡 C2 apply 対象 |

---

## 2. staging re-link 手順（C2 本実行の最初・CEO 承認後）

```bash
# ① staging へ re-link
supabase link --project-ref hjcrvndumgiovyfdacwc

# ② re-link を二重確認（**staging でなければ即 STOP**）
cat supabase/.temp/project-ref
#   期待: hjcrvndumgiovyfdacwc（これ以外＝特に aljavfujeqcwnqryjmhl なら STOP）
```
**停止条件**: `cat` 結果が `hjcrvndumgiovyfdacwc` 以外なら、以降の手順を全て中止して報告。

---

## 3. migration apply 対象

- **対象は `20260613120000_plan_coalter_session_messages.sql` のみ**（C1 復元・実証済 asset）。
- 順序: 全 193 本中の**最後**（直前 `20260611130000_create_lifeops_structured_sources`）。順序衝突なし・additive。
- ⚠️ **`supabase db push` は「staging に未適用の全 migration」を push する**（1 本だけではない）。
  - **C2 本実行の前に `supabase migration list`（read-only）で staging 未適用本数を必ず確認**。
  - **停止条件**: 未適用が `20260613120000` の **1 本だけ** であることを確認できなければ STOP
    （staging が大幅に遅れている場合、想定外の 192 本まで適用してしまうため・別途 CEO 判断）。
- staging に未適用か: **DB 接続なしでは断定不可**（migration list は staging 接続が要る＝C2 本実行で確認）。

---

## 4. apply 後に確認する table（read-only・staging）

apply 成功後、staging に以下 4 table が存在することを確認（`\dt` 相当 / information_schema）:
- `plan_coalter_sessions`
- `plan_coalter_session_participants`
- `plan_coalter_session_messages`
- `plan_coalter_session_read_cursors`

確認 SQL（read-only・SELECT のみ）案:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'plan_coalter_session%'
ORDER BY table_name;
-- 期待: 上記 4 行
```

---

## 5. RLS / policy 確認項目（read-only・staging）

| 対象 | 期待 policy |
|---|---|
| sessions | SELECT member（`plan_coalter_session_select_member`）・INSERT/UPDATE/DELETE なし（HOLD） |
| participants | SELECT own-row（`plan_coalter_participant_select_own`・`user_id=auth.uid()`）・INSERT 等なし（HOLD） |
| messages | SELECT member・**INSERT participant only**（`author_kind='participant' AND author_user_id=auth.uid()`）・UPDATE/DELETE なし |
| **CoAlter insert** | **policy 無し＝deny（HOLD）**。user-RLS では coalter 行を insert **できない**ことを確認 |
| read_cursors | policy 無し＝deny |

確認 SQL（read-only）案:
```sql
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename LIKE 'plan_coalter_session%' ORDER BY tablename, cmd;
-- 期待: participant_select_own / session_select_member / message_select_member /
--       message_insert_participant の 4 policy のみ（coalter insert / read_cursor は不在）
SELECT relname, relrowsecurity FROM pg_class
WHERE relname LIKE 'plan_coalter_session%';  -- 4 table とも relrowsecurity=t
```

---

## 6. seed 最小 scope（read smoke 用）

read smoke は「実 message を GET で読めるか」の確認なので、最小は:
- **session 1 件**（`plan_coalter_sessions`・mode='daily'・plan_window={"date":"2026-07-01"}・created_by=<staging テスト user>）
- **participant 1〜2 件**（`plan_coalter_session_participants`・user_id=<テスト user>・source_kind='self'）
- **participant message 1〜2 件**（`plan_coalter_session_messages`・author_kind='participant'・author_user_id=<テスト user>・kind='chat'・visibility='shared'・body='...'）
- **CoAlter message は seed しない**（理由: read smoke は participant 会話の表示確認が目的。
  CoAlter 応答保存は C5・insert policy は HOLD・本フェーズの read smoke には不要）。

★ テスト user は **staging に実在する auth.users の id**（auth.users(id) FK のため）。CEO が staging テストアカウントを指定。

---

## 7. seed 方法（user-RLS で可能か / privileged の境界）

- **session / participant の INSERT policy は HOLD（deny）**＝**user-RLS client では session も participant も作れない**。
  → seed は **特権 write が必須**（bootstrap 問題）。
- **participant message** は INSERT policy がある（author=auth.uid）が、**session+participant が先に存在する前提**＝結局 bootstrap に特権が要る。
- 特権 seed の選択肢と境界:
  | 方法 | 可否 | 備考 |
  |---|---|---|
  | **staging SQL editor / psql で手動 INSERT**（一回限り・staging 限定） | ✅ 推奨 | CEO **seed gate** 承認下で手動実行。app コードに service_role を持ち込まない |
  | app コードで service_role client を使う seed | ❌ **禁止** | 「service_role / SECURITY DEFINER 実装」に該当・本トラック禁止事項 |
  | user-RLS で seed | ❌ 不可 | session/participant INSERT policy が HOLD |
- **方針**: seed は **staging SQL editor での手動 INSERT（一回限り・CEO seed gate）**。**app に service_role を実装しない**。
  seed SQL は C2 本実行時に CEO 承認の上で別途用意（本 preflight では SQL を実行しない・記載のみ）。

---

## 8. read smoke 手順（GET only・POST/send OFF）

staging apply + seed 完了後（**全て CEO gate 通過後**）:
```bash
# env（一時・**永続 .env 編集はしない**・shell export or preview env）
PLAN_COALTER_READ_LOCAL=true \
NEXT_PUBLIC_PLAN_COALTER_READ_MESSAGES=true \
NEXT_PUBLIC_PLAN_COALTER_DEV_SESSION_ID=<seeded session uuid> \
  npm run dev   # staging Supabase env で起動
```
- **GET `/api/coalter/sessions/<session>/messages`** が seeded participant messages を返すことを確認（認証 = seeded participant user）。
- **POST/send は OFF**（`PLAN_COALTER_SEND_LOCAL` 未設定＝404）。write は一切しない。
- CoAlterTab で `coalterReadMessages` ON 時に fixture → 実 message 表示へ切替わることを確認。
- 非 participant では空（fail-closed）を確認（RLS 実機検証）。

---

## 9. rollback / 停止条件

- **migration rollback**（staging のみ・additive なので安全）:
  ```sql
  -- staging 限定・production では絶対に実行しない
  DROP TABLE IF EXISTS plan_coalter_session_read_cursors;
  DROP TABLE IF EXISTS plan_coalter_session_messages;
  DROP TABLE IF EXISTS plan_coalter_session_participants;
  DROP TABLE IF EXISTS plan_coalter_sessions;
  ```
- **seed rollback**: 上記 DROP で全消去 or seeded 行を DELETE（staging 限定）。
- **停止条件（いずれかで即中止＋報告）**:
  1. `cat project-ref` が staging 以外
  2. `migration list` で未適用が `20260613120000` 以外にも多数
  3. apply で CHECK/RLS エラー
  4. seed で auth.users FK 違反（テスト user 不在）
  5. read smoke で非 participant が他人の message を読めた（RLS 破れ＝重大）
- **production には apply / seed / SQL を一切実行しない**（全段階）。

---

## 10. C2 本実行に進めるか

**現時点では NO（STOP）**。理由: CLI が production link 中。C2 本実行の go 条件:
1. ✅ C1 migration restore（完了）
2. ⬜ **CEO の staging re-link 承認** + re-link 後 `project-ref=hjcrvndumgiovyfdacwc` 二重確認
3. ⬜ **CEO migration apply gate**（`migration list` で未適用 1 本確認後に apply）
4. ⬜ **CEO seed gate**（staging テスト user 指定 + 手動 seed SQL 承認・app に service_role なし）
5. ⬜ read smoke は GET only・POST/send は OFF 維持

→ 上記 2〜4 が揃って初めて C2 本実行。**production deploy / origin push は全段階で別 gate（本トラック対象外）**。

---

## 付録: 本 preflight で触っていないこと（確認）
- DB 接続ゼロ・`supabase link`/`db push`/`migration` 実行ゼロ・SQL 実行ゼロ・seed ゼロ・env 永続編集ゼロ。
- read-only: `cat supabase/.temp/project-ref`・`ls migrations`・migration file の grep レビューのみ。
