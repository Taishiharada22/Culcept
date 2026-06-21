-- ════════════════════════════════════════════════════════════════════════
-- Travel Core (D-1) — travel_trips / travel_days / travel_itinerary_items /
--   travel_reservations / travel_photos（Phase D local dry-run・**未 remote apply**）
--
-- 設計: docs/travel-location-notes-supabase-schema-plan.md（Phase C / C-1）
--
-- 役割: Concierge Travel Mode の中核 private データ。Calendar 日次詳細
--   （getTravelDayForDate primary-day path）と Travel UI（Dashboard/Schedule/
--   Reservations/Photos）の source of truth。Phase B localStorage はキャッシュへ降格予定。
--
-- 方針（schema plan §1, §2.1 の mirror）:
--   - 全テーブル **RLS owner-only**（auth.uid() = user_id）・service_role 非前提・cross-user 不可。
--   - 共通: id uuid pk default gen_random_uuid() / user_id → auth.users(id) ON DELETE CASCADE /
--     created_at / updated_at（per-table trigger）/ deleted_at（soft delete）。
--   - travel_days unique = (trip_id, date)（同一日 複数 trip 許容・C-1）。Calendar lookup は
--     (user_id, date) 非 unique index → app 層 primary-day 選択（status='active'→start_date→created_at）。
--   - 多態参照（photo_id 等）は ON DELETE SET NULL。
--   - 自由文（name/description 等）は機微 private ゆえ owner-only RLS で保護。
--
-- ⚠ **local dry-run のみ（supabase start + db reset で local 適用・検証）**。
--   staging / production への apply は **別 GO**（supabase db push 禁止）。
--   ── rollback / down（新規 table・clean DROP）:
--      DROP TABLE IF EXISTS travel_itinerary_items, travel_reservations,
--        travel_photos, travel_days, travel_trips CASCADE;  -- trigger/policy も連動 drop
--      DROP FUNCTION IF EXISTS travel_set_updated_at() CASCADE;
-- ════════════════════════════════════════════════════════════════════════

-- ── 共通 updated_at trigger 関数（Travel ドメイン共有・冪等）──
CREATE OR REPLACE FUNCTION travel_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════════════════
-- 1.1 travel_trips（Trip 正本）
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS travel_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  destination_label TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  party_size INTEGER NOT NULL DEFAULT 1
    CHECK (party_size >= 1),
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'archived')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT travel_trips_date_order CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_travel_trips_owner_start
  ON travel_trips (user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_travel_trips_owner_status
  ON travel_trips (user_id, status);

DROP TRIGGER IF EXISTS trg_travel_trips_updated_at ON travel_trips;
CREATE TRIGGER trg_travel_trips_updated_at
  BEFORE UPDATE ON travel_trips
  FOR EACH ROW EXECUTE FUNCTION travel_set_updated_at();

ALTER TABLE travel_trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS travel_trips_owner_select ON travel_trips;
CREATE POLICY travel_trips_owner_select ON travel_trips
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_trips_owner_insert ON travel_trips;
CREATE POLICY travel_trips_owner_insert ON travel_trips
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_trips_owner_update ON travel_trips;
CREATE POLICY travel_trips_owner_update ON travel_trips
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_trips_owner_delete ON travel_trips;
CREATE POLICY travel_trips_owner_delete ON travel_trips
  FOR DELETE USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════
-- 1.2 travel_days（TripDay 正本・unique(trip_id,date)・C-1）
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS travel_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES travel_trips(id) ON DELETE CASCADE,

  date DATE NOT NULL,
  day_index INTEGER NOT NULL
    CHECK (day_index >= 1),
  weekday_label TEXT,
  month_day_label TEXT,
  theme TEXT,
  theme_subtitle TEXT,
  weather JSONB,
  -- hero_photo_id は travel_photos 作成後（D-1 内・下部）に FK 追加
  hero_photo_id UUID,
  walking JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  -- C-1: 同一日に複数 trip を許容（出張＋私的旅行）。1日1旅行に縛らない。
  CONSTRAINT travel_days_trip_date_unique UNIQUE (trip_id, date)
);

