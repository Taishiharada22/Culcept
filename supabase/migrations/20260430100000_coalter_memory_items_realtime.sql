-- ─────────────────────────────────────────────────────────────────────────────
-- CoAlter Stage 4 B-3.4 — Memory items Realtime publication 追加
--
-- 正本: layout plan v0.3 §7.7 / supabase realtime channel 仕様
--
-- 本 migration は coalter_memory_items を supabase_realtime publication に
-- 追加する。client は channel `coalter_memory:${pairId}` 経由で
-- INSERT/UPDATE/DELETE event を listen 可能になる。
--
-- security boundary (二重防御):
--   - RLS (1 次): 既存 SELECT policy (pair member + 片側可視性 gate) で broadcast
--     時にも enforce される (Supabase Realtime が subscriber session の RLS を評価)
--   - filter (2 次): `pair_id=eq.${pairId}` は performance 最適化、別 pair の event
--     を server-side で早期 short-circuit
--   - client `shouldDisplay` (3 次、defense in depth): visibility / expires /
--     viewer scope を client 側でも check
--
-- 冪等性: 既存 publication 追加済なら skip (再 push safe)。
--
-- rollback (decision-log §B-3.4 参照):
--   別 migration `<timestamp>_revert_coalter_memory_items_realtime.sql` を作成し
--   `ALTER PUBLICATION supabase_realtime DROP TABLE public.coalter_memory_items`
--   を冪等性付きで実行。env / DB table / 既存 RLS は touch しない。
--
-- supabase db push timing: 本 migration file commit + push 後、preview build
-- + smoke check + CEO 確認を経てから CEO が手動で `supabase db push` 実行。
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'coalter_memory_items'
    ) then
      execute 'alter publication supabase_realtime add table public.coalter_memory_items';
    end if;
  end if;
end $$;
