import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

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

  const outDir = await mkdtemp(path.join(tmpdir(), "render-"));
  const outputPath = path.join(outDir, "output.mp4");

  try {
    const bundleLocation = await bundle({
      entryPoint: path.join(process.cwd(), "src/remotion/index.ts"),
    });

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "EditedVideo",
      inputProps,
    });

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      crf: 28,
    });

    const outputBuffer = await readFile(outputPath);
    const renderStoragePath = `${user.id}/${Date.now()}-render.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("renders")
      .upload(renderStoragePath, outputBuffer, { contentType: "video/mp4" });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { error: renderInsertError } = await supabase.from("renders").insert({
      edit_recipe_id: recipe.id,
      storage_path: renderStoragePath,
    });
    if (renderInsertError) {
      return NextResponse.json({ error: renderInsertError.message }, { status: 500 });
    }

    await supabase.from("videos").update({ status: "exported" }).eq("id", video_id);

    const { data: renderSignedUrl } = await supabase.storage
      .from("renders")
      .createSignedUrl(renderStoragePath, 3600);

    return NextResponse.json({ url: renderSignedUrl?.signedUrl });
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}
