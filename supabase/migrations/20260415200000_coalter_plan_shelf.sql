-- CoAlter Plan Shelf: 採用候補の一時保持（Phase 1.5）
-- 設計文書: docs/coalter-master-design.md

CREATE TABLE IF NOT EXISTS coalter_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL,
  session_id UUID NOT NULL REFERENCES coalter_sessions(id),
  -- 対象日（例: '2026-04-17'）
  target_date DATE NOT NULL,
  -- 時間帯（例: '12:00-14:00'、NULLなら未定）
  time_slot TEXT,
  -- 候補情報
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  practical_info TEXT,
  url TEXT,
  -- カテゴリ（food / movie / activity / shopping / other）
  category TEXT NOT NULL DEFAULT 'other',
  -- 並び順（時系列）
  sort_order INT NOT NULL DEFAULT 0,
  -- 作成者
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coalter_plan_thread_date
  ON coalter_plan_items (thread_id, target_date, sort_order);

-- RLS: ペアメンバーのみアクセス可能
ALTER TABLE coalter_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coalter_plan_select" ON coalter_plan_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM coalter_pair_states ps
      WHERE ps.thread_id = coalter_plan_items.thread_id
        AND auth.uid() IN (ps.user_a, ps.user_b)
    )
  );

CREATE POLICY "coalter_plan_insert" ON coalter_plan_items
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM coalter_pair_states ps
      WHERE ps.thread_id = thread_id
        AND auth.uid() IN (ps.user_a, ps.user_b)
        AND ps.state = 'enabled'
    )
  );

CREATE POLICY "coalter_plan_delete" ON coalter_plan_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM coalter_pair_states ps
      WHERE ps.thread_id = coalter_plan_items.thread_id
        AND auth.uid() IN (ps.user_a, ps.user_b)
    )
  );
