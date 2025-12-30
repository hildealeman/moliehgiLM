create extension if not exists pgcrypto;

create table if not exists molielm_projects (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists molielm_projects_user_id_idx on molielm_projects(user_id);

alter table molielm_projects enable row level security;

drop policy if exists "molielm_projects_select_own" on molielm_projects;
create policy "molielm_projects_select_own" on molielm_projects
  for select using (auth.uid() = user_id);

drop policy if exists "molielm_projects_insert_own" on molielm_projects;
create policy "molielm_projects_insert_own" on molielm_projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "molielm_projects_update_own" on molielm_projects;
create policy "molielm_projects_update_own" on molielm_projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "molielm_projects_delete_own" on molielm_projects;
create policy "molielm_projects_delete_own" on molielm_projects
  for delete using (auth.uid() = user_id);


create table if not exists molielm_sources (
  id text primary key,
  project_id uuid not null references molielm_projects(id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  type text not null,
  mime_type text,
  storage_path text,
  content_text text,
  content_preview text,
  extracted_text text,
  created_at timestamptz not null default now()
);

create index if not exists molielm_sources_project_id_idx on molielm_sources(project_id);
create index if not exists molielm_sources_user_id_idx on molielm_sources(user_id);

alter table molielm_sources enable row level security;

drop policy if exists "molielm_sources_select_own" on molielm_sources;
create policy "molielm_sources_select_own" on molielm_sources
  for select using (auth.uid() = user_id);

drop policy if exists "molielm_sources_insert_own" on molielm_sources;
create policy "molielm_sources_insert_own" on molielm_sources
  for insert with check (auth.uid() = user_id);

drop policy if exists "molielm_sources_update_own" on molielm_sources;
create policy "molielm_sources_update_own" on molielm_sources
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "molielm_sources_delete_own" on molielm_sources;
create policy "molielm_sources_delete_own" on molielm_sources
  for delete using (auth.uid() = user_id);


create table if not exists molielm_messages (
  id text primary key,
  project_id uuid not null references molielm_projects(id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  text text not null,
  is_thinking boolean,
  images jsonb,
  audio_data text,
  sources jsonb,
  evidence jsonb,
  reasoning text,
  created_at timestamptz not null default now()
);

create index if not exists molielm_messages_project_id_idx on molielm_messages(project_id);
create index if not exists molielm_messages_user_id_idx on molielm_messages(user_id);

alter table molielm_messages enable row level security;

drop policy if exists "molielm_messages_select_own" on molielm_messages;
create policy "molielm_messages_select_own" on molielm_messages
  for select using (auth.uid() = user_id);

drop policy if exists "molielm_messages_insert_own" on molielm_messages;
create policy "molielm_messages_insert_own" on molielm_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "molielm_messages_update_own" on molielm_messages;
create policy "molielm_messages_update_own" on molielm_messages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "molielm_messages_delete_own" on molielm_messages;
create policy "molielm_messages_delete_own" on molielm_messages
  for delete using (auth.uid() = user_id);
