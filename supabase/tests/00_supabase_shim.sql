CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Minimal emulation of the Supabase runtime so migrations can be exercised
-- locally: an auth schema with uid(), and the roles RLS/grants refer to.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supabase derives auth.uid() from the request JWT claims GUC.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage emulation, so storage policies can be exercised locally.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id TEXT PRIMARY KEY,
  name TEXT,
  public BOOLEAN DEFAULT FALSE,
  file_size_limit BIGINT,
  allowed_mime_types TEXT[]
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT REFERENCES storage.buckets(id),
  name TEXT,
  owner UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Supabase's helper: split an object path into its segments.
CREATE OR REPLACE FUNCTION storage.foldername(name TEXT)
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT string_to_array(name, '/');
$$;

GRANT USAGE ON SCHEMA storage TO anon, authenticated;

INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars','avatars',TRUE),
  ('campaign-media','campaign-media',TRUE),
  ('property-photos','property-photos',TRUE),
  ('verification-documents','verification-documents',FALSE),
  ('dispute-evidence','dispute-evidence',FALSE)
ON CONFLICT (id) DO NOTHING;
