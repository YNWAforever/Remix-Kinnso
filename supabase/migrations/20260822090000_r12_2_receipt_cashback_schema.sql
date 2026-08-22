-- R12.2: adds the schema foundation for repeatable receipt-cashback missions.
--
-- missions.mission_type: 'receipt_cashback' joins the existing coupon_affiliate/hybrid/paid
-- set. paid_fee_amount/paid_fee_currency (already on missions) are reused as the flat
-- per-receipt cashback amount -- no new amount column needed.
--
-- missions.max_receipts_per_creator: optional per-mission cap on how many receipts one
-- creator may get approved, since there's no OCR/auto-matching in v1 -- a human reviewer is
-- the only fraud check. Nullable (off by default); when set, must be >= 1.
--
-- mission_milestones.repeatable: a repeatable milestone (used only by receipt_cashback
-- missions, exactly one per mission, auto-created at mission-creation time) can be submitted
-- against many times by the same participant, unlike every other milestone today.
--
-- mission_milestone_submissions.milestone_repeatable: denormalized copy of the owning
-- milestone's `repeatable` flag, set once at insert time by a trigger and never updated
-- after. This exists because Postgres partial-index predicates can only reference columns of
-- the indexed table itself, not a joined table -- so the "one submission per (milestone,
-- participant) unless repeatable" rule can't be expressed as a partial index directly against
-- mission_milestones.repeatable. Denormalizing the flag onto the submission row at insert
-- time keeps the uniqueness guarantee as a real, enforced index rather than an RPC-only
-- convention.

alter table public.missions
  drop constraint missions_mission_type_check,
  add constraint missions_mission_type_check check (mission_type in ('coupon_affiliate', 'hybrid', 'paid', 'receipt_cashback')),
  add column max_receipts_per_creator integer check (max_receipts_per_creator is null or max_receipts_per_creator >= 1);

alter table public.mission_milestones
  add column repeatable boolean not null default false;

alter table public.mission_milestone_submissions
  add column milestone_repeatable boolean not null default false;

create or replace function public.set_submission_milestone_repeatable() returns trigger
language plpgsql as $$
begin
  select repeatable into new.milestone_repeatable
    from public.mission_milestones
    where id = new.mission_milestone_id;
  return new;
end;
$$;

create trigger set_submission_milestone_repeatable_trg
  before insert on public.mission_milestone_submissions
  for each row execute function public.set_submission_milestone_repeatable();

alter table public.mission_milestone_submissions
  drop constraint mission_milestone_submissions_mission_milestone_id_mission_key;

create unique index mission_milestone_submissions_unique_non_repeatable
  on public.mission_milestone_submissions (mission_milestone_id, mission_participant_id)
  where not milestone_repeatable;

-- A receipt_cashback mission has exactly one repeatable milestone, always -- creating it
-- automatically at mission-insert time (rather than leaving it to the merchant-creation UI,
-- a later task) guarantees a later submit_receipt RPC always finds one to submit against,
-- regardless of which path created the mission row (merchant UI, ops, or a direct
-- test/seed insert). Mirrors this codebase's established "X always happens via trigger"
-- pattern (handle_new_user() auto-creating a creators row on signup).
create or replace function public.create_repeatable_milestone_for_receipt_mission() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.mission_type = 'receipt_cashback' then
    insert into public.mission_milestones (mission_id, title, description, repeatable)
      values (new.id, 'Submit a receipt', 'Upload a photo of your receipt from this merchant.', true);
  end if;
  return new;
end;
$$;

create trigger create_repeatable_milestone_for_receipt_mission_trg
  after insert on public.missions
  for each row execute function public.create_repeatable_milestone_for_receipt_mission();
