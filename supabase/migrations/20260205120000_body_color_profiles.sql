create table if not exists public.user_body_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    cfv jsonb not null default '{}'::jsonb,
    display_labels jsonb not null default '{}'::jsonb,
    confidence jsonb not null default '{}'::jsonb,
    updated_at timestamptz default now()
);

create table if not exists public.user_body_measurements (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    measurements jsonb not null default '{}'::jsonb,
    measured_at timestamptz default now()
);

create index if not exists user_body_measurements_user_idx
    on public.user_body_measurements (user_id, measured_at desc);

create table if not exists public.garment_fit_profiles (
    product_id uuid primary key,
    category text,
    intended_fit text,
    pattern jsonb not null default '{}'::jsonb,
    fabric jsonb not null default '{}'::jsonb,
    updated_at timestamptz default now()
);

create table if not exists public.user_personal_color_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    cpv jsonb not null default '{}'::jsonb,
    labels jsonb not null default '{}'::jsonb,
    palette jsonb not null default '{}'::jsonb,
    updated_at timestamptz default now()
);

create table if not exists public.garment_color_profiles (
    product_id uuid primary key,
    dominant_colors jsonb[] not null default '{}'::jsonb[],
    updated_at timestamptz default now()
);

create index if not exists user_body_profiles_cfv_gin
    on public.user_body_profiles using gin (cfv);

create index if not exists user_body_measurements_measurements_gin
    on public.user_body_measurements using gin (measurements);

create index if not exists garment_fit_profiles_pattern_gin
    on public.garment_fit_profiles using gin (pattern);

create index if not exists garment_fit_profiles_fabric_gin
    on public.garment_fit_profiles using gin (fabric);

create index if not exists user_personal_color_profiles_cpv_gin
    on public.user_personal_color_profiles using gin (cpv);

create index if not exists garment_color_profiles_dominant_colors_gin
    on public.garment_color_profiles using gin (dominant_colors);
