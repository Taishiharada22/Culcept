-- ════════════════════════════════════════════════════════════════════════
-- Travel Movement + Memories (D-2) — travel_movement_legs / travel_memories
--   （Phase D local dry-run・**未 remote apply**）
--
-- 設計: docs/travel-location-notes-supabase-schema-plan.md（§1.4, §1.10）
-- 依存: 20260621100000_create_travel_core.sql（travel_trips/days/photos）
--
-- 方針:
--   - travel_movement_legs: MoveLeg 正本・**hard delete**（soft delete 列なし）。
--     状態がトグルで自明・履歴不要（schema plan §共通規約）。owner-only RLS。
--   - travel_memories: MemoriesNote＋旅行後。soft delete 有。owner-only RLS。
--     photo_ids は uuid[]（travel_photos 参照・整合は app 側）。
--   - 両者 RLS owner-only（auth.uid() = user_id）・service_role 非前提。
--
-- ⚠ **local dry-run のみ**。staging / production apply は別 GO（db push 禁止）。
--   ── rollback / down:
--      DROP TABLE IF EXISTS travel_movement_legs, travel_memories CASCADE;
-- ════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════
-- 1.4 travel_movement_legs（MoveLeg 正本・hard delete）
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS travel_movement_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- hard delete でも owner-only RLS のため user_id 必須（C-1）
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_id UUID NOT NULL REFERENCES travel_days(id) ON DELETE CASCADE,

  time TEXT,
  endpoint_kind TEXT
    CHECK (endpoint_kind IS NULL OR endpoint_kind IN ('depart', 'arrive')),
  name TEXT,
  sub TEXT,
  mode TEXT,
  mode_label TEXT,
  duration_text TEXT,
  distance_text TEXT,
  fare_text TEXT,
  is_destination BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- soft delete なし（hard delete）
);

CREATE INDEX IF NOT EXISTS idx_travel_movement_legs_day_sort
  ON travel_movement_legs (day_id, sort_order);

-- updated_at 列なし → trigger なし。

ALTER TABLE travel_movement_legs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS travel_movement_legs_owner_select ON travel_movement_legs;
CREATE POLICY travel_movement_legs_owner_select ON travel_movement_legs
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_movement_legs_owner_insert ON travel_movement_legs;
CREATE POLICY travel_movement_legs_owner_insert ON travel_movement_legs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_movement_legs_owner_update ON travel_movement_legs;
CREATE POLICY travel_movement_legs_owner_update ON travel_movement_legs
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_movement_legs_owner_delete ON travel_movement_legs;
CREATE POLICY travel_movement_legs_owner_delete ON travel_movement_legs
  FOR DELETE USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════
-- 1.10 travel_memories（MemoriesNote＋旅行後）
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS travel_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES travel_trips(id) ON DELETE CASCADE,
  day_id UUID REFERENCES travel_days(id) ON DELETE SET NULL,

  text TEXT,
  photo_ids UUID[],
  summary TEXT,
  highlights JSONB,
  next_learnings JSONB,
  phase TEXT NOT NULL DEFAULT 'after'
    CHECK (phase IN ('before', 'during', 'after')),
  origin_synced BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_travel_memories_owner_trip
  ON travel_memories (user_id, trip_id);
CREATE INDEX IF NOT EXISTS idx_travel_memories_day
  ON travel_memories (day_id);

DROP TRIGGER IF EXISTS trg_travel_memories_updated_at ON travel_memories;
CREATE TRIGGER trg_travel_memories_updated_at
  BEFORE UPDATE ON travel_memories
  FOR EACH ROW EXECUTE FUNCTION travel_set_updated_at();

ALTER TABLE travel_memories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS travel_memories_owner_select ON travel_memories;
CREATE POLICY travel_memories_owner_select ON travel_memories
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_memories_owner_insert ON travel_memories;
CREATE POLICY travel_memories_owner_insert ON travel_memories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_memories_owner_update ON travel_memories;
CREATE POLICY travel_memories_owner_update ON travel_memories
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS travel_memories_owner_delete ON travel_memories;
CREATE POLICY travel_memories_owner_delete ON travel_memories
  FOR DELETE USING (auth.uid() = user_id);
