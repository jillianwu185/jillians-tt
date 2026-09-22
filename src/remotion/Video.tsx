import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useDynamicGoogleFonts } from "./dynamicFonts";
import { computeKeptSegments, mapSourceTimeToOutputTime, totalOutputDuration, type KeptSegment } from "./timeline";
import { buildCaptionChunks, type TranscriptWord, type CaptionChunk } from "./captions";

const FALLBACK_FONT_FAMILY = "Public Sans";

export type EmphasisMomentProps = {
  word: string;
  start: number;
  end: number;
  treatment: "punch_in_zoom" | "keyword_callout" | "both";
  zoomLevel: number;
  calloutText: string;
  calloutFont: string;
  calloutColor: string;
  calloutFontSize: number;
  calloutX: number;
  calloutY: number;
};

export type CaptionStyle =
  | "two_layer_headline"
  | "karaoke_reveal"
  | "static_block"
  | "word_by_word"
  | "progressive_reveal"
  | "typing";

export type ClipInput = {
  videoUrl: string;
  sourceDurationSeconds: number;
  cuts: { start: number; end: number }[];
  words: TranscriptWord[];
  emphasisMoments: EmphasisMomentProps[];
  captionStyle: CaptionStyle;
  captionFont: string;
  captionSizeMultiplier: number;
  accentColor: string;
};

export type VideoCompositionProps = {
  clips: ClipInput[];
  fontMap: Record<string, string>;
  headerTitle?: string | null;
};

type ClipTimeline = {
  clip: ClipInput;
  keptSegments: KeptSegment[];
  duration: number;
  offset: number;
};

export function computeProjectTimeline(clips: ClipInput[]): ClipTimeline[] {
  let cumulative = 0;
  return clips.map((clip) => {
    const keptSegments = computeKeptSegments(clip.sourceDurationSeconds, clip.cuts);
    const duration = totalOutputDuration(keptSegments);
    const offset = cumulative;
    cumulative += duration;
    return { clip, keptSegments, duration, offset };
  });
}

