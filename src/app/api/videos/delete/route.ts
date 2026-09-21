import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  type RenderRow = { storage_path: string; edit_recipes: { video_id: string } | null };
  const { data: renders } = await supabase
    .from("renders")
    .select("storage_path, edit_recipes!inner(video_id)")
    .eq("edit_recipes.video_id", video_id);
  const renderPaths = ((renders ?? []) as unknown as RenderRow[]).map((r) => r.storage_path);

  if (renderPaths.length > 0) {
    await supabase.storage.from("renders").remove(renderPaths);
  }
  await supabase.storage.from("videos").remove([video.storage_path]);

  const { error: deleteError } = await supabase.from("videos").delete().eq("id", video_id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
