-- ────────────────────────────────────────────
-- rendezvous_messages（チャットメッセージ）
-- ────────────────────────────────────────────

create table if not exists public.rendezvous_messages (
    id          uuid primary key default gen_random_uuid(),
    thread_id   uuid not null,
    sender_id   uuid not null references auth.users(id) on delete cascade,
    body        text not null,
    created_at  timestamptz not null default now()
);

create index if not exists idx_rendezvous_messages_thread
    on public.rendezvous_messages (thread_id, created_at);

create index if not exists idx_rendezvous_messages_sender
    on public.rendezvous_messages (sender_id);

comment on table public.rendezvous_messages is 'Rendezvousチャットメッセージ（thread_id経由でrendezvous_chatsに紐付く）';

-- RLS
alter table public.rendezvous_messages enable row level security;

-- 自分が参加しているスレッドのメッセージを読める
create policy "rendezvous_messages_select_participant"
    on public.rendezvous_messages for select
    using (
        exists (
            select 1
            from public.rendezvous_chats c
            join public.rendezvous_candidates cand on c.candidate_id = cand.id
            where c.thread_id = rendezvous_messages.thread_id
            and (cand.user_a = auth.uid() or cand.user_b = auth.uid())
        )
    );

-- 自分が参加しているスレッドにメッセージを送信できる
create policy "rendezvous_messages_insert_participant"
    on public.rendezvous_messages for insert
    with check (
        sender_id = auth.uid()
        and exists (
            select 1
            from public.rendezvous_chats c
            join public.rendezvous_candidates cand on c.candidate_id = cand.id
            where c.thread_id = rendezvous_messages.thread_id
            and (cand.user_a = auth.uid() or cand.user_b = auth.uid())
        )
    );
