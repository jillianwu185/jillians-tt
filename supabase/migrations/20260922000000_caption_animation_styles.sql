alter table edit_recipes drop constraint if exists edit_recipes_caption_style_check;
alter table edit_recipes add constraint edit_recipes_caption_style_check
  check (caption_style in (
    'two_layer_headline',
    'karaoke_reveal',
    'static_block',
    'word_by_word',
    'progressive_reveal',
    'typing'
  ));
