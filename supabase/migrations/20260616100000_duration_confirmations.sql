-- ════════════════════════════════════════════════════════════════════════
-- duration_confirmations — user_confirmed / operator_seed duration 永続 store（RD3c-P2a・**draft / 未 apply**）
--
-- 設計: docs/reality-duration-confirmation-storage-rd3-c-p2-p3-0.md（storage 案 B 採用）
-- 方針（前提を疑った帰結）:
--   - **独立 table**（external_anchors 直カラムにしない）。operator_seed を anchor に置くと user データを汚染し、
--     recurrence instance（1 anchor : N confirmation）を持てないため。rollback は DROP TABLE で clean（anchor 不変）。
--   - **2 次元分離**: duration_basis（compute-grade・leaveBy 計算可否）と provenance_kind（governance・学習/環境/actor）を
--     混同しない。operator_seed も general_user_confirmed も同じ basis='user_confirmed'（compute 同一）・provenance が違う。
--   - **raw 列を持たない**（structured-only）。origin_ref/destination_ref/source_refs/evidence_refs は **opaque**
--     （raw 座標 / polyline / placeId / route payload 不可）。raw title/locationText/companions を載せない。
--   - **5 分 ceil 済 upper bound のみ**（pre-ceil raw seconds 保持禁止）。
--   - RLS owner-only（general_user_confirmed × production のみ user read）+ operator policy（dogfood/staging/operator_seed）。
--     **service_role 非前提**。production default deny。
--
-- ⚠ apply / db push は **別 GO（RD3c-P3a 以降・staging）**。本 file は draft。**local / remote / production apply は NO GO**。
--   Rollback: DROP TABLE duration_confirmations CASCADE;（破壊的だが external_anchors / 他 table は不変）。
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS duration_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- owner（auth.users）。owner integrity は owner-RLS（auth.uid() = user_id）で担保。
  -- composite FK は付けない: operator_seed は実在 anchor を参照せずとも成立する（synthetic / dev）。
  --   将来 user 行の hardening として external_anchors(id, user_id) への conditional FK を検討（RD3c-P3a）。
  user_id UUID NOT NULL,

  -- この confirmation が紐づく source anchor（任意・opaque）。operator_seed は NULL 可。
  source_anchor_ref TEXT,

  -- ── scope（mismatch なら adapter が unusable 判定）──
  target_node_id TEXT NOT NULL,                 -- arrival ERN id
  origin_ref TEXT NOT NULL,                      -- opaque（raw 座標不可）
  destination_ref TEXT NOT NULL,                 -- opaque
  transport_mode TEXT NOT NULL
    CHECK (transport_mode IN ('walk', 'transit', 'car', 'bike', 'unknown')),
  time_band TEXT,                                -- 任意（時間帯）
  subjective_date TEXT NOT NULL,                 -- YYYY-MM-DD
  temporal_scope_ref TEXT NOT NULL,
  route_eta_supply_id TEXT,                      -- どの supply 試行に対する確認か（任意・opaque）
  provider_version TEXT NOT NULL,

  -- ── duration value（5 分 ceil upper bound のみ・raw seconds 不保持）──
  duration_upper_bound_minutes INTEGER NOT NULL
    CHECK (duration_upper_bound_minutes > 0
       AND duration_upper_bound_minutes % 5 = 0
       AND duration_upper_bound_minutes <= 1440),
  duration_lower_bound_minutes INTEGER
    CHECK (duration_lower_bound_minutes IS NULL
       OR (duration_lower_bound_minutes >= 0
       AND duration_lower_bound_minutes <= duration_upper_bound_minutes)),

  -- ── compute-grade（DAG projection allowlist・heuristic/none は不可）──
  duration_basis TEXT NOT NULL
    CHECK (duration_basis IN ('external_route', 'cached_route', 'scheduled', 'user_confirmed')),

  -- ── governance（provenance・compute と分離）──
  provenance_kind TEXT NOT NULL
    CHECK (provenance_kind IN (
      'general_user_confirmed', 'operator_seed', 'dogfood_seed', 'staging_seed',
      'imported_scheduled', 'cached_route', 'external_route'
    )),
  actor_type TEXT NOT NULL
    CHECK (actor_type IN ('user', 'operator', 'system')),
  environment TEXT NOT NULL
    CHECK (environment IN ('dogfood', 'staging', 'production')),
  learning_eligible BOOLEAN NOT NULL,
  production_eligible BOOLEAN NOT NULL,

  -- ── provenance refs（opaque）──
  source_refs TEXT[] NOT NULL DEFAULT '{}',
  evidence_refs TEXT[] NOT NULL DEFAULT '{}',
  confirmed_by TEXT NOT NULL,                    -- actor の opaque id（user は user_id 相当・operator は operator id）
  confirmed_at TIMESTAMPTZ NOT NULL,
  confirmation_scope TEXT,                       -- scope key（任意・derived）
  created_by_slice TEXT NOT NULL,                -- audit（例 RD3c-P3a）

  -- ── freshness ──
  freshness_status TEXT
    CHECK (freshness_status IS NULL OR freshness_status IN ('fresh', 'stale', 'expired')),
  valid_until TIMESTAMPTZ,

  -- ── lifecycle（物理削除しない＝audit）──
  superseded_by UUID,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ── governance 不変条件（DB レベル強制）──
  -- learning_eligible=true は general_user_confirmed ∧ production ∧ actor=user の時のみ。
  CONSTRAINT duration_confirmations_learning_eligible_chk CHECK (
    learning_eligible = false
    OR (provenance_kind = 'general_user_confirmed' AND environment = 'production' AND actor_type = 'user')
  ),
  -- general_user_confirmed ⟹ actor=user ∧ environment=production。
  CONSTRAINT duration_confirmations_general_user_chk CHECK (
    provenance_kind <> 'general_user_confirmed'
    OR (actor_type = 'user' AND environment = 'production')
  ),
  -- operator が作るのは dogfood/staging のみ（production user データを作らない）。
  CONSTRAINT duration_confirmations_operator_env_chk CHECK (
    actor_type <> 'operator' OR environment IN ('dogfood', 'staging')
  ),
  -- seed 系（operator/dogfood/staging）は production に置かない。
  CONSTRAINT duration_confirmations_seed_env_chk CHECK (
    provenance_kind NOT IN ('operator_seed', 'dogfood_seed', 'staging_seed')
    OR environment <> 'production'
  )
);

