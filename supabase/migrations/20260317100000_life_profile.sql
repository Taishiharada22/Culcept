-- #3 Life Profile (人生の輪郭) — Supabase永続化
-- Origin のライフプロフィールデータを格納

create table if not exists life_profile_entries (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text not null check (category in (
    'skills','family','pets','romantic','friendships',
    'passions','life_events','career','living','values'
  )),
  title       text not null,
  note        text,
  thumbnail   text,  -- base64 data URL (compressed)
  voice_transcript text,
  location    jsonb, -- { latitude, longitude, label }
  depth_responses jsonb not null default '[]'::jsonb,
  active      boolean not null default true,
  since       text,  -- yyyy-MM format
  until       text,
  impact      integer not null default 3 check (impact between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_life_profile_user on life_profile_entries(user_id);
create index if not exists idx_life_profile_category on life_profile_entries(user_id, category);

-- Rendezvous同意 + メタ
create table if not exists life_profile_meta (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  rendezvous_consent_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- RLS
alter table life_profile_entries enable row level security;
alter table life_profile_meta enable row level security;

create policy "Users can manage own life_profile_entries"
  on life_profile_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own life_profile_meta"
  on life_profile_meta for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- #4 Rendezvous シグナルキャッシュ
-- Origin → Rendezvous パイプラインの生成結果を保持
create table if not exists rendezvous_origin_signals (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  signals       jsonb not null,  -- RendezvousSignal 型
  generated_at  timestamptz not null default now()
);

alter table rendezvous_origin_signals enable row level security;

create policy "Users can manage own origin_signals"
  on rendezvous_origin_signals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
