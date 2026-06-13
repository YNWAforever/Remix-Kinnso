insert into public.articles (id, legacy_post_id, slug, url, category, published_at, end_at)
values
  ('00000000-0000-0000-0000-000000000001', 1, 'pub-article',    'pub-article',    'dining',      now() - interval '1 day',  null),
  ('00000000-0000-0000-0000-000000000002', 2, 'draft-article',  'draft-article',  'shopping',    null,                       null),
  ('00000000-0000-0000-0000-000000000003', 3, 'expired-article','expired-article','destination', now() - interval '10 day',  now() - interval '1 day');

insert into public.article_translations (article_id, locale, title, summary) values
  ('00000000-0000-0000-0000-000000000001', 'en',    'Published EN', 'A published article.'),
  ('00000000-0000-0000-0000-000000000001', 'zh-hk', '已發佈',        '一篇已發佈文章。');
