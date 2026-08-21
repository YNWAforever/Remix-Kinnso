-- supabase/migrations/20260821120300_r12_1_merchant_visits_driven.sql
--
-- R12.1 Task 4 -- widens merchant_insights() with a 'visits_driven' breakdown: per
-- creator/guide, a redemptions count (offer commission channel) and a separately
-- tracked attributed_bookings count (booking commission channel). Deliberately NOT
-- merged into one number -- they represent different revenue channels.
--
-- merchant_insights() takes no parameters; it resolves the caller's own merchant via
-- v_merchant (looked up from auth.uid() against merchant_profiles, same as the rest of
-- the function). Pure additive change to the function's return value -- the signature
-- is unchanged, so this is a true in-place CREATE OR REPLACE (no DROP FUNCTION needed).
create or replace function public.merchant_insights()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_merchant uuid;
begin
  select id into v_merchant from public.merchant_profiles
    where user_id = v_uid and status = 'active';
  if v_merchant is null then raise exception 'forbidden' using errcode = '42501'; end if;

  return jsonb_build_object(
    'missions_published', (
      select count(*) from public.missions
      where merchant_profile_id = v_merchant and status = 'published'),
    'per_mission', coalesce((
      select jsonb_agg(m order by m->>'title') from (
        select jsonb_build_object(
          'mission_id', mi.id,
          'title', mi.title,
          'status', mi.status,
          'invited',  count(mp.id) filter (where mp.status = 'invited'),
          'applied',  count(mp.id) filter (where mp.status = 'applied'),
          'active',   count(mp.id) filter (where mp.status = 'active'),
          'rejected', count(mp.id) filter (where mp.status = 'rejected'),
          'approved_submissions', (
            select count(*) from public.mission_milestone_submissions s
            join public.mission_participants mp2 on mp2.id = s.mission_participant_id
            where mp2.mission_id = mi.id and s.status = 'approved')
        ) as m
        from public.missions mi
        left join public.mission_participants mp on mp.mission_id = mi.id
        where mi.merchant_profile_id = v_merchant
        group by mi.id, mi.title, mi.status
      ) rows
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'participants', count(mp.id),
        'invited',  count(mp.id) filter (where mp.source = 'merchant_invite'),
        'accepted', count(mp.id) filter (where mp.source = 'merchant_invite' and mp.status = 'active'),
        'approved_submissions', (
          select count(*) from public.mission_milestone_submissions s
          join public.mission_participants mp3 on mp3.id = s.mission_participant_id
          join public.missions mi3 on mi3.id = mp3.mission_id
          where mi3.merchant_profile_id = v_merchant and s.status = 'approved')
      )
      from public.mission_participants mp
      join public.missions mi2 on mi2.id = mp.mission_id
      where mi2.merchant_profile_id = v_merchant
    ),
    'visits_driven', coalesce((
      select jsonb_agg(jsonb_build_object(
        'creator_id', r.creator_id, 'creator_name', r.creator_name,
        'guide_id', r.guide_id, 'guide_title', r.guide_title,
        'redemptions', r.redemptions, 'attributed_bookings', r.attributed_bookings
      ) order by (r.redemptions + r.attributed_bookings) desc)
      from (
        select
          c.id as creator_id, c.display_name as creator_name,
          g.id as guide_id, g.title as guide_title,
          count(distinct orr.id) filter (where orr.id is not null) as redemptions,
          count(distinct b.id) filter (where b.id is not null) as attributed_bookings
        from public.creators c
        left join public.offer_claims oc on oc.creator_id = c.id
        left join public.merchant_offers mo on mo.id = oc.offer_id and mo.merchant_profile_id = v_merchant
        left join public.offer_redemptions orr on orr.offer_claim_id = oc.id and orr.merchant_profile_id = v_merchant
        left join public.guides g on g.id = oc.guide_id
        left join public.experiences e on e.merchant_profile_id = v_merchant
        left join public.bookings b on b.guide_id = g.id and b.experience_id = e.id and b.status in ('confirmed','completed')
        where oc.id is not null or b.id is not null
        group by c.id, c.display_name, g.id, g.title
        having count(distinct orr.id) filter (where orr.id is not null) > 0
            or count(distinct b.id) filter (where b.id is not null) > 0
        limit 50
      ) r
    ), '[]'::jsonb)
  );
end $$;

-- Signature is unchanged (still zero-arg) -- grants persist across CREATE OR REPLACE,
-- but re-assert them for clarity/defense-in-depth, matching the original migration.
revoke all on function public.merchant_insights() from public, anon;
grant execute on function public.merchant_insights() to authenticated;
