-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  DRAFT — NOT APPLIED — DO NOT APPLY（apply 厳禁・CEO GO 待ち）              ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║  ⚠ 配置: docs/sql-drafts/（**非実行**ディレクトリ）。                        ║
-- ║    supabase/migrations/ に置くと reset/apply で誤適用されるため隔離した。     ║
-- ║    GO 後に正式 migration として supabase/migrations/ へ移送し、その時点で     ║
-- ║    timestamp を採り直す（本 timestamp は draft 識別用）。                     ║
-- ║                                                                            ║
-- ║  /plan CoAlter session message — participant/session-rooted persistence    ║
-- ║                                                                            ║
-- ║  本ファイルは **レビュー用 migration draft**。db reset / local apply /      ║
-- ║  staging apply / production apply は **まだ実行しない**（別 GO）。           ║
-- ║  生成型（supabase gen types）も未実行。                                      ║
-- ║                                                                            ║
-- ║  設計正本: docs/coalter-plan-session-message-schema-rls-design.md           ║
-- ║  契約整合: app/(culcept)/plan/tabs/coalter/coalterSessionMessageRepository.ts ║
-- ║            + coalterSessionMessageContract.ts + coalterPlanSessionContract.ts ║
-- ║                                                                            ║
-- ║  安全性: additive のみ。legacy `coalter_*` / `talk_messages` を            ║
-- ║          ALTER / DROP / 参照 しない。data backfill なし。破壊操作なし。      ║
-- ║                                                                            ║
-- ║  なぜ legacy を backing にしないか:                                          ║
-- ║   legacy `coalter_pair_states` は thread-rooted（thread_id NOT NULL UNIQUE・ ║
-- ║   2 名固定）/ `coalter_messages` は metadata JSONB（projection 混入）。       ║
-- ║   ⇒ 再 root すると /talk takeover + solo 不可 + projection 混入を継承。       ║
-- ║   本 draft は participants membership を root にした別系統。                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────
-- 1) plan_coalter_sessions: session 本体（誰と誰がいつのプランを組むか）
--    正本は participants（下記）。pair_state_id を持たない。thread は optional bridge のみ。
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_coalter_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CoAlterPlanMode（fixture 由来: 'daily' | 'travel'）。legacy の decision/... とは別系統。
  mode TEXT NOT NULL CHECK (mode IN ('daily', 'travel')),
  -- CoAlterPlanWindow: { date } | { start, end, nights }。形は JSONB（型は app 側 contract が担保）。
  window JSONB NOT NULL,
  stage TEXT NOT NULL DEFAULT 'understanding'
    CHECK (stage IN ('understanding', 'curating', 'resolving', 'confirmed')),
  -- ★ optional bridge only: nullable・root でも consent でも identity 源でもない。
  --   /talk thread を所有しない（FK を付けない・UNIQUE を付けない・NOT NULL にしない）。
  attached_thread_id UUID NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- 注: pair_state_id / thread_id(必須) は **意図的に存在しない**（participant-rooted）。
);

-- ─────────────────────────────────────────────
-- 2) plan_coalter_session_participants: 参加者 membership 正本（RLS の核）
--    1〜N（solo=1 可）。CoAlter は participant に入れない（system actor）。
--    ★ presentation（displayName/initial/tone）は持たない（CEO: 参加者層が解決）。
--      raw user_id を display fallback にしない（表示は participant 層）。
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_coalter_session_participants (
  session_id UUID NOT NULL REFERENCES plan_coalter_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  -- ParticipantSourceRef.kind と整合。'fixture' は出自にしない。
  -- talk_pair_member は authoritative coalter_pair_states 解決時のみ（書き込み条件は別 GO）。
  source_kind TEXT NOT NULL
    CHECK (source_kind IN ('self', 'talk_pair_member', 'culcept_relation', 'plan_session')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)  -- membership root: 同一 session に同一 user 重複不可
);

-- ─────────────────────────────────────────────
-- 3) plan_coalter_session_messages: 共有 session message（chat body の正本）
--    message は session に属す（thread ではない）。body は共有テキストのみ。
--    ★ legacy coalter_messages.metadata JSONB を継承しない（projection は別テーブル・本 draft に無し）。
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_coalter_session_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES plan_coalter_sessions(id) ON DELETE CASCADE,
  -- author_kind は participant / coalter を許容（schema room）。coalter の insert 経路は HOLD（§RLS）。
  author_kind TEXT NOT NULL CHECK (author_kind IN ('participant', 'coalter')),
  -- participant のみ NOT NULL・coalter は NULL（下記 CHECK で連動）。
  author_user_id UUID NULL REFERENCES auth.users(id),
  kind TEXT NOT NULL CHECK (kind IN ('chat', 'system_event')),
  -- 単一値 'shared'。per-viewer 差分は projection 側（型でも DB でも message=共有を固定）。
  visibility TEXT NOT NULL DEFAULT 'shared' CHECK (visibility = 'shared'),
  body TEXT NOT NULL,
  -- idempotency 用の client 採番トークン（participant send の retry/二重送信吸収）。coalter は不要。
  client_message_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- author 形の連動: participant ⇔ author_user_id NOT NULL / coalter ⇔ author_user_id NULL
  CONSTRAINT plan_coalter_msg_author_shape CHECK (
    (author_kind = 'participant' AND author_user_id IS NOT NULL) OR
    (author_kind = 'coalter'      AND author_user_id IS NULL)
  )
);

