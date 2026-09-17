import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import ffmpegPath from "ffmpeg-static";

const SAMPLE_RATE = 16000;

export type WordTiming = { word: string; start: number; end: number };

export type WordAudioFeatures = WordTiming & {
  volume_db: number;
  pitch_delta: number;
};

async function extractPcm(videoBuffer: Buffer): Promise<Int16Array> {
  const dir = await mkdtemp(join(tmpdir(), "audio-"));
  const inputPath = join(dir, "input.mp4");
  const outputPath = join(dir, "output.pcm");

  try {
    await writeFile(inputPath, videoBuffer);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath as string, [
        "-y",
        "-i",
        inputPath,
        "-f",
        "s16le",
        "-acodec",
        "pcm_s16le",
        "-ac",
        "1",
        "-ar",
        String(SAMPLE_RATE),
        outputPath,
      ]);
      proc.on("error", reject);
      proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    });

    const raw = await readFile(outputPath);
    return new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function rmsDb(samples: Int16Array, from: number, to: number): number {
  if (to <= from) return -Infinity;
  let sumSquares = 0;
  for (let i = from; i < to; i++) {
    const normalized = samples[i] / 32768;
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / (to - from));
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

// Autocorrelation-based pitch estimate for a single window, tuned for human speech (80-400Hz).
function estimatePitchHz(samples: Int16Array, from: number, to: number): number | null {
  const window = samples.subarray(from, to);
  if (window.length < 256) return null;

  const minLag = Math.floor(SAMPLE_RATE / 400);
  const maxLag = Math.floor(SAMPLE_RATE / 80);
  let bestLag = -1;
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0;
    for (let i = 0; i < window.length - lag; i++) {
      correlation += window[i] * window[i + lag];
    }
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag <= 0) return null;
  return SAMPLE_RATE / bestLag;
}

export async function analyzeWordAudioFeatures(
  videoBuffer: Buffer,
  words: WordTiming[]
): Promise<WordAudioFeatures[]> {
  const samples = await extractPcm(videoBuffer);

  const rawFeatures = words.map((w) => {
    const from = Math.max(0, Math.floor(w.start * SAMPLE_RATE));
    const to = Math.min(samples.length, Math.ceil(w.end * SAMPLE_RATE));
    return {
      ...w,
      volume_db: rmsDb(samples, from, to),
      pitchHz: estimatePitchHz(samples, from, to),
    };
  });

  const voicedPitches = rawFeatures.map((f) => f.pitchHz).filter((p): p is number => p !== null);
  const medianPitch = voicedPitches.length
    ? voicedPitches.sort((a, b) => a - b)[Math.floor(voicedPitches.length / 2)]
    : 0;

  return rawFeatures.map(({ pitchHz, ...rest }) => ({
    ...rest,
    pitch_delta: pitchHz !== null ? pitchHz - medianPitch : 0,
  }));
}
