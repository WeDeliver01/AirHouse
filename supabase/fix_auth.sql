-- ============================================
-- AUTH FIX SCRIPT
-- Run this in Supabase SQL Editor if signup isn't working
-- ============================================

-- 1. Create required types if they don't exist
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('creator', 'developer', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE wallet_type AS ENUM ('creator', 'developer', 'platform', 'escrow');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create profiles table if it doesn't exist
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

-- 3. Create creator_profiles table if it doesn't exist
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

-- 4. Create wallets table if it doesn't exist
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

-- 6. Drop existing policies and recreate
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Enable insert for service role" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;

-- Simple, permissive policies for profiles
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (true);

-- Policies for creator_profiles
DROP POLICY IF EXISTS "creator_profiles_select" ON creator_profiles;
DROP POLICY IF EXISTS "creator_profiles_update" ON creator_profiles;
DROP POLICY IF EXISTS "creator_profiles_insert" ON creator_profiles;

CREATE POLICY "creator_profiles_select" ON creator_profiles FOR SELECT USING (true);
CREATE POLICY "creator_profiles_update" ON creator_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "creator_profiles_insert" ON creator_profiles FOR INSERT WITH CHECK (true);

-- Policies for wallets
DROP POLICY IF EXISTS "wallets_select" ON wallets;
DROP POLICY IF EXISTS "wallets_update" ON wallets;
DROP POLICY IF EXISTS "wallets_insert" ON wallets;

CREATE POLICY "wallets_select" ON wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "wallets_update" ON wallets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "wallets_insert" ON wallets FOR INSERT WITH CHECK (true);

-- 7. Drop and recreate the trigger function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- 8. Create the updated function with error handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role_val user_role;
  user_wallet_type wallet_type;
BEGIN
  -- Get role from metadata, default to creator
  user_role_val := COALESCE(
    (NEW.raw_user_meta_data->>'role')::user_role, 
    'creator'::user_role
  );

  -- Create profile
  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    user_role_val,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  
  -- Determine wallet type and create wallet
  IF user_role_val = 'creator' THEN
    user_wallet_type := 'creator';
    -- Also create creator profile
    INSERT INTO public.creator_profiles (user_id) VALUES (NEW.id);
  ELSIF user_role_val = 'developer' THEN
    user_wallet_type := 'developer';
  ELSE
    user_wallet_type := 'creator';
  END IF;
  
  -- Create wallet
  INSERT INTO public.wallets (user_id, wallet_type) VALUES (NEW.id, user_wallet_type);
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the signup
    RAISE LOG 'Error in handle_new_user for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 10. Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- ============================================
-- VERIFICATION - Run these to test
-- ============================================
-- Check if trigger exists:
SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- Check if function exists:
SELECT proname FROM pg_proc WHERE proname = 'handle_new_user';

-- After signing up, check if profile was created:
-- SELECT * FROM profiles ORDER BY created_at DESC LIMIT 5;
