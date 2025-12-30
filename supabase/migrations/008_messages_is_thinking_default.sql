update molielm_messages set is_thinking = false where is_thinking is null;

alter table molielm_messages alter column is_thinking set default false;

alter table molielm_messages alter column is_thinking set not null;

select pg_notify('pgrst', 'reload schema');
