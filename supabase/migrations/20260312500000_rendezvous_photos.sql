-- ============================================================
-- Rendezvous Photos
-- ユーザーが最大5枚の写真をアップロードし、並び替え可能
-- ============================================================

create table if not exists rendezvous_photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,              -- Supabase Storage path
  display_order smallint not null default 0, -- 0 = primary
  is_primary  boolean not null default false,
  width       int,
  height      int,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Indexes
create index idx_rendezvous_photos_user on rendezvous_photos(user_id);
create unique index idx_rendezvous_photos_user_order on rendezvous_photos(user_id, display_order);

-- RLS
alter table rendezvous_photos enable row level security;

-- Own photos: full access
create policy "Users can manage own photos"
  on rendezvous_photos
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Match counterpart: read only (via candidate relationship)
-- Simplified: allow read if user has an active candidate with the photo owner
create policy "Matched users can view photos"
  on rendezvous_photos
  for select
  using (
    exists (
      select 1 from rendezvous_candidates c
      where c.state in ('delivered', 'a_liked', 'b_liked', 'mutual_liked', 'chat_opened')
        and (
          (c.user_a = auth.uid() and c.user_b = rendezvous_photos.user_id)
          or (c.user_b = auth.uid() and c.user_a = rendezvous_photos.user_id)
        )
    )
  );

-- Updated at trigger
create or replace function update_rendezvous_photos_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_rendezvous_photos_updated_at
  before update on rendezvous_photos
  for each row execute function update_rendezvous_photos_updated_at();
