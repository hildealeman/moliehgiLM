create extension if not exists pgcrypto;

alter table if exists molielm_projects add column if not exists user_id uuid;
alter table if exists molielm_projects add column if not exists name text;
alter table if exists molielm_projects add column if not exists created_at timestamptz;
alter table if exists molielm_projects add column if not exists updated_at timestamptz;

alter table if exists molielm_sources add column if not exists project_id uuid;
alter table if exists molielm_sources add column if not exists user_id uuid;
alter table if exists molielm_sources add column if not exists title text;
alter table if exists molielm_sources add column if not exists type text;
alter table if exists molielm_sources add column if not exists mime_type text;
alter table if exists molielm_sources add column if not exists storage_path text;
alter table if exists molielm_sources add column if not exists content_text text;
alter table if exists molielm_sources add column if not exists content_preview text;
alter table if exists molielm_sources add column if not exists extracted_text text;
alter table if exists molielm_sources add column if not exists created_at timestamptz;

alter table if exists molielm_messages add column if not exists project_id uuid;
alter table if exists molielm_messages add column if not exists user_id uuid;
alter table if exists molielm_messages add column if not exists role text;
alter table if exists molielm_messages add column if not exists text text;
alter table if exists molielm_messages add column if not exists is_thinking boolean;
alter table if exists molielm_messages add column if not exists images jsonb;
alter table if exists molielm_messages add column if not exists audio_data text;
alter table if exists molielm_messages add column if not exists sources jsonb;
alter table if exists molielm_messages add column if not exists evidence jsonb;
alter table if exists molielm_messages add column if not exists reasoning text;
alter table if exists molielm_messages add column if not exists created_at timestamptz;

alter table if exists molielm_projects enable row level security;
alter table if exists molielm_sources enable row level security;
alter table if exists molielm_messages enable row level security;

select pg_notify('pgrst', 'reload schema');