CREATE INDEX IF NOT EXISTS idx_travel_days_trip_index
  ON travel_days (trip_id, day_index);
-- Calendar lookup 用（非 unique・primary-day は app 層で選択）
CREATE INDEX IF NOT EXISTS idx_travel_days_owner_date
  ON travel_days (user_id, date);

DROP TRIGGER IF EXISTS trg_travel_days_updated_at ON travel_days;
CREATE TRIGGER trg_travel_days_updated_at
  BEFORE UPDATE ON travel_days
  FOR EACH ROW EXECUTE FUNCTION travel_set_updated_at();

ALTER TABLE travel_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS travel_days_owner_select ON travel_days;
CREATE POLICY travel_days_owner_select ON travel_days
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_days_owner_insert ON travel_days;
CREATE POLICY travel_days_owner_insert ON travel_days
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_days_owner_update ON travel_days;
CREATE POLICY travel_days_owner_update ON travel_days
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_days_owner_delete ON travel_days;
CREATE POLICY travel_days_owner_delete ON travel_days
  FOR DELETE USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════
-- 1.9 travel_photos（TravelPhoto 正本）— itinerary_items/reservations より先に作成
--     （photo_id FK 先行のため）。binary は Supabase Storage（owner-only bucket・別途）。
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS travel_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  source TEXT NOT NULL DEFAULT 'placeholder'
    CHECK (source IN ('auto', 'user', 'placeholder')),
  storage_path TEXT,
  url TEXT,
  label TEXT,
  caption TEXT,
  tone TEXT,
  captured_at TIMESTAMPTZ,
  coords JSONB,
  -- 多態リンク（FK は張らない・整合は app 側・schema plan §1.9）
  linked_kind TEXT
    CHECK (linked_kind IS NULL OR linked_kind IN ('day_hero', 'itinerary', 'reservation', 'memory', 'note')),
  linked_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_travel_photos_owner_link
  ON travel_photos (user_id, linked_kind, linked_id);
CREATE INDEX IF NOT EXISTS idx_travel_photos_owner_captured
  ON travel_photos (user_id, captured_at);

DROP TRIGGER IF EXISTS trg_travel_photos_updated_at ON travel_photos;
CREATE TRIGGER trg_travel_photos_updated_at
  BEFORE UPDATE ON travel_photos
  FOR EACH ROW EXECUTE FUNCTION travel_set_updated_at();

ALTER TABLE travel_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS travel_photos_owner_select ON travel_photos;
CREATE POLICY travel_photos_owner_select ON travel_photos
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_photos_owner_insert ON travel_photos;
CREATE POLICY travel_photos_owner_insert ON travel_photos
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_photos_owner_update ON travel_photos;
CREATE POLICY travel_photos_owner_update ON travel_photos
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_photos_owner_delete ON travel_photos;
CREATE POLICY travel_photos_owner_delete ON travel_photos
  FOR DELETE USING (auth.uid() = user_id);

-- travel_days.hero_photo_id → travel_photos(id)（nullable・写真削除で SET NULL）
ALTER TABLE travel_days
  DROP CONSTRAINT IF EXISTS travel_days_hero_photo_fk;
