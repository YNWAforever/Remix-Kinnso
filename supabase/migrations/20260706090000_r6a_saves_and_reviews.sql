-- R6A (design doc D-R6A-1..8): traveller-facing saves on guides/experiences, and
-- post-booking star+text reviews feeding aggregateRating JSON-LD. Two parallel save
-- tables (not one polymorphic table) mirror the agent_rate_limits/checkout_rate_limits
-- "one table per feature" convention. reviews (added in a later section of this same
-- file) denormalizes experience_id/guide_id from the booking at insert time -- see
-- that section's own comment for why.

-- ── 1. guide_saves ────────────────────────────────────────────────────────────
create table public.guide_saves (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides(id) on delete cascade,
  traveler_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (guide_id, traveler_user_id)
);

alter table public.guide_saves enable row level security;

create policy guide_saves_owner_all on public.guide_saves
  for all to authenticated
  using (traveler_user_id = auth.uid())
  with check (traveler_user_id = auth.uid());

revoke all on public.guide_saves from anon, authenticated;
grant select, insert, delete on public.guide_saves to authenticated;

create or replace function public.guide_saves_sync_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'INSERT') then
    update public.guides set saves_count = saves_count + 1 where id = new.guide_id;
  elsif (TG_OP = 'DELETE') then
    update public.guides set saves_count = greatest(saves_count - 1, 0) where id = old.guide_id;
  end if;
  return null;
end;
$$;

create trigger guide_saves_sync_count_trigger
  after insert or delete on public.guide_saves
  for each row execute procedure public.guide_saves_sync_count();

revoke all on function public.guide_saves_sync_count() from public, anon, authenticated, service_role;

-- ── 2. experience_saves ──────────────────────────────────────────────────────
alter table public.experiences add column saves_count integer not null default 0;

create table public.experience_saves (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  traveler_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (experience_id, traveler_user_id)
);

alter table public.experience_saves enable row level security;

create policy experience_saves_owner_all on public.experience_saves
  for all to authenticated
  using (traveler_user_id = auth.uid())
  with check (traveler_user_id = auth.uid());

revoke all on public.experience_saves from anon, authenticated;
grant select, insert, delete on public.experience_saves to authenticated;

create or replace function public.experience_saves_sync_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'INSERT') then
    update public.experiences set saves_count = saves_count + 1 where id = new.experience_id;
  elsif (TG_OP = 'DELETE') then
    update public.experiences set saves_count = greatest(saves_count - 1, 0) where id = old.experience_id;
  end if;
  return null;
end;
$$;

create trigger experience_saves_sync_count_trigger
  after insert or delete on public.experience_saves
  for each row execute procedure public.experience_saves_sync_count();

revoke all on function public.experience_saves_sync_count() from public, anon, authenticated, service_role;