export function VideoComposition({ clips, fontMap, headerTitle }: VideoCompositionProps) {
  const usedFontKeys = new Set<string>();
  for (const clip of clips) {
    usedFontKeys.add(clip.captionFont);
    for (const m of clip.emphasisMoments) usedFontKeys.add(m.calloutFont);
  }
  const usedFamilies = Array.from(usedFontKeys).map((key) => fontMap[key] ?? FALLBACK_FONT_FAMILY);
  useDynamicGoogleFonts(usedFamilies);

  function resolveFont(key: string): string {
    return fontMap[key] ?? FALLBACK_FONT_FAMILY;
  }

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const outputTime = frame / fps;

  const timeline = computeProjectTimeline(clips);

  const allCaptionChunks: (CaptionChunk & {
    captionStyle: CaptionStyle;
    accentColor: string;
    captionFontFamily: string;
    captionSizeMultiplier: number;
  })[] = [];
  const allEmphasis: EmphasisMomentProps[] = [];

  for (const { clip, keptSegments, offset } of timeline) {
    const localChunks = buildCaptionChunks(clip.words, keptSegments);
    for (const chunk of localChunks) {
      allCaptionChunks.push({
        ...chunk,
        start: chunk.start + offset,
        end: chunk.end + offset,
        words: chunk.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset })),
        captionStyle: clip.captionStyle,
        accentColor: clip.accentColor,
        captionFontFamily: resolveFont(clip.captionFont),
        captionSizeMultiplier: clip.captionSizeMultiplier,
      });
    }

    for (const m of clip.emphasisMoments) {
      const localStart = mapSourceTimeToOutputTime(m.start, keptSegments);
      const localEnd = mapSourceTimeToOutputTime(m.end, keptSegments);
      if (localStart !== null && localEnd !== null) {
        allEmphasis.push({ ...m, start: localStart + offset, end: localEnd + offset });
      }
    }
  }

  const activeCaption = allCaptionChunks.find((c) => outputTime >= c.start && outputTime < c.end);
  const activeEmphasis = allEmphasis.find((m) => outputTime >= m.start && outputTime < m.end);

  const isZooming =
    activeEmphasis?.treatment === "punch_in_zoom" || activeEmphasis?.treatment === "both";
  const isCallout =
    activeEmphasis?.treatment === "keyword_callout" || activeEmphasis?.treatment === "both";

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AbsoluteFill
        style={{
          transform: isZooming ? `scale(${activeEmphasis!.zoomLevel})` : "scale(1)",
        }}
      >
        {timeline.map(({ clip, keptSegments, offset }, clipIndex) =>
          keptSegments.map((seg, segIndex) => {
            const fromFrame = Math.round((offset + seg.outputStart) * fps);
            const durationInFrames = Math.max(
              1,
              Math.round((seg.outputEnd - seg.outputStart) * fps)
            );
            return (
              <Sequence key={`${clipIndex}-${segIndex}`} from={fromFrame} durationInFrames={durationInFrames}>
                <OffthreadVideo
                  src={clip.videoUrl}
                  startFrom={Math.round(seg.sourceStart * fps)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </Sequence>
            );
          })
        )}
      </AbsoluteFill>

      {activeCaption && (
        <Captions
          chunk={activeCaption}
          outputTime={outputTime}
          style={activeCaption.captionStyle}
          accentColor={activeCaption.accentColor}
          fontFamily={activeCaption.captionFontFamily}
          sizeMultiplier={activeCaption.captionSizeMultiplier}
        />
      )}

      {isCallout && activeEmphasis && (
        <AbsoluteFill style={{ pointerEvents: "none" }}>
          <div
            style={{
              position: "absolute",
              left: `${activeEmphasis.calloutX}%`,
              top: `${activeEmphasis.calloutY}%`,
              transform: "translate(-50%, -50%)",
              fontFamily: resolveFont(activeEmphasis.calloutFont),
              fontSize: activeEmphasis.calloutFontSize,
              fontWeight: 800,
              color: activeEmphasis.calloutColor,
              textAlign: "center",
              maxWidth: "80%",
              textShadow: "0 4px 24px rgba(0,0,0,0.5)",
            }}
          >
            {activeEmphasis.calloutText}
          </div>
        </AbsoluteFill>
      )}

      {headerTitle && clips[0] && (
        <HeaderTitle
          title={headerTitle}
          fontFamily={resolveFont(clips[0].captionFont)}
          accentColor={clips[0].accentColor}
        />
      )}
    </AbsoluteFill>
  );
}

function HeaderTitle({
  title,
  fontFamily,
  accentColor,
}: {
  title: string;
  fontFamily: string;
  accentColor: string;
}) {
  return (
    <AbsoluteFill style={{ alignItems: "center", pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: 140,
          left: "8%",
          right: "8%",
          textAlign: "center",
          fontFamily,
          fontSize: 84,
          fontWeight: 800,
          color: "#FFFFFF",
          letterSpacing: 1,
          textTransform: "uppercase",
          textShadow: "0 4px 20px rgba(0,0,0,0.45)",
        }}
      >
        {title}
        <div
          style={{
            margin: "14px auto 0",
            width: 96,
            height: 6,
            borderRadius: 3,
            backgroundColor: accentColor,
          }}
        />
      </div>
    </AbsoluteFill>
  );
}

