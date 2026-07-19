-- R7.5: a read-only destination projection derived from published inventory.
-- A destination cannot be manufactured by curation alone: every row below starts
-- with at least one published guide or experience.
create view public.destination_index
with (security_invoker = true)
as
with published_inventory as (
  select
    'guide'::text as kind,
    btrim(city) as observed_city,
    cover_url as media_url,
    published_at
  from public.guides
  where status = 'published'
    and nullif(btrim(city), '') is not null

  union all

  select
    'experience'::text as kind,
    btrim(city) as observed_city,
    cover_url as media_url,
    published_at
  from public.experiences
  where status = 'published'
    and nullif(btrim(city), '') is not null
),
normalized_inventory as (
  select
    kind,
    observed_city,
    regexp_replace(lower(observed_city), '\s+', ' ', 'g') as city_key,
    media_url,
    published_at
  from published_inventory
),
inventory_rollup as (
  select
    city_key,
    min(observed_city) as observed_name,
    array_agg(distinct observed_city order by observed_city) as observed_spellings,
    count(*) filter (where kind = 'guide') as guide_count,
    count(*) filter (where kind = 'experience') as experience_count,
    (
      array_agg(media_url order by published_at desc nulls last, kind, media_url)
        filter (where media_url is not null)
    )[1] as hero_image_url,
    max(published_at) as latest_published_at,
    coalesce(
      nullif(btrim(regexp_replace(city_key, '[^a-z0-9]+', '-', 'g'), '-'), ''),
      'destination-' || left(md5(city_key), 10)
    ) as generated_slug
  from normalized_inventory
  group by city_key
),
published_curated as (
  select
    d.slug,
    d.name,
    d.hero_image_url,
    d.description,
    d.match_terms,
    d.sort_order,
    regexp_replace(lower(btrim(term.value)), '\s+', ' ', 'g') as match_key
  from public.destinations d
  cross join lateral unnest(array_append(d.match_terms, d.name)) as term(value)
  where status = 'published'
),
curated_choice as (
  select distinct on (i.city_key)
    i.city_key,
    c.slug,
    c.name,
    c.hero_image_url,
    c.description,
    c.match_terms,
    c.sort_order
  from inventory_rollup i
  join published_curated c
    on c.slug = i.generated_slug
    or c.match_key = i.city_key
  order by
    i.city_key,
    case when c.slug = i.generated_slug then 0 else 1 end,
    c.sort_order,
    c.slug
)
select
  coalesce(c.slug, i.generated_slug)::text as slug,
  coalesce(c.name, i.observed_name)::text as name,
  coalesce(c.hero_image_url, i.hero_image_url)::text as hero_image_url,
  c.description::text as description,
  (
    select array_agg(distinct btrim(term.value) order by btrim(term.value))
    from unnest(
      coalesce(c.match_terms, '{}'::text[])
      || array[coalesce(c.name, i.observed_name)]
      || i.observed_spellings
    ) as term(value)
    where nullif(btrim(term.value), '') is not null
  )::text[] as match_terms,
  i.guide_count::bigint as guide_count,
  i.experience_count::bigint as experience_count,
  i.latest_published_at::timestamptz as latest_published_at,
  coalesce(c.sort_order, 0)::integer as sort_order
from inventory_rollup i
left join curated_choice c on c.city_key = i.city_key;

revoke all on public.destination_index from anon, authenticated;
grant select on public.destination_index to anon, authenticated;
