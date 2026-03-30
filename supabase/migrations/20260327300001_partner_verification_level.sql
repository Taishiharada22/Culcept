-- ============================================================
-- Partner 身元確認 MVP: verification_level / review_status / frozen 拡張
--
-- 既存の rendezvous_profiles に verification_level と review_status を追加。
-- frozen_at / frozen_reason で凍結管理。
-- 既存の verification_status CHECK 制約を拡張。
-- ============================================================

-- ── review_status（審査結果。verification_status とは独立） ──
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'none'
    CHECK (review_status IN ('none', 'pending', 'approved', 'rejected'));

-- ── verification_level（算出された確認レベル 0〜4） ──
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS verification_level smallint NOT NULL DEFAULT 0
    CHECK (verification_level BETWEEN 0 AND 4);

-- ── 凍結管理 ──
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz,
  ADD COLUMN IF NOT EXISTS frozen_reason text;

-- ── 手動レビュー要求フラグ ──
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS manual_review_required boolean NOT NULL DEFAULT false;

-- ── 追加証明（L4 用、将来拡張。カラムだけ先に作る） ──
ALTER TABLE rendezvous_profiles
  ADD COLUMN IF NOT EXISTS additional_document_type text
    CHECK (additional_document_type IS NULL
      OR additional_document_type IN ('single_certificate', 'income_certificate')),
  ADD COLUMN IF NOT EXISTS additional_document_path text,
  ADD COLUMN IF NOT EXISTS additional_document_status text NOT NULL DEFAULT 'none'
    CHECK (additional_document_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS additional_document_reviewed_at timestamptz;

-- ── 既存 verification_status の CHECK 拡張 ──
-- 既存: 'none','pending','approved','rejected'
-- 追加: 'submitted','resubmitted' を許可
ALTER TABLE rendezvous_profiles
  DROP CONSTRAINT IF EXISTS rendezvous_profiles_verification_status_check;

-- 既存データの不整合を安全に修正（NULL や想定外の値を 'none' にリセット）
UPDATE rendezvous_profiles
  SET verification_status = 'none'
  WHERE verification_status IS NULL
    OR verification_status NOT IN ('none', 'submitted', 'resubmitted', 'pending', 'approved', 'rejected');

-- 既存データに 'pending'/'approved'/'rejected' があるため、それらも許可
ALTER TABLE rendezvous_profiles
  ADD CONSTRAINT rendezvous_profiles_verification_status_check
    CHECK (verification_status IN ('none', 'submitted', 'resubmitted', 'pending', 'approved', 'rejected'));

-- ── インデックス ──
CREATE INDEX IF NOT EXISTS idx_rendezvous_profiles_verification_level
  ON rendezvous_profiles(verification_level);

CREATE INDEX IF NOT EXISTS idx_rendezvous_profiles_review_pending
  ON rendezvous_profiles(review_status) WHERE review_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_rendezvous_profiles_frozen
  ON rendezvous_profiles(frozen_at) WHERE frozen_at IS NOT NULL;

-- ── 監査ログテーブル ──
CREATE TABLE IF NOT EXISTS verification_audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action        text NOT NULL CHECK (action IN (
    'submit', 'resubmit', 'approve', 'reject', 'freeze', 'unfreeze', 'level_change'
  )),
  actor_id      UUID REFERENCES auth.users(id),  -- 管理者 or NULL（システム）
  old_value     jsonb,
  new_value     jsonb,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_audit_user ON verification_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_audit_action ON verification_audit_logs(action);

ALTER TABLE verification_audit_logs ENABLE ROW LEVEL SECURITY;

-- 管理者のみ閲覧可能（service_role 経由）
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'verification_audit_logs' AND policyname = 'service_role_full_access'
  ) THEN
    CREATE POLICY "service_role_full_access" ON verification_audit_logs
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE verification_audit_logs IS
  '身元確認の状態変更監査ログ。提出/承認/却下/凍結/解凍を記録。';

-- ── コメント ──
COMMENT ON COLUMN rendezvous_profiles.review_status IS
  '管理者の審査結果。none=未提出, pending=審査中, approved=承認, rejected=却下';
COMMENT ON COLUMN rendezvous_profiles.verification_level IS
  '算出された確認レベル。0=未確認, 1=メール確認, 2=写真確認, 3=身分証確認, 4=追加証明';
COMMENT ON COLUMN rendezvous_profiles.frozen_at IS
  '凍結日時。NULLなら非凍結';
COMMENT ON COLUMN rendezvous_profiles.frozen_reason IS
  '凍結理由コード。report:impersonation, fraud:document, admin:discretion 等';