ALTER TABLE travel_days
  ADD CONSTRAINT travel_days_hero_photo_fk
  FOREIGN KEY (hero_photo_id) REFERENCES travel_photos(id) ON DELETE SET NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 1.5 travel_reservations（Reservation 正本）— itinerary_items の reservation_id FK 先行
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS travel_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES travel_trips(id) ON DELETE CASCADE,
  day_id UUID REFERENCES travel_days(id) ON DELETE SET NULL,

  category TEXT NOT NULL
    CHECK (category IN ('宿泊', '食事', '交通', '体験')),
  name TEXT,
  status TEXT,
  confirmation_code TEXT,
  time_label TEXT,
  address TEXT,
  phone TEXT,
  changeable BOOLEAN,
  needs_action BOOLEAN,
  tags JSONB,
  transit_from TEXT,
  transit_to TEXT,
  transit_depart TEXT,
  transit_arrive TEXT,
  seat TEXT,
  check_in TEXT,
  check_out TEXT,
  party_size INTEGER,
  -- actions[].url は提供時のみ（捏造リンク禁止・honesty）
  actions JSONB,
  coords JSONB,
  photo_id UUID REFERENCES travel_photos(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_travel_reservations_trip
  ON travel_reservations (trip_id);
CREATE INDEX IF NOT EXISTS idx_travel_reservations_owner_status
  ON travel_reservations (user_id, status);
CREATE INDEX IF NOT EXISTS idx_travel_reservations_day
  ON travel_reservations (day_id);

DROP TRIGGER IF EXISTS trg_travel_reservations_updated_at ON travel_reservations;
CREATE TRIGGER trg_travel_reservations_updated_at
  BEFORE UPDATE ON travel_reservations
  FOR EACH ROW EXECUTE FUNCTION travel_set_updated_at();

ALTER TABLE travel_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS travel_reservations_owner_select ON travel_reservations;
CREATE POLICY travel_reservations_owner_select ON travel_reservations
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_reservations_owner_insert ON travel_reservations;
CREATE POLICY travel_reservations_owner_insert ON travel_reservations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_reservations_owner_update ON travel_reservations;
CREATE POLICY travel_reservations_owner_update ON travel_reservations
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_reservations_owner_delete ON travel_reservations;
CREATE POLICY travel_reservations_owner_delete ON travel_reservations
  FOR DELETE USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════
-- 1.3 travel_itinerary_items（ScheduleItem 正本）
--     source_location_note_id は D-3 の location_notes 作成後に FK 追加（前方参照回避）。
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS travel_itinerary_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_id UUID NOT NULL REFERENCES travel_days(id) ON DELETE CASCADE,

  start_time TEXT,
  end_time TEXT,
  name TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  address TEXT,
  categories TEXT[],
  duration_min INTEGER,
  photo_id UUID REFERENCES travel_photos(id) ON DELETE SET NULL,
  coords JSONB,
  reservation_id UUID REFERENCES travel_reservations(id) ON DELETE SET NULL,
  transport_to_next JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_kind TEXT NOT NULL DEFAULT 'user_added'
    CHECK (source_kind IN ('fixture', 'user_added', 'imported')),
  -- 「旅程に追加」元 note。FK は D-3 で追加。
  source_location_note_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_travel_itinerary_items_day_sort
  ON travel_itinerary_items (day_id, sort_order);
-- 重複追加ガード（Phase B hasAdded の DB 版・partial unique）
CREATE UNIQUE INDEX IF NOT EXISTS uq_travel_itinerary_items_day_note
  ON travel_itinerary_items (day_id, source_location_note_id)
  WHERE source_location_note_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_travel_itinerary_items_updated_at ON travel_itinerary_items;
CREATE TRIGGER trg_travel_itinerary_items_updated_at
  BEFORE UPDATE ON travel_itinerary_items
  FOR EACH ROW EXECUTE FUNCTION travel_set_updated_at();

ALTER TABLE travel_itinerary_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS travel_itinerary_items_owner_select ON travel_itinerary_items;
CREATE POLICY travel_itinerary_items_owner_select ON travel_itinerary_items
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_itinerary_items_owner_insert ON travel_itinerary_items;
CREATE POLICY travel_itinerary_items_owner_insert ON travel_itinerary_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_itinerary_items_owner_update ON travel_itinerary_items;
CREATE POLICY travel_itinerary_items_owner_update ON travel_itinerary_items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_itinerary_items_owner_delete ON travel_itinerary_items;
CREATE POLICY travel_itinerary_items_owner_delete ON travel_itinerary_items
  FOR DELETE USING (auth.uid() = user_id);
