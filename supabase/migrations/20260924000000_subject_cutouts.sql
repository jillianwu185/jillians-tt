alter table videos add column subject_cutout_path text;
alter table videos add column subject_cutout_status text not null default 'none'
  check (subject_cutout_status in ('none', 'processing', 'ready', 'error'));
alter table videos add column subject_cutout_error text;

insert into storage.buckets (id, name, public)
values ('subject-cutouts', 'subject-cutouts', false)
on conflict (id) do nothing;

create policy "authenticated user full access to subject-cutouts bucket"
  on storage.objects for all
  using (bucket_id = 'subject-cutouts' and auth.uid() is not null)
  with check (bucket_id = 'subject-cutouts' and auth.uid() is not null);
