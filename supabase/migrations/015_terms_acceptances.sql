-- 015_terms_acceptances.sql
-- Audit trail of who accepted which policy versions, when and from where.
-- Required for Yoco / BobPay underwriting and for POPIA accountability.

create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('creator', 'developer', 'admin')),
  terms_version text not null,
  privacy_version text not null,
  role_agreement_key text,
  role_agreement_version text,
  user_agent text,
  ip_address inet,
  accepted_at timestamptz not null default now()
);

create index if not exists terms_acceptances_user_id_idx
  on public.terms_acceptances (user_id);
create index if not exists terms_acceptances_accepted_at_idx
  on public.terms_acceptances (accepted_at desc);

alter table public.terms_acceptances enable row level security;

-- Insert: only as the authenticated user themselves.
drop policy if exists "terms_acceptances_insert_self" on public.terms_acceptances;
create policy "terms_acceptances_insert_self" on public.terms_acceptances
  for insert
  with check (auth.uid() = user_id);

-- Select: only your own rows. (Admins read via service role.)
drop policy if exists "terms_acceptances_select_self" on public.terms_acceptances;
create policy "terms_acceptances_select_self" on public.terms_acceptances
  for select
  using (auth.uid() = user_id);

-- Immutable record — no updates or deletes from the client.
revoke update, delete on public.terms_acceptances from anon, authenticated;
