import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateTopicTag(transcriptText: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 20,
    messages: [
      {
        role: "user",
        content: `Give a short topic label (2-4 words, lowercase, no punctuation) for a TikTok video with this transcript. Reply with ONLY the label, nothing else.\n\n${transcriptText}`,
      },
    ],
  });
  const textBlock = response.content.find((c) => c.type === "text");
  const label = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
  return label.slice(0, 80);
}
