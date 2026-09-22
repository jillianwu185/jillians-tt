alter table videos add column template text not null default 'talking_video'
  check (template in ('talking_video'));
alter table projects add column template text not null default 'talking_video'
  check (template in ('talking_video'));

alter table edit_recipes add column header_title text;
alter table projects add column header_title text;
