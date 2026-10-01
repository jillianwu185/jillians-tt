alter table tiktok_videos add column title text;
alter table tiktok_videos add column cover_image_url text;
alter table tiktok_videos add column performance_summary text;
alter table tiktok_videos add column performance_verdict text
  check (performance_verdict in ('standout', 'solid', 'underperformed'));
