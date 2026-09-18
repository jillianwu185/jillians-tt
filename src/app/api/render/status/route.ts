import { NextRequest, NextResponse } from "next/server";
import { getRenderProgress } from "@remotion/lambda/client";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const FUNCTION_NAME = process.env.REMOTION_LAMBDA_FUNCTION_NAME!;
const REGION = process.env.REMOTION_LAMBDA_REGION as "us-east-1";

export async function POST(request: NextRequest) {
  const { video_id, render_id, bucket_name, edit_recipe_id } = await request.json();
  if (!video_id || !render_id || !bucket_name || !edit_recipe_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const progress = await getRenderProgress({
    renderId: render_id,
    bucketName: bucket_name,
    functionName: FUNCTION_NAME,
    region: REGION,
  });

  if (progress.fatalErrorEncountered) {
    return NextResponse.json(
      { done: true, error: progress.errors?.[0]?.message ?? "Render failed on Lambda" },
      { status: 200 }
    );
  }

  if (!progress.done) {
    return NextResponse.json({ done: false, overallProgress: progress.overallProgress });
  }

  const outputUrl = progress.outputFile;
  if (!outputUrl) {
    return NextResponse.json({ done: true, error: "Render finished with no output file" });
  }

  const renderResponse = await fetch(outputUrl);
  const renderBuffer = Buffer.from(await renderResponse.arrayBuffer());
  const renderStoragePath = `${user.id}/${Date.now()}-render.mp4`;

  const { error: uploadError } = await supabase.storage
    .from("renders")
    .upload(renderStoragePath, renderBuffer, { contentType: "video/mp4" });
  if (uploadError) {
    return NextResponse.json({ done: true, error: uploadError.message });
  }

  const { error: renderInsertError } = await supabase.from("renders").insert({
    edit_recipe_id,
    storage_path: renderStoragePath,
  });
  if (renderInsertError) {
    return NextResponse.json({ done: true, error: renderInsertError.message });
  }

  await supabase.from("videos").update({ status: "exported" }).eq("id", video_id);

  const { data: renderSignedUrl } = await supabase.storage
    .from("renders")
    .createSignedUrl(renderStoragePath, 3600);

  return NextResponse.json({ done: true, url: renderSignedUrl?.signedUrl });
}
