alter table if exists molielm_sources drop constraint if exists molielm_sources_pkey;
alter table if exists molielm_messages drop constraint if exists molielm_messages_pkey;

alter table if exists molielm_sources alter column id type text using id::text;
alter table if exists molielm_messages alter column id type text using id::text;

alter table if exists molielm_sources add primary key (id);
alter table if exists molielm_messages add primary key (id);

select pg_notify('pgrst', 'reload schema');
