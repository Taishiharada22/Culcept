-- Experiment Engine Phase 1: 週次行動実験
-- stargazer_experiments: 提案された実験
-- stargazer_experiment_reports: 実験結果の報告

create table if not exists stargazer_experiments (
  id text primary key default 'exp_' || substr(gen_random_uuid()::text, 1, 12),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  title text not null,
  description text not null,
  target_axis text not null,
  target_pattern text not null check (target_pattern in ('avoidance','fixation','contradiction','blind_spot')),
  difficulty text not null check (difficulty in ('micro','small','medium')),
  expected_shift jsonb not null default '{}'::jsonb,
  report_prompt text not null default '',
  status text not null default 'proposed' check (status in ('proposed','accepted','completed','skipped')),
  reason_trace jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists idx_experiments_user_week
  on stargazer_experiments (user_id, week_start);

create table if not exists stargazer_experiment_reports (
  id serial primary key,
  experiment_id text not null references stargazer_experiments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  outcome text not null check (outcome in ('did_it','tried_but_different','could_not','skipped')),
  reflection text,
  surprise_level int not null check (surprise_level between 1 and 5),
  would_repeat boolean not null default false,
  model_update jsonb,
  insight_generated text,
  created_at timestamptz not null default now()
);

-- 計測用: 提案表示数・開始率・完了率・skipped率・could_not率
create table if not exists stargazer_experiment_metrics (
  id serial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  experiment_id text references stargazer_experiments(id) on delete set null,
  event_type text not null check (event_type in ('proposed','viewed','accepted','completed','skipped','could_not')),
  created_at timestamptz not null default now()
);

create index if not exists idx_experiment_metrics_type
  on stargazer_experiment_metrics (event_type, created_at);

-- RLS
alter table stargazer_experiments enable row level security;
alter table stargazer_experiment_reports enable row level security;
alter table stargazer_experiment_metrics enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stargazer_experiments' AND policyname='Users can read own experiments') THEN
    CREATE POLICY "Users can read own experiments" ON stargazer_experiments FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stargazer_experiments' AND policyname='Users can insert own experiments') THEN
    CREATE POLICY "Users can insert own experiments" ON stargazer_experiments FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stargazer_experiments' AND policyname='Users can update own experiments') THEN
    CREATE POLICY "Users can update own experiments" ON stargazer_experiments FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stargazer_experiment_reports' AND policyname='Users can read own reports') THEN
    CREATE POLICY "Users can read own reports" ON stargazer_experiment_reports FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stargazer_experiment_reports' AND policyname='Users can insert own reports') THEN
    CREATE POLICY "Users can insert own reports" ON stargazer_experiment_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stargazer_experiment_metrics' AND policyname='Users can read own metrics') THEN
    CREATE POLICY "Users can read own metrics" ON stargazer_experiment_metrics FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stargazer_experiment_metrics' AND policyname='Users can insert own metrics') THEN
    CREATE POLICY "Users can insert own metrics" ON stargazer_experiment_metrics FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
