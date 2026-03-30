-- Stargazer adaptive-q2 question assetization
-- - persist adaptive questions into stargazer_question_pool
-- - attach serve context to stargazer_question_shown

alter table public.stargazer_question_shown
  add column if not exists delivery_source text,
  add column if not exists served_context jsonb not null default '{}'::jsonb,
  add column if not exists next_question_key text;

create or replace function public.record_pool_question_shown(
  p_user_id uuid,
  p_question_key text,
  p_shown_at date default current_date,
  p_delivery_source text default null,
  p_served_context jsonb default '{}'::jsonb
) returns boolean
language plpgsql
security definer
as $$
begin
  insert into public.stargazer_question_shown (
    user_id,
    question_key,
    shown_at,
    answered,
    delivery_source,
    served_context
  ) values (
    p_user_id,
    p_question_key,
    coalesce(p_shown_at, current_date),
    false,
    p_delivery_source,
    coalesce(p_served_context, '{}'::jsonb)
  )
  on conflict (user_id, question_key, shown_at)
  do update set
    delivery_source = coalesce(excluded.delivery_source, stargazer_question_shown.delivery_source),
    served_context = case
      when excluded.served_context is null or excluded.served_context = '{}'::jsonb
        then stargazer_question_shown.served_context
      else excluded.served_context
    end;

  perform public.recompute_pool_question_metrics(p_question_key);

  return true;
end;
$$;
