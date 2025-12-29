create table if not exists public.molielm_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

-- Ensure user_id is unique so PostgREST upsert on_conflict=user_id works
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'molielm_profiles_user_id_key'
  ) THEN
    ALTER TABLE public.molielm_profiles
      ADD CONSTRAINT molielm_profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

alter table public.molielm_profiles enable row level security;

drop policy if exists "molielm_profiles_select_own" on public.molielm_profiles;
create policy "molielm_profiles_select_own" on public.molielm_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "molielm_profiles_insert_own" on public.molielm_profiles;
create policy "molielm_profiles_insert_own" on public.molielm_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "molielm_profiles_update_own" on public.molielm_profiles;
create policy "molielm_profiles_update_own" on public.molielm_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
