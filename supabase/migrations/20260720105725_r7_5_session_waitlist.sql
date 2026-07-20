create table public.session_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null check (
    email = lower(btrim(email))
    and char_length(email) <= 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  user_id uuid references auth.users(id) on delete set null,
  locale text not null check (locale in ('en', 'zh-hk', 'zh-tw', 'ja', 'ko', 'th', 'zh-cn')),
  created_at timestamptz not null default now()
);

create unique index session_waitlist_email_lower_key
  on public.session_waitlist (lower(email));

alter table public.session_waitlist enable row level security;

revoke all on table public.session_waitlist from public, anon, authenticated;
grant insert on table public.session_waitlist to anon, authenticated;
grant select on table public.session_waitlist to authenticated;

create policy session_waitlist_anon_insert
  on public.session_waitlist for insert to anon
  with check (user_id is null or user_id = (select auth.uid()));

create policy session_waitlist_authenticated_insert
  on public.session_waitlist for insert to authenticated
  with check (user_id is null or user_id = (select auth.uid()));

create policy session_waitlist_ops_read
  on public.session_waitlist for select to authenticated
  using ((select public.is_active_ops()));
