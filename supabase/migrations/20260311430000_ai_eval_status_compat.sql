-- legacy compatibility for ai_eval_runs.status

alter table if exists public.ai_eval_runs
  add column if not exists status text;

update public.ai_eval_runs
set status = case
  when passed then 'passed'
  else 'failed'
end
where status is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_eval_runs'
      and column_name = 'status'
      and is_nullable = 'NO'
  ) then
    execute 'alter table public.ai_eval_runs alter column status drop not null';
  end if;
end $$;

notify pgrst, 'reload schema';
