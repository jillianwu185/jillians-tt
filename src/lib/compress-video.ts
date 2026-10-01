"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// Single-threaded core deliberately — the multi-threaded build needs
// Cross-Origin-Opener/Embedder-Policy headers site-wide, which would block
// every cross-origin resource the app already loads without CORP headers
// (Google Fonts, Supabase signed video/image URLs, TikTok CDN thumbnails).
// Not worth the breakage risk for a speed gain on a personal single-user app.
const CORE_VERSION = "0.12.6";
const CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

let ffmpegPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ffmpeg;
    })();
  }
  return ffmpegPromise;
}

// Phone-camera footage is usually bitrate-heavy relative to what's actually
// visually needed — re-encoding at a sane CRF typically shrinks it several
// times over with no perceptible quality loss, which directly cuts upload
// time (the bottleneck is the user's upload bandwidth, not server
// processing, so fewer bytes is the only thing that actually helps).
export async function compressVideoForUpload(
  file: File,
  onProgress?: (ratio: number) => void
): Promise<File> {
  const ffmpeg = await getFFmpeg();

  const inputName = "input" + (file.name.match(/\.[^.]+$/)?.[0] ?? ".mp4");
  const outputName = "output.mp4";

  const onProgressEvent = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(1, Math.max(0, progress)));
  };
  ffmpeg.on("progress", onProgressEvent);

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    await ffmpeg.exec([
      "-i",
      inputName,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "28",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data as BlobPart], { type: "video/mp4" });
    const newName = file.name.replace(/\.[^.]+$/, "") + "-compressed.mp4";
    return new File([blob], newName, { type: "video/mp4" });
  } finally {
    ffmpeg.off("progress", onProgressEvent);
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}
