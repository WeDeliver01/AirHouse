-- Migration 041: blob: preview URLs saved by the campaign wizard are removed.
--
-- The wizard persisted URL.createObjectURL() previews (blob:https://...) into
-- campaigns.property_images instead of the uploaded Storage URLs, so the
-- images were broken for every viewer. 041 strips anything that is not an
-- http(s) URL, keeping real URLs in their original order.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pbm_check(p_label TEXT, p_ok BOOLEAN) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok THEN
    RAISE NOTICE 'PASS  %', p_label;
  ELSE
    RAISE EXCEPTION 'FAIL  %', p_label;
  END IF;
END $$;

\echo '--- PURGE BLOB MEDIA URLS (041) ---'

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS property_images TEXT[];
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brochure_urls TEXT[];

INSERT INTO campaigns (id, title, property_images, brochure_urls) VALUES
  ('41000000-0000-4000-8000-000000000001', 'pbm mixed',
   ARRAY['https://x.supabase.co/storage/v1/object/public/campaign-media/a.jpg',
         'blob:https://airhouse.co.za/7f0c',
         'https://x.supabase.co/storage/v1/object/public/campaign-media/b.jpg'],
   ARRAY['blob:https://airhouse.co.za/9911']),
  ('41000000-0000-4000-8000-000000000002', 'pbm clean',
   ARRAY['https://x.supabase.co/storage/v1/object/public/campaign-media/c.jpg'],
   NULL),
  ('41000000-0000-4000-8000-000000000003', 'pbm all blob',
   ARRAY['blob:https://airhouse.co.za/1', 'blob:https://airhouse.co.za/2'],
   '{}');

\ir ../migrations/041_purge_blob_campaign_media_urls.sql

DO $$ BEGIN
  PERFORM pbm_check('Blob URLs are removed and real URLs keep their order',
    (SELECT property_images FROM campaigns WHERE id = '41000000-0000-4000-8000-000000000001')
      = ARRAY['https://x.supabase.co/storage/v1/object/public/campaign-media/a.jpg',
              'https://x.supabase.co/storage/v1/object/public/campaign-media/b.jpg']);
  PERFORM pbm_check('Blob brochure URLs are removed',
    (SELECT brochure_urls FROM campaigns WHERE id = '41000000-0000-4000-8000-000000000001') = '{}');
  PERFORM pbm_check('A campaign with only real URLs is untouched',
    (SELECT property_images FROM campaigns WHERE id = '41000000-0000-4000-8000-000000000002')
      = ARRAY['https://x.supabase.co/storage/v1/object/public/campaign-media/c.jpg']
    AND (SELECT brochure_urls FROM campaigns WHERE id = '41000000-0000-4000-8000-000000000002') IS NULL);
  PERFORM pbm_check('A campaign with only blob URLs ends up with no images',
    (SELECT property_images FROM campaigns WHERE id = '41000000-0000-4000-8000-000000000003') = '{}');
END $$;

\ir ../migrations/041_purge_blob_campaign_media_urls.sql
DO $$ BEGIN PERFORM pbm_check('041 is safe to re-run', true); END $$;

DELETE FROM campaigns WHERE id::text LIKE '41000000-%';
