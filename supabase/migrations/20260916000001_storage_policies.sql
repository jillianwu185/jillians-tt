create policy "authenticated user full access to videos bucket"
  on storage.objects for all
  using (bucket_id = 'videos' and auth.uid() is not null)
  with check (bucket_id = 'videos' and auth.uid() is not null);

create policy "authenticated user full access to renders bucket"
  on storage.objects for all
  using (bucket_id = 'renders' and auth.uid() is not null)
  with check (bucket_id = 'renders' and auth.uid() is not null);
