import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { STYLE_KIT } from "@/lib/style-kit";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildTool(fontKeys: string[]) {
  return {
    name: "update_project_recipe",
    description: "Apply the user's requested changes across all clips in this multi-clip project.",
    input_schema: {
      type: "object" as const,
      properties: {
        mood: { type: "string", description: "Overall mood/tone, applied to every clip, e.g. 'light and fun'." },
        caption_style: {
          type: "string",
          enum: ["two_layer_headline", "karaoke_reveal", "static_block"],
          description: "Applied to every clip in the project.",
        },
        caption_font: { type: "string", enum: fontKeys, description: "Font for captions, applied to every clip." },
        caption_size_multiplier: {
          type: "number",
          description: "Scales caption text size relative to the default (1.0), applied to every clip.",
        },
        accent_color: {
          type: "string",
          description: "Hex color, applied to every clip. Prefer a Style Kit color unless asked otherwise.",
        },
        new_emphasis_moments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              word: {
                type: "string",
                description: "The exact word to emphasize (must match a word in one of the clip transcripts).",
              },
              clip_index: {
                type: "number",
                description:
                  "0-based index of the clip this word belongs to, from the numbered transcripts below. Omit only if genuinely ambiguous — the word will then be applied to every clip where it's found.",
              },
              treatment: {
                type: "string",
                enum: ["punch_in_zoom", "keyword_callout", "both"],
              },
              zoomLevel: { type: "number", description: "Zoom scale, e.g. 1.18 subtle, 1.4 strong. Defaults to 1.18." },
              calloutText: { type: "string", description: "Defaults to the word itself if omitted." },
              calloutFont: { type: "string", enum: fontKeys },
              calloutFontSize: { type: "number", description: "Pixel size of the callout text. Defaults to 140." },
              calloutColor: { type: "string", description: "Hex color, defaults to Style Kit yellow." },
              calloutX: {
                type: "number",
                description: "Horizontal position, 0-100 (0=left edge, 50=center, 100=right edge). Defaults to 50.",
              },
              calloutY: {
                type: "number",
                description: "Vertical position, 0-100 (0=top edge, 50=center, 100=bottom edge). Defaults to 50.",
              },
            },
            required: ["word", "treatment"],
          },
        },
        reasoning: {
          type: "string",
          description: "One or two sentences explaining what changed, shown to the user.",
        },
      },
    },
  };
}

