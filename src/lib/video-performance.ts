import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type PerformanceVerdict = "standout" | "solid" | "underperformed";

export type PerformanceSummary = {
  verdict: PerformanceVerdict;
  summary: string;
};

export type VideoStats = {
  title: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  topicTag: string | null;
  captionStyleTag: string | null;
};

export type AccountAverages = {
  avgViews: number;
  avgLikes: number;
  avgComments: number;
  avgShares: number;
};

const PERFORMANCE_TOOL = {
  name: "set_performance_summary",
  description: "Give a short, plain-spoken read on how one TikTok video performed relative to this creator's own average.",
  input_schema: {
    type: "object" as const,
    properties: {
      verdict: {
        type: "string",
        enum: ["standout", "solid", "underperformed"],
        description:
          "standout: well above this creator's own average (views and/or engagement rate). solid: roughly average. underperformed: well below average.",
      },
      summary: {
        type: "string",
        description:
          "One or two casual sentences explaining why it likely did well or poorly — reference the actual numbers (e.g. engagement rate, views vs. their average) and the topic/caption style if they plausibly explain it. Speak directly to the creator ('This one...'), no corporate-dashboard tone, no hedging filler.",
      },
    },
    required: ["verdict", "summary"],
  },
};

export async function generatePerformanceSummary(
  video: VideoStats,
  averages: AccountAverages
): Promise<PerformanceSummary> {
  const systemPrompt = `You are a social media analyst helping a solo TikTok creator understand one of their own posted videos.

This creator's average performance across their account: ${Math.round(averages.avgViews)} views, ${Math.round(averages.avgLikes)} likes, ${Math.round(averages.avgComments)} comments, ${Math.round(averages.avgShares)} shares per video.

This specific video:
- Title/caption: ${video.title ?? "(no caption recorded)"}
- Views: ${video.views}, Likes: ${video.likes}, Comments: ${video.comments}, Shares: ${video.shares}
- Topic: ${video.topicTag ?? "unknown"}
- Caption style used: ${video.captionStyleTag ?? "unknown"}

Call set_performance_summary with your read on it.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: "Assess this video." }],
    tools: [PERFORMANCE_TOOL],
    tool_choice: { type: "tool", name: "set_performance_summary" },
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Model did not return a valid performance summary");
  }

  const input = toolUse.input as { verdict: PerformanceVerdict; summary: string };
  return { verdict: input.verdict, summary: input.summary };
}
