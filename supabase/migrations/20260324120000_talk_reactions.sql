-- talk_reactions: Genomeリアクション（共鳴/発見/もっと聞きたい/沁みた）
CREATE TABLE IF NOT EXISTS talk_reactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES talk_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('resonance', 'discovery', 'tell_more', 'moved')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (message_id, user_id, reaction_type)
);

-- RLS
ALTER TABLE talk_reactions ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分が参加するスレッドのメッセージにのみリアクション可能
CREATE POLICY "talk_reactions_select" ON talk_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM talk_messages m
      JOIN talk_threads t ON t.id = m.thread_id
      JOIN genome_connections c ON c.id = t.connection_id
      WHERE m.id = talk_reactions.message_id
        AND (c.requester_id = auth.uid() OR c.target_id = auth.uid())
    )
  );

CREATE POLICY "talk_reactions_insert" ON talk_reactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "talk_reactions_delete" ON talk_reactions
  FOR DELETE USING (user_id = auth.uid());

-- Index
CREATE INDEX idx_talk_reactions_message ON talk_reactions(message_id);
