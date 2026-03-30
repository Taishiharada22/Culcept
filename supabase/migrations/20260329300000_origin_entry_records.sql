-- Origin Entry Records — 判断ベースの日次エントリー
-- localStorage との双方向同期（β運用用）

create table if not exists origin_entry_records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  category    text not null check (category in (
    'work_decision','relationship','time_allocation','self_care','money','nothing_special'
  )),
  note        text,
  recorded_at timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- 1ユーザー1日1レコード
  unique (user_id, date)
);

-- RLS
alter table origin_entry_records enable row level security;

create policy "Users can read own entry records"
  on origin_entry_records for select
  using (auth.uid() = user_id);

create policy "Users can insert own entry records"
  on origin_entry_records for insert
  with check (auth.uid() = user_id);

create policy "Users can update own entry records"
  on origin_entry_records for update
  using (auth.uid() = user_id);

-- Index for listing by date
create index idx_origin_entry_records_user_date
  on origin_entry_records (user_id, date desc);
