import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeWordAudioFeatures, extractCompressedAudio } from "@/lib/audio-analysis";
import { detectFillerAndSilenceCuts, detectEmphasisCandidates, type Cut } from "@/lib/cut-detection";
import { detectContextualCuts } from "@/lib/contextual-cuts";
import { generateTopicTag } from "@/lib/topic-tag";
import { generateAutoStyle } from "@/lib/auto-style";

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
    .select("id, storage_path, project_id")
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

  let audioBuffer: Buffer | null = null;
  try {
    audioBuffer = await extractCompressedAudio(videoBuffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hasNoAudioTrack = /does not contain any stream|matches no streams/i.test(message);
    if (!hasNoAudioTrack) {
      return NextResponse.json({ error: `Audio extraction failed: ${message}` }, { status: 500 });
    }
    // Silent clip (e.g. B-roll with no dialogue) — proceed with an empty transcript.
  }

  let wordsWithAudioFeatures: Awaited<ReturnType<typeof analyzeWordAudioFeatures>> = [];

  if (audioBuffer) {
    const whisperForm = new FormData();
    whisperForm.append("file", new Blob([new Uint8Array(audioBuffer)]), "audio.mp3");
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

    wordsWithAudioFeatures = await analyzeWordAudioFeatures(videoBuffer, wordTimings);
  }

  const words = wordsWithAudioFeatures.map((w) => ({ ...w, confidence: null }));

  const { error: insertError } = await supabase
    .from("transcripts")
    .insert({ video_id, words });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const heuristicCuts = detectFillerAndSilenceCuts(wordsWithAudioFeatures);
  const contextualCuts = await detectContextualCuts(wordsWithAudioFeatures).catch(() => [] as Cut[]);
  const cuts = [...heuristicCuts, ...contextualCuts].sort((a, b) => a.start - b.start);
  const emphasisMoments = detectEmphasisCandidates(wordsWithAudioFeatures);

  const transcriptText = words.map((w) => w.word).join(" ");
  const topicTag = transcriptText
    ? await generateTopicTag(transcriptText).catch(() => null)
    : "silent clip";

  // Multi-clip projects get one combined auto-style pass after every clip is
  // in (see /api/project-autostyle) rather than a different style per clip.
  const autoStyle =
    !video.project_id && transcriptText
      ? await generateAutoStyle(transcriptText).catch(() => null)
      : null;

  const { error: recipeError } = await supabase.from("edit_recipes").insert({
    video_id,
    prompt_history: [],
    cuts,
    captions: [],
    emphasis_moments: emphasisMoments,
    font_map: {},
    header_title: autoStyle?.headerTitle ?? null,
    mood: autoStyle?.mood ?? null,
    caption_style: autoStyle?.captionStyle ?? null,
    accent_color: autoStyle?.accentColor ?? null,
    version: 1,
  });
  if (recipeError) {
    return NextResponse.json({ error: recipeError.message }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("videos")
    .update({ status: "draft_cut", topic_tag: topicTag })
    .eq("id", video_id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ words, cuts, emphasisMoments });
}
