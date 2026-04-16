-- CoAlter Plan Shelf: RLS ポリシー修正
--
-- 修正点:
--   INSERT ポリシーの thread_id 未修飾参照をテーブル修飾に変更。
--   元の SQL では `ps.thread_id = thread_id` の unqualified thread_id が
--   サブクエリ内スコープの `ps.thread_id` に解決されてトートロジー（常にTRUE）
--   となり、本来の「挿入対象 row の thread_id と pair_state の thread_id が一致」
--   というチェックが機能していなかった。
--
--   追加で、INSERT 対象カラムの NEW 参照を明示するため column-qualified の書き方に統一。
--
-- 影響:
--   - 既存 row は影響なし（SELECT/DELETE ポリシーは変更なし）
--   - INSERT は「ペアに参加しているユーザーが自分の thread に自分名義で追加」に限定される
--     (従来も created_by = auth.uid() の第一条件で最終的には自分名義のみだったが、
--      thread 一致チェックが抜けていた）

DROP POLICY IF EXISTS "coalter_plan_insert" ON coalter_plan_items;

CREATE POLICY "coalter_plan_insert" ON coalter_plan_items
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM coalter_pair_states ps
      WHERE ps.thread_id = coalter_plan_items.thread_id
        AND auth.uid() IN (ps.user_a, ps.user_b)
        AND ps.state = 'enabled'
    )
  );
