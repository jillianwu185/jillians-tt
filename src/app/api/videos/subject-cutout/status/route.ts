import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPrediction } from "@/lib/replicate";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { video_id, foreground_prediction_id, alpha_prediction_id } = await request.json();
  if (!video_id || !foreground_prediction_id || !alpha_prediction_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  async function fail(message: string) {
    await supabase
      .from("videos")
      .update({ subject_cutout_status: "error", subject_cutout_error: message })
      .eq("id", video_id);
    return NextResponse.json({ done: true, error: message });
  }

  try {
    const [foreground, alpha] = await Promise.all([
      getPrediction(foreground_prediction_id),
      getPrediction(alpha_prediction_id),
    ]);

    if (foreground.status === "failed" || foreground.status === "canceled") {
      return await fail(foreground.error ?? "Foreground extraction failed");
    }
    if (alpha.status === "failed" || alpha.status === "canceled") {
      return await fail(alpha.error ?? "Alpha matte extraction failed");
    }
    if (foreground.status !== "succeeded" || alpha.status !== "succeeded") {
      return NextResponse.json({ done: false });
    }
    if (!foreground.output || !alpha.output) {
      return await fail("Matting finished with no output file");
    }

    const [foregroundResponse, alphaResponse] = await Promise.all([
      fetch(foreground.output),
      fetch(alpha.output),
    ]);
    const foregroundBuffer = Buffer.from(await foregroundResponse.arrayBuffer());
    const alphaBuffer = Buffer.from(await alphaResponse.arrayBuffer());

    // Stored as two plain H.264 videos, not merged into one alpha-channel
    // file — a merged ProRes 4444 alpha file for a full clip runs several
    // hundred MB (its alpha plane ignores quality/bitrate targeting) and
    // blew past Supabase's 50MB upload cap. These two are composited at
    // render time instead (see SubjectCutoutView in Video.tsx).
    const foregroundPath = `${user.id}/${video_id}-fgr.mp4`;
    const alphaPath = `${user.id}/${video_id}-pha.mp4`;

    const [foregroundUpload, alphaUpload] = await Promise.all([
      supabase.storage
        .from("subject-cutouts")
        .upload(foregroundPath, foregroundBuffer, { contentType: "video/mp4", upsert: true }),
      supabase.storage
        .from("subject-cutouts")
        .upload(alphaPath, alphaBuffer, { contentType: "video/mp4", upsert: true }),
    ]);
    if (foregroundUpload.error) return await fail(foregroundUpload.error.message);
    if (alphaUpload.error) return await fail(alphaUpload.error.message);

    await supabase
      .from("videos")
      .update({
        subject_cutout_status: "ready",
        subject_cutout_foreground_path: foregroundPath,
        subject_cutout_alpha_path: alphaPath,
        subject_cutout_error: null,
      })
      .eq("id", video_id);

    return NextResponse.json({ done: true });
  } catch (err) {
    return await fail(err instanceof Error ? err.message : "Subject cutout failed");
  }
}
