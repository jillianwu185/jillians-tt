import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { computeKeptSegments, totalOutputDuration } from "@/remotion/timeline";
import type { Cut } from "@/lib/cut-detection";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ARRANGE_STORY_TOOL = {
  name: "arrange_story",
  description:
    "Arrange these clips into one cohesive 30-60 second story: pick the order, pick which clip opens with the strongest hook, cut any redundant points, and end on a memorable note.",
  input_schema: {
    type: "object" as const,
    properties: {
      story_order: {
        type: "array",
        description:
          "Every clip you're KEEPING, in final playback order. Any clip index not listed here is dropped from the story entirely (e.g. because it's fully redundant with an earlier clip, or the story is over budget). Must contain at least one clip.",
        items: {
          type: "object",
          properties: {
            clip_index: { type: "number", description: "0-based index from the numbered clips below." },
            hook_start_word_index: {
              type: "number",
              description:
                "ONLY set this on the first entry in story_order. The word index (from that clip's transcript) the story should actually start playing from — trims away any slow/dead lead-in so the strongest hook line lands in roughly the first 3 seconds. Omit or set to 0 if the clip already opens strong.",
            },
            redundant_cuts: {
              type: "array",
              description:
                "Word-index spans (inclusive) within THIS clip to cut because they repeat a point already made by an earlier clip in story_order. Leave empty if this clip has nothing redundant.",
              items: {
                type: "object",
                properties: {
                  start_word_index: { type: "number" },
                  end_word_index: { type: "number" },
                },
                required: ["start_word_index", "end_word_index"],
              },
            },
          },
          required: ["clip_index"],
        },
      },
      reasoning: {
        type: "string",
        description: "A few sentences explaining the chosen order, what (if anything) got cut and why, and why the ending works.",
      },
    },
    required: ["story_order", "reasoning"],
  },
};

type Word = { word: string; start: number; end: number };

