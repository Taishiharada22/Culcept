-- ============================================================
-- Orbiter Phase 5: 判断原理 (Decision Principles)
-- existential_digests: 一人につき1レコード (upsert pattern)
-- ============================================================

create table public.orbiter_existential_digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sections jsonb not null default '[]'::jsonb,
  essence text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_orbiter_digest_user unique (user_id)
);

create index idx_orbiter_digest_user on public.orbiter_existential_digests (user_id);

alter table public.orbiter_existential_digests enable row level security;

create policy "select_own" on public.orbiter_existential_digests
  for select using (auth.uid() = user_id);
