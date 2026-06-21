-- ════════════════════════════════════════════════════════════════════════
-- Location Notes domain (D-3) — location_notes / location_note_saves /
--   location_note_to_itinerary（Phase D local dry-run・**未 remote apply**）
--
-- 設計: docs/travel-location-notes-supabase-schema-plan.md（§1.6-1.8, §2.2, §2.3）
-- 依存: 20260621100000_create_travel_core.sql（travel_photos / travel_itinerary_items / travel_days）
--
-- ⚠ このファイルは **唯一の非 owner-only 読取経路**（location_notes の公開 select）を含む＝
--   最高リスク。owner-only ドメイン（D-1/D-2）から隔離してレビュー・テストする。
--
-- 方針（schema plan §2.2 / C-1）:
--   - 書込（insert/update/delete）: owner-only（auth.uid() = user_id）。
--   - 読込（select）: 自分の全 status OR 公開可視（published + approved + 未削除）のみ。
--   - contributor_type（投稿者属性 local/traveler/self）/ source_type（情報由来）を分離。
--     いずれも **表示/ランキング用メタ（非 security）**。RLS は user_id でのみ判定。
--   - self_memo は published 不可（check 制約）。
--   - ★ **Phase G（共有解禁）まで published を実運用しない＝実質 private のみ**。
--     本 migration は select policy を「書く」のみ。Phase D は policy テスト用途で、
--     production 相当の published 公開データは生成しない。moderation/report/公開 feed UI は Phase G。
--   - saves / note_to_itinerary は owner-only join（hard delete・unique で重複ガード）。
--
-- ⚠ **local dry-run のみ**。staging / production apply は別 GO（db push 禁止）。
--   ── rollback / down:
--      DROP TABLE IF EXISTS location_note_to_itinerary, location_note_saves,
--        location_notes CASCADE;
-- ════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════
-- 1.6 location_notes（LocationItem 正本・private＋将来 public）
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS location_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 投稿者＝所有者
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  kind TEXT NOT NULL
    CHECK (kind IN ('trip', 'spot')),
  prefecture TEXT NOT NULL,
  title TEXT,
  area_label TEXT,
  description TEXT,
  genre TEXT,
  hours TEXT,
  price_level TEXT,
  classification TEXT NOT NULL DEFAULT 'standard'
    CHECK (classification IN ('classic', 'hidden', 'standard')),

  -- C-1 分離: 投稿者属性（誰の視点か）vs 情報由来（出典）。いずれも非 security メタ。
  contributor_type TEXT NOT NULL DEFAULT 'self'
    CHECK (contributor_type IN ('local', 'traveler', 'self')),
  source_type TEXT NOT NULL DEFAULT 'self_memo'
    CHECK (source_type IN ('self_memo', 'firsthand', 'book', 'sns', 'search')),
  author JSONB,

  theme_keys TEXT[],
  tags TEXT[],
  stops TEXT[],
  match_reasons TEXT[],
  rating NUMERIC(2,1) NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  duration_label TEXT,
  tagline TEXT,
  why_special TEXT,
  why_hidden TEXT,
  spot_count INTEGER,
  match_pct INTEGER,
  photo_id UUID REFERENCES travel_photos(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'private'
    CHECK (status IN ('draft', 'private', 'published', 'hidden', 'reported')),
  moderation_status TEXT NOT NULL DEFAULT 'none'
    CHECK (moderation_status IN ('none', 'pending', 'approved', 'rejected')),
  report_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  -- self_memo（自分メモ）は公開不可＝常に owner-only（draft/private のみ）
  CONSTRAINT location_notes_self_memo_private CHECK (
    source_type <> 'self_memo' OR status IN ('draft', 'private')
  )
);

CREATE INDEX IF NOT EXISTS idx_location_notes_owner_status
  ON location_notes (user_id, status);
CREATE INDEX IF NOT EXISTS idx_location_notes_pref_status
  ON location_notes (prefecture, status);
