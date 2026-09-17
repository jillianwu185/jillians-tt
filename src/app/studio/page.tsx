"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "uploading" | "transcribing" | "done" | "error";

type Word = { word: string; start: number; end: number };
type Cut = { start: number; end: number; reason: string };
type EmphasisMoment = { word: string; start: number; end: number };

export default function StudioPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [words, setWords] = useState<Word[]>([]);
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [emphasisMoments, setEmphasisMoments] = useState<EmphasisMoment[]>([]);

  async function getDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      video.src = URL.createObjectURL(file);
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setErrorMessage("");
    setWords([]);
    setCuts([]);
    setEmphasisMoments([]);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const duration = await getDuration(file);
      const storagePath = `${user.id}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("videos")
        .upload(storagePath, file);
      if (uploadError) throw uploadError;

      const { data: videoRow, error: insertError } = await supabase
        .from("videos")
        .insert({
          storage_path: storagePath,
          duration_seconds: duration,
          status: "uploaded",
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      setStatus("transcribing");

      const transcribeResponse = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoRow.id }),
      });
      const transcribeResult = await transcribeResponse.json();
      if (!transcribeResponse.ok) {
        throw new Error(transcribeResult.error ?? "Transcription failed");
      }

      setWords(transcribeResult.words);
      setCuts(transcribeResult.cuts);
      setEmphasisMoments(transcribeResult.emphasisMoments);
      setStatus("done");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-6 px-6 py-32 text-center">
      <h1 className="text-2xl font-semibold">Studio</h1>
      <p className="text-neutral-600">Upload a raw clip to get started.</p>

      <label className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-neutral-300 px-6 py-12">
        <span className="font-medium">
          {status === "uploading" && "Uploading…"}
          {status === "transcribing" && "Transcribing…"}
          {(status === "idle" || status === "done" || status === "error") && "Choose a video"}
        </span>
        <input
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={status === "uploading" || status === "transcribing"}
        />
      </label>

      {status === "done" && (
        <div className="w-full text-left">
          <p className="mb-3 text-green-700">
            Transcribed — {words.length} words, {cuts.length} suggested cuts,{" "}
            {emphasisMoments.length} emphasis suggestions.
          </p>
          <p className="mb-4 max-h-64 overflow-y-auto rounded-md border border-neutral-200 p-3 text-sm text-neutral-700">
            {words.map((w) => w.word).join(" ")}
          </p>
          {cuts.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-sm font-medium">Suggested cuts</p>
              <ul className="space-y-1 text-sm text-neutral-600">
                {cuts.map((c, i) => (
                  <li key={i}>
                    {c.reason} — {c.start.toFixed(2)}s to {c.end.toFixed(2)}s
                  </li>
                ))}
              </ul>
            </div>
          )}
          {emphasisMoments.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">Emphasis suggestions</p>
              <ul className="space-y-1 text-sm text-neutral-600">
                {emphasisMoments.map((m, i) => (
                  <li key={i}>
                    &quot;{m.word}&quot; at {m.start.toFixed(2)}s
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {status === "error" && <p className="text-red-600">{errorMessage}</p>}
    </main>
  );
}
