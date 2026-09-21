import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .single();
  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: videos } = await supabase
    .from("videos")
    .select("storage_path")
    .eq("project_id", project_id);
  const videoPaths = (videos ?? []).map((v) => v.storage_path);
  if (videoPaths.length > 0) {
    await supabase.storage.from("videos").remove(videoPaths);
  }

  const { data: renders } = await supabase
    .from("renders")
    .select("storage_path")
    .eq("project_id", project_id);
  const renderPaths = (renders ?? []).map((r) => r.storage_path);
  if (renderPaths.length > 0) {
    await supabase.storage.from("renders").remove(renderPaths);
  }

  // Deleting the project cascades its clip `videos` rows, which in turn
  // cascades their transcripts/edit_recipes/renders DB rows.
  const { error: deleteError } = await supabase.from("projects").delete().eq("id", project_id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
