-- ============================================================
-- verification_status CHECK 制約の修正
--
-- 問題: マイグレーション 20260327400000 で CHECK を
--   ('unverified','pending','verified','rejected','expired')
-- に変更し DEFAULT も 'unverified' にしたはずが、
-- 本番では旧 CHECK ('none','submitted','resubmitted','pending','approved','rejected')
-- が残っている。DEFAULT 'unverified' が CHECK に含まれず INSERT が失敗する。
--
-- 修正: CHECK を正しい値セットに再設定する。
-- ============================================================

-- Step 1: 旧 CHECK を DROP
ALTER TABLE rendezvous_profiles
  DROP CONSTRAINT IF EXISTS rendezvous_profiles_verification_status_check;

-- Step 2: 残存する旧値を新値にマイグレーション
UPDATE rendezvous_profiles
  SET verification_status = 'unverified'
  WHERE verification_status = 'none';

UPDATE rendezvous_profiles
  SET verification_status = 'verified'
  WHERE verification_status = 'approved';

UPDATE rendezvous_profiles
  SET verification_status = 'pending'
  WHERE verification_status IN ('submitted', 'resubmitted');

-- Step 3: 正しい CHECK を再追加
ALTER TABLE rendezvous_profiles
  ADD CONSTRAINT rendezvous_profiles_verification_status_check
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected', 'expired'));

-- Step 4: DEFAULT が正しいことを保証
ALTER TABLE rendezvous_profiles
  ALTER COLUMN verification_status SET DEFAULT 'unverified';
