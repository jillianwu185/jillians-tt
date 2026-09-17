import { Composition } from "remotion";
import { VideoComposition, type VideoCompositionProps } from "./Video";
import { computeKeptSegments, totalOutputDuration } from "./timeline";

const FPS = 30;

export const defaultProps: VideoCompositionProps = {
  videoUrl: "",
  sourceDurationSeconds: 1,
  cuts: [],
  words: [],
  emphasisMoments: [],
  captionStyle: "static_block",
  accentColor: "#FCEF91",
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
        const keptSegments = computeKeptSegments(props.sourceDurationSeconds, props.cuts);
        const outputDuration = totalOutputDuration(keptSegments);
        return {
          durationInFrames: Math.max(1, Math.round(outputDuration * FPS)),
        };
      }}
    />
  );
};
