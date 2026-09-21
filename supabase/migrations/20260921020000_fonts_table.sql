create table fonts (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  display_name text not null,
  google_font_family text not null,
  created_at timestamptz not null default now()
);

alter table fonts enable row level security;
create policy "authenticated user full access" on fonts
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

insert into fonts (key, display_name, google_font_family) values
  ('chic', 'Chic (Playfair Display)', 'Playfair Display'),
  ('bubbly', 'Bubbly (Poppins)', 'Poppins'),
  ('airy', 'Airy (Public Sans)', 'Public Sans');