-- ── indexes ──
-- usable confirmation lookup（owner × scope）
CREATE INDEX IF NOT EXISTS idx_duration_confirmations_owner_scope
  ON duration_confirmations (user_id, target_node_id, subjective_date, transport_mode);
-- governance segregation（operator/user read path 分離の補助）
CREATE INDEX IF NOT EXISTS idx_duration_confirmations_provenance_env
  ON duration_confirmations (provenance_kind, environment);
-- 失効 sweep
CREATE INDEX IF NOT EXISTS idx_duration_confirmations_valid_until
  ON duration_confirmations (user_id, valid_until)
  WHERE valid_until IS NOT NULL;

-- ── updated_at trigger ──
CREATE OR REPLACE FUNCTION public.duration_confirmations_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS duration_confirmations_set_updated_at_trigger ON duration_confirmations;
CREATE TRIGGER duration_confirmations_set_updated_at_trigger
  BEFORE UPDATE ON duration_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION public.duration_confirmations_set_updated_at();

-- ── RLS（service_role 非前提・production default deny）──
ALTER TABLE duration_confirmations ENABLE ROW LEVEL SECURITY;

-- owner（一般 user）: 自分の general_user_confirmed × production 行のみ read。
--   operator_seed / dogfood_seed / staging_seed 行は **構造的に見えない**（learning/user-facing 汚染防止）。
CREATE POLICY duration_confirmations_owner_select ON duration_confirmations
  FOR SELECT USING (
    auth.uid() = user_id
    AND provenance_kind = 'general_user_confirmed'
    AND environment = 'production'
  );

-- owner insert（draft・write は RD3c-P4 別 GO）: general_user_confirmed × production × user のみ。
CREATE POLICY duration_confirmations_owner_insert ON duration_confirmations
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND provenance_kind = 'general_user_confirmed'
    AND environment = 'production'
    AND actor_type = 'user'
    AND learning_eligible = true
  );

-- operator policy（draft・predicate は RD3c-P3a で確定）: reality_operator claim を持つ session のみ
--   operator/dogfood/staging seed を read/write。claim 不在 = false = default deny（service_role 非使用）。
--   ⚠ 'reality_operator' JWT claim の発行は RD3c-P3a で設計（本 draft は default-deny 安全側）。
CREATE POLICY duration_confirmations_operator_select ON duration_confirmations
  FOR SELECT USING (
    COALESCE((auth.jwt() ->> 'reality_operator')::boolean, false) = true
    AND provenance_kind IN ('operator_seed', 'dogfood_seed', 'staging_seed')
    AND environment IN ('dogfood', 'staging')
  );

CREATE POLICY duration_confirmations_operator_insert ON duration_confirmations
  FOR INSERT WITH CHECK (
    COALESCE((auth.jwt() ->> 'reality_operator')::boolean, false) = true
    AND provenance_kind IN ('operator_seed', 'dogfood_seed', 'staging_seed')
    AND environment IN ('dogfood', 'staging')
    AND learning_eligible = false
  );
