-- ============================================
-- QUICK START - RUN THIS IN SUPABASE SQL EDITOR
-- Handles case where some objects already exist
-- ============================================

-- 1. Create enums (only if they don't exist)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('creator', 'developer', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wallet_type AS ENUM ('creator', 'developer', 'platform', 'escrow');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create profiles table (if not exists)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role user_role NOT NULL DEFAULT 'creator',
  full_name TEXT NOT NULL DEFAULT 'User',
  avatar_url TEXT,
  company_name TEXT,
  bio TEXT,
  phone TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create creator_profiles table (if not exists)
CREATE TABLE IF NOT EXISTS creator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  niche TEXT[],
  instagram_handle TEXT,
  tiktok_handle TEXT,
  youtube_handle TEXT,
  follower_count INTEGER DEFAULT 0,
  location TEXT,
  reliability_score INTEGER DEFAULT 100,
  campaigns_completed INTEGER DEFAULT 0,
  total_leads_generated INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create wallets table (if not exists)
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_type wallet_type NOT NULL,
  balance DECIMAL(12,2) DEFAULT 0,
  pending_balance DECIMAL(12,2) DEFAULT 0,
  total_earned DECIMAL(12,2) DEFAULT 0,
  total_withdrawn DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, wallet_type)
);

-- 5. Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

-- 6. Drop ALL existing policies first to avoid conflicts
DO $$ 
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('profiles', 'creator_profiles', 'wallets')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- 7. Create simple permissive policies
CREATE POLICY "allow_all_profiles" ON profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_creator_profiles" ON creator_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_wallets" ON wallets FOR ALL USING (true) WITH CHECK (true);

-- 8. Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- 9. Create the signup trigger function
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'creator'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  
  -- Create wallet
  INSERT INTO public.wallets (user_id, wallet_type) 
  VALUES (NEW.id, CASE 
    WHEN NEW.raw_user_meta_data->>'role' = 'developer' THEN 'developer'::wallet_type
    ELSE 'creator'::wallet_type
  END);
  
  -- Create creator profile if creator
  IF COALESCE(NEW.raw_user_meta_data->>'role', 'creator') = 'creator' THEN
    INSERT INTO public.creator_profiles (user_id) VALUES (NEW.id);
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 11. Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ============================================
-- STORAGE BUCKETS SETUP
-- Run this in a separate query or in Supabase Dashboard > Storage
-- ============================================
-- Note: Storage buckets should be created via the Supabase Dashboard:
-- 1. Go to Storage in your Supabase Dashboard
-- 2. Create bucket "avatars" (Public)
-- 3. Create bucket "campaign-media" (Public)
-- 4. For each bucket, add this policy in Policies tab:
--    - Policy name: "Allow all"
--    - Target roles: anon, authenticated
--    - Operations: SELECT, INSERT, UPDATE, DELETE
--    - USING expression: true
--    - WITH CHECK expression: true

-- ============================================
-- DONE! Now test by creating an account.
-- ============================================
