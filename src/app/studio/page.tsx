"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "uploading" | "done" | "error";

export default function StudioPage() {
  const [status, setStatus] = useState<Status>("idle");
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setErrorMessage("");

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

      const { error: insertError } = await supabase.from("videos").insert({
        storage_path: storagePath,
        duration_seconds: duration,
        status: "uploaded",
      });
      if (insertError) throw insertError;

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
          {status === "uploading" ? "Uploading…" : "Choose a video"}
        </span>
        <input
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={status === "uploading"}
        />
      </label>

      {status === "done" && (
        <p className="text-green-700">Uploaded. Ready for transcription.</p>
      )}
      {status === "error" && <p className="text-red-600">{errorMessage}</p>}
    </main>
  );
}
