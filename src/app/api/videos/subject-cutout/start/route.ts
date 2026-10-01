import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createVideoMattePrediction } from "@/lib/replicate";

export const maxDuration = 30;

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
    .select("storage_path")
    .eq("id", video_id)
    .single();
  if (videoError || !video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("videos")
    .createSignedUrl(video.storage_path, 3600);
  if (signedUrlError || !signedUrlData) {
    return NextResponse.json({ error: "Could not sign source video URL" }, { status: 500 });
  }

  try {
    // Replicate's create-prediction rate limit is 6/min (1 every ~10s) while
    // an account has under $5 in credit — sequential awaits alone aren't
    // enough spacing, so wait out the window between the two calls.
    const foregroundPredictionId = await createVideoMattePrediction(
      signedUrlData.signedUrl,
      "foreground-mask"
    );
    await new Promise((resolve) => setTimeout(resolve, 11000));
    const alphaPredictionId = await createVideoMattePrediction(
      signedUrlData.signedUrl,
      "alpha-mask"
    );

    await supabase
      .from("videos")
      .update({ subject_cutout_status: "processing", subject_cutout_error: null })
      .eq("id", video_id);

    return NextResponse.json({ foregroundPredictionId, alphaPredictionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start subject cutout";
    await supabase
      .from("videos")
      .update({ subject_cutout_status: "error", subject_cutout_error: message })
      .eq("id", video_id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
