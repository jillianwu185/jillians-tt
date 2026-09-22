import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAutoStyle } from "@/lib/auto-style";

export async function POST(request: NextRequest) {
  const { project_id } = await request.json();
  if (!project_id) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: clipVideos, error: clipsError } = await supabase
    .from("videos")
    .select("id")
    .eq("project_id", project_id)
    .order("sequence_order", { ascending: true });
  if (clipsError || !clipVideos || clipVideos.length === 0) {
    return NextResponse.json({ error: "No clips found for this project" }, { status: 404 });
  }

  const clips = await Promise.all(
    clipVideos.map(async (v) => {
      const { data: recipe } = await supabase
        .from("edit_recipes")
        .select("*")
        .eq("video_id", v.id)
        .order("version", { ascending: false })
        .limit(1)
        .single();
      const { data: transcript } = await supabase
        .from("transcripts")
        .select("words")
        .eq("video_id", v.id)
        .single();
      return { videoId: v.id, recipe, words: (transcript?.words ?? []) as { word: string }[] };
    })
  );

  const combinedTranscript = clips
    .map((c) => c.words.map((w) => w.word).join(" "))
    .filter(Boolean)
    .join(" ");

  if (!combinedTranscript) {
    return NextResponse.json({ error: "No dialogue found across this project's clips" }, { status: 400 });
  }

  const autoStyle = await generateAutoStyle(combinedTranscript).catch(() => null);
  if (!autoStyle) {
    return NextResponse.json({ error: "Auto-styling failed" }, { status: 502 });
  }

  const { error: projectUpdateError } = await supabase
    .from("projects")
    .update({ header_title: autoStyle.headerTitle })
    .eq("id", project_id);
  if (projectUpdateError) {
    return NextResponse.json({ error: projectUpdateError.message }, { status: 500 });
  }

  for (const clip of clips) {
    if (!clip.recipe) continue;
    const recipe = clip.recipe;
    const { error: insertError } = await supabase.from("edit_recipes").insert({
      video_id: clip.videoId,
      prompt_history: recipe.prompt_history ?? [],
      mood: autoStyle.mood,
      caption_style: autoStyle.captionStyle,
      font_map: recipe.font_map ?? {},
      cuts: recipe.cuts ?? [],
      captions: recipe.captions ?? [],
      emphasis_moments: recipe.emphasis_moments ?? [],
      header_title: recipe.header_title ?? null,
      accent_color: autoStyle.accentColor,
      version: (recipe.version ?? 1) + 1,
    });
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ headerTitle: autoStyle.headerTitle });
}
