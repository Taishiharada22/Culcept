-- ════════════════════════════════════════════════════════════════════════
-- Travel / Location Notes RLS test（Phase D local dry-run・**local のみ**）
--
-- 目的: owner-only RLS と location_notes 公開 select policy を local Supabase で検証。
--   userA / userB 相当で positive / negative を確認する。
--
-- 実行: psql "$(supabase status -o env | grep DB_URL ...)" -f この file
--   （実体は scripts 経由。remote には絶対に向けない＝local 54322 のみ）
--
-- 判定: 各 assertion 失敗で RAISE EXCEPTION（psql -v ON_ERROR_STOP=1 で即停止）。
--   最終行まで到達し 'ALL RLS TESTS PASSED' が出れば全 PASS。
--
-- 副作用: 末尾でテスト行・テストユーザーを全削除（cascade）。冪等。
-- ════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- 固定 UUID（hardcode で role 切替時に参照）
\set userA '00000000-0000-0000-0000-0000000000aa'
\set userB '00000000-0000-0000-0000-0000000000bb'

-- ── 0. クリーンアップ（前回残骸）+ テストユーザー作成（superuser・RLS bypass）──
BEGIN;
DELETE FROM auth.users WHERE id IN (:'userA', :'userB');
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', :'userA', 'authenticated', 'authenticated', 'rlstest_a@example.com', '', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', :'userB', 'authenticated', 'authenticated', 'rlstest_b@example.com', '', NOW(), NOW());
COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- TEST 1: positive — owner（userA）は authenticated role で自分の行を insert/select できる
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_trip uuid;
  v_day uuid;
  v_cnt int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000aa', 'role', 'authenticated')::text, true);

  INSERT INTO travel_trips (user_id, title, start_date, end_date, status)
    VALUES ('00000000-0000-0000-0000-0000000000aa', 'RLS京都', '2026-06-24', '2026-06-26', 'active')
    RETURNING id INTO v_trip;
  INSERT INTO travel_days (user_id, trip_id, date, day_index, theme)
    VALUES ('00000000-0000-0000-0000-0000000000aa', v_trip, '2026-06-24', 1, '東山逍遥')
    RETURNING id INTO v_day;
  INSERT INTO travel_itinerary_items (user_id, day_id, name, source_kind)
    VALUES ('00000000-0000-0000-0000-0000000000aa', v_day, '清水寺', 'user_added');

  SELECT count(*) INTO v_cnt FROM travel_trips WHERE id = v_trip;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'TEST1 FAIL: owner cannot read own trip (got %)', v_cnt; END IF;

  RAISE NOTICE 'TEST1 PASS: owner can insert+select own travel rows';
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- TEST 2: negative — userB は userA の private travel データを読めない（0 件）
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_cnt int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000bb', 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_cnt FROM travel_trips WHERE user_id = '00000000-0000-0000-0000-0000000000aa';
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'TEST2 FAIL: userB saw % of userA private trips', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM travel_itinerary_items;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'TEST2 FAIL: userB saw % itinerary items (cross-user leak)', v_cnt; END IF;

  RAISE NOTICE 'TEST2 PASS: userB cannot read userA private travel data';
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- TEST 3: negative — userB は userA の private/draft location_notes を読めない
-- ════════════════════════════════════════════════════════════════════════
-- まず userA が private note と draft note を作る（authenticated）
DO $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000aa', 'role', 'authenticated')::text, true);

  INSERT INTO location_notes (user_id, kind, prefecture, title, source_type, contributor_type, status, moderation_status)
    VALUES ('00000000-0000-0000-0000-0000000000aa', 'spot', '京都府', 'A private note', 'firsthand', 'local', 'private', 'none');
  INSERT INTO location_notes (user_id, kind, prefecture, title, source_type, contributor_type, status, moderation_status)
    VALUES ('00000000-0000-0000-0000-0000000000aa', 'spot', '京都府', 'A draft note', 'firsthand', 'local', 'draft', 'none');
END $$;

DO $$
DECLARE v_cnt int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000bb', 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_cnt FROM location_notes
    WHERE user_id = '00000000-0000-0000-0000-0000000000aa' AND status IN ('private', 'draft');
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'TEST3 FAIL: userB saw % private/draft notes of userA', v_cnt; END IF;

  RAISE NOTICE 'TEST3 PASS: userB cannot read userA private/draft notes';
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- TEST 4: positive(cross-user) — published + approved + 未削除 のみ userB から見える
-- ════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000aa', 'role', 'authenticated')::text, true);

  -- 見えるべき: published + approved
  INSERT INTO location_notes (user_id, kind, prefecture, title, source_type, contributor_type, status, moderation_status)
    VALUES ('00000000-0000-0000-0000-0000000000aa', 'spot', '京都府', 'A PUBLISHED approved', 'firsthand', 'local', 'published', 'approved');
  -- 見えないべき: published だが未 approved
  INSERT INTO location_notes (user_id, kind, prefecture, title, source_type, contributor_type, status, moderation_status)
    VALUES ('00000000-0000-0000-0000-0000000000aa', 'spot', '京都府', 'A published pending', 'firsthand', 'local', 'published', 'pending');
  -- 見えないべき: published+approved だが soft deleted
  INSERT INTO location_notes (user_id, kind, prefecture, title, source_type, contributor_type, status, moderation_status, deleted_at)
    VALUES ('00000000-0000-0000-0000-0000000000aa', 'spot', '京都府', 'A published deleted', 'firsthand', 'local', 'published', 'approved', NOW());
  -- 見えないべき: reported
  INSERT INTO location_notes (user_id, kind, prefecture, title, source_type, contributor_type, status, moderation_status)
    VALUES ('00000000-0000-0000-0000-0000000000aa', 'spot', '京都府', 'A reported', 'firsthand', 'local', 'reported', 'approved');
