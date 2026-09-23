import { NextRequest, NextResponse } from "next/server";
import { renderMediaOnLambda } from "@remotion/lambda/client";
import { createClient } from "@/lib/supabase/server";
import type { ClipInput, OverlayEdge } from "@/remotion/Video";

export const maxDuration = 60;

const FUNCTION_NAME = process.env.REMOTION_LAMBDA_FUNCTION_NAME!;
const REGION = process.env.REMOTION_LAMBDA_REGION as "us-east-1";
const SERVE_URL = process.env.REMOTION_LAMBDA_SERVE_URL!;

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function buildClipInput(
  supabase: Supabase,
  videoId: string
): Promise<{ clip: ClipInput; editRecipeId: string; headerTitle: string | null } | { error: string }> {
  const { data: video, error: videoError } = await supabase
    .from("videos")
    .select("id, storage_path, duration_seconds")
    .eq("id", videoId)
    .single();
  if (videoError || !video) return { error: `Video ${videoId} not found` };

  const { data: recipe, error: recipeError } = await supabase
    .from("edit_recipes")
    .select(
      "id, cuts, emphasis_moments, image_overlays, video_overlays, caption_style, accent_color, font_map, header_title"
    )
    .eq("video_id", videoId)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (recipeError || !recipe) return { error: `No edit recipe found for video ${videoId}` };

  const { data: transcript, error: transcriptError } = await supabase
    .from("transcripts")
    .select("words")
    .eq("video_id", videoId)
    .single();
  if (transcriptError || !transcript) return { error: `No transcript found for video ${videoId}` };

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("videos")
    .createSignedUrl(video.storage_path, 3600);
  if (signedUrlError || !signedUrlData) return { error: `Could not sign source video URL for ${videoId}` };

  const acceptedCuts = (recipe.cuts ?? []).filter((c: { accepted: boolean }) => c.accepted);
  const approvedEmphasis = (recipe.emphasis_moments ?? [])
    .filter((m: { approved: boolean }) => m.approved)
    .map((m: { calloutFontSize?: number; calloutX?: number; calloutY?: number }) => ({
      calloutFontSize: 140,
      calloutX: 50,
      calloutY: 50,
      ...m,
    }));

  const fontMap = (recipe.font_map ?? {}) as Record<string, string | number>;

  const imageOverlaysRaw = (recipe.image_overlays ?? []) as {
    storagePath: string;
    start: number;
    end: number;
    x: number;
    y: number;
    widthPercent: number;
    animationIn: OverlayEdge;
    animationOut: OverlayEdge;
  }[];
  const imageOverlays = await Promise.all(
    imageOverlaysRaw.map(async (o) => {
      const { data: signed } = await supabase.storage
        .from("overlay-images")
        .createSignedUrl(o.storagePath, 3600);
      return {
        imageUrl: signed?.signedUrl ?? "",
        start: o.start,
        end: o.end,
        x: o.x,
        y: o.y,
        widthPercent: o.widthPercent,
        animationIn: o.animationIn,
        animationOut: o.animationOut,
      };
    })
  );

  const videoOverlaysRaw = (recipe.video_overlays ?? []) as {
    storagePath: string;
    start: number;
    end: number;
  }[];
  const videoOverlays = await Promise.all(
    videoOverlaysRaw.map(async (v) => {
      const { data: signed } = await supabase.storage
        .from("overlay-videos")
        .createSignedUrl(v.storagePath, 3600);
      return { videoUrl: signed?.signedUrl ?? "", start: v.start, end: v.end };
    })
  );

  return {
    editRecipeId: recipe.id,
    headerTitle: recipe.header_title ?? null,
    clip: {
      videoUrl: signedUrlData.signedUrl,
      sourceDurationSeconds: video.duration_seconds,
      cuts: acceptedCuts,
      words: transcript.words,
      emphasisMoments: approvedEmphasis,
      imageOverlays,
      videoOverlays,
      captionStyle: recipe.caption_style ?? "static_block",
      captionFont: (fontMap.caption as string) ?? "airy",
      captionSizeMultiplier: (fontMap.captionSizeMultiplier as number) ?? 1,
      accentColor: recipe.accent_color ?? "#FCEF91",
    },
  };
}

export async function POST(request: NextRequest) {
  const { video_id, project_id } = await request.json();
  if (!video_id && !project_id) {
    return NextResponse.json({ error: "video_id or project_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const clips: ClipInput[] = [];
  let editRecipeId: string | null = null;
  let headerTitle: string | null = null;

  if (video_id) {
    const result = await buildClipInput(supabase, video_id);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
    clips.push(result.clip);
    editRecipeId = result.editRecipeId;
    headerTitle = result.headerTitle;
  } else {
    const { data: videos, error: videosError } = await supabase
      .from("videos")
      .select("id")
      .eq("project_id", project_id)
      .eq("included_in_story", true)
      .order("sequence_order", { ascending: true });
    if (videosError || !videos || videos.length === 0) {
      return NextResponse.json({ error: "No clips found for this project" }, { status: 404 });
    }

    for (const v of videos) {
      const result = await buildClipInput(supabase, v.id);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
      clips.push(result.clip);
    }

    const { data: project } = await supabase
      .from("projects")
      .select("header_title")
      .eq("id", project_id)
      .single();
    headerTitle = project?.header_title ?? null;
  }

  const { data: fontRows } = await supabase.from("fonts").select("key, google_font_family");
  const fontMap: Record<string, string> = {};
  for (const f of fontRows ?? []) fontMap[f.key] = f.google_font_family;

  const { renderId, bucketName } = await renderMediaOnLambda({
    region: REGION,
    functionName: FUNCTION_NAME,
    serveUrl: SERVE_URL,
    composition: "EditedVideo",
    inputProps: { clips, fontMap, headerTitle },
    codec: "h264",
    crf: 28,
  });

  return NextResponse.json({ renderId, bucketName, editRecipeId, projectId: project_id ?? null });
}
