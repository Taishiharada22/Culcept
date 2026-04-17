-- ─────────────────────────────────────────────
-- CoAlter proposal quality (observability v1)
-- 2026-04-18
--
-- 1 提案生成あたり 1 行記録。4-layer パイプラインの各段階が機能しているかを監査する。
-- ユーザー反応（adopted/refined/rerolled/dismissed）は後段イベントで upsert。
-- ─────────────────────────────────────────────

create table if not exists public.coalter_proposal_quality (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coalter_sessions(id) on delete cascade,

  -- Layer 0: brief
  brief_source text not null check (brief_source in ('llm', 'parser_fallback')),
  brief_confidence numeric(3,2) not null,

  -- Layer 1-2: catalog & ranker
  catalog_count integer not null default 0,
  ranked_count integer not null default 0,
  ranking_axes_preset text check (
    ranking_axes_preset is null or
    ranking_axes_preset in (
      'balance_focus',
      'safety_adventure_discovery',
      'calm_stimulating_nostalgic'
    )
  ),

  -- Layer 3: narration
  narration_mode text not null check (narration_mode in ('llm', 'logic_template', 'mixed')),

  -- LLM success flags
  llm_success_layer0 boolean not null default false,
  llm_success_layer3 boolean not null default false,

  -- Latency (ms)
  latency_ms_total integer not null,
  latency_ms_catalog integer not null default 0,
  latency_ms_rank integer not null default 0,
  latency_ms_narration integer not null default 0,

  -- User reaction (populated by follow-up events)
  user_action text check (
    user_action is null or
    user_action in ('adopted', 'refined', 'rerolled', 'dismissed')
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coalter_proposal_quality_session_idx
  on public.coalter_proposal_quality(session_id);
create index if not exists coalter_proposal_quality_created_at_idx
  on public.coalter_proposal_quality(created_at desc);

-- RLS: admin dashboard / internal observability 用途。サービスロールのみアクセス。
alter table public.coalter_proposal_quality enable row level security;

-- サービスロールは全件読み書き可（admin dashboard 用）
create policy "service_role all access"
  on public.coalter_proposal_quality
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- updated_at trigger
create or replace function public.set_updated_at_coalter_proposal_quality()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_coalter_proposal_quality_updated_at
  on public.coalter_proposal_quality;
create trigger trg_coalter_proposal_quality_updated_at
  before update on public.coalter_proposal_quality
  for each row execute function public.set_updated_at_coalter_proposal_quality();

comment on table public.coalter_proposal_quality is
  'CoAlter 4-layer pipeline の品質監査レコード (1 提案 = 1 行)。2026-04-18 追加。';
