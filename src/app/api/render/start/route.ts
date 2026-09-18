import { NextRequest, NextResponse } from "next/server";
import { renderMediaOnLambda } from "@remotion/lambda/client";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const FUNCTION_NAME = process.env.REMOTION_LAMBDA_FUNCTION_NAME!;
const REGION = process.env.REMOTION_LAMBDA_REGION as "us-east-1";
const SERVE_URL = process.env.REMOTION_LAMBDA_SERVE_URL!;

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
    .select("id, storage_path, duration_seconds")
    .eq("id", video_id)
    .single();
  if (videoError || !video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const { data: recipe, error: recipeError } = await supabase
    .from("edit_recipes")
    .select("id, cuts, emphasis_moments, caption_style, accent_color")
    .eq("video_id", video_id)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (recipeError || !recipe) {
    return NextResponse.json({ error: "No edit recipe found" }, { status: 404 });
  }

  const { data: transcript, error: transcriptError } = await supabase
    .from("transcripts")
    .select("words")
    .eq("video_id", video_id)
    .single();
  if (transcriptError || !transcript) {
    return NextResponse.json({ error: "No transcript found" }, { status: 404 });
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("videos")
    .createSignedUrl(video.storage_path, 3600);
  if (signedUrlError || !signedUrlData) {
    return NextResponse.json({ error: "Could not sign source video URL" }, { status: 500 });
  }

  const acceptedCuts = (recipe.cuts ?? []).filter(
    (c: { accepted: boolean }) => c.accepted
  );
  const approvedEmphasis = (recipe.emphasis_moments ?? []).filter(
    (m: { approved: boolean }) => m.approved
  );

  const inputProps = {
    videoUrl: signedUrlData.signedUrl,
    sourceDurationSeconds: video.duration_seconds,
    cuts: acceptedCuts,
    words: transcript.words,
    emphasisMoments: approvedEmphasis,
    captionStyle: recipe.caption_style ?? "static_block",
    accentColor: recipe.accent_color ?? "#FCEF91",
  };

  const { renderId, bucketName } = await renderMediaOnLambda({
    region: REGION,
    functionName: FUNCTION_NAME,
    serveUrl: SERVE_URL,
    composition: "EditedVideo",
    inputProps,
    codec: "h264",
    crf: 28,
    framesPerLambda: 3000,
  });

  return NextResponse.json({ renderId, bucketName, editRecipeId: recipe.id });
}
