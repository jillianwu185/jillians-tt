"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Clip = {
  id: string;
  sequence_order: number;
  topic_tag: string | null;
  duration_seconds: number | null;
  status: string;
};

type LoadState = "loading" | "ready" | "error";

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);

  const [renderState, setRenderState] = useState<"idle" | "rendering" | "error">("idle");
  const [renderErrorMessage, setRenderErrorMessage] = useState("");
  const [renderProgress, setRenderProgress] = useState(0);
  const [pastRenders, setPastRenders] = useState<{ id: string; rendered_at: string; url: string }[]>([]);

  async function loadClips() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("videos")
      .select("id, sequence_order, topic_tag, duration_seconds, status")
      .eq("project_id", projectId)
      .order("sequence_order", { ascending: true });
    if (error || !data) {
      setErrorMessage("Project not found");
      setLoadState("error");
      return;
    }
    setClips(data);
    setLoadState("ready");
  }

  async function loadPastRenders() {
    const supabase = createClient();
    const { data: renders } = await supabase
      .from("renders")
      .select("id, storage_path, rendered_at")
      .eq("project_id", projectId)
      .order("rendered_at", { ascending: false });
    if (!renders) return;

    const withUrls = await Promise.all(
      renders.map(async (r) => {
        const { data: signed } = await supabase.storage
          .from("renders")
          .createSignedUrl(r.storage_path, 3600);
        return { id: r.id, rendered_at: r.rendered_at, url: signed?.signedUrl ?? "" };
      })
    );
    setPastRenders(withUrls);
  }

  useEffect(() => {
    loadClips();
    loadPastRenders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function moveClip(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= clips.length) return;

    const supabase = createClient();
    const a = clips[index];
    const b = clips[targetIndex];

    const reordered = [...clips];
    reordered[index] = b;
    reordered[targetIndex] = a;
    setClips(reordered);

    await supabase.from("videos").update({ sequence_order: b.sequence_order }).eq("id", a.id);
    await supabase.from("videos").update({ sequence_order: a.sequence_order }).eq("id", b.id);
  }

  async function handleRender() {
    setRenderState("rendering");
    setRenderErrorMessage("");
    setRenderProgress(0);
    try {
      const startResponse = await fetch("/api/render/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const startResult = await startResponse.json();
      if (!startResponse.ok) throw new Error(startResult.error ?? "Render failed to start");

      const { renderId, bucketName } = startResult;

      for (let attempt = 0; attempt < 200; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        const statusResponse = await fetch("/api/render/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            render_id: renderId,
            bucket_name: bucketName,
          }),
        });
        const statusResult = await statusResponse.json();
        if (!statusResponse.ok) throw new Error(statusResult.error ?? "Render failed");

        if (statusResult.done) {
          if (statusResult.error) throw new Error(statusResult.error);
          setRenderState("idle");
          await loadPastRenders();
          return;
        }
        setRenderProgress(statusResult.overallProgress ?? 0);
      }
      throw new Error("Render is taking longer than expected — check back shortly");
    } catch (err) {
      setRenderErrorMessage(err instanceof Error ? err.message : "Render failed");
      setRenderState("error");
    }
  }

  if (loadState === "loading") {
    return <p className="p-16 text-center text-neutral-500">Loading…</p>;
  }
  if (loadState === "error") {
    return <p className="p-16 text-center text-red-600">{errorMessage}</p>;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-2 text-2xl font-semibold">Project</h1>
      <p className="mb-6 text-neutral-600">
        Reorder your clips, edit cuts/emphasis on each, then render the whole thing.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Clips ({clips.length})</h2>
        <ul className="space-y-2">
          {clips.map((clip, i) => (
            <li
              key={clip.id}
              className="flex items-center gap-3 rounded-md border border-neutral-200 p-3 text-sm"
            >
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => moveClip(i, -1)}
                  disabled={i === 0}
                  className="text-neutral-400 hover:text-black disabled:opacity-30"
                  aria-label="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveClip(i, 1)}
                  disabled={i === clips.length - 1}
                  className="text-neutral-400 hover:text-black disabled:opacity-30"
                  aria-label="Move down"
                >
                  ▼
                </button>
              </div>
              <Link href={`/studio/${clip.id}`} className="flex-1 hover:underline">
                {i + 1}. {clip.topic_tag ?? "(untitled)"}
                {clip.duration_seconds ? ` — ${Math.round(clip.duration_seconds)}s` : ""}
              </Link>
              <span className="text-neutral-500">{clip.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-neutral-200 pt-8">
        <h2 className="mb-3 text-lg font-medium">Render</h2>
        <button
          onClick={handleRender}
          disabled={renderState === "rendering"}
          className="rounded-md bg-black px-5 py-2.5 text-white"
        >
          {renderState === "rendering"
            ? `Rendering… ${Math.round(renderProgress * 100)}%`
            : "Render full project"}
        </button>
        {renderState === "rendering" && (
          <p className="mt-2 text-sm text-neutral-500">
            This can take a few minutes — feel free to leave this open in the background.
          </p>
        )}
        {renderErrorMessage && <p className="mt-3 text-sm text-red-600">{renderErrorMessage}</p>}

        {pastRenders.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-medium text-neutral-700">
              Past renders ({pastRenders.length})
            </h3>
            <ul className="space-y-4">
              {pastRenders.map((r) => (
                <li key={r.id}>
                  <p className="mb-1 text-xs text-neutral-500">
                    {new Date(r.rendered_at).toLocaleString()}
                  </p>
                  <video src={r.url} controls className="w-full rounded-lg" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
