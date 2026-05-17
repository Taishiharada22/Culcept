-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Alter Plan W1 Behavior Smoke
-- 副作用ゼロ（BEGIN ... ROLLBACK で全体 wrap、ROLLBACK で完全戻し）
--
-- 実行: staging Supabase project の Dashboard SQL Editor で全体を 1 度に Run
-- 前提:
--   - Schema smoke が PASS している
--   - W1-3 / W1-5 migration が staging に適用済み
--
-- 設計書: docs/alter-plan-foundation-design.md
-- 手順書: docs/alter-plan-a1-staging-smoke.md
--
-- 検証対象:
--   - valid INSERT 2 種類が成功（one_off / recurring）
--   - 違反 INSERT が全て check_violation / not_null_violation で reject
--   - 各テストは独立 subtransaction (BEGIN ... EXCEPTION ... END)、
--     例外を catch して外側の transaction は継続
--   - 結果は RAISE NOTICE で CEO が読める形式（PASSED / FAILED）
--
-- 重要:
--   smoke は FK (auth.users) 違反を回避するため、冒頭で
--   session_replication_role = replica を SET し、FK / trigger を一時無効化する。
--   これは transaction-scoped、ROLLBACK で完全に元に戻る。
--   CHECK 制約は影響を受けない（smoke の主検証対象として正しく動作）。
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BEGIN;

-- 副作用ゼロのため、FK / trigger を transaction 内だけ無効化
-- （ROLLBACK で完全に元に戻る、staging への永続影響なし）
SET LOCAL session_replication_role = replica;

DO $$
DECLARE
  test_user_id UUID := '00000000-0000-0000-0000-000000000001';
  test_source_id UUID;
