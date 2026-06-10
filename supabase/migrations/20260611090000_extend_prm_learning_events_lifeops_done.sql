-- ════════════════════════════════════════════════════════════════════════
-- A-4-c10: prm_learning_events CHECK 拡張（Life Ops feedback + 完了 action）【**DRAFT・未 apply**】
--
-- ★status: **staging apply 済（2026-06-11・A-4-c11・CEO が Dashboard SQL Editor で実行）/ production 未**。
--   PRE: 3 CHECK が想定名・narrow 許容値・before_count=0・新値 row 0 を確認 → APPLY success →
--   POST: action+=done / signal+=completion / source_kind+=lifeops・conname 不変・after_count=0（不変）。
--   ⚠️ SQL Editor 実行ゆえ supabase_migrations history には未記録（`db push` 時は本 file が再実行されうるが、
--      DROP IF EXISTS + 同一 superset ADD ゆえ冪等＝安全）。production apply は別 CEO GO（write smoke=A-4-c12 も別 GO）。
-- 設計: docs/life-ops-m1-check-extension-a4-c10-mini-design.md / A-4-c9 write contract
--
-- 目的（additive のみ・既存値/既存 row は全て有効のまま）:
--   1) source_kind += 'lifeops'   … Life Ops feedback 行の識別（handle 'lifeops:%' との二重識別）
--   2) action      += 'done'      … 「やった/完了」（accept=採用 intent と分離・cadence の正式ソース）
--   3) signal      += 'completion' … done の中立 signal
--
-- 安全性:
--   - CHECK の**拡張（superset）**のみ → 既存 row は新制約を自明に満たす（invalid 化ゼロ・テーブル再検証は即時）。
--   - RLS / index / order / 他列に不変更。Supabase migration は単一トランザクションで実行される。
--   - 既存 CHECK は無名 inline 定義 → Postgres 自動命名 `prm_learning_events_{column}_check` を想定。
--     **apply 前に必ず実名を確認**（mini-design §checklist の pg_constraint query）し、不一致なら本 file を実名に修正してから apply。
-- ════════════════════════════════════════════════════════════════════════

-- 1) source_kind: ('seed_explicit','correction') → +'lifeops'
ALTER TABLE prm_learning_events
  DROP CONSTRAINT IF EXISTS prm_learning_events_source_kind_check;
ALTER TABLE prm_learning_events
  ADD CONSTRAINT prm_learning_events_source_kind_check
  CHECK (source_kind IN ('seed_explicit', 'correction', 'lifeops'));

-- 2) action: ('accept','dismiss','later') → +'done'
ALTER TABLE prm_learning_events
  DROP CONSTRAINT IF EXISTS prm_learning_events_action_check;
ALTER TABLE prm_learning_events
  ADD CONSTRAINT prm_learning_events_action_check
  CHECK (action IN ('accept', 'dismiss', 'later', 'done'));

-- 3) signal: ('adoption','non_adoption','deferral') → +'completion'
ALTER TABLE prm_learning_events
  DROP CONSTRAINT IF EXISTS prm_learning_events_signal_check;
ALTER TABLE prm_learning_events
  ADD CONSTRAINT prm_learning_events_signal_check
  CHECK (signal IN ('adoption', 'non_adoption', 'deferral', 'completion'));

-- ────────────────────────────────────────────────────────────────────────
-- ROLLBACK（手動 revert・docs にも記載）:
--   ★前提: 新値を使う row が **0 件**であること（残っていれば narrow CHECK の ADD が失敗する）。
--     SELECT count(*) FROM prm_learning_events
--       WHERE source_kind = 'lifeops' OR action = 'done' OR signal = 'completion';
--   0 件でない場合は、先に削除/隔離（owner cleanup）:
--     DELETE FROM prm_learning_events WHERE handle LIKE 'lifeops:%';  -- Life Ops 行のみ（既存 seed/correction 行に不接触）
--   その後:
--     ALTER TABLE prm_learning_events DROP CONSTRAINT IF EXISTS prm_learning_events_source_kind_check;
--     ALTER TABLE prm_learning_events ADD CONSTRAINT prm_learning_events_source_kind_check
--       CHECK (source_kind IN ('seed_explicit', 'correction'));
--     ALTER TABLE prm_learning_events DROP CONSTRAINT IF EXISTS prm_learning_events_action_check;
--     ALTER TABLE prm_learning_events ADD CONSTRAINT prm_learning_events_action_check
--       CHECK (action IN ('accept', 'dismiss', 'later'));
--     ALTER TABLE prm_learning_events DROP CONSTRAINT IF EXISTS prm_learning_events_signal_check;
--     ALTER TABLE prm_learning_events ADD CONSTRAINT prm_learning_events_signal_check
--       CHECK (signal IN ('adoption', 'non_adoption', 'deferral'));
-- ════════════════════════════════════════════════════════════════════════
