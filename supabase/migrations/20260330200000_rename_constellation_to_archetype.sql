-- Migration: Rename constellation_code/constellation_label → archetype_code/archetype_label
-- This is a BREAKING rename. All application code has been updated to use archetype_*.
--
-- Steps:
--   1. Drop the GENERATED alias columns (from 20260330100000_archetype_column_aliases.sql)
--   2. Rename the original constellation_* columns to archetype_*
--   3. Update comments
--
-- Tables affected:
--   stargazer_core_star
--   stargazer_orbit_snapshots
--   stargazer_resolved_types

-- ─── Step 1: Drop GENERATED alias columns (if they exist) ───

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stargazer_core_star' AND column_name = 'archetype_code'
  ) THEN
    ALTER TABLE stargazer_core_star DROP COLUMN archetype_code;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stargazer_core_star' AND column_name = 'archetype_label'
  ) THEN
    ALTER TABLE stargazer_core_star DROP COLUMN archetype_label;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stargazer_orbit_snapshots' AND column_name = 'archetype_code'
  ) THEN
    ALTER TABLE stargazer_orbit_snapshots DROP COLUMN archetype_code;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stargazer_orbit_snapshots' AND column_name = 'archetype_label'
  ) THEN
    ALTER TABLE stargazer_orbit_snapshots DROP COLUMN archetype_label;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stargazer_resolved_types' AND column_name = 'archetype_code'
  ) THEN
    ALTER TABLE stargazer_resolved_types DROP COLUMN archetype_code;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stargazer_resolved_types' AND column_name = 'archetype_label'
  ) THEN
    ALTER TABLE stargazer_resolved_types DROP COLUMN archetype_label;
  END IF;
END $$;

-- ─── Step 2: Rename constellation_* → archetype_* ───

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stargazer_core_star' AND column_name = 'constellation_code'
  ) THEN
    ALTER TABLE stargazer_core_star RENAME COLUMN constellation_code TO archetype_code;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stargazer_core_star' AND column_name = 'constellation_label'
  ) THEN
    ALTER TABLE stargazer_core_star RENAME COLUMN constellation_label TO archetype_label;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stargazer_orbit_snapshots' AND column_name = 'constellation_code'
  ) THEN
    ALTER TABLE stargazer_orbit_snapshots RENAME COLUMN constellation_code TO archetype_code;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stargazer_orbit_snapshots' AND column_name = 'constellation_label'
  ) THEN
    ALTER TABLE stargazer_orbit_snapshots RENAME COLUMN constellation_label TO archetype_label;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stargazer_resolved_types' AND column_name = 'constellation_code'
  ) THEN
    ALTER TABLE stargazer_resolved_types RENAME COLUMN constellation_code TO archetype_code;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stargazer_resolved_types' AND column_name = 'constellation_label'
  ) THEN
    ALTER TABLE stargazer_resolved_types RENAME COLUMN constellation_label TO archetype_label;
  END IF;
END $$;

-- ─── Step 3: Update comments ───

COMMENT ON COLUMN stargazer_core_star.archetype_code IS 'Archetype code (e.g. ACIO, SVEX). Renamed from constellation_code.';
COMMENT ON COLUMN stargazer_core_star.archetype_label IS 'Archetype display label (e.g. 建築家). Renamed from constellation_label.';
COMMENT ON COLUMN stargazer_orbit_snapshots.archetype_code IS 'Archetype code at snapshot time. Renamed from constellation_code.';
COMMENT ON COLUMN stargazer_orbit_snapshots.archetype_label IS 'Archetype display label at snapshot time. Renamed from constellation_label.';
COMMENT ON COLUMN stargazer_resolved_types.archetype_code IS 'Resolved archetype code. Renamed from constellation_code.';

-- archetype_label may not exist on resolved_types (original schema had no constellation_label)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stargazer_resolved_types' AND column_name = 'archetype_label'
  ) THEN
    COMMENT ON COLUMN stargazer_resolved_types.archetype_label IS 'Resolved archetype display label. Renamed from constellation_label.';
  END IF;
END $$;
