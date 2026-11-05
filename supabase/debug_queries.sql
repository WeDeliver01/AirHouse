-- ============================================
-- HELPER QUERIES FOR DEBUGGING
-- Run these in Supabase SQL Editor
-- ============================================

-- 1. VIEW ALL USERS AND THEIR PROFILES
-- This shows which users have profiles and their roles
SELECT 
  au.id,
  au.email,
  au.raw_user_meta_data->>'full_name' as signup_name,
  au.raw_user_meta_data->>'role' as signup_role,
  p.full_name as profile_name,
  p.role as profile_role,
  p.is_verified,
  p.created_at
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
ORDER BY au.created_at DESC;

-- 2. FIX: Create profile for user if missing
-- Replace 'user-email@example.com' with the actual email
-- This creates a profile if the trigger failed
INSERT INTO profiles (id, role, full_name)
SELECT 
  au.id,
  COALESCE((au.raw_user_meta_data->>'role')::user_role, 'creator'),
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1))
FROM auth.users au
WHERE au.email = 'admin@delicatecourier.co.za'
AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = au.id);

-- 3. UPDATE user role to 'developer'
-- Use this to change a user's role
UPDATE profiles 
SET role = 'developer'
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@delicatecourier.co.za');

-- 4. UPDATE user role to 'admin'
UPDATE profiles 
SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@delicatecourier.co.za');

-- 5. UPDATE user role to 'creator'
UPDATE profiles 
SET role = 'creator'
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@delicatecourier.co.za');

-- 6. VIEW ALL CAMPAIGNS
SELECT * FROM campaigns ORDER BY created_at DESC;

-- 7. VIEW ALL CREATOR PROFILES
SELECT 
  cp.*,
  p.full_name,
  p.email
FROM creator_profiles cp
JOIN profiles p ON cp.user_id = p.id;

-- 8. Create creator_profile if missing (for creators only)
INSERT INTO creator_profiles (user_id)
SELECT p.id
FROM profiles p
WHERE p.role = 'creator'
AND NOT EXISTS (SELECT 1 FROM creator_profiles WHERE user_id = p.id);

-- ============================================
-- QUICK FIX: Run this to ensure your user works
-- ============================================

-- First, check if profile exists
SELECT * FROM profiles WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@delicatecourier.co.za');

-- If empty, create profile:
INSERT INTO profiles (id, role, full_name)
SELECT id, 'developer', 'Ashley Baloyi'
FROM auth.users 
WHERE email = 'admin@delicatecourier.co.za'
ON CONFLICT (id) DO UPDATE SET role = 'developer', full_name = 'Ashley Baloyi';
