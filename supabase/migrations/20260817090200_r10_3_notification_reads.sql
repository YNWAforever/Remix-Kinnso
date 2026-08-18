-- supabase/migrations/20260817090200_r10_3_notification_reads.sql
--
-- R10.3: the two read paths onto notifications. RLS already lets a creator select their own
-- rows directly (Task 1) -- these RPCs exist for the same reason creator_earnings_summary()
-- and creator_payout_batches_mine() do despite direct-select RLS being technically
-- sufficient: a single jsonb-returning call is one round trip with a predictable shape,
-- versus a raw .from('notifications').select(...) the client would otherwise have to
-- reconstruct the ordering/limit/shape of by hand on every call site.
--
-- notifications_mine() caps at 50 rows deliberately, not as a hard architectural
-- commitment -- notification volume per creator is bounded by their own activity (mission
-- decisions, settlements, payout batches), not an unbounded append-only ledger like
-- creator_payout_batches.

create or replace function public.notifications_mine()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.creators where id = v_uid and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',                n.id,
      'notificationType',  n.notification_type,
      'entityType',        n.entity_type,
      'entityId',          n.entity_id,
      'payload',           n.payload,
      'readAt',            n.read_at,
      'createdAt',         n.created_at
    ) order by n.created_at desc)
    from public.notifications n
    where n.creator_id = v_uid
    order by n.created_at desc
    limit 50
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.notifications_mine() from public, anon, authenticated;
grant execute on function public.notifications_mine() to authenticated;

create or replace function public.notifications_unread_count()
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.creators where id = v_uid and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return (select count(*)::integer from public.notifications where creator_id = v_uid and read_at is null);
end;
$$;
revoke all on function public.notifications_unread_count() from public, anon, authenticated;
grant execute on function public.notifications_unread_count() to authenticated;
