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

// Like mapSourceTimeToOutputTime, but for an arbitrary [start, end) window
// (e.g. a user-picked image overlay range) rather than a single instant. A
// word's own [start, end] never straddles a cut (cuts fall in the silence
// around words), but a freely-chosen overlay window can — if either edge
// lands inside a removed segment, clamp inward to the nearest kept boundary
// instead of dropping the whole window.
export function mapRangeToOutputTime(
  start: number,
  end: number,
  segments: KeptSegment[]
): { start: number; end: number } | null {
  let mappedStart = mapSourceTimeToOutputTime(start, segments);
  if (mappedStart === null) {
    const nextSeg = segments.find((s) => s.sourceStart >= start);
    if (!nextSeg) return null;
    mappedStart = nextSeg.outputStart;
  }

  let mappedEnd = mapSourceTimeToOutputTime(end, segments);
  if (mappedEnd === null) {
    const priorSegs = segments.filter((s) => s.sourceStart < end);
    const lastSeg = priorSegs[priorSegs.length - 1];
    if (!lastSeg) return null;
    mappedEnd = lastSeg.outputEnd;
  }

  if (mappedEnd <= mappedStart) return null;
  return { start: mappedStart, end: mappedEnd };
}
