alter table edit_recipes add column image_overlays jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('overlay-images', 'overlay-images', false)
on conflict (id) do nothing;

create policy "authenticated user full access to overlay-images bucket"
  on storage.objects for all
  using (bucket_id = 'overlay-images' and auth.uid() is not null)
  with check (bucket_id = 'overlay-images' and auth.uid() is not null);
