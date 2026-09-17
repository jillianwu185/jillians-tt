"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Cut = {
  start: number;
  end: number;
  reason: "filler_word" | "silence";
  user_nudged: boolean;
  accepted: boolean;
};

type EmphasisMoment = {
  word: string;
  start: number;
  end: number;
  treatment: string;
  source: string;
  approved: boolean;
  [key: string]: unknown;
};

type LoadState = "loading" | "ready" | "error";

export default function ReviewPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [duration, setDuration] = useState(0);
  const [videoUrl, setVideoUrl] = useState("");
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [emphasisMoments, setEmphasisMoments] = useState<EmphasisMoment[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const [prompt, setPrompt] = useState("");
  const [promptState, setPromptState] = useState<"idle" | "sending" | "error">("idle");
  const [promptReasoning, setPromptReasoning] = useState("");

  const [renderState, setRenderState] = useState<"idle" | "rendering" | "error">("idle");
  const [renderUrl, setRenderUrl] = useState("");
  const [renderErrorMessage, setRenderErrorMessage] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);

  async function reloadRecipe() {
    const supabase = createClient();
    const { data: recipe } = await supabase
      .from("edit_recipes")
      .select("id, cuts, emphasis_moments")
      .eq("video_id", videoId)
      .order("version", { ascending: false })
      .limit(1)
      .single();
    if (recipe) {
      setRecipeId(recipe.id);
      setCuts(recipe.cuts ?? []);
      setEmphasisMoments(recipe.emphasis_moments ?? []);
    }
  }

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const { data: video, error: videoError } = await supabase
        .from("videos")
        .select("duration_seconds, storage_path")
        .eq("id", videoId)
        .single();
      if (videoError || !video) {
        setErrorMessage("Video not found");
        setLoadState("error");
        return;
      }
      setDuration(video.duration_seconds);

      const { data: signedUrlData } = await supabase.storage
        .from("videos")
        .createSignedUrl(video.storage_path, 3600);
      if (signedUrlData) setVideoUrl(signedUrlData.signedUrl);

      await reloadRecipe();
      setLoadState("ready");
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  function updateCut(index: number, patch: Partial<Cut>) {
    setCuts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch, user_nudged: true } : c))
    );
  }

  function toggleCutAccepted(index: number) {
    setCuts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, accepted: !c.accepted } : c))
    );
  }

  function toggleEmphasisApproved(index: number) {
    setEmphasisMoments((prev) =>
      prev.map((m, i) => (i === index ? { ...m, approved: !m.approved } : m))
    );
  }

  async function handleSave() {
    if (!recipeId) return;
    setSaveState("saving");
    const supabase = createClient();
    const { error } = await supabase
      .from("edit_recipes")
      .update({ cuts, emphasis_moments: emphasisMoments })
      .eq("id", recipeId);
    if (!error) {
      await supabase.from("videos").update({ status: "edited" }).eq("id", videoId);
    }
    setSaveState("saved");
  }

  async function handlePromptSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setPromptState("sending");
    setPromptReasoning("");
    try {
      const response = await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, prompt }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Prompt failed");

      setPromptReasoning(result.reasoning ?? "");
      setPrompt("");
      await reloadRecipe();
      setPromptState("idle");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Prompt failed");
      setPromptState("error");
    }
  }

  async function handleRender() {
    setRenderState("rendering");
    setRenderErrorMessage("");
    try {
      const response = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Render failed");
      setRenderUrl(result.url);
      setRenderState("idle");
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
      <h1 className="mb-2 text-2xl font-semibold">Review cuts</h1>
      <p className="mb-6 text-neutral-600">
        Nudge cut points and approve emphasis suggestions before rendering.
      </p>

      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          className="mb-6 w-full rounded-lg"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        />
      )}

      <div className="relative mb-8 h-10 w-full rounded-md bg-neutral-100">
        <div
          className="absolute top-0 h-full w-px bg-black"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />
        {cuts.map((c, i) => (
          <div
            key={i}
            title={`${c.reason}: ${c.start.toFixed(2)}s–${c.end.toFixed(2)}s`}
            className={`absolute top-0 h-full ${
              c.accepted ? "bg-red-300" : "bg-neutral-300"
            }`}
            style={{
              left: `${(c.start / duration) * 100}%`,
              width: `${Math.max(((c.end - c.start) / duration) * 100, 0.5)}%`,
            }}
          />
        ))}
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">Suggested cuts ({cuts.length})</h2>
        <ul className="space-y-3">
          {cuts.map((c, i) => (
            <li
              key={i}
              className="flex flex-wrap items-center gap-3 rounded-md border border-neutral-200 p-3 text-sm"
            >
              <span className="w-24 shrink-0 font-medium">{c.reason}</span>
              <input
                type="number"
                step={0.01}
                value={c.start}
                onChange={(e) => updateCut(i, { start: parseFloat(e.target.value) })}
                className="w-20 rounded border border-neutral-300 px-1.5 py-1"
              />
              <span>to</span>
              <input
                type="number"
                step={0.01}
                value={c.end}
                onChange={(e) => updateCut(i, { end: parseFloat(e.target.value) })}
                className="w-20 rounded border border-neutral-300 px-1.5 py-1"
              />
              <span>s</span>
              <button
                onClick={() => toggleCutAccepted(i)}
                className={`ml-auto rounded px-3 py-1 ${
                  c.accepted ? "bg-red-100 text-red-800" : "bg-neutral-100 text-neutral-600"
                }`}
              >
                {c.accepted ? "Will cut" : "Keep in video"}
              </button>
            </li>
          ))}
          {cuts.length === 0 && (
            <p className="text-sm text-neutral-500">No cuts suggested.</p>
          )}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">
          Emphasis suggestions ({emphasisMoments.length})
        </h2>
        <ul className="space-y-3">
          {emphasisMoments.map((m, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-md border border-neutral-200 p-3 text-sm"
            >
              <span className="font-medium">&quot;{m.word}&quot;</span>
              <span className="text-neutral-500">{m.start.toFixed(2)}s</span>
              <span className="text-xs text-neutral-400">{m.source}</span>
              <button
                onClick={() => toggleEmphasisApproved(i)}
                className={`ml-auto rounded px-3 py-1 ${
                  m.approved ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-600"
                }`}
              >
                {m.approved ? "Approved" : "Approve"}
              </button>
            </li>
          ))}
          {emphasisMoments.length === 0 && (
            <p className="text-sm text-neutral-500">No emphasis suggestions.</p>
          )}
        </ul>
      </section>

      <button
        onClick={handleSave}
        disabled={saveState === "saving"}
        className="mb-10 rounded-md bg-black px-5 py-2.5 text-white"
      >
        {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save changes"}
      </button>

      <section className="mb-10 border-t border-neutral-200 pt-8">
        <h2 className="mb-3 text-lg font-medium">Prompter</h2>
        <form onSubmit={handlePromptSubmit} className="flex flex-col gap-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. make it light and fun, use karaoke captions, zoom in on 'independent'"
            rows={3}
            className="rounded-md border border-neutral-300 p-3 text-sm"
          />
          <button
            type="submit"
            disabled={promptState === "sending"}
            className="self-start rounded-md bg-black px-5 py-2.5 text-white"
          >
            {promptState === "sending" ? "Thinking…" : "Send"}
          </button>
        </form>
        {promptReasoning && (
          <p className="mt-3 text-sm text-neutral-600">{promptReasoning}</p>
        )}
      </section>

      <section className="border-t border-neutral-200 pt-8">
        <h2 className="mb-3 text-lg font-medium">Render</h2>
        <button
          onClick={handleRender}
          disabled={renderState === "rendering"}
          className="rounded-md bg-black px-5 py-2.5 text-white"
        >
          {renderState === "rendering" ? "Rendering…" : "Render final video"}
        </button>
        {renderErrorMessage && (
          <p className="mt-3 text-sm text-red-600">{renderErrorMessage}</p>
        )}
        {renderUrl && (
          <video src={renderUrl} controls className="mt-4 w-full rounded-lg" />
        )}
      </section>
    </main>
  );
}
