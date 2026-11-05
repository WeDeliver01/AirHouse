# Migration 014 — applied to production Supabase

**Project:** `dmhhkearepriigdcbrxy.supabase.co`
**Applied at (UTC):** 2026-04-30T04:25:43Z
**Applied by:** Replit task agent, Task #53
**Connection route:** Session pooler (`aws-1-ap-south-1.pooler.supabase.com:5432`, role `postgres`)
**Method:** `psql -X --set=ON_ERROR_STOP=1 --single-transaction -f 014_verification_requests.sql`
**Result:** migration completed in a single transaction with no errors. `DROP POLICY IF EXISTS` and `DROP TRIGGER IF EXISTS` produced expected NOTICE lines because nothing existed yet; every `CREATE …` succeeded.

## Verification queries and results

Each block is the literal output of running the labeled query against the production Supabase Postgres after applying the migration.

### 1) Bucket exists and is private
```
           id           |          name          | public | file_size_limit |                allowed_mime_types
------------------------+------------------------+--------+-----------------+---------------------------------------------------
 verification-documents | verification-documents | f      |        10485760 | {image/jpeg,image/png,image/webp,application/pdf}
(1 row)
```

### 2) `verification_requests` columns
```
   column_name    |        data_type         | is_nullable |  column_default
------------------+--------------------------+-------------+-------------------
 id               | uuid                     | NO          | gen_random_uuid()
 user_id          | uuid                     | NO          |
 target_level     | text                     | NO          | 'basic'::text
 id_document_path | text                     | NO          |
 id_document_type | text                     | YES         |
 selfie_path      | text                     | NO          |
 status           | text                     | NO          | 'pending'::text
 applicant_notes  | text                     | YES         |
 reviewer_id      | uuid                     | YES         |
 reviewer_notes   | text                     | YES         |
 rejection_reason | text                     | YES         |
 submitted_at     | timestamp with time zone | NO          | now()
 reviewed_at      | timestamp with time zone | YES         |
 created_at       | timestamp with time zone | NO          | now()
 updated_at       | timestamp with time zone | NO          | now()
(15 rows)
```

### 3) Indexes (incl. partial unique on open requests)
```
                 indexname                  |                                                                      indexdef
--------------------------------------------+-----------------------------------------------------------------------------------------------------------------------------------------------------
 idx_verification_requests_status_submitted | CREATE INDEX idx_verification_requests_status_submitted ON public.verification_requests USING btree (status, submitted_at DESC)
 idx_verification_requests_user             | CREATE INDEX idx_verification_requests_user ON public.verification_requests USING btree (user_id, submitted_at DESC)
 uniq_verification_requests_open_per_user   | CREATE UNIQUE INDEX uniq_verification_requests_open_per_user ON public.verification_requests USING btree (user_id) WHERE (status = 'pending'::text)
 verification_requests_pkey                 | CREATE UNIQUE INDEX verification_requests_pkey ON public.verification_requests USING btree (id)
(4 rows)
```

### 4) RLS enabled on `verification_requests` and policies installed
```
        relname        | relrowsecurity
-----------------------+----------------
 verification_requests | t
(1 row)

                   polname                   | polcmd
---------------------------------------------+--------
 Applicants cancel own pending request       | w
 Applicants insert own verification request  | a
 Applicants read own verification requests   | r
 Super admins read all verification requests | r
 Super admins update verification requests   | w
(5 rows)
```

### 5) Storage policies on the new bucket
```
                 polname                 | polcmd
-----------------------------------------+--------
 Applicants delete own verification docs | d
 Applicants read own verification docs   | r
 Applicants update own verification docs | w
 Applicants upload own verification docs | a
 Super admins read all verification docs | r
(5 rows)
```

### 6) `updated_at` trigger and helper function
```
             trigger_name             | action_timing | event_manipulation
--------------------------------------+---------------+--------------------
 trg_verification_requests_updated_at | BEFORE        | UPDATE
(1 row)

               proname                | pg_get_function_result
--------------------------------------+------------------------
 verification_requests_set_updated_at | trigger
(1 row)
```

## 7) End-to-end smoke test (live, against production)

Driven from Node using the same `@supabase/supabase-js` client the front-end
uses + the Resend SDK + a privileged `psql` session for the admin
impersonation step (because no super admin exists in production yet — see
"Caveat" below). Throwaway data only; the script cleans up after itself
and any orphaned rows from earlier failed iterations were also removed
using `SET LOCAL storage.allow_delete_query='true'`.

Literal output of the final passing run:

