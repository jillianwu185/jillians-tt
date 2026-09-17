export type KeptSegment = {
  sourceStart: number;
  sourceEnd: number;
  outputStart: number;
  outputEnd: number;
};

export function computeKeptSegments(
  duration: number,
  acceptedCuts: { start: number; end: number }[]
): KeptSegment[] {
  const sortedCuts = [...acceptedCuts].sort((a, b) => a.start - b.start);
  const segments: KeptSegment[] = [];
  let cursor = 0;
  let outputCursor = 0;

  for (const cut of sortedCuts) {
    if (cut.start > cursor) {
      const length = cut.start - cursor;
      segments.push({
        sourceStart: cursor,
        sourceEnd: cut.start,
        outputStart: outputCursor,
        outputEnd: outputCursor + length,
      });
      outputCursor += length;
    }
    cursor = Math.max(cursor, cut.end);
  }

  if (cursor < duration) {
    const length = duration - cursor;
    segments.push({
      sourceStart: cursor,
      sourceEnd: duration,
      outputStart: outputCursor,
      outputEnd: outputCursor + length,
    });
  }

  return segments;
}

export function totalOutputDuration(segments: KeptSegment[]): number {
  const last = segments[segments.length - 1];
  return last ? last.outputEnd : 0;
}

// Maps a timestamp from the original (uncut) video into the compressed output
// timeline. Returns null if that moment falls inside a removed segment.
export function mapSourceTimeToOutputTime(
  sourceTime: number,
  segments: KeptSegment[]
): number | null {
  for (const seg of segments) {
    if (sourceTime >= seg.sourceStart && sourceTime <= seg.sourceEnd) {
      return seg.outputStart + (sourceTime - seg.sourceStart);
    }
  }
  return null;
}