export async function POST(request: NextRequest) {
  const { project_id, prompt } = await request.json();
  if (!project_id || !prompt) {
    return NextResponse.json({ error: "project_id and prompt are required" }, { status: 400 });
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
    .select("id")
    .eq("project_id", project_id)
    .order("sequence_order", { ascending: true });
  if (clipsError || !clipVideos || clipVideos.length === 0) {
    return NextResponse.json({ error: "No clips found for this project" }, { status: 404 });
  }

  const { data: fontRows } = await supabase.from("fonts").select("key, display_name");
  const fontKeys = (fontRows ?? []).map((f) => f.key);
  const fontDescriptions = (fontRows ?? []).map((f) => `${f.key} (${f.display_name})`).join(", ");

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
      return { videoId: v.id, recipe, words: (transcript?.words ?? []) as { word: string; start: number; end: number }[] };
    })
  );

  if (clips.some((c) => !c.recipe)) {
    return NextResponse.json({ error: "Every clip needs an edit recipe before prompting" }, { status: 404 });
  }

  const clipsDescription = clips
    .map((c, i) => {
      const transcriptText = c.words.map((w) => `${w.word}(${w.start.toFixed(2)}s)`).join(" ");
      const fontMap = (c.recipe!.font_map ?? {}) as Record<string, string | number>;
      return `Clip ${i}: mood=${c.recipe!.mood ?? "none"}, caption_style=${c.recipe!.caption_style ?? "none"}, caption_font=${fontMap.caption ?? "airy"}, caption_size_multiplier=${fontMap.captionSizeMultiplier ?? 1}, accent_color=${c.recipe!.accent_color ?? "none"}, existing emphasis moments=${JSON.stringify(c.recipe!.emphasis_moments ?? [])}\nClip ${i} transcript: ${transcriptText || "(no dialogue — silent clip)"}`;
    })
    .join("\n\n");

  const systemPrompt = `You are editing a multi-clip TikTok video (clips play back-to-back in order) for a single creator using a fixed brand Style Kit.

Style Kit colors: ${JSON.stringify(STYLE_KIT.colors)}
Caption styles available: two_layer_headline, karaoke_reveal, static_block
Fonts available: ${fontDescriptions}

This project has ${clips.length} clips, numbered 0 to ${clips.length - 1} in playback order:

${clipsDescription}

The user will give you an instruction to update the whole project. Use the update_project_recipe tool. mood/caption_style/caption_font/accent_color apply to every clip uniformly. For new_emphasis_moments, "word" must exactly match a word from the relevant clip's transcript above (case-insensitive is fine, but use the transcript's spelling), and specify clip_index when you can tell which clip it belongs to.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
    tools: [buildTool(fontKeys)],
    tool_choice: { type: "tool", name: "update_project_recipe" },
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json({ error: "Model did not return a valid update" }, { status: 502 });
  }

  const patch = toolUse.input as {
    mood?: string;
    caption_style?: string;
    caption_font?: string;
    caption_size_multiplier?: number;
    accent_color?: string;
    new_emphasis_moments?: {
      word: string;
      clip_index?: number;
      treatment: "punch_in_zoom" | "keyword_callout" | "both";
      zoomLevel?: number;
      calloutText?: string;
      calloutFont?: string;
      calloutFontSize?: number;
      calloutColor?: string;
      calloutX?: number;
      calloutY?: number;
    }[];
    reasoning?: string;
  };

  const newMoments = patch.new_emphasis_moments ?? [];

  for (const clip of clips) {
    const recipe = clip.recipe!;
    const clipIndex = clips.indexOf(clip);
    const currentFontMap = (recipe.font_map ?? {}) as Record<string, string | number>;

    const momentsForClip = newMoments.filter((m) => {
      if (m.clip_index !== undefined) return m.clip_index === clipIndex;
      return clip.words.some(
        (w) => w.word.trim().toLowerCase().replace(/[.,!?]/g, "") === m.word.trim().toLowerCase()
      );
    });

    const builtMoments = momentsForClip.map((m) => {
      const match = clip.words.find(
        (w) => w.word.trim().toLowerCase().replace(/[.,!?]/g, "") === m.word.trim().toLowerCase()
      );
      return {
        word: m.word,
        start: match?.start ?? 0,
        end: match?.end ?? 0,
        treatment: m.treatment,
        source: "prompt" as const,
        approved: true,
        zoomLevel: m.zoomLevel ?? 1.18,
        calloutText: m.calloutText ?? m.word.toUpperCase(),
        calloutFont: m.calloutFont ?? "airy",
        calloutFontSize: m.calloutFontSize ?? 140,
        calloutColor: m.calloutColor ?? STYLE_KIT.colors.yellow,
        calloutX: m.calloutX ?? 50,
        calloutY: m.calloutY ?? 50,
      };
    });

    const updatedRecipe = {
      video_id: clip.videoId,
      prompt_history: [
        ...(recipe.prompt_history ?? []),
        { prompt, response: patch.reasoning ?? "", created_at: new Date().toISOString() },
      ],
      mood: patch.mood ?? recipe.mood,
      caption_style: patch.caption_style ?? recipe.caption_style,
      font_map: {
        ...currentFontMap,
        caption: patch.caption_font ?? currentFontMap.caption ?? "airy",
        captionSizeMultiplier: patch.caption_size_multiplier ?? currentFontMap.captionSizeMultiplier ?? 1,
      },
      cuts: recipe.cuts,
      captions: recipe.captions,
      emphasis_moments: [...(recipe.emphasis_moments ?? []), ...builtMoments],
      accent_color: patch.accent_color ?? recipe.accent_color,
      header_title: recipe.header_title ?? null,
      version: recipe.version + 1,
    };

    const { error: insertError } = await supabase.from("edit_recipes").insert(updatedRecipe);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ reasoning: patch.reasoning });
}