END $$;

DO $$
DECLARE
  v_total int;
  v_pub int;
  v_pending int;
  v_deleted int;
  v_reported int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000bb', 'role', 'authenticated')::text, true);

  -- userB から見える userA のノートは「published+approved+未削除」の 1 件だけのはず
  SELECT count(*) INTO v_total FROM location_notes WHERE user_id = '00000000-0000-0000-0000-0000000000aa';
  IF v_total <> 1 THEN RAISE EXCEPTION 'TEST4 FAIL: userB saw % userA notes (expected 1)', v_total; END IF;

  SELECT count(*) INTO v_pub FROM location_notes
    WHERE user_id = '00000000-0000-0000-0000-0000000000aa' AND title = 'A PUBLISHED approved';
  IF v_pub <> 1 THEN RAISE EXCEPTION 'TEST4 FAIL: userB cannot see published+approved note'; END IF;

  SELECT count(*) INTO v_pending FROM location_notes WHERE title = 'A published pending';
  SELECT count(*) INTO v_deleted FROM location_notes WHERE title = 'A published deleted';
  SELECT count(*) INTO v_reported FROM location_notes WHERE title = 'A reported';
  IF v_pending <> 0 THEN RAISE EXCEPTION 'TEST4 FAIL: userB saw published-but-unapproved note'; END IF;
  IF v_deleted <> 0 THEN RAISE EXCEPTION 'TEST4 FAIL: userB saw published+approved-but-deleted note'; END IF;
  IF v_reported <> 0 THEN RAISE EXCEPTION 'TEST4 FAIL: userB saw reported note'; END IF;

  RAISE NOTICE 'TEST4 PASS: only published+approved+not-deleted visible cross-user';
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- TEST 5: self_memo は published 不可（check 制約）
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_failed boolean := false;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000aa', 'role', 'authenticated')::text, true);

  BEGIN
    INSERT INTO location_notes (user_id, kind, prefecture, title, source_type, contributor_type, status, moderation_status)
      VALUES ('00000000-0000-0000-0000-0000000000aa', 'spot', '京都府', 'self_memo published illegal', 'self_memo', 'self', 'published', 'approved');
    v_failed := true; -- ここに来たら check が効いていない
  EXCEPTION WHEN check_violation THEN
    NULL; -- 期待通り
  END;

  IF v_failed THEN RAISE EXCEPTION 'TEST5 FAIL: self_memo + published was allowed (check missing)'; END IF;
  RAISE NOTICE 'TEST5 PASS: self_memo cannot be published (check enforced)';
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- TEST 6: saves / note_to_itinerary の unique 重複ガード
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_note uuid;
  v_dup boolean := false;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000aa', 'role', 'authenticated')::text, true);

  SELECT id INTO v_note FROM location_notes WHERE title = 'A private note' LIMIT 1;

  INSERT INTO location_note_saves (user_id, location_note_id)
    VALUES ('00000000-0000-0000-0000-0000000000aa', v_note);
  BEGIN
    INSERT INTO location_note_saves (user_id, location_note_id)
      VALUES ('00000000-0000-0000-0000-0000000000aa', v_note);
    v_dup := true;
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  IF v_dup THEN RAISE EXCEPTION 'TEST6 FAIL: duplicate save allowed (unique missing)'; END IF;

  RAISE NOTICE 'TEST6 PASS: saves unique(user_id, location_note_id) enforced';
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- TEST 7: negative(write) — userB は userA の note を update/delete できない
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_affected int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000bb', 'role', 'authenticated')::text, true);

  -- 公開 note は userB から「読める」が、update は owner-only ゆえ 0 行に作用
  UPDATE location_notes SET title = 'hacked' WHERE title = 'A PUBLISHED approved';
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 0 THEN RAISE EXCEPTION 'TEST7 FAIL: userB updated % of userA published note', v_affected; END IF;

  DELETE FROM location_notes WHERE title = 'A PUBLISHED approved';
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected <> 0 THEN RAISE EXCEPTION 'TEST7 FAIL: userB deleted % of userA published note', v_affected; END IF;

  RAISE NOTICE 'TEST7 PASS: userB cannot update/delete userA notes (owner-only write)';
END $$;

-- ── クリーンアップ（テストユーザー削除＝cascade で全テスト行も消える）──
BEGIN;
DELETE FROM auth.users WHERE id IN (:'userA', :'userB');
COMMIT;

SELECT 'ALL RLS TESTS PASSED' AS result;
