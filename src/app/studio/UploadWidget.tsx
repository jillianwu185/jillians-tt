"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { compressVideoForUpload } from "@/lib/compress-video";

type Status = "idle" | "compressing" | "uploading" | "transcribing" | "error";

// Supabase's own per-file cap was raised (Pro plan) well past this — this is
// just a sanity ceiling against an accidental huge/wrong file selection.
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

export default function UploadWidget() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [progressLabel, setProgressLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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

  async function uploadAndTranscribe(
    file: File,
    userId: string,
    extra: Record<string, unknown>,
    labelPrefix: string
  ): Promise<string> {
    const supabase = createClient();
    const duration = await getDuration(file);

    let fileToUpload = file;
    setStatus("compressing");
    setProgressLabel(`${labelPrefix}Compressing…`);
    try {
      fileToUpload = await compressVideoForUpload(file, (ratio) => {
        setProgressLabel(`${labelPrefix}Compressing… ${Math.round(ratio * 100)}%`);
      });
    } catch (err) {
      // Compression is a speed optimization, not a requirement — if it fails
      // for any reason (unsupported browser, out of memory, etc.) fall back
      // to uploading the original file rather than blocking the upload.
      console.warn("Video compression failed, uploading original file instead:", err);
      fileToUpload = file;
    }

    setStatus("uploading");
    setProgressLabel(`${labelPrefix}Uploading…`);
    const storagePath = `${userId}/${Date.now()}-${fileToUpload.name}`;

    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(storagePath, fileToUpload);
    if (uploadError) throw uploadError;

    const { data: videoRow, error: insertError } = await supabase
      .from("videos")
      .insert({
        storage_path: storagePath,
        duration_seconds: duration,
        status: "uploaded",
        ...extra,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    setStatus("transcribing");
    setProgressLabel(`${labelPrefix}Transcribing…`);
    const transcribeResponse = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoRow.id }),
    });
    const transcribeResult = await transcribeResponse.json();
    if (!transcribeResponse.ok) {
      throw new Error(transcribeResult.error ?? "Transcription failed");
    }

    return videoRow.id;
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const oversized = files.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversized) {
      setErrorMessage(
        `"${oversized.name}" is ${(oversized.size / 1024 / 1024).toFixed(0)}MB — that's larger than this app expects for a single clip. Try a shorter clip or lower export quality.`
      );
      setStatus("error");
      return;
    }

    setErrorMessage("");

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      if (files.length === 1) {
        const videoId = await uploadAndTranscribe(files[0], user.id, {}, "");
        router.push(`/studio/${videoId}`);
        return;
      }

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({ status: "assembling" })
        .select("id")
        .single();
      if (projectError) throw projectError;

      for (let i = 0; i < files.length; i++) {
        await uploadAndTranscribe(
          files[i],
          user.id,
          { project_id: project.id, sequence_order: i },
          `Clip ${i + 1} of ${files.length}: `
        );
      }

      setProgressLabel("Styling your video…");
      setStatus("transcribing");
      await fetch("/api/project-autostyle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id }),
      }).catch(() => {});

      router.push(`/studio/project/${project.id}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <label className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-sky-200 bg-sky-50 px-6 py-12 transition hover:border-sky-300 hover:bg-sky-100">
        <span className="text-2xl">📹</span>
        <span className="font-medium text-neutral-700">
          {status === "compressing" && (progressLabel || "Compressing…")}
          {status === "uploading" && (progressLabel || "Uploading…")}
          {status === "transcribing" && (progressLabel || "Transcribing…")}
          {(status === "idle" || status === "error") && "Choose one or more videos"}
        </span>
        {(status === "idle" || status === "error") && (
          <span className="text-xs text-neutral-400">
            Select multiple clips to stitch them together in order
          </span>
        )}
        <input
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
          disabled={status === "compressing" || status === "uploading" || status === "transcribing"}
        />
      </label>

      {status === "error" && <p className="text-red-600">{errorMessage}</p>}
    </div>
  );
}
