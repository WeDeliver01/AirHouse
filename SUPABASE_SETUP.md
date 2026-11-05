# Supabase Setup Guide

This guide walks you through setting up Supabase for the PropertyCampaigns platform.

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **"New Project"**
3. Fill in:
   - **Name**: `property-campaigns` (or your preferred name)
   - **Database Password**: Generate a strong password (save this!)
   - **Region**: Choose closest to your users
4. Click **"Create new project"** and wait ~2 minutes

## 2. Get Your API Credentials

1. In your Supabase dashboard, go to **Settings** (gear icon) → **API**
2. Copy these values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

3. Create a `.env` file in your project root:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## 3. Run the Database Migration

1. Go to **SQL Editor** in your Supabase dashboard
2. Click **"New query"**
3. Copy the entire contents of `supabase/migrations/001_schema.sql`
4. Paste it into the editor
5. Click **"Run"**

You should see "Success. No rows returned" - this is correct!

## 4. Configure Authentication

### Email Settings

1. Go to **Authentication** → **Providers**
2. Make sure **Email** is enabled
3. Configure these settings:
   - ✅ Enable email confirmations (recommended for production)
   - ✅ Enable secure password change

### Email Templates (Optional but Recommended)

1. Go to **Authentication** → **Email Templates**
2. Customize the templates for:
   - **Confirm signup** - Email verification
   - **Reset password** - Password reset link
   - **Magic link** - Passwordless login

### Site URL

1. Go to **Authentication** → **URL Configuration**
2. Set your **Site URL**:
   - Development: `http://localhost:5173`
   - Production: `https://your-domain.com`
3. Add to **Redirect URLs**:
   - `http://localhost:5173/auth/callback`
   - `http://localhost:5173/auth/reset-password`
   - (Add production URLs when deploying)

## 5. Set Up Storage (For Avatars)

1. Go to **Storage** → **Buckets**
2. Click **"New bucket"**
3. Create a bucket named `avatars`
4. Set it to **Public** (for avatar images)

### Storage Policies

Run this in SQL Editor:

```sql
-- Allow authenticated users to upload their own avatar
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow anyone to view avatars
CREATE POLICY "Avatars are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Allow users to update their own avatar
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

## 6. Create an Admin User

After your first user signs up, you can make them an admin:

```sql
-- Replace 'user-email@example.com' with the actual email
UPDATE profiles 
SET role = 'admin' 
WHERE id = (
  SELECT id FROM auth.users 
  WHERE email = 'user-email@example.com'
);
```

## 7. Test the Setup

1. Start your dev server: `npm run dev`
2. Go to `http://localhost:5173/register`
3. Create a test account
4. Check your email for verification link
5. Click the link to verify
6. Log in and verify you can access the dashboard

## Troubleshooting

### "Invalid login credentials"
- Make sure the user has verified their email
- Check if the password is correct
- In Supabase dashboard, go to **Authentication** → **Users** to see user status

### Email not arriving
- Check spam folder
- In Supabase, go to **Project Settings** → **Auth** and check email settings
- For testing, you can disable "Confirm email" temporarily

### "Permission denied" errors
- Make sure you ran the full migration SQL
- Check that RLS policies were created
- Verify the user has the correct role in the `profiles` table

### Profile not created after signup
- The `handle_new_user` trigger should create it automatically
- Check if the trigger exists: Go to **Database** → **Triggers**
- If missing, re-run the migration SQL

## Production Checklist

Before going live:

- [ ] Enable email confirmations
- [ ] Set production Site URL and Redirect URLs
- [ ] Configure a custom SMTP server (Settings → Auth → SMTP)
- [ ] Enable RLS on all tables (should be done by migration)
- [ ] Create database backups
- [ ] Set up monitoring and alerts
- [ ] Review and test all RLS policies
- [ ] Create your admin user

## Database Schema Overview

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (linked to auth.users) |
| `creator_profiles` | Extended info for creators |
| `campaigns` | Marketing campaigns |
| `campaign_applications` | Creator applications to campaigns |
| `campaign_assignments` | Approved creator-campaign matches |
| `leads` | Captured property enquiries |
| `payments` | Payment tracking |
| `notifications` | User notifications |

## Security Notes

- Row Level Security (RLS) is enabled on all tables
- Users can only access their own data
- Developers can view creator profiles but not edit them
- Admins have full access
- Leads can be submitted by anyone (for public forms)
- The `anon` key is safe to use in frontend code

## Need Help?

- [Supabase Docs](https://supabase.com/docs)
- [Supabase Discord](https://discord.supabase.com)
- Check the browser console for detailed error messages