function Captions({
  chunk,
  outputTime,
  style,
  accentColor,
  fontFamily,
  sizeMultiplier,
}: {
  chunk: { text: string; words: { word: string; start: number; end: number }[] };
  outputTime: number;
  style: CaptionStyle;
  accentColor: string;
  fontFamily: string;
  sizeMultiplier: number;
}) {
  const base: React.CSSProperties = {
    position: "absolute",
    bottom: 220,
    left: "5%",
    right: "5%",
    textAlign: "center",
    fontFamily,
    fontSize: 56 * sizeMultiplier,
    fontWeight: 700,
    color: "#FFFFFF",
  };

  if (style === "static_block") {
    return (
      <div
        style={{
          ...base,
          background: "rgba(0,0,0,0.55)",
          borderRadius: 12,
          padding: "16px 24px",
        }}
      >
        {chunk.text}
      </div>
    );
  }

  if (style === "karaoke_reveal") {
    return (
      <div style={base}>
        {chunk.words.map((w, i) => {
          const active = outputTime >= w.start && outputTime < w.end;
          return (
            <span key={i} style={{ color: active ? accentColor : "#FFFFFF" }}>
              {w.word}{" "}
            </span>
          );
        })}
      </div>
    );
  }

  if (style === "word_by_word") {
    return <WordByWordCaption words={chunk.words} outputTime={outputTime} base={base} accentColor={accentColor} />;
  }

  if (style === "progressive_reveal") {
    return <ProgressiveRevealCaption words={chunk.words} outputTime={outputTime} base={base} />;
  }

  if (style === "typing") {
    return <TypingCaption words={chunk.words} outputTime={outputTime} base={base} />;
  }

  // two_layer_headline: first word big/bold, rest smaller underneath
  const [first, ...rest] = chunk.text.split(" ");
  return (
    <div style={base}>
      <div style={{ fontSize: 72 * sizeMultiplier, fontWeight: 800, marginBottom: 8 }}>{first}</div>
      <div style={{ fontSize: 44 * sizeMultiplier, fontWeight: 500 }}>{rest.join(" ")}</div>
    </div>
  );
}

type CaptionWordTiming = { word: string; start: number; end: number };

// Only the current word is ever on screen at once, popping in with a spring
// scale — a hard cut to the next word rather than a color-highlighted
// full sentence (that's what karaoke_reveal is for).
function WordByWordCaption({
  words,
  outputTime,
  base,
  accentColor,
}: {
  words: CaptionWordTiming[];
  outputTime: number;
  base: React.CSSProperties;
  accentColor: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const activeWord = words.find((w) => outputTime >= w.start && outputTime < w.end);
  if (!activeWord) return null;

  const framesSinceStart = frame - Math.round(activeWord.start * fps);
  const scale = spring({ frame: framesSinceStart, fps, config: { damping: 12, stiffness: 200 } });

  return (
    <div style={{ ...base, transform: `scale(${scale})` }}>
      {activeWord.word}
      <div
        style={{
          margin: "8px auto 0",
          width: "40%",
          height: 4,
          borderRadius: 2,
          backgroundColor: accentColor,
        }}
      />
    </div>
  );
}

// Full sentence, but each word pops in at its own timestamp and stays —
// unlike karaoke_reveal (all words visible the whole time, only the color
// changes), words here are genuinely hidden until spoken.
function ProgressiveRevealCaption({
  words,
  outputTime,
  base,
}: {
  words: CaptionWordTiming[];
  outputTime: number;
  base: React.CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={base}>
      {words.map((w, i) => {
        const revealed = outputTime >= w.start;
        const framesSinceReveal = frame - Math.round(w.start * fps);
        const progress = revealed
          ? spring({ frame: framesSinceReveal, fps, config: { damping: 14 } })
          : 0;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: progress,
              transform: `translateY(${(1 - progress) * 10}px)`,
              marginRight: "0.3em",
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
}

// Classic typewriter reveal — characters appear left to right, paced by each
// word's own [start, end] window (not a fixed constant rate), with a
// blinking cursor at the current reveal point.
function TypingCaption({
  words,
  outputTime,
  base,
}: {
  words: CaptionWordTiming[];
  outputTime: number;
  base: React.CSSProperties;
}) {
  const frame = useCurrentFrame();

  let revealedText = "";
  for (const w of words) {
    if (outputTime <= w.start) break;
    if (outputTime >= w.end) {
      revealedText += (revealedText ? " " : "") + w.word;
    } else {
      const progress = (outputTime - w.start) / (w.end - w.start);
      const chars = Math.round(w.word.length * progress);
      revealedText += (revealedText ? " " : "") + w.word.slice(0, chars);
      break;
    }
  }

  const cursorVisible = Math.floor(frame / 15) % 2 === 0;

  return (
    <div style={base}>
      {revealedText}
      <span style={{ opacity: cursorVisible ? 1 : 0 }}>|</span>
    </div>
  );
}
