-- ============================================================
-- Rendezvous 200% Plan – Phase 1 Tables
-- ============================================================

-- Avatar Journey Events (Feature 1 + 4)
create table if not exists avatar_journey_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid,
  event_type text not null,
  emotion_state text not null default 'curious',
  narrative_ja text not null,
  metadata jsonb default '{}'::jsonb,
  time_slot text,
  created_at timestamptz default now()
);
create index if not exists idx_journey_events_user on avatar_journey_events(user_id, created_at desc);
create index if not exists idx_journey_events_candidate on avatar_journey_events(candidate_id) where candidate_id is not null;
alter table avatar_journey_events enable row level security;
create policy "Users see own journey" on avatar_journey_events for select using (auth.uid() = user_id);
create policy "Server inserts journey" on avatar_journey_events for insert with check (true);

-- Self Discovery Cards (Feature 2)
create table if not exists self_discovery_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid,
  card_type text not null,
  title_ja text not null,
  body_ja text not null,
  subtext_ja text,
  data_points jsonb default '{}'::jsonb,
  milestone_trigger text,
  significance float default 0.5,
  seen_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_discovery_user on self_discovery_cards(user_id, created_at desc);
alter table self_discovery_cards enable row level security;
create policy "Users see own cards" on self_discovery_cards for select using (auth.uid() = user_id);
create policy "Users update own cards" on self_discovery_cards for update using (auth.uid() = user_id);
create policy "Server inserts cards" on self_discovery_cards for insert with check (true);

-- Memory Crystals (Feature 6)
create table if not exists rendezvous_memory_crystals (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  detected_by_user_id uuid not null references auth.users(id) on delete cascade,
  crystal_type text not null,
  crystal_name_ja text not null,
  color_hex text not null,
  shape text not null default 'round',
  message_range_start timestamptz not null,
  message_range_end timestamptz not null,
  context_snippet text,
  shared boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_crystals_candidate on rendezvous_memory_crystals(candidate_id, created_at desc);
create index if not exists idx_crystals_user on rendezvous_memory_crystals(detected_by_user_id);
alter table rendezvous_memory_crystals enable row level security;
create policy "Crystal owners see" on rendezvous_memory_crystals for select
  using (
    detected_by_user_id = auth.uid()
    or (shared = true and candidate_id in (
      select id from rendezvous_candidates where user_a = auth.uid() or user_b = auth.uid()
    ))
  );
create policy "Server inserts crystals" on rendezvous_memory_crystals for insert with check (true);

-- Relationship Metamorphosis Signals (Feature 7)
create table if not exists relationship_metamorphosis_signals (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_type text not null,
  direction text not null,
  magnitude float not null default 0,
  whisper_ja text,
  data_snapshot jsonb default '{}'::jsonb,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_metamorphosis_candidate on relationship_metamorphosis_signals(candidate_id, created_at desc);
alter table relationship_metamorphosis_signals enable row level security;
create policy "Users see own signals" on relationship_metamorphosis_signals for select using (auth.uid() = user_id);
create policy "Users ack signals" on relationship_metamorphosis_signals for update using (auth.uid() = user_id);
create policy "Server inserts signals" on relationship_metamorphosis_signals for insert with check (true);
