alter table videos drop column subject_cutout_path;
alter table videos add column subject_cutout_foreground_path text;
alter table videos add column subject_cutout_alpha_path text;
