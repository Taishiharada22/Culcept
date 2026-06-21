# C2-b scope 再定義: CoAlter dummy seed + read smoke（CoAlter 会話テーブル限定・docs-only）

> **scope 再定義フェーズ。seed/read/SQL/DB write は一切しない。** 実行は CEO gate 後。
> base: local main `bcf84157c` / branch: `claude/coalter-logic-resume-20260621`
> 前提: C2-a apply 成功・4 table 実在確認済み（inspect db）・RLS/policy 直接確認は未達。

作成: 2026-06-21 / Build Unit / 承認待ち: CEO

---

## 0. 絶対境界（CEO 指示 2026-06-21）

C2 系で扱うのは **`plan_coalter_*` の新規 CoAlter 会話テーブルだけ**。以下を**一切参照・使用しない**:
- ❌ production 接続 / production user data
- ❌ Stargazer axis（`stargazer_axis_snapshots` 等）
- ❌ personality data（`stargazer_alter_growth`・HDM 等）
- ❌ Travel personalization data（`coalter_fairness_ledger`・M2 系）
- ❌ 実ユーザーの性格データを seed に使うこと

→ staging に**ユーザーの性格データ/axis は存在しない**。それを production から引くことは禁止。
**C2-b は CoAlter 会話の枠組み（session/participant/message）が動くかの確認のみ**で、性格・観測データには**構造的に触れない**（plan_coalter_* は axis/personality を FK でも参照しない）。

---

## 1. C2-b で触れるテーブル（これだけ）

| table | C2-b での用途 | 性格/axis 参照 |
|---|---|---|
| `plan_coalter_sessions` | dummy session 1件 seed | なし |
| `plan_coalter_session_participants` | dummy participant 1〜2件 seed | なし |
| `plan_coalter_session_messages` | dummy participant message 1〜2件 seed | なし |
| `plan_coalter_session_read_cursors` | seed しない（read receipt HOLD） | なし |

唯一の外部参照は **`auth.users(id)` への FK**（created_by / user_id / author_user_id）。
これは **identity（アカウント id）** であって personality/axis ではない。後述（§3）。

---

## 2. seed 対象（staging-only dummy・実データ禁止）

すべて **staging 限定の架空データ**。実ユーザーの会話・性格・嗜好は使わない。

- **dummy session 1件**: `plan_coalter_sessions`
  - mode='daily'・plan_window=`{"date":"2026-07-01"}`・stage='understanding'・created_by=`<staging dummy auth user id>`
- **dummy participant 1〜2件**: `plan_coalter_session_participants`
  - user_id=`<staging dummy auth user id>`・source_kind='self'（2人なら 'self' + もう1 dummy user）
- **dummy participant message 1〜2件**: `plan_coalter_session_messages`
  - author_kind='participant'・author_user_id=`<staging dummy auth user id>`・kind='chat'・visibility='shared'
  - body = **完全な架空テキスト**（例: 「週末どこか行きたいね」「いいね、近場で」）。
    ★ どの実ユーザーの発言でもない・性格推定の入力でもない・観測に流さない。
- **CoAlter message は seed しない**（read smoke は participant 会話表示が目的・coalter insert は HOLD）。

**架空 body の原則**: 意味のある文でなくてよい（read smoke は「行が GET で返るか」の確認）。
性格・嗜好・実在地名の機微を避けた中立な短文にする。

---

## 3. staging test user（auth user id）の扱い

plan_coalter_* は `auth.users(id)` を FK 参照するため、seed には **staging に実在する auth user の id** が要る。

- これは **identity anchor（アカウント行）だけ**。**personality/axis/Travel データは読まない・存在しない**。
- 取得方法（どちらか・CEO 承認下）:
  1. **既存の staging dummy auth user を使う**（env に `STAGING_USER_A_PASSWORD` あり＝staging テストアカウント存在の示唆）。
     その user の id を `auth.users` から **read-only SELECT** で1件取得（personality table は引かない）。
  2. **staging に新規 dummy auth user を作る**（auth signup・staging 限定の捨てアカウント）。
- **read smoke の認証**: GET は RLS で `auth.uid()=participant` を要求するため、**staging dummy user としてログイン**して GET する
  （その user の **session token** を使うだけ・personality は読まない）。
- ★ いずれも **auth identity のみ**。`stargazer_*` / `coalter_fairness_ledger` には一切アクセスしない。

---

## 4. 実データを使わないことの明記

- seed の body・participant・session は **全て架空**（fabricated）。実ユーザーの会話ログを転記しない。
- 性格・axis・HDM・Travel preference を **seed の入力にも read smoke の表示にも使わない**。
- C4 の brain preview（`analyzeConversation`）も **テキスト解析のみ**で axis/personality を消費しない
  （C2-b では brain preview 自体を起動しない・read smoke は GET 表示のみ）。
- production には接続しない（CLI link は staging `hjcrvndumgiovyfdacwc` 維持）。

---

## 5. DB password が必要な理由（明確化）

staging DB password（または Docker）が要るのは、**CoAlter table の構造確認と dummy seed のため**であり、
**性格データ参照のためではない**。具体的に2用途：

1. **C2-a-verify 完遂（RLS/policy 直接確認）**:
   psql で `pg_class.relrowsecurity`・`pg_policies` を **read-only SELECT** し、4 table の RLS enabled と
   policy 4本（participant_select_own / session_select_member / message_select_member / message_insert_participant）、
   **CoAlter insert policy 不在**・read_cursor policy 不在を直接確認する。（`inspect db` では RLS/policy を取れないため）
2. **C2-b dummy seed**:
   session/participant の **INSERT policy は HOLD（deny）**＝user-RLS では seed できない。
   → staging SQL editor / psql で **dummy 行を手動 INSERT**（一回限り・CEO seed gate）。
   この seed は **plan_coalter_* + auth.users(id) 参照のみ**で、stargazer/personality table には触れない。

→ DB password は **「CoAlter 会話テーブルの確認 + 架空 seed」専用**。production / 性格データ用途では一切使わない。
**app code に service_role / SECURITY DEFINER は追加しない**（手動 psql/SQL editor のみ）。

---

## 6. C2-b 実行順（CEO gate 後・本書では実行しない）

1. staging DB password 入手（CEO 提供）or Docker 起動
2. **RLS/policy 直接確認**（C2-a-verify 完遂・read-only SELECT）→ 不一致なら STOP
3. **dummy auth user id 確定**（既存 STAGING_USER_A or 新規 dummy・auth identity のみ）
4. **dummy seed**（session1 + participant1〜2 + participant message1〜2・架空 body・CEO seed gate）
5. **read smoke**（dummy user でログイン → `PLAN_COALTER_READ_LOCAL` + `coalterReadMessages` +
   `coalterDevSessionId=<dummy session>` で **GET のみ**・POST/send OFF）→ seeded 行表示確認・非 participant 空確認
6. STOP（response persistence / brain 接続 / projection は C5/C6）

---

## 停止条件（C2-b 本実行時）
- production ref・性格/axis table アクセス・実ユーザーデータ混入を検知したら即中止
- seed が plan_coalter_* + auth.users 以外に触れたら中止
- RLS/policy 不一致・非 participant が他人 message を読めた（RLS 破れ）なら中止
