import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import UploadWidget from "@/app/studio/UploadWidget";
import DeleteVideoButton from "@/app/studio/DeleteVideoButton";
import DeleteProjectButton from "@/app/studio/DeleteProjectButton";

const STATUS_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  transcribed: "Transcribed",
  draft_cut: "Ready to review",
  edited: "Reviewed",
  exported: "Exported",
  assembling: "Assembling",
};

export default async function StudioPage() {
  const supabase = await createClient();
  const { data: videos } = await supabase
    .from("videos")
    .select("id, status, uploaded_at, duration_seconds, topic_tag")
    .is("project_id", null)
    .order("uploaded_at", { ascending: false });

  const { data: projects } = await supabase
    .from("projects")
    .select("id, status, created_at, topic_tag")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-6 px-6 py-16 text-center">
      <h1 className="text-3xl font-bold text-neutral-800">Studio 🎬</h1>
      <p className="text-neutral-500">Upload a raw clip to get started.</p>

      <UploadWidget />

      {projects && projects.length > 0 && (
        <section className="w-full rounded-3xl bg-violet-50 p-6 text-left">
          <h2 className="mb-3 text-lg font-semibold text-neutral-800">Your projects (multi-clip)</h2>
          <ul className="space-y-2">
            {projects.map((project) => (
              <li
                key={project.id}
                className="flex items-center rounded-2xl bg-white p-3 text-sm shadow-sm ring-1 ring-neutral-100 transition hover:ring-violet-200"
              >
                <Link
                  href={`/studio/project/${project.id}`}
                  className="flex flex-1 items-center justify-between"
                >
                  <span>{project.topic_tag ?? "(untitled project)"}</span>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-500">
                    {STATUS_LABELS[project.status] ?? project.status}
                  </span>
                </Link>
                <DeleteProjectButton projectId={project.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {videos && videos.length > 0 && (
        <section className="w-full rounded-3xl bg-sky-50 p-6 text-left">
          <h2 className="mb-3 text-lg font-semibold text-neutral-800">Your videos</h2>
          <ul className="space-y-2">
            {videos.map((video) => (
              <li
                key={video.id}
                className="flex items-center rounded-2xl bg-white p-3 text-sm shadow-sm ring-1 ring-neutral-100 transition hover:ring-sky-200"
              >
                <Link href={`/studio/${video.id}`} className="flex flex-1 items-center justify-between">
                  <span>
                    {video.topic_tag ?? "(untitled)"}
                    <span className="ml-2 text-neutral-400">
                      {video.duration_seconds ? `${Math.round(video.duration_seconds)}s` : ""}
                    </span>
                  </span>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-500">
                    {STATUS_LABELS[video.status] ?? video.status}
                  </span>
                </Link>
                <DeleteVideoButton videoId={video.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
