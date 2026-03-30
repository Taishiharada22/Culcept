-- ============================================================
-- verification_status / review_status の enum 値を正式定義に揃える
--
-- verification_status (ユーザー向け到達状態):
--   unverified / pending / verified / rejected / expired
--
-- review_status (管理側審査状態):
--   not_submitted / pending / approved / rejected
--
-- 両者は連動するが同一ではない:
--   verification_status = 「そのユーザーが現在どの確認段階にいるか」
--   review_status       = 「提出物が審査でどう扱われているか」
-- ============================================================

-- ── Step 1: 旧 CHECK 制約を先に DROP（UPDATE 前に外す必要がある） ──
ALTER TABLE rendezvous_profiles
  DROP CONSTRAINT IF EXISTS rendezvous_profiles_verification_status_check;

ALTER TABLE rendezvous_profiles
  DROP CONSTRAINT IF EXISTS rendezvous_profiles_review_status_check;

-- ── Step 2: verification_status の値を移行 ──
UPDATE rendezvous_profiles
  SET verification_status = 'unverified'
  WHERE verification_status IN ('none');

UPDATE rendezvous_profiles
  SET verification_status = 'verified'
  WHERE verification_status = 'approved';

UPDATE rendezvous_profiles
  SET verification_status = 'pending'
  WHERE verification_status IN ('submitted', 'resubmitted');

-- ── Step 3: review_status の値を移行 ──
UPDATE rendezvous_profiles
  SET review_status = 'not_submitted'
  WHERE review_status = 'none';

-- ── Step 4: 新 CHECK 制約を追加 ──
ALTER TABLE rendezvous_profiles
  ADD CONSTRAINT rendezvous_profiles_verification_status_check
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected', 'expired'));

ALTER TABLE rendezvous_profiles
  ADD CONSTRAINT rendezvous_profiles_review_status_check
    CHECK (review_status IN ('not_submitted', 'pending', 'approved', 'rejected'));

-- ── Step 5: デフォルト値の変更 ──
ALTER TABLE rendezvous_profiles
  ALTER COLUMN verification_status SET DEFAULT 'unverified';

ALTER TABLE rendezvous_profiles
  ALTER COLUMN review_status SET DEFAULT 'not_submitted';

-- ── Step 6: インデックス再作成（WHERE 句の値が変わるため） ──
DROP INDEX IF EXISTS idx_rendezvous_profiles_verification_pending;
CREATE INDEX IF NOT EXISTS idx_rendezvous_profiles_verification_pending
  ON rendezvous_profiles (verification_status) WHERE verification_status = 'pending';

DROP INDEX IF EXISTS idx_rendezvous_profiles_review_pending;
CREATE INDEX IF NOT EXISTS idx_rendezvous_profiles_review_pending
  ON rendezvous_profiles (review_status) WHERE review_status = 'pending';

-- ── Step 7: コメント更新 ──
COMMENT ON COLUMN rendezvous_profiles.verification_status IS
  '本人確認フロー全体の到達状態（ユーザー向け）。unverified=未確認, pending=確認中, verified=確認済み, rejected=却下, expired=期限切れ';

COMMENT ON COLUMN rendezvous_profiles.review_status IS
  '提出済み証憑に対する審査状態（管理側）。not_submitted=未提出, pending=審査中, approved=承認, rejected=却下';
