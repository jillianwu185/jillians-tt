import Anthropic from "@anthropic-ai/sdk";
import type { Cut } from "@/lib/cut-detection";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Word = { word: string; start: number; end: number };

const CONTEXTUAL_CUTS_TOOL = {
  name: "flag_contextual_cuts",
  description:
    "Flag word spans in this transcript that should be cut because they're verbal filler, a stutter/false start, or an immediate self-repeated phrase — NOT because they're unimportant content.",
  input_schema: {
    type: "object" as const,
    properties: {
      cuts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            start_index: { type: "number", description: "Index (0-based) of the first word to cut." },
            end_index: { type: "number", description: "Index (0-based, inclusive) of the last word to cut." },
            reason: {
              type: "string",
              enum: ["filler_word", "stutter_or_repeat"],
              description:
                "filler_word: a verbal-filler use of an otherwise-meaningful word (e.g. 'like', 'so', 'you know', 'I mean') that adds nothing. stutter_or_repeat: a false start, stutter, or an immediately-repeated word/phrase where only the clean version should remain.",
            },
          },
          required: ["start_index", "end_index", "reason"],
        },
      },
    },
    required: ["cuts"],
  },
};

// Ambiguous filler-ish words are only cut when Claude judges them as filler in
// context (blind keyword matching wrongly cuts "I like this" — see
// src/lib/style-kit.ts). Also catches stutters/false starts and immediate
// self-repeats, which a naive word-list can't detect at all.
export async function detectContextualCuts(words: Word[]): Promise<Cut[]> {
  if (words.length === 0) return [];

  const numbered = words.map((w, i) => `${i}:${w.word}`).join(" ");
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system:
      "You are cleaning up a talking-head video transcript before it's cut together. Be conservative — only flag genuine filler/stutter/repeat spans, never flag anything that's part of the actual point being made. Word indices below are 0-based and space-separated as INDEX:WORD.",
    messages: [{ role: "user", content: numbered }],
    tools: [CONTEXTUAL_CUTS_TOOL],
    tool_choice: { type: "tool", name: "flag_contextual_cuts" },
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return [];

  const input = toolUse.input as {
    cuts?: { start_index: number; end_index: number; reason: "filler_word" | "stutter_or_repeat" }[];
  };

  const cuts: Cut[] = [];
  for (const c of input.cuts ?? []) {
    if (
      !Number.isInteger(c.start_index) ||
      !Number.isInteger(c.end_index) ||
      c.start_index < 0 ||
      c.end_index < c.start_index ||
      c.end_index >= words.length
    ) {
      continue;
    }
    cuts.push({
      start: words[c.start_index].start,
      end: words[c.end_index].end,
      reason: c.reason,
      user_nudged: false,
      accepted: true,
    });
  }
  return cuts;
}
