import { Composition } from "remotion";
import { VideoComposition, computeProjectTimeline, type VideoCompositionProps } from "./Video";

const FPS = 30;

export const defaultProps: VideoCompositionProps = {
  clips: [
    {
      videoUrl: "",
      sourceDurationSeconds: 1,
      cuts: [],
      words: [],
      emphasisMoments: [],
      captionStyle: "static_block",
      captionFont: "airy",
      accentColor: "#FCEF91",
    },
  ],
  fontMap: {
    chic: "Playfair Display",
    bubbly: "Poppins",
    airy: "Public Sans",
  },
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="EditedVideo"
      component={VideoComposition}
      durationInFrames={FPS}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
      calculateMetadata={async ({ props }) => {
        const timeline = computeProjectTimeline(props.clips);
        const totalDuration = timeline.reduce((sum, t) => sum + t.duration, 0);
        return {
          durationInFrames: Math.max(1, Math.round(totalDuration * FPS)),
        };
      }}
    />
  );
};
