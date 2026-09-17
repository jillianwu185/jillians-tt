import { useEffect, useState } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  delayRender,
  continueRender,
} from "remotion";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadPublicSans } from "@remotion/google-fonts/PublicSans";
import { computeKeptSegments, mapSourceTimeToOutputTime, type KeptSegment } from "./timeline";
import { buildCaptionChunks, type TranscriptWord } from "./captions";

const { fontFamily: poppinsFamily } = loadPoppins();
const { fontFamily: playfairFamily } = loadPlayfair();
const { fontFamily: publicSansFamily } = loadPublicSans();

const FONT_FAMILIES: Record<string, string> = {
  chic: playfairFamily,
  bubbly: poppinsFamily,
  airy: publicSansFamily,
  capcut_default: "ProximaNova",
};

function useProximaNovaFont() {
  const [handle] = useState(() => delayRender("Loading Proxima Nova"));
  useEffect(() => {
    const face = new FontFace(
      "ProximaNova",
      `url(${staticFile("/fonts/ProximaNovaRegular.ttf")})`
    );
    face
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }, [handle]);
}

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

export type VideoCompositionProps = {
  videoUrl: string;
  sourceDurationSeconds: number;
  cuts: { start: number; end: number }[];
  words: TranscriptWord[];
  emphasisMoments: EmphasisMomentProps[];
  captionStyle: "two_layer_headline" | "karaoke_reveal" | "static_block";
  accentColor: string;
};

export function VideoComposition({
  videoUrl,
  sourceDurationSeconds,
  cuts,
  words,
  emphasisMoments,
  captionStyle,
  accentColor,
}: VideoCompositionProps) {
  useProximaNovaFont();

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const outputTime = frame / fps;

  const keptSegments: KeptSegment[] = computeKeptSegments(sourceDurationSeconds, cuts);
  const captionChunks = buildCaptionChunks(words, keptSegments);

  const activeCaption = captionChunks.find(
    (c) => outputTime >= c.start && outputTime < c.end
  );

  const mappedEmphasis = emphasisMoments
    .map((m) => {
      const start = mapSourceTimeToOutputTime(m.start, keptSegments);
      const end = mapSourceTimeToOutputTime(m.end, keptSegments);
      return start !== null && end !== null ? { ...m, start, end } : null;
    })
    .filter((m): m is EmphasisMomentProps => m !== null);

  const activeEmphasis = mappedEmphasis.find(
    (m) => outputTime >= m.start && outputTime < m.end
  );

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
        {keptSegments.map((seg, i) => {
          const fromFrame = Math.round(seg.outputStart * fps);
          const durationInFrames = Math.max(1, Math.round((seg.outputEnd - seg.outputStart) * fps));
          return (
            <Sequence key={i} from={fromFrame} durationInFrames={durationInFrames}>
              <OffthreadVideo
                src={videoUrl}
                startFrom={Math.round(seg.sourceStart * fps)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </Sequence>
          );
        })}
      </AbsoluteFill>

      {activeCaption && (
        <Captions
          chunk={activeCaption}
          outputTime={outputTime}
          style={captionStyle}
          accentColor={accentColor}
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
  style: VideoCompositionProps["captionStyle"];
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
