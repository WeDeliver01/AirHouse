-- ============================================================================
-- 041_purge_blob_campaign_media_urls.sql
--
-- The campaign wizard saved the browser's temporary preview URLs
-- (`blob:https://airhouse.co.za/...`) into campaigns.property_images instead
-- of the uploaded Supabase Storage URLs. A blob: URL only exists inside the
-- tab that created it, so every one of those images shows as broken for
-- everyone, everywhere (campaign pages, creator dashboards, lead pages).
-- The wizard is fixed in the same change; this removes the dead entries so
-- pages fall back to "no images" instead of broken placeholders, and so the
-- developer can re-upload them.
--
-- Only entries that are not http(s) URLs are removed. Idempotent. Reports how
-- many campaigns it touched.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  n_images    INTEGER;
  n_brochures INTEGER;
BEGIN
  UPDATE campaigns
  SET property_images = ARRAY(
        SELECT u FROM unnest(property_images) WITH ORDINALITY AS t(u, i)
        WHERE u ~* '^https?://'
        ORDER BY i)
  WHERE EXISTS (SELECT 1 FROM unnest(property_images) u WHERE u !~* '^https?://');
  GET DIAGNOSTICS n_images = ROW_COUNT;

  UPDATE campaigns
  SET brochure_urls = ARRAY(
        SELECT u FROM unnest(brochure_urls) WITH ORDINALITY AS t(u, i)
        WHERE u ~* '^https?://'
        ORDER BY i)
  WHERE EXISTS (SELECT 1 FROM unnest(brochure_urls) u WHERE u !~* '^https?://');
  GET DIAGNOSTICS n_brochures = ROW_COUNT;

  RAISE NOTICE '041: removed non-http image URLs from % campaign(s), brochure URLs from % campaign(s)',
    n_images, n_brochures;
END
$$;

COMMIT;
