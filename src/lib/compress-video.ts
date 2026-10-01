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
//
// Capping the long edge at 1920px matters even more than CRF: a 4K source
// (3840x2160 or 2160x3840) is ~4x the pixels of this app's actual 1080x1920
// output, and a single-threaded WASM software encoder is slow enough that
// encoding 4K can take *longer* than just uploading the original file would
// have (observed: ~10 minutes for a 185MB 4K clip). Downscaling to the
// resolution the video ends up at anyway removes that 4x cost with zero
// quality loss in the final render, and "ultrafast" trades a little
// compression efficiency for speed now that the pixel count is already cut.
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
      "-vf",
      // Cap whichever dimension is the long edge at 1920 (never upscale);
      // the other dimension is derived (-2 keeps it even, required by
      // yuv420p). Long-edge-aware so it's correct for both portrait and
      // landscape source footage.
      "scale='if(gt(iw\\,ih)\\,min(1920\\,iw)\\,-2)':'if(gt(iw\\,ih)\\,-2\\,min(1920\\,ih))'",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
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
