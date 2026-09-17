create extension if not exists "pgcrypto";

create table videos (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  duration_seconds float,
  uploaded_at timestamptz not null default now(),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'transcribed', 'draft_cut', 'edited', 'exported'))
);

create table transcripts (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos (id) on delete cascade,
  words jsonb not null default '[]'::jsonb
);

create table edit_recipes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos (id) on delete cascade,
  prompt_history jsonb not null default '[]'::jsonb,
  mood text,
  caption_style text
    check (caption_style in ('two_layer_headline', 'karaoke_reveal', 'static_block')),
  font_map jsonb not null default '{}'::jsonb,
  cuts jsonb not null default '[]'::jsonb,
  captions jsonb not null default '[]'::jsonb,
  emphasis_moments jsonb not null default '[]'::jsonb,
  accent_color text,
  version int not null default 1,
  created_at timestamptz not null default now()
);

create table renders (
  id uuid primary key default gen_random_uuid(),
  edit_recipe_id uuid not null references edit_recipes (id) on delete cascade,
  storage_path text not null,
  rendered_at timestamptz not null default now()
);

create table tiktok_videos (
  id uuid primary key default gen_random_uuid(),
  tiktok_video_id text not null unique,
  posted_at timestamptz,
  views int not null default 0,
  likes int not null default 0,
  comments int not null default 0,
  shares int not null default 0,
  caption_style_tag text,
  topic_tag text,
  synced_at timestamptz not null default now()
);

create table tiktok_studio_imports (
  id uuid primary key default gen_random_uuid(),
  uploaded_at timestamptz not null default now(),
  date_range_start date not null,
  date_range_end date not null,
  raw_csv_data jsonb not null
);

alter table videos enable row level security;
alter table transcripts enable row level security;
alter table edit_recipes enable row level security;
alter table renders enable row level security;
alter table tiktok_videos enable row level security;
alter table tiktok_studio_imports enable row level security;

create policy "authenticated user full access" on videos
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated user full access" on transcripts
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated user full access" on edit_recipes
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated user full access" on renders
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated user full access" on tiktok_videos
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated user full access" on tiktok_studio_imports
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
