"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STYLE_KIT } from "@/lib/style-kit";

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
  treatment: "punch_in_zoom" | "keyword_callout" | "both";
  source: string;
  approved: boolean;
  zoomLevel: number;
  calloutText: string;
  calloutFont: string;
  calloutFontSize: number;
  calloutColor: string;
  [key: string]: unknown;
};

type Font = { key: string; display_name: string; google_font_family: string };

type LoadState = "loading" | "ready" | "error";

const CAPTION_STYLES = ["two_layer_headline", "karaoke_reveal", "static_block"] as const;
const TREATMENTS = ["punch_in_zoom", "keyword_callout", "both"] as const;

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

  const [captionStyle, setCaptionStyle] = useState<string>("static_block");
  const [captionFont, setCaptionFont] = useState<string>("airy");
  const [captionSizeMultiplier, setCaptionSizeMultiplier] = useState<number>(1);
  const [accentColor, setAccentColor] = useState<string>(STYLE_KIT.colors.yellow);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [newFontName, setNewFontName] = useState("");
  const [addFontState, setAddFontState] = useState<"idle" | "adding" | "error">("idle");
  const [addFontError, setAddFontError] = useState("");

  const [prompt, setPrompt] = useState("");
  const [promptState, setPromptState] = useState<"idle" | "sending" | "error">("idle");
  const [promptReasoning, setPromptReasoning] = useState("");

  const [renderState, setRenderState] = useState<"idle" | "rendering" | "error">("idle");
  const [renderErrorMessage, setRenderErrorMessage] = useState("");
  const [renderProgress, setRenderProgress] = useState(0);
  const [pastRenders, setPastRenders] = useState<{ id: string; rendered_at: string; url: string }[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);

  async function loadFonts() {
    const response = await fetch("/api/fonts");
    const result = await response.json();
    if (response.ok) setFonts(result.fonts);
  }

  async function loadPastRenders() {
    const supabase = createClient();
    const { data: renders } = await supabase
      .from("renders")
      .select("id, storage_path, rendered_at, edit_recipes!inner(video_id)")
      .eq("edit_recipes.video_id", videoId)
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

  async function reloadRecipe() {
    const supabase = createClient();
    const { data: recipe } = await supabase
      .from("edit_recipes")
      .select("id, cuts, emphasis_moments, caption_style, accent_color, font_map")
      .eq("video_id", videoId)
      .order("version", { ascending: false })
      .limit(1)
      .single();
    if (recipe) {
      setRecipeId(recipe.id);
      setCuts(recipe.cuts ?? []);
      setEmphasisMoments(
        (recipe.emphasis_moments ?? []).map((m: Partial<EmphasisMoment>) => ({
          calloutFontSize: 140,
          ...m,
        })) as EmphasisMoment[]
      );
      setCaptionStyle(recipe.caption_style ?? "static_block");
      setAccentColor(recipe.accent_color ?? STYLE_KIT.colors.yellow);
      const fontMap = (recipe.font_map as Record<string, string | number> | null) ?? {};
      setCaptionFont((fontMap.caption as string) ?? "airy");
      setCaptionSizeMultiplier((fontMap.captionSizeMultiplier as number) ?? 1);
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
      await loadPastRenders();
      await loadFonts();
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

  function updateEmphasis(index: number, patch: Partial<EmphasisMoment>) {
    setEmphasisMoments((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  async function handleAddFont(e: React.FormEvent) {
    e.preventDefault();
    if (!newFontName.trim()) return;
    setAddFontState("adding");
    setAddFontError("");
    try {
      const response = await fetch("/api/fonts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ google_font_family: newFontName.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not add font");
      setNewFontName("");
      setAddFontState("idle");
      await loadFonts();
    } catch (err) {
      setAddFontError(err instanceof Error ? err.message : "Could not add font");
      setAddFontState("error");
    }
  }

  async function handleSave() {
    if (!recipeId) return;
    setSaveState("saving");
    const supabase = createClient();
    const { error } = await supabase
      .from("edit_recipes")
      .update({
        cuts,
        emphasis_moments: emphasisMoments,
        caption_style: captionStyle,
        accent_color: accentColor,
        font_map: { caption: captionFont, captionSizeMultiplier },
      })
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
    setRenderProgress(0);
    try {
      const startResponse = await fetch("/api/render/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId }),
      });
      const startResult = await startResponse.json();
      if (!startResponse.ok) throw new Error(startResult.error ?? "Render failed to start");

      const { renderId, bucketName, editRecipeId } = startResult;

      // Poll every 4s. Renders can take several minutes.
      for (let attempt = 0; attempt < 200; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        const statusResponse = await fetch("/api/render/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_id: videoId,
            render_id: renderId,
            bucket_name: bucketName,
            edit_recipe_id: editRecipeId,
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
      <h1 className="mb-2 text-2xl font-semibold">Review cuts</h1>
      <p className="mb-6 text-neutral-600">
        Nudge cut points, style everything directly, or use the prompter below.
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

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Style</h2>

        <p className="mb-2 text-sm font-medium text-neutral-700">Caption style</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {CAPTION_STYLES.map((style) => (
            <button
              key={style}
              onClick={() => setCaptionStyle(style)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                captionStyle === style ? "bg-black text-white" : "bg-neutral-100 text-neutral-600"
              }`}
            >
              {style.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        <p className="mb-2 text-sm font-medium text-neutral-700">Caption font & size</p>
        <div className="mb-4 flex items-center gap-3">
          <select
            value={captionFont}
            onChange={(e) => setCaptionFont(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {fonts.map((f) => (
              <option key={f.key} value={f.key}>
                {f.display_name}
              </option>
            ))}
          </select>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={captionSizeMultiplier}
            onChange={(e) => setCaptionSizeMultiplier(parseFloat(e.target.value))}
            className="w-32"
          />
          <span className="text-xs text-neutral-500">{captionSizeMultiplier.toFixed(1)}x</span>
        </div>

        <p className="mb-2 text-sm font-medium text-neutral-700">Accent color</p>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {Object.entries(STYLE_KIT.colors).map(([name, hex]) => (
            <button
              key={name}
              onClick={() => setAccentColor(hex)}
              title={name}
              className={`h-8 w-8 rounded-full border-2 ${
                accentColor === hex ? "border-black" : "border-transparent"
              }`}
              style={{ backgroundColor: hex }}
            />
          ))}
          <input
            type="color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            className="h-8 w-8 rounded border border-neutral-300"
          />
        </div>

        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-neutral-500">
            Fonts ({fonts.length}) — add another
          </summary>
          <form onSubmit={handleAddFont} className="mt-2 flex gap-2">
            <input
              type="text"
              value={newFontName}
              onChange={(e) => setNewFontName(e.target.value)}
              placeholder="Any Google Font name, e.g. Bebas Neue"
              className="flex-1 rounded border border-neutral-300 px-2 py-1.5"
            />
            <button
              type="submit"
              disabled={addFontState === "adding"}
              className="rounded bg-black px-3 py-1.5 text-white"
            >
              {addFontState === "adding" ? "Adding…" : "Add"}
            </button>
          </form>
          {addFontError && <p className="mt-1 text-red-600">{addFontError}</p>}
        </details>
      </section>

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
          Emphasis moments ({emphasisMoments.length})
        </h2>
        <ul className="space-y-3">
          {emphasisMoments.map((m, i) => (
            <li key={i} className="rounded-md border border-neutral-200 p-3 text-sm">
              <div className="mb-2 flex items-center gap-3">
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
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={m.treatment}
                  onChange={(e) => updateEmphasis(i, { treatment: e.target.value as EmphasisMoment["treatment"] })}
                  className="rounded border border-neutral-300 px-2 py-1 text-xs"
                >
                  {TREATMENTS.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>

                {(m.treatment === "punch_in_zoom" || m.treatment === "both") && (
                  <label className="flex items-center gap-1 text-xs text-neutral-500">
                    zoom
                    <input
                      type="number"
                      step={0.02}
                      min={1}
                      max={2}
                      value={m.zoomLevel}
                      onChange={(e) => updateEmphasis(i, { zoomLevel: parseFloat(e.target.value) })}
                      className="w-16 rounded border border-neutral-300 px-1.5 py-1"
                    />
                  </label>
                )}

                {(m.treatment === "keyword_callout" || m.treatment === "both") && (
                  <>
                    <input
                      type="text"
                      value={m.calloutText}
                      onChange={(e) => updateEmphasis(i, { calloutText: e.target.value })}
                      className="w-32 rounded border border-neutral-300 px-1.5 py-1 text-xs"
                    />
                    <select
                      value={m.calloutFont}
                      onChange={(e) => updateEmphasis(i, { calloutFont: e.target.value })}
                      className="rounded border border-neutral-300 px-2 py-1 text-xs"
                    >
                      {fonts.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.display_name}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-neutral-500">
                      size
                      <input
                        type="number"
                        step={10}
                        min={40}
                        max={300}
                        value={m.calloutFontSize}
                        onChange={(e) => updateEmphasis(i, { calloutFontSize: parseFloat(e.target.value) })}
                        className="w-16 rounded border border-neutral-300 px-1.5 py-1"
                      />
                    </label>
                    <input
                      type="color"
                      value={m.calloutColor}
                      onChange={(e) => updateEmphasis(i, { calloutColor: e.target.value })}
                      className="h-7 w-7 rounded border border-neutral-300"
                    />
                  </>
                )}
              </div>
            </li>
          ))}
          {emphasisMoments.length === 0 && (
            <p className="text-sm text-neutral-500">No emphasis moments.</p>
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
          {renderState === "rendering"
            ? `Rendering… ${Math.round(renderProgress * 100)}%`
            : "Render final video"}
        </button>
        {renderState === "rendering" && (
          <p className="mt-2 text-sm text-neutral-500">
            This can take a few minutes — feel free to leave this open in the background.
          </p>
        )}
        {renderErrorMessage && (
          <p className="mt-3 text-sm text-red-600">{renderErrorMessage}</p>
        )}

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
