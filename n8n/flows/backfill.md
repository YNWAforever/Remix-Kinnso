# Backfill trigger flow

Trigger: Manual
1. HTTP → POST {APPS_SYNC_URL}/backfill (x-admin-token), high timeout. (apps/sync paginates 200/batch internally.)
2. HTTP → POST {APPS_SYNC_URL}/redirects to scrape redirect.php → seo_redirects.
Note: provide redirect.php contents to apps/sync via a one-time admin upload or a read of the legacy file; parseRedirectsPhp() does the rest.
