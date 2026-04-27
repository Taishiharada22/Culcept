-- ─────────────────────────────────────────────────────────────────────────────
-- CoAlter Stage 4 L4-g — Memory items server 正本 schema
--
-- 正本: layout plan v0.3 §7.7 / UI spec §8.3 / Core UX v1.1 §10
--
-- 本 migration は **作成のみ、未実行**。Stage 4 L4-l flip 時に CEO 別審議で実行。
--
-- 3 軸 (UI spec §8.3.1):
--   - origin (3 値): explicit_shared / inferred / transient_summary
--   - certainty (3 値): high / medium / low
--   - visibility (4 値): both_visible / user_a_only / user_b_only / internal_only
--
-- §8.3.4 禁止組み合わせは check 制約 + server side でも enforce。
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.coalter_memory_items (
  id uuid primary key default gen_random_uuid(),
  -- pair_id は coalter_pair_states.id (master §5、既存 PK) への FK
  pair_id uuid not null references public.coalter_pair_states(id) on delete cascade,

  content text not null,

  origin text not null
    check (origin in ('explicit_shared', 'inferred', 'transient_summary')),

  certainty text not null
    check (certainty in ('high', 'medium', 'low')),

  visibility text not null
    check (visibility in ('both_visible', 'user_a_only', 'user_b_only', 'internal_only')),

  mode_context text not null default 'normal'
    check (mode_context in ('normal', 'daily', 'travel')),

  -- §8.3.4 禁止組み合わせの DB-level enforce:
  --   inferred × high × both_visible
  --   transient_summary × high × both_visible
  --   transient_summary × medium × both_visible
  constraint coalter_memory_items_no_forbidden_combinations check (
    not (origin = 'inferred' and certainty = 'high' and visibility = 'both_visible') and
    not (origin = 'transient_summary' and certainty = 'high' and visibility = 'both_visible') and
    not (origin = 'transient_summary' and certainty = 'medium' and visibility = 'both_visible')
  ),

  -- transient_summary の自動消滅時刻
  expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.coalter_memory_items is
  'CoAlter 共有メモリ surface (server 正本、UI spec §8.3 / Core UX §10)。pair_id 単位、3 軸ラベル付与。';

create index if not exists idx_coalter_memory_items_pair_id
  on public.coalter_memory_items (pair_id);

create index if not exists idx_coalter_memory_items_pair_visibility
  on public.coalter_memory_items (pair_id, visibility);

create index if not exists idx_coalter_memory_items_expires_at
  on public.coalter_memory_items (expires_at)
  where expires_at is not null;

-- updated_at 自動更新 trigger
create or replace function public.set_coalter_memory_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_coalter_memory_items_updated_at on public.coalter_memory_items;
create trigger trg_coalter_memory_items_updated_at
  before update on public.coalter_memory_items
  for each row execute function public.set_coalter_memory_items_updated_at();

-- RLS: pair_id 経由のメンバーのみ。片側可視性 (user_a_only / user_b_only) は viewer の auth.uid() で gate
alter table public.coalter_memory_items enable row level security;

-- 既存 coalter_pair_states (master §5) の実 schema:
--   - PK: id (UUID)
--   - users: user_a / user_b (UUID、auth.users FK)
drop policy if exists "coalter_memory_items_select_pair_visibility" on public.coalter_memory_items;
create policy "coalter_memory_items_select_pair_visibility"
  on public.coalter_memory_items for select
  using (
    exists (
      select 1 from public.coalter_pair_states cps
      where cps.id = coalter_memory_items.pair_id
        and (cps.user_a = auth.uid() or cps.user_b = auth.uid())
    )
    and (
      visibility = 'both_visible'
      or (visibility = 'user_a_only' and exists (
        select 1 from public.coalter_pair_states cps
        where cps.id = coalter_memory_items.pair_id
          and cps.user_a = auth.uid()
      ))
      or (visibility = 'user_b_only' and exists (
        select 1 from public.coalter_pair_states cps
        where cps.id = coalter_memory_items.pair_id
          and cps.user_b = auth.uid()
      ))
      -- internal_only は client から見えない
    )
  );

drop policy if exists "coalter_memory_items_update_pair_member" on public.coalter_memory_items;
create policy "coalter_memory_items_update_pair_member"
  on public.coalter_memory_items for update
  using (
    exists (
      select 1 from public.coalter_pair_states cps
      where cps.id = coalter_memory_items.pair_id
        and (cps.user_a = auth.uid() or cps.user_b = auth.uid())
    )
  );

-- insert は service_role 経由のみ (master §5)
drop policy if exists "coalter_memory_items_insert_service_only" on public.coalter_memory_items;
create policy "coalter_memory_items_insert_service_only"
  on public.coalter_memory_items for insert
  with check (false);

drop policy if exists "coalter_memory_items_delete_pair_member" on public.coalter_memory_items;
create policy "coalter_memory_items_delete_pair_member"
  on public.coalter_memory_items for delete
  using (
    exists (
      select 1 from public.coalter_pair_states cps
      where cps.id = coalter_memory_items.pair_id
        and (cps.user_a = auth.uid() or cps.user_b = auth.uid())
    )
  );
