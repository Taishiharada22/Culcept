-- legacy compatibility for teacher_outputs.teacher_response_text and ai_eval_runs.overall_score

alter table if exists public.teacher_outputs
  add column if not exists teacher_response_text text;

update public.teacher_outputs
set
  teacher_response = coalesce(teacher_response, teacher_response_text),
  teacher_response_text = coalesce(teacher_response_text, teacher_response)
where
  (teacher_response is null and teacher_response_text is not null)
  or (teacher_response_text is null and teacher_response is not null);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'teacher_outputs'
      and column_name = 'teacher_response_text'
      and is_nullable = 'NO'
  ) then
    execute 'alter table public.teacher_outputs alter column teacher_response_text drop not null';
  end if;
end $$;

alter table if exists public.ai_eval_runs
  add column if not exists overall_score numeric;

update public.ai_eval_runs
set
  score = coalesce(score, overall_score),
  overall_score = coalesce(overall_score, score)
where
  (score is null and overall_score is not null)
  or (overall_score is null and score is not null);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_eval_runs'
      and column_name = 'overall_score'
      and is_nullable = 'NO'
  ) then
    execute 'alter table public.ai_eval_runs alter column overall_score drop not null';
  end if;
end $$;

notify pgrst, 'reload schema';