-- participant message の idempotency（partial unique: coalter[author NULL]/token NULL は対象外）。
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_coalter_msg_idempotency
  ON plan_coalter_session_messages (session_id, author_user_id, client_message_id)
  WHERE author_user_id IS NOT NULL AND client_message_id IS NOT NULL;

-- 取得用（session 内の時系列読み出し）。
CREATE INDEX IF NOT EXISTS idx_plan_coalter_msg_session
  ON plan_coalter_session_messages (session_id, created_at);

-- ─────────────────────────────────────────────
-- 4) plan_coalter_session_read_cursors（**RESERVED / 読み取り専用カーソル・READ RECEIPT HOLD**）
--    目的: /talk read_at を一切 mutate しない per-user 既読位置の置き場。
--    ★ 本 draft では **policy を意図的に付けない**（read receipt 未実装・後 / opt-in）。
--      RLS enable のみ（policy なし＝既定 deny。GO 時に self-scoped policy を追加）。
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_coalter_session_read_cursors (
  session_id UUID NOT NULL REFERENCES plan_coalter_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  last_read_message_id UUID NULL REFERENCES plan_coalter_session_messages(id),
  last_read_at TIMESTAMPTZ NULL,
  PRIMARY KEY (session_id, user_id)
);

-- 注（projection / per-viewer M5）: `plan_coalter_session_projections` は shape 未確定のため
--   本 draft では **作成しない**（runtime 抽出 / Plan Intelligence 投影 GO 後に別 migration）。
--   要件のみ: viewer_user_id 必須・server-filtered・message は id 参照のみ（content 複製しない）。

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  RLS（核述語 = session participant membership・/talk thread と pair_states 非依存）║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE plan_coalter_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_coalter_session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_coalter_session_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_coalter_session_read_cursors ENABLE ROW LEVEL SECURITY;

-- ── participants: 自分の membership 行のみ（recursion 回避のため own-row に限定） ──
--    co-participant 可視化（相手行の閲覧）は RLS 再帰回避のため DEFERRED
--    （SECURITY DEFINER membership 関数 / view を GO 時に検討・本 draft では決めない）。
CREATE POLICY "plan_coalter_participant_select_own" ON plan_coalter_session_participants
  FOR SELECT USING (user_id = auth.uid());
-- INSERT/UPDATE/DELETE policy: **HOLD**（session 作成 / membership lifecycle 未決・別 GO）。

-- ── sessions: 自分が participant の session のみ閲覧 ──
--    EXISTS の participants 参照には participants own-row policy が適用される（再帰なし）。
CREATE POLICY "plan_coalter_session_select_member" ON plan_coalter_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM plan_coalter_session_participants p
      WHERE p.session_id = plan_coalter_sessions.id
        AND p.user_id = auth.uid()
    )
  );
-- INSERT/UPDATE/DELETE policy: **HOLD**（session 作成 / stage 遷移 lifecycle 未決・別 GO）。

-- ── messages: SELECT = session participant のみ ──
CREATE POLICY "plan_coalter_message_select_member" ON plan_coalter_session_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM plan_coalter_session_participants p
      WHERE p.session_id = plan_coalter_session_messages.session_id
        AND p.user_id = auth.uid()
    )
  );

-- ── messages: INSERT = **participant 経路のみ**（人間 send の DB 層担保・service_role 非依存） ──
--    ★ author_user_id = auth.uid()（client が他人を author に主張できない＝DB 層でも詐称不可）
--    ★ author_kind = 'participant'（この policy では coalter を作れない）
--    ★ 本人が当該 session の participant
CREATE POLICY "plan_coalter_message_insert_participant" ON plan_coalter_session_messages
  FOR INSERT WITH CHECK (
    author_kind = 'participant'
    AND author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM plan_coalter_session_participants p
      WHERE p.session_id = plan_coalter_session_messages.session_id
        AND p.user_id = auth.uid()
    )
  );

-- ── messages: coalter / system insert policy = **HOLD（意図的に未作成）** ──
--    RLS 有効 + coalter を許す permissive policy 無し ⇒ user-RLS client は coalter 行を insert できない
--    （author_user_id IS NULL は上記 participant policy の WITH CHECK を満たさない）。
--    将来の system insert は service_role か SECURITY DEFINER 関数だが **どちらも未決定（CEO HOLD）**。
--    ⇒ schema は author_kind='coalter' の room を持つが、**insert 経路は明示的に gated/未実装**。

-- ── messages: UPDATE / DELETE policy = **無し（MVP messages immutable）** ──
--    edit / delete / reactions は将来の別 work（本 draft では policy を作らない）。

-- ── read_cursors: policy = **無し（READ RECEIPT HOLD）** ──
--    RLS 有効・policy 未作成＝既定 deny。read receipt GO 時に self-scoped policy を追加。

-- 注（Realtime）: legacy は coalter_sessions を supabase_realtime publication に追加していたが、
--   本 draft は **publication を一切触らない**（realtime は persistence/send 確定後・session-scoped・HOLD）。

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  END DRAFT — apply しない。CEO GO 後に local→staging の順で検証予定。        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
