-- talk_messages に media_url カラム追加（画像共有用）
ALTER TABLE talk_messages ADD COLUMN IF NOT EXISTS media_url text;

-- Supabase Storage バケット（存在しない場合のみ作成）
INSERT INTO storage.buckets (id, name, public)
VALUES ('talk-media', 'talk-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: スレッド参加者のみアップロード可能
CREATE POLICY "talk_media_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'talk-media' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "talk_media_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'talk-media');