```
[smoke] signed up creator verification-test-mokz2cms@delicatecourier.co.za -> bf0a0e2d-fde0-457d-9ad3-f9520e3fa4d5
[smoke] signed up bystander verification-other-mokz2cms@delicatecourier.co.za -> 04bd3611-a5bb-4fc6-b05d-f5b7e7b4fa61
[smoke] signed in creator, jwt.sub = bf0a0e2d-fde0-457d-9ad3-f9520e3fa4d5
[smoke] uploaded id + selfie under bf0a0e2d-fde0-457d-9ad3-f9520e3fa4d5/
[smoke] bystander upload into other user's folder correctly blocked: new row violates row-level security policy
[smoke] inserted verification_requests row 36aedbe4-6f58-4efe-b728-4fc7aeb6d58f
[smoke] applicant read own request OK
[smoke] bystander correctly filtered out of other user's request
[smoke] applicant cannot self-approve: new row violates row-level security policy for table "verification_requests"
[smoke] created temp super admin 12dddfed-e9dc-4e44-8b04-372156ce0cf0
[smoke] super admin approved request: approved|12dddfed-e9dc-4e44-8b04-372156ce0cf0
[smoke] profile.is_verified is now TRUE
[smoke] bystander update affected 0 rows (correctly blocked by RLS)
[smoke] approval email accepted by Resend, id=07c9bd80-12df-4c87-89f4-76e055d5260c
[smoke] rejection email accepted by Resend, id=efe30cdc-2862-47c4-b7fd-fe8a6b969789
[smoke] prod-shape email rejected by Resend (configuration issue, not migration): The delicatecourier.co.za domain is not verified. Please, add and verify your domain on https://resend.com/domains
[smoke] SMOKE TEST PASSED
[smoke] --- cleanup ---
[smoke]   deleted 2 storage objects via Storage API
[smoke]   deleted verification_requests row
[smoke]   deleted test creator
[smoke]   deleted bystander
[smoke]   deleted temp super admin
```

What this proves end-to-end on production for migration 014:

1. A real Supabase-Auth user (signed up via the anon key, the same path
   `Onboarding`/`AuthContext.signUp` uses) can upload an ID document and a
   liveness selfie into `verification-documents/<their_uid>/...` — the
   "Applicants upload own verification docs" storage policy passes.
2. A different authenticated user *cannot* upload into someone else's folder
   — the same policy correctly blocks the cross-user attempt with
   "new row violates row-level security policy".
3. The applicant can `INSERT` a row into `public.verification_requests` with
   `status='pending'` referencing the two storage paths — the
   "Applicants insert own verification request" policy passes.
4. The applicant can `SELECT` their own row but *cannot* see another user's
   row — the "Applicants read own verification requests" policy is enforced.
5. The applicant cannot smuggle a pre-approved row past the WITH CHECK
   clause (attempting to insert with `status='approved'` is rejected).
6. A super admin (impersonated by setting `role=authenticated`,
   `request.jwt.claim.sub`/`request.jwt.claims` and inserting a temp row
   into both `profiles` and `super_admins`) can `UPDATE` the row to
   `status='approved'` and flip `profiles.is_verified=TRUE` — exercising
   both the "Super admins update verification requests" RLS policy *and*
   the existing `prevent_privilege_escalation` trigger from migration 008,
   which now correctly accepts the change because the caller is in
   `super_admins`.
7. A non-admin authenticated user *cannot* update someone else's
   verification request — RLS filters the row out so the UPDATE affects 0
   rows.
8. Both the `verification_approved` and `verification_rejected` Resend
   templates render and are accepted by the Resend API (ids
   `07c9bd80-…` and `efe30cdc-…`). The smoke test sent these from the
   Resend sandbox sender (`onboarding@resend.dev`) to the Resend account
   owner — see the caveat below — but the payload and rendering matches
   what `server/email.js` will produce in production.

Cleanup verification after the test:

```
 leftover_objects
------------------
                0
(1 row)

 leftover_requests
-------------------
                 0
(1 row)

 smoke_users   leftover_super_admins
-----------   ---------------------
          0                       0
```

(Trailing storage objects and one verification request from earlier failed
iterations were also explicitly removed with
`SET LOCAL storage.allow_delete_query='true'` so the bucket and table are
empty as of the timestamp at the top of this file.)

## Caveat — production email deliverability is blocked at Resend, not at the migration

The smoke test confirmed the migration itself fully works, but a separate
Resend configuration problem will stop end-users from actually receiving
the decision emails today:

- The Resend connector is configured with `from = admin@delicatecourier.co.za`.
- That domain is **not verified** at <https://resend.com/domains>.
- Sending from it returns HTTP 403 with
  `"The delicatecourier.co.za domain is not verified. Please, add and
  verify your domain on https://resend.com/domains"`.
- On the current free tier the only allowed combination is
  `from = onboarding@resend.dev`, `to = ashleybaloyi.work@gmail.com`
  (the Resend account owner) — which is what the two `[task-53 smoke]`
  emails above used to prove the templates render correctly.

This is **not** a migration 014 issue (the table, bucket, RLS, trigger
and admin update path are all working) and it is **not** something the
migration script can fix. To make `verification_approved` /
`verification_rejected` emails actually reach the applicant in
production, someone needs to verify a sending domain in the Resend
dashboard (or update the connector to use a verified domain). I have
proposed a follow-up task for this so it doesn't get lost.

## Production super admin provisioned (mid-task, by user request)

After the smoke test confirmed the migration itself works, the user asked
me to also stand up the first real production super admin so the admin
Verification Center is actually reachable on the deployed app. This was
originally proposed as follow-up #63; doing it now made #63 obsolete
(removed from the follow-up list).

