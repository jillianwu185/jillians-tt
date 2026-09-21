create table tiktok_credentials (
  id uuid primary key default gen_random_uuid(),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table tiktok_credentials enable row level security;

create policy "authenticated user full access" on tiktok_credentials
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
