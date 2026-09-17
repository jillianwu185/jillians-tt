import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeWordAudioFeatures } from "@/lib/audio-analysis";
import { detectFillerAndSilenceCuts, detectEmphasisCandidates } from "@/lib/cut-detection";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { video_id } = await request.json();
  if (!video_id) {
    return NextResponse.json({ error: "video_id is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: video, error: videoError } = await supabase
    .from("videos")
    .select("id, storage_path")
    .eq("id", video_id)
    .single();
  if (videoError || !video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("videos")
    .download(video.storage_path);
  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: "Could not download video" }, { status: 500 });
  }

  const videoBuffer = Buffer.from(await fileBlob.arrayBuffer());

  const whisperForm = new FormData();
  whisperForm.append("file", fileBlob, "audio.mp4");
  whisperForm.append("model", "whisper-1");
  whisperForm.append("response_format", "verbose_json");
  whisperForm.append("timestamp_granularities[]", "word");

  const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: whisperForm,
  });

  if (!whisperResponse.ok) {
    const errText = await whisperResponse.text();
    return NextResponse.json({ error: `Whisper API error: ${errText}` }, { status: 502 });
  }

  const whisperResult = await whisperResponse.json();
  const wordTimings = (whisperResult.words ?? []).map(
    (w: { word: string; start: number; end: number }) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    })
  );

  const wordsWithAudioFeatures = await analyzeWordAudioFeatures(videoBuffer, wordTimings);
  const words = wordsWithAudioFeatures.map((w) => ({ ...w, confidence: null }));

  const { error: insertError } = await supabase
    .from("transcripts")
    .insert({ video_id, words });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const cuts = detectFillerAndSilenceCuts(wordsWithAudioFeatures);
  const emphasisMoments = detectEmphasisCandidates(wordsWithAudioFeatures);

  const { error: recipeError } = await supabase.from("edit_recipes").insert({
    video_id,
    prompt_history: [],
    cuts,
    captions: [],
    emphasis_moments: emphasisMoments,
    font_map: {},
    version: 1,
  });
  if (recipeError) {
    return NextResponse.json({ error: recipeError.message }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("videos")
    .update({ status: "draft_cut" })
    .eq("id", video_id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ words, cuts, emphasisMoments });
}
