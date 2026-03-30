-- Create identity-verification storage bucket (private, 10MB limit)
-- Used by: POST /api/rendezvous/identity-verify
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'identity-verification',
  'identity-verification',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;
