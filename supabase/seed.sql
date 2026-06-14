insert into public.articles (id, legacy_post_id, slug, url, category, published_at, end_at)
values
  ('00000000-0000-0000-0000-000000000001', 1, 'pub-article',    'pub-article',    'dining',      now() - interval '1 day',  null),
  ('00000000-0000-0000-0000-000000000002', 2, 'draft-article',  'draft-article',  'shopping',    null,                       null),
  ('00000000-0000-0000-0000-000000000003', 3, 'expired-article','expired-article','destination', now() - interval '10 day',  now() - interval '1 day');

insert into public.article_translations (article_id, locale, title, summary) values
  ('00000000-0000-0000-0000-000000000001', 'en',    'Published EN', 'A published article.'),
  ('00000000-0000-0000-0000-000000000001', 'zh-hk', '已發佈',        '一篇已發佈文章。');

-- ── Plan 3 render/SEO fixtures ───────────────────────────────────────────────
-- A rich published dining article (en + zh-hk), in destinations? no: dining.
insert into public.articles
  (id, legacy_post_id, slug, url, category, thumbnails, regions, tag_slugs, rating, views, published_at, edit_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 101, 'ramen-guide', 'ramen-guide', 'dining',
   '{https://cdn.kinnso.ai/a1.jpg}', '{tokyo}', '{noodles}', 4.50, 1000,
   now() - interval '5 day', now() - interval '2 day'),
-- two more same-category (dining) published articles for "you may like"
  ('00000000-0000-0000-0000-0000000000a2', 102, 'sushi-guide', 'sushi-guide', 'dining',
   '{https://cdn.kinnso.ai/a2.jpg}', '{tokyo}', '{sushi}', 4.20, 500,
   now() - interval '4 day', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000a3', 103, 'cafe-guide', 'cafe-guide', 'dining',
   '{https://cdn.kinnso.ai/a3.jpg}', '{osaka}', '{coffee}', 4.00, 200,
   now() - interval '3 day', null),
-- an EN coupon article (is_coupon) with en + zh-hk translations
  ('00000000-0000-0000-0000-0000000000a4', 104, 'mall-coupon', 'mall-coupon', 'shopping',
   '{https://cdn.kinnso.ai/a4.jpg}', '{hongkong}', '{coupon}', null, 50,
   now() - interval '2 day', null);

update public.articles set is_coupon = true where url = 'mall-coupon';

insert into public.article_translations
  (article_id, locale, title, summary, content, meta_title, meta_description, og_image, faq_title)
values
  ('00000000-0000-0000-0000-0000000000a1', 'en', 'Best Ramen in Tokyo',
   'A guide to the best ramen shops in Tokyo.',
   '[{"type":"text","id":"block-0","title":"Intro","content":"<p>Welcome to <strong>Tokyo</strong> ramen.</p>"},
     {"type":"number-box","id":"block-1","title":"Ichiran","content":"<p>Famous tonkotsu.</p>"},
     {"type":"number-box","id":"block-2","title":"Afuri","content":"<p>Yuzu shio.</p>"},
     {"type":"detail-box","id":"block-3","title":"Hours","time":"11:00-22:00","price":"¥1000","address":{"label":"Shibuya","link":"https://maps.example/x"}},
     {"type":"multiple-image","id":"block-4","images":[{"thumbnail":"https://cdn.kinnso.ai/t1.jpg","original":"https://cdn.kinnso.ai/o1.jpg","desc":"bowl"}]},
     {"type":"attraction-box","id":"block-5","attraction":"some-slug"}]'::jsonb,
   'Best Ramen in Tokyo', 'The definitive Tokyo ramen guide.', 'https://cdn.kinnso.ai/og-a1.jpg', 'Ramen FAQ'),
  ('00000000-0000-0000-0000-0000000000a1', 'zh-hk', '東京最佳拉麵',
   '東京最佳拉麵店指南。',
   '[{"type":"text","id":"block-0","title":"簡介","content":"<p>歡迎來到東京拉麵。</p>"}]'::jsonb,
   '東京最佳拉麵', '東京拉麵終極指南。', 'https://cdn.kinnso.ai/og-a1-hk.jpg', '拉麵常見問題'),
  ('00000000-0000-0000-0000-0000000000a2', 'en', 'Best Sushi in Tokyo', 'A sushi guide.',
   '[{"type":"text","id":"block-0","content":"<p>Sushi.</p>"}]'::jsonb, null, null, null, null),
  ('00000000-0000-0000-0000-0000000000a3', 'en', 'Best Cafes in Osaka', 'A cafe guide.',
   '[{"type":"text","id":"block-0","content":"<p>Cafe.</p>"}]'::jsonb, null, null, null, null),
  -- coupon: meta_description deliberately empty -> falls back to summary
  ('00000000-0000-0000-0000-0000000000a4', 'en', 'Mall Coupon', 'Save at the mall.',
   '[{"type":"offer-box","id":"block-0","title":"Deal","content":"<p>10% off.</p>"}]'::jsonb, null, '', null, null),
  ('00000000-0000-0000-0000-0000000000a4', 'zh-hk', '商場優惠', '商場慳錢。',
   '[{"type":"offer-box","id":"block-0","title":"優惠","content":"<p>九折。</p>"}]'::jsonb, null, '', null, null);

insert into public.article_faqs (article_id, locale, question, answer, weight) values
  ('00000000-0000-0000-0000-0000000000a1', 'en', 'Is ramen cheap?', 'Yes, around ¥1000.', 10),
  ('00000000-0000-0000-0000-0000000000a1', 'en', 'When to go?', 'Lunch is best.', 5);

insert into public.article_authors (slug, locale, name, title, bio, avatar) values
  ('jane-doe', 'en', 'Jane Doe', 'Food Writer', 'Tokyo-based food writer.', 'https://cdn.kinnso.ai/jane.jpg');
update public.articles set authors = '{jane-doe}' where url = 'ramen-guide';

insert into public.article_tags (id, slug, legacy_tag_id) values
  ('00000000-0000-0000-0000-0000000000b1', 'noodles', 9001);
insert into public.article_tag_translations (tag_id, locale, name) values
  ('00000000-0000-0000-0000-0000000000b1', 'en', 'Noodles');
insert into public.article_tag_map (article_id, tag_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1');

insert into public.seo_redirects (from_path, to_path) values
  ('/post/old-ramen', '/articles/dining/ramen-guide');
