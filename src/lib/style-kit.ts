export const STYLE_KIT = {
  // Only words that are almost never anything but a verbal filler. Ambiguous
  // words ("like", "so", "you know") are handled contextually instead — see
  // src/lib/contextual-cuts.ts — since blindly matching them cuts legitimate
  // usage (e.g. "I like this").
  fillerWords: ["um", "umm", "uh", "uhh"],
  silenceGapSeconds: 0.6,
  emphasisAutoDetectMinGapSeconds: 9,
  emphasisVolumeThresholdDb: 6,
  emphasisPitchThresholdHz: 35,
  colors: {
    yellow: "#FCEF91",
    pink: "#FFB6C1",
    blue: "#ccedfc",
    cream: "#FFFFED",
    captionWhite: "#FFFFFF",
  },
};
