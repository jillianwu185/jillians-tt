create table projects (
  id uuid primary key default gen_random_uuid(),
  topic_tag text,
  status text not null default 'assembling'
    check (status in ('assembling', 'draft_cut', 'edited', 'exported')),
  created_at timestamptz not null default now()
);

alter table projects enable row level security;
create policy "authenticated user full access" on projects
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

alter table videos add column project_id uuid references projects(id) on delete cascade;
alter table videos add column sequence_order int;

alter table renders alter column edit_recipe_id drop not null;
alter table renders add column project_id uuid references projects(id) on delete cascade;
