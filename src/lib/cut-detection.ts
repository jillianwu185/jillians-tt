import { STYLE_KIT } from "@/lib/style-kit";
import type { WordAudioFeatures } from "@/lib/audio-analysis";

export type Cut = {
  start: number;
  end: number;
  reason: "filler_word" | "silence" | "stutter_or_repeat" | "trimmed_for_hook" | "cross_clip_repeat";
  user_nudged: boolean;
  accepted: boolean;
};

export type EmphasisMoment = {
  word: string;
  start: number;
  end: number;
  treatment: "punch_in_zoom" | "keyword_callout" | "both";
  source: "auto_suggested";
  approved: boolean;
  zoomLevel: number;
  calloutText: string;
  calloutFont: "airy";
  calloutColor: string;
  calloutFontSize: number;
  calloutX: number;
  calloutY: number;
};

export function detectFillerAndSilenceCuts(words: WordAudioFeatures[]): Cut[] {
  const cuts: Cut[] = [];
  const fillerSet = new Set(STYLE_KIT.fillerWords.map((f) => f.toLowerCase()));

  for (const w of words) {
    const clean = w.word.trim().toLowerCase().replace(/[.,!?]/g, "");
    if (fillerSet.has(clean)) {
      cuts.push({
        start: w.start,
        end: w.end,
        reason: "filler_word",
        user_nudged: false,
        accepted: true,
      });
    }
  }

  for (let i = 0; i < words.length - 1; i++) {
    const gap = words[i + 1].start - words[i].end;
    if (gap >= STYLE_KIT.silenceGapSeconds) {
      cuts.push({
        start: words[i].end,
        end: words[i + 1].start,
        reason: "silence",
        user_nudged: false,
        accepted: true,
      });
    }
  }

  return cuts.sort((a, b) => a.start - b.start);
}

export function detectEmphasisCandidates(words: WordAudioFeatures[]): EmphasisMoment[] {
  const finite = words.filter((w) => Number.isFinite(w.volume_db));
  if (finite.length === 0) return [];

  const candidates: (EmphasisMoment & { score: number })[] = [];
  const windowSize = 5;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!Number.isFinite(w.volume_db)) continue;

    const windowStart = Math.max(0, i - windowSize);
    const windowEnd = Math.min(words.length, i + windowSize + 1);
    const neighbors = words
      .slice(windowStart, windowEnd)
      .filter((n, idx) => windowStart + idx !== i && Number.isFinite(n.volume_db));
    if (neighbors.length === 0) continue;

    const localBaselineDb =
      neighbors.reduce((sum, n) => sum + n.volume_db, 0) / neighbors.length;
    const volumeAboveBaseline = w.volume_db - localBaselineDb;
    const pitchAboveBaseline = Math.abs(w.pitch_delta);

    if (
      volumeAboveBaseline >= STYLE_KIT.emphasisVolumeThresholdDb ||
      pitchAboveBaseline >= STYLE_KIT.emphasisPitchThresholdHz
    ) {
      candidates.push({
        word: w.word,
        start: w.start,
        end: w.end,
        treatment: "keyword_callout",
        source: "auto_suggested",
        approved: false,
        zoomLevel: 1.18,
        calloutText: w.word.toUpperCase(),
        calloutFont: "airy",
        calloutColor: "#FCEF91",
        calloutFontSize: 140,
        calloutX: 50,
        calloutY: 50,
        score: volumeAboveBaseline + pitchAboveBaseline / 10,
      });
    }
  }

  candidates.sort((a, b) => a.start - b.start);

  const selected: (EmphasisMoment & { score: number })[] = [];
  for (const candidate of candidates) {
    const last = selected[selected.length - 1];
    if (!last || candidate.start - last.start >= STYLE_KIT.emphasisAutoDetectMinGapSeconds) {
      selected.push(candidate);
    } else if (candidate.score > last.score) {
      selected[selected.length - 1] = candidate;
    }
  }

  return selected.map(({ score: _score, ...rest }) => rest);
}
