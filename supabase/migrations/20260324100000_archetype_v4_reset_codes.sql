-- Migration: Reset archetype codes for v4 (27-type 3-layer → 24-type 4-axis)
--
-- What this does:
--   1. Nullify old 3-letter constellation_code in stargazer_resolved_types
--   2. Nullify old constellation_code in stargazer_core_star
--   3. All user axis scores (stargazer_profiles.dimensions) are PRESERVED
--   4. All observation history is PRESERVED
--   5. On next profile access, the new 4-axis resolver will re-calculate types
--
-- Reversibility: Low risk — old codes are outdated and will be replaced by 4-letter codes

-- 1. Reset resolved type codes
UPDATE stargazer_resolved_types
SET constellation_code = NULL,
    confidence = NULL,
    updated_at = now()
WHERE constellation_code IS NOT NULL;

-- 2. Reset core star codes
UPDATE stargazer_core_star
SET constellation_code = NULL,
    updated_at = now()
WHERE constellation_code IS NOT NULL;