Steps performed against production:

1. Discovered that `super_admins` already had a pre-registered, unlinked
   row for `ashleybaloyi.work@gmail.com` (created 2026-02-06, `user_id =
   NULL`, `is_active = TRUE`) — i.e. the email had been pre-authorised as
   a super admin from day one but no auth user had ever signed up against
   it.
2. Created the corresponding `auth.users` row (UUID
   `cea9aac6-d264-453e-96f5-04fb822b2873`, `email_confirmed_at` set to
   `now()`, bcrypt-hashed temporary password, raw_user_meta_data
   `{"role":"admin","full_name":"Ashley Baloyi"}`) plus a matching
   `auth.identities` row for the email provider so password sign-in works.
3. The on-create triggers ran and produced a profile with `role = 'admin'`
   and a `developer` wallet, but the email column on the profile was left
   NULL and `is_super_admin` was not flipped (long-standing quirk in
   `handle_new_user` — the same NULL-email pattern is visible on the four
   pre-existing production profiles created back in February). Backfilled
   manually:
   - `UPDATE profiles SET email = 'ashleybaloyi.work@gmail.com',
     is_super_admin = TRUE WHERE id = 'cea9aac6…';`
   - `UPDATE super_admins SET user_id = 'cea9aac6…',
     granted_by = granted_by || ' + linked-by:task-53-agent',
     updated_at = now() WHERE email = 'ashleybaloyi.work@gmail.com';`
   - The `prevent_privilege_escalation` trigger correctly short-circuits
     for the postgres role (`current_setting('role', true) !=
     'authenticated'`), so this update was allowed.

End-state verification:

```
                  id                  |            email            | role  | is_super_admin
--------------------------------------+-----------------------------+-------+----------------
 cea9aac6-d264-453e-96f5-04fb822b2873 | ashleybaloyi.work@gmail.com | admin | t

                  id                  |            email            |               user_id                | is_active
--------------------------------------+-----------------------------+--------------------------------------+-----------
 c990564f-06b4-4a15-8a34-1c01d4a8441e | ashleybaloyi.work@gmail.com | cea9aac6-d264-453e-96f5-04fb822b2873 | t

 is_super_admin_helper_returns
-------------------------------
 t

(impersonating that user via SET LOCAL ROLE authenticated + JWT claims)
               jwt_uid                | jwt_is_super_admin
--------------------------------------+--------------------
 cea9aac6-d264-453e-96f5-04fb822b2873 | t

 pending_queue_visible_to_admin
--------------------------------
                              0   ← table exists, RLS lets the admin read it, currently empty
```

Live sign-in proof — hitting the production Supabase Auth API exactly the
way the deployed app does (`POST /auth/v1/token?grant_type=password`
with the anon key):

```
signin status: 200
user.id = cea9aac6-d264-453e-96f5-04fb822b2873
user.email = ashleybaloyi.work@gmail.com
email_confirmed_at = 2026-04-30T04:34:57.241146Z

REST profile lookup status: 200
profile = { role: 'admin', is_super_admin: true, full_name: 'Ashley Baloyi' }
```

**Temporary password** for the very first sign-in is being delivered to
the user out of band in this conversation. They should sign in to the
deployed app and immediately change it via the account settings (or the
"Forgot password" reset flow once the Resend domain is verified — see
the email caveat below).

### Smoke-test residue cleaned up

In addition to the cleanup recorded in section 7, three orphan auth
users from an earlier failed smoke iteration (`mokyy5j9` suffix:
`verification-test-…`, `verification-other-…`, `temp-admin-…`) were also
removed once spotted. Final state in production:

```
 leftover_smoke_users   | 0   (only legitimate @delicatecourier.co.za auth user remaining is admin@delicatecourier.co.za, unchanged)
 leftover_smoke_profiles| 0
```

## Done-criteria coverage

| Acceptance item from task #53 | Status | Evidence |
| --- | --- | --- |
| Migration 014 has been run against the production Supabase project | Done | Sections 1–6 above show every artifact created in production. |
| The `verification-documents` bucket exists and is private | Done | Section 1: `public = f`, 10MB limit, image+pdf only. |
| A test creator can submit ID + selfie from onboarding | Done | Section 7, steps 1+3+5: real auth user uploads two files and inserts a `verification_requests` row through anon-key Supabase JS, exactly the path `src/lib/verification.js` uses. |
| A super admin can approve them | Done | Section 7, step 6 (RLS path verified end-to-end with a temp super admin), AND a real production super admin (`ashleybaloyi.work@gmail.com`, profile `cea9aac6…`) is now provisioned and confirmed to sign in via the live Supabase Auth API. |
| Both decision emails arriving via Resend | Partial — see "Caveat — production email deliverability". The two templates render and are accepted by the Resend API (ids in section 7). End-user delivery is blocked by the unverified `delicatecourier.co.za` from-domain on the Resend account, which is a Resend dashboard setting, not part of this migration. A follow-up task (#62) has been proposed to verify the domain. |
