create table if not exists public.molielm_voice_calibrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  prompt_text text,
  transcript text,
  audio_path text,
  duration_ms integer,
  sample_rate integer,
  rms real,
  locale text
);

alter table public.molielm_voice_calibrations enable row level security;

drop policy if exists "molielm_voice_calibrations_select_own" on public.molielm_voice_calibrations;
create policy "molielm_voice_calibrations_select_own" on public.molielm_voice_calibrations
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "molielm_voice_calibrations_insert_own" on public.molielm_voice_calibrations;
create policy "molielm_voice_calibrations_insert_own" on public.molielm_voice_calibrations
for insert
to authenticated
with check (auth.uid() = user_id);