BEGIN
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Setup: テスト用 source を作る（valid manual source）
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  INSERT INTO external_anchor_sources (user_id, source_type, raw_retention)
  VALUES (test_user_id, 'manual', 'discarded')
  RETURNING id INTO test_source_id;
  RAISE NOTICE 'SETUP: test_source_id = %', test_source_id;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 1: valid one_off INSERT が成功する
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO external_anchors (
      user_id, source_id, title, start_time, rigidity,
      confirmed_at, anchor_kind, date
    ) VALUES (
      test_user_id, test_source_id, 'Test 歯科', '14:30'::time, 'hard',
      NOW(), 'one_off', '2026-05-10'
    );
    RAISE NOTICE 'TEST 01 PASSED: valid one_off INSERT succeeded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TEST 01 FAILED: % - %', SQLSTATE, SQLERRM;
  END;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 2: valid recurring INSERT が成功する
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO external_anchors (
      user_id, source_id, title, start_time, rigidity,
      confirmed_at, anchor_kind, valid_from, recurrence_rule
    ) VALUES (
      test_user_id, test_source_id, 'Test 仕事', '09:00'::time, 'hard',
      NOW(), 'recurring', '2026-04-01', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
    );
    RAISE NOTICE 'TEST 02 PASSED: valid recurring INSERT succeeded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TEST 02 FAILED: % - %', SQLSTATE, SQLERRM;
  END;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 3: one_off + validFrom 混入 → anchor_kind_one_off_columns 発火
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO external_anchors (
      user_id, source_id, title, start_time, rigidity,
      confirmed_at, anchor_kind, date, valid_from
    ) VALUES (
      test_user_id, test_source_id, 'Bad 1', '10:00'::time, 'hard',
      NOW(), 'one_off', '2026-05-10', '2026-04-01'
    );
    RAISE NOTICE 'TEST 03 FAILED: one_off + validFrom should have raised check_violation';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 03 PASSED: anchor_kind_one_off_columns rejected validFrom';
  END;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 4: one_off + recurrenceRule 混入 → anchor_kind_one_off_columns 発火
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO external_anchors (
      user_id, source_id, title, start_time, rigidity,
      confirmed_at, anchor_kind, date, recurrence_rule
    ) VALUES (
      test_user_id, test_source_id, 'Bad 2', '10:00'::time, 'hard',
      NOW(), 'one_off', '2026-05-10', 'FREQ=WEEKLY'
    );
    RAISE NOTICE 'TEST 04 FAILED: one_off + recurrenceRule should have raised check_violation';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 04 PASSED: anchor_kind_one_off_columns rejected recurrenceRule';
  END;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 5: recurring + date 混入 → anchor_kind_recurring_columns 発火
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO external_anchors (
      user_id, source_id, title, start_time, rigidity,
      confirmed_at, anchor_kind, valid_from, recurrence_rule, date
    ) VALUES (
      test_user_id, test_source_id, 'Bad 3', '10:00'::time, 'hard',
      NOW(), 'recurring', '2026-04-01', 'FREQ=WEEKLY', '2026-05-10'
    );
    RAISE NOTICE 'TEST 05 FAILED: recurring + date should have raised check_violation';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 05 PASSED: anchor_kind_recurring_columns rejected date';
  END;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 6: recurring + validFrom 欠落 → anchor_kind_recurring_columns 発火
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO external_anchors (
      user_id, source_id, title, start_time, rigidity,
      confirmed_at, anchor_kind, recurrence_rule
    ) VALUES (
      test_user_id, test_source_id, 'Bad 4', '10:00'::time, 'hard',
      NOW(), 'recurring', 'FREQ=WEEKLY'
    );
    RAISE NOTICE 'TEST 06 FAILED: recurring without validFrom should have raised check_violation';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 06 PASSED: anchor_kind_recurring_columns required validFrom';
  END;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 7: recurring + recurrenceRule 欠落 → anchor_kind_recurring_columns 発火
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO external_anchors (
      user_id, source_id, title, start_time, rigidity,
      confirmed_at, anchor_kind, valid_from
    ) VALUES (
      test_user_id, test_source_id, 'Bad 5', '10:00'::time, 'hard',
      NOW(), 'recurring', '2026-04-01'
    );
    RAISE NOTICE 'TEST 07 FAILED: recurring without recurrenceRule should have raised check_violation';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 07 PASSED: anchor_kind_recurring_columns required recurrenceRule';
  END;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 8: validity_window_order 違反（valid_until < valid_from）
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO external_anchors (
      user_id, source_id, title, start_time, rigidity,
      confirmed_at, anchor_kind, valid_from, valid_until, recurrence_rule
    ) VALUES (
      test_user_id, test_source_id, 'Bad 6', '10:00'::time, 'hard',
      NOW(), 'recurring', '2026-09-01', '2026-04-01', 'FREQ=WEEKLY'
    );
    RAISE NOTICE 'TEST 08 FAILED: valid_until < valid_from should have raised check_violation';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 08 PASSED: validity_window_order rejected reversed dates';
  END;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 9: recurrence_rule_length 違反（501+ 文字）
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO external_anchors (
      user_id, source_id, title, start_time, rigidity,
      confirmed_at, anchor_kind, valid_from, recurrence_rule
    ) VALUES (
      test_user_id, test_source_id, 'Bad 7', '10:00'::time, 'hard',
      NOW(), 'recurring', '2026-04-01',
      'FREQ=WEEKLY;BYDAY=' || repeat('X', 490)
    );
    RAISE NOTICE 'TEST 09 FAILED: 500+ char recurrence_rule should have raised check_violation';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 09 PASSED: recurrence_rule_length rejected long string';
  END;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 10: raw_retention='discarded' + raw_storage_path → raw_retention_integrity 発火
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO external_anchor_sources (
      user_id, source_type, raw_retention, raw_storage_path
    ) VALUES (
      test_user_id, 'manual', 'discarded', 'should-not-be-here'
    );
    RAISE NOTICE 'TEST 10 FAILED: discarded + storagePath should have raised check_violation';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 10 PASSED: raw_retention_integrity rejected discarded + path';
  END;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 11: raw_retention='stored' + raw_storage_path 欠落 → raw_retention_integrity 発火
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO external_anchor_sources (
      user_id, source_type, raw_retention, raw_expires_at
    ) VALUES (
      test_user_id, 'pdf', 'stored', NOW() + INTERVAL '30 days'
    );
    RAISE NOTICE 'TEST 11 FAILED: stored without storagePath should have raised check_violation';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 11 PASSED: raw_retention_integrity required storagePath for stored';
  END;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 12: plan_drift_events target_snapshot に配列 → target_snapshot_is_object 発火
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO plan_drift_events (
      user_id, target_type, target_id, drift_type,
      evidence_source, evidence_strength, target_snapshot
    ) VALUES (
      test_user_id, 'external_anchor',
      '00000000-0000-0000-0000-000000000099'::uuid,
      'time_changed', 'passive', 'weak',
      '["array", "not", "object"]'::jsonb
    );
    RAISE NOTICE 'TEST 12 FAILED: array target_snapshot should have raised check_violation';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 12 PASSED: target_snapshot_is_object rejected non-object';
  END;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 13: confirmed_at NULL 試行 → NOT NULL 制約発火
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO external_anchors (
      user_id, source_id, title, start_time, rigidity,
      confirmed_at, anchor_kind, date
    ) VALUES (
      test_user_id, test_source_id, 'Bad NULL', '10:00'::time, 'hard',
      NULL, 'one_off', '2026-05-10'
    );
    RAISE NOTICE 'TEST 13 FAILED: NULL confirmed_at should have raised not_null_violation';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'TEST 13 PASSED: confirmed_at NOT NULL enforced';
  END;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 14: anchor_kind 不正値 → CHECK 発火
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO external_anchors (
      user_id, source_id, title, start_time, rigidity,
      confirmed_at, anchor_kind, date
    ) VALUES (
      test_user_id, test_source_id, 'Bad kind', '10:00'::time, 'hard',
      NOW(), 'invalid_kind', '2026-05-10'
    );
    RAISE NOTICE 'TEST 14 FAILED: invalid anchor_kind should have raised check_violation';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 14 PASSED: anchor_kind enum rejected invalid value';
  END;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 15: rigidity 不正値 → CHECK 発火
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO external_anchors (
      user_id, source_id, title, start_time, rigidity,
      confirmed_at, anchor_kind, date
    ) VALUES (
      test_user_id, test_source_id, 'Bad rigid', '10:00'::time, 'rigid',
      NOW(), 'one_off', '2026-05-10'
    );
    RAISE NOTICE 'TEST 15 FAILED: invalid rigidity should have raised check_violation';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 15 PASSED: rigidity enum rejected invalid value';
  END;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 16: plan_drift_events drift_type 不正値 → CHECK 発火
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO plan_drift_events (
      user_id, target_type, target_id, drift_type,
      evidence_source, evidence_strength
    ) VALUES (
      test_user_id, 'external_anchor',
      '00000000-0000-0000-0000-000000000099'::uuid,
      'invalid_drift_type', 'passive', 'weak'
    );
    RAISE NOTICE 'TEST 16 FAILED: invalid drift_type should have raised check_violation';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 16 PASSED: drift_type enum rejected invalid value';
  END;

  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  -- Test 17: plan_drift_events repetition_count 負値 → CHECK 発火
  -- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BEGIN
    INSERT INTO plan_drift_events (
      user_id, target_type, target_id, drift_type,
      evidence_source, evidence_strength, repetition_count
    ) VALUES (
      test_user_id, 'external_anchor',
      '00000000-0000-0000-0000-000000000099'::uuid,
      'time_changed', 'passive', 'weak', -1
    );
    RAISE NOTICE 'TEST 17 FAILED: negative repetition_count should have raised check_violation';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 17 PASSED: repetition_count non-negative enforced';
  END;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ROLLBACK: 全変更を破棄、staging に実データを残さない
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ROLLBACK;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Post-rollback 確認（副作用ゼロの最終 assert）
-- 期待: 全件 0（migration 適用直後の clean state）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT 'external_anchors' AS table_name, count(*) AS row_count FROM external_anchors
UNION ALL
SELECT 'external_anchor_sources', count(*) FROM external_anchor_sources
UNION ALL
SELECT 'plan_drift_events', count(*) FROM plan_drift_events
ORDER BY table_name;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PASS criteria summary (CEO 確認用)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Test 01: valid one_off INSERT → PASSED
-- Test 02: valid recurring INSERT → PASSED
-- Test 03-09: external_anchors の CHECK 違反 7 種 → 全 PASSED
-- Test 10-11: raw_retention_integrity 違反 2 種 → 全 PASSED
-- Test 12: target_snapshot_is_object 違反 → PASSED
-- Test 13: confirmed_at NOT NULL 違反 → PASSED
-- Test 14: anchor_kind enum 違反 → PASSED
-- Test 15: rigidity enum 違反 → PASSED
-- Test 16: drift_type enum 違反 → PASSED
-- Test 17: repetition_count 非負 → PASSED
--
-- Post-rollback row count: 全 3 テーブルで 0
--
-- 全項目 PASS なら Behavior smoke PASS → A-1 完了、A-2 へ進める
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
