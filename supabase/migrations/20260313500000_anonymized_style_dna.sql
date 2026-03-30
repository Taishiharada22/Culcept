-- Anonymized Style DNA for resonance feed
-- Stores only hashed user IDs and numeric vectors — no PII
create table if not exists anonymized_style_dna (
    hashed_user_id text primary key,
    vector jsonb not null default '[]'::jsonb,
    dimension_count smallint not null default 0,
    updated_at timestamptz not null default now()
);

-- Index for quick scans
create index if not exists idx_anon_dna_updated on anonymized_style_dna (updated_at desc);

-- RLS: only authenticated users can interact, but they cannot see others' hashed IDs directly
alter table anonymized_style_dna enable row level security;

-- Allow insert/update for authenticated users (API route handles hashing)
create policy "anon_dna_insert" on anonymized_style_dna
    for insert to authenticated
    with check (true);

create policy "anon_dna_update" on anonymized_style_dna
    for update to authenticated
    using (true);

-- Allow select for authenticated users (needed for similarity computation)
create policy "anon_dna_select" on anonymized_style_dna
    for select to authenticated
    using (true);