-- 公開 feed 用
CREATE INDEX IF NOT EXISTS idx_location_notes_status_moderation
  ON location_notes (status, moderation_status);
CREATE INDEX IF NOT EXISTS idx_location_notes_theme_keys
  ON location_notes USING GIN (theme_keys);
CREATE INDEX IF NOT EXISTS idx_location_notes_tags
  ON location_notes USING GIN (tags);

DROP TRIGGER IF EXISTS trg_location_notes_updated_at ON location_notes;
CREATE TRIGGER trg_location_notes_updated_at
  BEFORE UPDATE ON location_notes
  FOR EACH ROW EXECUTE FUNCTION travel_set_updated_at();

ALTER TABLE location_notes ENABLE ROW LEVEL SECURITY;

-- ── 読込: owner（全 status）OR 公開可視（published+approved+未削除）──
--    ★ これが唯一の cross-user 読取経路。Phase G まで published を作らない＝実質 private のみ。
DROP POLICY IF EXISTS location_notes_read ON location_notes;
CREATE POLICY location_notes_read ON location_notes
  FOR SELECT USING (
    auth.uid() = user_id
    OR (status = 'published' AND moderation_status = 'approved' AND deleted_at IS NULL)
  );

-- ── 書込: owner-only ──
DROP POLICY IF EXISTS location_notes_owner_insert ON location_notes;
CREATE POLICY location_notes_owner_insert ON location_notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS location_notes_owner_update ON location_notes;
CREATE POLICY location_notes_owner_update ON location_notes
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS location_notes_owner_delete ON location_notes;
CREATE POLICY location_notes_owner_delete ON location_notes
  FOR DELETE USING (auth.uid() = user_id);

-- travel_itinerary_items.source_location_note_id → location_notes(id)（前方参照を解決）
ALTER TABLE travel_itinerary_items
  DROP CONSTRAINT IF EXISTS travel_itinerary_items_source_note_fk;
ALTER TABLE travel_itinerary_items
  ADD CONSTRAINT travel_itinerary_items_source_note_fk
  FOREIGN KEY (source_location_note_id) REFERENCES location_notes(id) ON DELETE SET NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 1.7 location_note_saves（保存/heart・owner-only・hard delete）
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS location_note_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_note_id UUID NOT NULL REFERENCES location_notes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT location_note_saves_unique UNIQUE (user_id, location_note_id)
);

ALTER TABLE location_note_saves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS location_note_saves_owner_select ON location_note_saves;
CREATE POLICY location_note_saves_owner_select ON location_note_saves
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS location_note_saves_owner_insert ON location_note_saves;
CREATE POLICY location_note_saves_owner_insert ON location_note_saves
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS location_note_saves_owner_delete ON location_note_saves;
CREATE POLICY location_note_saves_owner_delete ON location_note_saves
  FOR DELETE USING (auth.uid() = user_id);
-- update なし（トグル＝insert/delete のみ）

-- ════════════════════════════════════════════════════════════════════════
-- 1.8 location_note_to_itinerary（ノート→旅程 追加履歴・owner-only・hard delete）
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS location_note_to_itinerary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_note_id UUID NOT NULL REFERENCES location_notes(id) ON DELETE CASCADE,
  itinerary_item_id UUID REFERENCES travel_itinerary_items(id) ON DELETE CASCADE,
  day_id UUID REFERENCES travel_days(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT location_note_to_itinerary_unique UNIQUE (user_id, location_note_id, day_id)
);

ALTER TABLE location_note_to_itinerary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS location_note_to_itinerary_owner_select ON location_note_to_itinerary;
CREATE POLICY location_note_to_itinerary_owner_select ON location_note_to_itinerary
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS location_note_to_itinerary_owner_insert ON location_note_to_itinerary;
CREATE POLICY location_note_to_itinerary_owner_insert ON location_note_to_itinerary
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS location_note_to_itinerary_owner_delete ON location_note_to_itinerary;
CREATE POLICY location_note_to_itinerary_owner_delete ON location_note_to_itinerary
  FOR DELETE USING (auth.uid() = user_id);
