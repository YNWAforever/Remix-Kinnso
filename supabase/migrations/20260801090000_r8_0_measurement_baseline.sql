-- R8.0 — consented measurement baseline.
--
-- This is a deliberately minimal, private ledger. Browser clients can call only
-- the rate-limit RPC; application servers write events with the service role.
-- The report RPC returns aggregated counts only and never exposes ledger rows.

create table public.traveller_analytics_events (
  id uuid primary key default gen_random_uuid(),
  client_event_id uuid not null,
  journey_id uuid not null,
  consent_version text not null check (consent_version = 'v1'),
  event_name text not null check (event_name in (
    'journey_started',
    'entity_viewed',
    'agent_started',
    'booking_cta_clicked',
    'waitlist_submitted',
    'checkout_started',
    'signup_started',
    'signup_completed'
  )),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  locale text not null check (locale in ('en', 'zh-hk', 'zh-tw', 'zh-cn', 'ja', 'ko', 'th')),
  route_key text not null check (char_length(route_key) between 1 and 120),
  entity_type text check (entity_type in ('guide', 'experience', 'creator', 'article')),
  entity_id uuid,
  booking_state text not null default 'off' check (booking_state in ('off', 'on')),
  authenticated boolean not null default false,
  outcome text check (outcome in ('created', 'submitted', 'success', 'error')),
  error_category text check (error_category in ('invalid', 'rate_limited', 'unavailable', 'unknown')),
  account_id uuid references auth.users(id) on delete set null,
  unique (journey_id, client_event_id),
  constraint traveller_analytics_entity_pair_check check (
    (entity_type is null and entity_id is null)
    or (entity_type is not null and entity_id is not null)
  ),
  constraint traveller_analytics_error_outcome_check check (
    error_category is null or outcome = 'error'
  )
);

create index traveller_analytics_events_occurred_at_idx
  on public.traveller_analytics_events (occurred_at desc);
create index traveller_analytics_events_name_occurred_at_idx
  on public.traveller_analytics_events (event_name, occurred_at desc);

create table public.traveller_analytics_rate_limits (
  journey_id uuid primary key,
  window_start timestamptz not null default now(),
  event_count integer not null default 1 check (event_count >= 0)
);

alter table public.traveller_analytics_events enable row level security;
alter table public.traveller_analytics_rate_limits enable row level security;
revoke all on table public.traveller_analytics_events from public, anon, authenticated;
revoke all on table public.traveller_analytics_rate_limits from public, anon, authenticated;
grant all on table public.traveller_analytics_events to service_role;
grant all on table public.traveller_analytics_rate_limits to service_role;

-- The route calls this through its request-scoped client. The signature retains
-- explicit policy arguments for the caller interface, but the function fixes the
-- actual policy so a direct RPC caller cannot loosen its own quota.
create or replace function public.check_and_increment_traveller_analytics_rate_limit(
  p_journey_id uuid,
  p_max_requests integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_count integer;
  v_max_requests constant integer := 120;
  v_window_seconds constant integer := 600;
begin
  if p_journey_id is null then
    raise exception 'analytics_journey_required' using errcode = '22023';
  end if;

  insert into public.traveller_analytics_rate_limits (journey_id, window_start, event_count)
  values (p_journey_id, now(), 1)
  on conflict (journey_id) do update
    set window_start = case
          when public.traveller_analytics_rate_limits.window_start < now() - make_interval(secs => v_window_seconds)
          then now()
          else public.traveller_analytics_rate_limits.window_start
        end,
        event_count = case
          when public.traveller_analytics_rate_limits.window_start < now() - make_interval(secs => v_window_seconds)
          then 1
          else public.traveller_analytics_rate_limits.event_count + 1
        end
  returning event_count into v_event_count;

  return v_event_count <= v_max_requests;
end;
$$;

revoke all on function public.check_and_increment_traveller_analytics_rate_limit(uuid, integer, integer) from public;
grant execute on function public.check_and_increment_traveller_analytics_rate_limit(uuid, integer, integer) to anon, authenticated;

-- This is intentionally invoker-security: only the service role has table and
-- function privileges, so no browser role can trigger retention deletion.
create or replace function public.purge_traveller_analytics_events()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.traveller_analytics_events
  where received_at < now() - interval '8 days';

  delete from public.traveller_analytics_rate_limits
  where window_start < now() - interval '8 days';
end;
$$;

revoke all on function public.purge_traveller_analytics_events() from public, anon, authenticated;
grant execute on function public.purge_traveller_analytics_events() to service_role;

create or replace function public.admin_traveller_analytics_report(
  p_window_start timestamptz,
  p_window_end timestamptz
) returns table (
  metric_key text,
  locale text,
  entity_type text,
  booking_state text,
  numerator bigint,
  denominator bigint,
  rate numeric,
  sample_count bigint,
  status text,
  attribution_window_days integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sample_floor constant integer := 10;
  v_window_days integer;
begin
  if not public.is_active_ops() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_window_start is null or p_window_end is null or p_window_end <= p_window_start then
    raise exception 'invalid_analytics_window' using errcode = '22023';
  end if;
  if p_window_end - p_window_start > interval '7 days' then
    raise exception 'analytics_window_too_large' using errcode = '22023';
  end if;

  v_window_days := greatest(1, ceil(extract(epoch from p_window_end - p_window_start) / 86400.0)::integer);

  return query
  with scoped_events as (
    select
      e.event_name,
      e.journey_id,
      e.locale,
      e.entity_type,
      e.booking_state
    from public.traveller_analytics_events e
    where e.received_at >= p_window_start
      and e.received_at < p_window_end
  ),
  cohorts as (
    select locale, booking_state, count(distinct journey_id)::bigint as journey_count
    from scoped_events
    group by locale, booking_state
  ),
  stages as (
    select
      event_name as metric_key,
      locale,
      entity_type,
      booking_state,
      count(distinct journey_id)::bigint as journey_count
    from scoped_events
    group by event_name, locale, entity_type, booking_state
  )
  select
    s.metric_key,
    s.locale,
    s.entity_type,
    s.booking_state,
    s.journey_count as numerator,
    c.journey_count as denominator,
    case
      when c.journey_count < v_sample_floor or c.journey_count = 0 then null
      else round(s.journey_count::numeric / c.journey_count::numeric, 4)
    end as rate,
    c.journey_count as sample_count,
    case when c.journey_count < v_sample_floor then 'insufficient_sample' else 'ok' end as status,
    v_window_days as attribution_window_days
  from stages s
  join cohorts c using (locale, booking_state)
  order by s.metric_key, s.locale, s.entity_type nulls first, s.booking_state;
end;
$$;

revoke all on function public.admin_traveller_analytics_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_traveller_analytics_report(timestamptz, timestamptz) to authenticated;
