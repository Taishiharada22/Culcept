create table if not exists public.shoe_width_master (
  id bigserial primary key,
  audience text not null check (audience in ('women', 'men')),
  foot_length_cm numeric(3,1) not null,
  width_code text not null check (width_code in ('E', '2E', '3E', '4E', '5E')),
  width_rank integer not null,
  max_foot_girth_cm numeric(4,1) not null,
  created_at timestamptz not null default now(),
  unique (audience, foot_length_cm, width_code)
);

insert into public.shoe_width_master
  (audience, foot_length_cm, width_code, width_rank, max_foot_girth_cm)
values
  ('women', 21.0, 'E', 1, 21.6),
  ('women', 21.0, '2E', 2, 22.2),
  ('women', 21.0, '3E', 3, 22.8),
  ('women', 21.5, 'E', 1, 21.9),
  ('women', 21.5, '2E', 2, 22.5),
  ('women', 21.5, '3E', 3, 23.1),
  ('women', 22.0, 'E', 1, 22.2),
  ('women', 22.0, '2E', 2, 22.8),
  ('women', 22.0, '3E', 3, 23.4),
  ('women', 22.5, 'E', 1, 22.5),
  ('women', 22.5, '2E', 2, 23.1),
  ('women', 22.5, '3E', 3, 23.7),
  ('women', 23.0, 'E', 1, 22.8),
  ('women', 23.0, '2E', 2, 23.4),
  ('women', 23.0, '3E', 3, 24.0),
  ('women', 23.0, '4E', 4, 24.6),
  ('women', 23.0, '5E', 5, 25.2),
  ('women', 23.5, 'E', 1, 23.1),
  ('women', 23.5, '2E', 2, 23.7),
  ('women', 23.5, '3E', 3, 24.3),
  ('women', 23.5, '4E', 4, 24.9),
  ('women', 23.5, '5E', 5, 25.5),
  ('women', 24.0, 'E', 1, 23.4),
  ('women', 24.0, '2E', 2, 24.0),
  ('women', 24.0, '3E', 3, 24.6),
  ('women', 24.0, '4E', 4, 25.2),
  ('women', 24.0, '5E', 5, 25.8),
  ('women', 24.5, 'E', 1, 23.7),
  ('women', 24.5, '2E', 2, 24.3),
  ('women', 24.5, '3E', 3, 24.9),
  ('women', 24.5, '4E', 4, 25.5),
  ('women', 24.5, '5E', 5, 26.1),
  ('women', 25.0, 'E', 1, 24.0),
  ('women', 25.0, '2E', 2, 24.6),
  ('women', 25.0, '3E', 3, 25.2),
  ('women', 25.0, '4E', 4, 25.8),
  ('women', 25.0, '5E', 5, 26.4),
  ('women', 25.5, 'E', 1, 24.3),
  ('women', 25.5, '2E', 2, 24.9),
  ('women', 25.5, '3E', 3, 25.5),
  ('women', 25.5, '4E', 4, 26.1),
  ('women', 25.5, '5E', 5, 26.7),
  ('women', 26.0, 'E', 1, 24.6),
  ('women', 26.0, '2E', 2, 25.2),
  ('women', 26.0, '3E', 3, 25.8),
  ('women', 26.0, '4E', 4, 26.4),
  ('women', 26.0, '5E', 5, 27.0),
  ('women', 26.5, 'E', 1, 24.9),
  ('women', 26.5, '2E', 2, 25.5),
  ('women', 26.5, '3E', 3, 26.1),
  ('women', 26.5, '4E', 4, 26.7),
  ('women', 26.5, '5E', 5, 27.3),
  ('women', 27.0, 'E', 1, 25.2),
  ('women', 27.0, '2E', 2, 25.8),
  ('women', 27.0, '3E', 3, 26.4),
  ('women', 27.0, '4E', 4, 27.0),
  ('women', 27.0, '5E', 5, 27.6),
  ('men', 24.0, '2E', 2, 24.3),
  ('men', 24.0, '3E', 3, 24.8),
  ('men', 24.0, '4E', 4, 25.3),
  ('men', 24.5, '2E', 2, 24.6),
  ('men', 24.5, '3E', 3, 25.1),
  ('men', 24.5, '4E', 4, 25.6),
  ('men', 25.0, '2E', 2, 24.9),
  ('men', 25.0, '3E', 3, 25.4),
  ('men', 25.0, '4E', 4, 25.9),
  ('men', 25.5, '2E', 2, 25.2),
  ('men', 25.5, '3E', 3, 25.7),
  ('men', 25.5, '4E', 4, 26.2),
  ('men', 26.0, '2E', 2, 25.5),
  ('men', 26.0, '3E', 3, 26.0),
  ('men', 26.0, '4E', 4, 26.5),
  ('men', 26.5, '2E', 2, 25.8),
  ('men', 26.5, '3E', 3, 26.3),
  ('men', 26.5, '4E', 4, 26.8),
  ('men', 27.0, '2E', 2, 26.1),
  ('men', 27.0, '3E', 3, 26.6),
  ('men', 27.0, '4E', 4, 27.1),
  ('men', 27.5, '2E', 2, 26.4),
  ('men', 27.5, '3E', 3, 26.9),
  ('men', 27.5, '4E', 4, 27.4),
  ('men', 28.0, '2E', 2, 26.7),
  ('men', 28.0, '3E', 3, 27.2),
  ('men', 28.0, '4E', 4, 27.7),
  ('men', 29.0, '2E', 2, 27.3),
  ('men', 29.0, '3E', 3, 27.8),
  ('men', 29.0, '4E', 4, 28.3),
  ('men', 30.0, '2E', 2, 27.9),
  ('men', 30.0, '3E', 3, 28.4),
  ('men', 30.0, '4E', 4, 28.9)
on conflict (audience, foot_length_cm, width_code)
do update set
  width_rank = excluded.width_rank,
  max_foot_girth_cm = excluded.max_foot_girth_cm;

create or replace function public.resolve_shoe_width_code(
  _audience text,
  _foot_length_cm numeric,
  _foot_girth_cm numeric
)
returns text
language plpgsql
stable
as $$
declare
  _rounded_length numeric(3,1);
  _code text;
begin
  _rounded_length := round(_foot_length_cm * 2) / 2.0;

  select m.width_code
    into _code
  from public.shoe_width_master m
  where m.audience = _audience
    and m.foot_length_cm = _rounded_length
    and m.max_foot_girth_cm >= _foot_girth_cm
  order by m.width_rank asc
  limit 1;

  return coalesce(_code, 'manual_required');
end;
$$;
