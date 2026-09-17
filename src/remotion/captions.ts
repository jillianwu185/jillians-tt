import { mapSourceTimeToOutputTime, type KeptSegment } from "./timeline";

export type TranscriptWord = { word: string; start: number; end: number };

export type CaptionWord = { word: string; start: number; end: number };

export type CaptionChunk = {
  text: string;
  start: number;
  end: number;
  words: CaptionWord[];
};

const MAX_WORDS_PER_CHUNK = 5;
const MAX_CHUNK_DURATION = 2.5;
const PAUSE_BREAK_SECONDS = 0.5;

export function buildCaptionChunks(
  words: TranscriptWord[],
  keptSegments: KeptSegment[]
): CaptionChunk[] {
  const visibleWords: CaptionWord[] = [];

  for (const w of words) {
    const start = mapSourceTimeToOutputTime(w.start, keptSegments);
    const end = mapSourceTimeToOutputTime(w.end, keptSegments);
    if (start === null || end === null) continue;
    visibleWords.push({ word: w.word, start, end });
  }

  const chunks: CaptionChunk[] = [];
  let current: CaptionWord[] = [];

  for (const word of visibleWords) {
    const chunkStart = current[0]?.start ?? word.start;
    const gapFromPrevious = current.length > 0 ? word.start - current[current.length - 1].end : 0;
    const wouldExceedDuration = word.end - chunkStart > MAX_CHUNK_DURATION;

    if (
      current.length >= MAX_WORDS_PER_CHUNK ||
      gapFromPrevious > PAUSE_BREAK_SECONDS ||
      wouldExceedDuration
    ) {
      if (current.length > 0) chunks.push(toChunk(current));
      current = [];
    }
    current.push(word);
  }
  if (current.length > 0) chunks.push(toChunk(current));

  return chunks;
}

function toChunk(words: CaptionWord[]): CaptionChunk {
  return {
    text: words.map((w) => w.word).join(" "),
    start: words[0].start,
    end: words[words.length - 1].end,
    words,
  };
}
