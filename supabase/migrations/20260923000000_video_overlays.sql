alter table edit_recipes add column video_overlays jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('overlay-videos', 'overlay-videos', false)
on conflict (id) do nothing;

create policy "authenticated user full access to overlay-videos bucket"
  on storage.objects for all
  using (bucket_id = 'overlay-videos' and auth.uid() is not null)
  with check (bucket_id = 'overlay-videos' and auth.uid() is not null);
