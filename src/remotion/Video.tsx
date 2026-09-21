import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadPublicSans } from "@remotion/google-fonts/PublicSans";
import { computeKeptSegments, mapSourceTimeToOutputTime, totalOutputDuration, type KeptSegment } from "./timeline";
import { buildCaptionChunks, type TranscriptWord, type CaptionChunk } from "./captions";

const { fontFamily: poppinsFamily } = loadPoppins();
const { fontFamily: playfairFamily } = loadPlayfair();
const { fontFamily: publicSansFamily } = loadPublicSans();

const FONT_FAMILIES: Record<string, string> = {
  chic: playfairFamily,
  bubbly: poppinsFamily,
  airy: publicSansFamily,
};

export type EmphasisMomentProps = {
  word: string;
  start: number;
  end: number;
  treatment: "punch_in_zoom" | "keyword_callout" | "both";
  zoomLevel: number;
  calloutText: string;
  calloutFont: string;
  calloutColor: string;
};

export type CaptionStyle = "two_layer_headline" | "karaoke_reveal" | "static_block";

export type ClipInput = {
  videoUrl: string;
  sourceDurationSeconds: number;
  cuts: { start: number; end: number }[];
  words: TranscriptWord[];
  emphasisMoments: EmphasisMomentProps[];
  captionStyle: CaptionStyle;
  accentColor: string;
};

export type VideoCompositionProps = {
  clips: ClipInput[];
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

export function VideoComposition({ clips }: VideoCompositionProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const outputTime = frame / fps;

  const timeline = computeProjectTimeline(clips);

  const allCaptionChunks: (CaptionChunk & { captionStyle: CaptionStyle; accentColor: string })[] = [];
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
        />
      )}

      {isCallout && activeEmphasis && (
        <AbsoluteFill
          style={{ alignItems: "center", justifyContent: "center", pointerEvents: "none" }}
        >
          <div
            style={{
              fontFamily: FONT_FAMILIES[activeEmphasis.calloutFont] ?? publicSansFamily,
              fontSize: 140,
              fontWeight: 800,
              color: activeEmphasis.calloutColor,
              textAlign: "center",
              width: "90%",
              textShadow: "0 4px 24px rgba(0,0,0,0.5)",
            }}
          >
            {activeEmphasis.calloutText}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}

function Captions({
  chunk,
  outputTime,
  style,
  accentColor,
}: {
  chunk: { text: string; words: { word: string; start: number; end: number }[] };
  outputTime: number;
  style: CaptionStyle;
  accentColor: string;
}) {
  const base: React.CSSProperties = {
    position: "absolute",
    bottom: 220,
    left: "5%",
    right: "5%",
    textAlign: "center",
    fontFamily: publicSansFamily,
    fontSize: 56,
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

  // two_layer_headline: first word big/bold, rest smaller underneath
  const [first, ...rest] = chunk.text.split(" ");
  return (
    <div style={base}>
      <div style={{ fontSize: 72, fontWeight: 800, marginBottom: 8 }}>{first}</div>
      <div style={{ fontSize: 44, fontWeight: 500 }}>{rest.join(" ")}</div>
    </div>
  );
}
