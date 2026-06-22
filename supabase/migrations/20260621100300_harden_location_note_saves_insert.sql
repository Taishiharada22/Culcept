-- ════════════════════════════════════════════════════════════════════════
-- Phase E-3B-1: location_note_saves INSERT policy hardening（local dry-run・**未 remote apply**）
--
-- 背景: 旧 INSERT policy は WITH CHECK (auth.uid()=user_id) のみ。FK(location_note_id→location_notes)
--   の存在チェックは RLS をバイパスするため、**可視でない他人の private note を参照する save 行**を
--   insert できてしまう（content leak は無いが phantom save / uuid existence oracle）。E-3B probe で実証。
--
-- 修正: save 可能な location_note_id を「可視な note」に限定する。
--   ① 自分が owner の note（未削除）  ② published ∧ approved ∧ 未削除 の公開 note
--   それ以外（他人の private/draft/reported/hidden/未approved/deleted）は insert 不可。
--   ※ deleted（soft delete）は own/public いずれも save 不可（deleted_at IS NULL を全体条件に）。
--
-- select / delete（owner-only）と unique(user_id, location_note_id) は **不変**（本 migration では触れない）。
--
-- ⚠ **local dry-run のみ**。staging / production apply は別 GO（db push 禁止）。
--   ── rollback / down（旧 owner-only insert policy に戻す）:
--      DROP POLICY IF EXISTS location_note_saves_owner_insert ON location_note_saves;
--      CREATE POLICY location_note_saves_owner_insert ON location_note_saves
--        FOR INSERT WITH CHECK (auth.uid() = user_id);
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS location_note_saves_owner_insert ON location_note_saves;
CREATE POLICY location_note_saves_owner_insert ON location_note_saves
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM location_notes ln
      WHERE ln.id = location_note_id
        AND ln.deleted_at IS NULL
        AND (
          ln.user_id = auth.uid()
          OR (ln.status = 'published' AND ln.moderation_status = 'approved')
        )
    )
  );
