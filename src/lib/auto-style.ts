import Anthropic from "@anthropic-ai/sdk";
import { STYLE_KIT } from "@/lib/style-kit";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type AutoStyle = {
  headerTitle: string;
  mood: string;
  captionStyle:
    | "two_layer_headline"
    | "karaoke_reveal"
    | "static_block"
    | "word_by_word"
    | "progressive_reveal"
    | "typing";
  accentColor: string;
};

const AUTO_STYLE_TOOL = {
  name: "set_auto_style",
  description: "Set the automatic styling for a chill, minimalist talking-head video.",
  input_schema: {
    type: "object" as const,
    properties: {
      header_title: {
        type: "string",
        description:
          "A short on-screen title that sits above the speaker's head for the whole video. Usually 2-3 words, can be longer only if genuinely needed. Must capture the video's actual message simply and make a viewer curious enough to keep watching. No punctuation-heavy clickbait — this is a chill, minimalist style, not a shouty one.",
      },
      mood: { type: "string", description: "One or two words, e.g. 'chill and reflective'." },
      caption_style: {
        type: "string",
        enum: [
          "two_layer_headline",
          "karaoke_reveal",
          "static_block",
          "word_by_word",
          "progressive_reveal",
          "typing",
        ],
        description:
          "two_layer_headline: bold two-tier text, attention-grabbing. karaoke_reveal: full sentence, active word highlighted in accent color. static_block: plain sentence in a solid background chip, most minimalist. word_by_word: one word on screen at a time, punchy. progressive_reveal: sentence builds up as each word is spoken, calm pacing. typing: typewriter effect, chill/steady pacing. Pick whichever best fits a chill, minimalist vibe for this specific transcript.",
      },
      accent_color: {
        type: "string",
        description: "Hex color. Prefer a Style Kit color unless the transcript strongly suggests otherwise.",
      },
    },
    required: ["header_title", "mood", "caption_style", "accent_color"],
  },
};

export async function generateAutoStyle(transcriptText: string): Promise<AutoStyle> {
  const systemPrompt = `You are auto-styling a "Talking Video" for a single creator's TikTok account — no prompt from the creator, you decide everything automatically.

Vibe: chill, minimalist, simple. Never loud or gimmicky.
Style Kit colors: ${JSON.stringify(STYLE_KIT.colors)}

Full video transcript: ${transcriptText}

Call set_auto_style with your choices.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: "Style this video." }],
    tools: [AUTO_STYLE_TOOL],
    tool_choice: { type: "tool", name: "set_auto_style" },
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Model did not return a valid auto-style");
  }

  const input = toolUse.input as {
    header_title: string;
    mood: string;
    caption_style: AutoStyle["captionStyle"];
    accent_color: string;
  };

  return {
    headerTitle: input.header_title,
    mood: input.mood,
    captionStyle: input.caption_style,
    accentColor: input.accent_color,
  };
}
