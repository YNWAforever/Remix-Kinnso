-- supabase/migrations/20260821100300_r12_0_settlement_on_redemption.sql
--
-- Adds a `source` discriminator to mission_settlements (it had none -- R10.1's existing fee
-- settlements are distinguished only by which nullable columns are populated). Defaults to
-- 'mission_fee' so R10.1's own trigger needs zero changes; only this phase's new trigger sets
-- 'visit_redemption' explicitly.
alter table public.mission_settlements
  add column source text not null default 'mission_fee' check (source in ('mission_fee', 'visit_redemption'));

-- AFTER INSERT on offer_redemptions, not on offer_claims -- the settlement obligation is
-- created at the moment of redemption (the in-store event), not at claim time.
--
-- No-ops (does not raise) when the offer has no mission_id, or the claiming creator has no
-- mission_participants row: the discount still applies to the visitor, but there is no
-- mission context to hang a creator-payout obligation on. This differs from R10.1's own
-- trigger, which always has a mission context by construction (it fires from a milestone
-- submission that is itself scoped to a mission).
create or replace function public.create_settlement_on_offer_redemption() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mission_id uuid;
  v_creator_id uuid;
  v_commission_kind text;
  v_commission_value numeric;
  v_participant_id uuid;
  v_fee numeric;
  v_settlement_id uuid;
begin
  select mo.mission_id, mo.commission_kind, mo.commission_value, oc.creator_id
    into v_mission_id, v_commission_kind, v_commission_value, v_creator_id
    from public.offer_claims oc
    join public.merchant_offers mo on mo.id = oc.offer_id
    where oc.id = new.offer_claim_id;

  if v_mission_id is null then
    return new;
  end if;

  select id into v_participant_id
    from public.mission_participants
    where mission_id = v_mission_id and creator_id = v_creator_id;
  if v_participant_id is null then
    return new;
  end if;

  v_fee := case
    when v_commission_kind = 'flat' then v_commission_value
    else round(coalesce(new.amount_spent, 0) * v_commission_value / 100, 2)
  end;
  if v_fee <= 0 then
    return new;
  end if;

  insert into public.mission_settlements (mission_id, mission_participant_id, paid_fee_amount, amount_currency, status, source)
    values (v_mission_id, v_participant_id, v_fee, 'HKD', 'not_started', 'visit_redemption')
    returning id into v_settlement_id;

  update public.offer_redemptions set settlement_id = v_settlement_id where id = new.id;

  return new;
end;
$$;

create trigger create_settlement_on_offer_redemption_trg
  after insert on public.offer_redemptions
  for each row execute function public.create_settlement_on_offer_redemption();
