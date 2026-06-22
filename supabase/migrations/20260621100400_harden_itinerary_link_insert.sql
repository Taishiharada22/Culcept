-- ════════════════════════════════════════════════════════════════════════
-- Phase E-3C-3: 旅程追加 write の INSERT policy hardening（local dry-run・**未 remote apply**）
--
-- 背景: saves（E-3B-1）と同型で、FK 存在チェックが RLS をバイパスするため
--   旧 INSERT policy（auth.uid()=user_id のみ）では:
--     ① travel_itinerary_items: 他人の day_id を参照する item を自分名義で insert できる（他人の day へ書込）
--     ② location_note_to_itinerary: 可視でない他人の note / 他人の day / 他人の item へ link できる
--   いずれも owner-only を破る。本 migration で「自分の所有・可視」のみに限定する。
--
-- 修正:
--   travel_itinerary_items INSERT: auth.uid()=user_id ∧ day_id が自分の未削除 day。
--   location_note_to_itinerary INSERT: auth.uid()=user_id
--     ∧ location_note 可視（自分の未削除 OR published+approved+未削除）
--     ∧ day_id が自分の未削除 day（NULL 許容）
--     ∧ itinerary_item_id が自分の item（NULL 許容）。
--   select/delete（owner-only）と各 unique 制約は **不変**。
--
-- ⚠ **local dry-run のみ**。staging/production apply は別 GO（db push 禁止）。
--   ── rollback / down（旧 owner-only insert へ戻す）:
--      DROP POLICY IF EXISTS travel_itinerary_items_owner_insert ON travel_itinerary_items;
--      CREATE POLICY travel_itinerary_items_owner_insert ON travel_itinerary_items
--        FOR INSERT WITH CHECK (auth.uid() = user_id);
--      DROP POLICY IF EXISTS location_note_to_itinerary_owner_insert ON location_note_to_itinerary;
--      CREATE POLICY location_note_to_itinerary_owner_insert ON location_note_to_itinerary
--        FOR INSERT WITH CHECK (auth.uid() = user_id);
-- ════════════════════════════════════════════════════════════════════════

-- ① travel_itinerary_items: 自分の未削除 day にのみ item を追加可
DROP POLICY IF EXISTS travel_itinerary_items_owner_insert ON travel_itinerary_items;
CREATE POLICY travel_itinerary_items_owner_insert ON travel_itinerary_items
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM travel_days d
      WHERE d.id = day_id
        AND d.user_id = auth.uid()
        AND d.deleted_at IS NULL
    )
  );

-- ② location_note_to_itinerary: 可視 note ∧ 自分の day ∧ 自分の item にのみ link 可
DROP POLICY IF EXISTS location_note_to_itinerary_owner_insert ON location_note_to_itinerary;
CREATE POLICY location_note_to_itinerary_owner_insert ON location_note_to_itinerary
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM location_notes ln
      WHERE ln.id = location_note_id
        AND ln.deleted_at IS NULL
        AND (
          ln.user_id = auth.uid()
          OR (ln.status = 'published' AND ln.moderation_status = 'approved')
        )
    )
    AND (
      day_id IS NULL OR EXISTS (
        SELECT 1 FROM travel_days d
        WHERE d.id = day_id AND d.user_id = auth.uid() AND d.deleted_at IS NULL
      )
    )
    AND (
      itinerary_item_id IS NULL OR EXISTS (
        SELECT 1 FROM travel_itinerary_items i
        WHERE i.id = itinerary_item_id AND i.user_id = auth.uid()
      )
    )
  );