export async function POST(request: NextRequest) {
  const { project_id } = await request.json();
  if (!project_id) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: clipVideos, error: clipsError } = await supabase
    .from("videos")
    .select("id, duration_seconds")
    .eq("project_id", project_id)
    .order("sequence_order", { ascending: true });
  if (clipsError || !clipVideos || clipVideos.length === 0) {
    return NextResponse.json({ error: "No clips found for this project" }, { status: 404 });
  }

  const clips = await Promise.all(
    clipVideos.map(async (v) => {
      const { data: recipe } = await supabase
        .from("edit_recipes")
        .select("*")
        .eq("video_id", v.id)
        .order("version", { ascending: false })
        .limit(1)
        .single();
      const { data: transcript } = await supabase
        .from("transcripts")
        .select("words")
        .eq("video_id", v.id)
        .single();
      const words = (transcript?.words ?? []) as Word[];
      const acceptedCuts = ((recipe?.cuts ?? []) as Cut[]).filter((c) => c.accepted);
      const keptSegments = computeKeptSegments(v.duration_seconds ?? 0, acceptedCuts);
      const currentDuration = totalOutputDuration(keptSegments);
      return { videoId: v.id, recipe, words, currentDuration };
    })
  );

  if (clips.some((c) => !c.recipe)) {
    return NextResponse.json({ error: "Every clip needs an edit recipe before arranging the story" }, { status: 404 });
  }

  const clipsDescription = clips
    .map((c, i) => {
      const numbered = c.words.map((w, wi) => `${wi}:${w.word}`).join(" ");
      return `Clip ${i} (current post-cut duration: ${c.currentDuration.toFixed(1)}s):\n${numbered || "(silent clip, no dialogue)"}`;
    })
    .join("\n\n");

  const systemPrompt = `You are arranging raw talking-head clips of one creator discussing a single topic into one cohesive TikTok video, told across possibly-out-of-order clips.

Goals, in priority order:
1. Tell one authentic, cohesive story — the clips are NOT necessarily in the right order yet. Reorder them so the narrative flows logically.
2. No repeated points: if two clips (or parts of clips) make the same point, keep only the best version and cut the rest via redundant_cuts (or drop a whole clip if it's entirely redundant). The final story should be mutually exclusive and comprehensively exhaustive of what's worth saying on this topic — not repetitive, not missing an obvious beat.
3. Total runtime target: 30-60 seconds. It's fine to drop whole clips to hit this — better a tight 45s story than a padded 90s one.
4. Open strong: pick whichever clip has the most compelling opening line as clip 1, and use hook_start_word_index to trim any slow lead-in so that hook lands in roughly the first 3 seconds.
5. End on a memorable note — a punchline, a strong statement, or a sense of completion — not mid-thought.

Your reasoning must describe only what your structured fields actually do — don't say you trimmed or cut something unless hook_start_word_index or redundant_cuts actually reflects it.

Word indices below are 0-based and space-separated as INDEX:WORD, per clip.

${clipsDescription}

Call arrange_story with your decision.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: "Arrange this into one story." }],
    tools: [ARRANGE_STORY_TOOL],
    tool_choice: { type: "tool", name: "arrange_story" },
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json({ error: "Model did not return a valid arrangement" }, { status: 502 });
  }

  const input = toolUse.input as {
    story_order: {
      clip_index: number;
      hook_start_word_index?: number;
      redundant_cuts?: { start_word_index: number; end_word_index: number }[];
    }[];
    reasoning: string;
  };

  const validEntries = input.story_order.filter(
    (e) => Number.isInteger(e.clip_index) && e.clip_index >= 0 && e.clip_index < clips.length
  );
  if (validEntries.length === 0) {
    return NextResponse.json({ error: "Model did not keep any valid clips" }, { status: 502 });
  }

  const includedIndices = new Set(validEntries.map((e) => e.clip_index));

  for (let orderPosition = 0; orderPosition < validEntries.length; orderPosition++) {
    const entry = validEntries[orderPosition];
    const clip = clips[entry.clip_index];

    const { error: videoUpdateError } = await supabase
      .from("videos")
      .update({ sequence_order: orderPosition, included_in_story: true })
      .eq("id", clip.videoId);
    if (videoUpdateError) {
      return NextResponse.json({ error: videoUpdateError.message }, { status: 500 });
    }

    const newCuts: Cut[] = [];

    if (orderPosition === 0 && entry.hook_start_word_index && entry.hook_start_word_index > 0) {
      const hookWord = clip.words[entry.hook_start_word_index];
      if (hookWord && hookWord.start > 0) {
        newCuts.push({
          start: 0,
          end: hookWord.start,
          reason: "trimmed_for_hook",
          user_nudged: false,
          accepted: true,
        });
      }
    }

    for (const span of entry.redundant_cuts ?? []) {
      const startWord = clip.words[span.start_word_index];
      const endWord = clip.words[span.end_word_index];
      if (
        !startWord ||
        !endWord ||
        !Number.isInteger(span.start_word_index) ||
        !Number.isInteger(span.end_word_index) ||
        span.end_word_index < span.start_word_index
      ) {
        continue;
      }
      newCuts.push({
        start: startWord.start,
        end: endWord.end,
        reason: "cross_clip_repeat",
        user_nudged: false,
        accepted: true,
      });
    }

    if (newCuts.length > 0) {
      const recipe = clip.recipe!;
      const { error: insertError } = await supabase.from("edit_recipes").insert({
        video_id: clip.videoId,
        prompt_history: recipe.prompt_history ?? [],
        mood: recipe.mood,
        caption_style: recipe.caption_style,
        font_map: recipe.font_map ?? {},
        cuts: [...(recipe.cuts ?? []), ...newCuts],
        captions: recipe.captions ?? [],
        emphasis_moments: recipe.emphasis_moments ?? [],
        header_title: recipe.header_title ?? null,
        accent_color: recipe.accent_color,
        version: (recipe.version ?? 1) + 1,
      });
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }
  }

  for (let i = 0; i < clips.length; i++) {
    if (includedIndices.has(i)) continue;
    const { error: excludeError } = await supabase
      .from("videos")
      .update({ included_in_story: false })
      .eq("id", clips[i].videoId);
    if (excludeError) {
      return NextResponse.json({ error: excludeError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ reasoning: input.reasoning, includedCount: validEntries.length, totalCount: clips.length });
}
