-- teacher_outputs legacy compatibility for environments that still require source_ai_run_id

alter table if exists public.teacher_outputs
  add column if not exists source_ai_run_id uuid references public.ai_runs(id) on delete set null;

update public.teacher_outputs
set
  ai_run_id = coalesce(ai_run_id, source_ai_run_id),
  source_ai_run_id = coalesce(source_ai_run_id, ai_run_id)
where
  (ai_run_id is null and source_ai_run_id is not null)
  or (source_ai_run_id is null and ai_run_id is not null);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'teacher_outputs'
      and column_name = 'source_ai_run_id'
      and is_nullable = 'NO'
  ) then
    execute 'alter table public.teacher_outputs alter column source_ai_run_id drop not null';
  end if;
end $$;

create index if not exists idx_teacher_outputs_source_ai_run_id
  on public.teacher_outputs(source_ai_run_id);

notify pgrst, 'reload schema';
